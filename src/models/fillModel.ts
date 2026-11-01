import mongoose from "mongoose";
const ObjectId = mongoose.Schema.ObjectId;
const fillSchema = new mongoose.Schema(
    {
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

        marketId: {
            type: ObjectId,
            ref: "Market",
            required: true,
        },

        quantity: {
            type: Number,
            required: true,
            min: 1,
        },

        price: {
            type: Number,
            required: true,
            min: 0,
            max: 1,
        },
    },
    { timestamps: true }
);

export const fillModel = mongoose.model("Fill", fillSchema);