import mongoose from "mongoose";
const ObjectId = mongoose.Schema.ObjectId;

const betSchema = new mongoose.Schema({
    userId : {
        type : ObjectId,
        ref : "User",
        required : true,
    },
    marketId : {
        type : ObjectId,
        ref : "Market",
        required : true,
    },
    betAmount : {
        type : Number,
        required : true,
    }
});

export const Bet = mongoose.model("Bet" , betSchema);
