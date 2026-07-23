import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Chip, useOverlayState } from "@heroui/react";
import { ExternalLink, Images, Trash2 } from "lucide-react";
import { Routes } from "@/routes/routes";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { BulkActionsMenu } from "@/components/ui/bulk-actions-menu";
import type { TableRowAction } from "@/components/ui/table-row-actions-menu";
import { PropertyDetailView } from "@/components/ui/property-detail-view";
import { getCrmPropertyAppUrl } from "@/config/constants/crm-app-urls";
import {
  useAdminUserProperty,
  useDeleteAdminUserProperty,
  useDeleteAdminUserPropertyIntegrationImages,
  useCreateAdminUserPropertyIntegrationImages,
  useMigrateAdminUserPropertyIntegrationImages,
} from "@/features/user-properties/hooks/use-user-properties";

export default function UserPropertyDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const deleteConfirm = useOverlayState();
  const { data: property, isPending } = useAdminUserProperty(id);
  const deleteUserProperty = useDeleteAdminUserProperty();
  const migrateImages = useMigrateAdminUserPropertyIntegrationImages();
  const deleteIntegrationImages = useDeleteAdminUserPropertyIntegrationImages();
  const createIntegrationImages = useCreateAdminUserPropertyIntegrationImages();

  const headerActions = useMemo<TableRowAction[]>(() => {
    if (!property) return [];

    const crmUrl = property.integration_property_id
      ? getCrmPropertyAppUrl(property.integration_property_id)
      : null;

    return [
      ...(crmUrl
        ? [
            {
              id: "open-in-crm",
              label: "Open in CRM",
              variant: "default" as const,
              icon: ExternalLink,
            },
          ]
        : []),
      ...(property.integration_property_id
        ? [
            {
              id: "migrate-crm-images",
              label: "Migrate CRM images",
              variant: "default" as const,
              icon: Images,
              isDisabled: migrateImages.isPending,
            },
          ]
        : []),
      {
        id: "delete",
        label: "Delete",
        variant: "danger",
        icon: Trash2,
        isDisabled: deleteUserProperty.isPending,
      },
    ];
  }, [deleteUserProperty.isPending, migrateImages.isPending, property]);

  if (isPending || !property) {
    return <DetailSkeleton />;
  }

  const handleDelete = async () => {
    await deleteUserProperty.mutateAsync(property.id);
    navigate(Routes.admin.properties.userList);
  };

  const handleHeaderAction = (actionId: string) => {
    if (actionId === "open-in-crm") {
      const crmUrl = property.integration_property_id
        ? getCrmPropertyAppUrl(property.integration_property_id)
        : null;
      if (crmUrl) {
        window.open(crmUrl, "_blank", "noopener,noreferrer");
      }
      return;
    }
    if (actionId === "migrate-crm-images") {
      migrateImages.mutate(property.id);
      return;
    }
    if (actionId === "delete") {
      deleteConfirm.open();
    }
  };

  return (
    <PropertyDetailView
      property={property}
      backHref={Routes.admin.properties.userList}
      backLabel="← Back to user properties"
      onDeleteIntegrationImages={async (imageIds) => {
        await deleteIntegrationImages.mutateAsync({
          id: property.id,
          imageIds,
        });
      }}
      isDeletingIntegrationImages={deleteIntegrationImages.isPending}
      canCreateIntegrationImages
      onCreateIntegrationImages={async (imageIndexes) => {
        await createIntegrationImages.mutateAsync({
          id: property.id,
          imageIndexes,
        });
      }}
      isCreatingIntegrationImages={createIntegrationImages.isPending}
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
          <BulkActionsMenu
            actions={headerActions}
            onAction={handleHeaderAction}
            isPending={
              migrateImages.isPending ||
              deleteUserProperty.isPending ||
              deleteIntegrationImages.isPending ||
              createIntegrationImages.isPending
            }
          />
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
