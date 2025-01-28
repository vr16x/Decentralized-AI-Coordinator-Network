import 'dotenv/config';
import { ChatOpenAI } from "@langchain/openai";
import { extractAIServiceProvider } from "./tools/extract-ai-service.js";

const llm = new ChatOpenAI({
    modelName: "gpt-4-turbo-preview",
    temperature: 0,
});

const query = `I want a list of social media post's data about USA election from twitter and post those data to farcaster`;
const badQuery = `I want to mint an NFT`;

const response = await extractAIServiceProvider(llm, query);


const formattedProviders = response?.aiServiceProviders?.providers?.map((provider) => {
    const services = provider.services.map((service) => {
        return `Service ID: ${service.serviceId}\nService Name: ${service.name}\nService Description: ${service.serviceDescription}\nService Price: ${service.price} USD\n\nInputs:\n${JSON.stringify(service.inputs)}\n\nOutput:\n${JSON.stringify(service.outputs)}\n`;
    });

    const providerInfo = `Provider Name : ${provider.providerName}\nProvider Description : ${provider.description}\nProvider Server URL: ${provider.url}\nProvider Tags : ${provider.tags}\nProvider ID : ${provider.providerId}\nProvider Wallet Address : ${provider.walletAddress}\n\nProvider Services:\n${services.join('\n\n')}\n`;

    return providerInfo;
})

if (formattedProviders.length > 0) {
    console.log(formattedProviders.join('----------------------------------------------------------------\n\n'));
} else {
    console.log("No providers available to process your request");
}