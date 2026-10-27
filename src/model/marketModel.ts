import mongoose from "mongoose";
const ObjectId = mongoose.Schema.ObjectId;

const marketSchema = new mongoose.Schema({
    title : {
        type : String,
        required : true,
    },
    initialWager : {
        type : Number,
        required : true,
    },
    side : {
        type : String,
        enum : ["yes","no"],
        required : true,
    },
    creatorId : {
        type : ObjectId,
        ref : "User",
        required : true
    },
    expiry : {
        type : Date,
        required : true,
    },
    resolution : {
        type : String,
        enum : ["yes" , "no", "null"],
        default: null,
    }
})

export const Market = mongoose.model("Market", marketSchema);