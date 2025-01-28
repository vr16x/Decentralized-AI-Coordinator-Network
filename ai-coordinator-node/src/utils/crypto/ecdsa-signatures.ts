import { Wallet, ethers } from "ethers";

export const signMessage = async (wallet: Wallet, message: string): Promise<string> => {
    return await wallet.signMessage(message);
}

export const verifyMessage = (signature: string, message: string): string => {
    return ethers.verifyMessage(message, signature);
}