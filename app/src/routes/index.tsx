import { Routes as ReactRoutes, Route, Navigate } from "react-router-dom";
import { Routes } from "@/routes/routes";
import ProtectedRoute from "@/routes/protected-route";
import SignIn from "@/pages/auth/pages/sign-in";
import SignUp from "@/pages/auth/pages/sign-up";
import AuthLayout from "@/pages/auth/layout";
import DashboardLayout from "@/pages/dashboard/layout";
import DashboardHome from "@/pages/dashboard";
import AdminLayout from "@/pages/admin/layout";
import AdminHome from "@/pages/admin";
import AgenciesListPage from "@/pages/admin/agencies";
import AgencyDetailPage from "@/pages/admin/agencies/detail";
import ScrapersListPage from "@/pages/admin/scrapers";
import ScraperDetailPage from "@/pages/admin/scrapers/detail";
import GenerationRunsListPage from "@/pages/admin/generation-runs";
import GenerationRunDetailPage from "@/pages/admin/generation-runs/detail";
import { RoleTypes } from "@/features/user/interfaces/user.interface";

export default function AppRoutes() {
  return (
    <ReactRoutes>
      {/* Auth routes */}
      <Route
        path="/auth"
        element={
          <ProtectedRoute loggedIn={false}>
            <AuthLayout />
          </ProtectedRoute>
        }
      >
        <Route path="sign-up" element={<SignUp />} />
        <Route path="sign-in" element={<SignIn />} />
        <Route index element={<Navigate to={Routes.auth.sign_in} replace />} />
      </Route>

      {/* Dashboard routes */}
      <Route
        path="/dashboard/*"
        element={
          <ProtectedRoute loggedIn={true}>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardHome />} />
      </Route>

      {/* Admin routes */}
      <Route
        path="/admin/*"
        element={
          <ProtectedRoute loggedIn={true}>
            <ProtectedRoute
              requiredRoles={[RoleTypes.ADMIN, RoleTypes.SUPER_ADMIN, RoleTypes.SUPPORT]}
              fallbackPath={Routes.dashboard.root}
            >
              <AdminLayout />
            </ProtectedRoute>
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminHome />} />
        <Route path="agencies" element={<AgenciesListPage />} />
        <Route path="agencies/:id" element={<AgencyDetailPage />} />
        <Route path="scrapers" element={<ScrapersListPage />} />
        <Route path="scrapers/:id" element={<ScraperDetailPage />} />
        <Route path="generation-runs" element={<GenerationRunsListPage />} />
        <Route path="generation-runs/:id" element={<GenerationRunDetailPage />} />
      </Route>

      {/* Default redirect */}
      <Route path="/" element={<Navigate to={Routes.auth.sign_in} replace />} />

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </ReactRoutes>
  );
}
