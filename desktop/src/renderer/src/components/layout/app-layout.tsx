import { Outlet } from "react-router-dom";
import { AppHeader } from "@/components/layout/app-header";
import { ActiveTaskBanner } from "@/components/layout/active-task-banner";

export default function AppLayout() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <AppHeader />
      <ActiveTaskBanner />
      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
