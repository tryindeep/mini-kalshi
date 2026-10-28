import type { Request, Response, NextFunction } from "express";
import { User } from "../models/userModel";

export const adminMiddleware = async (req: Request,res: Response,next: NextFunction) => {
    try {
        if(!req.user || typeof req.user.id !== "string"){
            return res.status(401).json({
                message: "Unauthorized"
            });
        }

        const user = await User.findById(req.user.id).select("role");

        if(!user){
            return res.status(401).json({
                message: "Unauthorized"
            });
        }
        // check the user have admin access or not 
        if (user.role !== "admin") {
            return res.status(403).json({
                message: "Admin access required"
            });
        }

        next();
    } catch (error) {
        return res.status(500).json({
            message: "Internal Server Error"
        });
    }
};