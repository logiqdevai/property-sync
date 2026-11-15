import { HashRouter } from "react-router-dom";
import { Toast } from "@heroui/react/toast";
import AppRoutes from "@/routes";
import QueryProvider from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { DesktopSessionSync } from "@/components/providers/desktop-session-sync";
import { TaskStateSync } from "@/components/providers/task-state-sync";

// HashRouter: the packaged app is served from a custom scheme where deep links can't be reloaded.
function App() {
  return (
    <HashRouter>
      <ThemeProvider>
        <QueryProvider>
          <DesktopSessionSync />
          <TaskStateSync />
          <div className="flex h-full w-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden">
            <div className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden">
              <AppRoutes />
            </div>
            <Toast.Provider placement="bottom end" />
          </div>
        </QueryProvider>
      </ThemeProvider>
    </HashRouter>
  );
}

export default App;
