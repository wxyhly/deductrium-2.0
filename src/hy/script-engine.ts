import type { HSLayer } from '../hs/main.js';
import type { TTLayer } from '../tt/main.js';
import type { MapScriptEngineEdit, MapScriptEngineQuery, MapScriptState } from './script.js';
import { HSParser } from '../hs/core/parser.js';
import { NodeType } from '../asttype.js';
import { AST } from '../hs/core/ast.js';
import { Deduction } from '../hs/core/deduction.js';
import { AtomSolver } from '../hs/core/assert.js';
import { initialCreativeRules } from '../hs/core/initial.js';
import { MCPT } from '../hs/core/combine.js';
import { getSurvivalRules } from '../hs/rewards.js';
import { validateMapTypeId, validateMapTypeQuery } from '../tt/gui.js';

const parser = new HSParser();
const catalog = new Map(initialCreativeRules.split('\n').map(s => s.trim())
    .filter(s => s && !s.startsWith('//') && !s.startsWith('{') && !s.startsWith('}'))
    .map(s => [s.slice(0, s.indexOf(':')), s]));

function parseHS(text: string, mode: 'wff' | 'rule' | 'dname'): AST {
    const ast = parser.parse(text, mode);
    if (!ast || ast.end !== text.trimEnd().length) throw new Error('地图逻辑表达式不完整：' + text);
    if (mode === 'wff') ast.checkWFF();
    if (mode === 'rule' && ast.type !== NodeType.RULE) throw new Error('需要完整规则');
    return ast;
}
function axiom(id: string, text: string): Deduction {
    const name = parseHS(id, 'dname');
    if (name.type !== NodeType.ATOM_DNAME || name.name === '#') throw new Error('地图公理需要原子规则名');
    const rule = parseHS(text, 'rule');
    const assertions = rule.nodes.filter(n => n.type === NodeType.ASSERT).map(n => AtomSolver.fromAST(n));
    const statements = rule.nodes.filter(n => n.type !== NodeType.ASSERT);
    const conclusion = statements.pop();
    if (!conclusion) throw new Error('地图公理缺少结论');
    statements.forEach(n => n.checkWFF()); conclusion.checkWFF();
    return new Deduction(new Set(), name, assertions, statements, conclusion);
}
function glob(pattern: string): (name: string) => boolean {
    if (!pattern || pattern.length > 256) throw new Error('规则名模式过长或为空');
    // Legacy ^a.*x$ spelling is a glob, never evaluated as user regex.
    let p = pattern.replace(/^\^/, '').replace(/\$$/, '').replace(/\.\*/g, '*');
    if (/[\[\](){}|+\\^$]/.test(p)) throw new Error('规则名仅支持 * 通配符');
    const parts = p.split('*');
    return name => {
        let offset = 0;
        if (!name.startsWith(parts[0])) return false;
        offset = parts[0].length;
        for (let i = 1; i < parts.length - 1; i++) {
            const at = name.indexOf(parts[i], offset);
            if (at < 0) return false;
            offset = at + parts[i].length;
        }
        return parts.length === 1 ? name === p : name.slice(offset).endsWith(parts[parts.length - 1]);
    };
}
function dependencies(line: string): Set<string> {
    const deps = new Set<string>();
    const dn = (ast: AST) => {
        if (ast.type === NodeType.ATOM_DNAME) { if (ast.name !== '#') deps.add(ast.name); return; }
        if (['c', '>', '<'].includes(ast.name)) ['mp', 'a1', 'a2'].forEach(n => deps.add(n));
        if (ast.name === 'v' || ast.name === 'u') ['a4', 'a5'].forEach(n => deps.add(n));
        if (ast.name === 'u') deps.add('a6');
        ast.nodes.forEach(dn);
    };
    const cmd = (text: string, generated = false) => {
        const ast = parser.parse(text, 'cmd');
        if (ast.name === 'd') dn(ast.nodes[0]);
        else if (ast.name === 'cond') ['mp', 'a1', 'a2'].forEach(n => deps.add(n));
        else if (ast.name === 'var') ['a4', 'a5'].forEach(n => deps.add(n));
        else if (ast.name === 'mcpt' && !generated) {
            const prover = new MCPT(ast.nodes[0]);
            if (prover.genAtomWff().atoms.length > 8) throw new Error('内置规则证明超过预算');
            const steps = prover.check(true);
            if (!steps || steps.length > 65536) throw new Error('内置规则证明超过预算');
            steps.forEach(s => cmd(s, true));
        } else if (!['hyp', 'cd', 'pop', 'dir', 'name'].includes(ast.name)) throw new Error('不支持的内置证明步骤');
    };
    line.split(';').slice(1).filter(s => s.trim()).forEach(s => cmd(s));
    return deps;
}

function stageHS(hs: HSLayer, state: MapScriptState): { view: HSLayer; rules: Map<string, Deduction> } {
    const view = hs.createMapScriptSnapshot();
    view.replaceMapScriptRules(new Map());
    const core = view.getMapScriptSystem();
    // Rewards earlier in the same plan have not reached the live HS layer yet.
    const earned = getSurvivalRules(new Set(state.rewards), core.rules, core.renamedSysRule);
    if (earned) view.addRules(earned);
    const rules = new Map<string, Deduction>();
    const active = new Set<string>();
    const requested = new Set(state.engine.rules);
    const actualName = (id: string) => core.renamedSysRule.get(id) ?? id;
    const renamedLine = (line: string, actual: string) => {
        const [header, ...commands] = line.split(';');
        const rename = (ast: AST): void => {
            if (ast.type === NodeType.ATOM_DNAME && ast.name !== '#') ast.name = actualName(ast.name);
            else ast.nodes.forEach(rename);
        };
        return actual + header.slice(header.indexOf(':')) + ';' + commands.map(text => {
            if (!text.trim()) return text;
            const cmd = parser.parse(text, 'cmd');
            if (cmd.name !== 'd') return text;
            const name = cmd.nodes[0];
            rename(name);
            return text.slice(0, name.start) + name.toString() + text.slice(name.end);
        }).join(';');
    };
    const visit = (id: string) => {
        const line = catalog.get(id);
        if (!line) throw new Error('未知内置规则：' + id);
        const actual = actualName(id);
        const existing = core.rules.get(actual);
        if (existing) {
            const header = line.slice(line.indexOf(':') + 1).split(';')[0].replace(/^ax:/, '');
            if (existing.error || !parseHS(existing.toString(), 'rule').equal(parseHS(header, 'rule'))) throw new Error('内置规则名称已被占用：' + actual);
            return;
        }
        if (active.has(id)) throw new Error('内置规则依赖循环：' + id);
        if (line.startsWith(id + ':ax:') && !requested.has(id)) throw new Error('尚未获得必需公理：' + id);
        active.add(id);
        dependencies(line).forEach(visit);
        view.addRules(renamedLine(line, actual));
        const rule = core.rules.get(actual);
        if (!rule || rule.error) throw new Error('无法重放内置规则：' + id);
        rules.set(actual, rule);
        active.delete(id);
    };
    for (const id of requested) visit(id);
    for (const [id, text] of Object.entries(state.engine.axioms)) {
        if (core.rules.has(id)) throw new Error('地图公理名称已被占用：' + id);
        const rule = axiom(id, text);
        rules.set(id, rule); core.rules.set(id, rule);
    }
    view.setMapDisabledAxioms(state.disabledAxioms);
    view.replayMapScriptSheets();
    return { view, rules };
}

/** All layer access is deferred: Game construction and empty restore also work with stubs. */
export function createMapScriptEngine(hs: HSLayer, tt: TTLayer): {
    validate(request: MapScriptEngineQuery | MapScriptEngineEdit): void;
    validateState(state: MapScriptState): void;
    query(request: MapScriptEngineQuery, state: MapScriptState): boolean;
    restore(state: MapScriptState): void;
} {
    const validate = (request: MapScriptEngineQuery | MapScriptEngineEdit) => {
        if ('kind' in request) {
            if (request.kind === 'proof' || request.kind === 'rule') parseHS(request.text, request.kind === 'proof' ? 'wff' : 'rule');
            else if (request.kind === 'type') validateMapTypeQuery(request.text);
            else if (request.kind === 'rule-name') glob(request.pattern);
            else if (request.kind === 'rule-present') parseHS(request.id, 'dname');
            else if ('id' in request) validateMapTypeId(request.id);
        } else if (request.op === 'unlock-rule') {
            if (!catalog.has(request.id)) throw new Error('未知内置规则：' + request.id);
        } else if (request.op === 'add-axiom') axiom(request.id, request.text);
        else if (request.op === 'remove-axiom') parseHS(request.id, 'dname');
        else validateMapTypeId(request.id);
    };
    const stage = (state: MapScriptState) => {
        const hsChanged = !!(state.engine.rules.length || Object.keys(state.engine.axioms).length || hs.getMapScriptRuleNames?.().length);
        const ttChanged = !!(state.engine.types.length || state.engine.disabledTypes.length || ttApplied.has(tt));
        return {
            hs: hsChanged ? stageHS(hs, state) : undefined,
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
            const { view } = stageHS(hs, state);
            if (request.kind === 'proof') return view.checkPropGate(parseHS(request.text, 'wff'));
            if (request.kind === 'rule') return view.checkRuleGate(parseHS(request.text, 'rule'));
            const rules = view.getMapScriptSystem().rules;
            const id = 'id' in request ? request.id : '';
            const matches = request.kind === 'rule-name' ? glob(request.pattern) : (name: string) => name === id;
            return [...rules].some(([name, rule]) => matches(name) && view.isMapScriptRuleAllowed(rule));
        },
        restore(state) {
            const staged = stage(state);
            if (staged.hs) hs.replaceMapScriptRules(staged.hs.rules);
            if (state.disabledAxioms.length || hsPolicyApplied.has(hs)) {
                hs.setMapDisabledAxioms(state.disabledAxioms);
                if (state.disabledAxioms.length) hsPolicyApplied.add(hs); else hsPolicyApplied.delete(hs);
            }
            if (staged.tt) {
                tt.getGui().applyMapScriptSnapshot(staged.tt);
                if (state.engine.types.length || state.engine.disabledTypes.length) ttApplied.add(tt); else ttApplied.delete(tt);
            }
        },
    };
}
const hsPolicyApplied = new WeakSet<HSLayer>();
const ttApplied = new WeakSet<TTLayer>();
