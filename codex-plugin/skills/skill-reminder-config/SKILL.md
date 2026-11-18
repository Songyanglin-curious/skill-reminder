---
name: skill-reminder-config
description: 查看或按用户明确指令调整当前工作区的 skill-reminder 提醒开关。适用于开启或关闭 Learn、Docs 或全部提醒，以及询问本工作区的实际配置。
---

# 配置工作区提醒

在当前会话工作目录执行本 Skill 随附的 `../../src/config-cli.mjs`。以本文件的实际绝对路径解析脚本路径。脚本在最近的 Git 仓库根目录读写 `.skill-reminder.json`，无 Git 仓库时用当前目录。

- 查看配置时执行 `node <脚本绝对路径> show`。返回 `config: null` 表示当前工作区尚未配置，轮末静默。
- 用户明确要求修改时执行 `node <脚本绝对路径> set '<JSON 补丁>'`。PowerShell 可用单引号包裹 JSON 参数。只提交用户指定的字段，其余开关沿用已有值。
- 「只开启学习提醒」使用 `{"enabled":true,"skills":{"agent-learn":true,"agent-docs":false}}`。「开启学习提醒」使用 `{"enabled":true,"skills":{"agent-learn":true}}`。「关闭全部提醒」用 `{"enabled":false}`。
- 已有配置格式错误时报告文件路径及错误，等用户明确要求修复。轮末提醒与询问说明本身没有写入授权。报告最终路径和开关。
