import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { marketController } from "../controller/marketController";
export const marketRouter = Router();


marketRouter.post("/" ,authMiddleware, marketController.create);
marketRouter.get("/" , marketController.getAllMarkets);
