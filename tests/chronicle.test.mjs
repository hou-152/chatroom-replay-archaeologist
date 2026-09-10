// V4 编年史：JSON 适配层 + 全量聚合 + 渲染。期望值独立手算（见断言注释）。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { adaptMessage, loadJsonDays } from "../src/parse-days.mjs";
import { buildChronicle, renderChronicle } from "../src/chronicle.mjs";
import { detectSignals } from "../src/signals.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixtureDir = path.join(root, "fixtures", "json-days");
const goals = JSON.parse(fs.readFileSync(path.join(root, "goals.example.json"), "utf8"));

test("适配层：引用剥出回复且摘录不进正文；拍了拍归系统；[图片]剥空", () => {
  const quoted = adaptMessage(
    { content: "[引用] 同意这个判断\n  ↳ 张三: 我明天之前给你合同", sender: "王五", time: "2026-01-01 10:00", type: "文本" },
    1
  );
  assert.equal(quoted.kind, "text");
  assert.equal(quoted.body, "同意这个判断");
  assert.equal(quoted.reply.to, "张三");
  assert.equal(quoted.reply.excerpt, "我明天之前给你合同");

  const pat = adaptMessage(
    { content: "[链接] \"李四\" 拍了拍 \"张三\" 哈哈", sender: "", time: "2026-01-01 09:05", type: "系统" },
    2
  );
  assert.equal(pat.kind, "system");

  const pic = adaptMessage({ content: "[图片]", sender: "张三", time: "2026-01-15 08:30", type: "图片" }, 3);
  assert.equal(pic.kind, "text");
  assert.equal(pic.body, "");

  const merged = adaptMessage(
    { content: "[合并聊天记录] 派女孩与文件传输助手的聊天记录 (10条) - 派女孩: 03月09日", sender: "赵六", time: "2026-01-15 09:00", type: "文本" },
    4
  );
  assert.equal(merged.kind, "text");
  assert.equal(merged.body, ""); // 转发打包剥空，标题里的日期词不得外泄成信号
});

test("编年史聚合：手算核验总数、月度、KR 未对齐数", () => {
  const { chat, messages } = loadJsonDays(fixtureDir);
  assert.equal(chat, "测试群");
  assert.equal(messages.length, 8);

  const c = buildChronicle(chat, messages, goals);
  assert.equal(c.start, "2026-01-01");
  assert.equal(c.end, "2026-02-01");
  assert.deepEqual(c.totals, {
    messages: 8,
    system: 1,
    signals: 4,
    byType: { 承诺: 1, 公告: 1, 需求: 1, 风险: 1, 进展: 0 },
    strong: 1,
  });
  assert.equal(c.months.length, 2);
  const jan = c.months[0];
  assert.equal(jan.ym, "2026-01");
  assert.equal(jan.messages, 5); // 3 + 3 条里去掉 1 条系统；合并聊天记录剥空但仍是消息
  assert.equal(jan.byType.承诺, 1);
  assert.equal(jan.byType.需求, 1);
  const feb = c.months[1];
  assert.equal(feb.ym, "2026-02");
  assert.equal(feb.byType.风险, 1);
  assert.equal(feb.byType.公告, 1);
  // goals.example.json 的关键词与夹具信号零命中 → 全部未对齐（公告不参与对齐）
  assert.equal(c.krRows.length, 0);
  assert.equal(c.unaligned, 3);
  assert.deepEqual(c.unByType, { 承诺: 1, 公告: 0, 需求: 1, 风险: 1, 进展: 0 });
  assert.equal(c.unSamples.length, 1); // 未对齐需求均匀抽样
  assert.equal(c.unSamples[0].quote, "这个工具有人需要吗？");
  // 承诺全录与风险带：出处必须带真实 seq（V1.2 修复 #undefined）
  assert.equal(c.todos.length, 1);
  assert.equal(c.todos[0].speaker, "张三");
  assert.equal(c.todos[0].deadline, "明天之前");
  assert.equal(c.todos[0].seq, 1);
  assert.equal(c.risks.length, 1);
  assert.equal(c.risks[0].date, "2026-02-01");
  // 合并聊天记录的标题（含 03月09日 日期词）不得产生信号
  assert.equal(c.todos.filter((s) => String(s.quote).includes("合并")).length, 0);
});

test("V1.2：中文钟点量词不再冒充期限", () => {
  // 真实语料事故复现：小确幸日记"状态比昨天好一点"曾刷出"期限：一点"的假承诺
  assert.deepEqual(detectSignals("#1104小确幸 今天状态比昨天好一点"), []);
  // 时段前缀 / 之前后缀 / 数字钟点 三条正路都保留
  assert.equal(detectSignals("我下午三点前把合同发你").filter((s) => s.type === "承诺").length, 1);
  assert.equal(detectSignals("作业我今晚九点前交").filter((s) => s.type === "承诺").length, 1);
  assert.equal(detectSignals("今天上午的作业我11点前提交").filter((s) => s.type === "承诺").length, 1);
});

test("编年史渲染：确定性 + 关键节齐全", () => {
  const { chat, messages } = loadJsonDays(fixtureDir);
  const c = buildChronicle(chat, messages, goals);
  const md1 = renderChronicle(c);
  assert.equal(md1, renderChronicle(c));
  assert.match(md1, /^# 群聊编年史 · 测试群 · 2026-01-01 → 2026-02-01$/m);
  assert.match(md1, /\| 2026-01 \| 5 \|/);
  assert.match(md1, /## 承诺全录（按时间）/);
  assert.match(md1, /- \[ \] 2026-01-01 @张三/);
  assert.match(md1, /## 风险事件带/);
  assert.match(md1, /- 2026-02-01 @王五/);
});

test("编年史 CLI：exit 码与产物落盘", () => {
  const bin = path.join(root, "bin", "chronicle.mjs");
  assert.throws(() => execFileSync("node", [bin], { stdio: "pipe" }), (e) => e.status === 2);
  assert.throws(
    () => execFileSync("node", [bin, path.join(root, "fixtures", "不存在目录")], { stdio: "pipe" }),
    (e) => e.status === 3
  );
  const out = path.join(os.tmpdir(), `chronicle-${process.pid}.md`);
  const stdout = execFileSync("node", [bin, fixtureDir, "--goals", path.join(root, "goals.example.json"), "--out", out]).toString();
  assert.match(stdout, /信号 4：/);
  assert.ok(fs.existsSync(out));
  fs.rmSync(out, { force: true });
});
