import { norm, type Evidence } from "./model.js";
export function searchEvidence(
  all: Evidence[],
  input: {
    pointsLimit: 1000 | 2000;
    edition: string;
    rulesVersion?: string;
    query?: string;
    days?: number;
    limit?: number;
  },
  now = Date.now(),
) {
  const days = input.days ?? 90,
    cutoff = now - days * 86400000;
  const matching = all.filter(
    (e) =>
      !input.query ||
      norm(e.event + " " + e.summary + " " + (e.faction ?? "")).includes(
        norm(input.query),
      ),
  );
  const exact: Evidence[] = [],
    older: Evidence[] = [],
    uncertain: Evidence[] = [];
  for (const e of matching) {
    if (e.pointsLimit !== null && e.pointsLimit !== input.pointsLimit) continue;
    if (e.edition !== null && e.edition !== input.edition) continue;
    if (
      input.rulesVersion &&
      e.rulesVersion !== null &&
      e.rulesVersion !== input.rulesVersion
    )
      continue;
    if (
      e.kind === "research-lead" ||
      !e.eventDate ||
      e.pointsLimit === null ||
      !e.edition ||
      !e.rulesVersion ||
      !input.rulesVersion
    ) {
      uncertain.push(e);
      continue;
    }
    if (Date.parse(e.eventDate) > now) {
      uncertain.push(e);
      continue;
    }
    (Date.parse(e.eventDate) < cutoff ? older : exact).push(e);
  }
  const sort = (a: Evidence, b: Evidence) =>
    (b.eventDate ?? b.publishedAt ?? "").localeCompare(
      a.eventDate ?? a.publishedAt ?? "",
    );
  const n = input.limit ?? 10;
  return {
    matchingResults: exact.sort(sort).slice(0, n),
    historicalResults: older.sort(sort).slice(0, n),
    unverifiedResearchLeads: uncertain.sort(sort).slice(0, n),
    coverage: {
      matchedCount: exact.length,
      windowDays: days,
      sparse: exact.length < 5,
    },
    warning:
      "Public coverage is a selected sample. Unknown-format reports are research leads, not evidence for this points limit. Do not compute faction win rates from these results.",
  };
}
