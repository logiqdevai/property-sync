import { IntegrationTypes } from "@/features/integration-targets/interfaces/integration-targets.interfaces";
import type { MaskedUserIntegrationConnection } from "@/features/user-integrations/interfaces/user-integrations.interfaces";

export const LINKABLE_INTEGRATION_TYPE = IntegrationTypes.ESTATEWEB;

export function getLinkableConnections(connections: MaskedUserIntegrationConnection[]) {
  return connections.filter(
    (connection) =>
      connection.integration_target.integration_type === LINKABLE_INTEGRATION_TYPE,
  );
}

export function getIntegrationConnectionLabel(
  connection: Pick<MaskedUserIntegrationConnection, "email" | "username" | "id">,
) {
  if (connection.email) {
    return connection.email;
  }
  if (connection.username) {
    return connection.username;
  }
  return `Connection ${connection.id.slice(0, 8)}`;
}
