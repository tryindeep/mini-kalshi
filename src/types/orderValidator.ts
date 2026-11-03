import {z} from "zod"

export const createOderSchema = z.object({
    marketId: z.string().regex(/^[a-f\d]{24}$/i),
    stocktype : z.enum(["BUY" , "SELL"]),
    side : z.enum(["YES" , "NO"]),
    price : z.number().int().min(1).max(99),
    quantity : z.number().int().positive(),
})