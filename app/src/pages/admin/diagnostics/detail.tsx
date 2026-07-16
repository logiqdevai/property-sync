import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, ExternalLink, X } from "lucide-react";
import { Routes } from "@/routes/routes";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";
import { useDiagnosticsPackage } from "@/features/diagnostics/hooks/use-diagnostics";
import {
  DiagnosticsArtifactKinds,
  type DiagnosticsArtifact,
} from "@/features/diagnostics/interfaces/diagnostics.interfaces";
import { DiagnosticsModeChip } from "./components/diagnostics-mode-chip";
import { ArtifactKindChip } from "./components/artifact-kind-chip";
import { formatDateTime } from "@/lib/date";
import { formatDuration } from "@/lib/duration";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function findArtifact(artifacts: DiagnosticsArtifact[], kind: string) {
  return artifacts.find((artifact) => artifact.kind === kind) ?? null;
}

export default function DiagnosticsDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const { data: pkg, isPending } = useDiagnosticsPackage(id!);

  if (isPending || !pkg) {
    return <DetailSkeleton fieldCount={6} showSubTable={false} />;
  }

  const artifacts = pkg.artifacts ?? [];
  const trace = findArtifact(artifacts, DiagnosticsArtifactKinds.TRACE);
  const screenshot = findArtifact(artifacts, DiagnosticsArtifactKinds.SCREENSHOT);
  const html = findArtifact(artifacts, DiagnosticsArtifactKinds.HTML_SNAPSHOT);
  const consoleLog = findArtifact(artifacts, DiagnosticsArtifactKinds.CONSOLE_LOG);
  const har = findArtifact(artifacts, DiagnosticsArtifactKinds.NETWORK_HAR);
  const video = findArtifact(artifacts, DiagnosticsArtifactKinds.VIDEO);

  return (
    <div className="flex flex-col gap-6">
      <button
        onClick={() => navigate(Routes.admin.diagnostics.list)}
        className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to diagnostics
      </button>

      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-2xl font-semibold tracking-tight text-foreground">
          {pkg.scraper?.name ?? pkg.scraper_id}
        </p>
        <DiagnosticsModeChip mode={pkg.mode} />
        <button
          className="text-sm text-accent hover:underline"
          onClick={() => navigate(Routes.admin.crawlRuns.detail(pkg.crawl_run_id))}
        >
          View crawl run
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 rounded-xl border border-border bg-surface p-6">
        <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">URL</span>
          <span className="text-sm text-foreground break-all">{pkg.url}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Worker</span>
          <span className="text-sm text-foreground">{pkg.worker_id ?? "—"}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Browser / Playwright
          </span>
          <span className="text-sm text-foreground">
            {pkg.browser_version ?? "—"} / {pkg.playwright_version ?? "—"}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Scraper version / retry
          </span>
          <span className="text-sm text-foreground">
            v{pkg.scraper_version ?? "—"} / attempt {pkg.retry_number ?? "—"}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Started / finished
          </span>
          <span className="text-sm text-foreground">
            {formatDateTime(pkg.started_at)} / {formatDateTime(pkg.finished_at)}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Duration</span>
          <span className="text-sm text-foreground">{formatDuration(pkg.duration_ms)}</span>
        </div>
        {pkg.failure_reason && (
          <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Failure reason
            </span>
            <span className="text-sm text-danger">{pkg.failure_reason}</span>
          </div>
        )}
        {pkg.exception && (
          <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Exception
            </span>
            <pre className="rounded-lg border border-border bg-background p-3 text-xs overflow-auto max-h-64 text-danger">
              {pkg.exception}
            </pre>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 flex flex-col gap-4">
        <p className="text-sm font-medium text-foreground">Attachments</p>

        {artifacts.length === 0 ? (
          <p className="text-sm text-muted">No artifacts stored for this run.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {trace && (
              <AttachmentRow label="Playwright trace" artifact={trace}>
                <a
                  href={trace.url}
                  className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download trace.zip
                </a>
                <a
                  href={`https://trace.playwright.dev/?trace=${encodeURIComponent(trace.url)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View online
                </a>
              </AttachmentRow>
            )}

            {screenshot && (
              <AttachmentRow label="Final screenshot" artifact={screenshot}>
                <button onClick={() => setLightboxUrl(screenshot.url)} className="shrink-0">
                  <img
                    src={screenshot.url}
                    alt="Final screenshot"
                    className="h-24 w-40 rounded-lg border border-border object-cover object-top"
                  />
                </button>
              </AttachmentRow>
            )}

            {html && (
              <AttachmentRow label="Page HTML" artifact={html}>
                <a
                  href={html.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View HTML
                </a>
              </AttachmentRow>
            )}

            {consoleLog && (
              <AttachmentRow label="Console log" artifact={consoleLog}>
                <a
                  href={consoleLog.url}
                  className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download console.json
                </a>
              </AttachmentRow>
            )}

            {har && (
              <AttachmentRow label="Network HAR" artifact={har}>
                <a
                  href={har.url}
                  className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download network.har
                </a>
              </AttachmentRow>
            )}

            {video && (
              <AttachmentRow label="Video" artifact={video}>
                <video controls src={video.url} className="max-h-64 rounded-lg border border-border" />
              </AttachmentRow>
            )}
          </div>
        )}
      </div>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={lightboxUrl}
            alt="Screenshot"
            className="max-h-full max-w-full rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function AttachmentRow({
  label,
  artifact,
  children,
}: {
  label: string;
  artifact: DiagnosticsArtifact;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3 flex-wrap">
      <div className="flex items-center gap-3">
        <ArtifactKindChip kind={artifact.kind} />
        <div className="flex flex-col">
          <span className="text-sm text-foreground">{label}</span>
          <span className="text-xs text-muted">{formatBytes(artifact.size_bytes)}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">{children}</div>
    </div>
  );
}
