import { useState } from "react";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { useSearchIntegrationClients } from "@/features/user-tracked-agencies/hooks/use-user-tracked-agencies";
import type { IntegrationClient } from "@/features/user-tracked-agencies/interfaces/user-tracked-agencies.interfaces";

type IntegrationClientLookupProps = {
  disabled?: boolean;
  selectedClientId: number | null;
  onSelect: (client: IntegrationClient) => void;
};

const MIN_QUERY_LENGTH = 2;

function getFullName(client: IntegrationClient): string {
  return [client.last_name, client.first_name, client.father_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
}

function getPhones(client: IntegrationClient): string {
  return [client.mobile, client.mobile_work, client.phone_work, client.phone_home]
    .map((phone) => phone?.trim())
    .filter(Boolean)
    .join(", ");
}

export function IntegrationClientLookup({
  disabled = false,
  selectedClientId,
  onSelect,
}: IntegrationClientLookupProps) {
  const [lastName, setLastName] = useState("");
  const search = useSearchIntegrationClients();

  const canSearch = lastName.trim().length >= MIN_QUERY_LENGTH;

  const handleSearch = () => {
    if (!canSearch) {
      return;
    }
    search.mutate(lastName.trim());
  };

  const clients = search.data?.list ?? [];

  return (
    <div className="flex flex-col gap-2 text-sm">
      <span className="text-muted">Find CRM client by last name</span>
      <span className="text-xs text-muted">
        Searches the default EstateWeb connection. Pick a match to fill the client ID below.
      </span>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2"
          value={lastName}
          disabled={disabled || search.isPending}
          placeholder="Last name"
          onChange={(e) => setLastName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSearch();
            }
          }}
        />
        <ActionButtonWithPending
          size="sm"
          onPress={handleSearch}
          isDisabled={disabled || !canSearch}
          isPending={search.isPending}
          className="shrink-0 self-start sm:self-auto"
        >
          Search
        </ActionButtonWithPending>
      </div>

      {search.isError ? (
        <p className="text-xs text-danger">{search.error.message}</p>
      ) : null}

      {search.isSuccess && clients.length === 0 ? (
        <p className="text-xs text-muted">No clients found.</p>
      ) : null}

      {clients.length > 0 ? (
        <>
          <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto">
            {clients.map((client) => {
              const isSelected = client.id === selectedClientId;
              const phones = getPhones(client);
              return (
                <li key={client.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onSelect(client)}
                    className={`flex w-full min-w-0 flex-col gap-0.5 rounded-lg border px-3 py-2 text-left hover:bg-surface-secondary ${
                      isSelected ? "border-accent" : "border-border"
                    }`}
                  >
                    <span className="break-words font-medium text-foreground">
                      {getFullName(client)}{" "}
                      <span className="font-normal text-muted">#{client.id}</span>
                    </span>
                    {client.occupation?.trim() ? (
                      <span className="break-words text-xs text-muted">
                        {client.occupation.trim()}
                      </span>
                    ) : null}
                    {phones ? <span className="text-xs text-muted">{phones}</span> : null}
                    {client.email?.trim() ? (
                      <span className="break-all text-xs text-muted">{client.email.trim()}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {search.data && search.data.total > clients.length ? (
            <p className="text-xs text-muted">
              Showing {clients.length} of {search.data.total}. Refine the last name to narrow it
              down.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
