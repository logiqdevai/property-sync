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
import CrawlRunsListPage from "@/pages/admin/crawl-runs";
import CrawlRunDetailPage from "@/pages/admin/crawl-runs/detail";
import JobsListPage from "@/pages/admin/jobs";
import JobDetailPage from "@/pages/admin/jobs/detail";
import PropertiesListPage from "@/pages/admin/properties";
import PropertyDetailPage from "@/pages/admin/properties/detail";
import DashboardAgenciesPage from "@/pages/dashboard/agencies";
import DashboardPropertiesListPage from "@/pages/dashboard/properties";
import DashboardPropertyDetailPage from "@/pages/dashboard/properties/detail";
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
        <Route path="agencies" element={<DashboardAgenciesPage />} />
        <Route path="properties" element={<DashboardPropertiesListPage />} />
        <Route path="properties/:id" element={<DashboardPropertyDetailPage />} />
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
        <Route path="crawl-runs" element={<CrawlRunsListPage />} />
        <Route path="crawl-runs/:id" element={<CrawlRunDetailPage />} />
        <Route path="jobs" element={<JobsListPage />} />
        <Route path="jobs/:id" element={<JobDetailPage />} />
        <Route path="properties" element={<PropertiesListPage />} />
        <Route path="properties/:id" element={<PropertyDetailPage />} />
      </Route>

      {/* Default redirect */}
      <Route path="/" element={<Navigate to={Routes.auth.sign_in} replace />} />

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </ReactRoutes>
  );
}
