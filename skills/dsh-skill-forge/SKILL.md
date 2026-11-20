---
name: dsh-skill-forge
description: 创建/改造 DSH 技能包（skill / 模式）。给出目录结构、SKILL.md frontmatter 硬规范、references/scripts 组织方式与自检命令；用于新增技能包、把一段工作流固化成可复用模式。Use when creating a new DSH skill package or converting a workflow into a reusable mode.
tags: [dsh, skill, mode, 技能包, 工作流]
---

# DSH 技能包（模式）生成器

DSH 的「模式」= 技能包（skill package）。每个技能是 `skills/` 下的一个目录，入口为 `SKILL.md`，加载后出现在会话的 available_skills 列表，可由 `skill` 工具按名调用。

## 一、目录结构

```
/opt/chana-home/skills/<skill-name>/
├── SKILL.md          # 必需：frontmatter + 正文，技能清单与主说明
├── references/       # 可选：长文参考资料（被正文按需引用，不自动加载）
├── scripts/          # 可选：可执行脚本，正文里给出绝对路径调用
└── assets/           # 可选：模板、字典、样例文件
```

- 技能名 = 目录名，必须小写、短横线分隔、语义明确（如 `pentest-sop`、`code-audit`）。
- 目录名与 frontmatter `name` 保持一致，避免调用时匹配不上。

## 二、SKILL.md frontmatter 硬规范

现有 141 个技能实测字段（只有这些可靠）：

```yaml
---
name: <与目录名相同的小写短横线标识>
description: <一句话说清「做什么 + 什么时候用」，建议含英文 Use when ... 触发语>
tags: [可选, 分类标签]   # 仅约 14% 技能使用
---
```

- `name` 与 `description` 为必需；缺失会导致技能列表里不可检索。
- `description` 决定模型何时自动选用该技能：写「能力 + 触发场景」，不要写营销话术。
- 正文用 `##` 二级标题分节：DSH 按 `##` 标题切分章节做渐进式加载，标题要短且语义化。

## 三、正文写法建议

1. 开头一节说「这个模式解决什么问题、适用边界」，避免长铺垫。
2. 中间给**可执行步骤**：命令、路径、判断条件，用代码块包住。
3. 易错点单列一节（坑位），写清「现象 → 原因 → 正确做法」。
4. 长参考资料放 `references/`，正文只留索引与调用方式；脚本放 `scripts/` 并注明运行入口。

## 四、创建与自检

```bash
# 1. 建目录
mkdir -p /opt/chana-home/skills/<skill-name>/{references,scripts}

# 2. 写 SKILL.md（frontmatter + 正文）

# 3. 自检：frontmatter 字段齐全、name 与目录名一致
head -6 /opt/chana-home/skills/<skill-name>/SKILL.md

# 4. 语法校验（YAML frontmatter 是否可解析）
python3 - <<'PY'
import re, yaml, pathlib
p = pathlib.Path('/opt/chana-home/skills/<skill-name>/SKILL.md')
t = p.read_text(encoding='utf-8')
m = re.match(r'^---\n(.*?)\n---', t, re.S)
fm = yaml.safe_load(m.group(1))
assert fm.get('name') and fm.get('description'), 'name/description 缺失'
assert fm['name'] == p.parent.name, 'name 与目录名不一致'
print('OK', fm['name'])
PY

# 5. 全量列举确认（141+1 个）
cd /opt/chana-home/skills && find . -maxdepth 2 -name SKILL.md | wc -l
```

## 五、生效方式

技能目录在会话启动时扫描进 available_skills；新建或修改后若当前会话列表未刷新，重载/新开会话即生效（客户端插件有 HMR 时仅客户端代码热更，技能扫描以启动为准）。

## 六、坑位

- 目录名带大写或空格 → 技能名不匹配，`skill` 工具调用失败。
- `description` 只写「XX 技能」不写触发场景 → 模型不会在正确时机自动选用。
- 正文堆砌 500 行不分节 → 渐进式加载失效，按 `##` 切块的效果丧失。
- 把可执行逻辑只写在正文让模型每轮重写 → 固化到 `scripts/` 更稳定。
