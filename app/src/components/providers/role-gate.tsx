import type { ReactNode } from "react";
import { RoleTypes, type RoleType } from "@/features/user/interfaces/user.interface";
import { useAuthStore } from "@/stores/auth";

interface RoleGateProps {
  roles: RoleType[];
  children: ReactNode;
}

export function RoleGate({ roles, children }: RoleGateProps) {
  const role = useAuthStore((state) => state.role);

  if (role === RoleTypes.SUPER_ADMIN) {
    return <>{children}</>;
  }

  if (role && roles.includes(role)) {
    return <>{children}</>;
  }

  return null;
}
