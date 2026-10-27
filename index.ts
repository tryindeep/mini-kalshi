import dotenv from "dotenv";

dotenv.config();

import express from "express";
import { dbConnection } from "./src/config/db.ts";
const app  = express();
app.use(express.json());


const PORT = process.env.PORT || 3002;

async function startServer() {
    try {
        await dbConnection();
        app.listen(PORT , async() => {
            console.log(`🚀 Server running on port ${PORT}`);
        })
    } catch (error) {
        console.error("❌ Failed to start the server:", error);
    }
}

startServer();