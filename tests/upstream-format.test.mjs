// V5/V6：上游模板真格式（daily-routine 大纲 + 周复盘 RREUA）。期望值独立手算。
// 手算：周窗 2026-01-12→01-18 全 3 天｜信号 7：承诺 1（强·周五前）· 公告 1 · 需求 2 · 风险 2 · 进展 1
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const weekDir = path.join(root, "fixtures", "json-week");

test("V6 周刊：RREUA 结构，机器只灌 Evidence，窗口手算核验", () => {
  const out = path.join(os.tmpdir(), `weekly-${process.pid}.md`);
  const stdout = execFileSync("node", [
    path.join(root, "bin", "weekly.mjs"), weekDir,
    "--end", "2026-01-18", "--goals", path.join(root, "goals.qiyun.json"), "--out", out,
  ]).toString();
  assert.match(stdout, /群周刊 2026-01-12 → 2026-01-18/);
  assert.match(stdout, /信号 7：承诺 1 · 公告 1 · 需求 2 · 风险 2 · 进展 1/);

  const md = fs.readFileSync(out, "utf8");
  // RREUA：判断字段留白给人，Evidence 由机器填
  assert.match(md, /- ## 周复盘/);
  assert.match(md, /Result：（待填——只属于你）/);
  assert.match(md, /Reason：（待填）/);
  assert.match(md, /Update：（待填）/);
  assert.match(md, /Evidence：/);
  // 逐日窗口：三天全在
  assert.match(md, /2026-01-12｜消息 2｜信号 2/);
  assert.match(md, /2026-01-14｜消息 2｜信号 2/);
  assert.match(md, /2026-01-18｜消息 2｜信号 3/); // 报错=风险 + 帮我=需求 双信号
  // 承诺台账带出处与期限
  assert.match(md, /\[ \] 2026-01-12 @张三「方案我周五前给你」｜期限：周五前/);
  assert.match(md, /出处：#1 \[09:00\]/);
  // 留观：非目标区
  assert.match(md, /未对齐 \d+ 条（非目标区，不强塞）/);
  fs.rmSync(out, { force: true });
});

test("V6 周刊：窗口裁切——end=01-16 时窗口 01-10→01-16，排除 01-18", () => {
  const out = path.join(os.tmpdir(), `weekly-cut-${process.pid}.md`);
  execFileSync("node", [
    path.join(root, "bin", "weekly.mjs"), weekDir,
    "--end", "2026-01-16", "--out", out,
  ]);
  const md = fs.readFileSync(out, "utf8");
  assert.match(md, /2026-01-10 → 2026-01-16/); // 窗口 7 天
  assert.match(md, /2026-01-12｜消息 2/);
  assert.match(md, /2026-01-14｜消息 2/);
  assert.ok(!md.includes("2026-01-18"), "窗口外的日子不得入刊");
  fs.rmSync(out, { force: true });
});

test("V5 daily-routine：上游真格式，TODO 进今天需要做、进展进行动记录", () => {
  const out = path.join(os.tmpdir(), `dd-${process.pid}.md`);
  execFileSync("node", [
    path.join(root, "bin", "daily-doing.mjs"), weekDir,
    "--date", "2026-01-12", "--goals", path.join(root, "goals.qiyun.json"), "--out", out,
  ]);
  const md = fs.readFileSync(out, "utf8");
  assert.match(md, /^- ## daily routine$/m);
  assert.match(md, /due:: 2026-01-12/);
  assert.match(md, /parent:: \[\[2026 1月\]\]/);
  assert.match(md, /### 今天需要做/);
  assert.match(md, /- TODO 方案我周五前给你（期限：周五前｜出处 #1 09:00｜张三）/);
  assert.match(md, /### 今日行动记录/);
  assert.match(md, /（当日群聊无可入账的完成事实）/); // 01-12 无进展信号，不硬造
  fs.rmSync(out, { force: true });
});

test("V5 daily-routine：进展入行动记录，绝不混入承诺", () => {
  const out = path.join(os.tmpdir(), `dd2-${process.pid}.md`);
  execFileSync("node", [
    path.join(root, "bin", "daily-doing.mjs"), weekDir,
    "--date", "2026-01-18", "--goals", path.join(root, "goals.qiyun.json"), "--out", out,
  ]);
  const md = fs.readFileSync(out, "utf8");
  assert.match(md, /### 今日行动记录/);
  assert.match(md, /- 上周方案搞定了（出处 #5 09:00｜张三）/);
  assert.match(md, /- TODO（当日群聊无承诺候选/); // 01-18 无承诺 → 不硬造
  // 确认门：进展与承诺分区，行动记录小节内不得出现 TODO
  const actionSection = md.split(/### 今日行动记录/)[1].split(/### 明天要做/)[0];
  assert.ok(!actionSection.includes("TODO"), "行动记录小节不得含 TODO");
  fs.rmSync(out, { force: true });
});
