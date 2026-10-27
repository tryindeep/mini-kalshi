import type { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken";
import { JWT_USER_SECRET } from "../config/config";

export const authMiddleware = async( req : Request , res : Response , next : NextFunction) => {
    const token = req.headers.authorization?.split(" ")[1];
    
    if(!token){
        return res.status(401).json({
            messege : "Unauthorized"
        });
    }
    try {
        const verifiedUser = jwt.verify(token ,JWT_USER_SECRET);
        if(typeof verifiedUser === "string" || !verifiedUser.id){
            return res.status(401).json({ message : "Unauthorized" });
        }
        req.user = verifiedUser;
        next();
    } catch (error) {
        return res.status(401).json({
            message : "Unauthorized"
        });
    }
}