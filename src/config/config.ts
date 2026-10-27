import dotenv from "dotenv";

dotenv.config();

const JWT_USER_SECRET = process.env.JWT_USER_SECRET;
const JWT_ADMIN_SECRET = process.env.JWT_ADMIN_SECRET;

if (!JWT_USER_SECRET) {
    throw new Error("JWT_USER_SECRET is missing");
}

if (!JWT_ADMIN_SECRET) {
    throw new Error("JWT_ADMIN_SECRET is missing");
}

export {
    JWT_USER_SECRET,
    JWT_ADMIN_SECRET
};