#!/usr/bin/env node
// CLI：node bin/chronicle.mjs <按天JSON目录> [--goals goals.json] [--out 文件]
// 退出码：0 成功 · 2 用法错误 · 3 目录不存在
import fs from "node:fs";
import path from "node:path";
import { loadJsonDays } from "../src/parse-days.mjs";
import { buildChronicle, renderChronicle } from "../src/chronicle.mjs";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};

if (!dir) {
  console.error("用法: node bin/chronicle.mjs <按天JSON目录> [--goals goals.json] [--out 文件]");
  process.exit(2);
}
if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
  console.error(`目录不存在: ${dir}`);
  process.exit(3);
}

let goals = { objectives: [] };
const goalsPath = flag("goals");
if (goalsPath) goals = JSON.parse(fs.readFileSync(goalsPath, "utf8"));

const { chat, messages } = loadJsonDays(dir);
const c = buildChronicle(chat, messages, goals);
const outPath = flag("out") || path.join("reports", `编年史-${path.basename(dir)}.md`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, renderChronicle(c));

const t = c.totals;
console.log(`${chat}｜${c.start} → ${c.end}｜${c.months.length} 个月｜消息 ${t.messages}｜信号 ${t.signals}：承诺 ${t.byType.承诺}（强 ${t.strong}）· 公告 ${t.byType.公告} · 需求 ${t.byType.需求} · 风险 ${t.byType.风险} · 进展 ${t.byType.进展}`);
console.log(`报告 → ${outPath}`);
