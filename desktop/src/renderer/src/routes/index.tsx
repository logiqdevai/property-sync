import { Navigate, Route, Routes as RouterRoutes } from "react-router-dom";
import AppLayout from "@/components/layout/app-layout";
import AuthLayout from "@/pages/auth/layout";
import SignInPage from "@/pages/auth/pages/sign-in";
import AgenciesPage from "@/pages/agencies";
import CrawlPage from "@/pages/crawl";
import PhotosPage from "@/pages/photos";
import { ProtectedRoute } from "./protected-route";
import { GuestRoute } from "./guest-route";
import { Routes } from "./routes";

export default function AppRoutes() {
  return (
    <RouterRoutes>
      <Route element={<GuestRoute />}>
        <Route element={<AuthLayout />}>
          <Route path={Routes.auth.sign_in} element={<SignInPage />} />
        </Route>
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path={Routes.agencies} element={<AgenciesPage />} />
          <Route path="/crawl/:scraperId" element={<CrawlPage />} />
          <Route path="/photos/:agencyId" element={<PhotosPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={Routes.agencies} replace />} />
    </RouterRoutes>
  );
}
