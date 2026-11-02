import mongoose from "mongoose";
const ObjectId = mongoose.Schema.Types.ObjectId;
const transactionLogSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        type: {
            type: String,
            enum: [
                "DEPOSIT",
                "ORDER_LOCK",
                "ORDER_CANCEL",
                "TRADE",
                "PAYOUT",
                "REFUND",
                "WITHDRAWAL",
            ],
            required: true,
        },

        amount: {
            type: Number,
            required: true,
        },

        balanceBefore: {
            type: Number,
            required: true,
        },

        balanceAfter: {
            type: Number,
            required: true,
        },

        lockedBefore: {
            type: Number,
            required: true,
        },

        lockedAfter: {
            type: Number,
            required: true,
        },

        referenceId: {
            type: ObjectId,
            default: null,
        },
    },
    { timestamps: true }
);

export const transactionLogModel = mongoose.model(
    "TransactionLog",
    transactionLogSchema
);