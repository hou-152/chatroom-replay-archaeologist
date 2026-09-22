import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadSource } from "../src/source.mjs";
import { parseDump } from "../src/parse.mjs";
import { buildEvidence } from "../src/evidence.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixture = path.join(root, "fixtures/json-week");
const cli = path.join(root, "bin/cli.mjs");
const run = (...args) => spawnSync(process.execPath, [cli, "evidence", ...args], { encoding: "utf8" });

test("候选导出：7 条信号保留说话人、实际日期、完整原文与可回查的 JSON 来源", () => {
  const pack = buildEvidence(loadSource(fixture), { sourcePath: fixture });
  assert.equal(pack.schemaVersion, "chatroom-evidence/v1");
  assert.equal(pack.evidence.length, 7);
  assert.deepEqual(pack.period, { start: "2026-01-12", end: "2026-01-18" });
  for (const item of pack.evidence) {
    const [file, locator] = item.source.ref.split("#");
    const index = Number(locator.match(/^messages\[(\d+)\]$/)[1]);
    const raw = JSON.parse(fs.readFileSync(file, "utf8")).messages[index];
    assert.equal(item.source.originalBody, raw.content);
    assert.equal(item.source.speaker, raw.sender);
    assert.equal(item.occurredAt, raw.time.slice(0, 10));
    assert.equal(item.projectId, undefined);
    assert.equal(item.done, undefined);
  }
  const sameMessage = pack.evidence.filter(item => item.body === "帮我看看这个报错");
  assert.equal(sameMessage.length, 2);
  assert.equal(new Set(sameMessage.map(item => item.source.messageId)).size, 1);
  assert.equal(new Set(sameMessage.map(item => item.id)).size, 2);
});

test("补录历史、重排和改序号不会改变已有候选 ID；目标命中只进入建议", () => {
  const source = loadSource(fixture);
  const first = buildEvidence(source, { sourcePath: fixture });
  const changed = {
    ...source,
    messages: [
      { seq: 1, kind: "text", date: "2026-01-01", time: "08:00", speaker: "新同学", body: "我明天之前交方案", reply: null },
      ...source.messages.map(message => ({ ...message, seq: message.seq + 100 })).reverse(),
    ],
  };
  const second = buildEvidence(changed, { sourcePath: fixture });
  for (const item of first.evidence) assert.ok(second.evidence.some(next => next.id === item.id));
  const aligned = buildEvidence(source, {
    sourcePath: fixture,
    goals: { objectives: [{ o: "项目", krs: [{ kr: "交付", keywords: ["方案"] }] }] },
  });
  assert.equal(aligned.evidence.find(item => item.kind === "承诺").goalSuggestion, "项目 › 交付");
  assert.ok(aligned.evidence.every(item => !item.projectId && !item.objectiveId));
});

test("同人同秒同文出现在不同群中，不会在适配或候选导出中被去重", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cra-evidence-groups-"));
  for (const [file, chat] of [["a.json", "甲群"], ["b.json", "乙群"]]) {
    fs.writeFileSync(path.join(dir, file), JSON.stringify({ chat, messages: [{ local_id: 1, timestamp: 1, time: "2026-01-12 09:00", sender: "张三", type: "文本", content: "方案我周五前给你" }] }));
  }
  const source = loadSource(dir);
  assert.equal(source.messages.length, 2);
  const pack = buildEvidence(source, { sourcePath: dir });
  assert.equal(new Set(pack.evidence.map(item => item.id)).size, 2);
  assert.deepEqual(pack.evidence.map(item => item.source.chat).sort(), ["乙群", "甲群"].sort());
});

test("txt 来源准确定位首行，长正文不因展示摘要被截断，引用独立保留", () => {
  const text = `[2026-01-12 09:00] 张三: 方案我周五前给你。${"补充说明。".repeat(130)}\n  ↳ 回复 李四: 请确认方案`;
  const parsed = parseDump(text);
  const pack = buildEvidence({ chat: "测试群", messages: parsed.messages }, { sourcePath: "/tmp/evidence-input.txt" });
  const item = pack.evidence[0];
  assert.equal(item.source.ref, "/tmp/evidence-input.txt#L1");
  assert.ok(item.body.length > 500);
  assert.ok(item.quote.length <= 60);
  assert.equal(item.source.reply.to, "李四");
});

test("CLI 日期窗口与确定性：同输入同字节，空窗口有效，非法日期和参数被拒绝", () => {
  const first = run(fixture, "--date", "2026-01-18");
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout, run(fixture, "--date", "2026-01-18").stdout);
  assert.equal(JSON.parse(first.stdout).evidence.length, 3);
  assert.equal(JSON.parse(run(fixture, "--date", "2026-01-17").stdout).evidence.length, 0);
  for (const flags of [["--date", "2026-02-30"], ["--start", "2026-02-01", "--end", "2026-01-01"], ["--date", "2026-01-18", "--start", "2026-01-01"], ["--bad", "x"]]) {
    assert.equal(run(fixture, ...flags).status, 2);
  }
});

test("CLI 不能覆盖原始语料、已有文件或在输入目录里写输出", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cra-evidence-output-"));
  const input = path.join(dir, "chat.txt");
  const text = "[2026-01-12 09:00] 张三: 方案我周五前给你\n";
  fs.writeFileSync(input, text);
  assert.equal(run(input, "--out", input).status, 2);
  assert.equal(fs.readFileSync(input, "utf8"), text);
  assert.equal(run(dir, "--out", path.join(dir, "export.json")).status, 2);
  const out = path.join(dir, "out.json");
  assert.equal(run(input, "--out", out).status, 0);
  assert.equal(JSON.parse(fs.readFileSync(out, "utf8")).evidence.length, 1);
  assert.equal(run(input, "--out", out).status, 2);
  assert.equal(run(path.join(dir, "missing.txt")).status, 3);
});


test("不同引用回复保留，完整重复回复仍去重", () => {
  const message = to => `[2026-01-12 09:00] 张三: 方案我周五前给你\n  ↳ 回复 ${to}: 请确认方案`;
  const parsed = parseDump([message("甲"), message("乙"), message("甲")].join("\n"));
  assert.equal(parsed.messages.length, 2);
  assert.equal(parsed.droppedDuplicates, 1);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cra-evidence-replies-"));
  fs.writeFileSync(path.join(dir, "day.json"), JSON.stringify({ chat: "测试群", messages: ["甲", "乙", "甲"].map(to => ({
    time: "2026-01-12 09:00", timestamp: 1, sender: "张三", type: "文本", content: `[引用] 方案我周五前给你\n↳ ${to}: 请确认方案`,
  })) }));
  const jsonSource = loadSource(dir);
  assert.equal(jsonSource.messages.length, 2);
  assert.equal(jsonSource.droppedDuplicates, 1);
  assert.equal(buildEvidence(jsonSource, { sourcePath: dir }).evidence.length, 2);
  const pack = buildEvidence({ chat: "测试群", messages: parsed.messages }, { sourcePath: "/tmp/replies.txt" });
  assert.equal(pack.evidence.length, 2);
  assert.equal(new Set(pack.evidence.map(item => item.id)).size, 2);
  assert.deepEqual(pack.evidence.map(item => item.source.reply.to).sort(), ["乙", "甲"].sort());
});
