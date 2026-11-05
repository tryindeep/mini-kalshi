import type { Request, Response } from "express"
import { createMarketSchema } from "../types/marketValidator";
import mongoose from "mongoose";
import { marketModel } from "../models/marketModel";
import { orderbookModel } from "../models/orderbookModel";


export const marketController = {

    create: async (req: Request, res: Response) => {
        try {
            if (!req.user) {
                return res.status(401).json({ message: "Unauthorized" });
            }
            const parsed = createMarketSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({ message: "Incorrect Format" });
            }
            const { title, expiry } = parsed.data;

            if (expiry <= new Date()) {
                return res.status(400).json({ message: "expiry data can only be in the future" });

            }
            const creatorId = req.user.id;
            const newMarketId = await mongoose.connection.transaction(async (session) => {
                const [market] = await marketModel.create(
                    [{
                        title,
                        creatorId,
                        totalIssued: 0,
                        expiry,
                    }],
                    { session },
                );

                if (!market) {
                    throw new Error("Market creation returned no document");
                }

                await orderbookModel.create(
                    [
                        { marketId: market._id, outcome: "YES" },
                        { marketId: market._id, outcome: "NO" },
                    ],
                    { session, ordered: true },
                );

                return market._id;
            });

            return res.status(201).json({
                message: "market created successfully",
                marketId: newMarketId,
            });


        } catch (error) {
            console.log("error creating market: ", error);
            return res.status(500).json({ message: "failed to create market" });
        }
    },

    // GET ALL makets 
    getAllMarkets: async (req: Request, res: Response) => {
        try {
            const markets = await marketModel
                .find()
                .sort({ createdAt: -1 })
                .lean();

            return res.status(200).json({
                message: "Markets fetched successfully",
                markets,
            });
        } catch (error) {
            console.error("Get all markets error:", error);

            return res.status(500).json({
                message: "Internal server error",
            });
        }
    },


}
