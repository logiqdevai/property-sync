import { z } from "zod";

export const updateProfileSchema = z.object({
  email: z.string().min(1, { message: "Please enter an email" }).email({ message: "Please enter a valid email" }),
  phone: z.string(),
});

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, { message: "Please enter your current password" }),
    new_password: z
      .string()
      .min(1, { message: "Please enter a new password" })
      .min(6, { message: "Password must be at least 6 characters long" }),
    confirm_password: z.string(),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Passwords don't match.",
    path: ["confirm_password"],
  });

export type UpdateProfileFormValues = z.infer<typeof updateProfileSchema>;
export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;
