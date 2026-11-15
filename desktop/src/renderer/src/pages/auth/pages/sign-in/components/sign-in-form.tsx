import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FieldError, Form, Input, Label } from "@heroui/react";
import { cn } from "@/lib/utils";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { useSignin } from "@/features/auth/hooks/use-auth";
import { SignInSchema, type SignInFormValues } from "../../../validation-schemas/auth";

interface SignInFormProps {
  className?: string;
}

export function SignInForm({ className }: SignInFormProps) {
  const { mutate, isPending } = useSignin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInFormValues>({
    resolver: zodResolver(SignInSchema),
    defaultValues: { email: "", password: "" },
  });

  return (
    <Form onSubmit={handleSubmit((data) => mutate(data))} className={cn("grid gap-4 text-left", className)}>
      <div className="flex flex-col gap-1">
        <Label htmlFor="signin-email">Email</Label>
        <Input id="signin-email" {...register("email")} placeholder="you@company.com" type="email" fullWidth />
        {errors.email && <FieldError>{errors.email.message}</FieldError>}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="signin-password">Password</Label>
        <Input id="signin-password" {...register("password")} placeholder="********" type="password" fullWidth />
        {errors.password && <FieldError>{errors.password.message}</FieldError>}
      </div>

      <ActionButtonWithPending type="submit" isDisabled={isPending} isPending={isPending} fullWidth className="mt-2">
        Sign in
      </ActionButtonWithPending>
    </Form>
  );
}
