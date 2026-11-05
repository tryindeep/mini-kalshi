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
        default: 0
    },
    resolution: {
        type: String,
        enum: ["YES", "NO", "PENDING","NULL"],
        default: "PENDING",
    },
    expiry: {
        type: Date,
        required: true,
    },
    status: { type: String, enum: ["OPEN", "CLOSED", "RESOLVED"], default: "OPEN" },
    resolvedAt: { type: Date },

},
    { timestamps: true }
)

marketSchema.index({ status: 1, expiry: 1 });

export const marketModel = mongoose.model("Market", marketSchema);