import { AISessionState, Service, createAISession, getAISession, trackServiceUsageTrace, updateAIService, updateAISessionState, updateConversation } from "../db/ai-session-store.js";
import { AI_COORDINATOR_COMMUNICATION_TOPIC_PREFIX, AI_PROVIDER_COMMUNICATION_TOPIC_PREFIX, Libp2pGossipSub, getConsumerCommunicationTopic, getAICoordinatorCommunicationTopic, getAIProviderCommunicationTopic, publishMessage, subscribeTopic } from "../libp2p/gossipsub.js";
import { toString as uint8ArrayToString } from 'uint8arrays/to-string';
import { signMessage, verifyMessage } from "../utils/crypto/ecdsa-signatures.js";
import { ethers } from "ethers";
import { AICoordinationAgent } from "../agent/coordination-agent.js";
import { AIServiceCall, postCall } from "./api-call-service.js";

type ExecutionEnvironmentType = 'tee' | 'normal';

type PlannerType = 'auto' | 'template';

type Template = {};

type UserType = 'Consumer' | 'Coordinator' | 'Provider';

interface AISessionOptions {
    plannerType: PlannerType,
    template?: Template[],
    trustRange?: [number, number],
    budgetRange?: [number, number],
    executionEnvironmentType?: ExecutionEnvironmentType[],
    preview?: boolean,
}

interface CreateAISession {
    nodeId: string;
    walletAddress: string;
    signature: string;
    nonce: number;
    prompt: string;
    userCharacterInformation?: Record<string, any>;
    options?: AISessionOptions
}

interface ConsumerInteraction {
    nodeId: string;
    walletAddress: string;
    signature: string;
    nonce: number;
    sessionId: string;
    prompt: string;
}

interface ConsumerResponseData {
    content: string,
    additionalData?: Record<string, any>;
}

interface ConsumerResponse {
    nodeId: string;
    signature: string;
    nonce: number;
    sessionId: string;
    data: ConsumerResponseData;
}

interface AISessionConfirmation {
    walletAddress: string;
    signature: string;
    nonce: number;
    sessionId: string;
    services: Service[];
    content: string;
}

interface AISessionRequest {
    walletAddress: string;
    signature: string;
    nonce: number;
    sessionId: string;
    content: string;
}

interface AISessionCompletion {
    sessionId: string;
    walletAddress: string
}

interface AISessionCommunication {}

export type CommunicationType = 'ai-session-creation' | 'ai-session-interaction' | 'ai-session-preview' | 'ai-session-confirmation' | 'ai-session-completion'
    | 'ai-request' | 'ai-response';

interface ConsumerToCoordinatorCommunication {
    type: CommunicationType;
    data: Record<any, any>;
}

interface CoordinatorToConsumerCommunication {
    type: CommunicationType;
    data: Record<any, any>;
}

interface CoordinatorToCoordinatorCommunication {
    nodeId: string;
    signature: string;
    nonce: number;
    data: Record<any, any>;
}

interface ProviderToCoordinatorCommunication {
    walletAddress: string;
    signature: string;
    nonce: number;
    data: {
        sessionId: string;
        walletAddress: string;
        providerId: string;
        serviceId: string;
        data: Record<any, any>;
    };
}

export class AICoordinationService {
    node: Libp2pGossipSub;
    coordinatorAgent: AICoordinationAgent;

    constructor(node: Libp2pGossipSub) {
        this.node = node;
        this.initializeAICoordination();
    }

    async initializeAICoordination() {
        this.coordinatorAgent = await AICoordinationAgent.createInstance();
    }

    setupAICoordination() {
        this.subscribeToAICoordinatorSessionTopic();
        this.subscribeToAIProviderResponseTopic();
        this.listenMessages();
    }

    subscribeToAICoordinatorSessionTopic() {
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);

        const topic = getAICoordinatorCommunicationTopic('json', wallet.address);
        subscribeTopic(this.node, topic);
    }
    
    subscribeToAIProviderResponseTopic() {
        const topic = getAIProviderCommunicationTopic('json');
        subscribeTopic(this.node, topic);
    }

    listenMessages() {
        console.log("Node started listening to gossip messages");
    
        this.node.services.pubsub.addEventListener('message', async (event) => {
            const data = uint8ArrayToString(event.detail.data);
            await this.handleEvent(event.detail.topic, data);
        });
    }

    async handleEvent(topic: string, data: string) {
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
        const consumerAISessionTopic = getAICoordinatorCommunicationTopic('json', wallet.address);

        if (topic === consumerAISessionTopic) {
            await this.handleAISession(data);
        } else if (topic.includes(`${AI_PROVIDER_COMMUNICATION_TOPIC_PREFIX}/response`)) {
            await this.handleAIProviderResponse(data)
        }
        else {
            console.log('Failed to handle event: Unknown topic');
        }
    }

    async handleAISession(data: string) {
        const sessionData: ConsumerToCoordinatorCommunication = JSON.parse(data);
    
        switch (sessionData.type) {
            case 'ai-session-creation':
                await this.handleAISessionCreation(sessionData.data as CreateAISession);
                break;
            case 'ai-session-interaction':
                await this.handleConsumerInteraction(sessionData.data as ConsumerInteraction);
                break;
            case 'ai-session-confirmation':
                await this.handleAISessionConfirmation(sessionData.data as AISessionConfirmation);
                break;
            case 'ai-session-completion':
                await this.handleAISessionCompletion(sessionData.data as AISessionCompletion);
                break;
            case 'ai-request':
                await this.handleAIConsumerRequestWithAdditionalData(sessionData.data as AISessionRequest);
                break;
            default:
                console.log('Failed to handle AI session: Invalid communication type');
                break;
        }
    }

    async handleAISessionCreation(data: CreateAISession) {
        const sessionData = data;
        let signedData = { ...sessionData };
        signedData.signature = '0x';
    
        const signerAddress = verifyMessage(sessionData.signature, JSON.stringify(signedData));
        const isValidSignature = signerAddress.toLowerCase() === sessionData.walletAddress.toLowerCase();
    
        if (!isValidSignature) {
            console.log("Failed to create AI session: Invalid signature");
            return;
        }
    
        // Initialize AI Sesssion
        const sessionId = await this.initiateAISession(sessionData.walletAddress, sessionData.prompt, sessionData.userCharacterInformation, []);

        await this.addAISessionConversation('Consumer', sessionId, sessionData.walletAddress, sessionData.prompt);

        const sessionResponse: ConsumerResponseData = {
            content: `AI session has been established successfully, and your session id is ${sessionId}`,
            additionalData: {
                sessionId
            }
        };

        await this.respondToConsumer('Coordinator', 'ai-session-creation', sessionId, sessionData.walletAddress, sessionResponse);

        await this.processPromptRequest(sessionId, sessionData.walletAddress, sessionData.prompt);
    }

    async handleConsumerInteraction(data: ConsumerInteraction) {
        const sessionData = data;
        let signedData = { ...sessionData };
        signedData.signature = '0x';
    
        const signerAddress = verifyMessage(sessionData.signature, JSON.stringify(signedData));
        const isValidSignature = signerAddress.toLowerCase() === sessionData.walletAddress.toLowerCase();
    
        if (!isValidSignature) {
            console.log("Failed to create AI session: Invalid signature");
            return;
        }

        await this.addAISessionConversation('Consumer', data.sessionId, data.walletAddress, data.prompt);

        this.processPromptRequest(data.sessionId, data.walletAddress, data.prompt);
    }

    async processPromptRequest(sessionId: string, consumerWalletAddress: string, prompt: string) {
        const session = await getAISession(sessionId, consumerWalletAddress);

        const { content, providers } = await this.handleAIProviderSearch(prompt);

        if (providers.length > 0) {
            let usableServices: Service[] = [];

            if (session.services.length > 0) {
                const lastServiceExecutionOrder = session.services[session.services.length - 1].executionOrder;

                usableServices = providers.map((service, index) => ({
                    ...service, executionOrder: lastServiceExecutionOrder + index + 1, executionState: 'not-started'
                } as Service));
            } else {
                usableServices = providers.map((service, index) => ({
                    ...service, executionOrder: index + 1, executionState: 'not-started'
                } as Service));
            }

            await this.updateAISessionServices(sessionId, consumerWalletAddress, usableServices);
            // Auto confirm the AI intent
            await this.confirmAISession(sessionId, consumerWalletAddress, 'confirmed');
            // AI service execution without preview
            await this.handleAIProviderExecution(sessionId, consumerWalletAddress, [...session.services, ...usableServices], {});
        } else {
            await this.respondToConsumer('Coordinator', 'ai-session-interaction', sessionId, consumerWalletAddress, { content });
        }

        // switch (sessionData.options.plannerType) {
        //     case 'auto':
        //         // Search for AI services
        //         const services = await this.handleAIProviderSearch(sessionData.prompt);
    
        //         const updatedServices = services.map((service, index) => ({
        //             ...service, executionOrder: index + 1, executionState: 'not-started'
        //         } as Service));
    
        //         if (sessionData.options.preview) {
        //             // Add discovered services to the session
        //             await this.updateAISessionServices(sessionId, sessionData.walletAddress, updatedServices);
        //             // Handle user preview for AI services
        //             await this.handleAISessionPreview(sessionId, sessionData.walletAddress, updatedServices);
        //         } else {
        //             // Add discovered services to the session
        //             await this.updateAISessionServices(sessionId, sessionData.walletAddress, updatedServices);
        //             // Auto confirm the AI intent
        //             await this.confirmAISession(sessionId, sessionData.walletAddress, 'confirmed');
        //             // AI service execution without preview
        //             await this.handleAIProviderExecution(sessionId, sessionData.walletAddress, updatedServices, {});
        //         }
        //         break;
        //     case 'template':
        //         // Discover the template services
        //         const templateServices = this.getAIServicesByTemplate();
    
        //         const updatedTemplateServices = templateServices.map((service, index) => ({
        //             ...service, executionOrder: index + 1, executionState: 'not-started'
        //         } as Service));
    
        //         // Add discovered services to the session
        //         await this.updateAISessionServices(sessionId, sessionData.walletAddress, updatedTemplateServices);
        //         // Auto confirm the AI intent
        //         await this.confirmAISession(sessionId, sessionData.walletAddress, 'confirmed');
        //         // AI execution based on the AI template
        //         await this.handleAIProviderExecution(sessionId, sessionData.walletAddress, services, {});
        //         break;
        //     default:
        //         console.log("Failed to process request: Unknown planner type");
        //         break;
        // }
    }

    async respondToConsumer(actorType: UserType, communicationType: CommunicationType, sessionId: string, consumerWalletAddress: string, response: ConsumerResponseData) {
        if (response.additionalData) {
            await this.addAISessionConversation(actorType, sessionId, consumerWalletAddress, JSON.stringify(response));
        } else {
            await this.addAISessionConversation(actorType, sessionId, consumerWalletAddress, response.content);
        }
    
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
        const nonce = new Date().getTime();

        let aiResponse: ConsumerResponse = {
            nodeId: wallet.address,
            signature: '0x',
            nonce,
            sessionId: sessionId,
            data: response
        };
    
        const signature = await signMessage(wallet, JSON.stringify(aiResponse));
        aiResponse.signature = signature;
    
        const publishableData: CoordinatorToConsumerCommunication = {
            type: communicationType,
            data: aiResponse
        };
    
        const topic = getConsumerCommunicationTopic('json', consumerWalletAddress);
        const subscribedTopics = this.node.services.pubsub.getTopics();
    
        if (!subscribedTopics.includes(topic)) {
            subscribeTopic(this.node, topic);
        }

        publishMessage(this.node, topic, JSON.stringify(publishableData));
    }

    async handleAIProviderResponse(data: string) {
        const providerData: ProviderToCoordinatorCommunication = JSON.parse(data);
    
        const signerAddress = verifyMessage(providerData.signature, JSON.stringify(providerData.data));
        const isValidSignature = signerAddress.toLowerCase() === providerData.walletAddress.toLowerCase();
    
        if (!isValidSignature) {
            console.log("Failed to create AI session: Invalid signature");
            return;
        }

        const session = await getAISession(providerData.data.sessionId, providerData.data.walletAddress);
    
        const providerExecutionContent = `
            Provider execution content:
            ${JSON.stringify(providerData.data.data)}
        `;
    
        await this.addAISessionConversation('Provider', session.aiSessionId, session.walletAddress, providerExecutionContent);
    
        const isAdditionalInformationRequiredFromConsumer = false;
    
        if (isAdditionalInformationRequiredFromConsumer) {
            const topic = getConsumerCommunicationTopic('json', session.walletAddress);
            const subscribedTopics = this.node.services.pubsub.getTopics();
        
            if (!subscribedTopics.includes(topic)) {
                subscribeTopic(this.node, topic);
            }
        
            const publishableData: CoordinatorToConsumerCommunication = {
                type: 'ai-request',
                data: {}
            };
        
            publishMessage(this.node, topic, JSON.stringify(publishableData));
        } else {
            let executionServiceIndex = -1;

            for (let serviceIndex = 0; serviceIndex < session.services.length; serviceIndex++) {
                const isExecutingService = session.services[serviceIndex].executionState === 'in-progress' 
                && providerData.data.providerId === session.services[serviceIndex].providerId
                && providerData.data.serviceId === session.services[serviceIndex].serviceId;

                if (isExecutingService) {
                    session.services[serviceIndex].executionState = 'completed';
                    executionServiceIndex = serviceIndex;
                    break;
                }
            }

    
            if (executionServiceIndex >= 0) {
                await this.updateAISessionServices(session.aiSessionId, session.walletAddress, session.services);
                await trackServiceUsageTrace(session.aiSessionId, session.walletAddress, session.services[executionServiceIndex]);
                await this.respondToConsumer('Coordinator', 'ai-session-interaction', session.aiSessionId, session.walletAddress, { content: JSON.stringify(providerData.data.data) });
                await this.handleAIProviderExecution(session.aiSessionId, session.walletAddress, session.services, {});
            } else {
                console.log("TODO");
            }
        }
    }

    async handleAISessionConfirmation(data: AISessionConfirmation) {
        // execute AI coordination
        const sessionData = data;
    
        let signedData = { ...sessionData };
        signedData.signature = '0x';
    
        const signerAddress = verifyMessage(sessionData.signature, JSON.stringify(signedData));
        const isValidSignature = signerAddress.toLowerCase() === sessionData.walletAddress.toLowerCase();
    
        if (!isValidSignature) {
            console.log("Failed to create AI session: Invalid signature");
            return;
        }
    
        // Update the conversation upon confirmation
        await this.addAISessionConversation('Coordinator', sessionData.sessionId, sessionData.walletAddress, `
            ${data.content}
        `);
    
        // Auto confirm the AI intent
        await this.confirmAISession(data.sessionId, sessionData.walletAddress, 'confirmed');

        // Update the conversation upon confirmation
        await this.addAISessionConversation('Coordinator', sessionData.sessionId, sessionData.walletAddress, `
            Thank you for confirming the service, the execution is started
        `);
    
        await this.handleAIProviderExecution(data.sessionId, sessionData.walletAddress, sessionData.services, {});
    }

    async handleAISessionCompletion(data: AISessionCompletion) {
        await updateAISessionState(data.sessionId, data.walletAddress, 'completed');
    }

    async handleAIConsumerRequestWithAdditionalData(data: AISessionRequest) {
        const session = await getAISession(data.sessionId, data.walletAddress);
    
        // Update the conversation upon receiving additional information
        await this.addAISessionConversation('Coordinator', session.aiSessionId, session.walletAddress, `
            Additional Information provided by user:
            ${data.content}
        `);
    
        await this.handleAIProviderExecution(data.sessionId, data.walletAddress, session.services, { content: data.content });
    }

    async handleAISessionPreview(sessionId: string, consumerWalletAddress: string, services: Service[]) {
        // const serviceDiscoveryContent = `
        //     AI Coordinator discovered the following services:
        //     ${
        //         JSON.stringify(services)
        //     }
        // `;
    
        // await this.addAISessionConversation('Coordinator', sessionId, consumerWalletAddress, serviceDiscoveryContent);
    
        // const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
        // const nonce = new Date().getTime();
    
        // let aiResponse: CreateAISessionResponse = {
        //     nodeId: wallet.address,
        //     signature: '0x',
        //     nonce,
        //     sessionId: sessionId,
        //     content: serviceDiscoveryContent
        // };
    
        // const signature = await signMessage(wallet, JSON.stringify(aiResponse));
        // aiResponse.signature = signature;
    
        // const publishableData: CoordinatorToConsumerCommunication = {
        //     type: 'ai-session-preview',
        //     data: aiResponse
        // };
    
        // const topic = getConsumerCommunicationTopic('json', consumerWalletAddress);
        // const subscribedTopics = this.node.services.pubsub.getTopics();
    
        // if (!subscribedTopics.includes(topic)) {
        //     subscribeTopic(this.node, topic);
        // }

        // publishMessage(this.node, topic, JSON.stringify(publishableData));
    }

    async handleAIProviderExecution(
        sessionId: string,
        consumerWalletAddress: string,
        services: Service[],
        additionalInformation: Record<any, any>
    ) {
        const session = await getAISession(sessionId, consumerWalletAddress);
    
        const memoryInformation = {
            userCharacterInformation: session.userCharacterInformation,
            initialPrompt: session.initialPrompt,
            conversations: session.conversations,
            additionalInformation,
        };
    
        let serviceToExecute = null;

        for (let serviceIndex = 0; serviceIndex < services.length; serviceIndex++) {
            if (services[serviceIndex].executionState === 'not-started') {
                services[serviceIndex].executionState = 'in-progress';
                serviceToExecute = services[serviceIndex];
                break;
            }
        }

        await this.updateAISessionServices(session.aiSessionId, session.walletAddress, services);

        if (!serviceToExecute) {
            await this.respondToConsumer('Coordinator', 'ai-session-interaction', session.aiSessionId, session.walletAddress, { content: 'Successfully executed all services for your last query' });
            // // All services are executed
            // await this.handleAISessionCompletion({ sessionId: session.aiSessionId, walletAddress: session.walletAddress });
            // // Consumer reponse
            // await this.handleAIConsumerResponse(sessionId, consumerWalletAddress, { content: "AI Service is executed" });
        } else {
            const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);

            const prompt = 'Hello World';
    
            const signature = await signMessage(wallet, JSON.stringify(prompt));
    
            const aiServiceCall: AIServiceCall = {
                nodeId: wallet.address,
                signature: signature,
                prompt
            }

            console.log(aiServiceCall);
    
            await postCall('http://localhost:4001', aiServiceCall);
            console.log(`Executing the service call for Provider id: ${serviceToExecute.providerId} and Service id: ${serviceToExecute.serviceId}`);
    
            // AI execution
            // note: Start the service from lowest execution order and not-started onces
    
            const executionData = {
                sessionId: session.aiSessionId,
                walletAddress: consumerWalletAddress,
                providerId: serviceToExecute.providerId,
                serviceId: serviceToExecute.serviceId,
                data: { hello: 'world'}
            };
    
            const executionSignature = await signMessage(wallet, JSON.stringify(executionData));
    
            const aiProviderResponse: ProviderToCoordinatorCommunication = {
                walletAddress: wallet.address,
                nonce: 1,
                signature: executionSignature,
                data: executionData
            };
        
            await this.handleAIProviderResponse(JSON.stringify(aiProviderResponse));
        }
    }

    async handleAIConsumerResponse(sessionId: string, consumerWalletAddress: string, data) {
        const executionContent = `
            The AI execution information:
            ${JSON.stringify(data)}
        `;
    
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
        const nonce = new Date().getTime();
    
        data.content = executionContent;
    
        // Update the conversation upon confirmation
        await this.addAISessionConversation('Provider', sessionId, consumerWalletAddress, executionContent);
    
        const signature = await signMessage(wallet, JSON.stringify(data));
        data.signature = signature;
    
        const topic = getConsumerCommunicationTopic('json', consumerWalletAddress);
        const subscribedTopics = this.node.services.pubsub.getTopics();
    
        if (!subscribedTopics.includes(topic)) {
            subscribeTopic(this.node, topic);
        }
    
        const publishableData: CoordinatorToConsumerCommunication = {
            type: 'ai-response',
            data: data
        };
    
        publishMessage(this.node, topic, JSON.stringify(publishableData));
        console.log("AI Session Summary: \n\n", await getAISession(sessionId, consumerWalletAddress));
    }
    
    async completeAISession(sessionId: string, consumerWalletAddress: string) {
        // Complete AI session to begin the settlement
        await updateAISessionState(sessionId, consumerWalletAddress, 'completed');
        // Notify other nodes for the completion and kick start settlement
    
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
        const nonce = new Date().getTime();
    
        const data: AISessionCompletion = {
            walletAddress: consumerWalletAddress,
            sessionId,
        };
    
        const publishableData: CoordinatorToCoordinatorCommunication = {
            nodeId: wallet.address,
            nonce: nonce,
            signature: '0x',
            data: data
        };
    
        const signature = await signMessage(wallet, JSON.stringify(data));
        publishableData.signature = signature;
    
        // TODO
        const topic = getAICoordinatorCommunicationTopic('json', wallet.address);
        const subscribedTopics = this.node.services.pubsub.getTopics();
    
        if (!subscribedTopics.includes(topic)) {
            subscribeTopic(this.node, topic);
        }
    
        publishMessage(this.node, topic, JSON.stringify(JSON.stringify(publishableData)));
    }

    async initiateAISession(consumerWalletAddress: string, initialPrompt: string, characterInfo: Record<any, any>, services: Service[]) {
        const sessionId = await createAISession(consumerWalletAddress, initialPrompt, characterInfo, services.length > 0 ? services : []);
    
        await this.addAISessionConversation('Consumer', sessionId, consumerWalletAddress, initialPrompt);
    
        return sessionId;
    }
    
    async addAISessionConversation(userType: UserType, sessionId: string, walletAddress: string, content: string) {
        await updateConversation(sessionId, walletAddress, [{
            role: userType,
            content,
            timestamp: new Date().getTime()
        }]);
    }
    
    async confirmAISession(sessionId: string, consumerWalletAddress: string, state: AISessionState) {
        await updateAISessionState(sessionId, consumerWalletAddress, state);
    }
    
    async updateAISessionServices(sessionId: string, consumerWalletAddress: string, services: Service[]) {
        await updateAIService(sessionId, consumerWalletAddress, services);
    }

    getAIServicesByTemplate() {
        const services: Service[] = [
            {
                providerId: '1',
                serviceId: '1',
                price: 0.12,
                description: 'Wikipedia AI agent',
                serviceDescription: 'Describe about information based on the topic',
                trustScore: 4,
            },
            {
                providerId: '1',
                serviceId: '2',
                price: 0.18,
                description: 'Wikipedia AI agent',
                serviceDescription: 'Publish blog post about information',
                trustScore: 4.2,
            }
        ];
    
        return services;
    }

    async handleAIProviderSearch(prompt: string) {
        return await this.coordinatorAgent.processPrompt(prompt)
    }
}