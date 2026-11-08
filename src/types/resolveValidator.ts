import { z } from "zod";

export const resolveMarketSchema = z.object({
  marketId: z.string().regex(/^[a-f\d]{24}$/i),
  resolution: z.enum(["YES", "NO"]),
});