import mongoose from "mongoose";
const ObjectId = mongoose.Schema.Types.ObjectId;

const orderbookSchema = new mongoose.Schema({
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

}
    , { timestamps: true }

);

orderbookSchema.index(
    { marketId: 1, outcome: 1 },
    { unique: true }
);

export const orderbookModel = mongoose.model("Orderbook", orderbookSchema);
