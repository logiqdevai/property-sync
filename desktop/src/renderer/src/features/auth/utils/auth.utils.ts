import type { LoggedInUser } from "@/features/user/interfaces/user.interface";

interface AuthResponse {
  access_token: string;
  expires_in: number;
  user: { id?: string; uuid?: string; email: string; full_name?: string | null; role?: LoggedInUser["role"] };
}

export const formatAuthUser = (data: AuthResponse): LoggedInUser => ({
  user_uuid: data.user.id ?? data.user.uuid ?? null,
  email: data.user.email,
  access_token: data.access_token,
  expires_in: data.expires_in,
  full_name: data.user.full_name ?? data.user.email?.split("@")[0] ?? "",
  role: data.user.role ?? null,
});
