#!/usr/bin/env node
// V-ENTP：把群聊信号灌进 owner 的 ENTP 工作台（entp-manual）候选区 thoughts 表。
// 戒律落地：只 INSERT 候选（status='待整理'，mainline_id=NULL），不建任务/主线、不改不删——
// 裁决发生在 ENTP 工作台自己的审视弹窗里。默认 dry-run，--apply 才写，写前自动备份。
//
// 去重：每条带签名 cra:<群名>:<日期>:<序号>:<类型>，落库前查重，重复跳过（幂等，可反复跑）。
// 零 token：node:sqlite 直写，无任何模型调用。
//
// 用法: node bin/entp-sync.mjs <txt转储 或 JSON目录> [--date D] [--goals g.json]
//                [--db entp_manual.db 路径] [--apply] [--with-needs] [--with-risks]
// 退出码：0 成功 · 2 用法 · 3 路径不存在 · 4 数据库不可写
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parseDump } from "../src/parse.mjs";
import { loadJsonDays } from "../src/parse-days.mjs";
import { replayDay, dayKeys } from "../src/replay.mjs";

const args = process.argv.slice(2);
const src = args.find((a) => !a.startsWith("--"));
const flag = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : null;
};
const has = (n) => args.includes(`--${n}`);

if (!src) {
  console.error("用法: node bin/entp-sync.mjs <txt转储 或 JSON目录> [--date D] [--goals g.json] [--db 路径] [--apply] [--with-needs] [--with-risks]");
  process.exit(2);
}
if (!fs.existsSync(src)) {
  console.error(`路径不存在: ${src}`);
  process.exit(3);
}

// 先验输入再干活：--apply 时数据库必须存在、node:sqlite 必须可用
const apply = has("apply");
const dbPath =
  flag("db") ||
  path.join(os.homedir(), "Library/Application Support/ENTPManual/workspace/entp_manual.db");
let DatabaseSync;
if (apply) {
  if (!fs.existsSync(dbPath)) {
    console.error(`数据库不存在: ${dbPath}`);
    process.exit(3);
  }
  try {
    ({ DatabaseSync } = await import("node:sqlite"));
  } catch {
    console.error("本机 node 没有 node:sqlite（需要 node >= 22.5）。");
    process.exit(4);
  }
}

let chat, messages;
if (fs.statSync(src).isDirectory()) {
  ({ chat, messages } = loadJsonDays(src));
} else {
  const parsed = parseDump(fs.readFileSync(src, "utf8"));
  chat = parsed.meta["聊天记录"] || path.basename(src, path.extname(src));
  messages = parsed.messages;
}

const days = dayKeys(messages);
const date = flag("date") || days[days.length - 1];
if (!days.includes(date)) {
  console.error(`数据源里没有这一天: ${date}（最新 ${days[days.length - 1]}）`);
  process.exit(2);
}

let goals = { objectives: [] };
if (flag("goals")) goals = JSON.parse(fs.readFileSync(flag("goals"), "utf8"));

const day = replayDay(messages, date, goals);
const safeChat = String(chat).replace(/[/\\:*?"<>|\s]/g, "-");

const candidates = [];
for (const s of day.todos) candidates.push({ kind: "承诺", s });
if (has("with-needs")) for (const s of day.needs) candidates.push({ kind: "需求", s });
if (has("with-risks")) for (const s of day.risks) candidates.push({ kind: "风险", s });

const rows = candidates.map(({ kind, s }) => {
  // 签名含信号类型：同一条消息可同时产出需求+风险，只按 seq 会误杀第二条
  const signature = `cra:${safeChat}:${date}:${s.seq}:${kind}`;
  const quote = s.quote.length > 60 ? s.quote.slice(0, 60) + "…" : s.quote;
  return {
    signature,
    title: `【群聊·${kind}】${quote}`,
    raw_content: [
      quote,
      kind === "承诺" ? `期限：${s.deadline || "未说"}` : "",
      `说话人：${s.speaker || "（未知）"}`,
      `出处：#${s.seq} [${s.time}]（群：${chat}）`,
      `签名：${signature}`,
    ].filter(Boolean).join("\n"),
    evidence: `${chat} ${date} #${s.seq} [${s.time}]（可用 chatroom-replay-archaeologist replay --date ${date} 回放复核）`,
  };
});

console.log(`ENTP 候选区同步 ${date}｜${chat}｜候选 ${rows.length} 条（承诺 ${day.todos.length}${has("with-needs") ? ` + 需求 ${day.needs.length}` : ""}${has("with-risks") ? ` + 风险 ${day.risks.length}` : ""}）`);
for (const r of rows) console.log(`  · ${r.title}`);
if (!rows.length) {
  console.log("当日无可入账候选——没有就是没有，不硬造。收工。");
  process.exit(0);
}

if (!apply) {
  console.log(`\n[dry-run] 未写库。确认后加 --apply 写入 → ${dbPath}`);
  process.exit(0);
}

// 写前备份（固定名，覆盖旧备份）
const backupPath = dbPath + ".cra-backup";
fs.copyFileSync(dbPath, backupPath);

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA busy_timeout = 5000");
db.exec("BEGIN");
let inserted = 0;
let skipped = 0;
try {
  for (const r of rows) {
    const dup = db
      .prepare("SELECT COUNT(*) AS n FROM thoughts WHERE raw_content LIKE ?")
      .get(`%${r.signature}%`);
    if (dup.n > 0) {
      skipped += 1;
      continue;
    }
    db.prepare(
      "INSERT INTO thoughts (mainline_id, title, raw_content, evidence, next_step, status) VALUES (NULL, ?, ?, ?, '', '待整理')"
    ).run(r.title, r.raw_content, r.evidence);
    inserted += 1;
  }
  db.exec("COMMIT");
} catch (err) {
  db.exec("ROLLBACK");
  db.close();
  console.error(`写入失败已回滚（工作台应用开着通常不碍事；若反复失败，关掉「个人工作台」再 --apply）：${err.message}`);
  process.exit(4);
}
db.close();

console.log(`已写入 ${inserted} 条候选（待整理，无主线归属）｜跳过重复 ${skipped}｜备份 → ${backupPath}`);
console.log("确认门：打开「个人工作台」候选区审视这些条目——转主线最小行动或抛弃，由你决定。");
