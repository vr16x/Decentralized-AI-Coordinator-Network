export const SERVICE_PROVIDERS  = [
    {
        walletAddress: 'hello',
        providerId: '1',
        url: 'http://localhost:4001',
        providerName: 'Twitter Agent',
        tags: ['Twitter', 'Information Extractor', 'Twitter post extractor', 'Twitter post retriever'],
        description: "This is a Twitter Agent which enables you to search for information about any topic of your interest in the twitter",
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
        url: 'http://localhost:4001',
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
        url: 'http://localhost:4001',
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