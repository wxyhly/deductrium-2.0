import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {Polygon} from '../js/hy/tiling.js';
import {EditorProject} from '../tools/map-editor/model.mjs';
import {canonicalPath, transport} from '../tools/map-editor/geometry.mjs';
import {buildWorld} from '../tools/map-editor/publish.mjs';

export const IPC_RULES = [
    'a3i', 'd/\\i', 'd/\\i1', 'd/\\i2', 'd\\/i1', 'd\\/i2', 'd\\/i',
    'd~i', 'd~i1', 'd<>i', 'd<>i1', 'd<>i2',
];
export const ALLOWED_TAGS = ['propositional', 'intuitionistic'];
export const DEMO_ID = 'intuitionistic-propositional';
export const REGION = {hash:'2,2,4,3,1,2,3,1,2', edge:5, side:-1};
export const ENTRY = {mainHash:REGION.hash, edge:REGION.edge, tileId:'entry'};
export const ENTRY_ROTATION = 4;
const bilingual = (zh, en) => `${zh}\n\n${en}`;
const quote = JSON.stringify;

// Replayable solutions are test data, never granted to the player's rule library.
export const SOLUTIONS = [
    {id:'identity', kind:'proof', target:'P→P', commands:[
        'a1 P P', 'a1 P (P→P)', 'a2 P (P→P) P', 'mp 3 2', 'mp 4 1',
    ]},
    {id:'and-commutes', kind:'proof', target:'(P∧Q)→(Q∧P)', commands:[
        'cond P∧Q', 'd/\\i1 P Q', 'mp 2 1', 'd/\\i2 P Q', 'mp 4 1',
        'd/\\i Q P', 'mp 6 5', 'mp 7 3', 'pop',
    ]},
    {id:'pair-rule', kind:'rule', target:'P,Q⊢P∧Q', commands:[
        'hyp P', 'hyp Q', 'd/\\i P Q', 'mp 3 1', 'mp 4 2', 'm qIpcPair',
    ]},
    {id:'cases-rule', kind:'rule', target:'P→R,Q→R,P∨Q⊢R', commands:[
        'hyp P→R', 'hyp Q→R', 'hyp P∨Q', 'd\\/i P R Q',
        'mp 4 1', 'mp 5 2', 'mp 6 3', 'm qIpcCases',
    ]},
    {id:'double-negation', kind:'proof', target:'P→¬¬P', commands:[
        'cond P', 'a1 P ¬P', 'mp 2 1', '.i ¬P', 'd~i ¬P P',
        'mp 5 3', 'mp 6 4', 'pop',
    ]},
    {id:'contraposition-rule', kind:'rule', target:'P→Q,¬Q⊢¬P', commands:[
        'hyp P→Q', 'hyp ¬Q', 'a3i P Q', 'mp 3 1', 'mp 4 2', 'm qIpcContra',
    ]},
    {id:'iff-reflexive', kind:'proof', target:'P↔P', commands:[
        '.i P', 'd<>i P P', 'mp 2 1', 'mp 3 1',
    ]},
    {id:'final-conjunction', kind:'proof', target:'(P∧Q)→((Q∧P)∧(P∨Q))', commands:[
        'cond P∧Q', 'd/\\i1 P Q', 'mp 2 1', 'd/\\i2 P Q', 'mp 4 1',
        'd/\\i Q P', 'mp 6 5', 'mp 7 3', 'd\\/i1 P Q', 'mp 9 3',
        'd/\\i (Q∧P) (P∨Q)', 'mp 11 8', 'mp 12 10', 'pop',
    ]},
];

function door(id, zh, en) {
    const goal = SOLUTIONS.find(solution => solution.id === id);
    const label = goal.kind === 'proof' ? '#pi' : '#di';
    const script = [
        'on touch', `remember ${goal.kind} ${quote(goal.target)}`,
        `message ${quote(bilingual(`${label} ${goal.target}\n${zh}`, `${label} ${goal.target}\n${en}`))}`, 'end',
        'on pass', 'event repeat',
        `require ${goal.kind} ${quote(goal.target)} using ${ALLOWED_TAGS.join(' ')}`,
        'if reward dG', 'demolish gate @self', 'else', 'open gate @self', 'end', 'allow', 'end',
    ].join('\n');
    // Native gates parse the entire text as mathematics. Keep explanations in the
    // once-only touch message, and apply the same provenance policy in both routes.
    return {id, type:2, text:goal.target, data:{[goal.kind === 'proof' ? 'pi' : 'di']:true, script}};
}

export function makeProject() {
    const polygon = new Polygon(6, 4);
    const road = (id, zh, en) => ({id, type:0, text:bilingual(zh, en), data:{}});
    const tiles = [
        {...road('entry',
            '直觉命题逻辑 / IPC\n前往工具包，再沿走廊完成 #pi 命题门与 #di 规则门。原路可返回主世界。',
            'Intuitionistic propositional logic / IPC\nCollect the toolkit, then follow #pi proof gates and #di rule gates. Return to the main world along this corridor.'),
        data:{script:'on touch\nmessage "IPC: proof sources must be propositional or intuitionistic / 仅允许命题与直觉来源"\nend'}},
        {id:'toolkit', type:3, text:bilingual(
            '领取 IPC 工具包\na1、a2、mp 与主世界共用；新增 a3i 及 11 条原生直觉公理。解锁假设、条件推导与规则录制；不授予 a3 或经典定义。',
            'Collect the IPC toolkit\nShare a1, a2 and mp with the main world. Gain primitive a3i and 11 IPC axioms, hypotheses, conditional proofs and rule recording. No a3 or classical definitions are granted.'),
        data:{script:[
            'on collect', 'unlock layer D-layer', ...IPC_RULES.map(id => `unlock rule ${id}`),
            'unlock rule .i', ...['macro', 'hyp', 'mct', 'mdt', 'copygateD'].map(id => `unlock reward ${id}`),
            'message "IPC toolkit unlocked / 直觉逻辑工具已解锁"', 'end',
        ].join('\n')}},
        door('identity', '从 a1、a2、mp 证明恒等式；也可使用由它们构成的 .i。命题门不接受未解除的假设。',
            'Prove identity using a1, a2 and mp, or their derived rule .i. Proof gates reject undischarged hypotheses.'),
        road('and-lesson', '合取 ∧\nd/\\i 引入，d/\\i1 / d/\\i2 消去。试用 cond P∧Q 开条件块，分别取出 P、Q，再反序组合，pop 关闭。',
            'Conjunction ∧\nd/\\i introduces it; d/\\i1 / d/\\i2 eliminate it. Start cond P∧Q, extract P and Q, combine them in reverse order, then pop.'),
        door('and-commutes', '构造证明，不使用经典 d/\\ 定义。可在新推导表中完成。',
            'Build a constructive proof without the classical d/\\ definition. A fresh proof sheet is fine.'),
        door('pair-rule', '在新表中 hyp P；hyp Q，再用 d/\\i 与 mp，最后 m qIpcPair 录制规则。这里 #di 允许已记录的前提。',
            'On a fresh sheet use hyp P; hyp Q, then d/\\i and mp. Record with m qIpcPair. This #di gate accepts recorded premises.'),
        road('or-lesson', '析取 ∨\nd\\/i1 / d\\/i2 从任一侧引入。d\\/i 分情况消去：两条分支都须证明同一个 R。替换顺序为 p,r,q，例如 d\\/i P R Q。',
            'Disjunction ∨\nd\\/i1 / d\\/i2 introduce either side. d\\/i eliminates it by proving the same R in both branches. Its argument order is p,r,q: d\\/i P R Q.'),
        door('cases-rule', '假设两条分支与一个析取，推出 R 并录制。不得把某一分支当成已选定的事实。',
            'Assume both branch implications and a disjunction, derive R and record the rule. Neither disjunct is given individually.'),
        road('negation-lesson', '构造性否定 ¬\nd~i 从 P→Q 与 P→¬Q 推出 ¬P；d~i1 是 ¬P→P→Q。a3i 为 (P→Q)→¬Q→¬P。它是独立原始公理；旧 .a30 的证明仍依赖经典 a3。',
            'Constructive negation ¬\nd~i derives ¬P from P→Q and P→¬Q. d~i1 is ¬P→P→Q. Primitive a3i is (P→Q)→¬Q→¬P; the old .a30 proof still depends on classical a3.'),
        door('double-negation', '可引入双重否定。提示：假定 P，则 ¬P→P；结合 ¬P→¬P 使用 d~i。此门不要求双重否定消去。',
            'Double negation can be introduced. Under P obtain ¬P→P; combine it with ¬P→¬P using d~i. This gate does not ask for double-negation elimination.'),
        door('contraposition-rule', '使用新 a3i，应用两次 mp，然后录制规则。不要调用来源为经典逻辑的旧 .a30；即使结论相同也不合门禁。',
            'Use the new a3i, apply mp twice and record the rule. The old .a30 has classical provenance and is rejected even with the same conclusion.'),
        road('iff-lesson', '等价 ↔\nd<>i 从两个方向引入等价；d<>i1 / d<>i2 取出各个方向。这里使用原生 ↔，不使用经典 d<> 定义。',
            'Equivalence ↔\nd<>i combines both implications; d<>i1 / d<>i2 project them. Use native ↔ without the classical d<> definition.'),
        door('iff-reflexive', '用恒等式作等价的两个方向。', 'Use identity for both directions of equivalence.'),
        door('final-conjunction', '终点综合：从同一对证据同时构造交换后的合取和一个析取，最后再次合取。',
            'Final task: from the same pair of witnesses construct the swapped conjunction and a disjunction, then conjoin those results.'),
        {id:'completed', type:3, text:bilingual('教程完成\n已完成构造性主线。旁边三块说明牌展示经典原则的非有效性；它们不是必须证明的门。',
            'Tutorial complete\nThe constructive route is finished. Three nearby signs explain why certain classical principles are not IPC validities. They are not required proof gates.'),
        data:{script:'on collect\nset flag ipc-complete\nmessage "IPC tutorial complete / 直觉命题教程完成"\nend'}},
    ];
    const entrance = polygon.getNeighborAndDir(canonicalPath(ENTRY.mainHash, polygon), ENTRY.edge, true)[0];
    const place = path => transport(path, entrance, ENTRY_ROTATION, polygon).at.join(',');
    for (let index = 0; index < tiles.length; index++) {
        tiles[index].hash = place(Array(index).fill(2));
    }
    const end = Array(tiles.length - 1).fill(2);
    const displays = [
        road('excluded-middle', '经典展板：P∨¬P\n取两世界 r≤s，P 只在 s 成立。r 既不强迫 P 也不强迫 ¬P，所以不强迫此析取。这是非有效性的反模型，不是其否定的证明。',
            'Classical exhibit: P∨¬P\nTake r≤s with P true only at s. At r neither P nor ¬P is forced, so the disjunction is not forced. This refutes validity; it does not prove its negation.'),
        road('double-negation-elimination', '经典展板：¬¬P→P\n在同一个 r≤s 模型中，r 强迫 ¬¬P 而不强迫 P。双重否定消去不可普遍由本教程公理证明；旁路无需证明它。',
            'Classical exhibit: ¬¬P→P\nIn the same r≤s model, r forces ¬¬P but not P. Double-negation elimination is not generally derivable here; no gate requires it.'),
        road('peirce', '经典展板：((P→Q)→P)→P\n仍取 r≤s，P 只在 s，Q 无处成立。r 强迫 (P→Q)→P，但不强迫 P。已解锁 a3 也不能让带经典依赖的证明通过 #pi/#di。',
            'Classical exhibit: ((P→Q)→P)→P\nAgain take r≤s, P only at s and Q nowhere. At r, (P→Q)→P holds but P does not. Owning a3 never makes a classical dependency pass #pi/#di.'),
    ];
    displays.forEach((tile, index) => {
        tile.hash = place([...end, 2, ...Array(index).fill(3)]);
    });
    return {
        format:'deductrium-map-project-v1', id:DEMO_ID,
        title:'直觉命题逻辑 / Intuitionistic propositional logic', version:1,
        tiling:{p:6, q:4}, region:{...REGION},
        world:{revision:1, mode:'extension', spawn:{tileId:'entry', rotation:(6 - ENTRY_ROTATION) % 6}, entry:{...ENTRY}, banks:{}, migrations:[]},
        tiles:[...tiles, ...displays], modules:[], instances:[],
    };
}

export function publishExample(input = makeProject()) {
    const project = EditorProject.fromJSON(input, new Polygon(6, 4));
    // initMap logs its source map; keep generation and Node test reports readable.
    const log = console.log;
    try { console.log = () => {}; return buildWorld(project); }
    finally { console.log = log; }
}

const main = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (main) {
    const project = makeProject();
    const world = publishExample(project);
    await mkdir(fileURLToPath(new URL('.', import.meta.url)), {recursive:true});
    for (const [suffix, value] of [['map-project', project], ['world', world]]) {
        const location = new URL(`./intuitionistic-propositional.${suffix}.json`, import.meta.url);
        await writeFile(location, JSON.stringify(value, null, 2) + '\n');
        // Confirm the portable JSON, rather than a runtime-only object, is delivered.
        JSON.parse(await readFile(location, 'utf8'));
    }
    const builtin = new URL('../src/hy/builtin/intuitionistic.ts', import.meta.url);
    await mkdir(fileURLToPath(new URL('.', builtin)), {recursive:true});
    await writeFile(builtin, "import type { WorldManifest } from '../world.js';\n\n"
        + '// Generated by examples/intuitionistic-propositional.mjs.\n'
        + `export const intuitionisticWorld: WorldManifest = ${JSON.stringify(world, null, 2)};\n`);
    console.log(`Published ${world.tiles.length} IPC tiles (${world.format}, ${world.mode}).`);
}
