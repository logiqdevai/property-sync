import { useQuery } from "@tanstack/react-query";
import { getAdminUser, getAdminUsers } from "../services/admin-users.services";
import type { AdminUserListQuery } from "../interfaces/admin-users.interfaces";

export const useAdminUsers = (query: AdminUserListQuery) => {
  return useQuery({
    queryKey: ["adminUsers", "list", query],
    queryFn: () => getAdminUsers(query),
  });
};

export const useAdminUser = (id: string) => {
  return useQuery({
    queryKey: ["adminUsers", "detail", id],
    queryFn: () => getAdminUser(id),
    enabled: !!id,
  });
};
