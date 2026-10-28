import type { JwtPayload } from "jsonwebtoken";


export interface AuthPayload  extends JwtPayload{
    id: string;
    role: "user" | "admin";
}


declare global {
    namespace Express {
        interface Request {
            user ?: JwtPayload
        }
    }
}

export{};