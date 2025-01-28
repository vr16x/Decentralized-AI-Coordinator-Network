import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { SERVICE_PROVIDERS } from "../../db/ai-providers-store.js";
import { Service } from "../../db/ai-session-store.js";

/**
 * Given a users query, extract the ai services from the coordinator node
 */
export class ProcessAIRequest extends StructuredTool {
    schema = z.object({
        content: z.string().nonempty().describe("AI's communication content for consumer"),
        providers: z.array(
            z.object({
                providerId: z.string().nonempty().describe("AI service provider's id"),  // Ensures providerId is a non-empty string
                serviceId: z.string().nonempty().describe("AI service provider's service id")    // Ensures serviceId is a non-empty string
            }).describe("Individual provider's information (Optional)")
        ).min(0).describe('List of provider infiormations')
    });

    name = "ProcessAIRequest";

    description =
        "Given a user query, extract the AI service provider's information such as Provider ID and Service ID which best represents the query.";

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        const { content, providers } = input;

        if (providers.length > 0) {
            const selectedProviders = [];

            providers.forEach(({ providerId, serviceId }) => {
                let selectedService = null;
                let selectedProvider = null;

                outerLoop: for (let providerIndex = 0; providerIndex < SERVICE_PROVIDERS.length; providerIndex++) {
                    const provider = SERVICE_PROVIDERS[providerIndex];

                    if (provider.providerId === providerId) {
                        for (let serviceIndex = 0; serviceIndex < provider.services.length; serviceIndex++) {
                            const service = provider.services[serviceIndex];

                            if (service.serviceId === serviceId) {
                                selectedProvider = provider;
                                selectedService = service;
                                break outerLoop;
                            }
                        }
                    }
                }
    
                if (selectedProvider && selectedService) {
                    const providerService: Service = {
                        providerId: selectedProvider.providerId,
                        serviceId: selectedService.serviceId,
                        price: selectedService.price,
                        description: selectedProvider.description,
                        serviceDescription: selectedService.serviceDescription,
                        trustScore: selectedProvider.trustScore || 0,
                    }

                    selectedProviders.push(providerService);
                }
            });

            return JSON.stringify({ content: content, providers: selectedProviders });
        }

        return JSON.stringify({ content: content, providers: [] });
    }
}

/**
 * @param {GraphState} state
 */
export async function processAIRequest(
    llm: ChatOpenAI, query: string
): Promise<{ content: string, providers: Service[] }> {
    const systemPrompt = `You are an expert software engineer and information specialist.

    Currently, you are helping a fellow software engineer or information specialist to provide information / answer for the given query.
    With your intelligence, you need to provide answers based on your knowledge or try to use some of the AI service providers to get the answers.

    Possible cases:
    - If it is just a conversational query ? provide the relavent information and communicate based on the query.
    - If it is service execution request ? select the best matching list of AI Service providers.
    - If it includes both conversational query and service execution request ? communicate, provide information and select the best matching list of AI Service providers.

    If there is no service, don't pretend that you have identifed a service provider
    If there is no knowledge about the query, don't come up with your own. Convey that you can't based on context of query

    Service execution request: 
    - You are presented with a list of AI service providers informatioms, and query.
    - The AI Service Providers information contains AI service provider description, name, service description and etc.
    - You need to match the query against the AI service provider information.
    - Think slowly, and carefully select the best list of AI service providers for the query.
    - Don't try to come up with a list of AI service providers incase there is no match with query.

    Examples: This is just for reference and don't use these content for responding
    Human: Hello Buddy, how are you ? I need to write a SQL query
    System: ObjectOf(
        content: Hey User, I am wonderful and I hope the same for you.
        providers: [ObjectOf(providerId: 1, serviceId: 2 )]
    )

    Human: Hello Buddy, how are you and What is your name ?
    System: ObjectOf(
        content: Hey User, I am wonderful and I hope the same for you. I am Cosmic
        providers: []
    )

    Human: I need to write a SQL query
    System: ObjectOf(
        content: Hey User, these are the services identified for you
        providers: [ObjectOf(providerId: 1, serviceId: 2 )]
    )

    Human: I need to write a RUST code
    System: ObjectOf(
        content: Hey User, I am very sorry that I don't find any services available for writing SQL queries
        providers: []
    )

    Here are all the AI service providers for your reference:
    {aiServiceProviders}`;

    const prompt = ChatPromptTemplate.fromMessages([
        ["system", systemPrompt],
        ["human", `Query: {query}`],
    ]);

    const tool = new ProcessAIRequest();
    const modelWithTools = llm.withStructuredOutput(tool);
    const chain = prompt.pipe(modelWithTools).pipe(tool);

    const aiServiceProviders = SERVICE_PROVIDERS.map((provider) => {
        const services = provider.services.map((service) => {
            return `Service ID: ${service.serviceId}\nService Name: ${service.name}\nService Description: ${service.serviceDescription}\nService Price: ${service.price} USD\n\nInputs:\n${JSON.stringify(service.inputs)}\n\nOutput:\n${JSON.stringify(service.outputs)}\n`;
        });

        const providerInfo = `Provider Name : ${provider.providerName}\nProvider Description : ${provider.description}\nProvider Tags : ${provider.tags}\nProvider ID : ${provider.providerId}\n\nProvider Services:\n${services.join('\n\n')}\n`;

        return providerInfo;
    }).join('----------------------------------------------------------------\n\n');

    const response = await chain.invoke({
        query,
        aiServiceProviders,
    });

    const { content, providers } = JSON.parse(response);

    return {
        content: content, 
        providers: providers as Service[],
    };
}