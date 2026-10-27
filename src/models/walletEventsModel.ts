import mongoose from "mongoose";
const Mixed = mongoose.Schema.Types.ObjectId;
const ObjectId = mongoose.Schema.ObjectId;

const walletEventSchema = new mongoose.Schema({
   userId : {
        type : ObjectId,
        ref : "User",
        required : true,
   },
   tx_type : {
        type : String,
        enum : ["onramp" , "created" , "bet" , "payout", "refund"],
        required : true,
   },
   externalId : {
        type : Mixed,
   },
   amount : {
        type : Number,
        require : true,
   }
})

export const Wallet = mongoose.model("Wallet", walletEventSchema);