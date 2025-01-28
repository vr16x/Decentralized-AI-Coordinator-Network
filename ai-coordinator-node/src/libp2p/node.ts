import 'dotenv/config';
import { Libp2p, createLibp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { autoNAT } from '@libp2p/autonat';
import { dcutr } from '@libp2p/dcutr'
import { noise } from '@chainsafe/libp2p-noise';
import { tls } from '@libp2p/tls'
import { yamux } from '@chainsafe/libp2p-yamux';
import { bootstrap } from '@libp2p/bootstrap';
import { tcp } from '@libp2p/tcp';
import { keys } from '@libp2p/crypto';
import { promises as fs } from 'fs';
import { mdns } from '@libp2p/mdns';
import { kadDHT } from '@libp2p/kad-dht';
import { circuitRelayTransport, circuitRelayServer } from '@libp2p/circuit-relay-v2'
import { webRTC, webRTCDirect } from '@libp2p/webrtc'
import { uPnPNAT } from '@libp2p/upnp-nat'
import { identify, identifyPush } from '@libp2p/identify';
import { LevelDatastore } from 'datastore-level'
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { AICoordinationService } from '../services/ai-coordination-service.js';
import path from "path";
import { Libp2pGossipSub } from './gossipsub.js';

const getBootstrappers = () => {
    // Known peers addresses
    const bootstrapMultiaddrs = [
        '/ip4/0.0.0.0/tcp/63786/ws/p2p/12D3KooWDuAiRtWEhc1aHnZZ8xXMxcRyhBKprRERYXfbQZG7Qvbw',
        '/ip4/0.0.0.0/tcp/63785/p2p/12D3KooWDuAiRtWEhc1aHnZZ8xXMxcRyhBKprRERYXfbQZG7Qvbw',
    ];

    return bootstrapMultiaddrs;
}

const initializeKeypair = async (nodeName: string) => {
    let privateKeyRaw: Uint8Array;

    const keyPairInfo = JSON.parse(await fs.readFile(`./${nodeName}.json`, "utf8"));
    
    if (keyPairInfo?.keyPair && keyPairInfo?.keyPair !== '') {
        privateKeyRaw = Uint8Array.from(Object.values(keyPairInfo?.keyPair?.raw));
    } else {
        const keyPair = await keys.generateKeyPair('Ed25519');
        privateKeyRaw = keyPair.raw;
        await fs.writeFile(`./${nodeName}.json`, JSON.stringify({ ...keyPairInfo, keyPair }), "utf8");
    }

    return privateKeyRaw;
};

const setupP2pCoordination = async (node: Libp2p) => {
    node.addEventListener('peer:discovery', async (evt) => {
        console.log('Discovered %s', evt.detail.id.toString()) // Log discovered peer
        await node.dial(evt.detail.id);
    })
    
    node.addEventListener('peer:connect', (evt) => {
        console.log('Connected to %s', evt.detail.toString()) // Log connected peer
    })

    const aiCoordinationService = new AICoordinationService(node as Libp2pGossipSub);

    aiCoordinationService.setupAICoordination();
}

export const startNode = async (options) => {
    const privateKeyRaw = await initializeKeypair(options.coordinatorName);

    // const __dirname = path.resolve();
    // const datastorePath = path.join(__dirname, './src/db/leveldb');
    // const datastore = new LevelDatastore(datastorePath)
    // await datastore.open()

    const node = await createLibp2p({
        // libp2p nodes are started by default, pass false to override this
        start: false,
        // datastore,
        addresses: {
            listen: [
                `/ip4/0.0.0.0/tcp/0`,
                `/ip4/0.0.0.0/tcp/0/ws`,
                '/webrtc',
                '/p2p-circuit'
            ]
        },
        privateKey: keys.privateKeyFromRaw(privateKeyRaw),
        transports: [
            circuitRelayTransport(),
            tcp(),
            webSockets(),
            webRTC(),
            webRTCDirect(),
        ],
        connectionEncrypters: [
            noise(),
            tls()
        ],
        streamMuxers: [
            yamux()
        ],
        peerDiscovery: [
            bootstrap({
                list: getBootstrappers(), // provide array of multiaddrs
            }),
            mdns(),
        ],
        services: {
            autoNAT: autoNAT(),
            dcutr: dcutr(),
            pubsub: gossipsub(),
            identify: identify(),
            identifyPush: identifyPush(),
            dht: kadDHT({
                protocol: '/ipfs/lan/kad/1.0.0',
                clientMode: false
            }),
            relay: circuitRelayServer(),
            upnp: uPnPNAT()
        }
    });

        // start libp2p
    await node.start();
    console.log('libp2p has started');

    console.log("Your node Peer id is: ", node.peerId.toString());
    console.log("Your node multiaddr is: ", node.getMultiaddrs());

    await setupP2pCoordination(node);

    return node;
}
