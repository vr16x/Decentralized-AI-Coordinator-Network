import { ethers } from "ethers";
import { SigningKey } from "@ethersproject/signing-key";
import crypto from "crypto";
import EC from "elliptic";

const ec = new EC.ec('secp256k1');

export type EncryptedDataResponse = {
    iv: string,
    encryptedData: string,
    ephemeralPublicKey?: string
};

export type DecryptedDataResponse = {
    data: string
};

// Function to encrypt a message using symmetric encryption
export const encryptMessageWithSymmetricKey = (symentricKey: string, data: string): EncryptedDataResponse => {
    const iv = crypto.randomBytes(16); // Initialization vector

    // Encrypt the data with AES
    const cipher = crypto.createCipheriv("aes-256-cbc", symentricKey, iv);
    let encryptedInfo = cipher.update(data, "utf8", "hex");
    encryptedInfo += cipher.final("hex");

    return {
        encryptedData: encryptedInfo,
        iv: iv.toString("hex"),
    };
}

// Function to decrypt a message using symmetric encryption
export const decryptMessageWithSymmetricKey = (symentricKey: string, data: EncryptedDataResponse): DecryptedDataResponse =>  {
    const { encryptedData, iv } = data;

    const decipher = crypto.createDecipheriv("aes-256-cbc", symentricKey, Buffer.from(iv, "hex"));
    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return { data: decrypted };
}

// Function to encrypt a message using asymmetric encryption
export const encryptMessageWithPublicKey = (publicKey: string, data: string): EncryptedDataResponse => {
    const key = ec.keyFromPublic(publicKey, 'hex');

    // Generate a new ephemeral key pair
    const ephemeralKeyPair = ec.genKeyPair();
    const ephemeralPublicKey = ephemeralKeyPair.getPublic();

    // Derive shared secret using the ephemeral private key and the recipient's public key
    const sharedKey = ephemeralKeyPair.derive(key.getPublic()).toArray();

    // Use the shared key to encrypt
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(sharedKey).slice(0, 32), iv);
    let encrypted = cipher.update(data, "utf8", "hex");
    encrypted += cipher.final("hex");

    return {
        encryptedData: encrypted,
        iv: iv.toString("hex"),
        ephemeralPublicKey: ephemeralPublicKey.encode('hex'), // Send the ephemeral public key
    };
}

// Function to decrypt a message using asymmetric encryption
export const decryptMessageWithPrivateKey = (privateKey: string, data: EncryptedDataResponse): DecryptedDataResponse => {
    const key = ec.keyFromPrivate(privateKey, 'hex');
    const ephemeralPublicKey = ec.keyFromPublic(data.ephemeralPublicKey, 'hex');

    // Derive shared secret using the private key and the ephemeral public key
    const sharedKey = key.derive(ephemeralPublicKey.getPublic()).toArray();

    const { encryptedData, iv } = data;
    const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(sharedKey).slice(0, 32), Buffer.from(iv, "hex"));
    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return { data: decrypted };
}

export const getKeyInfo = (privateKey: string) => {
    const wallet = new ethers.Wallet(privateKey);
    const signingKey = new SigningKey(privateKey);

    return {
        compressedPublicKey: String(signingKey.compressedPublicKey).toLowerCase(),
        walletAddress: String(wallet.address).toLowerCase(),
        privateKey: String(privateKey).toLowerCase(),
    };
}

export const generateSymmentricKey = () => {
    return crypto.randomBytes(32);
}