import { LevelDB } from "./db.js";
import { v4 as uuidv4 } from 'uuid';
import { peerIdFromString } from '@libp2p/peer-id';

const aiCoordinatorKey = `ai::coordinator::{{coordinatorId}}`;
const aiCoordinatorCountKey = `ai::coordinator::count`;

const substituteValueInKey = (targetKey: string, key: string, value: string) => {
    return targetKey.replace(`{{${key}}}`, value.toLowerCase().trim());
}

type CoordinatorState = "active" | "inactive" | "blocked";

interface AICoordinator {
    nodeId: string;
    peerId: string;
    coordinatorId: number;
    stake: number;
    state: CoordinatorState;
    trustScore: number;
}

const incrementAICoordinatorCount = async () => {
    const record = await LevelDB.getDb().getRecord(aiCoordinatorCountKey);
    let count: number = record ? Number(record) : 0;

    count += 1;

    await LevelDB.getDb().setRecord(aiCoordinatorCountKey, String(count));
}

export const getAICoordinatorCount = async () => {
    const record = await LevelDB.getDb().getRecord(aiCoordinatorCountKey);
    let count: number = record ? Number(record) : 0;

    return count;
}

export const createAICoordinator = async (nodeId: string, coordinatorId: number, peerId: string, stake: number, state: CoordinatorState) => {
    const key = substituteValueInKey(aiCoordinatorKey, 'coordinatorId', String(coordinatorId));

    const record = await LevelDB.getDb().getRecord(key);
    let aiCoordinator: AICoordinator = record ? JSON.parse(record) : null;

    if (aiCoordinator) {
        return;
    }

    aiCoordinator = {
        nodeId,
        coordinatorId,
        peerId,
        stake,
        state,
        trustScore: 0
    };

    await LevelDB.getDb().setRecord(key, JSON.stringify(aiCoordinator));
    await incrementAICoordinatorCount();
};

export const getAICoordinator = async (coordinatorId: number) => {
    const key = substituteValueInKey(aiCoordinatorKey, 'coordinatorId', String(coordinatorId));

    const record = await LevelDB.getDb().getRecord(key);
    let aiCoordinator: AICoordinator = record ? JSON.parse(record) : null;

    return aiCoordinator;
}

export const getAICoordinators = async (state: CoordinatorState, limit = 100) => {
    let aiCoordinatorCount = await getAICoordinatorCount();
    let count = 1;
    let limitCount = 1;

    const aiCoordinators: AICoordinator[] = [];

    while (count <= aiCoordinatorCount) {
        if (limitCount > limit) {
            break;
        }

        const key = substituteValueInKey(aiCoordinatorKey, 'coordinatorId', String(count));
        const record = await LevelDB.getDb().getRecord(key);
        const aiCoordinator: AICoordinator = record ? JSON.parse(record) : null;

        if (aiCoordinator && aiCoordinator.state === state) {
            aiCoordinators.push(aiCoordinator);
            limitCount++;
        }

        count++;
    }

    return aiCoordinators;
}