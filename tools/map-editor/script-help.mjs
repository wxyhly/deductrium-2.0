// One catalogue supplies both the insertion menu and the reference panel.
const entry = (id, label, template, note, select) => ({id, label, template, note, select});
export const SCRIPT_GROUPS = [
    {label: '条件检查', entries: [
        ...[['key', 'red', '持有钥匙'], ['not-key', 'red', '未持有钥匙'], ['flag', 'ready', '标记已设置'],
            ['not-flag', 'ready', '标记未设置'], ['reward', 'prize', '已获得奖励'], ['not-reward', 'prize', '未获得奖励'],
            ['layer', 'T-layer', '已解锁层'], ['axiom', 'a3', '公理可用'], ['not-axiom', 'a3', '公理已禁用']]
            .map(([kind, id, label]) => entry(`require-${kind}`, label, `require ${kind} ${id}`, '条件不满足时停止执行。', id)),
        entry('require-money', '推理素余额', 'require money >= 10', 'money 是 reasoning 货币。', '10'),
        entry('require-currency', '指定货币余额', 'require currency mod:workshop >= 8', '货币需在世界设置中注册。', 'mod:workshop'),
        entry('require-count', '计数条件', 'require count visits >= 2', '计数器按模块实例隔离。', 'visits'),
        entry('require-tile', '格子类型条件', 'require tile door == gate', '格子类型仅支持 == 和 !=。', 'door')
    ]},
    {label: '证明、规则与类型查询', entries: [
        entry('require-proof', '命题证明条件', 'require proof "p→p"', '检查玩家已有的命题证明；目标用 JSON 双引号。', 'p→p'),
        entry('require-rule', '完整规则证明条件', 'require rule "p,p→q⊢q"', '检查玩家已有的完整规则证明。', 'p,p→q⊢q'),
        entry('require-type', '类型证明条件', 'require type "True"', '检查玩家已有的、无空洞的闭合类型证明。', 'True'),
        entry('require-rule-name', '规则名通配条件', 'require rule-name "a*"', '使用 * 匹配规则名；模式用 JSON 双引号。', 'a*'),
        entry('require-rule-present', '规则存在条件', 'require rule-present a3', '规则 ID 使用裸标识符。', 'a3'),
        entry('require-type-present', '类型存在条件', 'require type-present Bool', '类型组或系统名称区分大小写。', 'Bool')
    ]},
    {label: '物品与货币', entries: [
        ...['give', 'take'].flatMap(op => [
            entry(`${op}-key`, `${op === 'give' ? '给予' : '消耗'}钥匙`, `${op} key red`, '钥匙按模块实例隔离。', 'red'),
            entry(`${op}-money`, `${op === 'give' ? '给予' : '消耗'}推理素`, `${op} money 10`, '金额为非负数。', '10'),
            entry(`${op}-currency`, `${op === 'give' ? '给予' : '消耗'}指定货币`, `${op} currency type 5`, '内置货币 reasoning / type，或注册的 mod:… 货币。', 'type')
        ]),
        entry('exchange', '银行兑换', 'exchange central reasoning 10 type', '银行 ID、方向和金额需符合世界设置；目标货币可省略。', 'central')
    ]},
    {label: '状态', entries: [
        entry('set-flag', '设置标记', 'set flag ready', '设置本实例的标记。', 'ready'),
        entry('clear-flag', '清除标记', 'clear flag ready', '清除本实例的标记。', 'ready'),
        entry('set-count', '设置计数', 'set count visits 0', '计数为整数。', 'visits'),
        entry('add-count', '增加计数', 'add count visits 1', '可用负整数减少计数。', 'visits')
    ]},
    {label: '指标与数值表达式', entries: [
        ...[['steps', '行走步数'], ['demolished', '拆除门数'], ['spent', '已消耗推理素'], ['ordinal-base', '序数底数']]
            .map(([name, label]) => entry(`require-metric-${name}`, label, `require metric ${name} >= ${name === 'ordinal-base' ? 4 : 10}`, '指标可用于 require 和分支条件。', name)),
        entry('number-require-money', '按计数检查余额', 'require money >= count(visits) * 2', '数值位置可引用 count(ID)、currency(ID) 和 metric(名称)。', 'visits'),
        entry('number-require-currency', '比较两种货币', 'require currency reasoning >= currency(type) + 10', '货币引用支持 reasoning、type 和已注册的 mod:… ID。', '10'),
        entry('number-require-count', '按步数检查计数', 'require count visits >= metric(steps) - 1', '计数表达式的最终结果必须是整数。', 'visits'),
        entry('number-require-metric', '按计数检查指标', 'require metric steps >= (count(visits) + 1) * 2', '支持 +、-、*、一元正负号和括号；乘法先于加减。', 'visits'),
        entry('number-give-money', '按表达式给予推理素', 'give money (currency(type) + count(visits)) * 2', '金额表达式的最终结果必须非负且不超过 1e12。', '2'),
        entry('number-give-currency', '按自定义余额给予货币', 'give currency type currency(mod:workshop) * 2', 'mod:workshop 需在世界设置中注册。', 'mod:workshop'),
        entry('number-take-currency', '按表达式消耗货币', 'take currency type 1 + count(visits)', '金额需非负，且当前余额足够。', 'visits'),
        entry('number-set-count', '按指标设置计数', 'set count visits metric(steps)', '计数表达式的最终结果必须是 -1e12 到 1e12 的整数。', 'visits'),
        entry('number-add-count', '按表达式减少计数', 'add count visits -1 * (count(visits) + 1)', '可用负表达式减少计数。', 'visits'),
        entry('number-min', '限制发放金额上限', 'give money min(10, currency(type))', 'min(a, b) 取两个数的较小值。', '10'),
        entry('number-max', '限制扣款金额下限', 'take money max(0, currency(reasoning) - 10)', 'max(a, b) 取两个数的较大值；可与 min 嵌套。', '10'),
        entry('number-exchange', '按余额表达式兑换', 'exchange central reasoning (currency(reasoning) - 10) type', '目标货币可省略；计算出的金额需符合银行规则。', 'central')
    ]},
    {label: '公理与解锁', entries: [
        entry('disable-axiom', '禁用公理', 'disable axiom a3', '也禁止依赖它的宏和过门证明。', 'a3'),
        entry('enable-axiom', '启用公理', 'enable axiom a3', '恢复公理可用性。', 'a3'),
        entry('add-axiom', '添加地图公理', 'add axiom customax "⊢p"', '使用未占用的原子规则名和带 ⊢ 的完整规则。', 'customax'),
        entry('remove-axiom', '移除地图公理', 'remove axiom customax', '移除通过地图脚本添加的公理。', 'customax'),
        entry('disable-type', '禁用类型', 'disable type Bool', '使用有效的类型组或系统名称。', 'Bool'),
        entry('enable-type', '启用类型', 'enable type Bool', '恢复指定类型组或系统名称。', 'Bool'),
        ...[['reward', 'prize', '奖励'], ['layer', 'T-layer', '层'], ['achievement', 'first-step', '成就'], ['info', 'hint', '信息'],
            ['rule', 'a3', '规则'], ['type', 'Bool', '类型']]
            .map(([kind, id, label]) => entry(`unlock-${kind}`, `解锁${label}`, `unlock ${kind} ${id}`, '使用游戏中有效的 ID。', id))
    ]},
    {label: '序数', entries: [
        ...[['current', '当前序数'], ['max', '最大序数'], ['next', '下一序数']]
            .map(([slot, label]) => entry(`require-ordinal-${slot}`, `${label}条件`, `require ordinal ${slot} >= "[1,2]"`, '序数使用 JSON 双引号包裹的数组，空序数写作 "[]"。', '[1,2]')),
        ...[['current', '当前序数'], ['max', '最大序数']]
            .map(([slot, label]) => entry(`set-ordinal-${slot}`, `设置${label}`, `set ordinal ${slot} "[1,2]"`, '非空数组从 1 开始，分量为 1 到 64，相邻分量最多上升 1。', '[1,2]')),
        entry('set-ordinal-base', '设置序数底数', 'set ordinal base 4', '底数必须是 1 到 15 的整数。', '4'),
        entry('raise-ordinal', '推进序数', 'raise ordinal "[1,2]"', '推进序数进度并重算下一序数。', '[1,2]'),
        entry('generate-ordinal', '生成序数地图', 'generate ordinal "[1,2]"', '按指定序数生成地图；属于本次尝试的操作。', '[1,2]'),
        entry('recompute-ordinal', '重算下一序数', 'recompute ordinal', '根据当前序数进度和底数重算。')
    ]},
    {label: '事件、奖励与通行', entries: [
        entry('event-once', '事件只执行一次', 'event once', '显式指定一次性事件策略。'),
        entry('event-repeat', '事件重复执行', 'event repeat', '显式指定重复事件策略。'),
        entry('reward-consume', '领取后消耗奖励格', 'reward consume', '指定本次领取后消耗奖励格。'),
        entry('reward-keep', '领取后保留奖励格', 'reward keep', '保留奖励格；重复领取配合 event repeat。'),
        entry('allow', '允许通行', 'allow', '允许本次通行。'),
        entry('block', '阻止通行', 'block', '阻止本次通行。'),
        entry('confirm', '通行前确认', 'confirm "继续？"', '确认文字使用 JSON 双引号。', '继续？'),
        entry('remember-proof', '记住命题目标', 'remember proof "p→p"', '将命题目标加入逻辑层的门目标记录。', 'p→p'),
        entry('remember-rule', '记住规则目标', 'remember rule "p,p→q⊢q"', '将完整规则目标加入逻辑层的门目标记录。', 'p,p→q⊢q'),
        entry('remember-type', '记住类型目标', 'remember type "True"', '在类型层显示目标提示；目标使用 JSON 双引号。', 'True'),
        entry('clear-reward', '清除奖励记录', 'clear reward prize', '使用奖励 ID。', 'prize'),
        entry('reset-reward', '重置奖励', 'reset reward prize', '使用奖励 ID。', 'prize')
    ]},
    {label: '地图变化', entries: [
        entry('open-gate', '打开门', 'open gate door', '目标为格子名称。', 'door'),
        entry('close-gate', '关闭门', 'close gate door', '目标为格子名称。', 'door'),
        entry('demolish-gate', '拆除门', 'demolish gate door', '目标为门的格子名称。', 'door'),
        entry('set-tile', '改变格子类型', 'set tile door road', 'road / wall / gate / reward / ordinal。', 'door'),
        entry('set-text', '改变格子文字', 'set text door "新的文字"', '文字必须使用 JSON 双引号。', 'door'),
        entry('message', '显示消息', 'message "你好"', '文字必须使用 JSON 双引号。', '你好'),
        ...[['zh', '中文'], ['en', '英文']]
            .map(([language, label]) => entry(`set-language-${language}`, `切换为${label}`, `set language ${language}`, '语言参数支持 zh / en。', language))
    ]},
    {label: '分支与逻辑', entries: [
        entry('if-else', 'if / elif / else / end', 'if key red\n  open gate door\nelif flag ready\n  message "准备好了"\nelse\n  message "需要钥匙"\nend', '条件复用 require 谓词；分支可嵌套，必须用 end 闭合。', 'red'),
        entry('if-logic', 'and / or / not 与括号', 'if (key red or flag ready) and not reward prize\n  give money 10\nend', '优先级：not > and > or；用括号分组。', 'red'),
        entry('if-engine', '证明与类型分支', 'if proof "p→p" and rule-present a3\n  message "命题条件满足"\nelif type "True" and type-present Bool\n  message "类型条件满足"\nelse\n  block\nend', '引擎查询也可用作 if / elif 条件。', 'p→p'),
        entry('if-number-ordinal', '数值表达式与序数分支', 'if metric steps >= (count(visits) + 1) * 2 and ordinal current < "[1,2]"\n  message "满足进度条件"\nend', '数值括号与逻辑条件可以组合。', 'visits')
    ]},
    {label: '完整示例', entries: [
        entry('example-reward', '奖励给钥匙', 'give key red\nmessage "获得红钥匙"', '用于奖励格。', 'red'),
        entry('example-gate', '钥匙门', 'require key red\nopen gate door', '门的条件每次进入都会检查。', 'red'),
        entry('example-visits', '访问计数', 'add count visits 1\nmessage "欢迎回来"', '重复执行需在 data 中设置 "scriptRepeat": true。', 'visits'),
        entry('example-bank', '银行兑换', 'require currency reasoning >= 10\nexchange central reasoning 10 type', '需先配置银行规则。', 'central'),
        entry('example-repeat-reward', '保留并重复领取奖励', 'event repeat\nreward keep\nadd count visits 1\ngive money 1\nmessage "欢迎回来"', '用于可重复领取的奖励格。', 'visits'),
        entry('example-min-max', '嵌套数值函数与条件', 'if currency type >= min(10, max(0, count(visits) - 1))\n  give money min(10, max(0, currency(type) - 1))\nend', 'min / max 均接收两个数值表达式，可用于数值条件和金额。', '10'),
        entry('example-attempt', '通行失败时记录与生成', 'event repeat\nremember proof "p→p"\nremember rule "p,p→q⊢q"\ngenerate ordinal "[1,2]"\nblock', '已执行的 remember / generate 属于本次尝试；随后阻止通行时仍保留这些尝试效果。', '[1,2]')
    ]}
];

export const SCRIPT_RULES = '每行一条命令，也可用分号分隔；// 开头的整行是注释。文字、证明目标和规则名通配模式用 JSON 双引号，ID 不含空格。比较符：>=、<=、==、!=、>、<。层：D-layer / T-layer / P-layer / G-layer。数值支持 +、-、*、括号、min(a, b)、max(a, b)，以及 currency(ID)、count(ID)、metric(steps / demolished / spent / ordinal-base)。序数写作 "[1,2]" 或 "[]"。门的 require 每次进入都检查；效果默认每个具名格执行一次，可用 event once / event repeat 指定策略，也可在 data 中设置 "scriptRepeat": true。检查验证脚本语法；目标表达式和引用还需满足当前游戏与地图的规则。';

export function supportedScriptGroups(parse) {
    return SCRIPT_GROUPS.map(group => ({...group, entries: group.entries.filter(item => {
        try { parse(item.template); return true; } catch { return false; }
    })})).filter(group => group.entries.length);
}
