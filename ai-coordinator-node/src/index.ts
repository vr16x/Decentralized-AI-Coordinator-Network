import 'dotenv/config';
import express from "express";
import { startNode } from './libp2p/node.js';
import { Service, addPeerSignature, createAISession, getAISession, getOpenAISession, trackServiceUsageTrace, updateAIService, updateAISessionState, updateConversation } from './db/ai-session-store.js';
import { createAICoordinator, getAICoordinator, getAICoordinators } from './db/ai-coordinator-store.js';
import { AICoordinationAgent } from './agent/coordination-agent.js';
import { DynamicTool } from "@langchain/core/tools";
import { Document } from "langchain/document";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { OpenAIEmbeddings } from "@langchain/openai";
import { createRetrieverTool } from "langchain/tools/retriever";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { promises as fs } from 'fs';
import { LevelDB } from './db/db.js';

const args = process.argv.slice(2);

let coordinatorName = "coordinator-node";

args.forEach(arg => {
  if (arg.startsWith('--coordinator-name')) {
    coordinatorName = String(arg.replace('--coordinator-name=', '')).trim().toLowerCase();
  }
});

try {
  await fs.stat(`./${coordinatorName}.json`);
} catch (error) {
  if (error.code === 'ENOENT') {
    throw new Error('Node configuration file not found');
  } else {
    throw new Error('Something went wrong, check the configuration');
  }
}

// Libp2p node is started here
const node = await startNode({ coordinatorName });
await LevelDB.createInstance(coordinatorName);

const nodeConfig = JSON.parse(await fs.readFile(`./${coordinatorName}.json`, "utf8"));
    

// const {
//   compressedPublicKey,
//   walletAddress
// } = getKeyInfo(process.env.PRIVATE_KEY);

// const data = {
//   data: "hello world"
// };

// const encryptedData = encryptMessageWithPublicKey(compressedPublicKey.replace("0x", ""), JSON.stringify(data));

// node.services.pubsub.topicValidators.set(aiCommunicationTopic, validateAIProvider);

// setInterval(async () => {
//   console.log("Publishing message");
//   await publishMessage(node, aiCommunicationTopic, JSON.stringify(encryptedData));
// }, 10000)


const rpcServer = express();

rpcServer.listen(nodeConfig.rpcPort, () => {
  console.log("RPC server listening on port ", nodeConfig.rpcPort);
});

rpcServer.get('/getPeers', (req, res) => {
  return res.status(200).json({ peers: node.getPeers() });
});

rpcServer.get('/ai/session/:id', async (req, res) => {
  const session = await getAISession(req.params.id, req.query.walletAddress);
  res.status(200).json(session);
});

// const sessionId = await createAISession('0x247D47dB142FC1ed704163A7D3E4BD4F0Ca89876', 'Hello! He', {}, []);
// let AIsession = await getAISession(sessionId, '0x247D47dB142FC1ed704163A7D3E4BD4F0Ca89876');
// console.log(AIsession);

// await updateAIService(sessionId, '0x247D47dB142FC1ed704163A7D3E4BD4F0Ca89876', services);
// AIsession = await getAISession(sessionId, '0x247D47dB142FC1ed704163A7D3E4BD4F0Ca89876');
// console.log(AIsession);

// await updateConversation(sessionId, '0x247D47dB142FC1ed704163A7D3E4BD4F0Ca89876', [{
//   role: "Coordinator",
//   content: "Hello User!",
//   timestamp: new Date().getTime()
// }])
// AIsession = await getAISession(sessionId, '0x247D47dB142FC1ed704163A7D3E4BD4F0Ca89876');
// console.log(AIsession);

// await updateAISessionState(sessionId, '0x247D47dB142FC1ed704163A7D3E4BD4F0Ca89876', 'completed');
// AIsession = await getAISession(sessionId, '0x247D47dB142FC1ed704163A7D3E4BD4F0Ca89876');
// console.log(AIsession);

// await trackServiceUsageTrace(sessionId, '0x247D47dB142FC1ed704163A7D3E4BD4F0Ca89876', services[0]);
// await trackServiceUsageTrace(sessionId, '0x247D47dB142FC1ed704163A7D3E4BD4F0Ca89876', services[0]);
// await trackServiceUsageTrace(sessionId, '0x247D47dB142FC1ed704163A7D3E4BD4F0Ca89876', services[1]);
// AIsession = await getAISession(sessionId, '0x247D47dB142FC1ed704163A7D3E4BD4F0Ca89876');
// console.log(AIsession);


// await addPeerSignature(sessionId, '0x247D47dB142FC1ed704163A7D3E4BD4F0Ca89876', '0x247D47dB142FC1ed704163A7D3E4BD4F0Ca89876', 'hello');
// await addPeerSignature(sessionId, '0x247D47dB142FC1ed704163A7D3E4BD4F0Ca89876', '0x247D47dB142FC1ed704163A7D3E4BD4F0Ca89876', 'hello');
// AIsession = await getAISession(sessionId, '0x247D47dB142FC1ed704163A7D3E4BD4F0Ca89876');
// console.log(AIsession);

// const openAISession = await getOpenAISession('0x247D47dB142FC1ed704163A7D3E4BD4F0Ca89876');
// console.log(openAISession);

// await createAICoordinator('0x247D47dB142FC1ed704163A7D3E4BD4F0Ca89876', 1, 'peerid', 100, 'active');
// await createAICoordinator('0x247D47dB142FC1ed704163A7D3E4BD4F0Ca89876', 2, 'peerid', 100, 'active');
// await createAICoordinator('0x247D47dB142FC1ed704163A7D3E4BD4F0Ca89876', 3, 'peerid', 100, 'blocked');
// await createAICoordinator('0x247D47dB142FC1ed704163A7D3E4BD4F0Ca89876', 4, 'peerid', 100, 'active');

// console.log(await getAICoordinator(1));
// console.log(await getAICoordinators('active', 10));




// const agentExecutor = await AICoordinationAgent.createInstance();

// const jsonParserTool = new DynamicTool({
//   name: "jsonParserTool",
//   description: "This tool converts the given stringified json input into parsed output",
//   func: async (input: string) => {
//       return JSON.parse(input);
//   },
// });

// agentExecutor.registerTool(jsonParserTool);
// let agent = agentExecutor.getAgent();


// const createAIProviderServiceDocuments = async (walletAddress: string, service: Service) => {
//     const pageContent = `
//     AI Service Provider Information:

//     Service provider wallet address can be used for identification and fees settlement
//     Service provider wallet address: ${walletAddress}

//     Service provider id is a unique identifier for the service provider and can be used for identification of the service provider
//     Service provider id: ${service.providerId}

//     Service fee is the amount of fee charged for providing the service for consumers and this information can be used for
//     retreiving or discovering the services based on the fee range or budget given by the consumer
//     Service fee: ${service.price}

//     Service providers description describes overall services provided by the service provider and can be used to match and filter service
//     based on the consumer's need
//     Service provider description: ${service.description}

//     Service provider service description describes the various services offered by the service provider and can be used to match and filter service
//     based on the consumer's need
//     Service provider service description: ${service.serviceDescription}

//     Service provider service id is a sub identifier for the various services offered by the service provider and can be used for identification of the 
//     different service offered by the service provider
//     Service provider service id: ${service.serviceId}
//     `;

//     const metadata = {
//       providerId: service.providerId,
//       serviceId: service.serviceId,
//       price: service.price,
//       description: service.description,
//       serviceDescription: service.serviceDescription,
//     };

//     const documentId = `${service.providerId}::${service.serviceId}`;

//     return new Document({ pageContent, metadata, id: documentId });
// }

// const serviceInfos: Service[] = [
//   {
//       providerId: '1',
//       serviceId: '1',
//       price: 0.12,
//       description: 'Wikipedia AI agent',
//       serviceDescription: 'Describe about information based on the topic',
//       trustScore: 4,
//   },
//   {
//       providerId: '1',
//       serviceId: '2',
//       price: 0.18,
//       description: 'Wikipedia AI agent',
//       serviceDescription: 'Publish blog post about information',
//       trustScore: 4.2,
//   }
// ];

// let docs = [];
// docs[0] = await createAIProviderServiceDocuments('address', serviceInfos[0]);
// docs[1] = await createAIProviderServiceDocuments('address', serviceInfos[1]);

// const splitter = new RecursiveCharacterTextSplitter({
//   chunkSize: 100,
//   chunkOverlap: 20,
// });

// const splitDocs = await splitter.splitDocuments(docs);

// const vectorStore = await MemoryVectorStore.fromDocuments(
//   splitDocs,
//   new OpenAIEmbeddings()
// );

// const retriever = vectorStore.asRetriever({ k: 2 });

// const retrieverTool = createRetrieverTool(retriever, {
//   name: "service provider search",
//   description:
//     "This tool is used to search for services offered by the service provider to process the request from the consumer",
// });

// agentExecutor.registerTool(retrieverTool);
// agent = agentExecutor.getAgent();

// const input = 'I need to search for a gaming news from wikipedia and would like to get a available service provider for it. Give me the service id and provider id for the execution';

// console.log(await vectorStore.similaritySearch(input));

// let response = await agent.invoke({
//   input: input,
//   chatHistory: [],
//   userType: 'consumer'
// });

// console.log(response);



// const agent = await AICoordinationAgent.createInstance();

// console.log(await agent.processPrompt(`
//   If there is any service available, please use it or just communicate with me

//   Hello, how are you doing today ?, search me about US election from twitter
// `));
// console.log(await agent.processPrompt("Don't you have twitter ai service provider for this ?"));