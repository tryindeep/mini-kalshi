import { Router } from "express";
import { orderController } from "../controller/orderController";
import { authMiddleware } from "../middleware/authMiddleware";
export const orderRouter = Router();


orderRouter.use(authMiddleware);
orderRouter.post("/split" , orderController.split);
orderRouter.post("/merge" , orderController.merge);
// orderRouter.post("/createOder" , orderController.createOrder)