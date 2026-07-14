import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Modal, Switch, EmptyState, Select, ListBox, useOverlayState } from "@heroui/react";
import { ArrowLeft, Bot, Activity, History, Sparkles } from "lucide-react";
import { Routes } from "@/routes/routes";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { ActionButtonWithPending } from "@/components/ui/action-button-with-pending";
import { ScraperStatusChip } from "./components/scraper-status-chip";
import { ScraperHealthChip } from "./components/scraper-health-chip";
import { ScraperVersionForm } from "./components/scraper-version-form";
import {
  useActivateScraperVersion,
  useCreateScraperVersion,
  useRunScraperNow,
  useScraper,
  useScraperVersions,
  useUpdateScraper,
} from "@/features/scrapers/hooks/use-scrapers";
import { ScraperStatuses } from "@/features/scrapers/interfaces/scrapers.interfaces";
import { CreateGenerationRunForm } from "./components/create-generation-run-form";
import { GenerationRunStatusChip } from "./components/generation-run-status-chip";
import { GenerationRunTriggerChip } from "./components/generation-run-trigger-chip";
import {
  useCreateGenerationRun,
  useGenerationRuns,
} from "@/features/scraper-generation/hooks/use-scraper-generation";
import { CrawlRunStatusChip } from "./components/crawl-run-status-chip";
import { useCrawlRuns } from "@/features/crawl-runs/hooks/use-crawl-runs";
import { formatDateTime } from "@/lib/date";

export default function ScraperDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const newVersionModal = useOverlayState();
  const generateModal = useOverlayState();

  const [compareA, setCompareA] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string | null>(null);

  const { data: scraper, isPending } = useScraper(id!);
  const { data: versions } = useScraperVersions(id!);
  const { data: generationRunsData } = useGenerationRuns({ scraper_id: id!, limit: 5 });
  const { data: crawlRunsData } = useCrawlRuns({ scraper_id: id!, limit: 5 });
  const updateScraper = useUpdateScraper();
  const activateVersion = useActivateScraperVersion();
  const createVersion = useCreateScraperVersion();
  const runNow = useRunScraperNow();
  const createGenerationRun = useCreateGenerationRun();

  const generationRuns = generationRunsData?.data ?? [];
  const crawlRuns = crawlRunsData?.data ?? [];

  const versionA = useMemo(
    () => versions?.find((v) => v.id === compareA) ?? null,
    [versions, compareA],
  );
  const versionB = useMemo(
    () => versions?.find((v) => v.id === compareB) ?? null,
    [versions, compareB],
  );

  if (isPending || !scraper) {
    return <DetailSkeleton fieldCount={6} showSubTable />;
  }

  return (
    <div className="flex flex-col gap-6">
      <button
        onClick={() => navigate(Routes.admin.scrapers.list)}
        className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to scrapers
      </button>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-2xl font-semibold tracking-tight text-foreground">{scraper.name}</p>
          <ScraperStatusChip status={scraper.status} />
          <ScraperHealthChip health={scraper.health} />
        </div>
        <div className="flex items-center gap-2">
          <ActionButtonWithPending
            variant="secondary"
            idleLeading={<Sparkles className="h-4 w-4" />}
            onPress={generateModal.open}
          >
            {scraper.status === ScraperStatuses.BROKEN ? "Fix with AI" : "Generate with AI"}
          </ActionButtonWithPending>
          <ActionButtonWithPending
            isPending={runNow.isPending}
            isDisabled={runNow.isPending}
            onPress={() =>
              runNow.mutate(scraper.id, {
                onSuccess: (run) => navigate(Routes.admin.crawlRuns.detail(run.id)),
              })
            }
          >
            Run now
          </ActionButtonWithPending>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Agency</span>
          <button
            className="text-sm text-accent hover:underline text-left"
            onClick={() => navigate(Routes.admin.agencies.detail(scraper.source_agency_id))}
          >
            {scraper.source_agency?.name ?? scraper.source_agency_id}
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Active version</span>
          <span className="text-sm text-foreground">v{scraper.active_version?.version ?? "—"}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Success rate</span>
          <span className="text-sm text-foreground">
            {scraper.success_rate !== null ? `${scraper.success_rate}%` : "—"}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Avg runtime</span>
          <span className="text-sm text-foreground">
            {scraper.avg_runtime_ms !== null ? `${scraper.avg_runtime_ms}ms` : "—"}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Consecutive failures</span>
          <span className="text-sm text-foreground">{scraper.consecutive_failures}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Last success / failure</span>
          <span className="text-sm text-foreground">
            {formatDateTime(scraper.last_success_at)} / {formatDateTime(scraper.last_failure_at)}
          </span>
        </div>

        <div className="flex items-center gap-6 sm:col-span-2 pt-2 border-t border-border">
          <Switch
            isSelected={scraper.self_healing_enabled}
            onChange={(isSelected) =>
              updateScraper.mutate({ id: scraper.id, payload: { self_healing_enabled: isSelected } })
            }
          >
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Switch.Content>Self-healing enabled</Switch.Content>
          </Switch>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-medium text-foreground">Version history</p>
          <ActionButtonWithPending variant="secondary" onPress={newVersionModal.open}>
            New version
          </ActionButtonWithPending>
        </div>

        <div className="flex flex-col gap-2">
          {(versions ?? []).map((version) => {
            const isActive = version.id === scraper.active_version_id;
            return (
              <div
                key={version.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-border p-3"
              >
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">v{version.version}</span>
                    {isActive && (
                      <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                        Active
                      </span>
                    )}
                    <span className="text-xs text-muted">{version.created_by}</span>
                  </div>
                  {version.notes && <span className="text-xs text-muted">{version.notes}</span>}
                  <span className="text-xs text-muted">{formatDateTime(version.created_at)}</span>
                </div>
                {!isActive && (
                  <ActionButtonWithPending
                    variant="secondary"
                    isPending={activateVersion.isPending}
                    isDisabled={activateVersion.isPending}
                    onPress={() => activateVersion.mutate({ id: scraper.id, versionId: version.id })}
                  >
                    Rollback to this version
                  </ActionButtonWithPending>
                )}
              </div>
            );
          })}
        </div>

        {(versions ?? []).length > 1 && (
          <div className="mt-6 flex flex-col gap-3 border-t border-border pt-4">
            <p className="text-sm font-medium text-foreground">Compare versions</p>
            <div className="flex items-center gap-3">
              <Select
                aria-label="Compare version A"
                placeholder="Version A"
                selectedKey={compareA ?? undefined}
                onSelectionChange={(key) => setCompareA(key as string)}
                className="w-40"
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {(versions ?? []).map((v) => (
                      <ListBox.Item key={v.id} id={v.id}>
                        v{v.version}
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
              <Select
                aria-label="Compare version B"
                placeholder="Version B"
                selectedKey={compareB ?? undefined}
                onSelectionChange={(key) => setCompareB(key as string)}
                className="w-40"
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {(versions ?? []).map((v) => (
                      <ListBox.Item key={v.id} id={v.id}>
                        v{v.version}
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>

            {versionA && versionB && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted">
                    v{versionA.version}
                  </span>
                  <pre className="rounded-lg border border-border bg-background p-3 text-xs overflow-auto max-h-96">
                    {JSON.stringify(versionA.config, null, 2)}
                  </pre>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted">
                    v{versionB.version}
                  </span>
                  <pre className="rounded-lg border border-border bg-background p-3 text-xs overflow-auto max-h-96">
                    {JSON.stringify(versionB.config, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="mb-3 text-sm font-medium text-foreground">Generation runs</p>
          {generationRuns.length === 0 ? (
            <EmptyState>
              <Bot className="h-6 w-6 text-muted" />
              <p className="text-sm text-muted mt-2">No generation runs yet for this scraper</p>
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-2">
              {generationRuns.map((run) => (
                <button
                  key={run.id}
                  onClick={() => navigate(Routes.admin.generationRuns.detail(run.id))}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-left hover:border-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <GenerationRunTriggerChip trigger={run.trigger} />
                    <span className="text-xs text-muted">{formatDateTime(run.created_at)}</span>
                  </div>
                  <GenerationRunStatusChip status={run.status} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="mb-3 text-sm font-medium text-foreground">Recent crawl runs</p>
          {crawlRuns.length === 0 ? (
            <EmptyState>
              <Activity className="h-6 w-6 text-muted" />
              <p className="text-sm text-muted mt-2">No crawl runs yet for this scraper</p>
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-2">
              {crawlRuns.map((run) => (
                <button
                  key={run.id}
                  onClick={() => navigate(Routes.admin.crawlRuns.detail(run.id))}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-left hover:border-accent/50 transition-colors"
                >
                  <span className="text-xs text-muted">{formatDateTime(run.created_at)}</span>
                  <CrawlRunStatusChip status={run.status} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal state={newVersionModal}>
        <Modal.Backdrop isDismissable>
          <Modal.Container>
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading>
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4" />
                    New version
                  </div>
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <ScraperVersionForm
                  defaultConfig={
                    scraper.active_version
                      ? JSON.stringify(scraper.active_version.config, null, 2)
                      : undefined
                  }
                  isPending={createVersion.isPending}
                  onCancel={newVersionModal.close}
                  onSubmit={(values) =>
                    createVersion.mutate(
                      { id: scraper.id, payload: { config: JSON.parse(values.config), notes: values.notes } },
                      { onSuccess: () => newVersionModal.close() },
                    )
                  }
                />
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal state={generateModal}>
        <Modal.Backdrop isDismissable>
          <Modal.Container>
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    {scraper.status === ScraperStatuses.BROKEN ? "Fix with AI" : "Generate with AI"}
                  </div>
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <CreateGenerationRunForm
                  defaultAgencyId={scraper.source_agency_id}
                  defaultAgencyName={scraper.source_agency?.name}
                  lockAgency
                  defaultScraperId={scraper.id}
                  submitLabel="Generate"
                  isPending={createGenerationRun.isPending}
                  onCancel={generateModal.close}
                  onSubmit={(values) =>
                    createGenerationRun.mutate(
                      {
                        source_agency_id: values.source_agency_id,
                        scraper_id: values.scraper_id,
                        prompt: values.prompt || undefined,
                      },
                      {
                        onSuccess: (run) => {
                          generateModal.close();
                          navigate(Routes.admin.generationRuns.detail(run.id));
                        },
                      },
                    )
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
