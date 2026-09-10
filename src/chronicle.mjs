// V4 语料时光机：全量消息 → 编年史（月度脉搏、KR 对齐总览、承诺全录、风险事件带）。
// 确定性：同输入恒同输出；逐条信号带日期出处，可回放单日复核。
import { detectSignals } from "./signals.mjs";
import { alignKr } from "./replay.mjs";

const EMPTY_TYPES = { 承诺: 0, 公告: 0, 需求: 0, 风险: 0, 进展: 0 };

export function buildChronicle(chatName, messages, goals = { objectives: [] }) {
  const dated = messages.filter((m) => m.date);
  const months = new Map();
  const totals = { messages: dated.length, system: 0, signals: 0, byType: { ...EMPTY_TYPES }, strong: 0 };
  const todos = [];
  const risks = [];
  const needs = [];

  for (const m of dated) {
    const ym = m.date.slice(0, 7);
    let bucket = months.get(ym);
    if (!bucket) months.set(ym, (bucket = { ym, messages: 0, system: 0, signals: 0, byType: { ...EMPTY_TYPES } }));
    if (m.kind === "system") {
      bucket.system += 1;
      totals.system += 1;
      continue;
    }
    bucket.messages += 1;
    for (const s of detectSignals(m.body)) {
      const full = {
        ...s,
        seq: m.seq,
        date: m.date,
        time: m.time,
        speaker: m.speaker,
        reply: m.reply,
        alignedKr: alignKr(s, goals),
      };
      bucket.byType[s.type] += 1;
      bucket.signals += 1;
      totals.byType[s.type] += 1;
      totals.signals += 1;
      if (s.type === "承诺") {
        totals.strong += s.strength === "强" ? 1 : 0;
        todos.push(full);
      } else if (s.type === "风险") risks.push(full);
      else if (s.type === "需求") needs.push(full);
    }
  }

  const monthList = [...months.values()].sort((a, b) => (a.ym < b.ym ? -1 : 1));
  const krStats = new Map();
  let unaligned = 0;
  for (const s of [...todos, ...needs, ...risks]) {
    if (s.alignedKr) krStats.set(s.alignedKr, (krStats.get(s.alignedKr) || 0) + 1);
    else unaligned += 1;
  }

  return {
    chatName,
    start: dated[0]?.date || "",
    end: dated[dated.length - 1]?.date || "",
    totals,
    months: monthList,
    todos,
    risks,
    needs,
    krRows: [...krStats.entries()].sort((a, b) => b[1] - a[1]),
    unaligned,
  };
}

export function renderChronicle(c) {
  const t = c.totals;
  const lines = [
    `# 群聊编年史 · ${c.chatName} · ${c.start} → ${c.end}`,
    "",
    `> 覆盖 ${c.months.length} 个月｜消息 ${t.messages} 条（系统 ${t.system}）｜信号 ${t.signals} 条：承诺 ${t.byType.承诺}（强 ${t.strong}）· 公告 ${t.byType.公告} · 需求 ${t.byType.需求} · 风险 ${t.byType.风险} · 进展 ${t.byType.进展}`,
    "",
    "## 月度脉搏",
    "",
    "| 月份 | 消息 | 系统 | 信号 | 承诺 | 公告 | 需求 | 风险 | 进展 |",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  for (const m of c.months) {
    lines.push(
      `| ${m.ym} | ${m.messages} | ${m.system} | ${m.signals} | ${m.byType.承诺} | ${m.byType.公告} | ${m.byType.需求} | ${m.byType.风险} | ${m.byType.进展} |`
    );
  }
  lines.push("", "## 目标对齐总览", "");
  lines.push(...(c.krRows.length ? c.krRows.map(([kr, n]) => `- ${kr}：${n} 条`) : ["- （ goals.json 未命中任何 KR ）"]));
  lines.push(`- 未对齐：${c.unaligned} 条`, "", "## 承诺全录（按时间）", "");
  lines.push(
    ...(c.todos.length
      ? c.todos.map((s) => {
          const dl = s.deadline ? `｜期限：${s.deadline}` : "";
          const kr = s.alignedKr ? `｜对齐：${s.alignedKr}` : "";
          return `- [ ] ${s.date} @${s.speaker || "（未知）"} —「${s.quote}」${dl}${kr}\n  - 出处：#${s.seq} [${s.time}]`;
        })
      : ["（无）"])
  );
  lines.push("", "## 风险事件带", "");
  lines.push(
    ...(c.risks.length
      ? c.risks.map((s) => `- ${s.date} @${s.speaker || "（未知）"} —「${s.quote}」\n  - 出处：#${s.seq} [${s.time}]`)
      : ["（无）"])
  );
  lines.push(
    "",
    "## 边界",
    "",
    "- 规则引擎（V1.1）抽取：公告不进承诺、回复引用不挖、第一人称门槛；任一天的出处可用 `bin/replay.mjs --date` 回放复核。",
    "- 本文件为确定性输出，同语料同字节。"
  );
  return lines.join("\n") + "\n";
}
