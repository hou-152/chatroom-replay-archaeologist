// 回放引擎：按日切片 → 信号抽取 → KR 对齐。
import { detectSignals } from "./signals.mjs";

export function dayKeys(messages) {
  return [...new Set(messages.filter((m) => m.date).map((m) => m.date))].sort();
}

export function alignKr(signal, goals) {
  for (const obj of (goals && goals.objectives) || []) {
    for (const kr of obj.krs || []) {
      for (const kw of kr.keywords || []) {
        if (kw && signal.quote.includes(kw)) return `${obj.o} › ${kr.kr}`;
      }
    }
  }
  return null;
}

// @returns 单日回放结果（确定性：同输入恒同输出）
export function replayDay(messages, date, goals = { objectives: [] }) {
  const dayText = [];
  let systemCount = 0;
  let malformedCount = 0;
  for (const m of messages) {
    if (m.date !== date) continue;
    if (m.kind === "text") dayText.push(m);
    else if (m.kind === "system") systemCount += 1;
    else malformedCount += 1;
  }

  const signals = [];
  for (const msg of dayText) {
    for (const s of detectSignals(msg.body)) {
      signals.push({
        ...s,
        seq: msg.seq,
        date: msg.date,
        time: msg.time,
        speaker: msg.speaker,
        reply: msg.reply,
        alignedKr: alignKr(s, goals),
      });
    }
  }
  signals.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.seq - b.seq));

  const todos = signals.filter((s) => s.type === "承诺");
  const byType = { 承诺: todos.length, 公告: 0, 需求: 0, 风险: 0, 进展: 0 };
  for (const s of signals) if (s.type !== "承诺") byType[s.type] += 1;

  return {
    date,
    stats: {
      total: dayText.length + systemCount + malformedCount,
      text: dayText.length,
      system: systemCount,
      malformed: malformedCount,
      signals: signals.length,
      byType,
      strong: todos.filter((s) => s.strength === "强").length,
      weak: todos.filter((s) => s.strength === "弱").length,
    },
    todos,
    announces: signals.filter((s) => s.type === "公告"),
    needs: signals.filter((s) => s.type === "需求"),
    risks: signals.filter((s) => s.type === "风险"),
    progress: signals.filter((s) => s.type === "进展"),
  };
}
