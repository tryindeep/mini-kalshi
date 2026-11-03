
import mongoose from "mongoose";
const ObjectId = mongoose.Schema.Types.ObjectId;

const stockBalanceSchema = new mongoose.Schema({
    userId: {
        type: ObjectId,
        ref: "User",
        required: true,
    },
    marketId: {
        type: ObjectId,
        ref: "Market",
        required: true,
    },
    type: {
        type: String,
        enum: ["YES", "NO"],
        required: true,
    },
    quantity: {
        type: Number,
        default: 0,
        min: 0,
    },
    lockedQuantity: {
        type: Number,
        default: 0,
        min: 0,
    },
},
    { timestamps: true }
);

stockBalanceSchema.index(
    { userId: 1, marketId: 1, outcome: 1 },
    { unique: true }
);


export const stockBalenceModel = mongoose.model("stockBalenceModel", stockBalanceSchema);