# 通用性实测：跨 Agent / 跨 harness（2026-09-12）

> 用 `docs/TRY.md` 那张试用卡，在四个环境下各跑一遍，逐条核对验收。
> 结论：**包本身零冲突、可跨 harness 移植；所有失败都发生在环境层，不在代码层。**
> 全部用合成语料；未使用任何真实聊天记录。

## 结果

| 臂 | harness | 模型 / 额度源 | 结果 | 代价 |
|---|---|---|---|---|
| 基准 | 本机 shell | 无（纯 CLI） | **4/4 通过** | 秒级 |
| A | OpenClaw 嵌入式 agent（`agent exec`） | DeepSeek V4 Flash | **5/5 通过** | 48 秒，14 次工具调用，0 失败 |
| B | ZCode CLI 无头（`--prompt --mode build`） | Antigravity ↔ 本地反代 | **未完成**（harness 权限层，代码一行未执行） | 8 次请求、166k tokens、0 产物 |
| C | Codex CLI（`exec --ignore-user-config` + 一次性 `-c` 覆盖 provider） | Antigravity ↔ 同一条反代 | **4/4 通过** | 18 条命令，177k input / 1.97k output |

B 与 C 用的是**同一个额度源**，唯一差别是 harness —— 所以 B 的失败可以直接归因到 harness，而不是模型或额度。

## 这个包被验证了什么

- **零第三方依赖**：`npm install` 只装它自己。
- **无网络、无模型调用**：全库检索 `openai|anthropic|deepseek|gemini|fetch(|http`，只命中"剥离 URL 的正则"和文档链接。模型选择不影响本包的正确性。
- **只用标准内置模块**：`node:path` / `node:fs` / `node:url`；未使用 `structuredClone`、`Object.groupBy`、`toSorted` 等较新 API，与 `engines: node>=18` 相符。
- **确定性可复现**：同一输入连续两次运行，报告 SHA-256 字节一致；两个不同 node 小版本（v24.14 / v24.15）输出逐字一致。
- **跨 harness 同构**：基准 / A / C 三条臂生成的报告内容一致。

## 环境前提（写进试用卡会更好）

`docs/TRY.md` 的卡默认执行者"能跑命令"。对**无头** harness 来说这不成立：

- 某些 harness 在无头模式下**没有权限应答客户端**，`Bash` 等工具会被逐条拒绝（实测报错：`No permission client configured for Bash`），执行者会在权限层空转而不报错。
- 建议在卡顶加一行：**"若你的运行环境需要工具授权，请先授权 Bash / Write（或在无人值守模式下显式放行）"**。

## 窄口径工具链适配（本次实测）

| 场景 | 可行 | 不可行 |
|---|---|---|
| 需要执行命令的多步任务 | Codex CLI `exec`（`-s workspace-write` + 网络）、OpenClaw `agent exec` | ZCode CLI `--prompt --mode build`（权限层挡死；且 `--allowed-tools` / `--settings` / `--max-turns` 三个 `--help` 里列出的选项被解析器拒收，无法在 CLI 层开白名单） |
| 只读/文本推理 | 任意 harness | — |

## 未覆盖

- node 18 / 20 实机兼容性（本机只有 24.x）—— UNKNOWN。
- 六个子命令只实测 `replay`；`daily` / `chronicle` / `weekly` / `daily-doing` / `clean` 未跨环境跑 —— UNKNOWN。
- 真实语料未使用，也建议不要发给任何第三方环境。

## 复现

```bash
# 基准
mkdir -p /tmp/cra && cd /tmp/cra
npm install chatroom-replay-archaeologist
npx chatroom-replay-archaeologist replay sample.txt

# A：OpenClaw
openclaw --profile <profile> agent exec --model <provider/model> \
  --cwd /tmp/cra-a --json --message-file TRY-PROMPT.md

# B：ZCode 无头（当前会卡在权限层）
node /Applications/ZCode.app/Contents/Resources/glm/zcode.cjs \
  --cwd /tmp/cra-b --mode build --json --prompt "$(cat TRY-PROMPT.md)"

# C：Codex CLI（不动用户配置）
codex exec --ignore-user-config \
  -c 'model_providers.<id>={name="<id>",base_url="<OpenAI-compatible base>",env_key="<ENV>",wire_api="responses"}' \
  -c model_provider="<id>" -c sandbox_workspace_write.network_access=true \
  -m <model> -s workspace-write --skip-git-repo-check --json "$(cat TRY-PROMPT.md)"
```
