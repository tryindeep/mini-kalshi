import { z } from "zod";

export const signupSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  role: z.enum(["user","admin"]).default("user"),
});

export const signinSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export const onrampSchema = z.object({
  amount: z.number().int().positive(),
});