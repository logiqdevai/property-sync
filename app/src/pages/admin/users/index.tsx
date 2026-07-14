import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Table, Chip, Select, ListBox, Input, Pagination } from "@heroui/react";
import { Search } from "lucide-react";
import { Routes } from "@/routes/routes";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { useAdminUsers } from "@/features/users/hooks/use-admin-users";
import {
  RoleTypes,
  type RoleType,
} from "@/features/user/interfaces/user.interface";
import type { AdminUserListQuery } from "@/features/users/interfaces/admin-users.interfaces";
import { RoleTypeFilterOptions } from "@/config/constants/dropdowns/role-type-filter.options";
import { formatDate } from "@/lib/date";

function RoleBadge({ role }: { role: RoleType }) {
  const color =
    role === RoleTypes.SUPER_ADMIN
      ? "accent"
      : role === RoleTypes.ADMIN
        ? "warning"
        : role === RoleTypes.SUPPORT
          ? "default"
          : "success";

  return (
    <Chip size="sm" variant="soft" color={color}>
      {role.replace("_", " ")}
    </Chip>
  );
}

export default function AdminUsersListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<RoleType | "all">("all");
  const [page, setPage] = useState(1);

  const query = useMemo<AdminUserListQuery>(
    () => ({
      page,
      limit: 20,
      ...(search && { search }),
      ...(role !== "all" && { role }),
    }),
    [page, search, role],
  );

  const { data, isPending } = useAdminUsers(query);
  const users = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-2xl font-semibold tracking-tight text-foreground">Users</p>
        <p className="text-sm text-muted">Browse user accounts and their platform footprint.</p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Search by email or phone"
            className="pl-9"
            fullWidth
          />
        </div>

        <Select
          aria-label="Filter by role"
          selectedKey={role}
          onSelectionChange={(key) => {
            setPage(1);
            setRole(key as RoleType | "all");
          }}
          className="w-44"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {RoleTypeFilterOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>

      {isPending ? (
        <TableSkeleton columns={4} rows={8} />
      ) : users.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted">
          No users found.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="Users">
                <Table.Header>
                  <Table.Column isRowHeader>Email</Table.Column>
                  <Table.Column>Role</Table.Column>
                  <Table.Column>Phone</Table.Column>
                  <Table.Column>Joined</Table.Column>
                </Table.Header>
                <Table.Body>
                  {users.map((user) => (
                    <Table.Row
                      key={user.id}
                      id={user.id}
                      onAction={() => navigate(Routes.admin.users.detail(user.id))}
                      className="cursor-pointer"
                    >
                      <Table.Cell>{user.email}</Table.Cell>
                      <Table.Cell>
                        <RoleBadge role={user.role} />
                      </Table.Cell>
                      <Table.Cell>{user.phone ?? "—"}</Table.Cell>
                      <Table.Cell>{formatDate(user.created_at)}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </div>
      )}

      {pagination && pagination.total_pages > 1 && (
        <Pagination>
          <Pagination.Content>
            <Pagination.Item>
              <Pagination.Previous
                isDisabled={!pagination.has_prev}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Pagination.Previous>
            </Pagination.Item>
            <Pagination.Item>
              <Pagination.Summary>
                Page {pagination.page} of {pagination.total_pages}
              </Pagination.Summary>
            </Pagination.Item>
            <Pagination.Item>
              <Pagination.Next
                isDisabled={!pagination.has_next}
                onPress={() => setPage((p) => p + 1)}
              >
                Next
              </Pagination.Next>
            </Pagination.Item>
          </Pagination.Content>
        </Pagination>
      )}
    </div>
  );
}
