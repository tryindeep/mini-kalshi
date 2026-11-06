import type { Request, Response } from "express"
import {  mergeSchema, splitSchema } from "../types/orderValidator";
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
    },

    //merger Order 
    merge: async (req: Request, res: Response) => {
        try {
            if (!req.user) {
                return res.status(401).json({ message: "Unauthorized" });
            }
            const user = req.user;
            const parsed = mergeSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({ message: "Incorrect Format" });
            }

            const { marketId, quantity: requestedQuantity } = parsed.data;

            const result = await mongoose.connection.transaction(async (session) => {

                // checking the market
                const market = await marketModel.findById(marketId).session(session);

                if (!market) {
                    throw new Error("Market Not found");
                }

                if (market.resolution !== "PENDING") {
                    throw new Error("Market already resolved");
                }

                // calculating the USD 
                const cost = requestedQuantity * 100;

                // deducting YES stock Balance 
                const yesBalance = await stockBalanceModel.findOneAndUpdate(

                    {
                        userId: user.id,
                        marketId,
                        outcome: "YES",
                        $expr: {
                            $gte: [
                                {
                                    $subtract: [
                                        "$quantity",
                                        { $ifNull: ["$lockedQuantity", 0] }
                                    ]
                                },
                                requestedQuantity
                            ]
                        }
                    },
                    {
                        $inc: { quantity: -requestedQuantity }
                    },
                    {
                        new: true,
                        session
                    }
                );
                if (!yesBalance) {
                    throw new Error("Insufficient unlocked YES balance");
                }

                // deducting No stock Balance
                const noBalance = await stockBalanceModel.findOneAndUpdate(
                    {
                        userId: user.id,
                        marketId,
                        outcome: "NO",
                        $expr: {
                            $gte: [
                                {
                                    $subtract: [
                                        "$quantity",
                                        { $ifNull: ["$lockedQuantity", 0] }
                                    ]
                                },
                                requestedQuantity
                            ]
                        }
                    },
                    {
                        $inc: { quantity: -requestedQuantity }
                    },
                    {
                        new: true,
                        session
                    }
                )
                if (!noBalance) {
                    throw new Error("Insufficient unlocked NO balance");
                }

                // updated the user balance 
                const updatedUser = await userModel.findByIdAndUpdate(
                    user.id,
                    {
                        $inc: { availableUsdBalance: cost }
                    },
                    {
                        new: true,
                        session
                    }
                )
                if (!updatedUser) {
                    throw new Error("User not found");
                }

                // updating market totalIssue :

                const marketUpdated = await marketModel.findOneAndUpdate(
                    {
                        _id : marketId,
                        resolution : "PENDING",
                        totalIssued :  {$gte : requestedQuantity}
                    },
                    {
                        $inc : { totalIssued : -requestedQuantity}
                    },
                    {
                        new: true,
                        session
                    }
                );
                if (!marketUpdated) {
                    throw new Error("Invalid market issued quantity or market resolved");
                }

                // creating tracsaction logs 
                await transactionLogModel.create([
                    {
                        userId: user.id,
                        marketId,
                        action : "merge",
                        balanceUSDChange : cost,
                    },
                    {
                        userId: user.id,
                        marketId,
                        action : "merge",
                        outcome : "YES",
                        qtyChange : -requestedQuantity,
                    },
                    {
                        userId: user.id,
                        marketId,
                        action : "merge",
                        outcome : "NO",
                        qtyChange : -requestedQuantity,
                    },
                ], { session, ordered: true });

                return {
                    availableUsdBalance: updatedUser.availableUsdBalance,
                    yesBalance: yesBalance.quantity,
                    noBalance: noBalance.quantity,
                    totalIssued: marketUpdated.totalIssued
                };

            });

            return res.status(200).json({
                message: "Merge successful",
                data: result
            });

        } catch (error : unknown) {
            const message = error instanceof Error ? error.message : "Merge Failed";
            return res.status(400).json({
                message
            })
        }
    }
}