// V-ENTP：候选区同步。临时库全流程（dry-run 不写 / apply 幂等 / 备份生成）。
// thoughts 表结构 = entp-manual database.py 实测列（含 category 等扩展列）。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bin = path.join(root, "bin", "entp-sync.mjs");
const weekDir = path.join(root, "fixtures", "json-week");

function makeTempDb() {
  const dbPath = path.join(os.tmpdir(), `entp-test-${process.pid}-${Math.random().toString(36).slice(2)}.db`);
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE thoughts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mainline_id INTEGER,
    title TEXT NOT NULL,
    raw_content TEXT NOT NULL DEFAULT '',
    conclusion TEXT NOT NULL DEFAULT '',
    evidence TEXT NOT NULL DEFAULT '',
    next_step TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '待整理',
    progress INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    category TEXT NOT NULL DEFAULT '未分类',
    interest_level TEXT NOT NULL DEFAULT '有点好奇',
    tags TEXT NOT NULL DEFAULT '',
    reviewed_at TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT '不优先'
  );`);
  db.close();
  return dbPath;
}

test("V-ENTP：dry-run 列出候选且不写库；--apply 落库待整理、无主线、带签名出处", () => {
  const dbPath = makeTempDb();
  const base = [bin, weekDir, "--date", "2026-01-12", "--db", dbPath];

  const dry = execFileSync("node", base).toString();
  assert.match(dry, /候选 1 条/);
  assert.match(dry, /\[dry-run\] 未写库/);
  const db = new DatabaseSync(dbPath);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM thoughts").get().n, 0, "dry-run 不得写库");
  db.close();

  const applied = execFileSync("node", [...base, "--apply"]).toString();
  assert.match(applied, /已写入 1 条候选/);
  assert.match(applied, /备份 →/);

  const db2 = new DatabaseSync(dbPath);
  const row = db2.prepare("SELECT title, raw_content, evidence, status, mainline_id FROM thoughts").get();
  assert.match(row.title, /【群聊·承诺】方案我周五前给你/);
  assert.match(row.raw_content, /期限：周五前/);
  assert.match(row.raw_content, /签名：cra:周测群:2026-01-12:1/);
  assert.match(row.evidence, /#1 \[09:00\]/);
  assert.equal(row.status, "待整理");
  assert.equal(row.mainline_id, null);
  db2.close();
});

test("V-ENTP：幂等——重复 apply 不产生重复候选", () => {
  const dbPath = makeTempDb();
  const args = [bin, weekDir, "--date", "2026-01-12", "--db", dbPath, "--apply"];
  execFileSync("node", args);
  const again = execFileSync("node", args).toString();
  assert.match(again, /跳过重复 1/);
  assert.match(again, /已写入 0 条/);
  const db = new DatabaseSync(dbPath);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM thoughts").get().n, 1);
  db.close();
});

test("V-ENTP：--with-needs 一并收需求；坏库路径 exit 3", () => {
  const dbPath = makeTempDb();
  // 手算：01-18 无承诺；需求 1（帮我看看这个报错）——但同句还含"报错"属风险，需 --with-risks 才收
  const stdout = execFileSync("node", [
    bin, weekDir, "--date", "2026-01-18", "--db", dbPath, "--apply", "--with-needs", "--with-risks",
  ]).toString();
  assert.match(stdout, /候选 2 条/); // 需求 1 + 风险 1
  const db = new DatabaseSync(dbPath);
  const kinds = db.prepare("SELECT title FROM thoughts").all().map((r) => r.title).join("|");
  assert.match(kinds, /【群聊·需求】/);
  assert.match(kinds, /【群聊·风险】/);
  db.close();
  fs.rmSync(dbPath, { force: true });
  assert.throws(
    () => execFileSync("node", [bin, weekDir, "--date", "2026-01-18", "--db", "/tmp/不存在/xx.db", "--apply"], { stdio: "pipe" }),
    (e) => e.status === 3
  );
});
