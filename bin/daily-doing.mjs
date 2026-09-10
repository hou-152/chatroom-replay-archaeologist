#!/usr/bin/env node
// V5 群聊灌 Daily Doing：按上游 okr-doing-agent 的 daily-routine 模板真格式出稿。
// 溯源：templates/logseq/templates/daily-routine.md（今天需要做 TODO / 今日行动记录 / 明天要做）。
// 确认门：产出落在 outbox/，粘贴动作=人工确认；本命令绝不写 Logseq 图谱。
// 退出码：0 成功 · 2 用法 · 3 路径不存在
import fs from "node:fs";
import path from "node:path";
import { parseDump } from "../src/parse.mjs";
import { loadJsonDays } from "../src/parse-days.mjs";
import { replayDay, dayKeys } from "../src/replay.mjs";

const args = process.argv.slice(2);
const src = args.find((a) => !a.startsWith("--"));
const flag = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : null;
};

if (!src) {
  console.error("用法: node bin/daily-doing.mjs <txt转储 或 JSON目录> [--date D] [--goals g.json] [--out 文件]");
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

// 上游 daily-routine 模板结构：TODO 候选灌「今天需要做」，进展事实灌「今日行动记录」。
const todo = day.todos.map(
  (s) => `    - TODO ${s.quote}（期限：${s.deadline || "未说"}｜出处 #${s.seq} ${s.time}｜${s.speaker}）`
);
const done = day.progress.map(
  (s) => `    - ${s.quote}（出处 #${s.seq} ${s.time}｜${s.speaker}）`
);

const outline = [
  "- ## daily routine",
  `  due:: ${date}`,
  `  parent:: [[${date.slice(0, 4)} ${Number(date.slice(5, 7))}月]]`,
  "  project::",
  "  - ### 今天需要做",
  ...(todo.length ? todo : ["    - TODO（当日群聊无承诺候选——没有就是没有，不硬造）"]),
  "  - ### 今日行动记录",
  ...(done.length ? done : ["    - （当日群聊无可入账的完成事实）"]),
  "  - ### 明天要做",
  "    - TODO",
];

const outPath =
  flag("out") || path.join("outbox", `daily-routine-${safeChat}-${date}.md`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, outline.join("\n") + "\n");

console.log(`daily-routine 稿 ${date}｜${chat}｜TODO 候选 ${day.todos.length}（人工确认后保留）｜行动记录 ${day.progress.length}`);
console.log(`粘贴前请删掉不认可的 TODO——粘贴即确认 → ${outPath}`);
