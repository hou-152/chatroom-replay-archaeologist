// 冒烟测试：迷你转储端到端一遍过。
// 期望值独立手算（见各行注释），先于实现写死。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { parseDump } from "../src/parse.mjs";
import { replayDay } from "../src/replay.mjs";
import { renderReport } from "../src/report.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixture = path.join(root, "fixtures", "mini-dump.txt");
const goals = JSON.parse(fs.readFileSync(path.join(root, "goals.example.json"), "utf8"));

test("解析：8 条消息全部为文本，无畸形无重复", () => {
  const { meta, messages, malformedCount, droppedDuplicates } = parseDump(fs.readFileSync(fixture, "utf8"));
  assert.equal(meta["聊天记录"], "111@chatroom");
  assert.equal(messages.length, 9); // 8 条 09-01 + 1 条 09-02
  assert.equal(malformedCount, 0);
  assert.equal(droppedDuplicates, 0);
  assert.equal(messages[0].speaker, "张三");
  assert.equal(messages[6].speaker, "钱七"); // 空正文也算文本消息
  assert.equal(messages[7].reply.to, "张三"); // ↳ 引用挂到孙八那条上
});

test("回放 09-01：承诺2强/需求1/风险1/进展1，出处与对齐正确", () => {
  const { messages } = parseDump(fs.readFileSync(fixture, "utf8"));
  const day = replayDay(messages, "2026-09-01", goals);

  assert.deepEqual(day.stats, {
    total: 8,
    text: 8,
    system: 0,
    malformed: 0,
    signals: 5,
    byType: { 承诺: 2, 公告: 0, 需求: 1, 风险: 1, 进展: 1 },
    strong: 2,
    weak: 0,
  });

  // todo 1：张三的海报承诺，期限=明天之前，对齐 O1›KR1
  assert.equal(day.todos[0].speaker, "张三");
  assert.equal(day.todos[0].deadline, "明天之前");
  assert.equal(day.todos[0].strength, "强");
  assert.equal(day.todos[0].alignedKr, "O1 课程交付顺利 › KR1 作业与出勤");
  // todo 2：孙八的合同承诺（含注入文本，但承诺本身成立），期限=三点前，对齐 O2›KR1
  assert.equal(day.todos[1].speaker, "孙八");
  assert.equal(day.todos[1].deadline, "三点前");
  assert.equal(day.todos[1].alignedKr, "O2 客户生意推进 › KR1 门店落地");
  // 否决：赵六"不了…做不了"不得出承诺；闲聊电影不得出任何信号
  assert.ok(!day.todos.some((t) => t.speaker === "赵六"));
  assert.ok(!day.needs.some((s) => s.speaker === "张三"));
});

test("回放 09-02：跨日隔离，只看当天", () => {
  const { messages } = parseDump(fs.readFileSync(fixture, "utf8"));
  const day = replayDay(messages, "2026-09-02", goals);
  assert.equal(day.stats.total, 1);
  assert.equal(day.stats.signals, 0);
});

test("CLI：exit 0、报告落盘、todo 数量与 --list-days 正确", () => {
  const out = path.join(os.tmpdir(), `replay-smoke-${process.pid}.md`);
  const stdout = execFileSync("node", [
    path.join(root, "bin", "replay.mjs"),
    fixture,
    "--date", "2026-09-01",
    "--goals", path.join(root, "goals.example.json"),
    "--out", out,
  ]).toString();
  assert.match(stdout, /信号 5：/);
  assert.ok(fs.existsSync(out));
  const md = fs.readFileSync(out, "utf8");
  assert.match(md, /^# 群聊回放日报 · 111@chatroom · 2026-09-01$/m);
  assert.equal(md.match(/^- \[ \] @/gm)?.length, 2); // 恰好 2 条 todo
  assert.match(md, /O1 课程交付顺利 › KR1 作业与出勤/);
  fs.rmSync(out, { force: true });

  const days = execFileSync("node", [path.join(root, "bin", "replay.mjs"), fixture, "--list-days"]).toString();
  assert.equal(days.trim(), "2026-09-01\n2026-09-02");
});

test("CLI：文件不存在 exit 3，日期不存在 exit 2", () => {
  const bin = path.join(root, "bin", "replay.mjs");
  assert.throws(
    () => execFileSync("node", [bin, path.join(root, "fixtures", "不存在的文件.txt")], { stdio: "pipe" }),
    (e) => e.status === 3
  );
  assert.throws(
    () => execFileSync("node", [bin, fixture, "--date", "1999-01-01"], { stdio: "pipe" }),
    (e) => e.status === 2
  );
});

test("渲染为纯函数：同输入两次渲染字节一致", () => {
  const { messages } = parseDump(fs.readFileSync(fixture, "utf8"));
  const day = replayDay(messages, "2026-09-01", goals);
  assert.equal(renderReport("111@chatroom", day), renderReport("111@chatroom", day));
});
