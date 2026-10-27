import type { Request, Response } from "express"
import jwt from "jsonwebtoken";
import bcryprt from "bcrypt";
import { onrampSchema, signinSchema, signupSchema } from "../types/authValidator.ts"
import { User } from "../models/userModel";
import { JWT_USER_SECRET } from "../config/config.ts";
import { Wallet } from "../models/walletEventsModel.ts";

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
    },

    //ONRAMP
    onramp : async (req : Request , res : Response ) => {
        try {
            const parsed = onrampSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({ message: "Incorrect Format" });
            }
            const {amount } = parsed.data;
            if (!req.user) {
                return res.status(401).json({ message: "Unauthorized" });
            }
            // added fake money 
            const user  = await User.findByIdAndUpdate(
                req.user.id,
                {$inc : {balance : amount}},
                {new : true}
            )

            if(!user){
                return res.status(404).json({ error: "User not found" });
            }

            // Onramping in walletEvent
            await Wallet.create({
                userId : user.id,
                tx_type : "onramp",
                amount : amount 
            });
            
            res.status(200).json({
                balance : user.balance
            })

        } catch (error) {
            console.log(error);
            return res.status(500).json({
                message: "Internal Serever Error"
            });
        }
    },

    // Profile 
    profile :  async (req : Request , res : Response ) => {
        try {
            if(!req.user) {
                return res.status(401).json({ message: "Unauthorized" });
            }
            // we have to remove the password
            const user  = await User.findById(req.user.id).select("-password");
            if(!user){
                return res.status(404).json({ error: "User not found" });
            }

            res.status(200).json({
                user : user
            })
        } catch (error) {
            console.log(error);
            return res.status(500).json({
                message: "Internal Serever Error"
            });
        }
    },
    // tansactions 
    getTransaction : async (req : Request , res : Response ) => {
        try {
            if(!req.user) {
                return res.status(401).json({ message: "Unauthorized" });
            }
            const transactions = await Wallet.find({
                userId : req.user.id
            });
            res.status(200).json({
                Transactions : transactions
            })
        } catch (error) {
            console.log(error);
            return res.status(500).json({
                message: "Internal Serever Error"
            });
        }
    }

};