#!/usr/bin/env node
// 语料清洗：把 txt 转储或按天 JSON 目录，洗成一份带结构的 JSONL 正本。
// 清洗 = 解析（引用拆分/系统行归类/标记剥离）+ 同秒同人同文去重 + 丢空正文文本行（计数留痕）。
// 退出码：0 成功 · 2 用法错误 · 3 路径不存在
import fs from "node:fs";
import path from "node:path";
import { parseDump } from "../src/parse.mjs";
import { loadJsonDays } from "../src/parse-days.mjs";

const args = process.argv.slice(2);
const src = args.find((a) => !a.startsWith("--"));
const flag = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : null;
};

if (!src) {
  console.error("用法: node bin/clean.mjs <txt转储 或 按天JSON目录> [--out data/cleaned.jsonl]");
  process.exit(2);
}
if (!fs.existsSync(src)) {
  console.error(`路径不存在: ${src}`);
  process.exit(3);
}

let chat, messages, droppedDuplicates = 0;
if (fs.statSync(src).isDirectory()) {
  ({ chat, messages, droppedDuplicates } = loadJsonDays(src));
} else {
  const parsed = parseDump(fs.readFileSync(src, "utf8"));
  chat = parsed.meta["聊天记录"] || path.basename(src, path.extname(src));
  messages = parsed.messages;
  droppedDuplicates = parsed.droppedDuplicates;
}

const outPath = flag("out") || path.join("data", `cleaned-${String(chat).replace(/[/\\:*?"<>|\s]/g, "-")}.jsonl`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });

let droppedEmpty = 0;
const lines = [];
for (const m of messages) {
  if (m.kind === "text" && !String(m.body || "").trim()) {
    droppedEmpty += 1;
    continue;
  }
  lines.push(
    JSON.stringify({
      seq: m.seq,
      date: m.date,
      time: m.time,
      speaker: m.speaker,
      kind: m.kind,
      body: m.body,
      reply_to: m.reply?.to || null,
      reply_excerpt: m.reply?.excerpt || null,
    })
  );
}
fs.writeFileSync(outPath, lines.join("\n") + "\n");

console.log(`正本 → ${outPath}`);
console.log(`保留 ${lines.length} 条（文本+系统）｜去重丢弃 ${droppedDuplicates}｜空正文丢弃 ${droppedEmpty}`);
