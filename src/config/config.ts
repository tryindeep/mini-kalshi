import dotenv from "dotenv";

dotenv.config();


const userSecret = process.env.JWT_USER_SECRET;
if (!userSecret) throw new Error("JWT_USER_SECRET is missing");
export const JWT_USER_SECRET: string = userSecret;