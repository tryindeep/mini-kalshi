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

        makerPrice: {
            type: Number,
            required: true,
        },
        takerPrice: {
            type: Number,
            required: true,
        },
        type: {
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

export const fillModel = mongoose.model("Fill", fillSchema);