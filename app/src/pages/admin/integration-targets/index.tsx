import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Table,
  Select,
  ListBox,
  Modal,
  Pagination,
  Switch,
  useOverlayState,
} from "@heroui/react";
import { Plus } from "lucide-react";
import { Routes } from "@/routes/routes";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { IntegrationTargetForm } from "@/features/integration-targets/components/integration-target-form";
import {
  useCreateIntegrationTarget,
  useIntegrationTargets,
  useUpdateIntegrationTargetVisibility,
} from "@/features/integration-targets/hooks/use-integration-targets";
import {
  AuthTypes,
  IntegrationTypes,
  type AuthType,
  type IntegrationTargetListQuery,
  type IntegrationType,
} from "@/features/integration-targets/interfaces/integration-targets.interfaces";

const integrationTypeFilterOptions: { id: IntegrationType | "all"; label: string }[] = [
  { id: "all", label: "All types" },
  { id: IntegrationTypes.ESTATEWEB, label: "EstateWeb" },
  { id: IntegrationTypes.OPENAI, label: "OpenAI" },
  { id: IntegrationTypes.ANTHROPIC, label: "Anthropic" },
  { id: IntegrationTypes.GEMINI, label: "Gemini" },
  { id: IntegrationTypes.DEEPSEEK, label: "DeepSeek" },
];

const authTypeFilterOptions: { id: AuthType | "all"; label: string }[] = [
  { id: "all", label: "All auth types" },
  { id: AuthTypes.API_KEY, label: "API key" },
  { id: AuthTypes.BEARER_TOKEN, label: "Bearer token" },
  { id: AuthTypes.EMAIL_PASSWORD, label: "Email + password" },
  { id: AuthTypes.USERNAME_PASSWORD, label: "Username + password" },
  { id: AuthTypes.OAUTH, label: "OAuth" },
];

const visibilityFilterOptions = [
  { id: "all", label: "All visibility" },
  { id: "true", label: "Visible" },
  { id: "false", label: "Hidden" },
];

export default function IntegrationTargetsListPage() {
  const navigate = useNavigate();
  const createModal = useOverlayState();

  const [integrationType, setIntegrationType] = useState<IntegrationType | "all">("all");
  const [authType, setAuthType] = useState<AuthType | "all">("all");
  const [visibility, setVisibility] = useState<"all" | "true" | "false">("all");
  const [page, setPage] = useState(1);

  const query = useMemo<IntegrationTargetListQuery>(
    () => ({
      page,
      limit: 20,
      ...(integrationType !== "all" && { integration_type: integrationType }),
      ...(authType !== "all" && { auth_type: authType }),
      ...(visibility !== "all" && { is_visible: visibility === "true" }),
    }),
    [page, integrationType, authType, visibility],
  );

  const { data, isPending } = useIntegrationTargets(query);
  const createTarget = useCreateIntegrationTarget();
  const updateVisibility = useUpdateIntegrationTargetVisibility();

  const targets = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-semibold tracking-tight text-foreground">Integration Targets</p>
          <p className="text-sm text-muted">
            CMS destinations and AI providers users can connect to.
          </p>
        </div>
        <ActionButtonWithPending onPress={createModal.open} idleLeading={<Plus className="h-4 w-4" />}>
          New target
        </ActionButtonWithPending>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          aria-label="Filter by integration type"
          selectedKey={integrationType}
          onSelectionChange={(key) => {
            setPage(1);
            setIntegrationType(key as IntegrationType | "all");
          }}
          className="w-44"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {integrationTypeFilterOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <Select
          aria-label="Filter by auth type"
          selectedKey={authType}
          onSelectionChange={(key) => {
            setPage(1);
            setAuthType(key as AuthType | "all");
          }}
          className="w-48"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {authTypeFilterOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <Select
          aria-label="Filter by visibility"
          selectedKey={visibility}
          onSelectionChange={(key) => {
            setPage(1);
            setVisibility(key as "all" | "true" | "false");
          }}
          className="w-40"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {visibilityFilterOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>

      {isPending ? (
        <TableSkeleton rows={8} columns={6} />
      ) : targets.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted">
          No integration targets found.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="Integration targets">
                <Table.Header>
                  <Table.Column isRowHeader>Type</Table.Column>
                  <Table.Column>Auth</Table.Column>
                  <Table.Column>Base URL</Table.Column>
                  <Table.Column>Multiple</Table.Column>
                  <Table.Column>Visible</Table.Column>
                  <Table.Column>Connections</Table.Column>
                </Table.Header>
                <Table.Body>
                  {targets.map((target) => (
                    <Table.Row
                      key={target.id}
                      id={target.id}
                      onAction={() => navigate(Routes.admin.integrationTargets.detail(target.id))}
                      className="cursor-pointer"
                    >
                      <Table.Cell>{target.integration_type}</Table.Cell>
                      <Table.Cell>{target.auth_type}</Table.Cell>
                      <Table.Cell>
                        <span className="text-sm text-muted truncate max-w-xs inline-block">
                          {target.base_url ?? "—"}
                        </span>
                      </Table.Cell>
                      <Table.Cell>{target.allow_multiple ? "Yes" : "No"}</Table.Cell>
                      <Table.Cell onClick={(event) => event.stopPropagation()}>
                        <Switch
                          isSelected={target.is_visible}
                          isDisabled={updateVisibility.isPending}
                          onChange={(next) =>
                            updateVisibility.mutate({ id: target.id, isVisible: next })
                          }
                        >
                          <Switch.Control>
                            <Switch.Thumb />
                          </Switch.Control>
                        </Switch>
                      </Table.Cell>
                      <Table.Cell>{target._count?.user_integrations ?? 0}</Table.Cell>
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

      <Modal state={createModal}>
        <Modal.Backdrop isDismissable={!createTarget.isPending}>
          <Modal.Container>
            <Modal.Dialog className="max-w-lg">
              <Modal.Header>
                <Modal.Heading>Create integration target</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <IntegrationTargetForm
                  submitLabel="Create"
                  isPending={createTarget.isPending}
                  onCancel={createModal.close}
                  onSubmit={(payload) =>
                    createTarget.mutate(payload, {
                      onSuccess: () => createModal.close(),
                    })
                  }
                />
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
