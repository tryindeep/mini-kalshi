import mongoose from "mongoose";
const ObjectId = mongoose.Schema.ObjectId;

const fillSchema = new mongoose.Schema(
    {
        marketId: {
            type: ObjectId,
            ref: "Market",
            required: true,
        },
        makerOrderId: {
            type: ObjectId,
            ref: "Order",
            required: true,
        },

        takerOrderId: {
            type: ObjectId,
            ref: "Order",
            required: true,
        },
        makerUserId: {
            type: ObjectId,
            ref: "User",
            required: true,
        },
        takerUserId: {
            type: ObjectId,
            ref: "User",
            required: true,
        },
        // TRANSFER: existing contracts change owner (BUY vs SELL, same outcome)
        // MINT: two opposite BUY orders create a new YES/NO pair
        kind: {
            type: String,
            enum: ["TRANSFER", "MINT"],
            required: true,
        },
        price: {
            type: Number,
            required: true,
            min: 1,
            max: 99,
            validate: { validator: Number.isInteger, message: "price must be integer cents" },
        },
        outcome: {
            type: String,
            enum: ["YES", "NO"],
            required: true,
        },
        quantity: {
            type: Number,
            required: true,
            min: 1,
        },
    },
    { timestamps: true }
);
fillSchema.index({ marketId: 1, createdAt: -1 });
fillSchema.index({ makerUserId: 1, createdAt: -1 });
fillSchema.index({ takerUserId: 1, createdAt: -1 });


export const fillModel = mongoose.model("Fill", fillSchema);