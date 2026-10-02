import { createHash } from "node:crypto";
import { load } from "cheerio";
import { parse as parseYaml } from "yaml";
import { parseFaction } from "./vendor/mfm/parse.js";
import { FactionContent } from "./vendor/mfm/model.js";
import {
  norm,
  SnapshotSchema,
  type Snapshot,
  type Source,
  type Unit,
} from "./model.js";
import { Store } from "./store.js";
import { extractArticle } from "./articles.js";

export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
const approvedHosts = new Set([
  "mfm.warhammer-community.com",
  "www.warhammer-community.com",
  "assets.warhammer-community.com",
  "api.github.com",
  "raw.githubusercontent.com",
  "www.goonhammer.com",
  "www.tabletopbattles.com",
]);
export async function publicFetch(url: string, redirects = 0): Promise<string> {
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    !approvedHosts.has(u.hostname) ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443")
  )
    throw new Error("Source URL is not approved");
  const r = await fetch(u, {
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
    headers: {
      "User-Agent": "BlackTemplarsToolkit/0.1 (personal rules research)",
      Accept: "text/html,application/json,text/plain,*/*",
    },
  });
  if ([301, 302, 303, 307, 308].includes(r.status)) {
    await r.body?.cancel();
    if (redirects >= 3 || !r.headers.get("location"))
      throw new Error("Source redirect limit exceeded");
    return publicFetch(
      new URL(r.headers.get("location")!, u).toString(),
      redirects + 1,
    );
  }
  if (!r.ok)
    throw new Error(
      `Source returned HTTP ${r.status}: ${u.hostname}${u.pathname}`,
    );
  const reader = r.body?.getReader();
  if (!reader) throw new Error("Empty source response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 15_000_000) {
      await reader.cancel();
      throw new Error("Source exceeds 15 MB");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
type Fetcher = (url: string) => Promise<string>;
// Catalogue data is untrusted input. No source text is executed or treated as instructions.
function objects(value: unknown, out: any[] = []): any[] {
  if (Array.isArray(value)) for (const v of value) objects(v, out);
  else if (value && typeof value === "object") {
    out.push(value);
    for (const v of Object.values(value))
      if (v && typeof v === "object") objects(v, out);
  }
  return out;
}
function resolveProfiles(entry: any, index: Map<string, any>) {
  const nodes = objects(entry);
  const seen = new Set(nodes.filter((n) => n.id).map((n) => n.id));
  // Follow profile/rule/equipment references only, with a hard bound and cycle guard.
  for (let i = 0; i < nodes.length && i < 12000; i++) {
    const n = nodes[i];
    if (
      n.targetId &&
      [
        "profile",
        "rule",
        "infoGroup",
        "selectionEntry",
        "selectionEntryGroup",
      ].includes(n.type) &&
      !seen.has(n.targetId)
    ) {
      seen.add(n.targetId);
      const target = index.get(n.targetId);
      if (!target) continue;
      const children = objects(target);
      // Selection links can point to the entire enhancement menu. Do not attach
      // every possible enhancement's profiles to an unenhanced unit.
      if (
        n.type.startsWith("selection") &&
        (!children.some((x) => /Weapons/.test(x.typeName ?? "")) ||
          children.filter((x) => x.typeName).length > 30)
      )
        continue;
      nodes.push(...children);
    }
  }
  const profiles = new Map<
    string,
    { name: string; type: string; values: Record<string, string> }
  >();
  for (const n of nodes)
    if (n.typeName && Array.isArray(n.characteristics))
      profiles.set(n.id, {
        name: String(n.name),
        type: String(n.typeName),
        values: Object.fromEntries(
          n.characteristics.map((c: any) => [c.name, String(c.$text ?? "")]),
        ),
      });
  return { nodes, profiles: [...profiles.values()] };
}

export async function buildSnapshot(
  fetcher: Fetcher = publicFetch,
): Promise<Snapshot> {
  const at = new Date().toISOString();
  const sources: Source[] = [];
  async function source(
    id: string,
    url: string,
    kind: Source["kind"],
    version: string,
  ) {
    const text = await fetcher(url);
    sources.push({
      id,
      url,
      kind,
      version,
      retrievedAt: at,
      sha256: digest(text),
    });
    return text;
  }
  const rawBase = "https://raw.githubusercontent.com/BSData/wh40k-11e/";
  const commit = JSON.parse(
    await fetcher("https://api.github.com/repos/BSData/wh40k-11e/commits/main"),
  ).sha;
  if (!/^[0-9a-f]{40}$/.test(commit))
    throw new Error("Invalid catalogue revision");
  const pointsHtml = await source(
    "mfm-bt",
    "https://mfm.warhammer-community.com/en/black-templars",
    "official",
    "pending",
  );
  const points = FactionContent.parse(
    parseFaction(
      pointsHtml,
      "black-templars",
      "Black Templars",
      new Set(["space marines"]),
    ),
  );
  sources[0].version = points.version;
  const core = JSON.parse(
    await source(
      "bsdata-core",
      rawBase + commit + "/Warhammer%2040%2C000.json",
      "community",
      commit,
    ),
  ).gameSystem;
  if (!/11th/.test(core?.name ?? ""))
    throw new Error("Unsupported edition: refusing to mix rules");
  const metaUrl =
    "https://raw.githubusercontent.com/BSData/wh40k-11e-mfm/main/data/meta.yaml";
  const meta = parseYaml(
    await source("mfm-transcription", metaUrl, "community", points.version),
  );
  if (
    String(meta.version) !== points.version ||
    typeof meta.muster !== "string"
  )
    throw new Error("MFM transcription and official points versions disagree");
  const catalogueNames = [
    "Black Templars",
    "Space Marines",
    "Agents of the Imperium",
    "Imperial Knights - Library",
  ];
  const catalogues: { name: string; id: string; data: any }[] = [];
  const gaps: string[] = [];
  for (const name of catalogueNames) {
    const id = "bsdata-" + norm(name).replaceAll(" ", "-");
    try {
      const data = JSON.parse(
        await source(
          id,
          rawBase +
            commit +
            "/" +
            encodeURIComponent("Imperium - " + name + ".json"),
          "community",
          commit,
        ),
      ).catalogue;
      if (!data) throw new Error("Missing catalogue");
      catalogues.push({ name, id, data });
    } catch (e) {
      if (name === "Black Templars" || name === "Space Marines") throw e;
      gaps.push(`${name} source unavailable: ${String(e)}`);
    }
  }
  const index = new Map<string, any>();
  for (const c of [core, ...catalogues.map((c) => c.data)])
    for (const n of objects(c)) if (n.id) index.set(n.id, n);
  const rules: Snapshot["rules"] = [];
  const units: Unit[] = [];
  const factionPoints = [
    { faction: "Black Templars", sourceId: "mfm-bt", points },
  ];
  for (const [faction, slug] of [
    ["Imperial Agents", "imperial-agents"],
    ["Imperial Knights", "imperial-knights"],
  ]) {
    try {
      const sid = "mfm-" + slug;
      const p = FactionContent.parse(
        parseFaction(
          await source(
            sid,
            `https://mfm.warhammer-community.com/en/${slug}`,
            "official",
            "pending",
          ),
          slug,
          faction,
        ),
      );
      sources.find((s) => s.id === sid)!.version = p.version;
      if (p.version !== points.version)
        throw new Error("Allied points use a different version");
      factionPoints.push({ faction, sourceId: sid, points: p });
    } catch (e) {
      gaps.push(`Allied points unavailable for ${faction}: ${String(e)}`);
    }
  }
  for (const group of factionPoints)
    for (const p of group.points.units) {
      // Agents publishes both in-faction and allied prices. For an Imperium army,
      // select its explicitly labelled allied section, never the cheaper base row.
      if (
        group.faction === "Imperial Agents" &&
        group.points.units.some((u) =>
          /every model.*imperium/i.test(u.groupTitle ?? ""),
        ) &&
        !/every model.*imperium/i.test(p.groupTitle ?? "")
      )
        continue;
      // Prefer chapter-specific entries, then generic marines. Only the official BT page establishes the main unit pool.
      let match: { entry: any; sourceId: string } | undefined;
      for (const c of catalogues) {
        const entry = (c.data.sharedSelectionEntries ?? []).find(
          (e: any) =>
            norm(e.name) === norm(p.name) && ["unit", "model"].includes(e.type),
        );
        if (entry) {
          match = { entry, sourceId: c.id };
          break;
        }
      }
      const id = norm(group.faction + " " + p.name).replaceAll(" ", "-");
      const resolved = match
        ? resolveProfiles(match.entry, index)
        : { nodes: [], profiles: [] };
      const keywords = (match?.entry.categoryLinks ?? [])
        .map((k: any) => String(k.name ?? index.get(k.targetId)?.name ?? ""))
        .filter(Boolean);
      const equipment = [
        ...new Set<string>(
          resolved.profiles
            .filter((p) => /Weapons/.test(p.type))
            .map((p) => p.name.replace(/^➤\s*/, "").split(" - ")[0]),
        ),
      ];
      const unitGaps = [
        "Equipment combinations and conditional datasheet restrictions require review.",
      ];
      if (!match)
        unitGaps.push(
          "No exact matching community datasheet; profile and keyword coverage missing.",
        );
      if (group.faction !== "Black Templars")
        unitGaps.push(
          "Allied inclusion limits and eligibility are not yet verified.",
        );
      units.push({
        ...p,
        id,
        faction: group.faction,
        sourceIds: [group.sourceId, ...(match ? [match.sourceId] : [])],
        keywords,
        aliases: [],
        profiles: resolved.profiles,
        equipment,
        gaps: unitGaps,
      });
      if (match)
        for (const profile of resolved.profiles.filter(
          (p) => !/Weapons|^Unit$/.test(p.type),
        )) {
          rules.push({
            id: digest(id + profile.name).slice(0, 20),
            name: profile.name,
            text: Object.entries(profile.values)
              .map(([k, v]) => `${k}: ${v}`)
              .join("\n"),
            sourceId: match.sourceId,
            unitId: id,
          });
        }
    }
  for (const c of [{ id: "bsdata-core", data: core }, ...catalogues]) {
    for (const n of objects(c.data).filter((n) => n.description && n.name))
      rules.push({
        id: digest(c.id + n.id).slice(0, 20),
        name: n.name,
        text: String(n.description),
        sourceId: c.id,
      });
  }
  rules.push(
    {
      id: "muster",
      name: "Muster Armies (community transcription of official MFM)",
      text: meta.muster,
      sourceId: "mfm-transcription",
    },
    {
      id: "points-notes",
      name: "Points, unit sizes and requisition thresholds",
      text: String(meta.notes),
      sourceId: "mfm-transcription",
    },
  );
  const readme = (core.forceEntries ?? [])
    .map((f: any) => f.readme ?? "")
    .join("\n");
  if (readme)
    rules.push({
      id: "catalogue-status",
      name: "Community catalogue maintenance status",
      text: readme,
      sourceId: "bsdata-core",
    });
  const limits: Snapshot["muster"]["limits"] = {
    "1000": { dp: 0, enhancements: 0, copies: 0 },
    "2000": { dp: 0, enhancements: 0, copies: 0 },
  };
  for (const [size, label] of [
    [1000, "INCURSION"],
    [2000, "STRIKE FORCE"],
  ] as const) {
    const row = meta.muster
      .split("\n")
      .find((s: string) => s.includes(label) && s.includes("|"));
    const values = row
      ?.split("|")
      .map((s: string) => s.trim())
      .filter(Boolean);
    if (
      !values ||
      Number(values[1]) !== size ||
      values.slice(2, 5).some((v: string) => !/^\d+$/.test(v))
    )
      throw new Error("Muster table format changed");
    limits[size] = {
      dp: Number(values[2]),
      enhancements: Number(values[3]),
      copies: Number(values[4]),
    };
  }
  gaps.push(
    "Community profiles and conditional rules are reference data; not a complete executable rules interpretation.",
    "Detachment-specific restrictions, allied permissions and transport exceptions require verification.",
    "Official FAQ/balance document coverage and mission-pack currency are not automatically certified.",
    "Muster rules are a community transcription; verify against the official app or MFM panel.",
  );
  if (/except|will be updated|after.*Saturday/i.test(readme))
    gaps.push(
      "Upstream catalogue reports pending faction updates; see catalogue-status.",
    );
  const snapshot: Snapshot = {
    id:
      "11e-" +
      at.slice(0, 10) +
      "-" +
      digest(JSON.stringify(sources)).slice(0, 12),
    edition: "11th",
    createdAt: at,
    sources,
    units,
    detachments: points.detachments,
    rules: [...new Map(rules.map((r) => [r.id, r])).values()],
    muster: { verified: false, sourceId: "mfm-transcription", limits },
    coverage: {
      status: "partial",
      gaps,
      rulesVersion: "MFM " + points.version,
      notes: [
        "Official MFM fetched directly. Community catalogue pinned to commit " +
          commit,
        "No Legends included in the default official-page scrape.",
      ],
    },
  };
  return SnapshotSchema.parse(snapshot);
}
export async function refresh(store: Store, fetcher: Fetcher = publicFetch) {
  try {
    const candidate = await buildSnapshot(fetcher);
    const previous = store.active();
    if (previous && candidate.units.length < previous.units.length * 0.8)
      throw new Error("Catalogue shrank by over 20%; review before activation");
    store.activate(candidate);
    store.recordRefresh(
      true,
      `Activated ${candidate.id}; ${candidate.units.length} units; ${candidate.coverage.status} coverage`,
    );
    return candidate;
  } catch (e) {
    store.recordRefresh(false, String(e));
    throw e;
  }
}
export async function refreshResearch(
  store: Store,
  fetcher: Fetcher = publicFetch,
) {
  const url =
    "https://www.goonhammer.com/category/40k-competitive-innovations/feed/";
  const xml = await fetcher(url);
  const $ = load(xml, { xmlMode: true });
  if (!$("item").length) throw new Error("Tournament feed empty or changed");
  let count = 0;
  $("item")
    .slice(0, 30)
    .each((_, item) => {
      const title = $(item).find("title").text();
      const link = $(item).find("link").text();
      if (!link.startsWith("https://")) return;
      const rawDate = $(item).find("pubDate").text();
      const d = new Date(rawDate);
      store.putEvidence({
        id: digest(link).slice(0, 24),
        event: title,
        eventDate: null,
        publishedAt: Number.isNaN(d.valueOf()) ? null : d.toISOString(),
        pointsLimit: null,
        edition: /11th/i.test(title) ? "11th" : null,
        rulesVersion: null,
        faction: null,
        placing: null,
        record: null,
        summary:
          "Public competitive coverage discovered. Event, list and rules details need extraction and review; not a verified event result.",
        url: link,
        retrievedAt: new Date().toISOString(),
        kind: "research-lead",
      });
      count++;
    });
  // Discovery is useful even when a publisher blocks article bodies. Preserve that
  // distinction instead of silently converting headlines into event evidence.
  const leads = store
    .evidence()
    .filter((e) => e.kind === "research-lead")
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, 10);
  for (let i = 0; i < leads.length; i += 2) {
    await Promise.all(
      leads.slice(i, i + 2).map(async (lead) => {
        try {
          store.putEvidence(extractArticle(await fetcher(lead.url), lead));
        } catch (e) {
          store.putEvidence({
            ...lead,
            summary:
              "Article unavailable during refresh. " +
              String(e).slice(0, 350) +
              "; event details remain unverified.",
          });
        }
      }),
    );
  }
  return count;
}
