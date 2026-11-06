import type { Request, Response } from "express"
import { mergeSchema, placeOrderSchema, splitSchema } from "../types/orderValidator";
import { marketModel } from "../models/marketModel";
import mongoose from "mongoose";
import { userModel } from "../models/userModel";
import { stockBalanceModel } from "../models/stockBalanceModel";
import { transactionLogModel } from "../models/transactionLogModel";
import { orderModel } from "../models/orderModel";
import { orderbookModel } from "../models/orderbookModel";
import { fillModel } from "../models/fillModel";

type MakerOrderMatch = {
    _id: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    price: number;
    remainingQuantity: number;
    createdAt: Date;
    kind: "TRANSFER" | "MINT";
    effectivePrice: number;
    makerOutcome: "YES" | "NO";
};


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

                if (
                    market.status !== "OPEN" ||
                    market.resolution !== "PENDING" ||
                    market.expiry <= new Date()
                ) {
                    throw new Error("Market is not open or has expired");
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
                        _id: marketId,
                        resolution: "PENDING",
                        totalIssued: { $gte: requestedQuantity }
                    },
                    {
                        $inc: { totalIssued: -requestedQuantity }
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
                        action: "merge",
                        balanceUSDChange: cost,
                    },
                    {
                        userId: user.id,
                        marketId,
                        action: "merge",
                        outcome: "YES",
                        qtyChange: -requestedQuantity,
                    },
                    {
                        userId: user.id,
                        marketId,
                        action: "merge",
                        outcome: "NO",
                        qtyChange: -requestedQuantity,
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

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Merge Failed";
            return res.status(400).json({
                message
            })
        }
    },


    // PlaceOrder
    placeOrder: async (req: Request, res: Response) => {
        try {
            if (!req.user) {
                return res.status(401).json({ message: "Unauthorized" });
            }
            const user = req.user;

            // Step 4a — Reserve and create order
            // Lock USD or contracts and create OPEN order

            const parsed = placeOrderSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({ message: "Incorrect Format" });
            }

            const { marketId, type, side, price, quantity: requestedQuantity } = parsed.data;


            // Convert IDs to ObjectId
            const userId = new mongoose.Types.ObjectId(user.id.toString());
            const marketObjectId = new mongoose.Types.ObjectId(marketId.toString());
            const reserved = price * requestedQuantity;

            // checking safe integer
            if (!Number.isSafeInteger(reserved)) {
                return res.status(400).json({
                    message: "Price multiplied by quantity must be a safe integer"
                })
            }

            const result = await mongoose.connection.transaction(async (session) => {

                // Checking market 
                const market = await marketModel.findById(marketId).session(session);

                if (!market) {
                    throw new Error("Market Not found");
                }

                if (market.status !== "OPEN" || market.resolution !== "PENDING" || market.expiry <= new Date()) {
                    throw new Error("Market is not open or has expired");
                }

                // Converting oder type create or find
                const orderSide = type === "BUY" ? "BUY" : "SELL";

                // 4a . finding the oderbook
                const orderbook = await orderbookModel.findOne({
                    marketId: marketObjectId,
                    outcome: side,
                }).session(session);

                if (!orderbook) {
                    throw new Error("Orderbook creation failed");
                }

                // Helper : Realease the Locked USD 
                const decreasedLockedUSD = async (
                    ownerId: mongoose.Types.ObjectId,
                    amount: number,
                    refund: number = 0
                ) => {

                    const updatedUser = await userModel.findOneAndUpdate(
                        {
                            _id: ownerId,
                            lockedUsdBalance: { $gte: amount }
                        },
                        {
                            $inc: {
                                lockedUsdBalance: -amount,
                                availableUsdBalance: refund
                            }
                        },
                        {
                            new: true,
                            session
                        }
                    );

                    if (!updatedUser) {
                        throw new Error("Insufficient locked USD balance");
                    }

                    return updatedUser;
                };

                // Helper : Credit available USD
                const creditUsd = async (
                    ownerId: mongoose.Types.ObjectId,
                    amount: number,
                ) => {
                    const updatedUser = await userModel.findByIdAndUpdate(
                        ownerId,
                        {
                            $inc: { availableUsdBalance: amount }
                        },
                        {
                            new: true,
                            session
                        }
                    );

                    if (!updatedUser) {
                        throw new Error("user not found");
                    }

                    return updatedUser;
                };

                // Helper : Remove seller's locked Contracts 
                const removeLockedStock = async (
                    ownerId: mongoose.Types.ObjectId,
                    outcome: "YES" | "NO",
                    matched: number
                ) => {
                    const updatedStock = await stockBalanceModel.findOneAndUpdate(
                        {
                            userId: ownerId,
                            marketId: marketObjectId,
                            outcome,
                            quantity: { $gte: matched },
                            lockedQuantity: { $gte: matched }
                        },
                        {
                            $inc: {
                                quantity: -matched,
                                lockedQuantity: -matched,
                            }
                        },
                        {
                            new: true,
                            session
                        }
                    );

                    if (!updatedStock) {
                        throw new Error("Insufficient locked stock balance");
                    }

                    return updatedStock;
                };

                // Helper : Add contracts to buyer
                const addStockBalance = async (
                    ownerId: mongoose.Types.ObjectId,
                    outcome: "YES" | "NO",
                    matched: number
                ) => {
                    const updatedStock = await stockBalanceModel.findOneAndUpdate(
                        {
                            userId: ownerId,
                            marketId: marketObjectId,
                            outcome
                        },
                        {
                            $inc: { quantity: matched },
                            $setOnInsert: { lockedQuantity: 0 }
                        },
                        {
                            upsert: true,
                            new: true,
                            session
                        }
                    );
                    if (!updatedStock) {
                        throw new Error("Stock balance updated failed");
                    }
                    return updatedStock;
                };

                // 4a. BUY Reserve USD
                if (type === "BUY") {
                    const updatedUser = await userModel.findOneAndUpdate(
                        {
                            _id: userId,
                            availableUsdBalance: { $gte: reserved }
                        },
                        {
                            $inc: {
                                availableUsdBalance: -reserved,
                                lockedUsdBalance: reserved
                            }
                        },
                        {
                            new: true,
                            session
                        }
                    );

                    if (!updatedUser) {
                        throw new Error("Insufficient available USD balance");
                    }

                } else {
                    // 4a . SELL - lock contracts
                    const updatedStock = await stockBalanceModel.findOneAndUpdate(
                        {
                            userId,
                            marketId: marketObjectId,
                            outcome: side,
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
                            $inc: { lockedQuantity: requestedQuantity }
                        },
                        {
                            new: true,
                            session
                        }
                    );
                    if (!updatedStock) {
                        throw new Error("Insufficient unlocked stock balance");
                    }
                }

                // 4a: Create incoming order 
                const [incomingOrder] = await orderModel.create(
                    [
                        {
                            orderbookId: orderbook._id,
                            marketId: marketObjectId,
                            userId,
                            side: orderSide,
                            price,
                            quantity: requestedQuantity,
                            remainingQuantity: requestedQuantity,
                            status: "OPEN"
                        }
                    ],
                    { session }
                );

                if (!incomingOrder) {
                    throw new Error("Failed to create order");
                }

                // 4a: Initial transaction logs
                if (type === "BUY") {

                    await transactionLogModel.create(
                        [
                            {
                                userId,
                                marketId: marketObjectId,
                                orderId: incomingOrder._id,
                                outcome: side,
                                action: "lock",
                                balanceUSDChange: -reserved,
                                lockedUSDChange: reserved
                            }
                        ],
                        { session }
                    );

                } else {
                    await transactionLogModel.create(
                        [
                            {
                                userId,
                                marketId: marketObjectId,
                                orderId: incomingOrder._id,
                                outcome: side,
                                action: "lock",
                                lockedQtyChange: requestedQuantity
                            }
                        ],
                        { session }
                    );
                }

                // finding the opposite order for MINT
                let remainingQuantity = requestedQuantity;

                const oppositeSide = side === "YES" ? "NO" : "YES";

                const oppositeOrderbook = type === "BUY"
                    ? await orderbookModel.findOne({
                        marketId: marketObjectId,
                        outcome: oppositeSide,
                    }).session(session) : null;


                // type MakerOrderMatch = {
                //     _id: mongoose.Types.ObjectId;
                //     userId: mongoose.Types.ObjectId;
                //     price: number;
                //     remainingQuantity: number;
                //     createdAt: Date;
                //     kind: "TRANSFER" | "MINT";
                //     effectivePrice: number;
                //     makerOutcome: "YES" | "NO";
                // };

                // Find best mmaker order directly from mongoDb
                const getBestMakerOrder = async (): Promise<MakerOrderMatch | null> => {

                    let matchFilter;

                    if (type === "BUY") {

                        matchFilter = {
                            marketId: marketObjectId,
                            userId: { $ne: userId },
                            status: {
                                $in: ["OPEN", "PARTIALLY_FILLED"]
                            },
                            remainingQuantity: { $gt: 0 },
                            $or: [
                                {
                                    orderbookId: orderbook._id,
                                    side: "SELL",
                                    price: { $lte: price }
                                },
                                ...(oppositeOrderbook ? [
                                    {
                                        orderbookId: oppositeOrderbook._id,
                                        side: "BUY",
                                        price: { $gte: 100 - price }
                                    }
                                ] : [])
                            ]
                        };
                    } else {
                        matchFilter = {
                            marketId: marketObjectId,
                            orderbookId: orderbook._id,
                            userId: { $ne: userId },
                            side: "BUY",
                            status: {
                                $in: ["OPEN", "PARTIALLY_FILLED"]
                            },
                            remainingQuantity: { $gt: 0 },
                            price: { $gte: price }
                        };
                    }

                    // MongoDB calculates kind, effectivePrice and makerOutcome
                    const cursor = orderModel.aggregate<MakerOrderMatch>([
                        {
                            $match: matchFilter
                        },
                        {
                            $addFields: {
                                kind: type === "BUY"
                                    ? {
                                        $cond: [
                                            {
                                                $eq: [
                                                    "$orderbookId",
                                                    orderbook._id
                                                ]
                                            },
                                            "TRANSFER",
                                            "MINT"
                                        ]
                                    }
                                    : "TRANSFER",

                                effectivePrice: type === "BUY"
                                    ? {
                                        $cond: [
                                            {
                                                $eq: [
                                                    "$orderbookId",
                                                    orderbook._id
                                                ]
                                            },
                                            "$price",
                                            { $subtract: [100, "$price"] }
                                        ]
                                    }
                                    : "$price",

                                makerOutcome: type === "BUY"
                                    ? {
                                        $cond: [
                                            {
                                                $eq: [
                                                    "$orderbookId",
                                                    orderbook._id
                                                ]
                                            },
                                            { $literal: side },
                                            { $literal: oppositeSide }
                                        ]
                                    }
                                    : { $literal: side }
                            }
                        },
                        {
                            $sort: type === "BUY"
                                ? {
                                    effectivePrice: 1,
                                    createdAt: 1,
                                    _id: 1
                                }
                                : {
                                    effectivePrice: -1,
                                    createdAt: 1,
                                    _id: 1
                                }
                        },
                        {
                            $limit: 1
                        }
                    ]).session(session).cursor({ batchSize: 1 });

                    try {
                        return await cursor.next();
                    } finally {
                        await cursor.close();
                    }
                };

                // 4b + 4c : matching loop 
                while (remainingQuantity > 0) {

                    // fetch only the next bast maker 
                    const makerOrder = await getBestMakerOrder();

                    if (!makerOrder) {
                        break;
                    }

                    // calculate the matched quantity 
                    const matched = Math.min(
                        remainingQuantity,
                        makerOrder.remainingQuantity
                    );

                    if (matched <= 0) {
                        break;
                    }

                    // updating the make remaining quantity and status
                    const makerRemainingQuantity =
                        makerOrder.remainingQuantity - matched;

                    const makerStatus =
                        makerRemainingQuantity === 0
                            ? "FILLED"
                            : "PARTIALLY_FILLED";

                    const updatedMakerOrder = await orderModel.findOneAndUpdate(
                        {
                            _id: makerOrder._id,
                            remainingQuantity: makerOrder.remainingQuantity,
                            status: {
                                $in: ["OPEN", "PARTIALLY_FILLED"]
                            }
                        },
                        {
                            $inc: {
                                remainingQuantity: -matched
                            },
                            $set: {
                                status: makerStatus
                            }
                        },
                        {
                            new: true,
                            session
                        }
                    );

                    if (!updatedMakerOrder) {
                        throw new Error("Maker order changed. Please retry");
                    }

                    // Creating fill 
                    const [fill] = await fillModel.create(
                        [
                            {
                                marketId: marketObjectId,
                                makerOrderId: makerOrder._id,
                                takerOrderId: incomingOrder._id,
                                makerUserId: makerOrder.userId,
                                takerUserId: userId,
                                kind: makerOrder.kind,
                                price: makerOrder.price,
                                outcome: makerOrder.makerOutcome,
                                quantity: matched
                            }
                        ],
                        { session }
                    );

                    if (!fill) {
                        throw new Error("Failed to create fill");
                    }

                    // 4c : MINT MATCH 
                    if (makerOrder.kind == "MINT") {
                        const makerReserved = makerOrder.price * matched;
                        const takerReserved = price * matched;

                        const takerActualCost =
                            makerOrder.effectivePrice * matched;

                        const takerRefund =
                            takerReserved - takerActualCost;

                        if (takerRefund < 0) {
                            throw new Error("Invalid MINT execution price");
                        }

                        // Consume maker's locked USD
                        await decreasedLockedUSD(
                            makerOrder.userId,
                            makerReserved
                        );

                        // Consume taker's locked USD and refund difference
                        await decreasedLockedUSD(
                            userId,
                            takerReserved,
                            takerRefund
                        );
                        // Maker receives opposite outcome
                        await addStockBalance(
                            makerOrder.userId,
                            makerOrder.makerOutcome,
                            matched
                        );
                        // Taker receives requested outcome
                        await addStockBalance(
                            userId,
                            side,
                            matched
                        );
                        // Increase totalIssued
                        const updatedMarket = await marketModel.findOneAndUpdate(
                            {
                                _id: marketObjectId,
                                status: "OPEN",
                                resolution: "PENDING",
                                expiry: { $gt: new Date() }
                            },
                            {
                                $inc: { totalIssued: matched }
                            },
                            {
                                new: true,
                                session
                            }
                        );
                        if (!updatedMarket) {
                            throw new Error("Market is no longer open for MINT");
                        }
                        await transactionLogModel.create(
                            [
                                {
                                    userId: makerOrder.userId,
                                    marketId: marketObjectId,
                                    orderId: makerOrder._id,
                                    fillId: fill._id,
                                    action: "buy",
                                    outcome: makerOrder.makerOutcome,
                                    qtyChange: matched,
                                    lockedUSDChange: -makerReserved
                                },
                                {
                                    userId,
                                    marketId: marketObjectId,
                                    orderId: incomingOrder._id,
                                    fillId: fill._id,
                                    action: "buy",
                                    outcome: side,
                                    qtyChange: matched,
                                    lockedUSDChange: -takerReserved,
                                    balanceUSDChange: takerRefund
                                }
                            ],
                            { session, ordered: true }
                        );
                        // 4b: TRANSFER - Incoming BUY
                    } else if (type === "BUY") {
                        const takerReserved = price * matched;
                        const executionCost = makerOrder.price * matched;

                        const refund = takerReserved - executionCost;

                        // Release taker's locked USD and refund difference
                        await decreasedLockedUSD(
                            userId,
                            takerReserved,
                            refund
                        );

                        // Remove maker seller's contracts
                        await removeLockedStock(
                            makerOrder.userId,
                            side,
                            matched
                        );

                        // Give contracts to taker
                        await addStockBalance(
                            userId,
                            side,
                            matched
                        );

                        // Pay maker seller
                        await creditUsd(
                            makerOrder.userId,
                            executionCost
                        );

                        // TRANSFER transaction logs
                        await transactionLogModel.create(
                            [
                                {
                                    userId: makerOrder.userId,
                                    marketId: marketObjectId,
                                    orderId: makerOrder._id,
                                    fillId: fill._id,
                                    action: "sell",
                                    outcome: side,
                                    qtyChange: -matched,
                                    lockedQtyChange: -matched,
                                    balanceUSDChange: executionCost
                                },
                                {
                                    userId,
                                    marketId: marketObjectId,
                                    orderId: incomingOrder._id,
                                    fillId: fill._id,
                                    action: "buy",
                                    outcome: side,
                                    qtyChange: matched,
                                    lockedUSDChange: -takerReserved,
                                    balanceUSDChange: refund
                                }
                            ],
                            { session, ordered: true }
                        );

                    } else {
                        const makerReserved = makerOrder.price * matched;

                        // Release maker buyer's locked USD
                        await decreasedLockedUSD(
                            makerOrder.userId,
                            makerReserved
                        );

                        // Remove incoming seller's contracts
                        await removeLockedStock(
                            userId,
                            side,
                            matched
                        );

                        // Give contracts to maker buyer
                        await addStockBalance(
                            makerOrder.userId,
                            side,
                            matched
                        );

                        // Pay incoming seller
                        await creditUsd(
                            userId,
                            makerReserved
                        );

                        // TRANSFER transaction logs
                        await transactionLogModel.create(
                            [
                                {
                                    userId: makerOrder.userId,
                                    marketId: marketObjectId,
                                    orderId: makerOrder._id,
                                    fillId: fill._id,
                                    action: "buy",
                                    outcome: side,
                                    qtyChange: matched,
                                    lockedUSDChange: -makerReserved
                                },
                                {
                                    userId,
                                    marketId: marketObjectId,
                                    orderId: incomingOrder._id,
                                    fillId: fill._id,
                                    action: "sell",
                                    outcome: side,
                                    qtyChange: -matched,
                                    lockedQtyChange: -matched,
                                    balanceUSDChange: makerReserved
                                }
                            ],
                            { session, ordered: true }
                        );
                    }
                    // Reducing incoming remaining quantity
                    remainingQuantity -= matched;
                }
                // 4d: Final incoming order status
                const finalStatus =
                    remainingQuantity === 0
                        ? "FILLED"
                        : remainingQuantity < requestedQuantity
                            ? "PARTIALLY_FILLED"
                            : "OPEN";

                // Updating incoming order
                const updatedIncomingOrder = await orderModel.findOneAndUpdate(
                    {
                        _id: incomingOrder._id
                    },
                    {
                        $set: {
                            remainingQuantity,
                            status: finalStatus
                        }
                    },
                    {
                        new: true,
                        session
                    }
                );

                if (!updatedIncomingOrder) {
                    throw new Error("Incoming order update failed");
                }

                return updatedIncomingOrder;
            });

            return res.status(201).json({
                message: "Order processed successfully",
                data: result
            });


        } catch (error) {
            const message = error instanceof Error
                ? error.message
                : "Order creation failed";

            const statusCode =
                message === "Market Not found" ||
                    message === "user not found" ? 404 : 400;

            return res.status(statusCode).json({
                message
            });
        }
    }
}