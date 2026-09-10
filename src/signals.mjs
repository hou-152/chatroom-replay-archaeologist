// 信号抽取内核 —— 确定性规则。
// 逆向重构自 微信聊天记录和思维孵化 agent/scripts/select_high_value_judgements.mjs 的关键词聚类思想，
// 改造为四类信号（承诺/需求/风险/进展）+ 期限识别 + 否决词。
//
// 设计取向：宁可漏报，不可瞎报。
//   - 同一消息同类型至多一条；
//   - 回复引用里的他人发言不挖（调用方只喂本消息正文）；
//   - URL 与 XML 剥离后再挖，避免链接文本干扰；
//   - 挖掘文本截断到 500 字（超大单条只看开头，防止一个巨型消息绑架日报）；
//   - 否决词命中则不出「承诺」。

export const MINE_MAX_CHARS = 500;
export const QUOTE_MAX_CHARS = 60;

const NEGATION_RE = /(不了|不去|不来|不做|不搞|没法|没空|不能|先不|别找我|别催)/;
const DEADLINE_RE = /((今天|明天|后天|今晚|明早|本周|下周|月底|月初|周[一二三四五六日天]|星期[一二三四五六日天])\s*(之?前|以内))|(((今天|明天|后天|今晚|明早)\s*)?(\d{1,2}|[零一二两三四五六七八九十]{1,3})\s*[点号日](之?前|以内)?)/;
const VOLITION_RE = /(我来|我去(搞|弄|做|写|办|盯)|我负责|交给我|包在我|我准备|我打算|我回头|回头我|我来弄|我来写|我来做|我来处理|安排上|我给你|给你弄)/;
const DELIVER_RE = /(发(你|我|给|到|个)|整理|写完|做完|搞完|弄好|搞定|回复你|联系你|约(时间|个|一下)|交付|交(?!流)|合同|方案|报价|截图|清单|海报|报告|demo)/i;
const NEED_RE = /(想要|需要|求个?|有没有人?懂|有没有|谁能|怎么弄|怎么办|怎么做|怎么搞|请教|推荐|帮忙看|帮我)/;
const RISK_RE = /(出问题|出事了|翻车|挂了|崩了|宕机|故障|报错|延期|跳票|违约|投诉|退款|告警|失效|被骗|跑路|被封)/;
const PROGRESS_RE = /(完成了|搞定了|搞好了|弄好了|上线了|发布了|交付了|报喜|通过了|拿下了|签了|成交了|到账了|恢复了|修好了|审核通过)/;

// V1.1 第一人称门槛：承诺必须是我（我/咱/本人）要做的——
// 群体催办（"大家都别等到最后"）、播报截点里全是交付词和期限，但没有"我"。
// 代价：无主语的口语承诺（"明天之前搞定"）会漏——宁可漏报，不可瞎报。
const FIRST_PERSON_RE = /(我|咱|本人)/;

export function stripNoise(body) {
  return body
    .replace(/<\?xml[\s\S]*?(?:<\/msg>|$)/gi, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 公告识别：【开头（课程日报名风格）或 @所有人 —— 是面向全群的指令/播报，
// 截点和交付词都是给别人看的，不得冒充说话人自己的承诺。
export function isAnnouncement(mined) {
  return /^\s*【/.test(mined) || mined.includes("@所有人");
}

// @returns [{type:'承诺'|'公告'|'需求'|'风险'|'进展', quote, deadline?, strength?}]
export function detectSignals(rawBody) {
  const mined = stripNoise(String(rawBody)).slice(0, MINE_MAX_CHARS);
  if (!mined) return [];

  const signals = [];
  const push = (type, extra = {}) =>
    signals.push({ type, quote: mined.slice(0, QUOTE_MAX_CHARS), ...extra });

  if (isAnnouncement(mined)) {
    push("公告");
    return signals; // 公告只留档，不参与承诺/需求挖掘
  }

  if (RISK_RE.test(mined)) push("风险");
  if (PROGRESS_RE.test(mined)) push("进展");

  const negated = NEGATION_RE.test(mined);
  const dl = mined.match(DEADLINE_RE);
  const deadline = dl ? dl[0] : null;
  const volitional = VOLITION_RE.test(mined);
  const deliver = DELIVER_RE.test(mined);
  if (!negated && FIRST_PERSON_RE.test(mined) && ((volitional && (deadline || deliver)) || (deadline && deliver))) {
    push("承诺", { deadline, strength: deadline ? "强" : "弱" });
  }

  if (NEED_RE.test(mined)) push("需求");
  return signals;
}
