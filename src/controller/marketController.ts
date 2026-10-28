import type { Request, Response } from "express"
import { createMarketSchema, placeBetSchema } from "../types/marketValidator";
import { User } from "../models/userModel";
import { Market } from "../models/marketModel";
import { Wallet } from "../models/walletEventsModel";
import { Bet } from "../models/betsModel";

export const marketController = {
   

    create : async ( req : Request , res : Response) => {
        try {
            if(!req.user) {
                return res.status(401).json({ message: "Unauthorized" });
            }
            const parsed = createMarketSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({ message: "Incorrect Format" });
            }
            const {expiry , initialWager} = parsed.data;
            // expired date must be in future ;
            if(expiry <= new Date()){
                return res.status(400).json({ message: "Expiry must be in the future" });
            }

            const user = await User.findById(req.user.id);

            // check the current balance first 
            if(!user || user.balance < initialWager){
                return res.status(400).json({ error : "Insufficient Balance" });
            }

            user.balance = user.balance - initialWager;
            // save the new balance 
            await user.save();

            const market  = await Market.create({
                ...parsed.data,
                creatorId : req.user.id
            });

            // wallet changes 
            await Wallet.create({
                userId : req.user.id,
                tx_type: "created",
                externalId : { marketId : market._id},
                amount : -parsed.data.initialWager
            })
            return res.status(201).json({
                id: market._id,
            });
        } catch (error) {
            console.log(error);
            return res.status(500).json({
                message: "Internal Serever Error"
            });
        }
    },

    // GET ALL makets 
    getAllMarkets : async ( req : Request , res : Response) => {
        try {
            const markets = await Market.find()
                .populate("creatorId", "username");
                
            return res.status(200).json({
                markets : markets
            }); 
        } catch (error) {
            console.log(error);
            return res.status(500).json({
                message: "Internal Serever Error"
            });
        }
    },
   
    placeBet : async ( req : Request , res : Response) => {
        try {
            if(!req.user) {
                return res.status(401).json({ message: "Unauthorized" });
            }
            const parsed = placeBetSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({ message: "Incorrect Format" });
            }
            const {marketId , amount} = parsed.data;
            
            // find the market
            const market = await Market.findOne({
                _id : marketId,
            });
            if(!market){
                return res.status(404).json({
                error: "Market not found",
                });
            }
            // check marked reslove ?
            if(market.resolution !== null){
                return res.status(400).json({
                error: "Market already resolved",
                });
            }
            // check if market is expired 
            if (new Date() >= market.expiry) {
                return res.status(400).json({
                    error: "Market expired",
                });
            }
            // is creator trying to bet 
            if( market.creatorId.toString() === req.user.id){
                return res.status(400).json({
                    error: "Creator cannot bet against their own market",
                });
            }
            // find the bet 
            const existingBets = await Bet.find({marketId});

            // adding the bets 
            const totalBets = existingBets.reduce((sum , bet ) => sum + bet.betAmount,0);

            // 60 + 50 > 100 
            if(totalBets + amount > market.initialWager){
                return res.status(400).json({
                error: "Bet exceeds remaining available amount",
            });
            }
            // find the bettor
            const user = await User.findById(req.user.id);

            if(!user){
                return res.status(404).json({
                    error: "User not found",
                });
            }

            if(user.balance < amount){
                return res.status(400).json({
                    error: "Insufficient balance",
                });
            }

            // deducthe amount and save
            user.balance = user.balance - amount;
            await user.save();

            const bettorSide = market.side === "yes" ? "no" : "yes";

            // create bet 
            const bet = await Bet.create({
                userId : req.user.id,
                marketId : marketId,
                side: bettorSide,
                betAmount : amount
            })

            //create walletEvent
            await Wallet.create({
                userId : req.user.id,
                tx_type : "bet",
                externalId : {
                    betId : bet._id,
                    marketId,
                },
                amount : -amount,
            })
            return res.status(201).json({
                betId: bet._id,
            });
        } catch (error) {
            console.log(error);
            return res.status(500).json({
                message: "Internal Serever Error"
            });
        }
    },
    getBets : async ( req : Request , res : Response) => {
        try {
            if(!req.user) {
                return res.status(401).json({ message: "Unauthorized" });
            }
            const bets = await Bet.find({
                userId : req.user.id,
            }).populate("marketId");
            
            return res.status(200).json({
                bets : bets
            })
        } catch (error) {
            console.log(error);
            return res.status(500).json({
                message: "Internal Serever Error"
            });
        }
    },
}

  // CREATE MARKET 
    // Client
    //   │
    //   │ POST /market
    //   │ Authorization: Bearer <JWT>
    //   │ Body: { expiry, initialWager, ... }
    //   ▼
    // Auth Middleware
    //   │
    //   │ jwt.verify()
    //   │
    //   │ req.user = { id: userId }
    //   ▼
    // createMarket Controller
    //   │
    //   ├── 1. Check authentication
    //   │
    //   ├── 2. Validate request body
    //   │
    //   ├── 3. Check expiry
    //   │
    //   ├── 4. Find user
    //   │
    //   ├── 5. Check balance
    //   │
    //   ├── 6. Deduct initial wager
    //   │
    //   ├── 7. Create market
    //   │
    //   ├── 8. Create wallet transaction
    //   │
    //   └── 9. Return market ID