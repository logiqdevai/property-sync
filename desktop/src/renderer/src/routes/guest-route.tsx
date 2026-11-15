import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { isTokenExpired } from "@/lib/token";
import { Routes } from "./routes";

export function GuestRoute() {
  const { isLoggedIn, expires_in } = useAuthStore();
  const signedIn = isLoggedIn && !(expires_in && isTokenExpired(expires_in));
  return signedIn ? <Navigate to={Routes.agencies} replace /> : <Outlet />;
}
