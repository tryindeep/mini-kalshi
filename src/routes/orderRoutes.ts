import { Router } from "express";
import { orderController } from "../controller/orderController";
import { authMiddleware } from "../middleware/authMiddleware";
export const orderRouter = Router();


orderRouter.use(authMiddleware);
orderRouter.post("/createOder" , orderController.createOrder)