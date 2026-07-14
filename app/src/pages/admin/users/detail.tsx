import { Link, useParams } from "react-router-dom";
import { Chip, Switch, Table } from "@heroui/react";
import { Routes } from "@/routes/routes";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { useAdminUser } from "@/features/users/hooks/use-admin-users";
import { useUpdateIntegrationTargetAccount } from "@/features/integration-targets/hooks/use-integration-targets";
import {
  RoleTypes,
  type RoleType,
} from "@/features/user/interfaces/user.interface";
import { CredentialStatusIndicators } from "@/features/user-integrations/components/integration-credential-fields";
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

export default function AdminUserDetailPage() {
  const { id = "" } = useParams();
  const { data: user, isPending, refetch } = useAdminUser(id);
  const updateIntegrationAccount = useUpdateIntegrationTargetAccount();

  if (isPending || !user) {
    return <DetailSkeleton fieldCount={6} showSubTable subTableRows={5} />;
  }

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
        <p className="text-2xl font-semibold tracking-tight text-foreground mt-2">{user.email}</p>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <RoleBadge role={user.role} />
          <span className="text-sm text-muted">Joined {formatDate(user.created_at)}</span>
          {user.phone && <span className="text-sm text-muted">{user.phone}</span>}
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
                    <Table.Column>City</Table.Column>
                    <Table.Column>Price</Table.Column>
                    <Table.Column>Status</Table.Column>
                    <Table.Column>Edited</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {user.saved_properties.map((property) => (
                      <Table.Row key={property.id}>
                        <Table.Cell>
                          <Link
                            to={Routes.admin.properties.detail(property.property_id)}
                            className="text-accent hover:underline"
                          >
                            {property.title}
                          </Link>
                        </Table.Cell>
                        <Table.Cell>{property.city ?? "—"}</Table.Cell>
                        <Table.Cell>
                          {property.price != null
                            ? `${property.currency ?? ""} ${property.price}`.trim()
                            : "—"}
                        </Table.Cell>
                        <Table.Cell>{property.status}</Table.Cell>
                        <Table.Cell>
                          {property.is_modified ? (
                            <Chip size="sm" variant="soft" color="warning">
                              Edited
                            </Chip>
                          ) : (
                            "—"
                          )}
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
                            {integration.integration_target.integration_type}
                          </Link>
                          <p className="text-xs text-muted">{integration.integration_target.auth_type}</p>
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
    </div>
  );
}
