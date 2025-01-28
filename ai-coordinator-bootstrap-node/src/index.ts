import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { tcp } from "@libp2p/tcp";
import { keys } from '@libp2p/crypto';
import { promises as fs } from 'fs';
import { mdns } from '@libp2p/mdns';
import { kadDHT, removePublicAddressesMapper  } from '@libp2p/kad-dht'
import { identify } from '@libp2p/identify'

let privateKeyRaw: Uint8Array;

const keyPairInfo = JSON.parse(await fs.readFile("src/config/keypair.json", "utf8"));

if (keyPairInfo?.keyPair && keyPairInfo?.keyPair !== '') {
  privateKeyRaw = Uint8Array.from(Object.values(keyPairInfo?.keyPair?.raw));
} else {
  const keyPair = await keys.generateKeyPair('Ed25519');
  privateKeyRaw = keyPair.raw;
  await fs.writeFile("src/config/keypair.json", JSON.stringify({ keyPair }), "utf8");
}

const node = await createLibp2p({
  start: false,
  privateKey: keys.privateKeyFromRaw(privateKeyRaw),
  addresses: {
    listen: ['/ip4/0.0.0.0/tcp/63785', '/ip4/0.0.0.0/tcp/63786/ws']
  },
  transports: [webSockets(), tcp()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  peerDiscovery: [
    mdns()
  ],
  services: {
    identify: identify(),
    dht: kadDHT({
      protocol: '/ipfs/lan/kad/1.0.0',
      clientMode: false
    })
  }
})

// start libp2p
await node.start()
console.log('libp2p bootstrap node has started')

node.addEventListener('peer:discovery', (evt) => {
  console.log('Discovered %s', evt.detail.id.toString()) // Log discovered peer
})

node.addEventListener('peer:connect', (evt) => {
  console.log('Connected to %s', evt.detail.toString()) // Log connected peer
})

console.log("Your node Peer id is: ", node.peerId.toString());