import {
  norm,
  RosterSchema,
  type Roster,
  type Snapshot,
  type Unit,
} from "./model.js";

export function resolveUnit(s: Snapshot, name: string): Unit[] {
  const exact = s.units.filter(
    (u) =>
      u.id === name ||
      norm(u.name) === norm(name) ||
      u.aliases.some((a) => norm(a) === norm(name)),
  );
  return exact;
}
type Finding = {
  severity: "error" | "unknown" | "warning";
  code: string;
  message: string;
  selectionId?: string;
};
export function validateRoster(s: Snapshot, input: unknown, now = Date.now()) {
  const parsed = RosterSchema.safeParse(input);
  if (!parsed.success)
    return {
      status: "incomplete" as const,
      snapshotId: s.id,
      findings: [
        {
          severity: "unknown" as const,
          code: "INPUT",
          message: parsed.error.message,
        },
      ],
      totalPoints: null,
      knownPoints: 0,
      units: [],
      citations: s.sources,
      summary: "Roster input is incomplete or malformed.",
    };
  const r = parsed.data;
  const findings: Finding[] = [];
  const add = (
    severity: Finding["severity"],
    code: string,
    message: string,
    selectionId?: string,
  ) =>
    findings.push({
      severity,
      code,
      message,
      ...(selectionId ? { selectionId } : {}),
    });
  if (r.snapshotId !== s.id)
    add(
      "unknown",
      "SNAPSHOT_MISMATCH",
      `Requested ${r.snapshotId}; loaded ${s.id}. Revalidate against the correct snapshot.`,
    );
  if (now - Date.parse(s.createdAt) > 48 * 3600000)
    add(
      "unknown",
      "STALE_DATA",
      "Snapshot is over 48 hours old. Refresh before tournament use.",
    );
  for (const gap of s.coverage.gaps) add("unknown", "COVERAGE", gap);
  if (s.coverage.status !== "complete" && !s.coverage.gaps.length)
    add("unknown", "COVERAGE", "Snapshot coverage is partial.");
  if (!s.muster.verified)
    add(
      "unknown",
      "MUSTER_UNVERIFIED",
      "Muster limits are transcribed community data, not independently verified.",
    );
  const limits = s.muster.limits[String(r.pointsLimit) as "1000" | "2000"];
  let dp = 0;
  const tags = new Set<string>();
  const detNames = new Set<string>();
  const availableEnhancements = new Map<
    string,
    Snapshot["detachments"][number]["enhancements"][number]
  >();
  for (const name of r.detachments) {
    if (detNames.has(norm(name)))
      add(
        "error",
        "DUPLICATE_DETACHMENT",
        `${name} is selected more than once.`,
      );
    detNames.add(norm(name));
    const d = s.detachments.find((d) => norm(d.name) === norm(name));
    if (!d) {
      add("unknown", "DETACHMENT", `Unresolved detachment: ${name}`);
      continue;
    }
    if (d.dp === null)
      add("unknown", "DETACHMENT_COST", `${name} has no verified DP cost.`);
    else dp += d.dp;
    if (d.unique && tags.has(norm(d.unique)))
      add(
        "error",
        "UNIQUE_TAG",
        `Multiple detachments share unique tag ${d.unique}.`,
      );
    if (d.unique) tags.add(norm(d.unique));
    for (const e of d.enhancements) availableEnhancements.set(norm(e.name), e);
  }
  if (
    dp > limits.dp &&
    !(r.pointsLimit === 1000 && r.detachments.length === 1 && dp === 3)
  )
    add("error", "DP_LIMIT", `Detachment cost ${dp} exceeds ${limits.dp} DP.`);
  const ids = new Set<string>();
  const copies = new Map<string, number>();
  const enhanced = new Map<string, number>();
  const resolved = new Map<
    string,
    { selection: Roster["units"][number]; unit: Unit }
  >();
  let knownPoints = 0,
    completePoints = true,
    enhancementSlots = 0;
  const rows: {
    id: string;
    name: string;
    copy: number;
    models: number;
    points: number | null;
  }[] = [];
  for (const selection of r.units) {
    const { id } = selection;
    if (ids.has(id))
      add("error", "DUPLICATE_ID", `Selection ID ${id} is repeated.`, id);
    ids.add(id);
    const candidates = resolveUnit(s, selection.unit);
    if (candidates.length !== 1) {
      completePoints = false;
      add(
        "unknown",
        "UNIT_NAME",
        candidates.length
          ? `Ambiguous unit: ${selection.unit}; use a unit ID.`
          : `Unknown unit: ${selection.unit}.`,
        id,
      );
      continue;
    }
    const u = candidates[0];
    resolved.set(id, { selection, unit: u });
    const has = (word: string) =>
      u.keywords.some((k) => norm(k) === norm(word));
    const count = (copies.get(u.id) ?? 0) + 1;
    copies.set(u.id, count);
    const limit = has("Epic Hero")
      ? 1
      : limits.copies *
        (has("Battleline") || has("Dedicated Transport") ? 2 : 1);
    if (!u.keywords.length)
      add(
        "unknown",
        "KEYWORDS",
        `${u.name} has no verified keywords; copy and character restrictions cannot be fully checked.`,
        id,
      );
    else if (count > limit)
      add(
        "error",
        "COPY_LIMIT",
        `${u.name}: ${count} copies exceeds limit ${limit}.`,
        id,
      );
    if (u.legends) add("error", "LEGENDS", "Legends units are excluded.", id);
    if (u.reviewed?.forbidden)
      add("error", "FACTION", `${u.name} is forbidden in this army.`, id);
    if (u.faction !== "Black Templars")
      add(
        "unknown",
        "ALLIED_ELIGIBILITY",
        `${u.name} needs verified allied inclusion rules.`,
        id,
      );
    for (const gap of u.gaps)
      add("unknown", "UNIT_COVERAGE", `${u.name}: ${gap}`, id);
    const tier = u.pricing.find((t) => {
      const m = t.range.match(/^\[(\d+),(\d*)[\])]$/);
      return m && count >= +m[1] && (!m[2] || count <= +m[2]);
    });
    let points: number | null = null;
    if (!tier) {
      add("unknown", "POINTS_TIER", "No matching requisition tier.", id);
      completePoints = false;
    } else {
      const costs = tier.costs
        .filter((c) => !c.addon)
        .sort((a, b) => a.models - b.models);
      const cost = costs.find(
        (c) =>
          c.models >= selection.models &&
          (!selection.composition ||
            norm(c.desc ?? "") === norm(selection.composition)),
      );
      if (!cost || selection.models < (costs[0]?.models ?? Infinity)) {
        add(
          "error",
          "UNIT_SIZE",
          `Unsupported model count or composition for ${u.name}.`,
          id,
        );
        completePoints = false;
      } else {
        points = cost.points;
        if (
          costs.filter((c) => c.models === cost.models).length > 1 &&
          !selection.composition
        ) {
          add(
            "unknown",
            "COMPOSITION",
            "Multiple priced compositions exist; specify composition.",
            id,
          );
          completePoints = false;
          points = null;
        }
        if (cost.desc && !selection.composition)
          add(
            "unknown",
            "MODEL_COMPOSITION",
            `Verify model composition: ${cost.desc}.`,
            id,
          );
      }
    }
    if (!selection.equipment) {
      add(
        "unknown",
        "EQUIPMENT_MISSING",
        "Equipment must be explicitly listed; no default loadout is assumed.",
        id,
      );
      if (u.wargear?.length) completePoints = false;
    }
    const gearSeen = new Set<string>();
    for (const gear of selection.equipment ?? []) {
      const key = norm(gear.name);
      if (gearSeen.has(key))
        add(
          "error",
          "DUPLICATE_EQUIPMENT",
          `Combine repeated equipment rows for ${gear.name}.`,
          id,
        );
      gearSeen.add(key);
      const charge = u.wargear?.find((w) => norm(w.item) === key);
      if (charge && points !== null) points += charge.points * gear.count;
      const reviewed = u.reviewed?.equipment?.find((e) => norm(e.name) === key);
      if (!reviewed && !u.equipment.some((e) => norm(e) === key) && !charge) {
        add(
          "unknown",
          "UNKNOWN_EQUIPMENT",
          `Unresolved equipment: ${gear.name}`,
          id,
        );
        completePoints = false;
      }
      if (
        reviewed &&
        (gear.count < reviewed.min ||
          gear.count > reviewed.maxPerModel * selection.models ||
          (reviewed.max !== undefined && gear.count > reviewed.max))
      )
        add(
          "error",
          "EQUIPMENT_LIMIT",
          `${gear.name} exceeds its reviewed equipment limits.`,
          id,
        );
    }
    for (const required of u.reviewed?.equipment ?? [])
      if (required.min > 0 && !gearSeen.has(norm(required.name)))
        add("error", "REQUIRED_EQUIPMENT", `${required.name} is required.`, id);
    if (!u.reviewed?.equipment)
      add(
        "unknown",
        "EQUIPMENT_RULES",
        "Complete equipment combinations have not been encoded for this unit.",
        id,
      );
    if (selection.enhancements.length > 1)
      add(
        "error",
        "ENHANCEMENT_PER_UNIT",
        "A unit cannot have more than one enhancement.",
        id,
      );
    for (const name of selection.enhancements) {
      const key = norm(name);
      const e = availableEnhancements.get(key);
      const upgrade = /\(upgrade\)/i.test(name);
      const n = (enhanced.get(key) ?? 0) + 1;
      enhanced.set(key, n);
      if (!upgrade || n === 1) enhancementSlots++;
      if (!e) {
        add(
          "unknown",
          "ENHANCEMENT",
          `${name} is not resolved in the selected detachments.`,
          id,
        );
        completePoints = false;
      } else if (points !== null) points += e.points;
      if (n > (upgrade ? 3 : 1))
        add(
          "error",
          "ENHANCEMENT_DUPLICATE",
          `${name} exceeds its duplicate limit.`,
          id,
        );
      if (
        has("Epic Hero") ||
        (!upgrade && u.keywords.length && !has("Character"))
      )
        add(
          "error",
          "ENHANCEMENT_BEARER",
          `${u.name} cannot take ${name}.`,
          id,
        );
      if (!u.reviewed?.allowedEnhancements)
        add(
          "unknown",
          "ENHANCEMENT_RESTRICTIONS",
          `Bearer-specific restrictions for ${name} need review.`,
          id,
        );
      else if (!u.reviewed.allowedEnhancements.some((n) => norm(n) === key))
        add(
          "error",
          "ENHANCEMENT_RESTRICTIONS",
          `${name} is not allowed on ${u.name}.`,
          id,
        );
    }
    if (
      selection.warlord &&
      (u.faction !== "Black Templars" ||
        (u.keywords.length && !has("Character")) ||
        u.reviewed?.cannotBeWarlord)
    )
      add(
        "error",
        "WARLORD",
        "Warlord must be an eligible faction Character.",
        id,
      );
    if (
      u.reviewed?.mustBeWarlord &&
      !selection.warlord &&
      !r.units.some(
        (x) => x.warlord && resolveUnit(s, x.unit)[0]?.reviewed?.mustBeWarlord,
      )
    )
      add(
        "error",
        "REQUIRED_WARLORD",
        "An included required Warlord must be selected.",
        id,
      );
    if (points !== null) knownPoints += points;
    else completePoints = false;
    if (
      selection.declaredPoints !== undefined &&
      points !== null &&
      points !== selection.declaredPoints
    )
      add(
        "error",
        "DECLARED_POINTS",
        `Declared ${selection.declaredPoints}, computed ${points}; update the roster.`,
        id,
      );
    rows.push({
      id,
      name: u.name,
      copy: count,
      models: selection.models,
      points,
    });
  }
  if (enhancementSlots > limits.enhancements)
    add(
      "error",
      "ENHANCEMENT_LIMIT",
      `${enhancementSlots} enhancement slots exceeds ${limits.enhancements}.`,
    );
  if (r.units.filter((u) => u.warlord).length !== 1)
    add("error", "WARLORD_COUNT", "Select exactly one Warlord.");
  const attachments = new Map<
    string,
    { leader: number; support: number; enhancements: number }
  >();
  for (const { selection, unit } of resolved.values()) {
    const a = selection.attachment;
    if (unit.supportTo?.length && !unit.leaderTo?.length && !a)
      add(
        "error",
        "SUPPORT_REQUIRED",
        `${unit.name} must join a bodyguard unit.`,
        selection.id,
      );
    if (!a) continue;
    const target = resolved.get(a.targetId);
    if (!target || a.targetId === selection.id || target.selection.attachment) {
      add(
        "error",
        "ATTACHMENT_TARGET",
        "Attachment target must be a distinct, unattached bodyguard unit.",
        selection.id,
      );
      continue;
    }
    let allowed = a.role === "leader" ? unit.leaderTo : unit.supportTo;
    for (const enhancement of selection.enhancements) {
      const e = availableEnhancements.get(norm(enhancement));
      allowed = [
        ...(allowed ?? []),
        ...(a.role === "leader" ? (e?.leaderTo ?? []) : (e?.supportTo ?? [])),
      ];
    }
    if (
      !allowed?.length ||
      !allowed.some((n) => norm(n) === norm(target.unit.name))
    )
      add(
        "error",
        "ATTACHMENT_ELIGIBILITY",
        `${unit.name} cannot ${a.role} ${target.unit.name} according to this snapshot.`,
        selection.id,
      );
    const counts = attachments.get(a.targetId) ?? {
      leader: 0,
      support: 0,
      enhancements: target.selection.enhancements.length,
    };
    counts[a.role]++;
    counts.enhancements += selection.enhancements.length;
    attachments.set(a.targetId, counts);
    if (selection.transportId !== target.selection.transportId)
      add(
        "error",
        "ATTACHED_TRANSPORT",
        "An attached unit must share its bodyguard transport assignment.",
        selection.id,
      );
  }
  for (const [id, a] of attachments) {
    if (a.leader > 1 || a.support > 1)
      add(
        "unknown",
        "ATTACHMENT_EXCEPTION",
        "Multiple units in the same attachment role require an explicit verified exception.",
        id,
      );
    if (a.enhancements > 1)
      add(
        "error",
        "ATTACHED_ENHANCEMENTS",
        "The combined attached unit has more than one enhancement.",
        id,
      );
  }
  const capacity = new Map<string, number>();
  for (const { selection, unit } of resolved.values())
    if (selection.transportId) {
      const target = resolved.get(selection.transportId);
      if (
        !target ||
        target.selection.id === selection.id ||
        target.selection.transportId
      ) {
        add(
          "error",
          "TRANSPORT_TARGET",
          "Invalid or nested transport assignment.",
          selection.id,
        );
        continue;
      }
      const t = target.unit.reviewed?.transport;
      if (!t) {
        add(
          "unknown",
          "TRANSPORT_RULES",
          `Capacity and eligibility for ${target.unit.name} need verification.`,
          selection.id,
        );
        continue;
      }
      const keys = new Set(unit.keywords.map(norm));
      if (
        !keys.has(norm(t.requiredKeyword)) ||
        t.excludedKeywords.some((k) => keys.has(norm(k)))
      )
        add(
          "error",
          "TRANSPORT_ELIGIBILITY",
          `${unit.name} is not eligible for ${target.unit.name}.`,
          selection.id,
        );
      const weight = Math.max(
        1,
        ...Object.entries(t.weights)
          .filter(([k]) => keys.has(norm(k)))
          .map(([, v]) => v),
      );
      capacity.set(
        target.selection.id,
        (capacity.get(target.selection.id) ?? 0) + weight * selection.models,
      );
    }
  for (const [id, used] of capacity)
    if (used > resolved.get(id)!.unit.reviewed!.transport!.capacity)
      add(
        "error",
        "TRANSPORT_CAPACITY",
        `Transport requires ${used} spaces, exceeding capacity.`,
        id,
      );
  for (const [unitId, count] of copies) {
    const u = s.units.find((u) => u.id === unitId)!;
    const selections = [...resolved.values()].filter(
      (x) => x.unit.id === unitId,
    );
    if (
      count > 1 &&
      u.pricing.length > 1 &&
      new Set(selections.map((x) => x.selection.models)).size > 1
    )
      add(
        "unknown",
        "REQUISITION_ORDER",
        `${u.name}: mixed sizes across requisition tiers are priced in roster order; verify the applicable allocation rule.`,
      );
  }
  if (knownPoints > r.pointsLimit)
    add(
      "error",
      "POINTS_LIMIT",
      `${knownPoints} known points exceeds ${r.pointsLimit}.`,
    );
  if (!completePoints)
    add(
      "unknown",
      "PARTIAL_POINTS",
      "Only a known points subtotal is available; unresolved selections may add costs.",
    );
  const status = findings.some((f) => f.severity === "error")
    ? "invalid"
    : findings.some((f) => f.severity === "unknown")
      ? "incomplete"
      : "valid";
  return {
    status,
    snapshotId: s.id,
    findings,
    totalPoints: completePoints ? knownPoints : null,
    knownPoints,
    remainingPoints: completePoints ? r.pointsLimit - knownPoints : null,
    detachmentPoints: dp,
    enhancementSlots,
    units: rows,
    citations: s.sources,
    summary: `${r.name}: ${status}; ${completePoints ? knownPoints : "at least " + knownPoints}/${r.pointsLimit} points. Legality is separate from strategic strength.`,
  };
}

export function parseRosterText(
  s: Snapshot,
  text: string,
  context: Omit<Roster, "units">,
) {
  const units: Roster["units"] = [];
  const unresolved: string[] = [];
  let current: Roster["units"][number] | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const header = line.match(/^(.+?)\s*\((\d+)\s*(?:points?|pts)\)$/i);
    if (header) {
      const matches = resolveUnit(s, header[1]);
      current = {
        id: "unit-" + (units.length + 1),
        unit: matches.length === 1 ? matches[0].id : header[1],
        models: 0,
        enhancements: [],
        warlord: false,
        declaredPoints: +header[2],
      };
      units.push(current);
      continue;
    }
    if (current && /^(?:[•*-]\s*)?Warlord$/i.test(line)) {
      current.warlord = true;
      continue;
    }
    if (current && /Enhancement:/i.test(line)) {
      current.enhancements.push(line.replace(/^.*?Enhancement:\s*/i, ""));
      continue;
    }
    if (current && /^(?:[•*-]\s*)?Models:\s*\d+$/i.test(line)) {
      current.models = Number(line.match(/\d+$/)![0]);
      continue;
    }
    if (current && /^(?:[•*-]\s*)?\d+x?\s+/i.test(line)) {
      // Model and weapon lines have the same syntax in common exports. Preserve, never guess.
      unresolved.push(line);
      continue;
    }
    unresolved.push(line);
  }
  return {
    rosterDraft: { ...context, units },
    unresolvedLines: unresolved,
    status: "incomplete",
    instructions:
      "Confirm model counts, equipment, attachments and transports in structured form. Every unparsed line is preserved; this draft cannot certify legality.",
  };
}

export function compareRosters(s: Snapshot, inputs: unknown[]) {
  const results = inputs.map((r) => validateRoster(s, r));
  const rosters = inputs.map((r) => RosterSchema.safeParse(r));
  const limits = new Set(
    rosters.filter((r) => r.success).map((r) => r.data!.pointsLimit),
  );
  return {
    snapshotId: s.id,
    comparable:
      limits.size === 1 &&
      rosters.every((r) => r.success) &&
      results.every(
        (r) => !r.findings.some((f) => f.code === "SNAPSHOT_MISMATCH"),
      ),
    lists: results.map((result, i) => {
      const r = rosters[i];
      if (!r.success) return { validation: result };
      const units = r.data.units.map((u) => ({
        selection: u,
        data: resolveUnit(s, u.unit)[0],
      }));
      return {
        name: r.data.name,
        validation: result,
        metrics: {
          units: units.length,
          models: units.reduce((n, u) => n + u.selection.models, 0),
          characters: units.filter((u) =>
            u.data?.keywords.some((k) => norm(k) === "character"),
          ).length,
          battlelineUnits: units.filter((u) =>
            u.data?.keywords.some((k) => norm(k) === "battleline"),
          ).length,
        },
        assumptions: {
          mission:
            r.data.mission ?? "Unspecified: ask before mission-specific advice",
          terrain:
            r.data.terrain ??
            "Unspecified: do not assume firing lanes or cover",
        },
      };
    }),
    strategicReview: [
      "Scoring and objective access",
      "Mobility and deployment",
      "Durability and trading",
      "Anti-infantry and anti-vehicle coverage",
      "CP and buff dependencies",
      "Matchups, counters and execution difficulty",
    ],
    warning:
      "Metrics describe composition, not expected wins. Compare combat scenarios and dated tournament evidence before recommending.",
  };
}
