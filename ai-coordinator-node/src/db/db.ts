// levelDBService.ts
import { Level } from 'level';
import path from "path";

export class LevelDB {
    private static instance: LevelDB;
    public db: Level;

    // Private constructor to prevent instantiation
    private constructor() {
        // Initialization code here (synchronous)
    }

    // Static method for asynchronous initialization
    public static async createInstance(dbName: string): Promise<LevelDB> {
        if (!LevelDB.instance) {
            LevelDB.instance = new LevelDB();
            await LevelDB.instance.initialize(dbName);
        }
        return LevelDB.instance;
    }

    // Asynchronous initialization method
    private async initialize(dbName: string): Promise<void> {
        const __dirname = path.resolve();
        const dbPath = path.join(__dirname, `./src/db/${dbName}`);
        this.db = new Level(dbPath, { valueEncoding: 'json' })
    }

    public static getDb() {
        if (!LevelDB.instance) {
            throw new Error("DB is not initialized yet");
        }

        return LevelDB.instance;
    }

    async setRecord(key: string, value: string): Promise<void> {
        await this.db.put(key, value);
    };
    
    async getRecord(key: string): Promise<string | null> {
        return await this.db.get(key);
    };
    
    async deleteRecord(key: string): Promise<void> {
        await this.db.del(key);
    };
}
