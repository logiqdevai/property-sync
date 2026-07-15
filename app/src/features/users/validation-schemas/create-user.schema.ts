import { z } from "zod";

export const createUserSchema = z.object({
  email: z.string().min(1, { message: "Please enter an email" }).email({ message: "Please enter a valid email" }),
});

export type CreateUserFormValues = z.infer<typeof createUserSchema>;
