# 地图编辑器

从仓库根目录启动静态 HTTP 服务，打开 `/tools/map-editor/index.html`。需要同目录的 `model.mjs`，以及现有编译输出（包括 `/js/hy/appearance.js`、`/js/hy/script.js`）。不支持直接用 `file://` 打开。

## 编辑地图

- 启动时恢复本工具草稿，否则读取 `src/hy/map.ts`。可新建空图，或导入地图源码 / 项目 JSON。源码由模型解析，不执行 `eval`。
- 单击真实地图选择已有格或空白格，拖动平移；当前格的六个邻居按钮使用真实 `{6,4}` 邻接。名称或坐标可定位，`[]` 表示原点。
- 工具栏可选择道路、墙、门、奖励、序数和擦除工具，单击操作；拖动始终移动镜头。Shift 单击或列表复选框调整选区。筛选结果可一键加入选区。
- 右侧填写类型、名称、通用文字或 zh/en 与其他语言、完整 data JSON，再点击 **应用 Apply** 提交。未应用的表单不会悄悄写进项目或导出文件。切换格子会确认是否放弃表单；“还原表单”恢复当前已应用数据。
- p/d/t/td/never、getD/payD、unl.layer、dstrTarget/requiresReward 等通过 data JSON 编辑，未修改字段会保留。填写严格 JSON，包括引号。
- `data.script` 通过独立的多行脚本字段编辑；其他 data JSON 不重复填写 script。Apply 时调用公共 `parseMapScript` 校验语法，错误显示解析器提供的行信息，不提交半份修改。奖励示例为 `disable axiom a3` 换行 `give key red`；门示例为 `require key red` 换行 `enable axiom a3`。钥匙按模块实例隔离；禁用公理也会禁止依赖它的宏和过门证明。脚本执行由游戏的正式运行时负责。公理受限期间，自动元规则需要改用逐步推导；当前依赖检查无法确认的大型或特殊推导会被拒绝。
- 项目 ID / 标题另有“应用项目信息”，通过模型 `setInfo` 支持撤销。撤销、重做及 Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z、Ctrl/Cmd+Y 调用模型历史；输入框内保留浏览器原生文字撤销。
- 地图直接使用 HWorld、LocalDraw 和公共 appearance 函数，保留原始字体、文字布局和玩家绘制。颜色、语言和主题与游戏共享。勾选空格网格时启用 HWorld 原生 debugDraw / navigateDraw；空白格即使未显示网格也可选择。覆盖在地图上的圆圈 / 方框仅标注选区和挂载预览。
- 自由镜头跳过碰撞 / 奖励执行，显示数据与项目同步，不启动 Game、不写游戏存档，不生成运行时序数分支。

## 模块与实例

选区非空时默认导出整个选区；否则导出当前单格。当前格必须在导出选区中，并作为模块原点。填写模块 ID / 标题后导出 `deductrium-map-module-v1` JSON。模块的 tile 坐标、旋转、端口与几何变换由模型处理。

“导入模块到库”注册模块但不会放置格子。也可通过顶部导入自动识别模块 JSON。选择库中的模块，填写实例 ID、锚点坐标和旋转 0–5；“取当前格锚点”可选原位或当前格某条边的真实邻格。先预览，查看目标坐标和逐条冲突信息，再确认挂载；参数或项目变化使旧预览失效。预览不会改动项目。方框代表当前视野内的预览目标，完整冲突以文字为准。

实例支持定位、填入表单、预览移动、移动到表单位置、旋转、删除和分离。移动时保留实例 ID，并忽略它自己的旧格子进行冲突校验。挂载格子必须先 detach 整个实例才能修改。实例命名为 `实例ID::局部名`，模型只重映射内部 `dstrTarget` / `requiresReward` 引用。

**模块用于地图装配，并支持现有地图脚本。** 模型负责模块脚本引用的实例命名空间，游戏负责公理开关和钥匙命令的执行。旧硬编码奖励 / 奖牌 ID 不会因为实例前缀而自动获得新的运行时行为；任意自定义 action 不会仅因写入 JSON 而得到执行支持。

## 隔离试玩

点击“▶ 试玩地图”先校验脚本，将 `{tiles: [[hash, {type, name, text, data}], ...]}` 写入独立的 `deductrium2_map_preview`，然后打开 `../../index.html?map-editor-preview`。预览直接传递结构化格子，不执行地图源码。游戏端负责读取预览地图并使用隔离的存档命名空间。修改地图后再次点击试玩可加载新版。localStorage 写入失败时会显示错误，不启动使用旧预览数据的试玩窗口；项目文件导出仍然可用。

DSL 支持钥匙、旗标、奖励、金额、计数及已接入引擎的证明 / 规则 / 类型查询；也支持规则与类型解锁、公理开关、序数进度、尝试效果、确认、奖励重置、地图与语言修改。条件分支使用 `if / elif / else / end`，支持 `not / and / or` 和括号。全部分支都会检查语法与引用，只有选中的分支执行。门的 require 条件每次进入都会检查；效果默认每个具名格执行一次，`event repeat`（或旧的 `data.scriptRepeat: true`）可启用重复效果，`reward keep` 保留奖励格。编辑器不执行脚本，不使用 JavaScript / eval。

命令按行或分号分隔；整行 `//` 注释可用。计数 / 金额比较符为 `>= <= == != > <`。例如 `require money >= 10`、`require count visits >= 2`、`set tile door road`、`set text door "新的文字"`、`message "你好"`。格子类型为 `road / wall / gate / reward / ordinal`；层名为 `D-layer / T-layer / P-layer / G-layer`。完整示例可展开编辑器的“脚本命令参考”。

“显式事件与纯脚本门”模板组提供 #p / #d 证明门、按 dG 拆门、#<> 钥匙开门、起点初始化和触碰计数。`on touch/pass/collect/start` 块分别处理尝试碰格、过门、领取和新存档启动，以 `end` 闭合，不能与旧式平铺命令混写。各事件独立 once，需要重复时在块内写 `event repeat`。`@self` 在格子引用位置代表当前格。拆门模板沿用现有本地化提示；默认地图整体迁移为 built-in mod 属于后续工作。

数值可读取 `currency(type)`、`count(visits)`、`metric(steps)`，并使用 `+ - *`、括号和 `min/max`。序数采用 `"[1,2]"` 形式的 JSON 字符串。完整命令、事务与 1.0 引擎边界见 [地图脚本说明](../../doc/map-mod-design.md#地图脚本)。

游戏侧预览存档应使用内容 hash 对应的独立 SaveMode，与正常 `game` 存档隔离；编辑器只写入预览输入 key，不直接操作这些游戏存档。

## 保存与恢复

“保存项目 JSON”保留项目元信息、格子、模块库及实例，适合继续编辑；“导出 map.ts”生成地图源码。后者不替代项目文件，模块装配信息以项目 JSON 为准。导出由模型验证，失败会显示具体错误。

自动暂存独立使用 `deductrium-map-editor-project-v1`，与游戏的 key 分离。localStorage 不可用时仍可导出。恢复失败的草稿保留原始记录，提供“导出未恢复草稿”，本次编辑不会覆盖它；请用项目文件保存本次工作。未应用属性、未保存到项目文件的改动都有 dirty 提示，切换项目和离开页面会提示。暂存成功不会清除文件保存状态。

项目导入先完整解析再替换；失败或取消保留当前图。模块导入依赖模型的原子注册校验。导入项目 JSON 传递解析后的对象给 `EditorProject.fromJSON`。

## 浏览器验证

在仓库根目录运行 `node test/browser/map-editor.mjs`，要求本地 Chrome、Playwright 和上述模型 / 编译资源可用。可用 `PLAYWRIGHT_MODULE` 指向现有 Playwright 入口文件；无需全量 tsc。覆盖桌面 / 手机布局、明确 Apply、增删 / 撤销 / 重做、真实点击 / 拖动、语言 / 主题、模块装配、导入失败保护和草稿恢复保护。

只读诊断入口 `window.mapEditor` 提供 project、world、selectedHash、selection、dirty、preview 的 getter，以及 selectHash、hashAtPoint、mount 操作。它不启动游戏逻辑，主要供浏览器回归验证。


## 发布世界、币种和范围

项目面板展开世界发布设置，选中入口砖块，选择独立世界或扩展主世界。可注册 `mod:<项目ID>` 自有币种；道路的 `data.bank` 标注银行设施，奖励格的 `data.exchange` 配置银行 ID、方向与固定本金。走入兑换格即可成交，以原有奖励提示反馈；余额不足不扣款，读档不重复成交。推理素、类型币、自有币分别记账；每个方向必须显式配置汇率、手续费、最低本金和舍入策略。

高级设置还包括整块多边形的半平面范围、模块库 revision 更新和世界版本迁移。未应用的设置阻止导出；应用一组会保留其他组未确认的内容。模块更新先验证全部实例；改动题目的世界升级必须声明 remap/reset，加载失败会保留原存档并提供恢复导出。

“导出世界 JSON”生成 `deductrium-world-v2`，必须选择半平面；所有 mod 格须完整位于允许侧，入口没有豁免。扩展模式保留只读官方地图，所有官方格须在另一侧，`entry` 指定官方可通行格的边及真实相邻的 mod 格。发布与运行时都校验范围、重叠和入口。旧 v1 世界仍能游玩和读档，但缺少范围时导入编辑器会锁定编辑，设置范围后可继续修改。

世界试玩采用 `?mod-world` 和按世界 ID 隔离的存档；它与旧的按内容 hash 隔离的“试玩地图”用途不同。更新保留稳定 ID 和事件完成记录，避免重复领奖；模式不能在原存档中悄悄切换。配置和迁移规则见 [地图模块说明](../../doc/map-mod-design.md)。

运行 `node test/browser/map-world.mjs` 验证世界导入、设置、发布、银行、账本、迁移与恢复；`node test/browser/map-half-plane.mjs` 验证半平面限制、主世界入口与只读底图；`node test/browser/map-script-events.mjs` 验证显式事件、证明门、钥匙模板与拆门读档。这些脚本同样支持 `PLAYWRIGHT_MODULE`。
