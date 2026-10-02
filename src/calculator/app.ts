import { attacks, targets } from "./presets.js";

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
  { key: "name", label: "Models / weapon name", value: "Custom weapon", type: "text" },
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
  { key: "sustainedHits", label: "Sustained Hits (or D3 / D6)", value: 0, type: "text" },
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
  { key: "name", label: "Model group name", value: "Target group", type: "text" },
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
  { key: "mortalFeelNoPain", label: "Mortal-only Feel No Pain", options: thresholds },
  { key: "saveBonus", label: "Eligible save bonus", value: 0, max: 2 },
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
  button.textContent = "Calculate odds ↗";
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
    '<div class="weapon-head"><label class="preset-label">Weapon preset<select class="weapon-preset"></select></label><button type="button" class="remove">Remove</button></div><div class="field-grid basics"></div><details open><summary>Sustained, Lethal, Devastating &amp; other abilities</summary><div class="field-grid advanced"></div><p class="helper">Rapid Fire and Melta apply only with “Within half range.” Enable damage spill only if your rules explicitly allow it.</p></details>';
  fields($(".basics", card), weaponBasics);
  fields($(".advanced", card), weaponAdvanced);
  const preset = $<HTMLSelectElement>(".weapon-preset", card);
  populate(preset, attacks, index);
  setValues(card, attacks[index].values, [...weaponBasics, ...weaponAdvanced]);
  preset.addEventListener("change", () => {
    if (preset.value !== "custom")
      setValues(card, attacks[Number(preset.value)].values, [
        ...weaponBasics,
        ...weaponAdvanced,
      ]);
    changed();
  });
  card.addEventListener("input", (event) => {
    if ((event.target as HTMLElement).hasAttribute('data-key')) preset.value = "custom";
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
  $<HTMLButtonElement>("#add-weapon").disabled = weapons.children.length >= 8;
}
function addMoveButton(card: HTMLElement) {
  const move = document.createElement("button");
  move.type = "button"; move.className = "quiet-button"; move.textContent = "Move up";
  move.addEventListener("click", () => { if (card.previousElementSibling) card.parentElement!.insertBefore(card, card.previousElementSibling); changed(); });
  card.append(move);
}
const targetGroups = $("#target-groups");
function addTarget(index = 1) {
  const card = document.createElement("div"); card.className = "weapon target-group";
  card.innerHTML = '<div class="weapon-head"><label class="preset-label">Target preset<select class="target-preset"></select></label><button type="button" class="remove">Remove</button></div><div class="field-grid basics"></div><details><summary>Defensive abilities</summary><div class="field-grid advanced"></div></details>';
  fields($(".basics", card), targetBasics); fields($(".advanced", card), targetAdvanced);
  const preset = $<HTMLSelectElement>(".target-preset", card);
  populate(preset, targets, index);
  const apply = () => { const p = targets[Number(preset.value)]; setValues(card, {...p.values, name: p.label}, [...targetBasics, ...targetAdvanced]); };
  apply();
  preset.addEventListener("change", () => { if(preset.value !== "custom") apply(); changed(); });
  card.addEventListener("input", e => {if ((e.target as HTMLElement).hasAttribute("data-key")) preset.value = "custom";});
  $(".remove", card).addEventListener("click", () => {card.remove(); updateTargets(); changed();});
  addMoveButton(card); targetGroups.append(card); updateTargets();
}
function updateTargets() {
  for (const b of targetGroups.querySelectorAll<HTMLButtonElement>(".remove")) b.hidden = targetGroups.children.length === 1;
  $<HTMLButtonElement>("#add-target").disabled = targetGroups.children.length >= 8;
}
$("#add-target").addEventListener("click", () => {addTarget(); changed();});
$("#toughness-mode").addEventListener("change", () => {$("#unit-toughness-label").hidden = $<HTMLSelectElement>("#toughness-mode").value !== "fixed";});
addTarget();
$("#add-weapon").addEventListener("click", () => {
  addWeapon();
  changed();
});
form.addEventListener("input", changed);
form.addEventListener("change", changed);
addWeapon();

function pct(n: number) {
  if (n > 0 && n < 0.0005) return '<0.1%';
  if (n < 1 && n > 0.9995) return '>99.9%';
  return (n * 100).toFixed(1) + "%";
}
function num(n: number) {
  return n.toFixed(2);
}
function showResult(r: any) {
  if (r.status !== "calculated")
    throw new Error("This scenario includes unsupported effects.");
  lastResult = r;
  hasResult = true;
  results.innerHTML = `<div class="result-heading"><div><p class="eyebrow">EXPECTED OUTCOME</p><h2>What gets through</h2></div><button type="button" class="quiet-button" id="download">Save result</button></div><dl class="metrics"><div class="metric"><dt>Average damage</dt><dd>${num(r.expectedDamage)}</dd><small>Expected wounds removed</small></div><div class="metric"><dt>Average models killed</dt><dd>${num(r.expectedCasualties)}</dd><small>Of ${r.targetModels} target models</small></div><div class="metric"><dt>Destroy the entire target</dt><dd>${pct(r.destructionProbability)}</dd><small>Calculated from outcome probabilities</small></div></dl><p class="range-note">10th–90th percentile damage: <strong>${r.damagePercentiles.p10}–${r.damagePercentiles.p90}</strong> · Median: ${r.damagePercentiles.median} · Direct probability calculation</p><div class="distribution"><h3>How many models are destroyed?</h3><div id="bars"></div></div><details><summary>Inputs &amp; calculation assumptions</summary><div id="assumptions"></div></details>`;
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
  const groupSummary = document.createElement("p"); groupSummary.className = "helper";
  groupSummary.textContent = "Average losses by group: " + r.groupCasualties.map((g: any) => `${g.name}: ${num(g.expectedCasualties)}`).join(" / ");
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
  button.textContent = "Calculating probabilities…";
  const scenario = {
    label: "Custom mathhammer scenario",
    defenderGroups: [...targetGroups.children].map(card => readValues(card as HTMLElement)),
    unitToughness: $<HTMLSelectElement>("#toughness-mode").value === "fixed" ? Number($<HTMLInputElement>("#unit-toughness").value) : undefined,
    mortalWounds: /^\d+$/.test($<HTMLInputElement>("#mortal-wounds").value.trim()) ? Number($<HTMLInputElement>("#mortal-wounds").value) : $<HTMLInputElement>("#mortal-wounds").value.trim().toUpperCase(),
    mortalWoundsTiming: $<HTMLSelectElement>("#mortal-timing").value,
    weapons: [...weapons.children].map((card, i) => ({
      name: `Weapon ${i + 1}`,
      ...readValues(card as HTMLElement),
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
      button.textContent = "Calculate odds ↗";
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
    button.textContent = "Calculate odds ↗";
    error.textContent = (e as Error).message;
    error.hidden = false;
  }
});
