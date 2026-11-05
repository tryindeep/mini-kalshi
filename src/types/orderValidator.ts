import {z} from "zod"



export const splitSchema = z.object({
    marketId: z.string().regex(/^[a-f\d]{24}$/i),
    quantity:z.number().int().positive(),
});

export const createOrderSchema = z.object({
    marketId: z.string().regex(/^[a-f\d]{24}$/i),
    type : z.enum(["BUY" , "SELL"]),
    side : z.enum(["YES" , "NO"]),
    price : z.number().int().min(1).max(99),
    quantity : z.number().int().positive(),
})