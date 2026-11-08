import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { adminMiddleware } from "../middleware/adminMiddleware";
import { resolveController } from "../controller/resolveController";

export const resolveRouter = Router();

resolveRouter.post("/resolve" , authMiddleware, adminMiddleware , resolveController.resolve);

