import { useEffect, useMemo, useState } from "react";
import { Modal, Pagination, useOverlayState } from "@heroui/react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { getIntegrationTypeLabel } from "@/config/constants/dropdowns/integrations/integration-type-form.options";
import type { AvailableIntegrationTarget } from "@/features/user-integrations/interfaces/user-integrations.interfaces";
import type { MaskedUserIntegrationConnection } from "@/features/user-integrations/interfaces/user-integrations.interfaces";
import { IntegrationConnectionItem } from "./integration-connection-item";

const PAGE_SIZE = 5;

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
  const [page, setPage] = useState(1);
  const isReadOnly = target ? !target.is_enabled && !isAdmin : !isAdmin;

  const totalPages = Math.max(1, Math.ceil(connections.length / PAGE_SIZE));

  const paginatedConnections = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return connections.slice(start, start + PAGE_SIZE);
  }, [connections, page]);

  useEffect(() => {
    setPage(1);
  }, [target?.id, connections.length]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

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
                    {connections.length} connected account{connections.length === 1 ? "" : "s"}
                  </p>
                  <div className="flex flex-col gap-3">
                    {paginatedConnections.map((connection) => (
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
                  </div>
                  {connections.length > PAGE_SIZE ? (
                    <Pagination>
                      <Pagination.Content>
                        <Pagination.Item>
                          <Pagination.Previous
                            isDisabled={page <= 1}
                            onPress={() => setPage((current) => Math.max(1, current - 1))}
                          >
                            Previous
                          </Pagination.Previous>
                        </Pagination.Item>
                        <Pagination.Item>
                          <Pagination.Summary>
                            Page {page} of {totalPages}
                          </Pagination.Summary>
                        </Pagination.Item>
                        <Pagination.Item>
                          <Pagination.Next
                            isDisabled={page >= totalPages}
                            onPress={() => setPage((current) => Math.min(totalPages, current + 1))}
                          >
                            Next
                          </Pagination.Next>
                        </Pagination.Item>
                      </Pagination.Content>
                    </Pagination>
                  ) : null}
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
