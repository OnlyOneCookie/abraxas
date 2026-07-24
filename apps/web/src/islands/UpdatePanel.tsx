import { useCallback, useEffect, useRef, useState } from "react";
import { EXPLORER_ACTIONS_WORKFLOW, SOURCE_ORG } from "../lib/site";

const STORAGE_KEY = "abraxas-explorer-update-v2";
const isDev = import.meta.env.DEV;

type VisualStatus = "uptodate" | "available" | "updating" | "error";

interface Persisted {
  visual: VisualStatus;
  updateAvailable: boolean;
  message: string;
  requestedAt: string | null;
  checkedAt: string | null;
  seenGeneratedAt: string | null;
}

interface ServerStatus {
  phase: string;
  message: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  generatedAt?: string | null;
  error?: string | null;
  updateAvailable?: boolean | null;
  checkedAt?: string | null;
  skipped?: boolean;
}

interface Props {
  generatedAt: string;
  repoCount: number;
  triggers: string[];
  pipelineVersion: string;
}

function loadPersisted(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Persisted) : null;
  } catch {
    return null;
  }
}

function savePersisted(p: Persisted) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function sourceLabel(triggers: string[]): string {
  if (triggers.includes("fixtures")) return "Fixtures";
  if (triggers.includes("update-now") || triggers.includes("manual-ui")) {
    return "Update now";
  }
  if (triggers.includes("manual")) return "CLI";
  if (triggers.includes("schedule")) {
    return triggers.includes("vuln-only") ? "Nightly (vulns)" : "Nightly";
  }
  if (triggers.includes("repository_dispatch")) return "Org webhook";
  if (triggers.includes("workflow_dispatch")) return "Actions";
  return triggers[0] ?? "—";
}

function statusLabel(visual: VisualStatus, production: boolean): string {
  switch (visual) {
    case "updating":
      return production ? "Refresh queued" : "Updating";
    case "available":
      return "Update available";
    case "error":
      return "Check failed";
    default:
      return "Up to date";
  }
}

export default function UpdatePanel({
  generatedAt,
  repoCount,
  triggers,
  pipelineVersion,
}: Props) {
  const [visual, setVisual] = useState<VisualStatus>("uptodate");
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [requestedAt, setRequestedAt] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const pollRef = useRef<number | null>(null);

  const persist = useCallback(
    (next: {
      visual: VisualStatus;
      updateAvailable: boolean;
      requestedAt: string | null;
      checkedAt: string | null;
    }) => {
      setVisual(next.visual);
      setUpdateAvailable(next.updateAvailable);
      setRequestedAt(next.requestedAt);
      setCheckedAt(next.checkedAt);
      savePersisted({
        ...next,
        message: statusLabel(next.visual, !isDev),
        seenGeneratedAt: generatedAt,
      });
    },
    [generatedAt],
  );

  const stopPoll = useCallback(() => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const applyServer = useCallback(
    (s: ServerStatus) => {
      if (s.phase === "running") {
        persist({
          visual: "updating",
          updateAvailable: true,
          requestedAt: s.startedAt ?? requestedAt,
          checkedAt: s.checkedAt ?? checkedAt,
        });
        return;
      }
      if (s.phase === "error") {
        persist({
          visual: "error",
          updateAvailable: Boolean(s.updateAvailable),
          requestedAt: s.startedAt ?? requestedAt,
          checkedAt: s.checkedAt ?? checkedAt,
        });
        return;
      }
      if (s.phase === "skipped" || s.skipped) {
        persist({
          visual: "uptodate",
          updateAvailable: false,
          requestedAt: s.startedAt ?? requestedAt,
          checkedAt: s.checkedAt ?? new Date().toISOString(),
        });
        return;
      }
      if (s.phase === "success") {
        const fresh =
          s.generatedAt != null && s.generatedAt !== generatedAt;
        persist({
          visual: "uptodate",
          updateAvailable: false,
          requestedAt: s.startedAt ?? requestedAt,
          checkedAt: s.checkedAt ?? s.finishedAt ?? checkedAt,
        });
        if (fresh) {
          window.setTimeout(() => window.location.reload(), 400);
        }
        return;
      }
      if (typeof s.updateAvailable === "boolean") {
        persist({
          visual: s.updateAvailable ? "available" : "uptodate",
          updateAvailable: s.updateAvailable,
          requestedAt,
          checkedAt: s.checkedAt ?? checkedAt,
        });
      }
    },
    [persist, requestedAt, checkedAt, generatedAt],
  );

  useEffect(() => {
    const stored = loadPersisted();
    if (stored?.seenGeneratedAt && stored.seenGeneratedAt !== generatedAt) {
      persist({
        visual: "uptodate",
        updateAvailable: false,
        requestedAt: stored.requestedAt,
        checkedAt: stored.checkedAt,
      });
    } else if (stored) {
      setVisual(stored.visual);
      setUpdateAvailable(stored.updateAvailable);
      setRequestedAt(stored.requestedAt);
      setCheckedAt(stored.checkedAt);
    } else {
      persist({
        visual: "uptodate",
        updateAvailable: false,
        requestedAt: null,
        checkedAt: null,
      });
    }
    setHydrated(true);

    if (!isDev) return () => stopPoll();

    void (async () => {
      try {
        const res = await fetch("/api/update/status", { cache: "no-store" });
        if (!res.ok) return;
        const s = (await res.json()) as ServerStatus;
        applyServer(s);
        if (s.phase === "running") {
          pollRef.current = window.setInterval(async () => {
            const r = await fetch("/api/update/status", { cache: "no-store" });
            if (!r.ok) return;
            const st = (await r.json()) as ServerStatus;
            applyServer(st);
            if (st.phase !== "running") stopPoll();
          }, 1500);
        }
      } catch {
        /* ignore */
      }
    })();

    return () => stopPoll();
  }, [generatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const onCheck = async () => {
    if (!isDev) {
      // Static Pages: open Actions so you can see the latest run / queue a refresh.
      window.open(EXPLORER_ACTIONS_WORKFLOW, "_blank", "noopener,noreferrer");
      persist({
        visual: "uptodate",
        updateAvailable: true,
        requestedAt,
        checkedAt: new Date().toISOString(),
      });
      return;
    }
    setChecking(true);
    try {
      const res = await fetch("/api/update/check", { method: "POST" });
      if (!res.ok) {
        persist({
          visual: "error",
          updateAvailable: false,
          requestedAt,
          checkedAt: new Date().toISOString(),
        });
        return;
      }
      const s = (await res.json()) as ServerStatus;
      applyServer(s);
    } catch {
      persist({
        visual: "error",
        updateAvailable: false,
        requestedAt,
        checkedAt: new Date().toISOString(),
      });
    } finally {
      setChecking(false);
    }
  };

  const onUpdate = async () => {
    if (!isDev) {
      const at = new Date().toISOString();
      persist({
        visual: "updating",
        updateAvailable: true,
        requestedAt: at,
        checkedAt,
      });
      window.open(EXPLORER_ACTIONS_WORKFLOW, "_blank", "noopener,noreferrer");
      return;
    }
    stopPoll();
    const at = new Date().toISOString();
    persist({
      visual: "updating",
      updateAvailable: true,
      requestedAt: at,
      checkedAt,
    });
    try {
      const res = await fetch("/api/update/run", { method: "POST" });
      if (!res.ok) {
        persist({
          visual: "error",
          updateAvailable: true,
          requestedAt: at,
          checkedAt,
        });
        return;
      }
      pollRef.current = window.setInterval(async () => {
        const r = await fetch("/api/update/status", { cache: "no-store" });
        if (!r.ok) return;
        const st = (await r.json()) as ServerStatus;
        applyServer(st);
        if (st.phase !== "running") stopPoll();
      }, 1500);
    } catch {
      persist({
        visual: "error",
        updateAvailable: true,
        requestedAt: at,
        checkedAt,
      });
    }
  };

  if (!hydrated) return <div className="upd" aria-hidden="true" />;

  const tone =
    visual === "updating"
      ? "upd-blue"
      : visual === "available"
        ? "upd-orange"
        : visual === "error"
          ? "upd-error"
          : "upd-green";

  return (
    <div className={`upd ${tone}`}>
      <div className="upd-head">
        <div className="upd-status-line">
          <span className="upd-dot" aria-hidden="true" />
          <span className="upd-status-text">
            {statusLabel(visual, !isDev)}
          </span>
        </div>
        <button
          type="button"
          className="upd-check"
          onClick={() => void onCheck()}
          disabled={checking || (isDev && visual === "updating")}
          title={
            isDev
              ? "Check if an update is available"
              : "Open GitHub Actions to refresh data"
          }
          aria-label={isDev ? "Check for updates" : "Open refresh workflow"}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              fill="currentColor"
              d="M8 1.5a6.5 6.5 0 1 0 6.4 7.2h-1.52A5 5 0 1 1 8 3v2.5L11.5 3 8 .5V1.5z"
            />
          </svg>
        </button>
      </div>

      <dl className="upd-meta">
        <div>
          <dt>Source org</dt>
          <dd>{SOURCE_ORG}</dd>
        </div>
        <div>
          <dt>Repositories</dt>
          <dd>{repoCount}</dd>
        </div>
        <div>
          <dt>Latest pull</dt>
          <dd>{formatWhen(generatedAt)}</dd>
        </div>
        <div>
          <dt>Last run</dt>
          <dd>{sourceLabel(triggers)}</dd>
        </div>
        <div>
          <dt>Pipeline</dt>
          <dd>v{pipelineVersion}</dd>
        </div>
        <div>
          <dt>Requested</dt>
          <dd>{formatWhen(requestedAt)}</dd>
        </div>
        {checkedAt && (
          <div>
            <dt>Last check</dt>
            <dd>{formatWhen(checkedAt)}</dd>
          </div>
        )}
      </dl>

      {!isDev && (
        <>
          <button
            type="button"
            className="upd-btn primary"
            onClick={() => void onUpdate()}
          >
            Refresh via Actions
          </button>
          <p className="upd-hint">
            Opens Actions — hit <b>Run workflow</b>, wait until it finishes,
            then reload this page.
          </p>
        </>
      )}

      {isDev && updateAvailable && visual !== "updating" && (
        <button
          type="button"
          className="upd-btn primary"
          onClick={() => void onUpdate()}
        >
          Update now
        </button>
      )}
      {isDev && visual === "updating" && (
        <button type="button" className="upd-btn primary" disabled>
          Updating…
        </button>
      )}
    </div>
  );
}
