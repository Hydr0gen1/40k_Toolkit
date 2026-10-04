// Rebuild the compact browser library from a pinned community catalogue and snapshot.
// Run: node scripts/import-mathhammer-library.mjs <Space Marines.json>
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const snapshot = JSON.parse(
  readFileSync("snapshots/11e-2026-10-02-ed0bb9d42646.json", "utf8"),
);
const sources = process.argv
  .slice(2)
  .map((path) => ({ path, raw: readFileSync(path, "utf8") }));
const catalogues = sources.map((s) => JSON.parse(s.raw).catalogue);
const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const walk = (v, out = []) => {
  if (Array.isArray(v)) v.forEach((x) => walk(x, out));
  else if (v && typeof v === "object") {
    out.push(v);
    Object.values(v)
      .filter((x) => x && typeof x === "object")
      .forEach((x) => walk(x, out));
  }
  return out;
};
const index = new Map(
  catalogues
    .flatMap((c) => walk(c))
    .filter((x) => x.id)
    .map((x) => [x.id, x]),
);
function profiles(entry) {
  const nodes = walk(entry),
    seen = new Set(nodes.map((n) => n.id));
  for (let i = 0; i < nodes.length && i < 12000; i++) {
    const n = nodes[i];
    if (
      !n.targetId ||
      seen.has(n.targetId) ||
      ![
        "profile",
        "rule",
        "infoGroup",
        "selectionEntry",
        "selectionEntryGroup",
      ].includes(n.type)
    )
      continue;
    seen.add(n.targetId);
    const target = index.get(n.targetId);
    if (!target) continue;
    const children = walk(target);
    if (
      n.type.startsWith("selection") &&
      (!children.some((x) => /Weapons/.test(x.typeName ?? "")) ||
        children.filter((x) => x.typeName).length > 30)
    )
      continue;
    nodes.push(...children);
  }
  return [
    ...new Map(
      nodes
        .filter((n) => n.typeName && Array.isArray(n.characteristics))
        .map((n) => [
          n.id,
          {
            name: n.name,
            type: n.typeName,
            values: Object.fromEntries(
              n.characteristics.map((c) => [c.name, String(c.$text ?? "")]),
            ),
          },
        ]),
    ).values(),
  ];
}
const selected = snapshot.units.filter((u) => u.faction === "Black Templars");
const library = selected.map((u) => ({
  ...u,
  origin:
    u.groupTitle === "Space Marines" ? "Codex Space Marines" : "Black Templars",
  btEligible: true,
}));
for (const catalogue of catalogues)
  for (const e of catalogue.sharedSelectionEntries ?? []) {
    if (
      !["unit", "model"].includes(e.type) ||
      /\[(Legends|Crucible)\]/i.test(e.name) ||
      /Crusade variant/i.test(e.comment ?? "")
    )
      continue;
    if (library.some((u) => normalize(u.name) === normalize(e.name))) continue;
    const sizes = /Tactical Squad/i.test(e.name)
      ? [10]
      : /Centurion|Eradicator/i.test(e.name)
        ? [3, 6]
        : /Devastator Squad/i.test(e.name)
          ? [5, 10]
          : /Suppressor/i.test(e.name)
            ? [3]
            : [1];
    library.push({
      id: "codex-" + e.id,
      name: e.name,
      origin: catalogue.name.replace(
        /^Imperium - (?:Adeptus Astartes - )?/,
        "",
      ),
      btEligible: false,
      sizeUnverified: e.type === "unit",
      pricing: [{ costs: sizes.map((models) => ({ models })) }],
      keywords: (e.categoryLinks ?? [])
        .map((k) => k.name ?? index.get(k.targetId)?.name ?? "")
        .filter(Boolean),
      profiles: profiles(e),
    });
  }
function attachmentList(u, role) {
  const explicit = u[role === "Leader" ? "leaderTo" : "supportTo"];
  if (explicit?.length) return explicit;
  const text =
    (u.profiles ?? []).find((p) => p.name === role)?.values.Description ?? "";
  const list =
    text
      .split(/following units?:/i)[1]
      ?.split(/You can attach|If you do/i)[0] ?? "";
  const names = new Set(list.split(/\r?\n|[■•]/).map(normalize));
  return library.filter((b) => names.has(normalize(b.name))).map((b) => b.name);
}
const compact = library.map((u) => ({
  id: u.id,
  name: u.name,
  origin: u.origin,
  btEligible: u.btEligible,
  sizeUnverified: Boolean(u.sizeUnverified),
  sizes: [
    ...new Set(u.pricing.flatMap((p) => p.costs.map((c) => c.models))),
  ].sort((a, b) => a - b),
  keywords: u.keywords ?? [],
  leaderTo: attachmentList(u, "Leader"),
  supportTo: attachmentList(u, "Support"),
  conditionalInvulnerablePhase:
    (
      (u.profiles ?? []).find((p) => /Invulnerable Save/i.test(p.name))?.values
        .Description ?? ""
    )
      .match(/against(?:\s|\u00a0)+(ranged|melee)(?:\s|\u00a0)+attacks/i)?.[1]
      ?.toLowerCase() ?? "",
  models: (u.profiles ?? []).filter((p) => p.type === "Unit"),
  weapons: (u.profiles ?? []).filter((p) => /Weapons/.test(p.type)),
  abilities: (u.profiles ?? [])
    .filter((p) => p.type === "Abilities")
    .map((p) => ({
      name: p.name,
      defensive:
        /feel no pain|damage characteristic|damage.*0|subtract.*damage|halve.*damage|wound roll|saving throw|save.*roll|invulnerable|wounds characteristic|toughness characteristic/i.test(
          p.values.Description ?? "",
        ),
    })),
}));
const output = {
  snapshotId: snapshot.id,
  catalogueCommit: "cc1830fbfead059f8059ed6c7f8e73cd4c390908",
  sourceFiles: sources.map((s) => ({
    name: s.path.split(/[\\/]/).pop(),
    sha256: createHash("sha256").update(s.raw).digest("hex"),
  })),
  units: compact,
};
writeFileSync(
  "src/calculator/unit-library-data.ts",
  "// Generated by scripts/import-mathhammer-library.mjs; do not edit profiles by hand.\nexport const libraryData = " +
    JSON.stringify(output, null, 2) +
    ";\n",
);
const missing = compact.filter((u) => !u.models.length || !u.weapons.length);
writeFileSync(
  "docs/UNIT-PRESET-COVERAGE.md",
  `# Mathhammer unit coverage\n\nSnapshot: ${snapshot.id}. Community commit: ${output.catalogueCommit}. Marine updates pending.\n\n${compact.length} non-Legends Black Templars and Codex catalogue entries indexed. ${compact.filter((u) => u.models.length && u.weapons.length).length} have both model and weapon profiles. ${missing.length} have gaps. Codex chapter catalogues are included and chapter-labeled. Separate chapter codex supplements (such as Blood Angels, Dark Angels and Space Wolves), Legends and Crusade-only entries are excluded.\n\nEligibility is established only for entries present in the official Black Templars snapshot; additional Codex entries are labeled unverified for current matched play / Templars use. Community model-count suggestions outside that snapshot are not certified roster sizes.\n\nOnly reviewed presets supply full weapon packages. Imported units expose individual weapons with quantities; alternative modes and weapon ownership must be selected explicitly. Unit abilities are listed by name and excluded unless the preset says they are applied. Targets with unmodeled defensive interactions require an explicitly restricted baseline choice.\n\n| Unit | Catalogue | Coverage | Templars pool |\n| --- | --- | --- | --- |\n${compact.map((u) => `| ${u.name} | ${u.origin} | ${u.models.length && u.weapons.length ? "Model + weapon profiles" : "Missing " + (!u.models.length ? "model " : "") + (!u.weapons.length ? "weapon " : "") + "profiles"} | ${u.btEligible ? "In saved official pool" : "Unverified"} |`).join("\n")}\n`,
);
console.log(`${compact.length} entries; ${missing.length} with profile gaps.`);
