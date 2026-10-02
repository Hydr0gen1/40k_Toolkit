import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  SnapshotSchema,
  type Snapshot,
  EvidenceSchema,
  type Evidence,
} from "./model.js";

export class Store {
  db: DatabaseSync;
  constructor(public path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS snapshots(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS refreshes(id INTEGER PRIMARY KEY, at TEXT NOT NULL, ok INTEGER NOT NULL, message TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS evidence(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS auth(kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, expires INTEGER NOT NULL, PRIMARY KEY(kind,id));`);
  }
  active(): Snapshot | undefined {
    const r = this.db
      .prepare("SELECT value FROM settings WHERE key='active'")
      .get() as { value: string } | undefined;
    return r && this.snapshot(r.value);
  }
  snapshot(id: string): Snapshot | undefined {
    const r = this.db
      .prepare("SELECT data FROM snapshots WHERE id=?")
      .get(id) as { data: string } | undefined;
    return r && SnapshotSchema.parse(JSON.parse(r.data));
  }
  activate(candidate: Snapshot) {
    const s = SnapshotSchema.parse(candidate);
    if (!s.units.length || !s.detachments.length || !s.sources.length)
      throw new Error("Empty snapshot cannot be activated");
    if (new Set(s.units.map((u) => u.id)).size !== s.units.length)
      throw new Error("Duplicate unit identifiers");
    const ids = new Set(s.sources.map((s) => s.id));
    if (
      s.units.some((u) => u.sourceIds.some((id) => !ids.has(id))) ||
      s.rules.some((r) => !ids.has(r.sourceId))
    )
      throw new Error("Unresolved source reference");
    const previous = this.snapshot(s.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(s))
      throw new Error("Snapshot IDs are immutable");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("INSERT OR IGNORE INTO snapshots VALUES (?,?)")
        .run(s.id, JSON.stringify(s));
      this.db
        .prepare("INSERT OR REPLACE INTO settings VALUES ('active',?)")
        .run(s.id);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  recordRefresh(ok: boolean, message: string) {
    this.db
      .prepare("INSERT INTO refreshes(at,ok,message) VALUES (?,?,?)")
      .run(new Date().toISOString(), Number(ok), message);
  }
  refreshHistory() {
    return this.db
      .prepare("SELECT at,ok,message FROM refreshes ORDER BY id DESC LIMIT 10")
      .all();
  }
  putEvidence(e: Evidence) {
    e = EvidenceSchema.parse(e);
    this.db
      .prepare("INSERT OR REPLACE INTO evidence VALUES (?,?)")
      .run(e.id, JSON.stringify(e));
  }
  evidence(): Evidence[] {
    return (
      this.db.prepare("SELECT data FROM evidence").all() as { data: string }[]
    ).map((r) => EvidenceSchema.parse(JSON.parse(r.data)));
  }
  getAuth<T>(kind: string, id: string): T | undefined {
    const row = this.db
      .prepare("SELECT data FROM auth WHERE kind=? AND id=? AND expires>?")
      .get(kind, id, Date.now()) as { data: string } | undefined;
    return row && JSON.parse(row.data);
  }
  setAuth(kind: string, id: string, data: unknown, expires: number) {
    this.db
      .prepare("INSERT OR REPLACE INTO auth VALUES (?,?,?,?)")
      .run(kind, id, JSON.stringify(data), expires);
  }
  delAuth(kind: string, id: string) {
    this.db.prepare("DELETE FROM auth WHERE kind=? AND id=?").run(kind, id);
  }
  cleanup() {
    this.db.prepare("DELETE FROM auth WHERE expires<?").run(Date.now());
  }
  backup(path: string) {
    this.db.prepare("VACUUM INTO ?").run(path);
  }
  close() {
    this.db.close();
  }
}
