#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { loadSource } from "../src/source.mjs";
import { buildEvidence } from "../src/evidence.mjs";

const usage = "用法: chatroom-replay-archaeologist evidence <txt 或 JSON 目录> [--date YYYY-MM-DD | --start YYYY-MM-DD --end YYYY-MM-DD] [--goals 文件] [--out 文件]";
try {
  const args = process.argv.slice(2);
  const options = {};
  let sourcePath;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (!["date", "start", "end", "goals", "out"].includes(key) || !args[i + 1] || args[i + 1].startsWith("--")) throw new Error(usage);
      options[key] = args[++i];
    } else if (!sourcePath) sourcePath = arg;
    else throw new Error(usage);
  }
  if (!sourcePath || (options.date && (options.start || options.end))) throw new Error(usage);
  sourcePath = path.resolve(sourcePath);
  if (!fs.existsSync(sourcePath)) { console.error(`路径不存在：${sourcePath}`); process.exit(3); }
  const out = options.out ? path.resolve(options.out) : null;
  if (out && (fs.existsSync(out) || out === sourcePath || (fs.statSync(sourcePath).isDirectory() && out.startsWith(sourcePath + path.sep)))) {
    throw new Error("导出文件必须是输入目录外的新文件，不能覆盖已有文件");
  }
  const pack = buildEvidence(loadSource(sourcePath), {
    sourcePath,
    start: options.date || options.start,
    end: options.date || options.end,
    goals: options.goals ? JSON.parse(fs.readFileSync(options.goals, "utf8")) : undefined,
  });
  const json = JSON.stringify(pack, null, 2) + "\n";
  if (out) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, json, { flag: "wx" });
    console.log(`群聊候选 ${pack.evidence.length} 条 → ${out}`);
  } else process.stdout.write(json);
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
