// 语料清洗：结构化 JSONL 正本 + 清洗统计。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bin = path.join(root, "bin", "clean.mjs");

test("清洗：json-days 夹具 → 8 条消息洗出 6 行（丢 2 条空正文），引用拆成两字段", () => {
  // 夹具 8 条：[图片] 与 [合并聊天记录] 剥空被丢；拍了拍系统行保留；引用条拆 reply_to/excerpt
  const out = path.join(os.tmpdir(), `cleaned-${process.pid}.jsonl`);
  const stdout = execFileSync("node", [bin, path.join(root, "fixtures", "json-days"), "--out", out]).toString();
  assert.match(stdout, /保留 6 条/);
  assert.match(stdout, /空正文丢弃 2/);
  const rows = fs.readFileSync(out, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(rows.length, 6);
  const quoted = rows.find((r) => r.body === "同意这个判断");
  assert.equal(quoted.reply_to, "张三");
  assert.equal(quoted.reply_excerpt, "我明天之前给你合同");
  assert.ok(rows.some((r) => r.kind === "system" && r.body.includes("拍了拍")));
  fs.rmSync(out, { force: true });
});

test("清洗：缺参数 exit 2，坏路径 exit 3", () => {
  assert.throws(() => execFileSync("node", [bin], { stdio: "pipe" }), (e) => e.status === 2);
  assert.throws(
    () => execFileSync("node", [bin, path.join(root, "fixtures", "不存在")], { stdio: "pipe" }),
    (e) => e.status === 3
  );
});
