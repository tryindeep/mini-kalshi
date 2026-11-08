import dotenv from "dotenv";

dotenv.config();

import express from "express";
import { dbConnection } from "./src/config/db.ts";
import { authRouter } from "./src/routes/authRoutes.ts";
import { marketRouter } from "./src/routes/marketRoutes.ts";
import { orderRouter } from "./src/routes/orderRoutes.ts";
import { resolveRouter } from "./src/routes/resolveRoutes.ts";


const app = express();
app.use(express.json());


const PORT = process.env.PORT || 3001;

// Routes 
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/market", marketRouter);
app.use("/api/v1/order", orderRouter);
app.use("/api/v1/market", resolveRouter);


async function startServer() {
    await dbConnection();
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
    });
}

startServer().catch((error: unknown) => {
    console.error("❌ Failed to start the server:", error);
    process.exitCode = 1;
});