import type { FC } from "react";
import { Link } from "react-router-dom";
import { Card } from "@heroui/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, Label, Input, FieldError } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { Routes } from "@/routes/routes";
import { useForgotPassword } from "@/features/auth/hooks/use-auth";
import {
  forgotPasswordSchema,
  type ForgotPasswordFormValues,
} from "@/features/auth/validation-schemas/password.schema";

const ForgotPasswordPage: FC = () => {
  const { mutate, isPending, isSuccess } = useForgotPassword();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  return (
    <Card className="w-full max-w-md mx-auto p-8">
      <div className="flex flex-col gap-1 text-left mb-6">
        <p className="text-2xl font-semibold">Forgot password</p>
        {!isSuccess && (
          <p className="text-sm text-muted">
            Enter your email and we&apos;ll send you a link to set a new password.
          </p>
        )}
      </div>

      {isSuccess ? (
        <p className="text-sm text-muted">
          If an account exists for that email, a reset link has been sent.
        </p>
      ) : (
        <Form
          onSubmit={handleSubmit((values) => mutate(values.email))}
          className="grid gap-4 text-left"
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="forgot-password-email">Email</Label>
            <Input
              id="forgot-password-email"
              {...register("email")}
              placeholder="name@example.com"
              type="email"
              fullWidth
            />
            {errors.email && <FieldError>{errors.email.message}</FieldError>}
          </div>

          <ActionButtonWithPending type="submit" isPending={isPending} isDisabled={isPending} fullWidth>
            Send reset link
          </ActionButtonWithPending>
        </Form>
      )}

      <div className="text-center text-sm mt-4 text-muted">
        <Link to={Routes.auth.sign_in} className="underline underline-offset-4 hover:opacity-80">
          Back to sign in
        </Link>
      </div>
    </Card>
  );
};

export default ForgotPasswordPage;
