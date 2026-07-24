import { useEffect, useRef, useState } from "react";
import type { ExplorerData } from "@abraxas/schema";
import cytoscape, { type Core } from "cytoscape";

const TYPE_COLOR: Record<string, string> = {
  service: "#f78166",
  webapp: "#58a6ff",
  proto: "#3fb950",
  docs: "#d29922",
  library: "#a371f7",
  app: "#39c5cf",
  infra: "#db61a2",
  external: "#6e7681",
  unclassified: "#8b949e",
};

interface Props {
  data: ExplorerData;
  base: string;
}

export default function ProjectGraph({ data, base }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const domains = [
    "all",
    ...[...new Set(data.repos.map((r) => r.domain))].filter(
      (d) => d !== "unclassified",
    ),
  ];
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!host.current) return;
    const elements: cytoscape.ElementDefinition[] = [];
    for (const r of data.repos) {
      elements.push({
        data: {
          id: r.name,
          label: short(r.name),
          domain: r.domain,
          type: r.type,
          sec: r.security.critical ? 1 : 0,
          href: `${base.replace(/\/?$/, "/") }domains/${r.domain}/`,
        },
      });
    }
    for (const e of data.projectLinks) {
      if (
        !data.repos.some((r) => r.name === e.sourceRepo) ||
        !data.repos.some((r) => r.name === e.targetRepo)
      ) {
        continue;
      }
      elements.push({
        data: {
          id: `${e.sourceRepo}->${e.targetRepo}-${e.kind}`,
          source: e.sourceRepo,
          target: e.targetRepo,
          label: e.version ?? "",
          kind: e.kind,
        },
      });
    }

    const cy = cytoscape({
      container: host.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "font-size": 10,
            color: "#c9d1d9",
            "text-valign": "top",
            "text-margin-y": -8,
            "text-wrap": "wrap",
            "text-max-width": "90px",
            "background-color": (ele) =>
              TYPE_COLOR[ele.data("type")] ?? "#8b949e",
            width: 18,
            height: 18,
            "border-width": (ele) => (ele.data("sec") ? 2.5 : 1),
            "border-color": (ele) =>
              ele.data("sec") ? "#f85149" : "#0d1117",
          },
        },
        {
          selector: "edge",
          style: {
            width: 1.1,
            "line-color": "#30363d",
            "target-arrow-color": "#30363d",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "control-point-step-size": 40,
            label: "",
            "font-size": 8,
            color: "#3fb950",
            "text-rotation": "autorotate",
            "text-background-color": "#0d1117",
            "text-background-opacity": 0.85,
            "text-background-padding": "2px",
          },
        },
        {
          selector: "edge.edge-hot",
          style: {
            label: "data(label)",
            "line-color": "#484f58",
            width: 1.6,
          },
        },
        {
          selector: ".faded",
          style: { opacity: 0.1 },
        },
      ],
      layout: {
        name: "cose",
        animate: false,
        padding: 80,
        nodeRepulsion: () => 12000,
        idealEdgeLength: () => 140,
        edgeElasticity: () => 40,
        nestingFactor: 1.2,
        gravity: 0.2,
        numIter: 2000,
        initialTemp: 300,
        coolingFactor: 0.95,
        minTemp: 1.0,
        componentSpacing: 140,
        nodeOverlap: 28,
        randomize: true,
      },
    });

    cy.on("tap", "node", (evt) => {
      const href = evt.target.data("href") as string;
      if (href) window.location.href = href;
    });

    cy.on("mouseover", "node", (evt) => {
      const n = evt.target;
      const neighborhood = n.closedNeighborhood();
      cy.elements().addClass("faded");
      neighborhood.removeClass("faded");
      neighborhood.edges().addClass("edge-hot");
    });
    cy.on("mouseout", "node", () => {
      cy.elements().removeClass("faded");
      cy.edges().removeClass("edge-hot");
    });
    cy.on("mouseover", "edge", (evt) => {
      evt.target.addClass("edge-hot");
    });
    cy.on("mouseout", "edge", (evt) => {
      evt.target.removeClass("edge-hot");
    });

    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [data, base]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().forEach((n) => {
      const show =
        filter === "all" ||
        n.data("domain") === filter ||
        (filter === "shared" &&
          (n.data("domain") === "shared" || n.data("type") === "external"));
      n.style("display", show ? "element" : "none");
    });
    cy.edges().forEach((e) => {
      const s = e.source();
      const t = e.target();
      const show =
        filter === "all" ||
        s.data("domain") === filter ||
        t.data("domain") === filter;
      e.style("display", show ? "element" : "none");
    });
    cy.layout({
      name: "cose",
      animate: false,
      padding: 80,
      nodeRepulsion: () => 12000,
      idealEdgeLength: () => 140,
      edgeElasticity: () => 40,
      gravity: 0.2,
      numIter: 1500,
      componentSpacing: 140,
      nodeOverlap: 28,
      randomize: true,
    }).run();
  }, [filter]);

  return (
    <div>
      <div className="gfilters" role="toolbar" aria-label="Domain filter">
        {domains.map((d) => (
          <button
            key={d}
            type="button"
            className={filter === d ? "on" : undefined}
            onClick={() => setFilter(d)}
          >
            {d === "all"
              ? "All"
              : data.domains.find((x) => x.id === d)?.title ?? d}
          </button>
        ))}
      </div>
      <div
        className="graphwrap"
        ref={host}
        role="img"
        aria-label="Project link dependency graph"
        style={{ height: 720 }}
      />
      <p className="note">
        Repo-to-repo links only. Package CVEs live on the Packages tab. Edge
        versions show up when you hover.
      </p>
    </div>
  );
}

function short(name: string): string {
  if (name === "@abraxas/base-components") return "base-components";
  return name
    .replace(/^voting-/, "")
    .replace(/stimmunterlagen-online-/, "su-online-")
    .replace(/stimmunterlagen-offline-client-/, "offline-");
}
