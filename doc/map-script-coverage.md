# 地图脚本：2.0 接入与旧版覆盖核查

核查日期：2026-11-07。结论来自源码与下述回归；“可表达”不等于旧地图已经逐块迁移。

## 核查依据

- 旧版官方仓库：`wxyhly/deductrium`，核查提交 `1ba23dd9cc94e0afc7dcf5322f9123b0d95410a3`。
- 旧版入口：`src/game.ts:101` 起的门判断、`:225` 起的奖励处理；`src/tt/gui.ts:798` 的 `queryType`、`:835` 的 `queryDefPuzzle`、`:1076` 起的类型解锁和禁用；`src/fs/cmd.ts:724` 的错误公理注入。
- 当前入口：`src/hy/script.ts` 的解析、静态校验和 `planMapScript`；`src/hy/script-engine.ts` 的真实 HS/TT 适配；`src/game.ts` 的 prepare/commit/restore 和既有门路由。

## 2.0 已接入

| 功能 | 当前实现与已核实边界 |
| --- | --- |
| 事务式地图状态 | DSL 在副本上计算钥匙、flag、计数、余额、奖励、地块和引擎声明。Game prepare 调用 `engine.validateState(plan.state)`，然后才处理 attempt effects、阻断状态和确认；commit 应用最终状态。 |
| 支付、确认、一次性与重复事件 | `give/take`、`confirm`、`event`、`reward` 等由 planner 生成计划，Game 提交。阻断或取消确认不提交余额和奖励；`remember` 等明确属于尝试效果。 |
| 门、地块、奖励与界面状态 | 开关门、拆门、地块类型和文字、奖励清除/重置、层、成就、知识、语言均有 Game 消费分支。具体 reward 的能力仍以 2.0 已实现的奖励处理为准。 |
| 序数和统计条件 | 进度指标、序数比较/设置/推进/生成均使用现有序数算法；Game 恢复持久状态。不是在脚本中另造序数实现。 |
| HS 命题门与规则门 | `require proof/rule` 调用真实 `checkPropGate/checkRuleGate`。查询使用 staged 规则、重放后的 sheet 和 staged 禁用公理策略，不借用 live 中旧证明绕过禁用或删除。 |
| HS 名称查询 | `rule-present` 与有限 `rule-name` glob 检查真实规则及其公理依赖策略。支持 `a*x` 和兼容形式 `^a.*x$`，不是任意正则执行。 |
| HS 内置规则解锁 | 只接受 2.0 `initialCreativeRules` 中的真实条目；闭包重放已有证明，保留系统别名。派生规则缺少未获得的前提公理时报错，不暗中赠送公理。同一计划中的既有奖励先在 scratch 中展开前提。 |
| 地图公理添加、移除及存档 | 校验完整规则、原子名称和断言；禁止覆盖用户规则。对象身份记录地图所有权，`mapRules` 保存/恢复该记录；移除只处理地图拥有的实例。动态 a/d 前缀公理保存完整正文。 |
| TT 类型门 | `require type` 和既有 `[t]` 门都接同一 adapter。检查真实表项的闭合 inhabitant；拒绝输入空洞、未解决或 schematic metas，以及通过用户定义间接引用这些项的情况。不能用 `assertType('_', False)` 的宽松成功作为通关依据。 |
| TT 类型解锁、禁用和启用 | 接受现有 SysRule 分组或真实符号，展开依赖；从新 Core 重建系统并重放用户表项，移除禁用项及依赖项，避免旧 Core 常量或旧定义绕过禁用。保留 live 表和视图对象。 |
| 目标提示 | HS 复用现有目标展示。`TTGui.rememberMapScriptGoal(text)` 用 `TypeParser`/`SyntaxViewer` 在真实 T-layer 展示最近一个类型目标，复用查看器交互；只读、不入存档，`deserialize` 清除。Game attemptEffects 已调用该方法。 |
| 惰性与整态校验 | 创建 adapter 不访问真实层 API；空 engine 的 validateState/restore 可用于 Game 的空 stubs。恢复先构造 HS、TT 两份 snapshot，再写回；名称冲突、缺前提公理、未知 TT 声明在写入前失败。 |

### `mp` 实际读档失败

实际 Chrome 存档包含 `mp:ax:.`，重载后报 `内置规则名称已被占用：mp`。问题在 `src/hs/main.ts:37`：初始化公理正文索引原先只收集 a/d 前缀，遗漏 `mp`，导致占位符不能恢复原始规则。

修复为收集所有真实 `ax:` 定义。保留严格 schema 冲突检查，没有把不同正文的用户 `mp` 当作系统规则放行。回归使用实际存档形状，包含 `.i`、`a3` 和禁用 Bool 的脚本状态，执行 serialize/deserialize、validateState 和 restore；同时保留自定义 `mp:ax:⊢P` 应被拒绝的断言。

## 旧版行为的覆盖边界

| 旧版行为与源码 | 当前结论 |
| --- | --- |
| `#p`、`#d`，旧 `src/game.ts:138`、`:145` | 已有 HS 查询对应能力；旧字符串需要转换为 2.0 支持的语法。不能仅凭文本相似推定两个内核接受完全相同的公式。 |
| `#t`，旧 `src/game.ts:150` / `queryType:798` | 已接入类型门；现实现要求闭合真实 inhabitant，拒绝未解决 metas。 |
| `preord`、`I1I2I3`、`mct2mdt`，旧 `src/game.ts:124`、`:127`、`:130` | 当前 Game 保留对应条件；DSL 也可组合统计、奖励及支付条件。 |
| JJZ 救济、付费确认、`#imm` 和拆门，旧 `src/game.ts:162`、`:169`、`:192`、`:203`、`:233` | 当前 Game 保留救济、余额确认和拆门相关分支；脚本可查询规则名、组合支付和地块操作。具体旧地图的流程仍需逐块核对，不能由 adapter 推定已迁移。 |
| 否定/一阶/工具包等 HS 奖励，旧 `src/game.ts:254`、`:330`、`:340`、`:344`、`:355` | 2.0 已有 `src/hs/rewards.ts` 的奖励映射可复用；adapter 只解锁当前存在的内置规则。旧版全部宏、元规则不因此自动获得实现。 |
| `apn5x`、`asepx`，旧 `src/fs/cmd.ts:724`，以及旧奖励注入/删除 | 有动态地图公理和移除机制。旧版含 `#rp` 等形式的原始 schema 及其谜题流程并未在本次自动转换或宣称等价；应逐项核实 2.0 语法和依赖。 |
| `disableua/fnext/I` 等，旧 `src/game.ts:600` 起 | 已有对现存 TT 系统符号/分组的禁用与启用机制。它不会创造当前系统没有的常量或旧公理计算规则。 |

## 明确未迁移

1. **旧 TT 战术与证明编辑工作流。** 旧 `src/game.ts:490` 起大量 `ttactic*`、`tthyp` 等奖励分支对应旧 GUI 的战术能力；本次没有移植这些战术，不把 `unlock reward` 或类型解锁当作战术实现。
2. **17 个定义谜题 checker。** 旧 `src/tt/gui.ts:835` 的 `queryDefPuzzle` 按名称执行特定计算/行为验证：`code_nat`、`what`、`ftr`、`fillList`、`joinList`、`lenList`、`sumList`、`mapList`、`invList`、`firstList`、`lastList`、`del_0`、`count_0`、`ftreq`、`Fin`、`factorial2`、`Combin`。它们不是普通类型 inhabitance 查询；旧 `src/game.ts:158` 的 `#t:=` 路径没有接到新 `type` 查询。当前 maploader 识别 `[td]` 标签也不表示 checker 已存在。旧源码的 `Aleph` 分支是注释，不计入 17 个。
3. **自定义形式扩展。** 旧形式系统的任意元规则、元宏、语法/替换扩展、旧系统专属规则生成，以及缺失的数学定义/公理/计算规则没有迁移。`unlock rule` 只面向当前静态内置库，`add axiom` 只添加当前 HS 能解析的公理；它们不构成通用内核扩展接口。
4. **旧地图内容的全量迁移与逐题等价性。** 本报告确认现有 2.0 功能接入和明确缺口，不表示每个旧 tile、旧存档或旧题目已经转换并验收。

## 验证记录

- `test/test-map-script.mjs`、`test/test-map-script-branches.mjs`、`test/test-map-script-legacy.mjs`：解析、分支、数值表达式、预检、尝试效果、引擎和序数计划。
- `test/test-map-script-engine.mjs`：真实 HS/TT 查询、规则依赖、公理所有权、闭合项检查、禁用与重建、实际存档形状、两引擎失败不写入。
- `test/test-game-currencies.mjs`：实际 Game 回调的扣款回滚、重复兑换、奖励重置与再领取、keep/consume 切换及读档不重发。
- `test/browser/map-script-legacy.mjs`：Chrome 1440×1000、390×844，验证真实引擎、失败回滚、目标展示、确认取消、序数、语言、奖励生命周期和保存重载。
- `test/browser/map-world.mjs`、`test/browser/map-editor.mjs`：同两种视口验证主世界银行、mod 发布和隔离、属性面板、脚本目录及错误定位。

这些检查不涵盖上节明确未迁移的 TT 战术、定义谜题 checker 或全部旧数学内容。
