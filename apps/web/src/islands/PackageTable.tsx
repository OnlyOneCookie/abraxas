import { useEffect, useMemo, useState } from "react";
import type { ExplorerData, Vulnerability } from "@abraxas/schema";

type SevKey = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

interface Props {
  data: ExplorerData;
}

export default function PackageTable({ data }: Props) {
  const reposWithPkgs = useMemo(() => {
    const set = new Set(data.packages.map((p) => p.repo));
    return [...set].sort();
  }, [data.packages]);

  const [repo, setRepo] = useState(reposWithPkgs[0] ?? "");
  const [sevFilter, setSevFilter] = useState<SevKey | null>(null);
  const [sort, setSort] = useState<"name" | "sev">("sev");
  const [repoQuery, setRepoQuery] = useState("");

  const vulnsByRepoPkg = useMemo(() => {
    const map = new Map<string, Vulnerability[]>();
    for (const v of data.vulnerabilities) {
      for (const r of v.repos) {
        const key = `${r}|${v.package.ecosystem}|${v.package.name}`;
        const list = map.get(key) ?? [];
        list.push(v);
        map.set(key, list);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => sevRank(a.severity) - sevRank(b.severity));
    }
    return map;
  }, [data.vulnerabilities]);

  const repoSevCounts = useMemo(() => {
    const out = new Map<string, Record<SevKey, number>>();
    for (const r of reposWithPkgs) {
      out.set(r, { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 });
    }
    for (const v of data.vulnerabilities) {
      if (!(v.severity in { CRITICAL: 1, HIGH: 1, MEDIUM: 1, LOW: 1 })) continue;
      for (const r of v.repos) {
        const c = out.get(r);
        if (c) c[v.severity as SevKey] += 1;
      }
    }
    return out;
  }, [data.vulnerabilities, reposWithPkgs]);

  const counts = useMemo(() => {
    const c: Record<SevKey, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };
    for (const v of data.vulnerabilities) {
      if (!v.repos.includes(repo)) continue;
      if (v.severity in c) c[v.severity as SevKey] += 1;
    }
    return c;
  }, [data.vulnerabilities, repo]);

  const visibleRepos = useMemo(() => {
    const q = repoQuery.trim().toLowerCase();
    return reposWithPkgs.filter((r) => {
      if (q && !r.toLowerCase().includes(q)) return false;
      if (!sevFilter) return true;
      return (repoSevCounts.get(r)?.[sevFilter] ?? 0) > 0;
    });
  }, [reposWithPkgs, repoQuery, sevFilter, repoSevCounts]);

  // Keep selection valid when severity filter hides the current project.
  useEffect(() => {
    if (!repo || visibleRepos.includes(repo)) return;
    if (visibleRepos[0]) setRepo(visibleRepos[0]);
  }, [repo, visibleRepos]);

  const list = useMemo(() => {
    const rows = data.packages.filter((p) => p.repo === repo);
    const enriched = rows.map((p) => {
      const vulns =
        vulnsByRepoPkg.get(`${repo}|${p.ecosystem}|${p.name}`) ?? [];
      return { ...p, vulns };
    });
    const filtered = sevFilter
      ? enriched.filter((p) =>
          p.vulns.some((v) => v.severity === sevFilter),
        )
      : enriched;
    filtered.sort((a, b) => {
      if (sort === "sev") {
        const d = sevRank(a.vulns[0]?.severity) - sevRank(b.vulns[0]?.severity);
        if (d !== 0) return d;
      }
      return a.name.localeCompare(b.name);
    });
    return filtered;
  }, [data.packages, repo, sort, sevFilter, vulnsByRepoPkg]);

  const nugetAudit = data.repos.find((r) => r.name === repo)?.nugetAudit;
  const mode = data.meta.vulnScan.mode ?? "direct";
  const pkgTotal = data.packages.filter((p) => p.repo === repo).length;

  function toggleSev(k: SevKey) {
    setSevFilter((prev) => (prev === k ? null : k));
    setSort("sev");
  }

  return (
    <div className="pkg-page">
      <div className="warn">
        <b>What I scan.</b> Mode: <code>{mode}</code>.{" "}
        {data.meta.vulnScan.coverageNote ??
          "Only direct public third-party deps. Transitive would need their private registry — I don’t have that."}
        {!data.meta.vulnScan.enabled && (
          <>
            {" "}
            Scan disabled
            {data.meta.vulnScan.reason
              ? ` (${data.meta.vulnScan.reason})`
              : ""}
            .
          </>
        )}
      </div>

      {nugetAudit?.enabled && (
        <p>
          <span className="badge ok" title={nugetAudit.evidence}>
            NuGet audit enabled
          </span>{" "}
          <span className="faint">
            Repo declares NU1902/NU1903 (GitHub Advisory) at build time.
          </span>
        </p>
      )}

      <div className="sevstrip" role="toolbar" aria-label="Severity filter">
        {(
          [
            ["CRITICAL", counts.CRITICAL, "crit"],
            ["HIGH", counts.HIGH, "high"],
            ["MEDIUM", counts.MEDIUM, "med"],
            ["LOW", counts.LOW, "low"],
          ] as const
        ).map(([k, n, tone]) => {
          const on = sevFilter === k;
          return (
            <button
              key={k}
              type="button"
              className={`sevcard sevcard-btn tone-${tone}${on ? " on" : ""}`}
              aria-pressed={on}
              onClick={() => toggleSev(k)}
              title={
                on
                  ? `Clear ${k} filter`
                  : `Show only packages with ${k} findings`
              }
            >
              <b style={{ color: n ? undefined : "#6e7681" }}>{n}</b>
              <span>{k}</span>
              <em className="sevcard-hint">{on ? "filtered" : "filter"}</em>
            </button>
          );
        })}
        <div className="sevcard sevcard-static">
          <b>{sevFilter ? list.length : pkgTotal}</b>
          <span>{sevFilter ? "matching" : "packages"}</span>
        </div>
        {sevFilter && (
          <button
            type="button"
            className="sev-clear"
            onClick={() => setSevFilter(null)}
          >
            Clear filter
          </button>
        )}
      </div>

      <div className="pkg-toolbar">
        <label className="pkg-search">
          <input
            type="search"
            placeholder="Filter projects…"
            value={repoQuery}
            onChange={(e) => setRepoQuery(e.target.value)}
            aria-label="Filter projects"
          />
        </label>
        <span className="faint pkg-count">
          {visibleRepos.length}/{reposWithPkgs.length}
          {sevFilter ? ` with ${sevFilter}` : " projects"}
        </span>
      </div>

      <div className="repo-grid" role="tablist" aria-label="Project">
        {visibleRepos.length === 0 ? (
          <p className="faint" style={{ margin: 0 }}>
            No projects match this filter.
          </p>
        ) : (
          visibleRepos.map((r) => {
            const c = repoSevCounts.get(r)!;
            const findings = c.CRITICAL + c.HIGH + c.MEDIUM + c.LOW;
            const eco =
              data.packages.find((p) => p.repo === r)?.ecosystem ?? "";
            return (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={r === repo}
                className={`repo-chip${r === repo ? " on" : ""}`}
                onClick={() => setRepo(r)}
              >
                <span className="repo-chip-name">{r}</span>
                <span className="repo-chip-meta">
                  <span className="eco">{eco}</span>
                  {findings > 0 ? (
                    <span className="repo-chip-findings">{findings}</span>
                  ) : null}
                </span>
              </button>
            );
          })
        )}
      </div>

      <div className="tblwrap">
        <table>
          <thead>
            <tr>
              <th>
                <button
                  type="button"
                  className="th-sort"
                  onClick={() => setSort("name")}
                >
                  Package{sort === "name" ? " ↓" : ""}
                </button>
              </th>
              <th>Ecosystem</th>
              <th>Declared</th>
              <th>Source</th>
              <th>
                <button
                  type="button"
                  className="th-sort"
                  onClick={() => setSort("sev")}
                >
                  Vulnerability{sort === "sev" ? " ↓" : ""}
                </button>
              </th>
              <th>Fixed</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={6} className="faint">
                  {sevFilter
                    ? `No ${sevFilter} findings in this project.`
                    : "No packages in this project."}
                </td>
              </tr>
            ) : (
              list.map((p) => {
                const shown = !p.osvEligible
                  ? []
                  : p.vulns.filter(
                      (v) => !sevFilter || v.severity === sevFilter,
                    );
                return (
                <tr key={`${p.name}-${p.dev}`}>
                  <td className="mono">
                    {p.name}
                    {p.dev ? <span className="eco"> dev</span> : null}
                    {p.scope === "first-party" ? (
                      <span className="eco"> first-party</span>
                    ) : null}
                  </td>
                  <td>
                    <span className="eco">{p.ecosystem}</span>
                  </td>
                  <td className="mono">
                    {p.declaredVersion ?? (
                      <span className="faint">unresolved</span>
                    )}
                  </td>
                  <td className="faint">{p.versionSource}</td>
                  <td>
                    {!p.osvEligible ? (
                      <span className="sev none">not scanned</span>
                    ) : shown.length ? (
                      <div className="vuln-stack">
                        {shown.map((v) => (
                          <VulnLine
                            key={`${v.id}-${v.package.installedVersion}`}
                            vuln={v}
                          />
                        ))}
                      </div>
                    ) : (
                      <span className="sev none">none known</span>
                    )}
                  </td>
                  <td className="mono">
                    {!p.osvEligible || !shown.length ? (
                      <span className="faint">—</span>
                    ) : (
                      <div className="vuln-stack">
                        {shown.map((v) => (
                          <FixedLine
                            key={`fix-${v.id}-${v.package.installedVersion}`}
                            vuln={v}
                          />
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FixedLine({ vuln }: { vuln: Vulnerability }) {
  const versions = vuln.fixedIn ?? [];
  if (!versions.length) {
    return <span className="faint">unknown</span>;
  }
  // Prefer a short display: lowest few fixed versions (OSV can list many ranges)
  const shown = versions.slice(0, 3);
  const extra = versions.length - shown.length;
  return (
    <span title={versions.join(", ")}>
      {shown.join(", ")}
      {extra > 0 ? (
        <span className="faint">{` +${extra}`}</span>
      ) : null}
    </span>
  );
}

function VulnLine({ vuln }: { vuln: Vulnerability }) {
  const parts: Array<{ version: string; score: number; label: string }> = [];
  if (vuln.cvssV3?.score != null) {
    parts.push({
      version: `v${vuln.cvssV3.version}`,
      score: vuln.cvssV3.score,
      label: severityFromScore(vuln.cvssV3.score),
    });
  }
  if (vuln.cvssV4?.score != null) {
    parts.push({
      version: `v${vuln.cvssV4.version}`,
      score: vuln.cvssV4.score,
      label: severityFromScore(vuln.cvssV4.score),
    });
  }

  const displayId =
    vuln.aliases.find((a) => /^CVE-/i.test(a)) ?? vuln.id;

  return (
    <span title={vuln.summary || undefined}>
      {parts.length > 0 ? (
        parts.map((p, i) => (
          <span key={p.version}>
            {i > 0 ? " / " : null}
            <span className="mono">
              {p.version} {p.score.toFixed(1)}
            </span>{" "}
            <span className={`sev ${sevClass(p.label)}`}>{p.label}</span>
          </span>
        ))
      ) : (
        <span className={`sev ${sevClass(vuln.severity)}`}>
          {vuln.severity}
        </span>
      )}{" "}
      <a
        href={`https://osv.dev/vulnerability/${displayId}`}
        target="_blank"
        rel="noreferrer"
      >
        {displayId}
      </a>
    </span>
  );
}

function severityFromScore(score: number): string {
  if (score >= 9) return "CRITICAL";
  if (score >= 7) return "HIGH";
  if (score >= 4) return "MEDIUM";
  if (score > 0) return "LOW";
  return "UNKNOWN";
}

function sevRank(s?: string): number {
  switch (s) {
    case "CRITICAL":
      return 0;
    case "HIGH":
      return 1;
    case "MEDIUM":
      return 2;
    case "LOW":
      return 3;
    default:
      return 9;
  }
}

function sevClass(s: string): string {
  if (s === "CRITICAL") return "crit";
  if (s === "HIGH") return "high";
  if (s === "MEDIUM") return "med";
  if (s === "LOW") return "low";
  return "none";
}
