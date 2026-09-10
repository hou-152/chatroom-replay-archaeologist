// 日报渲染 —— 纯函数，无时间戳、无随机数，保证同输入同字节。
const EMPTY = "（无）";

function line(isTodo, s) {
  const bullet = isTodo ? "- [ ]" : "-";
  const dl = s.deadline ? `｜期限：${s.deadline}` : "";
  const kr = s.alignedKr ? `｜对齐：${s.alignedKr}` : "";
  const reply = s.reply ? `（回复 ${s.reply.to}）` : "";
  return `${bullet} @${s.speaker || "（未知）"} —「${s.quote}」${dl}${kr}\n  - 出处：#${s.seq} [${s.time}]${reply}`;
}

function section(title, items, { todo = false } = {}) {
  const body = items.length ? items.map((s) => line(todo, s)).join("\n") : EMPTY;
  return `## ${title}\n\n${body}`;
}

export function renderReport(chatId, day) {
  const { stats } = day;
  const header = [
    `# 群聊回放日报 · ${chatId} · ${day.date}`,
    "",
    `> 消息 ${stats.total} 条：文本 ${stats.text} · 系统 ${stats.system} · 畸形 ${stats.malformed}｜信号 ${stats.signals} 条：承诺 ${stats.byType.承诺}（强 ${stats.strong}/弱 ${stats.weak}）· 公告 ${stats.byType.公告} · 需求 ${stats.byType.需求} · 风险 ${stats.byType.风险} · 进展 ${stats.byType.进展}`,
    "",
  ];
  const body = [
    section("todo（承诺 → 待办）", day.todos, { todo: true }),
    "",
    section("公告（全群截点，不进 todo）", day.announces),
    "",
    section("需求", day.needs),
    "",
    section("风险", day.risks),
    "",
    section("进展", day.progress),
    "",
    "## 证据与边界",
    "",
    "- 解析规则：回复引用不计入信号；URL/XML 剥离后挖掘；挖掘窗口 500 字；同秒同人同文去重；【开头或 @所有人 判为公告，不冒充个人承诺。",
    "- 本报告由确定性规则引擎生成：同一输入恒定同输出，期望值可独立手算复核。",
  ];
  return [...header, ...body].join("\n") + "\n";
}
