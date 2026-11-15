import type { FC } from "react";
import { Card } from "@heroui/react";
import { SignInForm } from "./components/sign-in-form";

const SignInPage: FC = () => {
  return (
    <Card className="mx-auto w-full max-w-md p-8">
      <div className="mb-6 flex flex-col gap-1 text-left">
        <p className="text-2xl font-semibold">Sign in</p>
        <p className="text-sm text-muted">Use the same email and password as the Property Sync website.</p>
      </div>
      <SignInForm />
    </Card>
  );
};

export default SignInPage;
