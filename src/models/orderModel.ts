import mongoose from "mongoose";

const ObjectId = mongoose.Schema.Types.ObjectId;

const orderSchema = new mongoose.Schema({
    orderbookId: {
        type: ObjectId,
        ref: "Orderbook",
        required: true,
    },
    marketId: {
        type: ObjectId,
        ref: "Market",
        required: true,
    },
    userId: {
        type: ObjectId,
        ref: "User",
        required: true,
    },

    side: {
        type: String,
        enum: ["BUY", "SELL"],
        required: true,
    },

    price: {
        type: Number,
        required: true,
        min: 1,
        max: 99,
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
    },
    remainingQuantity: {
        type: Number,
        required: true,
        min: 0
    },

    status: {
        type: String,
        enum: ["OPEN", "PARTIALLY_FILLED", "FILLED", "CANCELLED"],
        default: "OPEN",
    },
},
    { timestamps: true }
)

orderSchema.index({ orderbookId: 1, side: 1, status: 1, price: 1, createdAt: 1 });
orderSchema.index({ orderbookId: 1, side: 1, status: 1, price: -1, createdAt: 1 });
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ marketId: 1, status: 1 });

export const orderModel = mongoose.model("Order", orderSchema);