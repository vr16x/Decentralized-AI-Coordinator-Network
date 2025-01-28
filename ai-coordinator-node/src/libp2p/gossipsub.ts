import { GossipsubEvents } from '@chainsafe/libp2p-gossipsub'
import { Libp2p, PubSub, TopicValidatorResult, TopicValidatorFn, PeerId, Message } from "@libp2p/interface";
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string';

export const AI_PROVIDER_COMMUNICATION_TOPIC_PREFIX = '/ai/provider';
export const AI_COORDINATOR_COMMUNICATION_TOPIC_PREFIX = '/ai/coordinator';
export const AI_CONSUMER_COMMUNICATION_TOPIC_PREFIX = '/ai/consumer';

export type Libp2pGossipSub = Libp2p<{
    pubsub: PubSub<GossipsubEvents>;
}>;

export type GossipSubMessageType = 'json';

export const getAIProviderCommunicationTopic = (
    messageType: GossipSubMessageType
) => {
    return `${AI_PROVIDER_COMMUNICATION_TOPIC_PREFIX}/response/${messageType}`;
}

export const getAICoordinatorCommunicationTopic = (
    messageType: GossipSubMessageType,
    publicKey: string,
) => {
    return `${AI_COORDINATOR_COMMUNICATION_TOPIC_PREFIX}/${publicKey}/${messageType}`.toLowerCase();;
}

export const getConsumerCommunicationTopic = (
    messageType: GossipSubMessageType,
    publicKey: string,
) => {
    return `${AI_CONSUMER_COMMUNICATION_TOPIC_PREFIX}/${publicKey}/${messageType}`.toLowerCase();;
}

export const subscribeTopic = (node: Libp2pGossipSub, topic: string) => {
    node.services.pubsub.subscribe(topic);
}

export const unsubscribeTopic = (node: Libp2pGossipSub, topic: string) => {
    node.services.pubsub.unsubscribe(topic);
};

export const publishMessage = async (node: Libp2pGossipSub, topic: string, message: string) => {
    try {
        const data = uint8ArrayFromString(message);
        await node.services.pubsub.publish(topic, data);
    } catch (error) {
    }
}

export const validateAIProvider: TopicValidatorFn = (peerId: PeerId, data: Message): TopicValidatorResult => {
    return TopicValidatorResult.Accept
}

export const validateAICoordinator: TopicValidatorFn = (peerId: PeerId, data: Message): TopicValidatorResult => {
    return TopicValidatorResult.Accept
}