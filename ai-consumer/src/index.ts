import 'dotenv/config'
import { createLibp2p, } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { tcp } from '@libp2p/tcp'
import { keys } from '@libp2p/crypto';
import { promises as fs } from 'fs';
import { identify, identifyPush } from '@libp2p/identify'
import { peerIdFromString } from '@libp2p/peer-id';
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { getAICoordinatorCommunicationTopic, getConsumerCommunicationTopic, publishMessage, subscribeTopic, validateAIProvider } from './libp2p/gossipsub.js';
import { encryptMessageWithPublicKey, getKeyInfo } from './utils/crypto/icies-encryption.js';
import { multiaddr } from '@multiformats/multiaddr';
import { signMessage, verifyMessage } from './utils/crypto/ecdsa-signatures.js'
import { ethers } from "ethers";
import { toString as uint8ArrayToString } from 'uint8arrays/to-string';
import readline from 'readline';
import chalk from 'chalk';
import { bootstrap } from '@libp2p/bootstrap'
import { kadDHT } from '@libp2p/kad-dht'
import { mdns } from '@libp2p/mdns'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let privateKeyRaw: Uint8Array;

const keyPairInfo = JSON.parse(await fs.readFile("src/config/keypair.json", "utf8"));

if (keyPairInfo?.keyPair && keyPairInfo?.keyPair !== '') {
  privateKeyRaw = Uint8Array.from(Object.values(keyPairInfo?.keyPair?.raw));
} else {
  const keyPair = await keys.generateKeyPair('Ed25519');
  privateKeyRaw = keyPair.raw;
  await fs.writeFile("src/config/keypair.json", JSON.stringify({ keyPair }), "utf8");
}

const getBootstrappers = () => {
  // Known peers addresses
  const bootstrapMultiaddrs = [
      '/ip4/0.0.0.0/tcp/63786/ws/p2p/12D3KooWDuAiRtWEhc1aHnZZ8xXMxcRyhBKprRERYXfbQZG7Qvbw',
      '/ip4/0.0.0.0/tcp/63785/p2p/12D3KooWDuAiRtWEhc1aHnZZ8xXMxcRyhBKprRERYXfbQZG7Qvbw',
  ];

  return bootstrapMultiaddrs;
}

const node = await createLibp2p({
  start: false,
  addresses: {
    listen: ['/ip4/0.0.0.0/tcp/0', '/ip4/0.0.0.0/tcp/0/ws']
  },
  privateKey: keys.privateKeyFromRaw(privateKeyRaw),
  transports: [webSockets(), tcp()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  peerDiscovery: [
    bootstrap({
      list: getBootstrappers(), // provide array of multiaddrs
    }),
    mdns(),
  ],
  services: {
    pubsub: gossipsub(),
    identify: identify(),
    identifyPush: identifyPush(),
    dht: kadDHT({
        protocol: '/ipfs/lan/kad/1.0.0',
        clientMode: false
    }),
  }
})

await node.start()
console.log('libp2p has started')

node.addEventListener('peer:discovery', async (evt) => {
  // console.log('Discovered %s', evt.detail.id.toString()) // Log discovered peer
})

node.addEventListener('peer:connect', (evt) => {
  // console.log('Connected to %s', evt.detail.toString()) // Log connected peer
})

console.log("Your client node Peer id is: ", node.peerId.toString());

const coordinatorNodePeerId = peerIdFromString('12D3KooWFTeo9dho7XY2JmtdvPCptrJNDY85hDc5qFQUcinKgJzD');

const connectToAICoordinatorNode = async () => {
  const hasDiscovered = await node.peerStore.has(coordinatorNodePeerId);
  if (hasDiscovered) {
    const con = await node.dial(coordinatorNodePeerId);
    
    // small delay for connection establishment
    await new Promise((resolve) => {
      setTimeout(() => resolve(''), 500);
    });
  }
}

// const encryptedData = encryptMessageWithPublicKey(compressedPublicKey.replace("0x", ""), JSON.stringify(data));

// node.services.pubsub.topicValidators.set(aiCommunicationTopic, validateAIProvider);

// subscribeTopic(node, topic);

const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);

console.log("Node started listening to gossip messages");

const topic = getConsumerCommunicationTopic('json', wallet.address);
subscribeTopic(node, topic);

node.services.pubsub.addEventListener('message', async (evt) => {
    await handleAICoordinatorEvents(uint8ArrayToString(evt.detail.data));
});

const handleAICoordinatorEvents = async (info: string) => {
  const { data, type } = JSON.parse(info);

  if (type === 'ai-response') {
    // await handleAIResponse(data);
  } else if (type === 'ai-session-preview') {
    handleAISessionPreview(data);
  } else if (type === 'ai-session-interaction') {
    handleAIInteraction(data);
  } else if (type === 'ai-session-creation') {
    handleAISessionCreation(data);
  }
}

let sessionId = null;
let services = []; 

const handleAISessionCreation = (sessionResponse) => {
  let signedData = { ...sessionResponse };
  signedData.signature = '0x';

  const signerAddress = verifyMessage(sessionResponse.signature, JSON.stringify(signedData));

  const isValidRequest = signerAddress.toLowerCase() === sessionResponse.nodeId.toLowerCase();

  if (!isValidRequest) {
      console.log("Invalid request");
      return;
  }

  console.log(chalk.red.bold(`Coordinator: `), sessionResponse.data.content);

  sessionId = sessionResponse.data.additionalData.sessionId;
}

const handleAIInteraction = (sessionInteractionResponse) => {
  let signedData = { ...sessionInteractionResponse };
  signedData.signature = '0x';

  const signerAddress = verifyMessage(sessionInteractionResponse.signature, JSON.stringify(signedData));

  const isValidRequest = signerAddress.toLowerCase() === sessionInteractionResponse.nodeId.toLowerCase();

  if (!isValidRequest) {
      console.log("Invalid request");
      return;
  }

  console.log(chalk.red.bold(`Coordinator: `), sessionInteractionResponse.data.content);
}

const handleAISessionPreview = (info) => {
  let signedData = { ...info };
  signedData.signature = '0x';

  const signerAddress = verifyMessage(info.signature, JSON.stringify(signedData));

  const isValidRequest = signerAddress.toLowerCase() === info.nodeId.toLowerCase();

  if (!isValidRequest) {
      console.log("Invalid request");
      return;
  }

  if (info?.services?.length > 0) {
    sessionId = info.sessionId;
    services = info.services;
    console.log(chalk.red.bold(`Coordinator: `));

    console.log(`AI Session Created: ${info.sessionId}`);

    console.log(`Services discovered:`);

    services.forEach((service, index) => {
      console.log(`
Service #${index + 1}:

Provider Id: ${service.providerId}
Service Id: ${service.serviceId}
Price: ${service.price}
Description: ${service.description}
Service description: ${service.description}
Trust score: ${service.trustScore}
Execution Order: ${service.executionOrder}
      `);
    });
  } else {
    console.log(`No service found, please try again with a different prompt :)`);
  }
}

const handleAISessionConfirmation = async () => {
  const nonce = new Date().getTime();

  let data = {
    walletAddress: wallet.address,
    nonce,
    signature: '0x',
    sessionId,
    services,
    content: 'User confirmation on the services discovered'
  }

  const signature = await signMessage(wallet, JSON.stringify(data));

  data.signature = signature;

  const publishableData = {
    type: "ai-session-confirmation",
    data: data
  }
  const subscribedTopics = node.services.pubsub.getTopics();
  const topic = getConsumerCommunicationTopic('json', wallet.address);

  if (!subscribedTopics.includes(topic)) {
    subscribeTopic(node, topic);
  }

  await publishMessage(node, topic, JSON.stringify(publishableData));
}

const handleAIResponse = async (info) => {
  // let signedData = { ...info };
  // signedData.signature = '0x';

  // const signerAddress = verifyMessage(info.signature, JSON.stringify(signedData));

  // const isValidRequest = signerAddress.toLowerCase() === info.nodeId.toLowerCase();

  // if (!isValidRequest) {
  //     console.log("Invalid request");
  //     return;
  // }

  console.log(chalk.red.bold('Coordinator: '), info.content.trim());
}

console.log("User wallet address: " + wallet.address);

console.log("Enter your query: ");

const promptInput = () => {
  rl.question('', async (input: string) => {
      if (input.toLowerCase() === 'exit') {
          console.log('Exiting...');
          rl.close(); // Close the readline interface
      } else {
          const prompt = input;

          if (sessionId) {
            await interact(prompt);
          } else {
            await connectToAICoordinatorNode();
            await createAISession(prompt);
          }

          // if (prompt === 'confirm') {
          //   await handleAISessionConfirmation();

          //   console.log(chalk.blue.bold('User: ') + prompt);
          // } else {

          
          //   console.log(chalk.blue.bold('User: ') + prompt);
          // }

          promptInput(); // Prompt for input again
      }
  });
};

const characterInformation = {
  name: "User One",
  interests: ["Playing", "Surfing", "Sleeping"],
  bio: "I am a programmer",
};

const createAISession = async (query: string) => {
  const topic = getAICoordinatorCommunicationTopic('json', '0x247D47dB142FC1ed704163A7D3E4BD4F0Ca89876');
  subscribeTopic(node, topic);

  const nonce = new Date().getTime();

  let data = {
    nodeId: '0x247D47dB142FC1ed704163A7D3E4BD4F0Ca89876',
    walletAddress: wallet.address,
    signature: '0x',
    nonce,
    prompt: query,
    userCharacterInformation: characterInformation, 
    options: {
      plannerType: 'auto',
      trustRange: [1.1, 2.5],
      budgetRange: [0.05, 0.75],
      executionEnvironmentType: 'normal',
      preview: true,
    }
  };

  const signature = await signMessage(wallet, JSON.stringify(data));

  data.signature = signature;

  const publishableData = {
    type: 'ai-session-creation',
    data: data
  };

  await publishMessage(node, topic, JSON.stringify(publishableData));
}

const interact = async (query: string) => {
  const topic = getAICoordinatorCommunicationTopic('json', '0x247D47dB142FC1ed704163A7D3E4BD4F0Ca89876');
  subscribeTopic(node, topic);

  const nonce = new Date().getTime();

  let data = {
    nodeId: '0x247D47dB142FC1ed704163A7D3E4BD4F0Ca89876',
    walletAddress: wallet.address,
    signature: '0x',
    sessionId,
    nonce,
    prompt: query,
  };

  const signature = await signMessage(wallet, JSON.stringify(data));

  data.signature = signature;

  const publishableData = {
    type: 'ai-session-interaction',
    data: data
  };

  await publishMessage(node, topic, JSON.stringify(publishableData));
}

promptInput();
