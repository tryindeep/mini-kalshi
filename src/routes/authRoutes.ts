import { Router } from "express";
import { authController } from "../controller/authController";
export const authRouter = Router();

authRouter.post("/register" , authController.register);
authRouter.post("/login" , authController.login);