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
import { getProviderToAICoordinatorCommunicationTopic, publishMessage, subscribeTopic, validateAIProvider } from './libp2p/gossipsub.js';
import { signMessage, verifyMessage } from './utils/crypto/ecdsa-signatures.js'
import { ethers } from "ethers";
import { bootstrap } from '@libp2p/bootstrap'
import { kadDHT } from '@libp2p/kad-dht'
import { mdns } from '@libp2p/mdns'
import express from "express";

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
  const peer = await node.peerStore.get(coordinatorNodePeerId);
  
  if (hasDiscovered && !peer) {
    await node.dial(coordinatorNodePeerId);
    
    // small delay for connection establishment
    await new Promise((resolve) => {
      setTimeout(() => resolve(''), 500);
    });
  }
}


const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);

console.log("Node started listening to gossip messages");

const rpcServer = express();

// Middleware to parse JSON bodies
rpcServer.use(express.json());

// Middleware to parse URL-encoded bodies
rpcServer.use(express.urlencoded({ extended: true }));

rpcServer.listen(4001, () => {
  console.log("RPC server listening on port ", 4001);
});

rpcServer.post('/', async (req, res) => {
  const sessionData = req.body;

  const signerAddress = verifyMessage(sessionData.signature, JSON.stringify(sessionData.prompt));
  const isValidSignature = signerAddress.toLowerCase() === sessionData.nodeId.toLowerCase();

  if (!isValidSignature) {
      console.log("Failed to create AI session: Invalid signature");
      return;
  }

  respondToAICoordinator(sessionData.prompt);

  res.status(200).json({ execution: 'started'});
});

const respondToAICoordinator = async (query: string) => {
  await connectToAICoordinatorNode();
  const topic = getProviderToAICoordinatorCommunicationTopic('json', '0x247D47dB142FC1ed704163A7D3E4BD4F0Ca89876');
  subscribeTopic(node, topic);

  const nonce = new Date().getTime();

  let data = {
    nodeId: '0x247D47dB142FC1ed704163A7D3E4BD4F0Ca89876',
    walletAddress: wallet.address,
    signature: '0x',
    nonce,
    content: 'AI Provider Executed'
  };

  const signature = await signMessage(wallet, JSON.stringify(data));

  data.signature = signature;

  const publishableData = {
    data: data
  };

  await publishMessage(node, topic, JSON.stringify(publishableData));
}
