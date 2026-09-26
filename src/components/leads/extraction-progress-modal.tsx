import { useWebSocketJob } from "@/hooks/use-websocket-job";

interface ExtractionProgressModalProps {
  jobId: string | null;
  onClose: () => void;
  onComplete?: () => void;
}

export function ExtractionProgressModal({
  jobId,
  onClose,
  onComplete,
}: ExtractionProgressModalProps) {
  const job = useWebSocketJob(jobId, (state) => {
    if (state.status === "completed") onComplete?.();
  });

  if (!jobId) return null;

  const { status, progress, error } = job;
  const isDone = status === "completed" || status === "failed";
  const isRunning = status === "running" || status === "queued";

  const created = progress?.created ?? 0;
  const merged = progress?.merged ?? 0;
  const processed = progress?.processed ?? 0;
  const total = progress?.total;

  const pct = total && total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border bg-background shadow-xl p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold">
              {status === "completed"
                ? "Extraction Complete"
                : status === "failed"
                ? "Extraction Failed"
                : "Extracting Leads…"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isDone ? (
                <span>Done</span>
              ) : (
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
                  Importing from your free business source…
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress bar */}
        {isRunning && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{processed > 0 ? `${processed.toLocaleString()} processed` : "Searching places…"}</span>
              {total ? <span>{total.toLocaleString()} estimated</span> : null}
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              {pct !== null && pct > 0 ? (
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              ) : (
                // Indeterminate animation
                <div className="h-full w-1/3 bg-primary rounded-full animate-[indeterminate_1.5s_ease-in-out_infinite]" />
              )}
            </div>
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="New Leads" value={created} color="text-green-600 dark:text-green-400" />
          <StatCard label="Deduplicated" value={merged} color="text-yellow-600 dark:text-yellow-400" />
          <StatCard label="Processed" value={processed} />
        </div>

        {/* Error */}
        {status === "failed" && error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* Success message */}
        {status === "completed" && (
          <div className="rounded-lg bg-green-50 border border-green-200 dark:bg-green-950/30 dark:border-green-800 px-3 py-2 text-xs text-green-700 dark:text-green-400">
            ✓ {created} new lead{created !== 1 ? "s" : ""} added to your pipeline.
            {merged > 0 ? ` ${merged} duplicate${merged !== 1 ? "s" : ""} merged.` : ""}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-1">
          {isDone ? (
            <button
              onClick={onClose}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 shadow-xs"
            >
              Go to Pipeline
            </button>
          ) : (
            <div className="flex items-center justify-between w-full">
              <p className="text-xs text-muted-foreground">
                Extraction runs in background.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                Close Window
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color = "text-foreground",
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-center">
      <p className={`text-xl font-bold tabular-nums ${color}`}>{value.toLocaleString()}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
