
import type { Request, Response } from "express";
import mongoose from "mongoose";

import { resolveMarketSchema } from "../types/resolveValidator";
import { marketModel } from "../models/marketModel";
import { orderModel } from "../models/orderModel";
import { orderbookModel } from "../models/orderbookModel";
import { userModel } from "../models/userModel";
import { stockBalanceModel } from "../models/stockBalanceModel";
import { transactionLogModel } from "../models/transactionLogModel";

class ResolveError extends Error {
    constructor(
        public statusCode: number,
        message: string
    ) {
        super(message);
        this.name = "ResolveError";
    }
}

export const resolveController = {
    resolve: async (req: Request, res: Response) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    message: "Unauthorized"
                });
            }
            const parsed = resolveMarketSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({
                    message: "Incorrect Format",
                    errors: parsed.error
                });
            }
            const { marketId, resolution } = parsed.data;


            const result = await mongoose.connection.transaction(async (session) => {

                const market = await marketModel
                    .findById(marketId)
                    .session(session);

                if (!market) {
                    throw new ResolveError(404, "Market not found");
                }

                if (market.resolution !== "PENDING" || market.status === "RESOLVED") {
                    throw new ResolveError(409, "Market already resolved");
                }

                if (market.status !== "OPEN" && market.status !== "CLOSED") {
                    throw new ResolveError(400, "Market cannot be resolved");
                }

                // Close market before settlement
                const closedMarket = await marketModel.findOneAndUpdate(
                    {
                        _id: market._id,
                        resolution: "PENDING",
                        status: {
                            $in: ["OPEN", "CLOSED"]
                        }
                    },
                    {
                        $set: {
                            status: "CLOSED"
                        },
                        $inc: {
                            matchingVersion: 1
                        }
                    },
                    {
                        new: true,
                        session
                    }
                );

                if (!closedMarket) {
                    throw new ResolveError(409, "Market state changed. Please retry");
                }

                // Get market orderbooks
                const orderbooks = await orderbookModel.find({ marketId: market._id }).session(session);

                const outcomeByOrderbookId = new Map<string, "YES" | "NO">();

                for (const book of orderbooks) {
                    outcomeByOrderbookId.set(
                        book._id.toString(),
                        book.outcome as "YES" | "NO"
                    );
                }
                //Find all active orders
                const activeOrders = await orderModel.find({
                    marketId: market._id,
                    status: {
                        $in: ["OPEN", "PARTIALLY_FILLED"]
                    },
                    remainingQuantity: {
                        $gt: 0
                    }
                }).session(session);

                let cancelledOrders = 0;

                //Cancel orders and release reservations
                for (const order of activeOrders) {

                    const remaining = order.remainingQuantity;

                    if (!Number.isSafeInteger(remaining) ||remaining <= 0) {
                        throw new ResolveError(400, "Invalid remaining order quantity");
                    }

                    const outcome = outcomeByOrderbookId.get(
                        order.orderbookId.toString()
                    );

                    if (!outcome) {
                        throw new ResolveError(400,"Orderbook not found for an active order");
                    }

                    //BUY order: refund locked USD
                    if (order.side === "BUY") {

                        const refundAmount = order.price * remaining;

                        if (!Number.isSafeInteger(refundAmount)) {
                            throw new ResolveError(400,"Invalid refund amount");
                        }

                        const updatedUser =
                            await userModel.findOneAndUpdate(
                                {
                                    _id: order.userId,
                                    lockedUsdBalance: {
                                        $gte: refundAmount
                                    }
                                },
                                {
                                    $inc: {
                                        lockedUsdBalance: -refundAmount,
                                        availableUsdBalance: refundAmount
                                    }
                                },
                                {
                                    new: true,
                                    session
                                }
                            );

                        if (!updatedUser) {
                            throw new ResolveError(400,"Insufficient locked USD during cancellation");
                        }

                        await transactionLogModel.create(
                            [
                                {
                                    userId: order.userId,
                                    marketId: market._id,
                                    orderId: order._id,
                                    outcome,
                                    action: "cancel",
                                    balanceUSDChange: refundAmount,
                                    lockedUSDChange: -refundAmount
                                }
                            ],
                            { session }
                        );

                    }

                    // SELL order: unlock remaining contracts
                    else if (order.side === "SELL") {

                        const updatedStock =
                            await stockBalanceModel.findOneAndUpdate(
                                {
                                    userId: order.userId,
                                    marketId: market._id,
                                    outcome,
                                    quantity: {
                                        $gte: remaining
                                    },
                                    lockedQuantity: {
                                        $gte: remaining
                                    }
                                },
                                {
                                    $inc: {
                                        lockedQuantity: -remaining
                                    }
                                },
                                {
                                    new: true,
                                    session
                                }
                            );

                        if (!updatedStock) {
                            throw new ResolveError(400,"Insufficient locked stock during cancellation");
                        }

                        await transactionLogModel.create(
                            [
                                {
                                    userId: order.userId,
                                    marketId: market._id,
                                    orderId: order._id,
                                    outcome,
                                    action: "cancel",
                                    lockedQtyChange: -remaining
                                }
                            ],
                            { session }
                        );

                    } else {
                        throw new ResolveError(400,"Invalid order side");
                    }

                    // Update order status
                    const cancelledOrder = await orderModel.updateOne(
                        {
                            _id: order._id,
                            remainingQuantity: remaining,
                            status: {
                                $in: ["OPEN", "PARTIALLY_FILLED"]
                            }
                        },
                        {
                            $set: {
                                status: "CANCELLED"
                            }
                        },
                        { session }
                    );

                    if (cancelledOrder.matchedCount !== 1) {
                        throw new ResolveError(
                            409,
                            "Order changed during cancellation"
                        );
                    }

                    cancelledOrders++;
                }

                //Get all stock balances for this market
                const positions = await stockBalanceModel.find({marketId: market._id}).session(session);

                let totalPayout = 0;
                let settledPositions = 0;

                const winnerIds = new Set<string>();

                // Settle every YES/NO position
                for (const position of positions) {

                    const quantity = position.quantity ?? 0;
                    const lockedQuantity =
                        position.lockedQuantity ?? 0;

                    if (!Number.isSafeInteger(quantity) || quantity < 0) {
                        throw new ResolveError(400,"Invalid stock quantity");
                    }

                    // All active sell orders have been cancelled.
                    // No locked shares should remain.
                    if (lockedQuantity !== 0) {
                        throw new ResolveError(400,"Locked shares remain after order cancellation");
                    }

                    if (quantity === 0) {
                        continue;
                    }

                    //Calculate winner payout
                    const payout = position.outcome === resolution ? quantity * 100: 0;

                    if (!Number.isSafeInteger(payout)) {throw new ResolveError(400,"Invalid payout amount");
                    }

                    // Credit winning user
                    if (payout > 0) {

                        const updatedUser =await userModel.findByIdAndUpdate(
                                position.userId,
                                {
                                    $inc: {
                                        availableUsdBalance: payout
                                    }
                                },
                                {
                                    new: true,
                                    session
                                }
                            );

                        if (!updatedUser) {
                            throw new ResolveError(404,"Winner user not found");
                        }
                        totalPayout += payout;

                        winnerIds.add(position.userId.toString());
                    }

                    // Remove settled contracts
                    const updatedPosition =
                        await stockBalanceModel.updateOne(
                            {
                                _id: position._id,
                                quantity,
                                lockedQuantity: 0
                            },
                            {
                                $set: {
                                    quantity: 0,
                                    lockedQuantity: 0
                                }
                            },
                            { session }
                        );

                    if (updatedPosition.matchedCount !== 1) {
                        throw new ResolveError(409,"Position changed during settlement");
                    }

                    // Record settlement transaction
                    await transactionLogModel.create(
                        [
                            {
                                userId: position.userId,
                                marketId: market._id,
                                action: "payout",
                                outcome: position.outcome,
                                qtyChange: -quantity,
                                balanceUSDChange: payout
                            }
                        ],
                        { session }
                    );

                    settledPositions++;
                }

                //Finalize market resolution
                const resolvedMarket =
                    await marketModel.findOneAndUpdate(
                        {
                            _id: market._id,
                            status: "CLOSED",
                            resolution: "PENDING"
                        },
                        {
                            $set: {
                                resolution,
                                status: "RESOLVED",
                                resolvedAt: new Date()
                            }
                        },
                        {
                            new: true,
                            session
                        }
                    );

                if (!resolvedMarket) {
                    throw new ResolveError(409,"Market resolution failed");
                }
                
                // Return transaction result
                return {
                    marketId: resolvedMarket._id,
                    resolution: resolvedMarket.resolution,
                    status: resolvedMarket.status,
                    cancelledOrders,
                    settledPositions,
                    totalWinners: winnerIds.size,
                    totalPayout
                };
            }
            );

            return res.status(200).json({
                message: "Market resolved successfully",
                data: result
            });

        } catch (error: unknown) {

            if (error instanceof ResolveError) {
                return res.status(error.statusCode).json({
                    message: error.message
                });
            }

            console.error("Market resolution error:", error);

            return res.status(500).json({
                message: "Internal server error during market resolution"
            });
        }
    }
};
