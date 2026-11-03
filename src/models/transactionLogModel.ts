import mongoose from "mongoose";
const ObjectId = mongoose.Schema.Types.ObjectId;
const transactionLogSchema = new mongoose.Schema(
    {
        userId: {
            type: ObjectId,
            ref: "User",
            required: true,
        },
        marketId: {
            type: ObjectId,
            ref: "Market",
            required: false,
        },
        orderId: {
            type: ObjectId,
            ref: "Order",
            required: false,
        },
        fillId: {
            type: ObjectId,
            ref: "Fill",
            required: false,
        },
        outcome: {
            type: String,
            enum: ["YES", "NO", null],
            default: null,
        },
        action: {
            type: String,
            enum: [
                "onramp",
                "buy",
                "sell",
                "lock",
                "unlock",
                "split",
                "merge",
                "payout",
                "refund",
                "cancel",
            ],
            required: true,
        },
        qtyChange: {
            type: Number,
        },
        lockedQtyChange: {
            type: Number,
        },
        balanceUSDChange: {
            type: Number,
        },
        lockedUSDChange: {
            type: Number,
        },
    },
    { timestamps: true },
);

export const transactionLogModel = mongoose.model(
    "TransactionLog",
    transactionLogSchema
);