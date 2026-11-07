# 地图、模块与发布世界

编辑器入口为 `/tools/map-editor/index.html`，需要 HTTP 服务。画布直接使用生存游戏的 HWorld、LocalDraw 和 appearance；项目、砖块、模块按任务展开，发布、范围和迁移放在高级设置中。

## 当前可用

- 地图编辑、模块 JSON 导入导出、六向旋转与挂载；位置变换直接使用游戏的 `{6,4}` 双曲铺砌。
- 模块实例隔离名称、脚本钥匙、标记和计数器，挂载前检查实际砖块位置冲突。
- 独立空图或现有地图编辑，使用正式游戏进行隔离试玩。
- 试玩存档与正式生存存档分开；当前按地图内容区分试玩存档，地图内容改变后开始新的试玩进度。

另已接通发布世界、半平面范围、模块更新、多币种银行和存档迁移。未应用的设置阻止导出；应用一个设置组会保留其他组未确认的内容。项目和模块 JSON 格式仍属于开发格式。

| 格式 | 用途 |
| --- | --- |
| `deductrium-map-project-v1` | 保存手动砖块、模块库、实例、范围及世界设置，供继续编辑。 |
| `deductrium-map-module-v1` | 可重复装配的局部地图，包含稳定砖块 ID、端口和 revision。 |
| `deductrium-world-v1` | 发布用砖块快照、入口、模式、币种、银行及迁移；也可导回编辑器。 |

导入 JSON 不执行 JavaScript。`map.ts` 导出用于静态地图源码，不承载银行和迁移配置。

## 货币与银行

账本包含 `reasoning`（推理素）、`type`（类型币）及本 mod 注册的币种。旧 D 只归 reasoning，不复制成两份。世界可声明一个自有币种，ID 固定为 `mod:<世界ID>`，名称和符号可配置。

银行使用普通道路、提示与奖励格。道路的 `data.bank` 指向世界 `banks` 中的配置；每个兑换奖励格用 `data.exchange` 明确银行、源币种、目标币种和本金。走入奖励格时重新检查实时余额，一次提交全部账本，并用原有奖励提示展示结果；没有额外弹窗。兑换格可重复使用，读档不会再次兑换。

每个银行包含 `rules` 数组；每个方向必须显式填写 `from/to/rate/feeRate/feeFixed/minimum/rounding/precision`。手续费为 `本金 × feeRate + feeFixed`，在本金外从源币种扣除；到账为 `本金 × rate`，按目标精度舍入。`rounding` 为 `none/floor/ceil/round`，precision 为 0–12。金额和中间结果限制在 0–1e12。未知币种、重复方向、余额不足或精度无法表达的转账会拒绝。

例如 reasoning → mod:workshop，rate=2、feeRate=0.1、feeFixed=1、minimum=1、rounding=floor、precision=0，本金 10 会扣 12 源币并到账 20 目标币。没有隐含汇率或手续费。

兑换格示例：`{"exchange":{"bank":"central","from":"reasoning","to":"mod:workshop","amount":10}}`。它必须是奖励格，不与 getD、payD、script 等领取效果混用。官方银行双向本金 1:1，额外从源币种收取本金的 1%，提供多种固定本金的兑换格。

脚本示例：`require currency mod:workshop >= 8`、`give currency type 5`、`take currency mod:workshop 8`。旧 money 始终指 reasoning。`exchange central reasoning 10 mod:workshop` 使用同一计算器；源币种有多个目标时必须写目标。

## 地图脚本

`data.script` 是有界的声明式语言，不执行 JavaScript。每行或分号分隔命令，字符串使用 JSON 双引号，整行 `//` 可注释。编辑器的命令参考、插入模板及语法检查共用同一目录和正式解析器。

条件可用于 `require`、`if / elif / else / end`；逻辑优先级为 `not > and > or`，支持括号。可以查询钥匙、旗标、奖励、层、公理、格子类型、计数、各币种余额、推理证明、规则与类型目标，以及步数、拆门数、累计花费和序数进度。未选中的分支仍验证语法与引用，只有选中分支产生效果。

| 用途 | 示例 |
| --- | --- |
| 钥匙、旗标、计数 | `give key red`、`set flag ready`、`add count visits 1` |
| 逻辑目标 | `require proof "$a→$a"`、`require rule "$a,$a→$b⊢$b"` |
| 规则存在与名称模式 | `require rule-present a3`、`if rule-name "a*x"`；名称只支持有界通配符，不执行正则表达式 |
| 类型目标 | `require type "Bool"`、`require type-present Bool`；必须存在实际闭合、通过检查的构造项，空洞或未解元变量不算证明 |
| 已有引擎内容 | `unlock rule a3`、`unlock type Bool`、`disable type Bool`、`enable type Bool` |
| 地图公理 | `add axiom apn5x "⊢$a"`、`remove axiom apn5x`、`disable axiom a3`、`enable axiom a3` |
| 奖励与界面 | `unlock reward macro`、`unlock layer D-layer`、`unlock achievement first-step`、`unlock info hint` |
| 动态数值 | `give money min(5,max(0,10-currency(reasoning)))`、`require metric steps >= count(visits)+256` |
| 序数 | `set ordinal base 5`、`set ordinal max "[1,2]"`、`set ordinal current "[1]"`、`raise ordinal "[1,2]"`、`recompute ordinal` |
| 尝试及通行 | `remember proof "$a→$a"`、`remember type "Bool"`、`generate ordinal "[1,2]"`、`confirm "继续？"`、`allow`、`block` |
| 重复与重置 | `event once`、`event repeat`、`reward consume`、`reward keep`、`clear reward prize`、`reset reward prize` |
| 地图与语言 | `open gate door`、`close gate door`、`demolish gate door`、`set tile door road`、`set text door "提示"`、`message "你好"`、`set language en` |

数值表达式支持 `+ - *`、括号、双参数 `min/max`，以及 `currency(...)`、`count(...)`、`metric(...)` 读取。money 始终为 reasoning，金额限制为有限的 0–1e12。序数用 JSON 字符串中的数组表示；空数组代表 0，非空从 1 开始，长度最多 64，分量 1–64，相邻分量至多上升 1，基底为 1–15。

旧式平铺脚本默认每格效果执行一次，门条件在每次进入时重查。也可改用顶层 `on touch / on pass / on collect / on start` 块，以 `end` 结束，不能与平铺命令混写。touch 在尝试进入非墙格时触发，pass 在门原有条件也满足后提交，collect 在尝试领取奖励时触发，start 仅在新存档出生时触发。每个事件独立记录 once；`event repeat` 在当前块内允许重复。touch 与 pass 是独立事务，成功的 touch 不因后续通行失败回滚；取消通行确认仍不提交 pass 效果。墙不触发事件，读档不重跑事件。

`reward keep` 保留奖励格，与 repeat 组合可写反复补助。`clear reward` 清除逻辑奖励所有权，`reset reward` 还恢复对应奖励格及旧式平铺执行记录；显式事件完成记录保留，防止重置或更新时重复派奖。局部格子、钥匙、旗标和计数随模块实例改名；引擎名称、全局奖励、币种及目标表达式保持原义。

脚本参考提供可直接插入的 #p / #d 证明门、钥匙开门、初始化和触碰计数模板。纯脚本门使用 `require proof "目标"` 或 `require rule "条件⊢结论"`，不需要 data.p/data.d。`@self` 仅在格子引用位置代表当前格，挂载或移动模块后仍有效；其他位置照常作为局部 ID。证明门的 pass 块使用 repeat，每次检查目标，再按 `if reward dG` 选择 `demolish gate @self`，否则允许通过并保留门。钥匙奖励的 collect 块可打开指定门；需要按技能拆门时选择拆门或开门分支。拆门复用现有双语“此门已拆除”文案，不改写原格子文字。默认地图整体转换为 built-in mod 留待后续迁移。

所有条件、费用和引擎修改先在独立状态中验证。失败或取消确认不会扣款、领取奖励或留下普通效果；`remember` 与 `generate ordinal` 是显式的尝试效果，允许在拒绝通行时显示目标、展开地图。`allow/block` 终止当前选中执行路径。读档只恢复状态，不重新执行给钱、提示或兑换。

内置推理规则解锁复用现有证明和依赖，不将未迁移定理替换成公理。地图显式添加的公理保留完整公式和所有权，不能覆盖现有玩家规则。未迁移的 1.0 类型论战术、定义谜题检查器及引擎扩展见 [1.0 行为覆盖说明](map-script-coverage.md)。

## mod 入口与世界模式

项目面板展开发布设置，选中可通行砖块设为入口，选择朝向和模式，应用后导出世界 JSON 或试玩：

- **扩展主世界**：保留只读主世界，通过 `entry: {mainHash, edge, tileId}` 指定相邻 mod 入口；官方格须可通行，入口必须是它指定边的真实邻居。
- **独立世界**：从空地图开始，指定出生点和独立存档，不继承主世界的隐式奖励或货币。

扩展砖块与主世界重叠会整体拒绝。试玩从同源 `deductrium2_world_manifest` 读取已验证的文件，入口为 `index.html?mod-world`；本地一次选择一个发布世界。不同世界、普通游戏与按内容 hash 保存的旧地图预览彼此隔离。

## 半平面编辑范围

由作者在双曲空间中指定一条测地线并选择允许的一侧；入口位于边界或连接位置。编辑、导入、旋转和挂载都应检查同一个范围约束，不能只在画布上遮住另一侧。

新发布的 `deductrium-world-v2` 必须设置边界砖块、边号 0–5、允许侧 ±1，不允许入口豁免。使用实际 `{6,4}` 六顶点及 BigInt 齐次 Lorentz 坐标判定整个多边形，边界相等允许。所有 mod 格须在允许侧；扩展模式的所有官方格须完整位于另一侧，不能覆盖或修改。新增、导入、挂载、移动、旋转和更新统一检查，失败保留项目和历史。发布和游戏加载都重新验证范围及入口。

旧 `deductrium-world-v1` 仍可读取和继续原存档；没有范围的旧世界导入编辑器后先锁定编辑，设置合法范围后才可修改或重新发布。原始地图源码编辑保持原有用途，不自动成为已发布 mod。

更新模块要求提高 revision、保留局部砖块 ID，并明确列出删除 ID。全部实例一次检查碰撞、引用与范围，成功才替换。实例砖块身份为 `实例ID::局部砖块ID`，移动不改变身份。模块库更新与发布世界升级分别管理。

## 地图更新与进度兼容

发布后的模块、实例和砖块都需要稳定 ID，位置或显示名称变化不改变身份。存档按世界 ID、实例 ID、砖块 ID 记录奖励领取、开门、钥匙和脚本执行状态；不把坐标或当前文本当作唯一身份。

地图版本与存档版本分别管理。更新至少区分保留砖块、改名迁移、删除砖块、新增砖块和谜题条件变化；脚本奖励不能因版本更新被重复发放。目标或条件发生变化时需要显式的进度迁移决策，不能仅凭旧的“门已开”状态通过新题。

世界存档键为 `deductrium2_world-<ID>`，槽位追加 `:slotN`；砖块运行时身份为 `mod:<世界ID>::<局部砖块ID>`。当前位置记录局部 ID，移动或改文案不会变成新奖励。

同 revision 允许文案和位置变化，目标或身份变化拒绝。升级提供连续步骤，例如 `[{"from":1,"to":2,"remap":{"old-door":"new-door"},"reset":["changed-puzzle"]}]`。只移动可用空 remap/reset；删除或改题必须明确处理，缺迁移、不同世界、未来版本、独立/扩展模式改变均拒绝。reset 清除旧领取、开门和格子修改；当前位置失效时返回入口。脚本 once 和显式事件完成状态按稳定 ID 迁移并保留以免重复派奖，需要新奖励时使用新砖块 ID。

加载先验证并生成独立数据，再应用。失败保留原始压缩存档并阻止后台覆盖，错误面板可导出原档；导入失败保留当前游戏，存储写入失败会回滚。修正世界或迁移后可重试。

## 验证与边界

`test/test-map-editor.mjs`、`test/test-map-module-update.mjs`、`test/test-map-economy.mjs`、`test/test-map-world.mjs`、`test/test-world-save-load.mjs`、`test/test-map-half-plane.mjs`、`test/test-map-script-events.mjs` 验证模型、几何、账本、事件与迁移；`test/browser/map-editor.mjs`、`test/browser/map-world.mjs`、`test/browser/map-half-plane.mjs`、`test/browser/map-script-events.mjs` 验证桌面和手机的实际编辑、发布、地图银行、半平面入口、脚本模板、保存重载、升级恢复和跨世界隔离。

自定义 data 字段不会自动成为新 action；旧硬编码奖励名不会因模块前缀而产生新行为。未移植的类型论关卡与新公理来源体系不在本次范围内。
