import { z } from "zod";

export const setPasswordSchema = z
  .object({
    password: z
      .string()
      .min(1, { message: "Please enter your password" })
      .min(6, { message: "Password must be at least 6 characters long" }),
    confirm_password: z.string(),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords don't match.",
    path: ["confirm_password"],
  });

export const forgotPasswordSchema = z.object({
  email: z.string().min(1, { message: "Please enter your email" }).email({ message: "Please enter a valid email" }),
});

export type SetPasswordFormValues = z.infer<typeof setPasswordSchema>;
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
