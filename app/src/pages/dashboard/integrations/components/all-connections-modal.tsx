import { useEffect, useMemo, useState } from "react";
import { Input, Modal, useOverlayState } from "@heroui/react";
import { Search } from "lucide-react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { getIntegrationTypeLabel } from "@/config/constants/dropdowns/integrations/integration-type-form.options";
import type { AvailableIntegrationTarget } from "@/features/user-integrations/interfaces/user-integrations.interfaces";
import type { MaskedUserIntegrationConnection } from "@/features/user-integrations/interfaces/user-integrations.interfaces";
import { IntegrationConnectionItem } from "./integration-connection-item";

type AllConnectionsModalProps = {
  state: ReturnType<typeof useOverlayState>;
  target: AvailableIntegrationTarget | null;
  connections: MaskedUserIntegrationConnection[];
  isPending: boolean;
  onEdit: (connection: MaskedUserIntegrationConnection) => void;
  onDisconnectRequest: (connection: MaskedUserIntegrationConnection) => void;
  onToggleActive: (connection: MaskedUserIntegrationConnection, next: boolean) => void;
  onSetDefault: (connection: MaskedUserIntegrationConnection) => void;
  isAdmin: boolean;
};

export function AllConnectionsModal({
  state,
  target,
  connections,
  isPending,
  onEdit,
  onDisconnectRequest,
  onToggleActive,
  onSetDefault,
  isAdmin,
}: AllConnectionsModalProps) {
  const [search, setSearch] = useState("");
  const isReadOnly = target ? !target.is_enabled && !isAdmin : !isAdmin;

  const filteredConnections = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return connections;
    return connections.filter((connection) =>
      [connection.email, connection.username].some((value) => value?.toLowerCase().includes(term)),
    );
  }, [connections, search]);

  useEffect(() => {
    setSearch("");
  }, [target?.id, state.isOpen]);

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={!isPending}>
        <Modal.Container>
          <Modal.Dialog className="max-w-2xl">
            <Modal.Header>
              <Modal.Heading>
                {target
                  ? `${getIntegrationTypeLabel(target.integration_type)} accounts`
                  : "Connected accounts"}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {target ? (
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-muted">
                    {search.trim()
                      ? `${filteredConnections.length} of ${connections.length} accounts`
                      : `${connections.length} connected account${connections.length === 1 ? "" : "s"}`}
                  </p>
                  <div className="relative w-full">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by email or username"
                      className="pl-9"
                      fullWidth
                    />
                  </div>
                  <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto pr-1">
                    {filteredConnections.map((connection) => (
                      <IntegrationConnectionItem
                        key={connection.id}
                        connection={connection}
                        target={target}
                        isReadOnly={isReadOnly}
                        isPending={isPending}
                        onEdit={onEdit}
                        onDisconnectRequest={onDisconnectRequest}
                        onToggleActive={onToggleActive}
                        onSetDefault={onSetDefault}
                      />
                    ))}
                    {filteredConnections.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted">No accounts match your search.</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </Modal.Body>
            <Modal.Footer>
              <ActionButtonWithPending variant="secondary" onPress={state.close} isDisabled={isPending}>
                Close
              </ActionButtonWithPending>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
