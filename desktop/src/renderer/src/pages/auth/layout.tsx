import { Outlet } from "react-router-dom";
import { AppLogo } from "@/components/layout/app-logo";
import { environments } from "@/config/environments";

export default function AuthLayout() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <main className="flex min-h-0 flex-1 justify-center overflow-y-auto p-4 pt-16">
        <div className="w-full max-w-md space-y-6">
          <div className="flex items-center justify-center gap-2">
            <AppLogo className="h-9 w-9" />
            <span className="text-xl font-semibold text-foreground">{environments.APP_NAME}</span>
          </div>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
