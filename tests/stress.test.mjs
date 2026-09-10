// 压力测试：10 万条合成消息（10 天 × 1 万条），时限与计数双门槛。
// 期望值手算：每千条里 k%25==0 出承诺（每天 400 条，全部带"明天之前"→ 强）；
// k%40==0 且 k%25!=0 出风险（每天 250-50=200 条）；其余为闲聊。
import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { parseDump } from "../src/parse.mjs";
import { replayDay } from "../src/replay.mjs";

const LIMIT_MS = 30_000;

function synthDump() {
  const lines = [
    "聊天记录: stress@chatroom",
    "类型: 群聊",
    "时间范围: 2026-08-01 ~ 2026-08-10",
    "导出时间: 2026-08-11 00:00",
    "消息数量: 100000",
    "============================================================",
  ];
  for (let d = 1; d <= 10; d++) {
    const date = `2026-08-${String(d).padStart(2, "0")}`;
    for (let k = 0; k < 10_000; k++) {
      const hh = String(Math.floor(k / 60) % 24).padStart(2, "0");
      const mm = String(k % 60).padStart(2, "0");
      if (k % 25 === 0) {
        lines.push(`[${date} ${hh}:${mm}] 同学${k}: 方案${k}我明天之前给你`);
      } else if (k % 40 === 0) {
        lines.push(`[${date} ${hh}:${mm}] 同学${k}: 服务器挂了第${k}次`);
      } else {
        lines.push(`[${date} ${hh}:${mm}] 同学${k}: 今天天气不错大家随便聊聊`);
      }
    }
  }
  return lines.join("\n");
}

test("压力：10 万条消息在时限内解析+回放，计数与手算一致", () => {
  const dump = synthDump();
  const t0 = performance.now();
  const { messages } = parseDump(dump);
  assert.equal(messages.length, 100_000);

  const days = [];
  for (let d = 1; d <= 10; d++) days.push(`2026-08-${String(d).padStart(2, "0")}`);
  let total承诺 = 0;
  let total风险 = 0;
  for (const date of days) {
    const day = replayDay(messages, date, { objectives: [] });
    assert.equal(day.stats.text, 10_000);
    assert.equal(day.stats.byType.承诺, 400);
    assert.equal(day.stats.byType.风险, 200);
    assert.equal(day.stats.byType.公告, 0);
    assert.equal(day.stats.strong, 400); // 全部带期限 → 强
    total承诺 += day.stats.byType.承诺;
    total风险 += day.stats.byType.风险;
  }
  const elapsed = performance.now() - t0;
  assert.equal(total承诺, 4_000);
  assert.equal(total风险, 2_000);
  assert.ok(elapsed < LIMIT_MS, `解析+回放耗时 ${Math.round(elapsed)}ms，超过 ${LIMIT_MS}ms 上限`);
});
