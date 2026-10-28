import { Router } from "express";
import { resolveController } from "../controller/resolveController";

export const resolveRouter = Router();

resolveRouter.post("/" , resolveController.resolve);
