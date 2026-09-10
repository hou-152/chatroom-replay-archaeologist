#!/usr/bin/env node
// V2 群秘书常驻（雏形）：自动识别数据源（按天 JSON 目录 / txt 转储），默认最新一天，出群秘书日报。
// 「常驻」= 交给 cron/launchd 每天跑一次；监管系统只要把导出物丢进约定目录，这里就吃。
// --feishu <folder-token> 时经 lark-cli 推飞书（通路见 docs：docs +create，@ 相对路径，H1 即标题）。
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseDump } from "../src/parse.mjs";
import { loadJsonDays } from "../src/parse-days.mjs";
import { replayDay, dayKeys } from "../src/replay.mjs";
import { renderReport } from "../src/report.mjs";

const args = process.argv.slice(2);
const src = args.find((a) => !a.startsWith("--"));
const flag = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : null;
};

if (!src) {
  console.error("用法: node bin/daily.mjs <txt转储 或 按天JSON目录> [--date D] [--goals g.json] [--out 文件] [--feishu folder-token]");
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
const safeChat = String(chat).replace(/[/\\:*?"<>|]/g, "-");
const md = renderReport(chat, day).replace(/^# 群聊回放日报 · /, "# 群秘书日报 · ");
const outPath = flag("out") || path.join("reports", `群秘书-${safeChat}-${date}.md`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, md);

console.log(`群秘书日报 ${date}｜${chat}｜信号 ${day.stats.signals}：承诺 ${day.stats.byType.承诺} · 公告 ${day.stats.byType.公告} · 需求 ${day.stats.byType.需求} · 风险 ${day.stats.byType.风险} · 进展 ${day.stats.byType.进展}`);
console.log(`报告 → ${outPath}`);

if (flag("feishu")) {
  const abs = path.resolve(outPath);
  const stdout = execFileSync(
    "lark-cli",
    ["docs", "+create", "--api-version", "v2", "--as", "user", "--doc-format", "markdown", "--content", `@./${path.basename(abs)}`, "--parent-token", flag("feishu")],
    { cwd: path.dirname(abs), encoding: "utf8" }
  );
  const doc = JSON.parse(stdout)?.data?.document || {};
  console.log(`飞书 → ${doc.url || "(未取到 url)"} (document_id=${doc.document_id || "?"})`);
}
