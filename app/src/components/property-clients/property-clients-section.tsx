import { useState, type FC, type FormEvent } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button, ListBox, Select, Skeleton, useOverlayState } from "@heroui/react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { formatDate } from "@/lib/date";
import {
  useCreatePropertyClient,
  useDeletePropertyClient,
  useKnownClients,
  usePropertyClients,
  useUpdatePropertyClient,
} from "@/features/property-clients/hooks/use-property-clients";
import type { PropertyClient } from "@/features/property-clients/interfaces/property-clients.interfaces";

const fieldClassName =
  "w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted";

const todayInput = () => new Date().toISOString().slice(0, 10);

type ClientFormValues = {
  name: string;
  phone: string;
  email: string;
  notes: string;
  shown_at: string;
};

type ClientFormProps = {
  initial?: PropertyClient;
  isPending: boolean;
  onSubmit: (values: ClientFormValues) => Promise<void>;
  onCancel: () => void;
};

const ClientForm: FC<ClientFormProps> = ({ initial, isPending, onSubmit, onCancel }) => {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [shownAt, setShownAt] = useState(
    initial ? initial.shown_at.slice(0, 10) : todayInput(),
  );

  const { data: knownClients = [] } = useKnownClients(!initial);

  const handleCopy = (key: string) => {
    const known = knownClients[Number(key)];
    if (!known) return;
    setName(known.name);
    setPhone(known.phone ?? "");
    setEmail(known.email ?? "");
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      await onSubmit({ name, phone, email, notes, shown_at: shownAt });
    } catch {
      return;
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3"
    >
      {!initial && knownClients.length > 0 && (
        <Select
          aria-label="Copy a client from another property"
          placeholder="Copy a client from another property…"
          onSelectionChange={(key) => {
            if (key != null) handleCopy(String(key));
          }}
        >
          <Select.Trigger>
            <Select.Value />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {knownClients.map((known, index) => {
                const label = [known.name, known.phone, known.email]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <ListBox.Item key={index} id={String(index)} textValue={label}>
                    {label}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                );
              })}
            </ListBox>
          </Select.Popover>
        </Select>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Name *</span>
          <input
            className={fieldClassName}
            placeholder="e.g. Maria Papadopoulou"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Phone</span>
          <input
            className={fieldClassName}
            placeholder="e.g. 69 1234 5678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Email</span>
          <input
            type="email"
            className={fieldClassName}
            placeholder="e.g. maria@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Date shown</span>
          <input
            type="date"
            className={fieldClassName}
            value={shownAt}
            onChange={(e) => setShownAt(e.target.value)}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Notes</span>
        <textarea
          className={fieldClassName}
          rows={3}
          placeholder="e.g. Liked the terrace, wants to see it again on Friday"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onPress={onCancel} isDisabled={isPending}>
          Cancel
        </Button>
        <ActionButtonWithPending type="submit" isPending={isPending} isDisabled={isPending}>
          {initial ? "Save" : "Add client"}
        </ActionButtonWithPending>
      </div>
    </form>
  );
};

export const PropertyClientsSection: FC<{ userPropertyId: string; bare?: boolean }> = ({
  userPropertyId,
  bare = false,
}) => {
  const { data: clients = [], isPending } = usePropertyClients(userPropertyId);
  const create = useCreatePropertyClient(userPropertyId);
  const update = useUpdatePropertyClient();
  const remove = useDeletePropertyClient();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const deleteConfirm = useOverlayState();
  const [clientToDelete, setClientToDelete] = useState<PropertyClient | null>(null);

  return (
    <section
      className={
        bare
          ? "flex min-w-0 flex-col gap-3"
          : "flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:p-5"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Clients shown this property</h2>
          <p className="text-xs text-muted">
            Kept even if the listing is removed or reloaded. You get an alert if it comes off the
            agency website.
          </p>
        </div>
        {!adding && (
          <Button size="sm" variant="secondary" onPress={() => setAdding(true)}>
            <Plus className="size-4" />
            Add client
          </Button>
        )}
      </div>

      {adding && (
        <ClientForm
          isPending={create.isPending}
          onCancel={() => setAdding(false)}
          onSubmit={async (v) => {
            await create.mutateAsync({
              name: v.name,
              phone: v.phone,
              email: v.email || undefined,
              notes: v.notes,
              shown_at: v.shown_at ? new Date(v.shown_at).toISOString() : undefined,
            });
            setAdding(false);
          }}
        />
      )}

      {isPending ? (
        <ul className="flex flex-col gap-2" aria-busy="true" aria-label="Loading clients">
          {[0, 1].map((i) => (
            <li
              key={i}
              className="flex flex-col gap-2 rounded-lg border border-border p-3"
            >
              <Skeleton className="h-4 w-40 rounded-md" />
              <Skeleton className="h-3 w-56 max-w-full rounded-md" />
              <Skeleton className="h-3 w-full rounded-md" />
            </li>
          ))}
        </ul>
      ) : clients.length === 0 && !adding ? (
        <p className="text-sm text-muted">No clients recorded yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {clients.map((client) =>
            editingId === client.id ? (
              <li key={client.id}>
                <ClientForm
                  initial={client}
                  isPending={update.isPending}
                  onCancel={() => setEditingId(null)}
                  onSubmit={async (v) => {
                    await update.mutateAsync({
                      id: client.id,
                      payload: {
                        name: v.name,
                        phone: v.phone || null,
                        email: v.email || null,
                        notes: v.notes || null,
                        shown_at: v.shown_at
                          ? new Date(v.shown_at).toISOString()
                          : undefined,
                      },
                    });
                    setEditingId(null);
                  }}
                />
              </li>
            ) : (
              <li
                key={client.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-foreground">{client.name}</p>
                  <p className="text-xs text-muted">
                    Shown {formatDate(client.shown_at)}
                    {client.phone ? ` · ${client.phone}` : ""}
                    {client.email ? ` · ${client.email}` : ""}
                  </p>
                  {client.notes && (
                    <p className="mt-1 whitespace-pre-wrap break-words text-foreground">
                      {client.notes}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    aria-label="Edit client"
                    onPress={() => setEditingId(client.id)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    aria-label="Remove client"
                    isDisabled={remove.isPending}
                    onPress={() => {
                      setClientToDelete(client);
                      deleteConfirm.open();
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
      <ConfirmationDialog
        state={deleteConfirm}
        title="Remove this client?"
        description={`${clientToDelete?.name ?? "This client"} and their notes will be permanently removed from this property.`}
        confirmLabel="Remove"
        onConfirm={async () => {
          if (clientToDelete) await remove.mutateAsync(clientToDelete.id);
        }}
        isPending={remove.isPending}
      />
    </section>
  );
};
