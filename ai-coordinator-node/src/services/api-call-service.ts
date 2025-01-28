import axios from "axios";

export interface AIServiceCall {
    nodeId: string;
    signature: string;
    prompt: string;
}

export const postCall = async (url: string, data: AIServiceCall) => {
    try {
        await axios.post(url, data, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        return true;
    } catch (err) {
        console.error(err);
        return false;
    }
}