import type { Request, Response } from "express"
import { resolveMarketSchema } from "../types/resolveValidator";
import { Market } from "../models/marketModel";
import { Bet } from "../models/betsModel";
import { User } from "../models/userModel";
import { Wallet } from "../models/walletEventsModel";

export const resolveController = {
    // only admin can be resolve 
    resolve : async ( req : Request , res : Response) => {
        try {
            const parsed = resolveMarketSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({ message: "Incorrect Format" });
            }
            const {marketId , resolution} = parsed.data;

            const market  = await Market.findById({_id : marketId});
            
            if(!market){
                return res.status(404).json({
                error: "Market not found",
                });
            }

            if(market.resolution !== null){
                return res.status(400).json({
                    error: "Market already resolved",
                });
            }
            if (new Date() < market.expiry) {
                return res.status(400).json({
                    error: "Market has not expired yet",
                });
            }
            
            const bets = await Bet.find({
                marketId
            })

            const totalBets = bets.reduce((sum , bet) => sum + bet.betAmount, 0);
            

            if(market.side === resolution){
                // creator wins 
                const payout = totalBets * 2 + (market.initialWager - totalBets);
                await User.updateOne(
                    { _id : market.creatorId},
                    {$inc : {balance : payout }}
                );

                await Wallet.create({
                    userId : market.creatorId,
                    tx_type : "payout",
                    externalId : {marketId},
                    amount : payout
                });
            }else{
                // Bettor wins 
                for(const bet of bets){
                    const payout = bet.betAmount * 2;

                    await User.updateOne(
                        {_id : bet.userId},
                        {$inc : { balance : payout}}
                    );

                    await  Wallet.create({
                        userId : bet.userId,
                        tx_type : "payout",
                        externalId : {
                            marketId : marketId,
                            betId : bet._id,
                        },
                        amount : payout
                    });
                }

                 // no one bet on the market 
                const refund = market.initialWager - totalBets
                if(refund > 0){

                    await User.updateOne(
                        {_id: market.creatorId},
                        {$inc :  {balance : refund}
                    });

                    await Wallet.create({
                        userId : market.creatorId,
                        tx_type : "refund",
                        externalId : {marketId},
                        amount : refund
                    })
                }
            }

            market.resolution = resolution;
            await market.save();

            return res.json({
                message: "Market resolved successfully",
                resolution : resolution,
            });

        } catch (error) {
            console.log(error);
            return res.status(500).json({
                message: "Internal Serever Error"
            });
        }
    }
}