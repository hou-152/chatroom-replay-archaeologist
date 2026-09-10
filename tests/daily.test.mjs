// V2 群秘书：源自动识别 + 默认最新一天。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bin = path.join(root, "bin", "daily.mjs");

test("V2：txt 源默认最新一天，标题换群秘书口吻", () => {
  const out = path.join(os.tmpdir(), `daily-txt-${process.pid}.md`);
  const stdout = execFileSync("node", [bin, path.join(root, "fixtures", "mini-dump.txt"), "--out", out]).toString();
  assert.match(stdout, /群秘书日报 2026-09-02/); // 不传 --date → 自动最新一天
  const md = fs.readFileSync(out, "utf8");
  assert.match(md, /^# 群秘书日报 · 111@chatroom · 2026-09-02$/m);
  fs.rmSync(out, { force: true });
});

test("V2：JSON 目录源自动识别，缺日期 exit 2", () => {
  const out = path.join(os.tmpdir(), `daily-json-${process.pid}.md`);
  const stdout = execFileSync("node", [bin, path.join(root, "fixtures", "json-days"), "--goals", path.join(root, "goals.qiyun.json"), "--out", out]).toString();
  assert.match(stdout, /群秘书日报 2026-02-01/);
  assert.match(stdout, /公告 1/); // @所有人 作业通知归公告
  fs.rmSync(out, { force: true });
  assert.throws(
    () => execFileSync("node", [bin, path.join(root, "fixtures", "json-days"), "--date", "1999-01-01"], { stdio: "pipe" }),
    (e) => e.status === 2
  );
});

test("V2 常驻记性：--state 首跑出报并记日期，二跑无新一天静默收工", () => {
  const state = path.join(os.tmpdir(), `daily-state-${process.pid}.json`);
  const out = path.join(os.tmpdir(), `daily-state-${process.pid}.md`);
  const args = [bin, path.join(root, "fixtures", "json-days"), "--state", state, "--out", out];
  execFileSync("node", args);
  assert.equal(JSON.parse(fs.readFileSync(state, "utf8")).lastDate, "2026-02-01");
  const second = execFileSync("node", args).toString();
  assert.match(second, /没有比 2026-02-01 更新的一天，收工/);
  fs.rmSync(state, { force: true });
  fs.rmSync(out, { force: true });
});
