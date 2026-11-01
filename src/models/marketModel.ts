import mongoose from "mongoose";
const ObjectId = mongoose.Schema.Types.ObjectId;

const marketSchema = new mongoose.Schema({
    creatorId: {
        type: ObjectId,
        ref: "User",
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    totalIssued: {
        type: Number,
        required: true,
        min: 0,
    },
    resolution: {
        type: String,
        enum: ["YES", "NO", "PENDING"],
        default: null,
    },
    expiry: {
        type: Date,
        required: true,
    },

},
    { timestamps: true }
)

export const marketModel = mongoose.model("Market", marketSchema);