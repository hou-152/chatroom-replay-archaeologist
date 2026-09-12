// 输入源边界：统一 txt 转储与按天 JSON 目录的适配，供所有 CLI 共用。
// 这里不做业务判断，只把不同来源收敛为 { chat, messages, ... }。
import fs from "node:fs";
import path from "node:path";
import { parseDump } from "./parse.mjs";
import { loadJsonDays } from "./parse-days.mjs";

export function loadSource(sourcePath) {
  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) return { malformedCount: 0, ...loadJsonDays(sourcePath) };

  const parsed = parseDump(fs.readFileSync(sourcePath, "utf8"));
  return {
    chat: parsed.meta["聊天记录"] || path.basename(sourcePath, path.extname(sourcePath)),
    messages: parsed.messages,
    malformedCount: parsed.malformedCount,
    droppedDuplicates: parsed.droppedDuplicates,
  };
}
