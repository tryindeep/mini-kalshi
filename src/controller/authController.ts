import type { Request, Response } from "express"
import jwt from "jsonwebtoken";
import bcryprt from "bcrypt";
import { signinSchema, signupSchema } from "../types/authValidator.ts"
import { User } from "../models/userModel";
import { JWT_USER_SECRET } from "../config/config.ts";

export const authController = {

    // REGISTER
    register: async (req: Request, res: Response) => {
        try {
            //validate Input 
            const parsed = signupSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({ message: "Incorrect Format" });
            }
            const { username, password } = parsed.data;
            // check if existing 
            const existingUser = await User.findOne({ username: username });
            if (existingUser) {
                return res.status(409).json({ message: "User Already Exists" });
            }
            // hashing password 
            const hashedpassword = await bcryprt.hash(password, 10);
            // createing user 
            await User.create({
                username: username,
                password: hashedpassword
            })
            return res.status(201).json({ message: "User Registerd Sucessfully" });
        } catch (error) {
            console.log(error);
            return res.status(500).json({
                message: "Internal Serever Error"
            });
        }
    },

    // LOGIN
    login : async (req: Request, res: Response) => {
        try {
            //validate Input 
            const parsed = signinSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({ message: "Incorrect Format" });
            }
            const {username , password} = parsed.data;

            const foundUser = await User.findOne({username : username});
            if(!foundUser){
                return res.status(403).json({
                    message : "User Doesn't Exits, Please SignUp !!"
                })
            }

            const passwordMatched = await bcryprt.compare(password , foundUser.password);
            if(passwordMatched){
                const token = jwt.sign({
                    id : foundUser.id},
                    JWT_USER_SECRET,
                    {expiresIn : '2h'} 
                );
                return res.status(200).json({
                        token : token
                }) 
            }else{
                return res.status(401).json({
                    message : "Incorrect Credentials"
                })
            }
        } catch (error) {
            console.log(error);
            return res.status(500).json({
                message: "Internal Serever Error"
            });
        }
    }
};