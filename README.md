# 群聊回放考古官

微信群聊导出 → 带出处的 todo/OKR 信号。五个视图共享一个确定性规则内核：**V1 单日回放日报 · V4 全量编年史 · V2 每日群秘书（可常驻推飞书）· V5 灌 Daily Doing · V6 周复盘周刊**。把某一天（或全部历史）群里发生的**承诺 / 公告 / 需求 / 风险 / 进展**挖出来，每条带消息出处，todo 直接可勾。

内核是**确定性规则引擎**：同一输入恒定同输出，所有测试期望值独立手算，可 A/B 复核。零第三方依赖，node ≥ 18。

[npm 包](https://www.npmjs.com/package/chatroom-replay-archaeologist) · [GitHub 仓库](https://github.com/hou-152/chatroom-replay-archaeologist)

## 用法

### npm 安装（推荐）

```bash
npm install chatroom-replay-archaeologist        # 全局装亦可：npm i -g chatroom-replay-archaeologist
npx chatroom-replay-archaeologist replay 群导出.txt --date 2026-08-30 --goals goals.example.json
npx chatroom-replay-archaeologist chronicle ./json-days --goals goals.qiyun.json
npx chatroom-replay-archaeologist weekly ./json-days --feishu <folder-token>
```

六个子命令：`replay`（单日回放）· `daily`（群秘书日报，默认最新一天，`--state` 可常驻）· `daily-doing`（daily-routine 大纲稿）· `weekly`（周复盘 RREUA 周刊）· `chronicle`（全量编年史）· `clean`（语料清洗正本）。

### 仓库内直接跑（开发态）

```bash
node bin/replay.mjs <群转储.txt> --list-days              # 看转储里有哪些天
node bin/replay.mjs <群转储.txt> --date 2026-08-30 \
  --goals goals.example.json                              # 回放某天 → reports/*.md
node bin/chronicle.mjs <按天JSON目录> --goals goals.example.json   # V4 全量编年史
node bin/daily.mjs <txt转储 或 JSON目录> --goals goals.qiyun.json  # V2 群秘书日报（默认最新一天）
#   加 --feishu <folder-token> 直接推飞书（lark-cli 通路，H1 即标题）
node --test                                               # 测试电池
```

V2 常驻化：**已装 launchd**（本机 `~/Library/LaunchAgents/ai.chatroom-secretary.daily.plist`，工作日 21:00 触发，`--state data/secretary-state.json` 记性——没有新的一天就静默收工，日志在 `data/secretary.log`）。数据源接监管系统时，改 plist 里的导出目录路径再 `launchctl bootstrap` 即可。卸载：

```bash
launchctl bootout gui/$(id -u)/ai.chatroom-secretary.daily
rm ~/Library/LaunchAgents/ai.chatroom-secretary.daily.plist
```

cron 版等价配方（二选一）：

```cron
0 21 * * 1-5 cd /path/to/群聊回放考古官 && node bin/daily.mjs /path/to/导出目录 --goals goals.qiyun.json --state data/secretary-state.json
```

约定：**只吃导出物，不碰生产库**——监管系统/`wx export` 把当天的会话导出丢进目录，V2 就地出日报。

### V5 灌 Daily Doing + V6 群周刊（上游模板真格式）

```bash
node bin/daily-doing.mjs <源> --goals goals.qiyun.json   # V5：daily-routine 大纲稿 → outbox/（粘贴即确认）
node bin/weekly.mjs <源> --end 2026-08-30 --goals goals.qiyun.json --feishu <folder-token>  # V6 群周刊
```

溯源：两命令的格式分别对齐上游 `Happy-logos/okr-doing-agent` v1.0.0 的 `templates/logseq/templates/daily-routine.md`（今天需要做 TODO / 今日行动记录 / 明天要做）与 `templates/logseq/templates/week-review.md`（周复盘 RREUA）。**V5 粘贴动作=人工确认门，本仓绝不写 Logseq 图谱；V6 只灌 Evidence 事实层，Result/Reason/Update/Action 留白给人**——记录与裁决分离，上游模板与本项目戒律同构。

输入两种：微信「聊天记录」导出 txt（`[YYYY-MM-DD HH:MM] 说话人: 正文` + `↳ 回复` + 系统行），或按天 JSON 目录（一个 19 个月课程社群的全量导出：每天一个 `YYYY-MM-DD.json`，`{messages:[{content,sender,time,type}]}`，适配层见 `src/parse-days.mjs`）。

## 设计决定（都踩过真实数据的坑）

- **回复引用里的他人发言不挖**（`↳` 摘录只作上下文）——防止把别人说的话记到回复者头上。
- **URL / XML 剥离后再挖**；**挖掘窗口 500 字**——巨型消息不得绑架日报。
- **【开头 / @所有人 = 公告**，单独归档不进 todo——课程群的截点播报最容易冒充个人承诺。
- **承诺必须带第一人称**（我/咱/本人，V1.1）——群体催办、无主语的截点播报不冒充个人 todo；无主语口语承诺（"明天之前搞定"）会漏，认了。
- **中文钟点期限必须带时段前缀或之前/以内后缀**（V1.2）——"状态比昨天好一点"的"一点"曾在真实语料刷出上百条假承诺。
- **合并聊天记录剥空不挖**（V1.2）——转发打包的标题带日期词，不是本群发言。
- **未对齐 = 非目标区，不强行入账**（V1.2）——接龙/助力/寒暄占未对齐的大头，占比即群的「目标密度」；编年史自带未对齐构成与抽样，不追求归零。
- **否决词**（不了 / 不去 / 没空…）压承诺误报；宁可漏报，不可瞎报。
- **同秒同人同文去重**；畸形行计数跳过、不进任何一天（无合法日期）。
- **KR 对齐**走 `goals.json` 关键词命中，没配就全部未对齐——目标载体以后接 okr-doing-agent / 飞书都行。

## 血统（逆向重构自）

| 旧代码（微信聊天记录和思维孵化 agent/scripts/） | 本项目继承 |
| --- | --- |
| `clean_wechat_sample.mjs` | `[time] speaker: body` 行解析正则 |
| `select_high_value_judgements.mjs` | 关键词聚类思想 → 四类信号词表 |
| `evaluate_xiaowangshao_challenge.mjs` | 人工门控/期望值核对思想 → 测试电池 |

## 数据契约与清洗

输入二选一（`replay`/`daily`/`chronicle`/`clean` 全部自动识别）：

- **txt 转储**：微信「聊天记录」导出格式（头部 + `[时间] 说话人: 正文` + `↳ 回复` + 系统行）
- **按天 JSON 目录**：`YYYY-MM-DD.json`，`{messages:[{content,sender,time,type}]}`（一个 19 个月课程社群的全量导出即此格式：534 天、59,006 条消息，适配层 `src/parse-days.mjs`）

`bin/clean.mjs` 把任意一种洗成结构化 JSONL 正本：引用拆成 `reply_to`/`reply_excerpt`、系统行归类、`[图片]/[语音]/[合并聊天记录]` 等标记剥空、同秒同人同文去重、空正文文本行丢弃（计数留痕）：

```json
{"seq":2516,"date":"2025-02-02","time":"23:55","speaker":"…","kind":"text","body":"…","reply_to":null,"reply_excerpt":null}
```

大群实测：59,006 → **51,100 条正本**（去重 896、空正文 7,010）。清洗产物 `data/` 不入库。

## 测试电池（node --test，33 项）

- **冒烟**：CLI 端到端、exit 码、报告结构、跨日隔离。
- **稳定性**：两次运行 SHA-256 字节一致；重复行去重；乱序后单日信号多重集不变。
- **压力**：10 万条合成消息，解析+回放 ~200ms（上限 30s），计数与手算一致（承诺 4000/风险 2000）。
- **对抗**：提示词注入当纯数据（金丝雀文件完好、注入文本不进报告）、引用陷阱、截断语义、畸形行、空天、XML 剥离、公告不冒充承诺。

## 已知边界（V1.2 调优候选）

- 第一人称门槛的残余误报面："小窗我""发给我"里的我是收件人不是承诺人——需要角色指向判断。
- 规则引擎只认词表；语义级承诺（"这事包我身上"之外的说法）接 LLM 抽取器（`src/signals.mjs` 是唯一接缝）。
- 声音消息、图片不在 V1 范围（转储里只有文本痕迹）。
