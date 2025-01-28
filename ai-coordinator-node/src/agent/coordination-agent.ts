import 'dotenv/config';
import { ChatOpenAI } from "@langchain/openai";
import { processAIRequest } from "./tools/process-ai-request.js";
import { Service } from '../db/ai-session-store.js';

export class AICoordinationAgent {
    private static instance: AICoordinationAgent;
    public llm: ChatOpenAI;

    // Private constructor to prevent instantiation
    private constructor() {
        // Initialization code here (synchronous)
    }

    // Static method for asynchronous initialization
    public static async createInstance(): Promise<AICoordinationAgent> {
        if (!AICoordinationAgent.instance) {
            AICoordinationAgent.instance = new AICoordinationAgent();
            await AICoordinationAgent.instance.initialize();
        }
        return AICoordinationAgent.instance;
    }

    // Asynchronous initialization method
    private async initialize(): Promise<void> {
        this.llm = new ChatOpenAI({
            modelName: "gpt-4-turbo-preview",
            temperature: 0,
        });
    }

    async processPrompt(query: string): Promise<{ content: string, providers: Service[] }> {
        const { content, providers } = await processAIRequest(this.llm, query);

        return { content, providers };
    }

    async formatAIServiceProviders(aiServiceProviders) {
        const formattedProviders = aiServiceProviders?.providers?.map((provider) => {
            const services = provider.services.map((service) => {
                return `Service ID: ${service.serviceId}\nService Name: ${service.name}\nService Description: ${service.serviceDescription}\nService Price: ${service.price} USD\n\nInputs:\n${JSON.stringify(service.inputs)}\n\nOutput:\n${JSON.stringify(service.outputs)}\n`;
            });
        
            const providerInfo = `Provider Name : ${provider.providerName}\nProvider Description : ${provider.description}\nProvider Server URL: ${provider.url}\nProvider Tags : ${provider.tags}\nProvider ID : ${provider.providerId}\nProvider Wallet Address : ${provider.walletAddress}\n\nProvider Services:\n${services.join('\n\n')}\n`;
        
            return providerInfo;
        })

        return formattedProviders;
    }
}

// const query = `I want a list of social media post's data about USA election from twitter and post those data to farcaster`;
// const badQuery = `I want to mint an NFT`;

// if (formattedProviders.length > 0) {
//     console.log(formattedProviders.join('----------------------------------------------------------------\n\n'));
// } else {
//     console.log("No providers available to process your request");
// }