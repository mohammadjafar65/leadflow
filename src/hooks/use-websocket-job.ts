import { useEffect, useRef, useState, useCallback } from "react";
import { getAccessToken } from "@/lib/api-client";
import { jobsApi } from "@/api/jobs";

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface JobProgress {
  processed?: number;
  created?: number;
  merged?: number;
  pages?: number;
  total?: number;
}

export interface JobState {
  status: JobStatus | null;
  progress: JobProgress | null;
  result: Record<string, unknown> | null;
  error: string | null;
  connected: boolean;
}

const INITIAL_STATE: JobState = {
  status: null,
  progress: null,
  result: null,
  error: null,
  connected: false,
};

const WS_BASE_URL = (() => {
  const envWs = import.meta.env.VITE_WS_URL as string | undefined;
  if (envWs && envWs.trim()) return envWs.trim();
  const envWsBase = import.meta.env.VITE_WS_BASE_URL as string | undefined;
  if (envWsBase && envWsBase.trim()) return envWsBase.trim();

  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (apiBase && /^https?:\/\//.test(apiBase)) {
    const host = apiBase.replace(/^https?:\/\//, "");
    return `${proto}://${host}`;
  }
  return `${proto}://${window.location.host}`;
})();

/**
 * Subscribes to a scrape/enrichment/send job's progress.
 * Uses WebSocket for real-time live events, and pairs with an HTTP polling
 * fallback (jobsApi.get) so progress and completion are guaranteed even if
 * the WebSocket connection is interrupted or delayed.
 *
 * @param jobId  - the UUID returned by POST /leads/extract (or null to skip)
 * @param onDone - called once when status becomes "completed" or "failed"
 */
export function useWebSocketJob(
  jobId: string | null,
  onDone?: (state: JobState) => void,
) {
  const [state, setState] = useState<JobState>(INITIAL_STATE);
  const wsRef = useRef<WebSocket | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      const socket = wsRef.current;
      wsRef.current = null;

      // Disarm all event listeners so unmounted components don't trigger state updates
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;

      // Calling .close() while readyState === WebSocket.CONNECTING (0) causes browsers
      // to log: "WebSocket connection to '...' failed: WebSocket is closed before the connection is established".
      // If still connecting, wait for onopen before cleanly closing.
      if (socket.readyState === WebSocket.CONNECTING) {
        socket.onopen = () => {
          try {
            socket.close(1000, "Clean unmount");
          } catch {
            /* ignore */
          }
        };
      } else if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.close(1000, "Clean unmount");
        } catch {
          /* ignore */
        }
      }
    }
  }, []);

  useEffect(() => {
    if (!jobId) {
      setState(INITIAL_STATE);
      return;
    }

    const token = getAccessToken();
    if (!token) return;

    let isTerminated = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    // HTTP polling fallback — ensures progress and terminal status are always updated
    async function poll() {
      if (isTerminated || !jobId) return;
      try {
        const { job } = await jobsApi.get(jobId);
        if (isTerminated) return;
        setState((prev) => {
          const rawProg = job.progress as JobProgress | null;
          const rawResult = job.result as JobProgress | null;
          const prog =
            rawProg && (rawProg.processed !== undefined || rawProg.total !== undefined)
              ? rawProg
              : rawResult ?? prev.progress;

          const next: JobState = {
            ...prev,
            status: job.status,
            progress: prog,
            result: job.result,
            error: job.error,
          };
          if (job.status === "completed" || job.status === "failed") {
            isTerminated = true;
            if (pollTimer) {
              clearInterval(pollTimer);
              pollTimer = null;
            }
            setTimeout(() => onDoneRef.current?.(next), 0);
          }
          return next;
        });
      } catch {
        /* ignore polling errors; WS handles live updates */
      }
    }

    // Poll immediately and every 1.5 seconds
    void poll();
    pollTimer = setInterval(poll, 1500);

    // Build WS URL: strip any /api/v1 or /ws suffix from base, then add /ws/jobs/:id
    const base = WS_BASE_URL.replace(/\/api\/v1\/?$/, "").replace(/\/ws\/?$/, "");
    const url = `${base}/ws/jobs/${jobId}?token=${encodeURIComponent(token)}`;

    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let retries = 0;
    const MAX_RETRIES = 5;

    function connect() {
      if (isTerminated) return;

      // Disarm and close any existing socket gracefully
      if (wsRef.current) {
        const prev = wsRef.current;
        wsRef.current = null;
        prev.onopen = null;
        prev.onmessage = null;
        prev.onerror = null;
        prev.onclose = null;
        if (prev.readyState === WebSocket.CONNECTING) {
          prev.onopen = () => {
            try { prev.close(1000); } catch { /* ignore */ }
          };
        } else if (prev.readyState === WebSocket.OPEN) {
          try { prev.close(1000); } catch { /* ignore */ }
        }
      }

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isTerminated) {
          try { ws.close(1000); } catch { /* ignore */ }
          return;
        }
        setState((s) => ({ ...s, connected: true }));
        retries = 0;
      };

      ws.onmessage = (evt) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(evt.data as string) as Record<string, unknown>;
        } catch {
          return;
        }

        setState((prev) => {
          const next: JobState = { ...prev };

          if (msg.type === "status" || msg.status) {
            next.status = (msg.status as JobStatus) ?? prev.status;
            if (msg.error) next.error = msg.error as string;
            if (msg.result) {
              next.result = msg.result as Record<string, unknown>;
              next.progress = {
                ...prev.progress,
                ...(msg.result as JobProgress),
              };
            }
          }
          if (msg.type === "progress" && msg.progress) {
            next.progress = {
              ...prev.progress,
              ...(msg.progress as JobProgress),
            };
          }

          // Trigger onDone for terminal states
          if (next.status === "completed" || next.status === "failed") {
            isTerminated = true;
            if (pollTimer) {
              clearInterval(pollTimer);
              pollTimer = null;
            }
            setTimeout(() => onDoneRef.current?.(next), 0);
          }

          return next;
        });
      };

      ws.onerror = () => {
        setState((s) => ({ ...s, connected: false }));
      };

      ws.onclose = () => {
        setState((s) => ({ ...s, connected: false }));
        if (!isTerminated && retries < MAX_RETRIES) {
          retries += 1;
          const delay = Math.min(1000 * 2 ** retries, 30_000);
          retryTimeout = setTimeout(connect, delay);
        }
      };
    }

    connect();

    return () => {
      isTerminated = true;
      if (pollTimer) clearInterval(pollTimer);
      if (retryTimeout) clearTimeout(retryTimeout);
      cleanup();
    };
  }, [jobId, cleanup]);

  return state;
}
