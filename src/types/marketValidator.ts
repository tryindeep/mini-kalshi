import {z} from "zod";

export const createMarketSchema = z.object({
    title : z.string().trim().min(1),
    expiry: z.coerce.date(),
});

