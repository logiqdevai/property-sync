import { z } from "zod";

export const SignInSchema = z.object({
  email: z.string().min(1, { message: "Please enter your email" }),
  password: z
    .string()
    .min(1, { message: "Please enter your password" })
    .min(6, { message: "Password must be at least 6 characters long" }),
});

export type SignInFormValues = z.infer<typeof SignInSchema>;
