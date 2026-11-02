import { z } from "zod";

export const signupSchema = z.object({
  username: z.string().trim().min(3),
  password: z.string().min(2).max(100),
  role: z.enum(["user","admin"]).default("user"),
}).strict();

export const signinSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export const onrampSchema = z.object({
  amount: z.number().int().positive(),
});