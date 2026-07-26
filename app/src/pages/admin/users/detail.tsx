import { Link, useNavigate, useParams } from "react-router-dom";
import { Chip, Modal, Switch, Table, useOverlayState } from "@heroui/react";
import { Routes } from "@/routes/routes";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { RoleGate } from "@/components/providers/role-gate";
import {
  useAdminUser,
  useDeleteAdminUser,
  useSendAdminUserPasswordReset,
  useUpdateAdminUser,
} from "@/features/users/hooks/use-admin-users";
import { useUpdateIntegrationTargetAccount } from "@/features/integration-targets/hooks/use-integration-targets";
import {
  RoleTypes,
  type RoleType,
} from "@/features/user/interfaces/user.interface";
import { useAuthStore } from "@/stores/auth";
import { RoleTypeFilterOptions } from "@/config/constants/dropdowns/users/role-type-filter.options";
import { getDropdownOptionLabel } from "@/lib/dropdown-option-label.utils";
import { CredentialStatusIndicators } from "./components/integration-credential-fields";
import { EditUserForm } from "./components/edit-user-form";
import { getIntegrationTypeLabel } from "@/config/constants/dropdowns/integrations/integration-type-form.options";
import { getAuthTypeLabel } from "@/config/constants/dropdowns/integrations/auth-type-form.options";
import { formatDate } from "@/lib/date";
import { formatPrice } from "@/lib/price";

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
      {getDropdownOptionLabel(RoleTypeFilterOptions, role)}
    </Chip>
  );
}

export default function AdminUserDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const editModal = useOverlayState();
  const deleteConfirm = useOverlayState();
  const { data: user, isPending, refetch } = useAdminUser(id);
  const updateUser = useUpdateAdminUser();
  const deleteUser = useDeleteAdminUser();
  const updateIntegrationAccount = useUpdateIntegrationTargetAccount();
  const sendPasswordReset = useSendAdminUserPasswordReset();
  const currentUserId = useAuthStore((state) => state.user_uuid);
  const role = useAuthStore((state) => state.role);
  const isSelf = currentUserId === user?.id;
  const showAdminTrackerSettings =
    role === RoleTypes.ADMIN || role === RoleTypes.SUPER_ADMIN;

  if (isPending || !user) {
    return <DetailSkeleton fieldCount={6} showSubTable subTableRows={5} />;
  }

  const isSuperAdmin = user.role === RoleTypes.SUPER_ADMIN;
  const canDelete = !isSelf && !isSuperAdmin;
  const deleteDisabledReason = isSelf
    ? "You cannot delete your own account"
    : isSuperAdmin
      ? "Super admin accounts cannot be deleted"
      : null;

  const handleToggleIntegration = async (
    targetId: string,
    userIntegrationId: string,
    isActive: boolean,
  ) => {
    await updateIntegrationAccount.mutateAsync({
      targetId,
      userIntegrationId,
      payload: { is_active: isActive },
    });
    await refetch();
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link to={Routes.admin.users.list} className="text-sm text-muted hover:text-foreground">
          ← Users
        </Link>
        <div className="flex items-start justify-between gap-4 mt-2 flex-wrap">
          <div>
            <p className="text-2xl font-semibold tracking-tight text-foreground">{user.email}</p>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <RoleBadge role={user.role} />
              <span className="text-sm text-muted">Joined {formatDate(user.created_at)}</span>
              {user.phone && <span className="text-sm text-muted">{user.phone}</span>}
              <RoleGate roles={[RoleTypes.ADMIN, RoleTypes.SUPER_ADMIN]}>
                <ActionButtonWithPending
                  size="sm"
                  variant="secondary"
                  isPending={sendPasswordReset.isPending}
                  isDisabled={sendPasswordReset.isPending}
                  onPress={() => sendPasswordReset.mutate(user.id)}
                >
                  Send password reset
                </ActionButtonWithPending>
              </RoleGate>
            </div>
          </div>
          <RoleGate roles={[RoleTypes.ADMIN, RoleTypes.SUPER_ADMIN]}>
            <div className="flex items-center gap-2">
              <ActionButtonWithPending variant="secondary" onPress={editModal.open}>
                Edit
              </ActionButtonWithPending>
              <div className="flex flex-col items-end gap-1">
                <ActionButtonWithPending
                  variant="danger"
                  isDisabled={!canDelete}
                  onPress={deleteConfirm.open}
                >
                  Delete
                </ActionButtonWithPending>
                {deleteDisabledReason && (
                  <span className="text-xs text-muted">{deleteDisabledReason}</span>
                )}
              </div>
            </div>
          </RoleGate>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">Tracked agencies</h2>
        {user.tracked_agencies.length === 0 ? (
          <p className="text-sm text-muted">No tracked agencies.</p>
        ) : (
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <Table>
              <Table.ScrollContainer>
                <Table.Content aria-label="Tracked agencies">
                  <Table.Header>
                    <Table.Column isRowHeader>Agency</Table.Column>
                    <Table.Column>Status</Table.Column>
                    <Table.Column>New</Table.Column>
                    <Table.Column>Updated</Table.Column>
                    <Table.Column>Removed</Table.Column>
                    <Table.Column>AI batch</Table.Column>
                    {showAdminTrackerSettings && (
                      <>
                        <Table.Column>Concurrent insertions</Table.Column>
                        <Table.Column>Insertion interval (sec)</Table.Column>
                      </>
                    )}
                  </Table.Header>
                  <Table.Body>
                    {user.tracked_agencies.map((tracking) => (
                      <Table.Row key={tracking.id}>
                        <Table.Cell>
                          <Link
                            to={Routes.admin.agencies.detail(tracking.source_agency.id)}
                            className="text-accent hover:underline"
                          >
                            {tracking.source_agency.name}
                          </Link>
                        </Table.Cell>
                        <Table.Cell>
                          <Chip size="sm" variant="soft" color={tracking.enabled ? "success" : "default"}>
                            {tracking.enabled ? "Enabled" : "Disabled"}
                          </Chip>
                        </Table.Cell>
                        <Table.Cell>{tracking.track_new_listings ? "Yes" : "No"}</Table.Cell>
                        <Table.Cell>{tracking.track_updated_listings ? "Yes" : "No"}</Table.Cell>
                        <Table.Cell>{tracking.track_removed_listings ? "Yes" : "No"}</Table.Cell>
                        <Table.Cell>{tracking.use_ai_batching ? "Yes" : "No"}</Table.Cell>
                        {showAdminTrackerSettings && (
                          <>
                            <Table.Cell>{tracking.concurrent_insertions}</Table.Cell>
                            <Table.Cell>{tracking.insertion_interval_seconds}</Table.Cell>
                          </>
                        )}
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">Saved properties</h2>
        {user.saved_properties.length === 0 ? (
          <p className="text-sm text-muted">No saved properties.</p>
        ) : (
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <Table>
              <Table.ScrollContainer>
                <Table.Content aria-label="Saved properties">
                  <Table.Header>
                    <Table.Column isRowHeader>Title</Table.Column>
                    <Table.Column>Property ID</Table.Column>
                    <Table.Column>Internal ID</Table.Column>
                    <Table.Column>City</Table.Column>
                    <Table.Column>Price</Table.Column>
                    <Table.Column>Status</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {user.saved_properties.map((property) => (
                      <Table.Row key={property.id}>
                        <Table.Cell>
                          <Link
                            to={Routes.admin.properties.detail(property.canonical_property_id)}
                            className="text-accent hover:underline"
                          >
                            {property.title}
                          </Link>
                        </Table.Cell>
                        <Table.Cell>{property.property_id}</Table.Cell>
                        <Table.Cell>{property.internal_id ?? "—"}</Table.Cell>
                        <Table.Cell>{property.city ?? "—"}</Table.Cell>
                        <Table.Cell>
                          {formatPrice(property.price, property.currency)}
                        </Table.Cell>
                        <Table.Cell>{property.status}</Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">Integration connections</h2>
        {user.user_integrations.length === 0 ? (
          <p className="text-sm text-muted">No integration connections.</p>
        ) : (
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <Table>
              <Table.ScrollContainer>
                <Table.Content aria-label="Integration connections">
                  <Table.Header>
                    <Table.Column isRowHeader>Target</Table.Column>
                    <Table.Column>Credentials</Table.Column>
                    <Table.Column>Active</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {user.user_integrations.map((integration) => (
                      <Table.Row key={integration.id}>
                        <Table.Cell>
                          <Link
                            to={Routes.admin.integrationTargets.detail(integration.integration_target_id)}
                            className="text-accent hover:underline"
                          >
                            {getIntegrationTypeLabel(integration.integration_target.integration_type)}
                          </Link>
                          <p className="text-xs text-muted">
                            {getAuthTypeLabel(integration.integration_target.auth_type)}
                          </p>
                        </Table.Cell>
                        <Table.Cell>
                          <CredentialStatusIndicators
                            hasApiKey={integration.has_api_key_secret}
                            hasPassword={integration.has_password}
                            hasConfig={integration.has_config}
                            email={integration.email}
                            username={integration.username}
                          />
                        </Table.Cell>
                        <Table.Cell>
                          <Switch
                            isSelected={integration.is_active}
                            onChange={(checked) =>
                              handleToggleIntegration(
                                integration.integration_target_id,
                                integration.id,
                                checked,
                              )
                            }
                            isDisabled={updateIntegrationAccount.isPending}
                          />
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </div>
        )}
      </section>

      <RoleGate roles={[RoleTypes.ADMIN, RoleTypes.SUPER_ADMIN]}>
        <Modal state={editModal}>
          <Modal.Backdrop isDismissable={!updateUser.isPending}>
            <Modal.Container>
              <Modal.Dialog className="max-w-lg">
                <Modal.Header>
                  <Modal.Heading>Edit user</Modal.Heading>
                </Modal.Header>
                <Modal.Body>
                  <EditUserForm
                    isSelf={isSelf}
                    submitLabel="Save changes"
                    isPending={updateUser.isPending}
                    onCancel={editModal.close}
                    defaultValues={{
                      email: user.email,
                      phone: user.phone ?? "",
                      role: user.role,
                      password: "",
                    }}
                    onSubmit={(payload) =>
                      updateUser.mutate(
                        { id: user.id, payload },
                        {
                          onSuccess: () => {
                            editModal.close();
                            void refetch();
                          },
                        },
                      )
                    }
                  />
                </Modal.Body>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>

        <ConfirmationDialog
          state={deleteConfirm}
          title="Delete this user?"
          description="This will permanently remove the user and all related tracked agencies, saved properties, and integration connections."
          confirmLabel="Delete"
          isPending={deleteUser.isPending}
          onConfirm={() =>
            deleteUser.mutateAsync(user.id).then(() => navigate(Routes.admin.users.list))
          }
        />
      </RoleGate>
    </div>
  );
}
