import type { Request, Response } from "express"
import { createOrderSchema } from "../types/orderValidator";


export const orderController = {
    //CREATE ORDER
    createOrder : async (req : Request , res : Response) => {
        try {
            if (!req.user) {
                return res.status(401).json({ message: "Unauthorized" });
            }
            const parsed = createOrderSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({ message: "Incorrect Format" });
            }
            const {marketId , type, side, price, quantity} = parsed.data;

        } catch (error) {
            
        }
    }
}