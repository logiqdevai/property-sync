import { z } from "zod";
import { RoleTypes } from "@/features/user/interfaces/user.interface";

export const updateUserSchema = z.object({
  email: z.string().min(1, { message: "Please enter an email" }).email({ message: "Please enter a valid email" }),
  phone: z.string(),
  role: z.enum([
    RoleTypes.USER,
    RoleTypes.ADMIN,
    RoleTypes.SUPER_ADMIN,
    RoleTypes.SUPPORT,
  ]),
  password: z
    .string()
    .refine((value) => value === "" || value.length >= 6, {
      message: "Password must be at least 6 characters",
    }),
});

export type UpdateUserFormValues = z.infer<typeof updateUserSchema>;
