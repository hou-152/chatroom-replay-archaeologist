#!/usr/bin/env node
// V6 群周刊：按上游 okr-review 的周复盘 RREUA 结构出刊（Result/Reason/Update/Action 留白给人，
// 机器只灌 Evidence 事实层——记录与裁决分离的上游模板本身就是这么设计的）。
// --feishu <folder-token> 推飞书。退出码：0 成功 · 2 用法 · 3 路径不存在
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseDump } from "../src/parse.mjs";
import { loadJsonDays } from "../src/parse-days.mjs";
import { detectSignals } from "../src/signals.mjs";
import { alignKr } from "../src/replay.mjs";

const args = process.argv.slice(2);
const src = args.find((a) => !a.startsWith("--"));
const flag = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : null;
};

if (!src) {
  console.error("用法: node bin/weekly.mjs <txt转储 或 JSON目录> [--end YYYY-MM-DD] [--goals g.json] [--out 文件] [--feishu folder-token]");
  process.exit(2);
}
if (!fs.existsSync(src)) {
  console.error(`路径不存在: ${src}`);
  process.exit(3);
}

let chat, messages;
if (fs.statSync(src).isDirectory()) {
  ({ chat, messages } = loadJsonDays(src));
} else {
  const parsed = parseDump(fs.readFileSync(src, "utf8"));
  chat = parsed.meta["聊天记录"] || path.basename(src, path.extname(src));
  messages = parsed.messages;
}

const days = [...new Set(messages.filter((m) => m.date).map((m) => m.date))].sort();
const end = flag("end") || days[days.length - 1];
// 窗口语义：end 是日历端点，不必是有消息的日子——静默周是合法产出
if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) {
  console.error(`日期格式应为 YYYY-MM-DD: ${end}`);
  process.exit(2);
}
const endDate = new Date(end + "T00:00:00Z");
const startDate = new Date(endDate.getTime() - 6 * 86400000);
const start = startDate.toISOString().slice(0, 10);

let goals = { objectives: [] };
if (flag("goals")) goals = JSON.parse(fs.readFileSync(flag("goals"), "utf8"));

// Logseq 大纲行：indent 为空格数
const L = (indent, text) => " ".repeat(indent) + "- " + text;

const byDay = new Map();
const todos = [];
const risks = [];
const progress = [];
const byType = { 承诺: 0, 公告: 0, 需求: 0, 风险: 0, 进展: 0 };
let textCount = 0;
let systemCount = 0;
const krHits = new Map();
let unaligned = 0;

for (const m of messages) {
  if (!m.date || m.date < start || m.date > end) continue;
  if (m.kind !== "text") {
    systemCount += 1;
    continue;
  }
  textCount += 1;
  const b = byDay.get(m.date) || { messages: 0, signals: 0 };
  b.messages += 1;
  byDay.set(m.date, b);
  for (const s of detectSignals(m.body)) {
    const kr = alignKr(s, goals);
    if (kr) krHits.set(kr, (krHits.get(kr) || 0) + 1);
    else if (s.type !== "公告") unaligned += 1;
    byType[s.type] += 1;
    b.signals += 1;
    const full = { ...s, seq: m.seq, date: m.date, time: m.time, speaker: m.speaker, alignedKr: kr };
    if (s.type === "承诺") todos.push(full);
    if (s.type === "风险") risks.push(full);
    if (s.type === "进展") progress.push(full);
  }
}

const activeDays = [...byDay.keys()].sort();
const totalSignals = byType.承诺 + byType.公告 + byType.需求 + byType.风险 + byType.进展;

const evidenceLines = [
  L(4, `本周 ${activeDays.length} 天有消息｜消息 ${textCount} 条（系统 ${systemCount}）｜信号 ${totalSignals}：承诺 ${byType.承诺} · 公告 ${byType.公告} · 需求 ${byType.需求} · 风险 ${byType.风险} · 进展 ${byType.进展}`),
  L(4, "逐日："),
  ...(activeDays.length
    ? activeDays.map((d) => L(6, `${d}｜消息 ${byDay.get(d).messages}｜信号 ${byDay.get(d).signals}`))
    : [L(6, "本周静默")]),
  L(4, "承诺台账："),
  ...(todos.length
    ? todos.map((s) => L(6, `[ ] ${s.date} @${s.speaker || "（未知）"}「${s.quote}」${s.deadline ? `｜期限：${s.deadline}` : ""}`) + "\n" + L(8, `出处：#${s.seq} [${s.time}]`))
    : [L(6, "无")]),
  L(4, "风险带："),
  ...(risks.length
    ? risks.map((s) => L(6, `${s.date} @${s.speaker || "（未知）"}「${s.quote}」`) + "\n" + L(8, `出处：#${s.seq} [${s.time}]`))
    : [L(6, "无")]),
  L(4, "对齐：" + ([...krHits.entries()].map(([kr, n]) => `${kr} ${n} 条`).join("｜") || "无命中") + `｜未对齐 ${unaligned} 条（非目标区，不强塞）`),
];

const outline = [
  L(0, "## 周复盘"),
  `  parent:: [[${start} → ${end}]]`,
  `  related:: [[${end.slice(0, 4)} OKRs]]`,
  `  date:: ${end}`,
  L(2, "Result：（待填——只属于你）"),
  L(2, "Reason：（待填）"),
  L(2, "Evidence："),
  ...evidenceLines,
  L(2, "Update：（待填）"),
  L(2, "Action：（待填——本周遗留承诺如下，供认领）"),
  ...(todos.length ? todos.map((s) => L(4, `TODO ${s.date}「${s.quote}」`)) : [L(4, "TODO（无遗留承诺）")]),
];

const safeChat = String(chat).replace(/[/\\:*?"<>|\s]/g, "-");
const outPath = flag("out") || path.join("reports", `群周刊-${safeChat}-${end}.md`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, outline.join("\n") + "\n");

console.log(`群周刊 ${start} → ${end}｜${chat}｜信号 ${totalSignals}：承诺 ${byType.承诺} · 公告 ${byType.公告} · 需求 ${byType.需求} · 风险 ${byType.风险} · 进展 ${byType.进展}`);
console.log(`Result/Reason/Update/Action 留白给你——本刊只灌 Evidence → ${outPath}`);

if (flag("feishu")) {
  const larkCli = process.env.LARK_CLI || "lark-cli";
  const abs = path.resolve(outPath);
  const stdout = execFileSync(
    larkCli,
    ["docs", "+create", "--api-version", "v2", "--as", "user", "--doc-format", "markdown", "--content", `@./${path.basename(abs)}`, "--parent-token", flag("feishu")],
    { cwd: path.dirname(abs), encoding: "utf8" }
  );
  const doc = JSON.parse(stdout)?.data?.document || {};
  console.log(`飞书 → ${doc.url || "(未取到 url)"} (document_id=${doc.document_id || "?"})`);
}
