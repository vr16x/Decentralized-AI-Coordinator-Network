import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";

const serviceProviders = [
    {
        walletAddress: 'hello',
        providerId: '1',
        url: 'http://localhost:3000',
        providerName: 'Twitter Agent',
        tags: ['Twitter', 'Information Extractor', 'Twitter post extractor', 'Twitter post retriever'],
        description: "This is a Twitter Agent which enables you to search for information about any topic of your interest in the internet",
        services: [{
            serviceId: '1',
            name: 'Twitter social post aggregator',
            price: 0.18,
            serviceDescription: 'This service can help users search for social posts from twitter regarding specific topic of user interest and aggregates information',
            inputs: [
                {
                    name: 'topic',
                    description: 'Social media search topic',
                    isOptional: true,
                }
            ],
            outputs: [
                {
                    name: "social media posts",
                    description: 'List of social media posts',
                }
            ]
        }]
    },
    {
        walletAddress: 'hello',
        providerId: '2',
        url: 'http://localhost:3001',
        providerName: 'Farcaster Agent',
        tags: ['Farcaster', 'Social Post', 'Social Poster'],
        description: "This is a Farcaster Agent which let you post a information on the farcaster social media platform",
        services: [{
            serviceId: '1',
            name: 'Farcaster Feed Poster',
            price: 0.10,
            serviceDescription: 'This service helps users to post a social feed in the farcaster social media platform based on the user provider information',
            inputs: [
                {
                    name: 'post feed content',
                    description: 'Content of the post feed to be posted to the farcaster social media platform',
                    isOptional: false,
                }
            ],
            outputs: [
                {
                    name: "post url",
                    description: 'Let the users know social post url from the farcaster social media platform',
                }
            ]
        }]
    },
    {
        walletAddress: 'hello',
        providerId: '3',
        url: 'http://localhost:3002',
        providerName: 'Wikipedia Agent',
        tags: ['web search', 'topic search', 'information collection'],
        description: "This is a Wikipedia Agent which let you search for information from the Wikipedia website",
        services: [{
            serviceId: '1',
            name: 'Search information',
            price: 0.02,
            serviceDescription: 'This service helps users to search information from the Wikipedia website',
            inputs: [
                {
                    name: 'Search topic',
                    description: 'Topic to be searched in the wikipedia website',
                    isOptional: false,
                }
            ],
            outputs: [
                {
                    name: "information",
                    description: "Wikipedia user's search information",
                }
            ]
        }]
    }
];

/**
 * Given a users query, extract the ai services from the coordinator node
 */
export class ExtractAIServiceProvider extends StructuredTool {
    schema = z.object({
        providers: z.array(
            z.object({
                providerId: z.string().nonempty().describe("AI service provider's id"),  // Ensures providerId is a non-empty string
                serviceId: z.string().nonempty().describe("AI service provider's service id")    // Ensures serviceId is a non-empty string
            }).describe("Individual provider's information (Optional)")
        ).min(0).describe('List of provider infiormations')
    });

    name = "ExtractAIServiceProvider";

    description =
        "Given a user query, extract the AI service provider's information such as Provider ID and Service ID which best represents the query.";

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        const { providers } = input;

        if (providers.length > 0) {
            const selectedProviders = [];

            providers.forEach(({ providerId, serviceId }) => {
                const provider = serviceProviders.find((provider) => {
                    const serviceExists = provider.services.find((service) => {
                        return service.serviceId === serviceId;
                    });
        
                    return !!serviceExists && provider.providerId === providerId;
                })
    
                selectedProviders.push(provider);
            });
    
            return JSON.stringify({ providers: selectedProviders });
        }

        return JSON.stringify({ providers: [] });
    }
}

/**
 * @param {GraphState} state
 */
export async function extractAIServiceProvider(
    llm: ChatOpenAI, query: string
): Promise<{ aiServiceProviders }> {
    const systemPrompt = `You are an expert software engineer.

    Currently, you are helping a fellow software engineer to select the best matching list of AI Service providers based on their query.
    You are only presented with a list of AI service providers informatioms, and query.
    The AI Service Providers information contains AI service provider description, name, service description and etc.
    You need to match the query against the AI service provider information.
    Think slowly, and carefully select the best list of AI service providers for the query.
    Don't try to come up with a list of AI service providers incase there is no match with query.

    Examples:
    Human: I need to write a SQL query
    System: These are the services available for you. Answer is ObjectOf(providers: [ObjectOf(providerId: 1, serviceId: 2 )])

    Human: I need to write a SQL query and execute it
    System: These are the services available for you. Answer is ObjectOf(providers: [ObjectOf(providerId: 1, serviceId: 2 ), ObjectOf(providerId: 1, serviceId: 2 )])

    Human: I need to write a Rust code
    System: Sorry there is no services available for you. Answer is ObjectOf(providers: [])

    Here are all the AI service providers for your reference:
    {aiServiceProviders}`;

    const prompt = ChatPromptTemplate.fromMessages([
        ["system", systemPrompt],
        ["human", `Query: {query}`],
    ]);

    const tool = new ExtractAIServiceProvider();
    const modelWithTools = llm.withStructuredOutput(tool);
    const chain = prompt.pipe(modelWithTools).pipe(tool);

    const aiServiceProviders = serviceProviders.map((provider) => {
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

    const aiServiceProviderList = response ? JSON.parse(response) : null;

    return {
        aiServiceProviders: aiServiceProviderList,
    };
}