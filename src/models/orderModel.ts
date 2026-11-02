import mongoose from "mongoose";

const ObjectId = mongoose.Schema.Types.ObjectId;

const oderSchema = new mongoose.Schema({
    oderbookId: {
        type: ObjectId,
        ref: "Orderbook",
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
        min: 0,
        max: 1,
    },

    remainingQuantity: {
        type: Number,
        required: true,
        min: 1
    },

    status: {
        type: String,
        enum: ["OPEN", "PERTIALLY FILLED", "FILLED", "CANCELLED"],
        default: "OPEN",
    },
},
    { timestamps: true }
)

export const oderModel = mongoose.model("Oder", oderSchema);