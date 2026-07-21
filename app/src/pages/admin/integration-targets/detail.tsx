import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Pencil, Settings } from "lucide-react";
import { Form, Input, Label, Modal, Switch, Table, useOverlayState } from "@heroui/react";
import { useForm } from "react-hook-form";
import { Routes } from "@/routes/routes";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { TableRowActionsMenu } from "@/components/ui/table-row-actions-menu";
import { IntegrationTargetForm } from "./components/integration-target-form";
import {
  useCreateIntegrationTargetAccount,
  useDeleteIntegrationTarget,
  useIntegrationTarget,
  useUpdateIntegrationTarget,
  useUpdateIntegrationTargetAccount,
} from "@/features/integration-targets/hooks/use-integration-targets";
import {
  IntegrationTypes,
  type MaskedUserIntegration,
} from "@/features/integration-targets/interfaces/integration-targets.interfaces";
import {
  CredentialStatusIndicators,
  IntegrationCredentialFields,
} from "./components/integration-credential-fields";
import {
  getConnectCredentialsSchema,
  getEditFormDefaultValues,
  mapConnectFormToPayload,
  mapEditFormToPayload,
  type ConnectCredentialsFormValues,
} from "@/features/user-integrations/validation-schemas/user-integrations.schema";
import { getIntegrationTypeLabel } from "@/config/constants/dropdowns/integration-type-form.options";
import { getAuthTypeLabel } from "@/config/constants/dropdowns/auth-type-form.options";
import { IntegrationTargetSettingsModal } from "./components/integration-target-settings-modal";

type AddAccountFormValues = ConnectCredentialsFormValues & { user_id: string };

export default function IntegrationTargetDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const deleteConfirm = useOverlayState();
  const addAccountModal = useOverlayState();
  const editAccountModal = useOverlayState();
  const settingsModal = useOverlayState();

  const [editingAccount, setEditingAccount] = useState<MaskedUserIntegration | null>(null);
  const [configuringAccount, setConfiguringAccount] = useState<MaskedUserIntegration | null>(
    null,
  );

  const { data: target, isPending } = useIntegrationTarget(id);
  const updateTarget = useUpdateIntegrationTarget();
  const deleteTarget = useDeleteIntegrationTarget();
  const createAccount = useCreateIntegrationTargetAccount();
  const updateAccount = useUpdateIntegrationTargetAccount();

  const addAccountForm = useForm<AddAccountFormValues>();

  const editAccountForm = useForm<ConnectCredentialsFormValues>();

  useEffect(() => {
    if (!target) {
      return;
    }

    addAccountForm.reset({
      user_id: "",
      auth_type: target.auth_type,
    } as AddAccountFormValues);
  }, [target, addAccountForm]);

  useEffect(() => {
    if (!target || !editingAccount) {
      return;
    }

    editAccountForm.reset(
      getEditFormDefaultValues(target.auth_type, {
        email: editingAccount.email,
        username: editingAccount.username,
        password: editingAccount.password,
        api_key_secret: editingAccount.api_key_secret,
      }),
    );
  }, [target, editingAccount, editAccountForm]);

  if (isPending || !target) {
    return <DetailSkeleton fieldCount={6} showSubTable subTableRows={5} />;
  }

  const openEditAccount = (account: MaskedUserIntegration) => {
    setEditingAccount(account);
    editAccountModal.open();
  };

  const openConfigureAccount = (account: MaskedUserIntegration) => {
    setConfiguringAccount(account);
    settingsModal.open();
  };

  const handleDelete = async () => {
    await deleteTarget.mutateAsync(id);
    navigate(Routes.admin.integrationTargets.list);
  };

  const submitAddAccount = addAccountForm.handleSubmit((values) => {
    const credentialSchema = getConnectCredentialsSchema(target.auth_type);
    const parsedCredentials = credentialSchema.parse(values);
    const { integration_target_id: _ignored, ...credentials } = mapConnectFormToPayload(
      target.id,
      parsedCredentials,
    );

    createAccount.mutate(
      {
        targetId: id,
        payload: {
          user_id: values.user_id,
          ...credentials,
        },
      },
      { onSuccess: () => addAccountModal.close() },
    );
  });

  const submitEditAccount = editAccountForm.handleSubmit((values) => {
    if (!editingAccount) {
      return;
    }

    updateAccount.mutate(
      {
        targetId: id,
        userIntegrationId: editingAccount.id,
        payload: mapEditFormToPayload({ ...values, auth_type: target.auth_type }),
      },
      {
        onSuccess: () => {
          editAccountModal.close();
          setEditingAccount(null);
        },
      },
    );
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to={Routes.admin.integrationTargets.list}
            className="text-sm text-muted hover:text-foreground"
          >
            Back to integration targets
          </Link>
          <p className="text-2xl font-semibold tracking-tight text-foreground mt-2">
            {getIntegrationTypeLabel(target.integration_type)}
          </p>
          <p className="text-sm text-muted">
            {getAuthTypeLabel(target.auth_type)}
            {target.base_url ? ` · ${target.base_url}` : ""}
          </p>
        </div>
        <ActionButtonWithPending variant="danger" onPress={deleteConfirm.open}>
          Delete target
        </ActionButtonWithPending>
      </div>

      <section className="rounded-xl border border-border bg-surface p-6 flex flex-col gap-4">
        <p className="text-lg font-medium text-foreground">Target settings</p>
        <IntegrationTargetForm
          defaultValues={{
            integration_type: target.integration_type,
            auth_type: target.auth_type,
            base_url: target.base_url ?? "",
            allow_multiple: target.allow_multiple,
            is_visible: target.is_visible,
            is_enabled: target.is_enabled,
          }}
          submitLabel="Save changes"
          isPending={updateTarget.isPending}
          onSubmit={(payload) => updateTarget.mutate({ id, payload })}
        />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-medium text-foreground">Connected accounts</p>
            <p className="text-sm text-muted">{target.user_integrations_count} total</p>
          </div>
          <ActionButtonWithPending onPress={addAccountModal.open}>Add account</ActionButtonWithPending>
        </div>

        {target.user_integrations.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-muted">
            No user connections yet.
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <Table>
              <Table.ScrollContainer>
                <Table.Content aria-label="Connected accounts">
                  <Table.Header>
                    <Table.Column isRowHeader>User</Table.Column>
                    <Table.Column>Credentials</Table.Column>
                    <Table.Column>Active</Table.Column>
                    <Table.Column>Actions</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {target.user_integrations.map((account) => (
                      <Table.Row key={account.id} id={account.id}>
                        <Table.Cell>
                          <div className="flex flex-col">
                            <span className="font-medium">{account.user?.email ?? account.user_id}</span>
                            <span className="text-xs text-muted">{account.user_id}</span>
                          </div>
                        </Table.Cell>
                        <Table.Cell>
                          <CredentialStatusIndicators
                            hasApiKey={account.has_api_key_secret}
                            hasPassword={account.has_password}
                            hasConfig={account.has_config}
                            email={account.email}
                            username={account.username}
                          />
                        </Table.Cell>
                        <Table.Cell>
                          <Switch
                            isSelected={account.is_active}
                            isDisabled={updateAccount.isPending}
                            onChange={(next) =>
                              updateAccount.mutate({
                                targetId: id,
                                userIntegrationId: account.id,
                                payload: { is_active: next },
                              })
                            }
                          >
                            <Switch.Control>
                              <Switch.Thumb />
                            </Switch.Control>
                          </Switch>
                        </Table.Cell>
                        <Table.Cell>
                          <TableRowActionsMenu
                            actions={[
                              {
                                id: "edit",
                                label: "Edit",
                                icon: Pencil,
                                isDisabled: updateAccount.isPending,
                              },
                              ...(target.integration_type === IntegrationTypes.ESTATEWEB
                                ? [
                                    {
                                      id: "configure",
                                      label: "Configure",
                                      icon: Settings,
                                    },
                                  ]
                                : []),
                            ]}
                            onAction={(actionId) =>
                              actionId === "configure"
                                ? openConfigureAccount(account)
                                : openEditAccount(account)
                            }
                            ariaLabel={`Actions for ${account.user?.email ?? account.user_id}`}
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

      <ConfirmationDialog
        state={deleteConfirm}
        title="Delete integration target?"
        description="This only works when no user connections exist."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        isPending={deleteTarget.isPending}
      />

      <Modal state={addAccountModal}>
        <Modal.Backdrop isDismissable={!createAccount.isPending}>
          <Modal.Container>
            <Modal.Dialog className="max-w-lg">
              <Modal.Header>
                <Modal.Heading>Add user connection</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <Form onSubmit={submitAddAccount} className="grid gap-4">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="account-user-id">User ID</Label>
                    <Input id="account-user-id" {...addAccountForm.register("user_id")} fullWidth />
                  </div>
                  <IntegrationCredentialFields
                    authType={target.auth_type}
                    register={addAccountForm.register}
                    errors={addAccountForm.formState.errors}
                  />
                  <div className="flex justify-end gap-2">
                    <ActionButtonWithPending
                      type="button"
                      variant="secondary"
                      onPress={addAccountModal.close}
                      isDisabled={createAccount.isPending}
                    >
                      Cancel
                    </ActionButtonWithPending>
                    <ActionButtonWithPending type="submit" isPending={createAccount.isPending}>
                      Add connection
                    </ActionButtonWithPending>
                  </div>
                </Form>
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal state={editAccountModal}>
        <Modal.Backdrop isDismissable={!updateAccount.isPending}>
          <Modal.Container>
            <Modal.Dialog className="max-w-lg">
              <Modal.Header>
                <Modal.Heading>Edit user connection</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                {editingAccount && (
                  <Form onSubmit={submitEditAccount} className="grid gap-4">
                    <CredentialStatusIndicators
                      hasApiKey={editingAccount.has_api_key_secret}
                      hasPassword={editingAccount.has_password}
                      hasConfig={editingAccount.has_config}
                      email={editingAccount.email}
                      username={editingAccount.username}
                    />
                    <IntegrationCredentialFields
                      authType={target.auth_type}
                      register={editAccountForm.register}
                      watch={editAccountForm.watch}
                      errors={editAccountForm.formState.errors}
                      mode="edit"
                      maskedCredentials={{
                        email: editingAccount.email,
                        username: editingAccount.username,
                        password: editingAccount.password,
                        api_key_secret: editingAccount.api_key_secret,
                      }}
                    />
                    <div className="flex justify-end gap-2">
                      <ActionButtonWithPending
                        type="button"
                        variant="secondary"
                        onPress={editAccountModal.close}
                        isDisabled={updateAccount.isPending}
                      >
                        Cancel
                      </ActionButtonWithPending>
                      <ActionButtonWithPending type="submit" isPending={updateAccount.isPending}>
                        Save credentials
                      </ActionButtonWithPending>
                    </div>
                  </Form>
                )}
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <IntegrationTargetSettingsModal
        state={settingsModal}
        targetId={id}
        userId={configuringAccount?.user_id ?? null}
        userLabel={configuringAccount?.user?.email ?? configuringAccount?.user_id}
      />
    </div>
  );
}
