import type { FC } from "react";
import { Link } from "react-router-dom";
import { Card } from "@heroui/react";
import { SignInForm } from "./components/sign-in-form";
import { Routes } from "@/routes/routes";

const Login: FC = () => {
  return (
    <Card className="w-full max-w-md mx-auto p-8">
      <div className="flex flex-col gap-1 text-left mb-6">
        <p className="text-2xl font-semibold">Login</p>
        <p className="text-sm text-muted">
          Enter your email and password below to log into your account
        </p>
      </div>

      <SignInForm />

      <div className="text-center text-sm mt-4 text-muted">
        <Link to={Routes.auth.forgot_password} className="underline underline-offset-4 hover:opacity-80">
          Forgot password?
        </Link>
      </div>
    </Card>
  );
};

export default Login;
