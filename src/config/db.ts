import mongoose from "mongoose";
import dotenv from 'dotenv';

dotenv.config();


export async function dbConnection() {
    try {
        const url = process.env.DATABASE_URL;

        if(!url){
            throw new Error("DATABASE_URL is not defined in environment variables.");
        }
        
        await mongoose.connect(url);
        console.log("✅ SUCCESS: Database connected smoothly!");

    } catch (error : any) {
         console.error("❌ ERROR: Database connection failed!", error.message);
    }
}