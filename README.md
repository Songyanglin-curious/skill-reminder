# skill-reminder

`skill-reminder` 在 DSH 和 Codex 的主 Agent 回合结束时，根据配置合并发送一次短提醒。当前 Agent 判断是否有值得保存且尚未记录的变化，并按需使用已有的 Skill 规则。取消、委派给子 Agent 的回合及本轮后续的停止事件会跳过提醒。

| Skill | 入口 | 设计文档 |
| --- | --- | --- |
| `agent-learn` | [SKILL.md](skills/agent-learn/SKILL.md)，用于专题规划、阶段教学、递归补缺、综合与学习资料维护 | [DESIGN.md](skills/agent-learn/DESIGN.md) |
| `agent-docs` | [SKILL.md](skills/agent-docs/SKILL.md)，用于建立和维护 Docs、调查及更新 Project 当前系统映射 | [DESIGN.md](skills/agent-docs/DESIGN.md) |

DSH 和 Codex 加载相同的 Skill 目录。每个目录的 `SKILL.md` 使用 YAML frontmatter 声明 `name` 与 `description`，目录名与 `name` 保持一致。执行细节按需从 `references/` 读取。每份 `DESIGN.md` 供维护者查阅设计决策。

## 工作区配置

在工作区根目录使用 `.skill-reminder.json`。每次收到轮末事件，Hook 将会话工作目录交给插件。插件定位最近的 Git 仓库根目录，没有 Git 仓库时使用会话工作目录。插件读取和校验配置，再决定是否生成提醒。缺少配置时直接结束。只有设为 `true` 的 Skill 才发送提醒，`enabled: false` 暂停这个工作区的全部提醒。

例如，只开启学习提醒。

```json
{
  "enabled": true,
  "skills": {
    "agent-learn": true,
    "agent-docs": false
  }
}
```

也可以直接对 Agent 说「在当前工作区只开启学习提醒」「关闭这个项目的 Docs 提醒」或「查看此工作区的提醒配置」。DSH 使用 `skill_reminder_config` 工具，Codex 使用插件自带的 `skill-reminder-config` Skill。明确要求修改时才创建或更新配置，修改会保留未指定的设置。旧版的宿主级开关和学习工作区标记无需迁移，按需求在各工作区开启提醒。

## DSH 安装提醒插件

使用 Node.js 22+，宿主接口已用 DSH `0.2.2-rc.1` 验证。从仓库根目录打包并安装，可将 `web` 替换为目标 Profile。

```powershell
npm run pack
dsh plugin --profile web add (Join-Path $PWD 'dist/skill-reminder-0.2.2.tgz')
dsh --profile web --dump-config | Select-String -Pattern '^\s*- id: skill-reminder$' -Context 0,4
```

打包同时生成 `dist/SHA256SUMS.txt`。安装包内含插件和两个业务 Skill，后者的发现位置按下节配置。卸载使用 `dsh plugin --profile web remove skill-reminder`。

## Codex 安装提醒插件

运行 `npm run pack:codex` 生成 `dist/codex/skill-reminder/`。将该目录完整复制到个人插件源，例如 `~/.codex/plugins/local/skill-reminder/`。在现有 `~/.agents/plugins/marketplace.json` 的 `plugins` 数组追加以下条目。

```json
{
  "name": "skill-reminder",
  "source": { "source": "local", "path": "./.codex/plugins/local/skill-reminder" },
  "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
  "category": "Productivity"
}
```

```powershell
codex plugin add skill-reminder@personal-local --json
codex plugin list --marketplace personal-local --json
```

以上命令使用名为 `personal-local` 的市场。安装后新建聊天，到桌面端 **设置 → Hooks** 或 CLI 的 `/hooks` 审阅并信任该插件的 `Stop` Hook，轮末续接随后生效。[Codex Hook 文档](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks)

Codex 版使用 Node.js 22+。插件内置配置 Skill；`agent-learn` 与 `agent-docs` 仍通过下方所述的共享目录发现。

## 手动安装或链接 Skill

将仓库中 `skills/agent-learn/` 与 `skills/agent-docs/` 两个目录完整复制或分别链接到所选 Skill 根目录。安装后应为 `<Skill 根目录>/agent-learn/SKILL.md` 与 `<Skill 根目录>/agent-docs/SKILL.md`。

| 范围 | DSH 默认发现位置 | Codex 发现位置 |
| --- | --- | --- |
| 项目 | 仓库根 `.agents/skills/` 或 `.dsh/skills/` | 仓库根 `.agents/skills/` |
| 用户 | `~/.agents/skills/` 或 `~/.dsh/skills/`，以宿主实际 Home 为准 | `~/.agents/skills/` |

在同一项目或同一用户环境使用两端时，可选择共享的 `.agents/skills/`。DSH 使用 `DSH_HOME` 或 `DSH_AGENTS_HOME` 时，从相应目录下的 `skills/` 发现。DSH 自定义 Profile 需要已有文件系统 Skill 提供方和 Skill 调用工具，标准 Web Profile 已包含。Codex 中可显式调用独立 Skill，也可由宿主按描述选择。详见 [Codex Skill 文档](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills)。

Windows 上从本仓库根目录运行下面的示例，把两端使用的 Skill 链接到目标仓库；先确认目标下没有同名入口。

```powershell
$skillSource = Join-Path $PWD 'skills'
$skillTarget = 'D:/path/to/target-project/.agents/skills'
New-Item -ItemType Directory -Force -Path $skillTarget | Out-Null
foreach ($name in 'agent-learn', 'agent-docs') {
    New-Item -ItemType Junction -Path (Join-Path $skillTarget $name) -Target (Join-Path $skillSource $name)
}
```

## 验证与迁移

- 在相同项目目录新建 DSH 会话，从 Skill 菜单选择，或分别调用 `/agent-learn` 和 `/agent-docs`。Codex 桌面端可在侧边栏 Skills 查看，CLI 可从 `/skills` 或 `$` 选择两项。核对加载的入口属于本项目的两份 Skill。同名旧 Skill 同时出现时，先选定正确路径再测试。
- 用隔离的学习工作区测试建立独立专题计划、接续、递归补缺和综合。对已有 Docs 的临时项目，测试只确认联调事实时能否更新 Project；文档已准确时应无写入。
- 在启用两项提醒的工作区 完成一个主 Agent 回合，查看会话事件或模型输入，确认只有一条来源为 `skill-reminder` 的合并提醒。检查已在上下文中的规则是否被复用。关闭全部提醒后重复一次，应无该来源的消息。
- `npm ci` 后运行 `npm test`，覆盖开关组合、取消、子 Agent、去重及真实 DSH AgentLoop 的离线续接和卸载。真实学习与 Docs 维护效果通过宿主任务观察。

迁移验证通过后，由用户停用旧插件的提醒 Hook，避免旧插件与新插件在同一环境重复提醒。
