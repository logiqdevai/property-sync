import type { RoleType } from "@/features/user/interfaces/user.interface";

export interface CurrentUser {
  id: string;
  email: string;
  phone: string | null;
  role: RoleType;
  created_at: string;
  updated_at: string;
}

export interface UpdateMePayload {
  email?: string;
  phone?: string | null;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

export interface ChangePasswordResponse {
  message: string;
}
