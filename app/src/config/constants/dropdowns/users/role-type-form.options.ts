import {
  RoleTypes,
  type RoleType,
} from "@/features/user/interfaces/user.interface";

export const RoleTypeFormOptions: { id: RoleType; label: string }[] = [
  { id: RoleTypes.USER, label: "User" },
  { id: RoleTypes.ADMIN, label: "Admin" },
  { id: RoleTypes.SUPER_ADMIN, label: "Super admin" },
  { id: RoleTypes.SUPPORT, label: "Support" },
];
