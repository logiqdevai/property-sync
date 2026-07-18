import { z } from "zod";
import {
  UserPasswordSetupModes,
} from "@/config/constants/dropdowns/user-password-setup-form.options";

export const createUserSchema = z
  .object({
    email: z
      .string()
      .min(1, { message: "Please enter an email" })
      .email({ message: "Please enter a valid email" }),
    password_setup: z.enum([
      UserPasswordSetupModes.INVITE,
      UserPasswordSetupModes.MANUAL,
    ]),
    password: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.password_setup !== UserPasswordSetupModes.MANUAL) {
      return;
    }

    if (values.password.length < 6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "Password must be at least 6 characters",
      });
    }
  });

export type CreateUserFormValues = z.infer<typeof createUserSchema>;
