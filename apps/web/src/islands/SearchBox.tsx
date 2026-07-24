import { useMemo, useState } from "react";
import type { ExplorerData } from "@abraxas/schema";

interface Props {
  data: ExplorerData;
  base: string;
}

export default function SearchBox({ data, base }: Props) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return data.repos
      .filter((r) => r.type !== "external")
      .filter(
        (r) =>
          r.name.toLowerCase().includes(query) ||
          r.description.toLowerCase().includes(query) ||
          r.domain.toLowerCase().includes(query),
      )
      .slice(0, 12);
  }, [q, data.repos]);

  return (
    <div className="search-wrap">
      <label className="sr-only" htmlFor="explorer-search">
        Search repositories
      </label>
      <input
        id="explorer-search"
        className="search"
        placeholder="Search repos, domains…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoComplete="off"
      />
      {q && (
        <div
          className="search-results"
          role="listbox"
          aria-label="Search results"
        >
          <div className="search-results-meta">{hits.length} matches</div>
          {hits.map((r) => (
            <a
              key={r.name}
              role="option"
              className="search-hit"
              href={`${base}domains/${r.domain}/`}
            >
              {r.name}
              <div className="search-hit-sub">{r.domain}</div>
            </a>
          ))}
          {!hits.length && (
            <div className="search-empty">No matches</div>
          )}
        </div>
      )}
    </div>
  );
}
