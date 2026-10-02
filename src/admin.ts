import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { Store } from "./store.js";
import { refresh, refreshResearch, digest } from "./sources.js";
import { EvidenceSchema, SnapshotSchema, norm } from "./model.js";
import { passwordHash } from "./auth.js";
import { validateRoster } from "./roster.js";

const [command, arg] = process.argv.slice(2);
if (command === "init") {
  if (existsSync(".env"))
    throw new Error(".env already exists; refusing to overwrite");
  const password = randomBytes(24).toString("base64url");
  writeFileSync(
    ".env",
    `PUBLIC_URL=https://templars.example.com\nOWNER_PASSWORD_HASH=${await passwordHash(password)}\nCALLBACK_ORIGINS=https://chatgpt.com,https://claude.ai,https://claude.com\nTRUST_PROXY=true\nAUTO_REFRESH=true\nBIND_ADDRESS=0.0.0.0\nPORT=8787\n`,
    { mode: 0o600 },
  );
  mkdirSync("secrets", { recursive: true });
  writeFileSync("secrets/owner-password.txt", password + "\n", { mode: 0o600 });
  console.log(
    "Created .env and secrets/owner-password.txt. Set PUBLIC_URL, store the owner password in your password manager, and remove the password file. Do not commit either file.",
  );
} else {
  const store = new Store(process.env.DATA_PATH ?? "data/toolkit.sqlite");
  try {
    if (command === "refresh") {
      const s = await refresh(store);
      console.log(
        JSON.stringify(
          { id: s.id, units: s.units.length, coverage: s.coverage },
          null,
          2,
        ),
      );
    } else if (command === "research") {
      console.log({ researchLeads: await refreshResearch(store) });
    } else if (command === "status") {
      const s = store.active();
      console.log(
        JSON.stringify(
          {
            active: s?.id,
            units: s?.units.length,
            coverage: s?.coverage,
            refreshes: store.refreshHistory(),
          },
          null,
          2,
        ),
      );
    } else if (command === "export") {
      if (!arg) throw new Error("Supply output path");
      const s = store.active();
      if (!s) throw new Error("No snapshot");
      writeFileSync(arg, JSON.stringify(s, null, 2));
    } else if (command === "import-snapshot") {
      if (!arg) throw new Error("Supply reviewed snapshot JSON");
      const s = SnapshotSchema.parse(JSON.parse(readFileSync(arg, "utf8")));
      store.activate(s);
      store.recordRefresh(true, "Administrator imported " + s.id);
      console.log("Activated " + s.id);
    } else if (command === "import-evidence") {
      if (!arg) throw new Error("Supply reviewed event JSON array");
      const data = JSON.parse(readFileSync(arg, "utf8"));
      if (!Array.isArray(data)) throw new Error("Expected array");
      const parsed = data.map((e) =>
        EvidenceSchema.parse({
          ...e,
          id:
            e.id ??
            digest(
              norm(e.event) +
                "|" +
                e.eventDate +
                "|" +
                e.pointsLimit +
                "|" +
                norm(e.faction ?? "") +
                "|" +
                (e.placing ?? "") +
                "|" +
                (e.record ?? ""),
            ).slice(0, 24),
          retrievedAt: e.retrievedAt ?? new Date().toISOString(),
        }),
      );
      for (const e of parsed) {
        if (
          e.kind === "event-result" &&
          (!e.eventDate ||
            !e.edition ||
            !e.pointsLimit ||
            !e.rulesVersion ||
            !e.faction ||
            (!e.placing && !e.record))
        )
          throw new Error(
            "Reviewed event results need date, format, edition, rules version, faction and placing or record",
          );
      }
      store.db.exec("BEGIN IMMEDIATE");
      try {
        for (const e of parsed) store.putEvidence(e);
        store.db.exec("COMMIT");
      } catch (e) {
        store.db.exec("ROLLBACK");
        throw e;
      }
      console.log(`Imported ${parsed.length} evidence records`);
    } else if (command === "validate") {
      if (!arg) throw new Error("Supply roster JSON");
      const r = JSON.parse(readFileSync(arg, "utf8"));
      const s = store.snapshot(r.snapshotId);
      if (!s) throw new Error("Snapshot not found");
      console.log(JSON.stringify(validateRoster(s, r), null, 2));
    } else if (command === "backup") {
      if (!arg) throw new Error("Supply a new backup path");
      const p = resolve(arg);
      if (existsSync(p)) throw new Error("Backup target exists");
      mkdirSync(dirname(p), { recursive: true });
      store.backup(p);
      console.log("Backup created");
    } else if (command === "revoke-all") {
      store.db.exec(
        "DELETE FROM auth WHERE kind IN ('access','refresh','family','code','pending')",
      );
      console.log("All authorizations revoked");
    } else {
      console.log(
        "Commands: init, refresh, research, status, export PATH, import-snapshot PATH, import-evidence PATH, validate PATH, backup PATH, revoke-all",
      );
      process.exitCode = command ? 1 : 0;
    }
  } finally {
    store.close();
  }
}
