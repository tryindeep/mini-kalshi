import { Router } from "express";
import { resolveController } from "../controller/resolveController";
import { authMiddleware } from "../middleware/authMiddleware";
import { adminMiddleware } from "../middleware/adminMiddleware";

export const resolveRouter = Router();

resolveRouter.post("/" , authMiddleware, adminMiddleware ,resolveController.resolve);
