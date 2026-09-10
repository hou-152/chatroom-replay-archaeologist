#!/usr/bin/env node
// CLI：node bin/replay.mjs <dump.txt> [--date YYYY-MM-DD] [--goals goals.json] [--out 文件] [--list-days]
// 退出码：0 成功 · 2 用法错误 · 3 文件不存在
import fs from "node:fs";
import path from "node:path";
import { parseDump } from "../src/parse.mjs";
import { replayDay, dayKeys } from "../src/replay.mjs";
import { renderReport } from "../src/report.mjs";

const args = process.argv.slice(2);
const dumpArg = args.find((a) => !a.startsWith("--"));
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const hasFlag = (name) => args.includes(`--${name}`);

if (!dumpArg || hasFlag("help")) {
  console.error("用法: node bin/replay.mjs <dump.txt> [--date YYYY-MM-DD] [--goals goals.json] [--out 文件] [--list-days]");
  process.exit(dumpArg ? 0 : 2);
}
if (!fs.existsSync(dumpArg)) {
  console.error(`文件不存在: ${dumpArg}`);
  process.exit(3);
}

const text = fs.readFileSync(dumpArg, "utf8");
const { meta, messages, malformedCount, droppedDuplicates } = parseDump(text);
const chatId = meta["聊天记录"] || path.basename(dumpArg, path.extname(dumpArg));

if (hasFlag("list-days")) {
  for (const d of dayKeys(messages)) console.log(d);
  process.exit(0);
}

const days = dayKeys(messages);
const date = flag("date") || days[days.length - 1];
if (!date || !days.includes(date)) {
  console.error(`转储里没有这一天。可用日期: ${days.join(", ") || "（无）"}（用 --list-days 查看）`);
  process.exit(2);
}

let goals = { objectives: [] };
const goalsPath = flag("goals");
if (goalsPath) {
  if (!fs.existsSync(goalsPath)) {
    console.error(`目标文件不存在: ${goalsPath}`);
    process.exit(3);
  }
  goals = JSON.parse(fs.readFileSync(goalsPath, "utf8"));
}

const day = replayDay(messages, date, goals);
const outPath =
  flag("out") || path.join("reports", `回放-${chatId}-${date}.md`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
const md = renderReport(chatId, day);
fs.writeFileSync(outPath, md);

console.log(`日期 ${date}｜消息 ${day.stats.total}（畸形 ${day.stats.malformed}）｜信号 ${day.stats.signals}：承诺 ${day.stats.byType.承诺}（强 ${day.stats.strong}/弱 ${day.stats.weak}）· 公告 ${day.stats.byType.公告} · 需求 ${day.stats.byType.需求} · 风险 ${day.stats.byType.风险} · 进展 ${day.stats.byType.进展}`);
console.log(`转储解析：畸形行 ${malformedCount} · 重复丢弃 ${droppedDuplicates}`);
console.log(`报告 → ${outPath}`);
