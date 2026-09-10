// 群转储解析器。
// 逆向重构自 微信聊天记录和思维孵化 agent/scripts/clean_wechat_sample.mjs 的行解析模式，
// 补齐：头部元信息、系统行（拍了拍/链接文件）、↳ 回复引用、多行正文、畸形行容错、精确去重。
//
// 数据契约（微信「聊天记录」txt 导出实测格式）：
//   头部若干 `键: 值` 行 + `====` 分隔线
//   消息行  `[YYYY-MM-DD HH:MM] 说话人: 正文`（说话人可含全角冒号前名字，正文可多行）
//   系统行  `[YYYY-MM-DD HH:MM] [链接/文件] "A" 拍了拍 "B" "…"`
//   引用行  `  ↳ 回复 某人: 摘录`（挂在上一条消息上，不属于新消息）

const HEADER_SPLIT = /^\s*={4,}\s*$/;
const MSG_RE = /^\[(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})\] (.*)$/;
const REPLY_RE = /^\s*↳\s*回复\s+(.+?):\s*([\s\S]*)$/;
const META_KEYS = ["聊天记录", "类型", "时间范围", "导出时间", "消息数量"];

function plausibleDate(y, m, d, hh, mm) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  if (hh > 23 || mm > 59) return false;
  return true;
}

function systemSpeaker(rest) {
  const m = rest.match(/"(.+?)"/);
  return m ? m[1] : "";
}

export function parseDump(text) {
  const lines = text.split(/\r?\n/);
  const meta = {};
  const messages = [];
  let malformed = 0;
  let droppedDuplicates = 0;

  let i = 0;
  let sawSeparator = false;
  for (; i < lines.length; i++) {
    if (HEADER_SPLIT.test(lines[i])) {
      sawSeparator = true;
      i++;
      break;
    }
    const m = lines[i].match(/^(.+?):\s*(.*)$/);
    if (m && META_KEYS.includes(m[1])) meta[m[1]] = m[2].trim();
  }
  if (!sawSeparator) {
    // 没有头部的裸转储：从头按消息解析
    i = 0;
  }

  let cur = null;
  let seq = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const msgMatch = line.match(MSG_RE);
    if (msgMatch) {
      const [, y, mo, d, hh, mm, rest] = msgMatch;
      seq += 1;
      if (!plausibleDate(+y, +mo, +d, +hh, +mm)) {
        cur = { seq, date: "", time: "", speaker: "", kind: "malformed", body: line, reply: null };
        malformed += 1;
        messages.push(cur);
        continue;
      }
      const date = `${y}-${mo}-${d}`;
      const time = `${hh}:${mm}`;
      if (/^\[.+\]/.test(rest)) {
        cur = { seq, date, time, speaker: systemSpeaker(rest), kind: "system", body: rest, reply: null };
      } else {
        const sm = rest.match(/^([^:：]*)[:：]\s*([\s\S]*)$/);
        if (sm) {
          cur = { seq, date, time, speaker: sm[1].trim(), kind: "text", body: sm[2].trim(), reply: null };
        } else {
          cur = { seq, date, time, speaker: "", kind: "malformed", body: rest, reply: null };
          malformed += 1;
        }
      }
      messages.push(cur);
      continue;
    }

    const replyMatch = line.match(REPLY_RE);
    if (replyMatch && cur) {
      cur.reply = { to: replyMatch[1].trim(), excerpt: replyMatch[2].trim() };
      continue;
    }

    if (cur && cur.kind === "text") {
      cur.body += "\n" + line.trim();
      continue;
    }

    seq += 1;
    cur = { seq, date: "", time: "", speaker: "", kind: "malformed", body: line, reply: null };
    malformed += 1;
    messages.push(cur);
  }

  // 精确去重：同日期同时刻同人说同文 → 导出毛刺，丢弃后一条
  const seen = new Set();
  const deduped = [];
  for (const msg of messages) {
    if (msg.kind === "text") {
      const key = `${msg.date}|${msg.time}|${msg.speaker}|${msg.body}`;
      if (seen.has(key)) {
        droppedDuplicates += 1;
        continue;
      }
      seen.add(key);
    }
    deduped.push(msg);
  }

  return { meta, messages: deduped, malformedCount: malformed, droppedDuplicates };
}
