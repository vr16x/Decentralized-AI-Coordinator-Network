import { v4 as uuidv4 } from 'uuid';
import { LevelDB } from './db.js';

const aiSessionKey = `ai::session::{{walletAddress}}::{{sessionId}}`;
const openAISessionsKey = `ai::session::open::{{walletAddress}}`;

type Conversation = { role: string, content: string, timestamp: number };
export type AIExecutionState = 'not-started' | 'in-progress' | 'completed';

export interface Service {
    providerId: string,
    serviceId: string,
    price: number,
    description: string,
    serviceDescription: string,
    executionOrder?: number;
    trustScore: number;
    executionState?: AIExecutionState,
};

interface ServiceUsageTrace {
    providerId: string,
    serviceId: string,
    price: number,
    usage: number
};

interface PeerSignature {
    nodeId: string;
    signature: string;
}

export type AISessionState = 'created' | 'confirmed' | 'processing' | 'completed' | 'settled' | 'rejected';

interface AISession {
    walletAddress: string;
    aiSessionId: string;
    userCharacterInformation: Record<string, any>;
    initialPrompt: string;
    conversations: Conversation[];
    services: Service[];
    state: AISessionState;
    serviceUsageTraces: ServiceUsageTrace[];
    peerSignatures: PeerSignature[];
    timestamp: number;
}

interface OpenAISession {
    walletAddress: string;
    aiSessions: { aiSessionId: string, state: AISessionState }[],
}

const substituteValueInKey = (targetKey: string, key: string, value: string) => {
    return targetKey.replace(`{{${key}}}`, value.toLowerCase().trim());
}

export const createAISession = async (walletAddress: string, prompt: string, characterInfo: Record<string, any>, serviceInfo: Service[]): Promise<string> => {
    const sessionId = uuidv4();
    
    console.log("AI Session Created: ", sessionId);

    let key = substituteValueInKey(aiSessionKey, 'walletAddress', walletAddress);
    key = substituteValueInKey(key, 'sessionId', sessionId);

    const record = await LevelDB.getDb().getRecord(key);
    let aiSession: AISession = record ? JSON.parse(record) : null;

    if (aiSession) {
        throw new Error(`Session already exists`);
    }

    aiSession = {
        walletAddress: walletAddress,
        aiSessionId: sessionId,
        initialPrompt: prompt,
        userCharacterInformation: characterInfo,
        conversations: [],
        services: serviceInfo || [],
        peerSignatures: [],
        serviceUsageTraces: [],
        state: 'created',
        timestamp: new Date().getTime(),
    };

    await LevelDB.getDb().setRecord(key, JSON.stringify(aiSession));
    await addOpenAISession(sessionId, walletAddress, aiSession.state);

    return sessionId;
}

export const updateAISessionState = async (aiSessionId: string, walletAddress: string, state: AISessionState) => {
    let key = substituteValueInKey(aiSessionKey, 'walletAddress', walletAddress);
    key = substituteValueInKey(key, 'sessionId', aiSessionId);

    const record = await LevelDB.getDb().getRecord(key);
    let aiSession: AISession = record ? JSON.parse(record) : null;

    if (!aiSession) {
        throw new Error(`Session not found`);
    }

    aiSession.state = state;

    await LevelDB.getDb().setRecord(key, JSON.stringify(aiSession));
}

export const trackServiceUsageTrace = async (aiSessionId: string, walletAddress: string, service: Service) => {
    let key = substituteValueInKey(aiSessionKey, 'walletAddress', walletAddress);
    key = substituteValueInKey(key, 'sessionId', aiSessionId);

    const record = await LevelDB.getDb().getRecord(key);
    let aiSession: AISession = record ? JSON.parse(record) : null;

    if (!aiSession) {
        throw new Error(`Session not found`);
    }

    const alreadyUsedServiceIndex = aiSession.serviceUsageTraces.findIndex((trace) => {
        return trace.providerId === service.providerId && trace.serviceId === service.serviceId;
    });

    if (alreadyUsedServiceIndex >= 0) {
        aiSession.serviceUsageTraces[alreadyUsedServiceIndex].usage += 1;
    } else {
        aiSession.serviceUsageTraces.push({
            serviceId: service.serviceId,
            providerId: service.providerId,
            price: service.price,
            usage: 1
        });
    }

    await LevelDB.getDb().setRecord(key, JSON.stringify(aiSession));
}

export const addPeerSignature = async (aiSessionId: string, walletAddress: string, nodeId: string, signature: string) => {
    let key = substituteValueInKey(aiSessionKey, 'walletAddress', walletAddress);
    key = substituteValueInKey(key, 'sessionId', aiSessionId);

    const record = await LevelDB.getDb().getRecord(key);
    let aiSession: AISession = record ? JSON.parse(record) : null;

    if (!aiSession) {
        throw new Error(`Session not found`);
    }

    aiSession.peerSignatures.push({
        nodeId,
        signature
    });

    await LevelDB.getDb().setRecord(key, JSON.stringify(aiSession));
}

export const updateConversation = async (aiSessionId: string, walletAddress: string, conversations: Conversation[]): Promise<void> => {    
    let key = substituteValueInKey(aiSessionKey, 'walletAddress', walletAddress);
    key = substituteValueInKey(key, 'sessionId', aiSessionId);

    const record = await LevelDB.getDb().getRecord(key);
    let aiSession: AISession = record ? JSON.parse(record) : null;

    if (!aiSession) {
        throw new Error(`Session not found`);
    }

    aiSession.conversations = [...aiSession.conversations, ...conversations];

    await LevelDB.getDb().setRecord(key, JSON.stringify(aiSession));
}

export const getAISession = async (aiSessionId: string, walletAddress: string): Promise<AISession> => {
    let key = substituteValueInKey(aiSessionKey, 'walletAddress', walletAddress);
    key = substituteValueInKey(key, 'sessionId', aiSessionId);

    const record = await LevelDB.getDb().getRecord(key);
    let aiSession: AISession = record ? JSON.parse(record) : null;

    if (!aiSession) {
        throw new Error(`Session not found`);
    }

    return aiSession;
}

export const updateAIService = async (aiSessionId: string, walletAddress: string, updatedServices: Service[]): Promise<void> => {
    let key = substituteValueInKey(aiSessionKey, 'walletAddress', walletAddress);
    key = substituteValueInKey(key, 'sessionId', aiSessionId);

    const record = await LevelDB.getDb().getRecord(key);
    let aiSession: AISession = record ? JSON.parse(record) : null;

    if (!aiSession) {
        throw new Error(`Session not found`);
    }

    aiSession.services = updatedServices;

    await LevelDB.getDb().setRecord(key, JSON.stringify(aiSession));
}

const addOpenAISession = async (aiSessionId: string, walletAddress: string, state: AISessionState) => {
    const key = substituteValueInKey(openAISessionsKey, 'walletAddress', walletAddress);

    const record = await LevelDB.getDb().getRecord(key);
    let openAISession: OpenAISession = record ? JSON.parse(record) : null;

    if (!openAISession) {
        const aiSession: OpenAISession = {
            walletAddress,
            aiSessions: [{
                aiSessionId,
                state
            }]
        };

        await LevelDB.getDb().setRecord(key, JSON.stringify(aiSession));
    } else {
        openAISession.aiSessions.push({
            aiSessionId,
            state
        });

        await LevelDB.getDb().setRecord(key, JSON.stringify(openAISession));
    }
}

export const getOpenAISession = async (walletAddress: string) => {
    const key = substituteValueInKey(openAISessionsKey, 'walletAddress', walletAddress);

    const record = await LevelDB.getDb().getRecord(key);
    let openAISession: OpenAISession = record ? JSON.parse(record) : null;

    if (!openAISession) {
        return null;
    }

    return openAISession;
}