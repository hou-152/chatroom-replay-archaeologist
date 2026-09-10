// 按天 JSON 适配层：某课程社群全量语料的按天导出（YYYY-MM-DD.json，534 天 59,006 条）→ 与 parseDump 同形的消息模型。
// 实测 schema：{chat, chat_type, count, is_group, messages:[{content, local_id, sender, time, timestamp, type}]}
//
// 映射规则：
//   type=系统 或 content 含「拍了拍」→ system（不挖）；
//   content 的 [引用] 前缀剥出回复（内嵌 `↳ 谁: 摘录`，摘录里他人的话不挖）；
//   [链接]/[文件]/[图片]/[表情]/[语音]/[视频] 标记剥离后再挖，剥完为空则天然零信号。
import fs from "node:fs";
import path from "node:path";

const REPLY_RE = /\n\s*↳\s*(.+?):\s*([\s\S]*)$/;
const MARKER_RE = /^\[(引用|链接|文件|图片|表情|语音|视频)\]\s*/;
const PAT_RE = /拍了拍/;
// 合并聊天记录 = 转发打包，标题不是本群发言，剥空不挖
const MERGED_RE = /^\[?合并聊天记录\]?/;

export function adaptMessage(raw, seq) {
  const [date, time] = String(raw.time || "").split(" ");
  let body = String(raw.content || "");
  const isSystem = raw.type === "系统" || PAT_RE.test(body);
  const isMerged = MERGED_RE.test(body.trim());
  let speaker = String(raw.sender || "").trim();
  let reply = null;

  if (!isSystem) {
    const replyMatch = body.match(REPLY_RE);
    if (replyMatch) {
      reply = { to: replyMatch[1].trim(), excerpt: replyMatch[2].trim() };
      body = body.slice(0, replyMatch.index);
    }
    body = body.replace(MARKER_RE, "").trim();
    if (isMerged) body = "";
  }

  return {
    seq,
    date: date || "",
    time: time || "",
    speaker,
    kind: isSystem ? "system" : "text",
    body,
    reply,
  };
}

export function loadJsonDays(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  const chatNames = new Set();
  const raws = [];
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    if (j.chat) chatNames.add(j.chat);
    for (const m of j.messages) raws.push(m);
  }
  raws.sort((a, b) => (a.timestamp - b.timestamp) || ((a.local_id || 0) - (b.local_id || 0)));
  const seen = new Set();
  const messages = [];
  let droppedDuplicates = 0;
  for (let i = 0; i < raws.length; i++) {
    const m = adaptMessage(raws[i], i + 1);
    if (m.kind === "text") {
      const key = `${m.date}|${m.time}|${m.speaker}|${m.body}`;
      if (seen.has(key)) {
        droppedDuplicates += 1;
        continue;
      }
      seen.add(key);
    }
    messages.push(m);
  }
  return { chat: [...chatNames].join(" / ") || path.basename(dir), messages, droppedDuplicates };
}
