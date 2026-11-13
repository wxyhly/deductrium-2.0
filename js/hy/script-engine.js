import { HSLayer } from '../hs/main.js';
import { HilbertSystem } from '../hs/core/core.js';
import { HSParser } from '../hs/core/parser.js';
import { NodeType } from '../asttype.js';
import { Deduction } from '../hs/core/deduction.js';
import { AtomSolver } from '../hs/core/assert.js';
import { initialCreativeRules } from '../hs/core/initial.js';
import { intuitionisticRules } from '../hs/core/intuitionistic.js';
import { validProofTags } from '../hs/proof-tags.js';
import { MCPT } from '../hs/core/combine.js';
import { getSurvivalRules } from '../hs/rewards.js';
import { validateMapTypeId, validateMapTypeQuery } from '../tt/gui.js';
import { definitionLine, worldContentLines, worldTheoremLine } from './world-content.js';
const parser = new HSParser();
/** Authoring preflight uses the same checked loader as the live engine, without a live sheet. */
export function checkWorldContent(content) {
    const view = Object.create(HSLayer.prototype);
    const system = new HilbertSystem();
    Object.assign(view, { hilbertSystem: system, ruleList: [], ruleListView: { refresh() { }, idCounter: 1 } });
    view.addRules(initialCreativeRules + '\n' + intuitionisticRules);
    for (const definition of content.definitions) {
        if (system.rules.has(definition.id))
            throw Error('地图内容规则名冲突：' + definition.id);
        view.addRules(definitionLine(definition, system.rules));
        const rule = system.rules.get(definition.id);
        if (!rule || rule.error)
            throw Error('地图定义无法校验：' + definition.id);
    }
    // Resolve declared theorem dependencies in order, with cycle detection; no axiom fallback.
    const pending = new Map(content.rules.map(rule => [rule.id, rule]));
    for (const id of pending.keys())
        if (system.rules.has(id))
            throw Error('地图内容规则名冲突：' + id);
    const active = new Set();
    const visit = (id) => {
        const entry = pending.get(id);
        if (!entry)
            return;
        if (active.has(id))
            throw Error('地图内容证明循环：' + id);
        active.add(id);
        const line = worldTheoremLine(entry);
        dependencies(line).forEach(visit);
        view.addRules(line);
        const rule = system.rules.get(id);
        if (!checkedTheorem(rule, entry))
            throw Error('地图定理证明无效：' + id + (rule?.error ? ' ' + String(rule.error.cause) : ''));
        active.delete(id);
        pending.delete(id);
    };
    for (const id of [...pending.keys()])
        visit(id);
}
const catalog = new Map((initialCreativeRules + '\n' + intuitionisticRules).split('\n').map(s => s.trim())
    .filter(s => s && !s.startsWith('//') && !s.startsWith('{') && !s.startsWith('}'))
    .map(s => [s.slice(0, s.indexOf(':')), s]));
function parseHS(text, mode) {
    const ast = parser.parse(text, mode);
    if (!ast || ast.end !== text.trimEnd().length)
        throw new Error('地图逻辑表达式不完整：' + text);
    if (mode === 'wff')
        ast.checkWFF();
    if (mode === 'rule' && ast.type !== NodeType.RULE)
        throw new Error('需要完整规则');
    return ast;
}
function checkedTheorem(rule, theorem) {
    return !!rule && !rule.error && !!rule.step?.length
        && parseHS(rule.toString(), 'rule').equal(parseHS(theorem.statement, 'rule'));
}
function axiom(id, text) {
    const name = parseHS(id, 'dname');
    if (name.type !== NodeType.ATOM_DNAME || name.name === '#')
        throw new Error('地图公理需要原子规则名');
    const rule = parseHS(text, 'rule');
    const assertions = rule.nodes.filter(n => n.type === NodeType.ASSERT).map(n => AtomSolver.fromAST(n));
    const statements = rule.nodes.filter(n => n.type !== NodeType.ASSERT);
    const conclusion = statements.pop();
    if (!conclusion)
        throw new Error('地图公理缺少结论');
    statements.forEach(n => n.checkWFF());
    conclusion.checkWFF();
    return new Deduction(new Set(), name, assertions, statements, conclusion);
}
function glob(pattern) {
    if (!pattern || pattern.length > 256)
        throw new Error('规则名模式过长或为空');
    // Legacy ^a.*x$ spelling is a glob, never evaluated as user regex.
    let p = pattern.replace(/^\^/, '').replace(/\$$/, '').replace(/\.\*/g, '*');
    if (/[\[\](){}|+\\^$]/.test(p))
        throw new Error('规则名仅支持 * 通配符');
    const parts = p.split('*');
    return name => {
        let offset = 0;
        if (!name.startsWith(parts[0]))
            return false;
        offset = parts[0].length;
        for (let i = 1; i < parts.length - 1; i++) {
            const at = name.indexOf(parts[i], offset);
            if (at < 0)
                return false;
            offset = at + parts[i].length;
        }
        return parts.length === 1 ? name === p : name.slice(offset).endsWith(parts[parts.length - 1]);
    };
}
function dependencies(line) {
    const deps = new Set();
    const dn = (ast) => {
        if (ast.type === NodeType.ATOM_DNAME) {
            if (ast.name !== '#')
                deps.add(ast.name);
            return;
        }
        if (['c', '>', '<'].includes(ast.name))
            ['mp', 'a1', 'a2'].forEach(n => deps.add(n));
        if (ast.name === 'v' || ast.name === 'u')
            ['a4', 'a5'].forEach(n => deps.add(n));
        if (ast.name === 'u')
            deps.add('a6');
        ast.nodes.forEach(dn);
    };
    const cmd = (text, generated = false) => {
        const ast = parser.parse(text, 'cmd');
        if (ast.name === 'd')
            dn(ast.nodes[0]);
        else if (ast.name === 'cond')
            ['mp', 'a1', 'a2'].forEach(n => deps.add(n));
        else if (ast.name === 'var')
            ['a4', 'a5'].forEach(n => deps.add(n));
        else if (ast.name === 'mcpt' && !generated) {
            const prover = new MCPT(ast.nodes[0]);
            if (prover.genAtomWff().atoms.length > 8)
                throw new Error('内置规则证明超过预算');
            const steps = prover.check(true);
            if (!steps || steps.length > 65536)
                throw new Error('内置规则证明超过预算');
            steps.forEach(s => cmd(s, true));
        }
        else if (!['hyp', 'cd', 'pop', 'dir', 'name'].includes(ast.name))
            throw new Error('不支持的内置证明步骤');
    };
    line.split(';').slice(1).filter(s => s.trim()).forEach(s => cmd(s));
    return deps;
}
function contentCatalog(content) {
    const result = new Map(catalog);
    for (const collection of content)
        for (const line of worldContentLines(collection)) {
            const id = line.slice(0, line.indexOf(':'));
            result.set(id, result.has(id) ? null : line);
        }
    return result;
}
function catalogLine(collection, id) {
    const line = collection.get(id);
    if (line === null)
        throw Error('地图内容规则名冲突：' + id);
    return line;
}
function stageHS(hs, state, content = []) {
    const localCatalog = contentCatalog(content);
    const customNames = new Set(content.flatMap(c => [...c.rules.map(rule => rule.id), ...c.definitions.map(rule => rule.id)]));
    const view = hs.createMapScriptSnapshot();
    view.replaceMapScriptRules(new Map());
    const core = view.getMapScriptSystem();
    // Rewards earlier in the same plan have not reached the live HS layer yet.
    const earned = getSurvivalRules(new Set(state.rewards), core.rules, core.renamedSysRule);
    if (earned)
        view.addRules(earned);
    const rules = new Map();
    const active = new Set();
    const requested = new Set(state.engine.rules);
    const actualName = (id) => core.renamedSysRule.get(id) ?? id;
    const renamedLine = (line, actual) => {
        const [header, ...commands] = line.split(';');
        const rename = (ast) => {
            if (ast.type === NodeType.ATOM_DNAME && ast.name !== '#')
                ast.name = actualName(ast.name);
            else
                ast.nodes.forEach(rename);
        };
        return actual + header.slice(header.indexOf(':')) + ';' + commands.map(text => {
            if (!text.trim())
                return text;
            const cmd = parser.parse(text, 'cmd');
            if (cmd.name !== 'd')
                return text;
            const name = cmd.nodes[0];
            rename(name);
            return text.slice(0, name.start) + name.toString() + text.slice(name.end);
        }).join(';');
    };
    const visit = (id) => {
        const line = catalogLine(localCatalog, id);
        if (!line)
            throw new Error('未知内置规则：' + id);
        const actual = actualName(id);
        const existing = core.rules.get(actual);
        if (existing) {
            if (rules.has(actual))
                return;
            if (customNames.has(id))
                throw new Error('地图内容规则名称已被占用：' + actual);
            const header = line.slice(line.indexOf(':') + 1).split(';')[0].replace(/^ax:/, '');
            if (existing.error || !parseHS(existing.toString(), 'rule').equal(parseHS(header, 'rule')))
                throw new Error('内置规则名称已被占用：' + actual);
            return;
        }
        if (active.has(id))
            throw new Error('内置规则依赖循环：' + id);
        if (line.startsWith(id + ':ax:') && !requested.has(id))
            throw new Error('尚未获得必需公理：' + id);
        active.add(id);
        const definition = content.flatMap(c => c.definitions).find(d => d.id === id);
        if (definition)
            definitionLine(definition, core.rules);
        dependencies(line).forEach(visit);
        view.addRules(renamedLine(line, actual));
        const rule = core.rules.get(actual);
        if (!rule || rule.error)
            throw new Error('无法重放内置规则：' + id);
        const theorem = content.flatMap(c => c.rules).find(r => r.id === id);
        if (theorem && !checkedTheorem(rule, theorem))
            throw new Error('地图定理证明无效：' + id);
        rules.set(actual, rule);
        active.delete(id);
    };
    for (const id of requested)
        visit(id);
    for (const [id, text] of Object.entries(state.engine.axioms)) {
        if (core.rules.has(id))
            throw new Error('地图公理名称已被占用：' + id);
        const rule = axiom(id, text);
        rules.set(id, rule);
        core.rules.set(id, rule);
    }
    view.setMapDisabledAxioms(state.disabledAxioms);
    view.replayMapScriptSheets();
    return { view, rules };
}
/** All layer access is deferred: Game construction and empty restore also work with stubs. */
export function createMapScriptEngine(hs, tt, content = []) {
    const validate = (request) => {
        if ('kind' in request) {
            if (request.kind === 'proof' || request.kind === 'rule') {
                parseHS(request.text, request.kind === 'proof' ? 'wff' : 'rule');
                if (request.allowedTags !== undefined && !validProofTags(request.allowedTags))
                    throw new Error('Invalid proof source tags');
            }
            else if (request.kind === 'type')
                validateMapTypeQuery(request.text);
            else if (request.kind === 'rule-name')
                glob(request.pattern);
            else if (request.kind === 'rule-present') {
                parseHS(request.id, 'dname');
                catalogLine(contentCatalog(content), request.id);
            }
            else if ('id' in request)
                validateMapTypeId(request.id);
        }
        else if (request.op === 'unlock-rule') {
            if (!catalogLine(contentCatalog(content), request.id))
                throw new Error('未知地图或内置规则：' + request.id);
        }
        else if (request.op === 'add-axiom')
            axiom(request.id, request.text);
        else if (request.op === 'remove-axiom')
            parseHS(request.id, 'dname');
        else
            validateMapTypeId(request.id);
    };
    const stage = (state) => {
        const hsChanged = !!(state.engine.rules.length || Object.keys(state.engine.axioms).length || hs.getMapScriptRuleNames?.().length);
        const ttChanged = !!(state.engine.types.length || state.engine.disabledTypes.length || ttApplied.has(tt));
        return {
            hs: hsChanged ? stageHS(hs, state, content) : undefined,
            tt: ttChanged ? tt.getGui().createMapScriptSnapshot(state.engine.types, state.engine.disabledTypes) : undefined,
        };
    };
    return {
        validate,
        validateState(state) { stage(state); },
        query(request, state) {
            validate(request);
            if (request.kind === 'type' || request.kind === 'type-present') {
                const view = tt.getGui().createMapScriptSnapshot(state.engine.types, state.engine.disabledTypes);
                return 'text' in request ? view.checkMapScriptType(request.text) : view.hasMapScriptType(request.id);
            }
            const { view } = stageHS(hs, state, content);
            if (request.kind === 'proof')
                return view.checkPropGate(parseHS(request.text, 'wff'), request.allowedTags);
            if (request.kind === 'rule')
                return view.checkRuleGate(parseHS(request.text, 'rule'), request.allowedTags);
            const rules = view.getMapScriptSystem().rules;
            const id = 'id' in request ? request.id : '';
            const matches = request.kind === 'rule-name' ? glob(request.pattern) : (name) => name === id;
            return [...rules].some(([name, rule]) => matches(name) && view.isMapScriptRuleAllowed(rule));
        },
        restore(state) {
            const staged = stage(state);
            if (staged.hs)
                hs.replaceMapScriptRules(staged.hs.rules);
            if (state.disabledAxioms.length || hsPolicyApplied.has(hs)) {
                hs.setMapDisabledAxioms(state.disabledAxioms);
                if (state.disabledAxioms.length)
                    hsPolicyApplied.add(hs);
                else
                    hsPolicyApplied.delete(hs);
            }
            if (staged.tt) {
                tt.getGui().applyMapScriptSnapshot(staged.tt);
                if (state.engine.types.length || state.engine.disabledTypes.length)
                    ttApplied.add(tt);
                else
                    ttApplied.delete(tt);
            }
        },
    };
}
const hsPolicyApplied = new WeakSet();
const ttApplied = new WeakSet();
//# sourceMappingURL=script-engine.js.map