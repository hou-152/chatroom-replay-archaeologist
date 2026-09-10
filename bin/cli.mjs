#!/usr/bin/env node
// npm 统一入口：chatroom-replay-archaeologist <command> [args...]
// 子命令与其余参数原样转发给对应脚本。
import path from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const command = process.argv[2];
const rest = process.argv.slice(3);

const commands = {
  replay: "replay.mjs",
  daily: "daily.mjs",
  "daily-doing": "daily-doing.mjs",
  weekly: "weekly.mjs",
  chronicle: "chronicle.mjs",
  clean: "clean.mjs",
};

if (!command || command === "help" || !commands[command]) {
  console.error(`群聊回放考古官 —— 微信群聊导出 → 带出处的 todo/OKR 信号

用法: chatroom-replay-archaeologist <command> [args...]

  replay      单日回放日报（txt 转储或 JSON 目录）
  daily       群秘书日报（默认最新一天，--state 可常驻）
  daily-doing daily-routine 大纲稿（上游 okr-doing-agent 真格式）
  weekly      周复盘 RREUA 周刊（机器只灌 Evidence）
  chronicle   全量编年史（月度脉搏/KR 对齐/承诺全录/风险带）
  clean       语料清洗 → 结构化 JSONL 正本

示例:
  chatroom-replay-archaeologist replay 群导出.txt --date 2026-08-30 --goals goals.example.json
  chatroom-replay-archaeologist weekly ./json-days --feishu <folder-token>
  chatroom-replay-archaeologist chronicle ./json-days --goals goals.example.json`);
  process.exit(command && command !== "help" ? 2 : 0);
}

const result = spawnSync(process.execPath, [path.join(here, commands[command]), ...rest], {
  stdio: "inherit",
});
process.exit(result.status ?? 0);
