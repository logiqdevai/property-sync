import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Chip, useOverlayState } from "@heroui/react";
import { Routes } from "@/routes/routes";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { PropertyDetailView } from "@/components/ui/property-detail-view";
import {
  useAdminUserProperty,
  useDeleteAdminUserProperty,
} from "@/features/user-properties/hooks/use-user-properties";

export default function UserPropertyDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const deleteConfirm = useOverlayState();
  const { data: property, isPending } = useAdminUserProperty(id);
  const deleteUserProperty = useDeleteAdminUserProperty();

  if (isPending || !property) {
    return <DetailSkeleton />;
  }

  const handleDelete = async () => {
    await deleteUserProperty.mutateAsync(property.id);
    navigate(Routes.admin.properties.userList);
  };

  return (
    <PropertyDetailView
      property={property}
      backHref={Routes.admin.properties.userList}
      backLabel="← Back to user properties"
      headerActions={
        <div className="flex items-center gap-2 flex-wrap">
          {property.user ? (
            <Link
              to={Routes.admin.users.detail(property.user.id)}
              className="text-sm text-accent hover:underline"
            >
              Owner: {property.user.email}
            </Link>
          ) : null}
          <Button variant="danger" onPress={deleteConfirm.open}>
            Delete
          </Button>
        </div>
      }
      footer={
        <>
          <section className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-foreground">
              Source properties
            </h2>
            {property.source_links.length === 0 ? (
              <p className="text-sm text-muted">No source properties linked.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {property.source_links.map((link) => (
                  <li
                    key={link.id}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <Link
                      to={Routes.admin.properties.sourceDetail(
                        link.source_property.id,
                      )}
                      className="text-sm text-accent hover:underline font-medium truncate"
                    >
                      {link.source_property.raw_title?.trim() ||
                        link.source_property.property_id ||
                        link.source_property.id}
                    </Link>
                    {link.is_primary_source ? (
                      <Chip size="sm" variant="soft" color="accent">
                        <Chip.Label>Primary</Chip.Label>
                      </Chip>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <ConfirmationDialog
            state={deleteConfirm}
            title="Delete this user property?"
            description="This cannot be undone. The user's saved copy will be removed."
            confirmLabel="Delete"
            onConfirm={handleDelete}
            isPending={deleteUserProperty.isPending}
          />
        </>
      }
    />
  );
}
