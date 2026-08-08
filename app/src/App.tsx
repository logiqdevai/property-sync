import AppRoutes from "./routes";
import { BrowserRouter } from "react-router-dom";
import QueryProvider from "./components/providers/query-provider.tsx";
import { ThemeProvider } from "./components/providers/theme-provider.tsx";
import { Toast } from "@heroui/react/toast";
import { useDocumentScrollLock } from "./hooks/use-document-scroll-lock";

function App() {
  useDocumentScrollLock();

  return (
    <BrowserRouter>
      <ThemeProvider>
        <QueryProvider>
          <div className="flex h-full w-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden">
            <div className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden">
              <AppRoutes />
            </div>
            <Toast.Provider placement="bottom end" />
          </div>
        </QueryProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
