import { Router } from "express";
import { authController } from "../controller/authController";
import { authMiddleware } from "../middleware/authMiddleware";
export const authRouter = Router();

authRouter.post("/register" , authController.register);
authRouter.post("/login" , authController.login);



// authenticated routes 
authRouter.use(authMiddleware);

authRouter.post("/onramp", authController.onramp);
authRouter.get("/profile", authController.profile);
authRouter.get("/transactions", authController.getTransaction);