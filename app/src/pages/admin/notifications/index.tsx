import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  ListBox,
  Modal,
  Pagination,
  Select,
  Table,
  useOverlayState,
} from "@heroui/react";
import { MailOpen, Send, Trash2 } from "lucide-react";
import { Routes } from "@/routes/routes";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  TableRowActionsMenu,
  type TableRowAction,
} from "@/components/ui/table-row-actions-menu";
import { NotificationSeverityChip } from "./components/notification-severity-chip";
import { NotificationTypeChip } from "./components/notification-type-chip";
import { SendTelegramTestForm } from "./components/send-telegram-test-form";
import {
  useDeleteNotification,
  useDeleteNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useSendTelegramTest,
} from "@/features/notifications/hooks/use-notifications";
import {
  type Notification,
  type NotificationListQuery,
  type NotificationSeverity,
  type NotificationType,
} from "@/features/notifications/interfaces/notifications.interfaces";
import type { SendTelegramTestFormValues } from "@/features/notifications/validation-schemas/notifications.schema";
import { NotificationTypeFilterOptions } from "@/config/constants/dropdowns/notification-type-filter.options";
import { NotificationSeverityFilterOptions } from "@/config/constants/dropdowns/notification-severity-filter.options";
import { ReadFilterOptions } from "@/config/constants/dropdowns/read-filter.options";

function resolveNotificationLink(notification: Notification): string | null {
  if (notification.source_agency_id) {
    return Routes.admin.agencies.detail(notification.source_agency_id);
  }
  if (notification.scraper_id) {
    return Routes.admin.scrapers.detail(notification.scraper_id);
  }
  if (notification.crawl_run_id) {
    return Routes.admin.crawlRuns.detail(notification.crawl_run_id);
  }
  return null;
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString();
}

function getNotificationActions(isRead: boolean): TableRowAction[] {
  const actions: TableRowAction[] = [];

  if (!isRead) {
    actions.push({ id: "mark-read", label: "Mark read", icon: MailOpen });
  }

  actions.push({ id: "delete", label: "Delete", variant: "danger", icon: Trash2 });

  return actions;
}

export default function NotificationsListPage() {
  const deleteConfirm = useOverlayState();
  const bulkDeleteConfirm = useOverlayState();
  const telegramTestModal = useOverlayState();

  const [type, setType] = useState<NotificationType | "all">("all");
  const [severity, setSeverity] = useState<NotificationSeverity | "all">("all");
  const [readState, setReadState] = useState<"all" | "true" | "false">("all");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteNotificationId, setDeleteNotificationId] = useState<string | null>(null);

  const query = useMemo<NotificationListQuery>(
    () => ({
      page,
      limit: 20,
      ...(type !== "all" && { type }),
      ...(severity !== "all" && { severity }),
      ...(readState !== "all" && { is_read: readState === "true" }),
    }),
    [page, type, severity, readState],
  );

  const { data, isPending } = useNotifications(query);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const deleteNotification = useDeleteNotification();
  const deleteNotifications = useDeleteNotifications();
  const sendTelegramTest = useSendTelegramTest();

  const notifications = data?.data ?? [];
  const pagination = data?.pagination;
  const selectedCount = selectedIds.size;
  const allVisibleSelected =
    notifications.length > 0 && notifications.every((notification) => selectedIds.has(notification.id));

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const notification of notifications) {
          next.delete(notification.id);
        }
        return next;
      }

      for (const notification of notifications) {
        next.add(notification.id);
      }
      return next;
    });
  };

  const handleDelete = async () => {
    if (!deleteNotificationId) return;
    await deleteNotification.mutateAsync(deleteNotificationId);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(deleteNotificationId);
      return next;
    });
    setDeleteNotificationId(null);
  };

  const handleBulkDelete = async () => {
    await deleteNotifications.mutateAsync({ ids: Array.from(selectedIds) });
    setSelectedIds(new Set());
  };

  const handleSendTelegramTest = async (values: SendTelegramTestFormValues) => {
    await sendTelegramTest.mutateAsync(values);
    telegramTestModal.close();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-2xl font-semibold tracking-tight text-foreground">Notifications</p>
          <p className="text-sm text-muted">
            System alerts for scraper failures, crawl issues, and property anomalies.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ActionButtonWithPending
            variant="secondary"
            onPress={telegramTestModal.open}
            isPending={sendTelegramTest.isPending}
            idleLeading={<Send className="h-4 w-4" />}
          >
            Test Telegram
          </ActionButtonWithPending>
          <Button
            variant="danger"
            isDisabled={selectedCount < 1}
            onPress={bulkDeleteConfirm.open}
          >
            Delete selected ({selectedCount})
          </Button>
          <ActionButtonWithPending
            variant="secondary"
            onPress={() => markAllRead.mutateAsync()}
            isPending={markAllRead.isPending}
          >
            Mark all read
          </ActionButtonWithPending>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select
          aria-label="Filter by notification type"
          selectedKey={type}
          onSelectionChange={(key) => {
            setPage(1);
            setSelectedIds(new Set());
            setType(key as NotificationType | "all");
          }}
          className="w-64"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {NotificationTypeFilterOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <Select
          aria-label="Filter by severity"
          selectedKey={severity}
          onSelectionChange={(key) => {
            setPage(1);
            setSelectedIds(new Set());
            setSeverity(key as NotificationSeverity | "all");
          }}
          className="w-44"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {NotificationSeverityFilterOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <Select
          aria-label="Filter by read status"
          selectedKey={readState}
          onSelectionChange={(key) => {
            setPage(1);
            setSelectedIds(new Set());
            setReadState(key as "all" | "true" | "false");
          }}
          className="w-36"
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {ReadFilterOptions.map((option) => (
                <ListBox.Item key={option.id} id={option.id}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>

      {isPending ? (
        <TableSkeleton rows={8} columns={7} />
      ) : notifications.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-muted">
          No notifications found.
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <Table>
              <Table.ScrollContainer>
                <Table.Content aria-label="Notifications">
                  <Table.Header>
                    <Table.Column isRowHeader>
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAllVisible}
                        aria-label="Select all notifications on this page"
                      />
                    </Table.Column>
                    <Table.Column isRowHeader>Title</Table.Column>
                    <Table.Column>Type</Table.Column>
                    <Table.Column>Severity</Table.Column>
                    <Table.Column>Created</Table.Column>
                    <Table.Column>Status</Table.Column>
                    <Table.Column>Actions</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {notifications.map((notification) => {
                      const link = resolveNotificationLink(notification);

                      return (
                        <Table.Row key={notification.id}>
                          <Table.Cell>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(notification.id)}
                              onChange={() => toggleSelection(notification.id)}
                              aria-label={`Select ${notification.title}`}
                            />
                          </Table.Cell>
                          <Table.Cell>
                            <div className="flex flex-col gap-1 max-w-md">
                              {link ? (
                                <Link
                                  to={link}
                                  className="font-medium text-foreground hover:text-accent transition-colors"
                                >
                                  {notification.title}
                                </Link>
                              ) : (
                                <span className="font-medium text-foreground">{notification.title}</span>
                              )}
                              <span className="text-xs text-muted line-clamp-2">{notification.message}</span>
                            </div>
                          </Table.Cell>
                          <Table.Cell>
                            <NotificationTypeChip type={notification.type} />
                          </Table.Cell>
                          <Table.Cell>
                            <NotificationSeverityChip severity={notification.severity} />
                          </Table.Cell>
                          <Table.Cell className="text-sm text-muted whitespace-nowrap">
                            {formatTimestamp(notification.created_at)}
                          </Table.Cell>
                          <Table.Cell>
                            <span className={notification.is_read ? "text-muted" : "text-foreground font-medium"}>
                              {notification.is_read ? "Read" : "Unread"}
                            </span>
                          </Table.Cell>
                          <Table.Cell>
                            <TableRowActionsMenu
                              actions={getNotificationActions(notification.is_read)}
                              onAction={(actionId) => {
                                if (actionId === "mark-read") {
                                  markRead.mutate(notification.id);
                                  return;
                                }
                                if (actionId !== "delete") return;
                                setDeleteNotificationId(notification.id);
                                deleteConfirm.open();
                              }}
                              ariaLabel={`Actions for ${notification.title}`}
                            />
                          </Table.Cell>
                        </Table.Row>
                      );
                    })}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </div>

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
        </>
      )}

      <ConfirmationDialog
        state={deleteConfirm}
        title="Delete this notification?"
        description="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        isPending={deleteNotification.isPending}
      />

      <ConfirmationDialog
        state={bulkDeleteConfirm}
        title="Delete selected notifications?"
        description={`This will permanently delete ${selectedCount} notifications. This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleBulkDelete}
        isPending={deleteNotifications.isPending}
      />

      <Modal state={telegramTestModal}>
        <Modal.Backdrop isDismissable={!sendTelegramTest.isPending}>
          <Modal.Container>
            <Modal.Dialog className="max-w-lg">
              <Modal.Header>
                <Modal.Heading>Send Telegram test</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <SendTelegramTestForm
                  isPending={sendTelegramTest.isPending}
                  onCancel={telegramTestModal.close}
                  onSubmit={handleSendTelegramTest}
                />
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
