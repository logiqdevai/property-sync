import { Link } from "react-router-dom";
import { Button, Tooltip } from "@heroui/react";
import { LogOut, Moon, Sun } from "lucide-react";
import { AppLogo } from "@/components/layout/app-logo";
import { useThemeContext } from "@/components/providers/theme-provider";
import { environments } from "@/config/environments";
import { Routes } from "@/routes/routes";
import { useAuthStore } from "@/stores/auth";
import { useGetAppInfo } from "@/features/desktop-app/hooks/use-desktop-app";

export function AppHeader() {
  const { theme, toggleTheme } = useThemeContext();
  const email = useAuthStore((s) => s.email);
  const logout = useAuthStore((s) => s.logout);
  const { data: appInfo } = useGetAppInfo();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-5">
      <Link to={Routes.agencies} className="flex items-center gap-2">
        <AppLogo className="h-6 w-6" />
        <span className="font-semibold text-foreground">{environments.APP_NAME}</span>
        {appInfo ? <span className="text-xs text-muted">v{appInfo.version}</span> : null}
      </Link>
      <div className="flex items-center gap-1">
        {email ? <span className="mr-2 hidden text-sm text-muted sm:inline">{email}</span> : null}
        <Tooltip delay={300}>
          <Tooltip.Trigger>
            <Button isIconOnly variant="ghost" size="sm" aria-label="Switch theme" onPress={toggleTheme}>
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content className="px-2 py-1 text-xs">Switch light / dark</Tooltip.Content>
        </Tooltip>
        <Tooltip delay={300}>
          <Tooltip.Trigger>
            <Button isIconOnly variant="ghost" size="sm" aria-label="Sign out" onPress={logout}>
              <LogOut className="size-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content className="px-2 py-1 text-xs">Sign out</Tooltip.Content>
        </Tooltip>
      </div>
    </header>
  );
}
