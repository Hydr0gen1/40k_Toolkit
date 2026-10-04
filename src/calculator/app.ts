import { unitWeaponChoices, matchPresetWeapon } from "./weapon-menu.js";
import {
  attachmentRole,
  restoreUnbuffedProfile,
  eligibleBodyguards,
  eligibleCharacters,
  resolveAttachedUnit,
  applyLeaderEffects,
  type Member,
} from "./attachments.js";
import { attacks, targets } from "./presets.js";
import {
  findLibraryUnit,
  libraryUnits,
  basicPackage,
  checkWeaponModes,
  libraryWeapon,
  libraryTarget,
  targetVariants,
} from "./unit-library.js";
import {
  units,
  buildUnitAttack,
  buildUnitTarget,
  presetSnapshot,
  presetNotice,
  presetSource,
  type PresetOptions,
} from "./unit-presets.js";

const $ = <T extends HTMLElement>(
  selector: string,
  root: ParentNode = document,
) => root.querySelector<T>(selector)!;
const form = $<HTMLFormElement>("#calculator");
const weapons = $("#weapons");
const results = $("#results");
const error = $("#error");
const button = $<HTMLButtonElement>("#calculate");
let worker: Worker | undefined;
let hasResult = false;
let lastResult: unknown;
type Values = Record<string, unknown>;
type Field = {
  key: string;
  label: string;
  value?: string | number | boolean;
  min?: number;
  max?: number;
  type?: "text" | "checkbox";
  options?: [string, string][];
};
const rerolls: [string, string][] = [
  ["none", "None"],
  ["ones", "Rolls of 1"],
  ["failed", "Failed rolls"],
];
const thresholds: [string, string][] = [
  ["", "None"],
  ["2", "2+"],
  ["3", "3+"],
  ["4", "4+"],
  ["5", "5+"],
  ["6", "6+"],
];
function fields(root: HTMLElement, spec: Field[]) {
  for (const field of spec) {
    const label = document.createElement("label");
    label.textContent = field.label;
    const input = field.options
      ? document.createElement("select")
      : document.createElement("input");
    input.dataset.key = field.key;
    if (input instanceof HTMLSelectElement) {
      for (const [value, text] of field.options!)
        input.add(new Option(text, value));
      input.value = String(field.value ?? "");
    } else {
      input.type = field.type ?? "number";
      if (field.type === "checkbox") {
        input.checked = Boolean(field.value);
        label.className = "checkbox";
      } else {
        input.value = String(field.value ?? 0);
        input.required = true;
      }
      if (input.type === "number") {
        input.step = "1";
        input.min = String(field.min ?? 0);
        if (field.max !== undefined) input.max = String(field.max);
      }
      if (field.type === "text")
        input.maxLength = field.key === "name" ? 120 : 12;
      if (field.key === "attacks" || field.key === "damage") {
        input.pattern =
          "(?:[0-9]{1,3}|(?:[1-9]|10)?[dD](?:3|6)(?:[+][0-9]{1,2})?)";
        input.title = "Use a whole number or dice such as D6, 2D6 or D6+1.";
      }
    }
    label.append(input);
    root.append(label);
  }
}
const weaponBasics: Field[] = [
  {
    key: "name",
    label: "Weapon name",
    value: "Custom weapon",
    type: "text",
  },
  { key: "models", label: "Attacking models", value: 5, min: 1, max: 100 },
  { key: "attacks", label: "Attacks per model", value: 2, type: "text" },
  { key: "skill", label: "Hit on (BS / WS)", value: 3, min: 2, max: 6 },
  { key: "strength", label: "Strength", value: 4, min: 1, max: 40 },
  { key: "ap", label: "AP (0 or negative)", value: 0, min: -6, max: 0 },
  { key: "damage", label: "Damage per attack", value: 1, type: "text" },
];
const weaponAdvanced: Field[] = [
  { key: "hitReroll", label: "Hit rerolls", value: "none", options: rerolls },
  {
    key: "woundReroll",
    label: "Wound rerolls",
    value: "none",
    options: rerolls,
  },
  {
    key: "sustainedHits",
    label: "Sustained Hits (or D3 / D6)",
    value: 0,
    type: "text",
  },
  { key: "hitModifier", label: "Hit roll modifier", value: 0, min: -1, max: 1 },
  {
    key: "woundModifier",
    label: "Wound roll modifier",
    value: 0,
    min: -1,
    max: 1,
  },
  { key: "criticalHit", label: "Critical hit on", value: 6, min: 2, max: 6 },
  {
    key: "criticalWound",
    label: "Critical wound on",
    value: 6,
    min: 2,
    max: 6,
  },
  { key: "rapidFire", label: "Rapid Fire bonus", value: 0, max: 12 },
  { key: "melta", label: "Melta bonus", value: 0, max: 10 },
  { key: "lethalHits", label: "Lethal Hits", type: "checkbox" },
  { key: "devastatingWounds", label: "Devastating Wounds", type: "checkbox" },
  { key: "torrent", label: "Torrent (auto-hit)", type: "checkbox" },
  { key: "blast", label: "Blast", type: "checkbox" },
  { key: "withinHalfRange", label: "Within half range", type: "checkbox" },
  {
    key: "devastatingSpill",
    label: "Devastating damage spills",
    type: "checkbox",
  },
];
const targetBasics: Field[] = [
  {
    key: "name",
    label: "Model group name",
    value: "Target group",
    type: "text",
  },
  { key: "models", label: "Target models", value: 5, min: 1, max: 100 },
  { key: "wounds", label: "Wounds per model", value: 2, min: 1, max: 100 },
  { key: "toughness", label: "Toughness", value: 4, min: 1, max: 30 },
  {
    key: "save",
    label: "Armour save",
    value: 3,
    options: [
      ["2", "2+"],
      ["3", "3+"],
      ["4", "4+"],
      ["5", "5+"],
      ["6", "6+"],
      ["7", "None"],
    ],
  },
  { key: "invulnerable", label: "Invulnerable save", options: thresholds },
  { key: "feelNoPain", label: "Feel No Pain", options: thresholds },
];
const targetAdvanced: Field[] = [
  {
    key: "mortalFeelNoPain",
    label: "Mortal-only Feel No Pain",
    options: thresholds,
  },
  { key: "saveBonus", label: "Save bonus (e.g. cover)", value: 0, max: 2 },
  { key: "damageReduction", label: "Damage reduction", value: 0, max: 5 },
  {
    key: "woundModifier",
    label: "Incoming wound modifier",
    value: 0,
    min: -1,
    max: 1,
  },
  { key: "halveDamage", label: "Halve damage", type: "checkbox" },
];
function setValues(root: HTMLElement, values: Values, spec: Field[]) {
  for (const f of spec) {
    const input = $<HTMLInputElement | HTMLSelectElement>(
      `[data-key="${f.key}"]`,
      root,
    );
    const value = values[f.key] ?? f.value ?? (f.options ? "" : false);
    if (input instanceof HTMLInputElement && input.type === "checkbox")
      input.checked = Boolean(value);
    else input.value = String(value);
  }
  updateWeaponSummary(root);
}
function readValues(root: HTMLElement): Values {
  const values: Values = {};
  for (const input of root.querySelectorAll<
    HTMLInputElement | HTMLSelectElement
  >("[data-key]")) {
    const key = input.dataset.key!;
    if (input instanceof HTMLInputElement && input.type === "checkbox")
      values[key] = input.checked;
    else if (input.value === "") continue;
    else if (["hitReroll", "woundReroll", "name"].includes(key))
      values[key] = input.value;
    else if (["attacks", "damage", "sustainedHits"].includes(key))
      values[key] = /^\d+$/.test(input.value.trim())
        ? Number(input.value)
        : input.value.trim().toUpperCase();
    else values[key] = Number(input.value);
  }
  return values;
}
function populate(
  select: HTMLSelectElement,
  presets: { label: string }[],
  selected: number,
) {
  select.add(new Option("Custom values", "custom"));
  presets.forEach((p, i) => select.add(new Option(p.label, String(i))));
  select.value = String(selected);
}
function changed() {
  if (worker) {
    worker.terminate();
    worker = undefined;
  }
  button.disabled = false;
  button.textContent = "Calculate";
  error.hidden = true;
  if (hasResult && !results.querySelector(".stale-note")) {
    const note = document.createElement("p");
    note.className = "stale-note";
    note.textContent =
      "Values changed. Calculate again to update these results.";
    results.prepend(note);
  }
}
function addWeapon(index = 0) {
  const card = document.createElement("div");
  card.className = "weapon";
  card.innerHTML =
    '<div class="weapon-head"><label class="preset-label">Weapon preset<select class="weapon-preset"></select></label><button type="button" class="remove">Remove</button></div><p class="weapon-summary"></p><details class="weapon-stats" open><summary>Edit stats</summary><div class="field-grid basics"></div></details><details class="weapon-abilities"><summary>Weapon abilities</summary><div class="field-grid advanced"></div><p class="helper">Rapid Fire and Melta apply only with “Within half range.” Only turn on damage spill if the rules for your edition allow it.</p></details>';
  fields($(".basics", card), weaponBasics);
  fields($(".advanced", card), weaponAdvanced);
  const modelCount = $(`[data-key="models"]`, card).parentElement!;
  modelCount.classList.add("weapon-count");
  $(".weapon-head", card).insertBefore(modelCount, $(".remove", card));
  const preset = $<HTMLSelectElement>(".weapon-preset", card);
  populate(preset, attacks, index);
  setValues(card, attacks[index].values, [...weaponBasics, ...weaponAdvanced]);
  preset.addEventListener("change", () => {
    if (card.dataset.unitId) {
      try {
        applyCardWeapon(card, Number(preset.value));
      } catch (e) {
        failInput((e as Error).message);
      }
    } else {
      delete card.dataset.libraryIndex;
      delete card.dataset.unsupported;
      delete card.dataset.ignoresCover;
      if (preset.value !== "custom")
        setValues(card, attacks[Number(preset.value)].values, [
          ...weaponBasics,
          ...weaponAdvanced,
        ]);
    }
    updateWeaponSummary(card);
    changed();
  });
  card.addEventListener("input", (event) => {
    if (
      (event.target as HTMLElement).hasAttribute("data-key") &&
      !card.dataset.unitId
    )
      preset.value = "custom";
    updateWeaponSummary(card);
  });
  $(".remove", card).addEventListener("click", () => {
    card.remove();
    updateWeaponButtons();
    changed();
  });
  addMoveButton(card);
  weapons.append(card);
  updateWeaponButtons();
}
function updateWeaponButtons() {
  for (const b of weapons.querySelectorAll<HTMLButtonElement>(".remove"))
    b.hidden = weapons.children.length === 1;
  $<HTMLButtonElement>("#add-weapon").disabled = weapons.children.length >= 20;
}
function addMoveButton(card: HTMLElement) {
  const move = document.createElement("button");
  move.type = "button";
  move.className = "quiet-button";
  move.textContent = "Move up";
  move.addEventListener("click", () => {
    if (card.previousElementSibling)
      card.parentElement!.insertBefore(card, card.previousElementSibling);
    changed();
  });
  card.append(move);
}
const targetGroups = $("#target-groups");
function addTarget(index = 1) {
  const card = document.createElement("div");
  card.className = "weapon target-group";
  card.innerHTML =
    '<div class="weapon-head"><label class="preset-label">Target preset<select class="target-preset"></select></label><button type="button" class="remove">Remove</button></div><p class="target-summary"></p><details class="target-stats" open><summary>Edit stats</summary><div class="field-grid basics"></div></details><details><summary>Defensive abilities</summary><div class="field-grid advanced"></div></details>';
  fields($(".basics", card), targetBasics);
  fields($(".advanced", card), targetAdvanced);
  const count = $(`[data-key="models"]`, card).parentElement!;
  count.classList.add("weapon-count");
  $(".weapon-head", card).insertBefore(count, $(".remove", card));
  const title = document.createElement("span");
  title.className = "group-name";
  title.hidden = true;
  $(".weapon-head", card).prepend(title);
  const preset = $<HTMLSelectElement>(".target-preset", card);
  populate(preset, targets, index);
  const apply = () => {
    const p = targets[Number(preset.value)];
    setValues(card, { ...p.values, name: p.label }, [
      ...targetBasics,
      ...targetAdvanced,
    ]);
  };
  apply();
  preset.addEventListener("change", () => {
    if (preset.value !== "custom") apply();
    updateWeaponSummary(card);
    changed();
  });
  card.addEventListener("input", (e) => {
    if ((e.target as HTMLElement).hasAttribute("data-key"))
      preset.value = "custom";
    updateWeaponSummary(card);
  });
  $(".remove", card).addEventListener("click", () => {
    card.remove();
    updateTargets();
    changed();
  });
  addMoveButton(card);
  targetGroups.append(card);
  updateTargets();
}
function updateTargets() {
  for (const b of targetGroups.querySelectorAll<HTMLButtonElement>(".remove"))
    b.hidden = targetGroups.children.length === 1;
  $<HTMLButtonElement>("#add-target").disabled =
    targetGroups.children.length >= 8;
}
$("#add-target").addEventListener("click", () => {
  addTarget();
  changed();
});
$("#toughness-mode").addEventListener("change", () => {
  $("#unit-toughness-label").hidden =
    $<HTMLSelectElement>("#toughness-mode").value !== "fixed";
});
addTarget();
$("#add-weapon").addEventListener("click", () => {
  const unit = selectedAttack();
  if (unit) {
    const id = $<HTMLSelectElement>("#add-weapon-unit").value || unit.id;
    const first = unitWeaponChoices(id, attackOptions().phase)[0];
    if (!first) {
      failInput(
        "No weapon stats are available for this unit and phase. Switch to Custom to enter your own.",
      );
      return;
    }
    appendLibraryWeapon(id, first.index, 1);
    applyCardWeapon(weapons.lastElementChild as HTMLElement, first.index);
  } else addWeapon();
  changed();
});
form.addEventListener("input", changed);
form.addEventListener("change", changed);
addWeapon();

function pct(n: number) {
  if (n > 0 && n < 0.0005) return "<0.1%";
  if (n < 1 && n > 0.9995) return ">99.9%";
  return (n * 100).toFixed(1) + "%";
}
function num(n: number) {
  return n.toFixed(2);
}
function showResult(r: any) {
  if (r.status !== "calculated")
    throw new Error(
      "These rules aren’t supported yet: " + (r.unsupported ?? []).join("; "),
    );
  lastResult = r;
  hasResult = true;
  results.innerHTML = `<div class="result-heading"><div><p class="eyebrow">RESULTS</p><h2>Damage and kills</h2></div><button type="button" class="quiet-button" id="download">Download result</button></div><dl class="metrics"><div class="metric"><dt>Average damage</dt><dd>${num(r.expectedDamage)}</dd><small>Wounds removed, capped at the target’s remaining wounds</small></div><div class="metric"><dt>Average models killed</dt><dd>${num(r.expectedCasualties)}</dd><small>Of ${r.targetModels} target models</small></div><div class="metric"><dt>Chance to wipe the unit</dt><dd>${pct(r.destructionProbability)}</dd><small>All target models destroyed</small></div></dl><p class="range-note">Typical damage (middle 80%): <strong>${r.damagePercentiles.p10}–${r.damagePercentiles.p90}</strong> · Median: ${r.damagePercentiles.median}</p><div class="distribution"><h3>Models killed</h3><div id="bars"></div></div><details><summary>Rules and settings used</summary><div id="assumptions"></div></details>`;
  if (r.snapshotId === presetSnapshot) {
    const note = document.createElement("p");
    note.className = "preset-note";
    note.textContent = presetNotice;
    results.prepend(note);
  }
  if (
    r.appliedScenario.assumptions?.some((a: string) =>
      a.startsWith("Rules not included:"),
    )
  ) {
    const note = document.createElement("p");
    note.className = "preset-note";
    note.textContent =
      "Only the effects listed under Rules and settings used are included. Check Unit rules for anything else that might change the result.";
    results.prepend(note);
  }
  const entries = Object.entries(r.casualtyDistribution) as [string, number][];
  const selected = entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .sort((a, b) => Number(a[0]) - Number(b[0]));
  for (const [count, p] of selected) {
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `<span>${count} killed</span><div class="bar-track"><div class="bar"></div></div><b>${pct(p)}</b>`;
    $(".bar", row).style.width = `${p * 100}%`;
    $("#bars").append(row);
  }
  if (entries.length > 12) {
    const note = document.createElement("p");
    note.className = "helper";
    note.textContent =
      "Showing the 12 most likely outcomes. Save the result for the full distribution.";
    $("#bars").append(note);
  }
  const groupSummary = document.createElement("p");
  groupSummary.className = "helper";
  groupSummary.textContent =
    "Average losses by group: " +
    r.groupCasualties
      .map((g: any) => `${g.name}: ${num(g.expectedCasualties)}`)
      .join(" / ");
  $("#bars").append(groupSummary);
  const list = document.createElement("ul");
  list.className = "helper";
  for (const text of r.assumptions) {
    const li = document.createElement("li");
    li.textContent = text;
    list.append(li);
  }
  $("#assumptions").append(list);
  const pre = document.createElement("pre");
  pre.className = "input-summary";
  pre.textContent = JSON.stringify(r.appliedScenario, null, 2);
  $("#assumptions").append(pre);
  $("#download").addEventListener("click", () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(lastResult, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "mathhammer-result.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  changed();
  error.hidden = true;
  button.disabled = true;
  button.textContent = "Calculating…";
  try {
    for (const side of ["attack", "target"] as const)
      if (side === "attack" ? selectedAttack() : selectedTarget()) {
        const c = compositionFor(side);
        if (side === "target")
          for (const m of c.members) {
            if (
              !([...targetGroups.children] as HTMLElement[]).some(
                (card) => card.dataset.unitId === m.unitId,
              )
            )
              throw new Error(
                `Missing defensive stats for ${presetFor(m.unitId).label}. Choose another target or enter its stats in custom model groups.`,
              );
            const warning = units.find((u) => u.id === m.unitId)?.targetWarning;
            if (warning) throw new Error(warning);
          }
      }
  } catch (e) {
    failInput((e as Error).message);
    return;
  }
  if (selectedTarget()?.targetWarning) {
    error.textContent = selectedTarget()!.targetWarning!;
    error.hidden = false;
    button.disabled = false;
    button.textContent = "Calculate";
    return;
  }
  if (
    selectedAttack()?.id === "redemptor" &&
    attackOptions().phase === "ranged" &&
    attackOptions().loadout === "flamer" &&
    [...targetGroups.children].some(
      (card) => Number(readValues(card as HTMLElement).saveBonus) > 0,
    )
  ) {
    error.textContent =
      "This loadout mixes weapons that ignore cover with ones that don’t. Set the cover bonus to 0, or calculate the heavy flamer separately.";
    error.hidden = false;
    button.disabled = false;
    button.textContent = "Calculate";
    return;
  }
  const target = selectedTarget();
  if (target?.imported && !findLibraryUnit(target.id)?.models.length) {
    failInput(
      "We don’t have this unit’s defensive stats yet. Choose another target or enter custom stats.",
    );
    return;
  }
  if (
    target &&
    compositionFor("target").members.some(
      (m) =>
        presetFor(m.unitId)?.imported &&
        findLibraryUnit(m.unitId)?.abilities.length,
    ) &&
    !$<HTMLInputElement>("#restricted-defence").checked
  ) {
    failInput(
      "Check the target’s Unit rules, then tick Use basic defences only. Add any other defensive effects yourself before calculating.",
    );
    return;
  }
  if (!weapons.children.length) {
    failInput("Add at least one weapon before calculating.");
    return;
  }
  if (selectedAttack()) {
    for (const member of compositionFor("attack").members) {
      if (
        !([...weapons.children] as HTMLElement[]).some(
          (card) => card.dataset.unitId === member.unitId,
        )
      ) {
        failInput(
          `Choose a weapon for ${presetFor(member.unitId).label}. Each selected squad or character needs a weapon for this phase.`,
        );
        return;
      }
      const selections = ([...weapons.children] as HTMLElement[])
        .filter(
          (card) =>
            card.dataset.unitId === member.unitId &&
            card.dataset.libraryIndex !== undefined,
        )
        .map((card) => ({
          index: Number(card.dataset.libraryIndex),
          models: Number(readValues(card).models),
        }));
      const conflict = checkWeaponModes(member.unitId, member.size, selections);
      if (conflict) {
        failInput(conflict);
        return;
      }
    }
  }
  if (
    [...weapons.children].some(
      (card) => (card as HTMLElement).dataset.ignoresCover === "true",
    ) &&
    [...targetGroups.children].some(
      (card) => Number(readValues(card as HTMLElement).saveBonus) > 0,
    )
  ) {
    failInput(
      "We can’t apply cover separately to each weapon yet. Remove the target’s cover bonus or calculate the Ignores Cover weapon separately.",
    );
    return;
  }
  const scenario = {
    snapshotId:
      selectedAttack() || selectedTarget() ? presetSnapshot : undefined,
    assumptions: presetAssumptions(),
    label: "Mathhammer attack",
    defenderGroups: [...targetGroups.children].map((card) =>
      readValues(card as HTMLElement),
    ),
    unitToughness:
      $<HTMLSelectElement>("#toughness-mode").value === "fixed"
        ? Number($<HTMLInputElement>("#unit-toughness").value)
        : undefined,
    mortalWounds: /^\d+$/.test(
      $<HTMLInputElement>("#mortal-wounds").value.trim(),
    )
      ? Number($<HTMLInputElement>("#mortal-wounds").value)
      : $<HTMLInputElement>("#mortal-wounds").value.trim().toUpperCase(),
    mortalWoundsTiming: $<HTMLSelectElement>("#mortal-timing").value,
    weapons: [...weapons.children].map((card, i) => ({
      name: `Weapon ${i + 1}`,
      ...readValues(card as HTMLElement),
      unsupportedAbilities: JSON.parse(
        (card as HTMLElement).dataset.unsupported ?? "[]",
      ),
      sourceReferences: selectedAttack() ? [presetSource] : [],
    })),
  };
  try {
    const activeWorker = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });
    worker = activeWorker;
    const finish = () => {
      activeWorker.terminate();
      if (worker === activeWorker) worker = undefined;
      button.disabled = false;
      button.textContent = "Calculate";
    };
    activeWorker.onmessage = (event) => {
      finish();
      if (event.data.error) {
        error.textContent = event.data.error;
        error.hidden = false;
        return;
      }
      try {
        showResult(event.data.result);
      } catch (e) {
        error.textContent = (e as Error).message;
        error.hidden = false;
      }
    };
    activeWorker.onerror = () => {
      finish();
      error.textContent =
        "The calculator could not start. Reload the page and open it through the local server, rather than as a file.";
      error.hidden = false;
    };
    activeWorker.postMessage(scenario);
  } catch (e) {
    button.disabled = false;
    button.textContent = "Calculate";
    error.textContent = (e as Error).message;
    error.hidden = false;
  }
});

function failInput(message: string) {
  error.textContent = message;
  error.hidden = false;
  button.disabled = false;
  button.textContent = "Calculate";
}
// Guided unit controls populate the same editable profiles used by custom scenarios.
const attackUnit = $<HTMLSelectElement>("#attack-unit");
const targetUnit = $<HTMLSelectElement>("#target-unit");
const selectedAttack = () => units.find((u) => u.id === attackUnit.value);
const selectedTarget = () => units.find((u) => u.id === targetUnit.value);
function fillUnitMenu(select: HTMLSelectElement, query = "") {
  const selected = select.value;
  select.replaceChildren(new Option("Custom stats / example targets", ""));
  const groups = new Map<string, HTMLOptGroupElement>();
  for (const unit of select === attackUnit
    ? units.filter((u) => !attachmentRole(u.id))
    : units) {
    const origin = findLibraryUnit(unit.id)?.origin ?? "Black Templars";
    const name = origin === "Space Marines" ? "Codex Space Marines" : origin;
    let group = groups.get(name);
    if (!group) {
      group = document.createElement("optgroup");
      group.label = name;
      select.append(group);
      groups.set(name, group);
    }
    group.append(new Option(unit.label, unit.id));
  }
  select.value = selected;
}
for (const select of [attackUnit, targetUnit]) fillUnitMenu(select);
function choices(
  select: HTMLSelectElement,
  values: { id: string; label: string }[],
) {
  select.replaceChildren();
  for (const v of values) select.add(new Option(v.label, v.id));
}
function configureUnit(side: "attack" | "target") {
  const unit = side === "attack" ? selectedAttack() : selectedTarget();
  $(`#${side}-options`).hidden = !unit;
  $(`#${side}-unit-note`).textContent = unit
    ? (unit.imported ? (findLibraryUnit(unit.id)?.origin ?? "") : unit.note) +
      (unit.targetWarning && side === "target" ? " " + unit.targetWarning : "")
    : "Keep these stats or pick a unit above.";
  for (const suffix of ["library-abilities"])
    $(`#${side}-${suffix}`).hidden = !unit?.imported;
  if (side === "attack") {
    $("#reapply-attack").hidden = !unit;
    $("#attack-loadout-notes").hidden = !unit || Boolean(unit.imported);
    $("#add-weapon-unit-label").hidden = true;
    $("#attack-weapons-note").hidden = true;
  } else {
    $("#target-variants").hidden = !unit?.imported;
    $("#restricted-defence-label").hidden = !unit?.imported;
    $<HTMLInputElement>("#restricted-defence").checked = false;
  }
  if (!unit) {
    configureAttachments(side);
    if (side === "attack")
      for (const card of [...weapons.children] as HTMLElement[]) {
        delete card.dataset.unitId;
        delete card.dataset.libraryIndex;
        delete card.dataset.curatedProfile;
        delete card.dataset.originalWeaponIndex;
        $(".weapon-preset", card).replaceChildren();
        populate($(".weapon-preset", card), attacks, 0);
        $<HTMLSelectElement>(".weapon-preset", card).value = "custom";
        $(".preset-label", card).firstChild!.textContent = "Weapon preset";
        $(`[data-key="name"]`, card).parentElement!.hidden = false;
        $<HTMLDetailsElement>(".weapon-stats", card).open = true;
      }
    if (side === "target")
      for (const card of [...targetGroups.children] as HTMLElement[]) {
        delete card.dataset.unitId;
        $(".preset-label", card).hidden = false;
        $(".group-name", card).hidden = true;
        $(`[data-key="name"]`, card).parentElement!.hidden = false;
        $<HTMLDetailsElement>(".target-stats", card).open = true;
      }
    return;
  }
  const raw = unit.imported ? findLibraryUnit(unit.id) : undefined;
  if (raw)
    $(`#${side}-ability-note`).textContent =
      "Unit rules: " +
      (raw.abilities
        .filter(
          (a) =>
            !(
              side === "target" &&
              raw.conditionalInvulnerablePhase &&
              /Invulnerable Save/i.test(a.name)
            ),
        )
        .map((a) => a.name)
        .join(", ") || "No unit rules found in this source.") +
      ". " +
      (raw.conditionalInvulnerablePhase
        ? `Starred invulnerable save applies only against ${raw.conditionalInvulnerablePhase} attacks; incoming attack type controls it. `
        : "") +
      "Weapon keywords are applied where supported. Conditional buffs, leader effects, damage-state modifiers and non-combat abilities need separate choices. " +
      (raw.abilities.some((a) => a.defensive)
        ? "Some of these rules change defence. The basic stats don’t include them."
        : "") +
      " " +
      unit.note;
  if (side === "target" && raw)
    choices(
      $("#target-variant"),
      targetVariants(raw.id).map((p, i) => ({
        id: String(i),
        label: `${p.name} — T${p.values.T}, ${p.values.Sv}, W${p.values.W}`,
      })),
    );
  choices(
    $(`#${side}-size`),
    unit.sizes.map((n) => ({
      id: String(n),
      label: `${n} model${n === 1 ? "" : "s"}`,
    })),
  );
  if (unit.sizes.includes(5)) $<HTMLSelectElement>(`#${side}-size`).value = "5";
  if (side === "attack") {
    choices($("#unit-loadout"), unit.loadouts);
    $("#unit-loadout").parentElement!.hidden = Boolean(unit.imported);
    $("#attack-size").parentElement!.hidden = unit.sizes.length === 1;
    for (const [key, id] of [
      ["ballistus-condition", "ballistus"],
      ["bladeguard-condition", "bladeguard"],
      ["champion-condition", "champion"],
      ["stationary-condition", "crusaders"],
    ])
      $("#" + key).hidden =
        unit.id !== id && !(key === "stationary-condition" && unit.imported);
    $<HTMLSelectElement>("#unit-phase").value =
      ["ballistus", "redemptor"].includes(unit.id) ||
      (unit.imported &&
        !/assault intercessor|sword brethren|helbrecht|marshal|castellan|grimaldus|captain|chaplain|judiciar|lieutenant|ancient/i.test(
          unit.label,
        ))
        ? "ranged"
        : "melee";
    $<HTMLSelectElement>("#incoming-phase").value = attackOptions().phase;
  }
  configureAttachments(side);
  applyUnit(side);
  if (side === "attack" && selectedTarget()?.imported) applyUnit("target");
}
function attackOptions(): PresetOptions {
  return {
    size: Number($<HTMLSelectElement>("#attack-size").value),
    loadout: $<HTMLSelectElement>("#unit-loadout").value,
    phase: $<HTMLSelectElement>("#unit-phase").value as "melee" | "ranged",
    halfRange: $<HTMLInputElement>("#unit-half-range").checked,
    ballistusStrike: $<HTMLInputElement>("#ballistus-strike").checked,
    bladeguardOffence: $<HTMLInputElement>("#bladeguard-offence").checked,
    targetCharacter: $<HTMLInputElement>("#target-character").checked,
    championMiracle: $<HTMLInputElement>("#champion-miracle").checked,
    stationary: $<HTMLInputElement>("#unit-stationary").checked,
  };
}
function applyMainUnit(side: "attack" | "target") {
  const unit = side === "attack" ? selectedAttack() : selectedTarget();
  if (!unit) return;
  if (side === "attack") {
    weapons.replaceChildren();
    if (unit.imported) {
      const pack = basicPackage(
        unit.id,
        attackOptions().size,
        attackOptions().phase,
      );
      if (pack)
        for (const p of pack) appendLibraryWeapon(unit.id, p.index, p.models);
      else {
        const first = unitWeaponChoices(unit.id, attackOptions().phase)[0];
        if (first) appendLibraryWeapon(unit.id, first.index, 1);
      }
      changed();
      return;
    }
    for (const profile of buildUnitAttack(unit.id, attackOptions())) {
      addWeapon();
      const card = weapons.lastElementChild as HTMLElement;
      setValues(card, profile, [...weaponBasics, ...weaponAdvanced]);
      bindUnitWeaponMenu(card, unit.id, profile);
      const abilities = Object.entries(profile).filter(
        ([k, v]) =>
          [
            "lethalHits",
            "sustainedHits",
            "devastatingWounds",
            "torrent",
            "blast",
            "rapidFire",
            "hitModifier",
            "woundReroll",
            "hitReroll",
            "criticalWound",
          ].includes(k) &&
          v &&
          v !== "none" &&
          !(k === "criticalWound" && v === 6),
      );
      const badge = document.createElement("p");
      badge.className = "helper ability-summary";
      const names: Record<string, string> = {
        lethalHits: "Lethal Hits",
        sustainedHits: "Sustained Hits",
        devastatingWounds: "Devastating Wounds",
        torrent: "Torrent (automatic hits)",
        blast: "Blast",
        rapidFire: "Rapid Fire (half range only)",
        hitModifier: "Hit modifier",
        woundReroll: "Wound rerolls",
        hitReroll: "Hit rerolls",
        criticalWound: "Critical wounds on",
      };
      badge.textContent = abilities.length
        ? "Applied: " +
          abilities
            .map(([k, v]) => names[k] + (v === true ? "" : ` ${v}`))
            .join(" · ")
        : "No extra weapon abilities.";
      $(".weapon-abilities", card).append(badge);
    }
  } else {
    targetGroups.replaceChildren();
    let groups;
    try {
      groups = unit.imported
        ? libraryTarget(
            unit.id,
            Number($<HTMLSelectElement>("#target-size").value),
            Number($<HTMLSelectElement>("#target-variant").value),
            $<HTMLSelectElement>("#incoming-phase").value as "ranged" | "melee",
          )
        : buildUnitTarget(
            unit.id,
            Number($<HTMLSelectElement>("#target-size").value),
          );
    } catch (e) {
      changed();
      failInput((e as Error).message);
      return;
    }
    for (const group of groups) {
      addTarget();
      const card = targetGroups.lastElementChild as HTMLElement;
      setValues(card, group, [...targetBasics, ...targetAdvanced]);
      $<HTMLSelectElement>(".target-preset", card).value = "custom";
    }
    $<HTMLInputElement>("#target-character").checked =
      unit.id === "champion" ||
      /chaplain grimaldus/i.test(unit.label) ||
      Boolean(
        findLibraryUnit(unit.id)?.keywords.some(
          (k) => k.toLowerCase() === "character",
        ),
      );
    for (const input of document.querySelectorAll<HTMLInputElement>(
      ".target-keyword",
    ))
      input.checked = Boolean(
        findLibraryUnit(unit.id)?.keywords.some(
          (k) => k.toLowerCase() === input.value,
        ),
      );
    $<HTMLSelectElement>("#toughness-mode").value = "allocated";
    $("#unit-toughness-label").hidden = true;
    if (selectedAttack()?.id === "champion") applyUnit("attack");
    refreshLibraryConditions();
  }
  changed();
}
function presetAssumptions(): string[] {
  const notes: string[] = [];
  if (selectedAttack() || selectedTarget())
    notes.push(
      presetNotice,
      `Preset source: ${presetSource}`,
      "These results use the stats shown in the form, including any edits. All weapons are assumed in range and able to attack.",
    );
  const a = selectedAttack();
  if (a) {
    notes.push(
      `Attacker: ${a.label}; ${$<HTMLSelectElement>("#unit-phase").value}; ${$<HTMLSelectElement>("#unit-loadout").selectedOptions[0].textContent}.`,
    );
    if (a.id === "ballistus" && attackOptions().phase === "ranged")
      notes.push(
        `Ballistus Strike: ${attackOptions().ballistusStrike ? "target at half-strength or above; reroll failed hits" : "not applied"}.`,
      );
    if (a.id === "redemptor" && attackOptions().loadout === "supercharge")
      notes.push("Hazardous self-damage isn’t included.");
    if (a.id === "redemptor" && attackOptions().loadout === "flamer")
      notes.push(
        "Heavy flamer Ignores Cover: keep eligible save bonus at 0 for this target. Mixed weapon-specific cover is not modeled.",
      );
    if (a.id === "champion")
      notes.push(
        "Precision isn’t included. Damage goes into the target groups in order.",
        `Target Character: ${attackOptions().targetCharacter}; Sigismund’s Heir used: ${Boolean(attackOptions().championMiracle && attackOptions().targetCharacter)}.`,
      );
    if (a.id === "bladeguard")
      notes.push(
        "Bladeguard’s defensive stance isn’t included. The offensive stance affects melee only.",
      );
  }
  for (const selected of [selectedAttack(), selectedTarget()])
    if (selected?.imported) {
      const raw = findLibraryUnit(selected.id)!;
      for (const ability of raw.abilities
        .filter(
          (a) =>
            !attachmentEffects.attack.some((effect) =>
              effect.includes(a.name),
            ) &&
            !(
              selected === selectedTarget() &&
              raw.conditionalInvulnerablePhase &&
              /Invulnerable Save/i.test(a.name)
            ),
        )
        .slice(0, 6))
        notes.push(`Not included for ${raw.name}: ${ability.name}.`);
    }
  if (selectedTarget()?.imported)
    notes.push(
      `Conditional saves use the selected attack type: ${$<HTMLSelectElement>("#incoming-phase").value}. Other unit rules aren’t included in the basic defences.`,
    );
  if (selectedTarget()?.imported || selectedAttack()?.imported)
    notes.push(
      "Rules not included: only the effects listed here are applied. Other unit rules, optional defences and damaged-state penalties need manual edits. Weapon choices and counts aren’t checked against a legal loadout.",
    );
  if (selectedTarget()?.id === "bladeguard")
    notes.push(
      "Bladeguard’s defensive -1 to melee hit rolls isn’t included. Set the attacker’s hit modifier to -1 if that stance applies.",
    );
  return [
    ...attachmentEffects.attack,
    ...attachmentEffects.target,
    ...notes,
  ].slice(0, 30);
}
attackUnit.addEventListener("change", () => configureUnit("attack"));
targetUnit.addEventListener("change", () => configureUnit("target"));
$("#attack-options").addEventListener("change", (e) => {
  if (
    selectedAttack()?.imported &&
    !["unit-phase", "attack-size", "unit-loadout"].includes(
      (e.target as HTMLElement).id,
    )
  ) {
    refreshLibraryConditions();
    if (compositionFor("attack").members.length > 1) applyUnit("attack");
  } else {
    applyUnit("attack");
    if ((e.target as HTMLElement).id === "unit-phase") {
      $<HTMLSelectElement>("#incoming-phase").value = attackOptions().phase;
      if (selectedTarget()) applyUnit("target");
    }
  }
});
$("#target-options").addEventListener("change", () => applyUnit("target"));
$("#target-character").addEventListener("change", () => {
  if (selectedAttack()?.id === "champion") applyUnit("attack");
  refreshLibraryConditions();
});
$("#reapply-attack").addEventListener("click", () => applyUnit("attack"));
$("#reapply-target").addEventListener("click", () => applyUnit("target"));
for (const container of [weapons, targetGroups])
  container.addEventListener("input", () => {
    for (const badge of container.querySelectorAll(".ability-summary"))
      badge.textContent =
        "Stats edited. Check the abilities below or reset the unit to start again.";
  });

$("#library-count").textContent = `${units.length} units available.`;
function targetKeywords() {
  return [
    ...document.querySelectorAll<HTMLInputElement>(".target-keyword:checked"),
  ]
    .map((i) => i.value)
    .concat(
      $<HTMLInputElement>("#target-character").checked ? ["character"] : [],
    );
}
function refreshLibraryConditions() {
  const u = selectedAttack();
  if (!u) return;
  for (const card of [...weapons.children] as HTMLElement[]) {
    if (card.dataset.libraryIndex === undefined) continue;
    const p = libraryWeapon(
      card.dataset.unitId ?? u.id,
      Number(card.dataset.libraryIndex),
      Number(readValues(card).models),
      {
        halfRange: attackOptions().halfRange,
        stationary: attackOptions().stationary,
        targetKeywords: targetKeywords(),
      },
    );
    for (const key of [
      "criticalWound",
      "withinHalfRange",
      "hitModifier",
    ] as const) {
      const input = $<HTMLInputElement>(`[data-key="${key}"]`, card);
      if (key === "withinHalfRange") input.checked = Boolean(p[key]);
      else
        input.value = String(
          key === "hitModifier" &&
            card.dataset.unitId === "bladeguard" &&
            attackOptions().phase === "melee"
            ? attackOptions().bladeguardOffence
              ? 1
              : 0
            : p[key],
        );
    }
  }
  changed();
}
$("#target-variant").addEventListener("change", () => applyUnit("target"));
for (const input of document.querySelectorAll(".target-keyword"))
  input.addEventListener("change", refreshLibraryConditions);
for (const side of ["attack", "target"] as const) {
  const input = $<HTMLInputElement>(`#${side}-search`),
    matches = document.createElement("div");
  matches.className = "search-matches helper";
  input.parentElement!.after(matches);
  input.addEventListener("input", () => {
    matches.replaceChildren();
    const q = input.value.trim().toLowerCase();
    if (!q) return;
    const pool =
      side === "attack" ? units.filter((u) => !attachmentRole(u.id)) : units;
    const found = pool.filter((u) => u.label.toLowerCase().includes(q));
    const label = document.createElement("p");
    label.textContent = `${found.length} matching unit${found.length === 1 ? "" : "s"}. Pick one below, or browse all ${pool.length} in the dropdown.`;
    matches.append(label);
    for (const u of found) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "quiet-button";
      b.textContent = u.label;
      b.addEventListener("click", () => {
        (side === "attack" ? attackUnit : targetUnit).value = u.id;
        input.value = "";
        matches.replaceChildren();
        configureUnit(side);
      });
      matches.append(b);
    }
    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = "Clear search";
    clear.className = "quiet-button";
    clear.addEventListener("click", () => {
      input.value = "";
      matches.replaceChildren();
    });
    matches.append(clear);
  });
}

function appendLibraryWeapon(id: string, index: number, models: number) {
  const p = libraryWeapon(id, index, models, {
    halfRange: attackOptions().halfRange,
    stationary: attackOptions().stationary,
    targetKeywords: targetKeywords(),
  });
  addWeapon();
  const card = weapons.lastElementChild as HTMLElement;
  setValues(card, p, [...weaponBasics, ...weaponAdvanced]);
  bindUnitWeaponMenu(card, id, undefined, index);
  card.dataset.libraryIndex = String(index);
  card.dataset.unsupported = JSON.stringify(p.unsupportedAbilities);
  card.dataset.ignoresCover = String(
    /ignores cover/i.test(findLibraryUnit(id)!.weapons[index].values.Keywords),
  );
  const note = document.createElement("p");
  note.className = "helper ability-summary";
  note.textContent =
    "Weapon keywords: " +
    (findLibraryUnit(id)!.weapons[index].values.Keywords || "None") +
    ". Check abilities below. Hazardous self-damage and Precision aren’t included; loadout legality isn’t checked.";
  $(".weapon-abilities", card).append(note);
  changed();
}

$("#incoming-phase").addEventListener("change", () => {
  if (selectedTarget()) applyUnit("target");
});

const missing = libraryUnits.filter(
  (u) => !u.models.length || !u.weapons.length,
);
const coverage = $("#coverage-overview");
for (const text of [
  `${units.length} units from Black Templars, Codex Space Marines, Ultramarines, Imperial Fists, Iron Hands, Raven Guard, Salamanders and White Scars. ${libraryUnits.length - missing.length} have weapon and model stats.`,
  `Missing stats: ${missing.map((u) => u.name + (!u.models.length ? " (weapons and models)" : " (weapons)")).join("; ")}.`,
  "Common units load a starting weapon set. For other units, choose weapons and counts yourself. Other chapter supplements, Legends and Crusade-only units aren’t included.",
  "The source date is shown above. Check Unit rules for abilities that need manual settings. Pending rules updates aren’t included.",
]) {
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  coverage.append(paragraph);
}
const attachmentEffects: Record<"attack" | "target", string[]> = {
  attack: [],
  target: [],
};
type Side = "attack" | "target";
function presetFor(id: string) {
  return (
    units.find((u) => u.id === id) ||
    units.find((u) => findLibraryUnit(u.id)?.id === id)!
  );
}
function canonicalChoices(raw: ReturnType<typeof eligibleBodyguards>) {
  return raw.map((u) => ({ id: presetFor(u.id)?.id ?? u.id, label: u.name }));
}
function selectValue(id: string) {
  return $<HTMLSelectElement>("#" + id).value;
}
function memberOptions(side: Side, id: string): Member {
  return {
    unitId: id,
    size: Number(selectValue(side + "-bodyguard-size")),
    loadout: selectValue(side + "-bodyguard-loadout"),
  };
}
function compositionFor(side: Side) {
  const main = side === "attack" ? selectedAttack() : selectedTarget();
  if (!main) throw new Error("Select a unit first.");
  const role = attachmentRole(main.id),
    isolated = $<HTMLInputElement>(`#${side}-isolated`).checked;
  return resolveAttachedUnit(
    {
      unitId: main.id,
      size: Number(selectValue(side + "-size")),
      loadout: side === "attack" ? attackOptions().loadout : undefined,
    },
    isolated
      ? { isolated: true }
      : {
          bodyguard: role
            ? memberOptions(side, selectValue(side + "-bodyguard"))
            : undefined,
          leader:
            role !== "leader" && selectValue(side + "-leader")
              ? {
                  unitId: selectValue(side + "-leader"),
                  size: presetFor(selectValue(side + "-leader")).sizes[0],
                }
              : undefined,
          support:
            role !== "support" && selectValue(side + "-support")
              ? {
                  unitId: selectValue(side + "-support"),
                  size: presetFor(selectValue(side + "-support")).sizes[0],
                }
              : undefined,
        },
  );
}
for (const side of ["attack", "target"] as const) {
  const panel = document.createElement("div");
  panel.id = side + "-attachments";
  panel.hidden = true;
  panel.innerHTML = `<h3>Attached characters</h3>
  <label class="checkbox" id="${side}-isolated-label"><input type="checkbox" id="${side}-isolated">Character alone (e.g. bodyguards have died; no leading bonuses)</label>
  <div id="${side}-attached-controls">
  <div id="${side}-bodyguard-controls"><label>Bodyguard squad<select id="${side}-bodyguard"></select></label>
  <div class="field-grid"><label>Squad size<select id="${side}-bodyguard-size"></select></label><label>Squad loadout<select id="${side}-bodyguard-loadout"></select></label></div></div>
  <label id="${side}-leader-label">Leader<select id="${side}-leader"></select></label>
  <label id="${side}-support-label">Support<select id="${side}-support"></select></label>
  <div class="attachment-actions" id="${side}-attachment-actions"><button type="button" class="quiet-button" id="${side}-add-leader">+ Add leader</button><button type="button" class="quiet-button" id="${side}-add-support">+ Add support</button></div>
  <label id="${side}-support-test-label">Castellan Leadership test<select id="${side}-support-test"><option value="none">Not used / haven’t rolled yet</option><option value="passed">Passed — reroll failed melee hits</option><option value="failed">Failed — reroll melee hit rolls of 1</option></select></label>
  <label id="${side}-relic-label">Grimaldus’s relic (requires a surviving Servitor)<select id="${side}-relic"><option value="none">None</option><option value="ap">Improve melee AP by 1</option><option value="toughness">Improve unit Toughness by 1</option><option value="movement">Advance / charge bonus (no damage effect)</option></select></label>
  </div><div class="helper" id="${side}-attachment-note"></div><details id="${side}-attachment-limits" hidden><summary>Rules not included</summary><div class="helper"></div></details>`;
  (side === "attack"
    ? $("#attack-library-abilities")
    : $("#target-loadout-notes")
  ).before(panel);
  for (const role of ["leader", "support"] as const) {
    $(`#${side}-add-${role}`, panel).addEventListener("click", () => {
      $(`#${side}-${role}-label`).hidden = false;
      $(`#${side}-add-${role}`).hidden = true;
      $<HTMLSelectElement>(`#${side}-${role}`).focus();
    });
  }
  panel.addEventListener("change", (e) => {
    if ((e.target as HTMLElement).id === side + "-bodyguard")
      configureAttachmentSquad(side);
    if ((e.target as HTMLElement).id === side + "-isolated")
      $(`#${side}-attached-controls`).hidden = $<HTMLInputElement>(
        `#${side}-isolated`,
      ).checked;
    refreshAttachmentControls(side);
    applyUnit(side, side === "attack");
  });
}
function configureAttachmentSquad(side: Side) {
  const id = selectValue(side + "-bodyguard"),
    u = presetFor(id);
  if (!u) return;
  choices(
    $(`#${side}-bodyguard-size`),
    u.sizes.map((n) => ({ id: String(n), label: String(n) + " models" })),
  );
  if (u.sizes.includes(5))
    $<HTMLSelectElement>(`#${side}-bodyguard-size`).value = "5";
  choices($(`#${side}-bodyguard-loadout`), u.loadouts);
  $(`#${side}-bodyguard-loadout`).parentElement!.hidden =
    Boolean(u.imported) || side === "target";
  configureCharacterMenus(side, id);
}
function configureCharacterMenus(side: Side, bodyguardId: string) {
  const main = side === "attack" ? selectedAttack() : selectedTarget(),
    role = main ? attachmentRole(main.id) : undefined;
  for (const r of ["leader", "support"] as const) {
    $(`#${side}-${r}-label`).hidden = true;
    choices($(`#${side}-${r}`), [
      { id: "", label: `No ${r} / remove` },
      ...canonicalChoices(eligibleCharacters(bodyguardId, r)).filter(
        (u) => u.id !== main?.id,
      ),
    ]);
    $(`#${side}-add-${r}`).hidden =
      role === r || $<HTMLSelectElement>(`#${side}-${r}`).options.length < 2;
  }
}
function configureAttachments(side: Side) {
  const main = side === "attack" ? selectedAttack() : selectedTarget();
  $(`#${side}-attachments`).hidden = !main;
  if (!main) {
    attachmentEffects[side] = [];
    return;
  }
  const role = attachmentRole(main.id);
  $<HTMLInputElement>(`#${side}-isolated`).checked = false;
  $(`#${side}-isolated-label`).hidden = !role;
  $(`#${side}-attached-controls`).hidden = false;
  $(`#${side}-bodyguard-controls`).hidden = !role;
  if (role) {
    const values = canonicalChoices(eligibleBodyguards(main.id));
    choices($(`#${side}-bodyguard`), values);
    const preferred =
      values.find((u) => /Sword Brethren/i.test(u.label)) ??
      values.find((u) => /Crusader Squad/i.test(u.label));
    if (preferred)
      $<HTMLSelectElement>(`#${side}-bodyguard`).value = preferred.id;
    configureAttachmentSquad(side);
  } else configureCharacterMenus(side, main.id);
  refreshAttachmentControls(side);
}
function refreshAttachmentControls(side: Side) {
  let c;
  try {
    c = compositionFor(side);
  } catch {
    return;
  }
  for (const r of ["leader", "support"] as const) {
    const main = side === "attack" ? selectedAttack() : selectedTarget();
    const primary = main ? attachmentRole(main.id) : undefined;
    const chosen = Boolean(selectValue(side + "-" + r));
    $(`#${side}-${r}-label`).hidden = !chosen;
    $(`#${side}-add-${r}`).hidden =
      chosen ||
      primary === r ||
      $<HTMLSelectElement>(`#${side}-${r}`).options.length < 2;
  }
  $(`#${side}-support-test-label`).hidden =
    !c.support || !/castellan/i.test(presetFor(c.support.unitId).label);
  $(`#${side}-relic-label`).hidden =
    !c.leader || !/grimaldus/i.test(presetFor(c.leader.unitId).label);
  const hasOptions = ["leader", "support"].some(
    (r) => $<HTMLSelectElement>(`#${side}-${r}`).options.length > 1,
  );
  const main = side === "attack" ? selectedAttack() : selectedTarget();
  $(`#${side}-attachments`).hidden =
    !main || (!hasOptions && !attachmentRole(main.id));
  if (side !== "attack") return;
  $("#champion-condition").hidden =
    !c.leader || presetFor(c.leader.unitId).id !== "champion";
  const previous = $<HTMLSelectElement>("#add-weapon-unit").value;
  choices(
    $("#add-weapon-unit"),
    c.members.map((m) => ({ id: m.unitId, label: presetFor(m.unitId).label })),
  );
  if (c.members.some((m) => m.unitId === previous))
    $<HTMLSelectElement>("#add-weapon-unit").value = previous;
  $("#add-weapon-unit-label").hidden = c.members.length < 2;
  const partial = c.members.some(
    (m) =>
      presetFor(m.unitId).imported &&
      !basicPackage(m.unitId, m.size, attackOptions().phase),
  );
  $("#attack-weapons-note").hidden = !partial;
  $("#attack-weapons-note").textContent =
    "Some units have only a starting weapon loaded. Check their weapon rows and add the rest of their loadout.";
}
function applyUnit(side: Side, preserveWeapons = false) {
  const previousCards =
    side === "attack" && preserveWeapons
      ? ([...weapons.children] as HTMLElement[])
      : [];
  attachmentEffects[side] = [];
  const main = side === "attack" ? selectedAttack() : selectedTarget();
  if (!main) return;
  try {
    const c = compositionFor(side);
    refreshAttachmentControls(side);
    applyMainUnit(side);
    const container = side === "attack" ? weapons : targetGroups;
    const mainCards = [...container.children] as HTMLElement[];
    for (const card of mainCards) card.dataset.unitId = main.id;
    if (c.bodyguard && c.bodyguard.unitId !== main.id)
      container.replaceChildren();
    for (const m of c.members) {
      if (m.unitId === main.id) {
        if (c.bodyguard && c.bodyguard.unitId !== main.id)
          container.append(...mainCards);
        continue;
      }
      const u = presetFor(m.unitId);
      if (side === "attack") {
        if (u.imported) {
          const pack =
            m.loadout === "custom"
              ? undefined
              : basicPackage(u.id, m.size, attackOptions().phase);
          if (pack)
            for (const p of pack) appendLibraryWeapon(u.id, p.index, p.models);
          else {
            const first = unitWeaponChoices(u.id, attackOptions().phase)[0];
            if (first) appendLibraryWeapon(u.id, first.index, 1);
          }
        } else
          for (const p of buildUnitAttack(u.id, {
            ...attackOptions(),
            size: m.size,
            loadout: m.loadout ?? u.loadouts[0].id,
          })) {
            addWeapon();
            const card = weapons.lastElementChild as HTMLElement;
            setValues(card, p, [...weaponBasics, ...weaponAdvanced]);
            bindUnitWeaponMenu(card, u.id, p);
          }
      } else {
        const groups = u.imported
          ? libraryTarget(
              u.id,
              m.size,
              0,
              selectValue("incoming-phase") as "melee" | "ranged",
            )
          : buildUnitTarget(u.id, m.size);
        for (const g of groups) {
          addTarget();
          const card = targetGroups.lastElementChild as HTMLElement;
          setValues(card, g, [...targetBasics, ...targetAdvanced]);
          card.dataset.unitId = u.id;
        }
      }
    }
    if (side === "attack") {
      if (previousCards.length) {
        const fresh = [...weapons.children] as HTMLElement[];
        weapons.replaceChildren();
        for (const member of c.members) {
          const existing = previousCards.filter(
            (card) => card.dataset.unitId === member.unitId,
          );
          if (existing.length) {
            for (const card of existing) {
              setValues(card, unbuffedValues(card), [
                ...weaponBasics,
                ...weaponAdvanced,
              ]);
              weapons.append(card);
            }
          } else
            weapons.append(
              ...fresh.filter((card) => card.dataset.unitId === member.unitId),
            );
        }
      }
      const profiles = ([...weapons.children] as HTMLElement[]).map((card) =>
        readValues(card),
      ) as any[];
      const effects = applyLeaderEffects(profiles, c, attackOptions().phase, {
        supportTest: selectValue("attack-support-test") as
          "none" | "passed" | "failed",
        relic: selectValue("attack-relic") as
          "none" | "ap" | "toughness" | "movement",
      });
      effects.profiles.forEach((p, i) => {
        const card = weapons.children[i] as HTMLElement;
        card.dataset.baseProfile = JSON.stringify(profiles[i]);
        card.dataset.appliedProfile = JSON.stringify(p);
        setValues(card, p, [...weaponBasics, ...weaponAdvanced]);
      });
      updateWeaponButtons();
      attachmentEffects.attack = effects.effects;
    } else {
      for (const card of [...targetGroups.children] as HTMLElement[]) {
        $(".preset-label", card).hidden = true;
        const title = $(".group-name", card);
        title.hidden = false;
        title.textContent = String(readValues(card).name);
        $(`[data-key="name"]`, card).parentElement!.hidden = true;
        $<HTMLDetailsElement>(".target-stats", card).open = false;
        updateWeaponSummary(card);
      }
      if (
        c.leader &&
        /grimaldus/i.test(presetFor(c.leader.unitId).label) &&
        selectValue("target-relic") === "toughness"
      ) {
        for (const card of [...targetGroups.children] as HTMLElement[]) {
          const values = readValues(card);
          setValues(
            card,
            { ...values, toughness: Number(values.toughness) + 1 },
            [...targetBasics, ...targetAdvanced],
          );
        }
        attachmentEffects.target.push(
          "Grimaldus: +1 Toughness from Temple Relic. Assumes a Servitor survives for the whole attack.",
        );
      }
      const keywords = c.members
        .flatMap((m) => findLibraryUnit(m.unitId)?.keywords ?? [])
        .map((k) => k.toLowerCase());
      $<HTMLInputElement>("#target-character").checked =
        keywords.includes("character");
      for (const input of document.querySelectorAll<HTMLInputElement>(
        ".target-keyword",
      ))
        input.checked = keywords.includes(input.value);
      refreshLibraryConditions();
      if (c.members.some((m) => presetFor(m.unitId)?.imported)) {
        $("#restricted-defence-label").hidden = false;
      }
    }
    for (const m of c.members.filter((m) => m.unitId !== main.id)) {
      const raw = findLibraryUnit(m.unitId);
      if (!raw) continue;
      const applied = new Set([
        "Leader",
        "Support",
        ...raw.abilities
          .filter((a) =>
            attachmentEffects[side].some((effect) => effect.includes(a.name)),
          )
          .map((a) => a.name),
      ]);
      attachmentEffects[side].push(
        `${raw.name}: not included unless you enter them yourself: ${
          raw.abilities
            .filter((a) => !applied.has(a.name))
            .map((a) => a.name)
            .join(", ") || "none listed"
        }.`.slice(0, 300),
      );
    }
    const summary = c.members
      .map(
        (m) =>
          `${presetFor(m.unitId)?.label ?? m.unitId} (${m.size} model${m.size === 1 ? "" : "s"})`,
      )
      .join(" + ");
    attachmentEffects[side].unshift(
      `${side === "attack" ? "Attacking" : "Defending"} unit: ${summary}. ${c.isolated ? "Character alone; leading bonuses don’t apply." : "Bodyguards take damage first. Precision isn’t included."}`,
    );
    const note = $(`#${side}-attachment-note`),
      limits = $(`#${side}-attachment-limits`),
      limitText = $("div", limits);
    note.replaceChildren();
    limitText.replaceChildren();
    for (const text of attachmentEffects[side]) {
      const paragraph = document.createElement("p");
      if (text === attachmentEffects[side][0]) {
        if (c.members.length < 2) continue;
        paragraph.textContent = `${c.members.reduce((sum, m) => sum + m.size, 0)} models total. Bodyguards take damage first.`;
      } else paragraph.textContent = text;
      (text.includes(": not included unless") ? limitText : note).append(
        paragraph,
      );
    }
    limits.hidden = !limitText.children.length;
    changed();
  } catch (e) {
    failInput((e as Error).message);
  }
}

function bindUnitWeaponMenu(
  card: HTMLElement,
  id: string,
  profile?: Values,
  index?: number,
) {
  const select = $<HTMLSelectElement>(".weapon-preset", card),
    items = unitWeaponChoices(id, attackOptions().phase);
  card.dataset.unitId = id;
  $<HTMLDetailsElement>(".weapon-stats", card).open = false;
  $(`[data-key="name"]`, card).parentElement!.hidden = true;
  $(".preset-label", card).firstChild!.textContent =
    "Weapon — " + (presetFor(id)?.label ?? findLibraryUnit(id)?.name ?? id);
  choices(
    select,
    items.map((w) => ({ id: String(w.index), label: w.label })),
  );
  if (profile) {
    index = matchPresetWeapon(id, attackOptions().phase, String(profile.name));
    if (index === undefined)
      throw new Error(
        `The preset weapon ${profile.name} could not be matched to ${presetFor(id).label}.`,
      );
    card.dataset.curatedProfile = JSON.stringify(profile);
    card.dataset.originalWeaponIndex = String(index);
  }
  select.value = String(index ?? items[0]?.index ?? "");
  card.dataset.libraryIndex = select.value;
}
function applyCardWeapon(card: HTMLElement, index: number) {
  const id = card.dataset.unitId!;
  if (
    !unitWeaponChoices(id, attackOptions().phase).some((w) => w.index === index)
  )
    throw new Error("Choose a weapon from this unit’s list.");
  const models = Number(readValues(card).models);
  const fromLibrary = libraryWeapon(id, index, models, {
    halfRange: attackOptions().halfRange,
    stationary: attackOptions().stationary,
    targetKeywords: targetKeywords(),
  });
  const curated =
    card.dataset.originalWeaponIndex === String(index) &&
    card.dataset.curatedProfile
      ? JSON.parse(card.dataset.curatedProfile)
      : undefined;
  let profile = curated ? { ...curated, models } : fromLibrary;
  // Optional conditions and unit buffs apply to replacements just as they do
  // when loading the squad. Always start from the unbuffed weapon.
  if (id === "ballistus" && attackOptions().phase === "ranged")
    profile = {
      ...profile,
      hitReroll: attackOptions().ballistusStrike ? "failed" : "none",
    };
  if (id === "bladeguard" && attackOptions().phase === "melee")
    profile = {
      ...profile,
      hitModifier: attackOptions().bladeguardOffence ? 1 : 0,
    };
  if (id === "champion" && attackOptions().phase === "melee")
    profile = {
      ...profile,
      devastatingWounds: Boolean(
        attackOptions().championMiracle && attackOptions().targetCharacter,
      ),
    };
  const applied = applyLeaderEffects(
    [profile],
    compositionFor("attack"),
    attackOptions().phase,
    {
      supportTest: selectValue("attack-support-test") as
        "none" | "passed" | "failed",
      relic: selectValue("attack-relic") as
        "none" | "ap" | "toughness" | "movement",
    },
  );
  card.dataset.baseProfile = JSON.stringify(profile);
  card.dataset.appliedProfile = JSON.stringify(applied.profiles[0]);
  setValues(card, applied.profiles[0], [...weaponBasics, ...weaponAdvanced]);
  card.dataset.libraryIndex = String(index);
  card.dataset.unsupported = JSON.stringify(fromLibrary.unsupportedAbilities);
  card.dataset.ignoresCover = String(
    /ignores cover/i.test(findLibraryUnit(id)!.weapons[index].values.Keywords),
  );
  const badge = card.querySelector(".ability-summary");
  if (badge)
    badge.textContent =
      "Weapon: " +
      fromLibrary.name +
      ". Check abilities below for the settings used.";
}

function unbuffedValues(card: HTMLElement): Values {
  const current = readValues(card);
  if (!card.dataset.baseProfile || !card.dataset.appliedProfile) return current;
  const base = JSON.parse(card.dataset.baseProfile),
    applied = JSON.parse(card.dataset.appliedProfile);
  return restoreUnbuffedProfile(current, base, applied);
}

function updateWeaponSummary(card: HTMLElement) {
  const summary = card.querySelector<HTMLElement>(
    ".weapon-summary,.target-summary",
  );
  if (!summary) return;
  const v = readValues(card);
  if (card.classList.contains("target-group")) {
    summary.textContent = `W ${v.wounds} · T ${v.toughness} · Save ${v.save === 7 ? "–" : String(v.save) + "+"} · Inv ${v.invulnerable ? String(v.invulnerable) + "+" : "–"} · FNP ${v.feelNoPain ? String(v.feelNoPain) + "+" : "–"}`;
    const title = card.querySelector(".group-name");
    if (title) title.textContent = String(v.name ?? "");
    return;
  }
  summary.textContent = `A ${v.attacks ?? "–"}   ·   Hit ${v.skill ?? "–"}+   ·   S ${v.strength ?? "–"}   ·   AP ${v.ap ?? "–"}   ·   D ${v.damage ?? "–"}`;
}
