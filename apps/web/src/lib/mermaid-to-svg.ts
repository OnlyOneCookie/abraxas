/**
 * Pre-render sequence diagrams to SVG at build time.
 * Accepts the Mermaid `sequenceDiagram` subset emitted by the pipeline.
 * No Mermaid client runtime is shipped to the browser.
 */
export async function renderMermaidSvgs(
  diagrams: Array<{ id: string; mermaidSource: string }>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const d of diagrams) {
    out.set(d.id, sequenceMermaidToSvg(d.mermaidSource));
  }
  return out;
}

export function sequenceMermaidToSvg(source: string): string {
  const lines = source
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const participants: Array<{ id: string; label: string }> = [];
  const messages: Array<{
    from: string;
    to: string;
    text: string;
    self?: boolean;
  }> = [];
  const notes: string[] = [];

  for (const line of lines) {
    if (line === "sequenceDiagram") continue;
    const p = line.match(/^participant\s+(\w+)(?:\s+as\s+(.+))?$/i);
    if (p) {
      participants.push({ id: p[1]!, label: p[2] ?? p[1]! });
      continue;
    }
    const note = line.match(/^Note\s+over\s+[^:]+:\s*(.+)$/i);
    if (note) {
      notes.push(note[1]!);
      continue;
    }
    const msg = line.match(/^(\w+)->>(\w+):\s*(.+)$/);
    if (msg) {
      messages.push({
        from: msg[1]!,
        to: msg[2]!,
        text: msg[3]!,
        self: msg[1] === msg[2],
      });
    }
  }

  if (!participants.length) {
    participants.push({ id: "A", label: "Domain" });
  }

  const margin = 70;
  const laneGap =
    participants.length > 1
      ? Math.max(140, Math.min(220, 900 / (participants.length - 1)))
      : 200;
  const width = margin * 2 + laneGap * Math.max(participants.length - 1, 1);
  const topY = 36;
  const stepY0 = 90;
  const stepGap = 44;
  const height = stepY0 + messages.length * stepGap + notes.length * 28 + 40;

  const xOf = (id: string) => {
    const i = Math.max(
      0,
      participants.findIndex((p) => p.id === id),
    );
    return margin + i * laneGap;
  };

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Heuristic sequence diagram">`,
  );
  parts.push(`<rect width="100%" height="100%" fill="#161b22"/>`);

  for (const p of participants) {
    const x = xOf(p.id);
    parts.push(
      `<line x1="${x}" x2="${x}" y1="${topY + 26}" y2="${height - 20}" stroke="#30363d" stroke-dasharray="3 4"/>`,
    );
    parts.push(
      `<rect x="${x - 58}" y="${topY - 2}" width="116" height="28" rx="6" fill="#1c2230" stroke="#a371f7"/>`,
    );
    parts.push(
      `<text x="${x}" y="${topY + 16}" text-anchor="middle" fill="#e6edf3" font-size="11" font-family="IBM Plex Sans, sans-serif">${escapeXml(p.label)}</text>`,
    );
  }

  messages.forEach((m, idx) => {
    const y = stepY0 + idx * stepGap;
    const x1 = xOf(m.from);
    const x2 = xOf(m.to);
    const col = /OTP|HSM|Sign|factor/i.test(m.text) ? "#f85149" : "#8b949e";
    if (m.self) {
      parts.push(
        `<path d="M${x1 + 4} ${y - 6} h34 v14 h-34" fill="none" stroke="${col}" stroke-width="1.6"/>`,
      );
      parts.push(
        `<text x="${x1 + 44}" y="${y + 2}" fill="${col}" font-size="10.5" font-family="IBM Plex Sans, sans-serif">${escapeXml(`${idx + 1}. ${m.text}`)}</text>`,
      );
    } else {
      const dir = x2 > x1 ? 1 : -1;
      parts.push(
        `<line x1="${x1}" y1="${y}" x2="${x2 - dir * 7}" y2="${y}" stroke="${col}" stroke-width="1.6"/>`,
      );
      parts.push(
        `<path d="M${x2} ${y} l${-7 * dir} -4 v8 z" fill="${col}"/>`,
      );
      parts.push(
        `<text x="${(x1 + x2) / 2}" y="${y - 6}" text-anchor="middle" fill="#c9d1d9" font-size="10.5" font-family="IBM Plex Sans, sans-serif">${escapeXml(`${idx + 1}. ${m.text}`)}</text>`,
      );
    }
  });

  notes.forEach((n, i) => {
    const y = stepY0 + messages.length * stepGap + 16 + i * 22;
    parts.push(
      `<text x="${width / 2}" y="${y}" text-anchor="middle" fill="#8b949e" font-size="11" font-family="IBM Plex Sans, sans-serif">${escapeXml(n)}</text>`,
    );
  });

  parts.push("</svg>");
  return parts.join("");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
