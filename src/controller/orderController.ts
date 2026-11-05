import type { Request, Response } from "express"
import { createOrderSchema, splitSchema } from "../types/orderValidator";
import { marketModel } from "../models/marketModel";
import mongoose from "mongoose";
import { userModel } from "../models/userModel";
import { stockBalanceModel } from "../models/stockBalanceModel";
import { transactionLogModel } from "../models/transactionLogModel";


export const orderController = {


    // Split 
    split: async (req: Request, res: Response) => {
        try {
            if (!req.user) {
                return res.status(401).json({ message: "Unauthorized" });
            }
            const user = req.user;
            const parsed = splitSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({ message: "Incorrect Format" });
            }

            const { marketId, quantity } = parsed.data;

            const result = await mongoose.connection.transaction(async (session) => {

                const market = await marketModel.findById(marketId).session(session);

                if (!market) {
                    throw new Error("Market Not found");
                }

                if (market.expiry <= new Date()) {
                    throw new Error("Expiry date should be in the future");
                }

                if (market.status !== "OPEN") {
                    throw new Error("Market Should be open!");
                }
                const cost = quantity * 100;

                // updating in userModel
                const updatedUser = await userModel.findOneAndUpdate(
                    {
                        _id: user.id,
                        availableUsdBalance: { $gte: cost }
                    },
                    { $inc: { availableUsdBalance: -cost } },
                    {
                        new: true,
                        session
                    },
                );
                if (!updatedUser) {
                    throw new Error("Not sufficient balance");
                }

                // adding yes stock balance 
                const yesBalance = await stockBalanceModel.findOneAndUpdate(
                    {
                        userId: user.id,
                        marketId,
                        outcome: "YES",

                    },
                    {
                        $inc: { quantity: quantity }
                    },
                    {
                        upsert: true,
                        new: true,
                        session
                    }

                );

                // adding No stock balance 
                const noBalance = await stockBalanceModel.findOneAndUpdate(
                    {
                        userId: user.id,
                        marketId,
                        outcome: "NO",

                    },
                    {
                        $inc: { quantity: quantity }
                    },
                    {
                        upsert: true,
                        new: true,
                        session
                    }
                );

                // updating the market TotalIssue 
                const marketUpdated = await marketModel.findOneAndUpdate(
                    { _id: marketId },
                    {
                        $inc: { totalIssued: quantity }
                    },
                    {
                        new: true,
                        session
                    },
                );

                if (!marketUpdated) {
                    throw new Error("Market is no longer open or has expired");
                }

                // Creating the trasaction logs 
                await transactionLogModel.create([
                    {
                        userId: user.id,
                        marketId,
                        action: "split",
                        balanceUSDChange: -cost,
                    },
                    {
                        userId: user.id,
                        marketId,
                        action: "split",
                        outcome: "YES",
                        qtyChange: quantity
                    },
                    {
                        userId: user.id,
                        marketId,
                        action: "split",
                        outcome: "NO",
                        qtyChange: quantity
                    }
                ], { session, ordered: true });

                return {
                    availableUsdBalance: updatedUser.availableUsdBalance,
                    yesBalance: yesBalance.quantity,
                    noBalance: noBalance.quantity,
                    totalIssued: marketUpdated?.totalIssued
                };

            });

            return res.status(200).json({
                message: "Split successful",
                data: result
            });

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Split Failed";

            return res.status(400).json({
                message
            })
        }
    }

    // //CREATE ORDER
    // createOrder : async (req : Request , res : Response) => {
    //     try {
    //         if (!req.user) {
    //             return res.status(401).json({ message: "Unauthorized" });
    //         }
    //         const parsed = createOrderSchema.safeParse(req.body);
    //         if (!parsed.success) {
    //             return res.status(400).json({ message: "Incorrect Format" });
    //         }
    //         const {marketId , type, side, price, quantity} = parsed.data;

    //     } catch (error) {

    //     }
    // }
}