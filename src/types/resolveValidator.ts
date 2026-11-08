import { z } from "zod";

export const resolveMarketSchema = z.object({
  marketId: z.string(),
  resolution: z.enum(["YES", "NO"]),
});