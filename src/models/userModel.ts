
import mongoose from "mongoose";


const userSchema = new mongoose.Schema({
    username: {
        type: String,
        unique: true,
        required: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        enum: ["user", "admin"],
        default: "user",
        required: true,
    },
    availableUsd: {
        type: Number,
        required: true,
        default: 0
    },
    lockedUsd: {
        type: Number,
        required: true,
        default: 0
    },
},
    { timestamps: true }
);

export const userModel = mongoose.model("User", userSchema);
