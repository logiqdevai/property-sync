import type { FC } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, Skeleton } from "@heroui/react";
import { useQuery } from "@tanstack/react-query";
import { Routes } from "@/routes/routes";
import { SetPasswordForm } from "@/features/auth/components/set-password-form";
import { useResetPassword } from "@/features/auth/hooks/use-auth";
import { validatePasswordResetToken } from "@/features/auth/services/auth";

const SetPasswordPage: FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const resetPassword = useResetPassword();

  const { isPending: isValidating, isError } = useQuery({
    queryKey: ["passwordResetToken", token],
    queryFn: () => validatePasswordResetToken(token),
    enabled: !!token,
    retry: false,
  });

  if (!token) {
    return (
      <Card className="w-full max-w-md mx-auto p-8 text-sm text-muted">
        This password link is missing a token.{" "}
        <Link to={Routes.auth.forgot_password} className="underline underline-offset-4 hover:opacity-80">
          Request a new one
        </Link>
        .
      </Card>
    );
  }

  if (isValidating) {
    return (
      <Card className="w-full max-w-md mx-auto p-8">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-4 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg ml-auto" />
        </div>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="w-full max-w-md mx-auto p-8 text-sm text-muted">
        This password link is invalid or has expired.{" "}
        <Link to={Routes.auth.forgot_password} className="underline underline-offset-4 hover:opacity-80">
          Request a new one
        </Link>
        .
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto p-8">
      <div className="flex flex-col gap-1 text-left mb-6">
        <p className="text-2xl font-semibold">Set your password</p>
        <p className="text-sm text-muted">Choose a password for your account.</p>
      </div>

      <SetPasswordForm
        submitLabel="Save password"
        isPending={resetPassword.isPending}
        onSubmit={({ password }) => resetPassword.mutate({ token, password })}
      />

      <div className="text-center text-sm mt-4 text-muted">
        <Link to={Routes.auth.sign_in} className="underline underline-offset-4 hover:opacity-80">
          Back to sign in
        </Link>
      </div>
    </Card>
  );
};

export default SetPasswordPage;
