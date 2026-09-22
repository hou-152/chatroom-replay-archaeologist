import path from "node:path";
import { createHash } from "node:crypto";
import { detectMessageSignals } from "./replay.mjs";

export const EVIDENCE_SCHEMA = "chatroom-evidence/v1";

export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// 候选保留来源；关键词匹配仅作建议，不创建个人任务或认定完成状态。
export function buildEvidence(source, { sourcePath, start, end, goals } = {}) {
  for (const value of [start, end]) {
    if (value !== undefined && !validDate(value)) throw new Error(`无效日期：${value}`);
  }
  if (start && end && start > end) throw new Error("开始日期不能晚于结束日期");
  const evidence = [];
  const seen = new Set();
  for (const message of source.messages) {
    if (!validDate(message.date) || (start && message.date < start) || (end && message.date > end)) continue;
    const chat = message.source?.chat || source.chat;
    const identity = JSON.stringify([chat, message.date, message.time, message.speaker, message.body, message.reply || null]);
    const messageId = createHash("sha256").update(identity).digest("hex");
    const file = message.source?.file ? path.resolve(sourcePath, message.source.file) : path.resolve(sourcePath);
    const locator = Number.isInteger(message.source?.index)
      ? `messages[${message.source.index}]`
      : `L${message.source?.line || message.seq}`;
    const sourceRef = `${file}#${locator}`;
    for (const signal of detectMessageSignals(message, goals)) {
      const id = `cra:${messageId}:${signal.type}`;
      if (seen.has(id)) continue;
      seen.add(id);
      evidence.push({
        id,
        occurredAt: message.date,
        title: `${signal.type} · ${message.speaker || "未知说话人"}：${signal.quote}`,
        body: message.body,
        evidence: `${chat}｜${message.date} ${message.time}｜${message.speaker}\n${sourceRef}`,
        kind: signal.type,
        quote: signal.quote,
        deadline: signal.deadline || null,
        goalSuggestion: signal.alignedKr || null,
        source: {
          chat, date: message.date, time: message.time, speaker: message.speaker,
          messageId, ref: sourceRef, seq: message.seq,
          originalBody: message.source?.originalBody ?? message.body,
          reply: message.reply || null,
        },
      });
    }
  }
  evidence.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.source.time.localeCompare(b.source.time) || a.id.localeCompare(b.id));
  return {
    schemaVersion: EVIDENCE_SCHEMA,
    chat: source.chat,
    period: { start: start || evidence[0]?.occurredAt || null, end: end || evidence.at(-1)?.occurredAt || null },
    evidence,
  };
}
