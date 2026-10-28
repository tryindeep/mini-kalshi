
import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    username : {
        type : String,
        unique : true,
        required : true
    },
    password : {
        type : String,
        required : true,
    },
    balance : {
        type : Number,
        default : 0,
    },
    role: {
        type: String,
        enum: ["user", "admin"],
        default: "user",
        required: true,
    }
});

export const User = mongoose.model("User", userSchema);
