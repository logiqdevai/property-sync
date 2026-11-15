import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { isTokenExpired } from "@/lib/token";
import { canUseCrawler } from "@/features/user/interfaces/user.interface";
import { Routes } from "./routes";

export function ProtectedRoute() {
  const { isLoggedIn, expires_in, role } = useAuthStore();
  const valid = isLoggedIn && canUseCrawler(role) && !(expires_in && isTokenExpired(expires_in));
  return valid ? <Outlet /> : <Navigate to={Routes.auth.sign_in} replace />;
}
