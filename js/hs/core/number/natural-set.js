/** Natural-set proofs replayed by HSLayer, rather than promoted to axioms.
 * The .pn proofs use only logic, ZFC and the definition of omega.
 * The arithmetic bridges additionally use the checked PA and set bridges.
 */
const mem = (a, b) => `${a}∈${b}`;
const eq = (a, b) => `${a}=${b}`;
const imp = (a, b) => `(${a}→${b})`;
const and = (a, b) => `(${a}∧${b})`;
const not = (a) => `¬(${a})`;
const all = (a, b) => `∀${a}:(${b})`;
const successor = (a) => `(${a}∪{${a}})`;
const inductive = (a) => and(mem('{}', a), all('y', imp(mem('y', a), mem(successor('y'), a))));
const natural = (a) => mem(a, 'ℕ');
const plus = (a, b) => `(${a}+${b})`;
const orderRelation = '{x∈ℕ×ℕ|pr1(x)≤pr2(x)}';
const rel = (a, b) => `Rel(${a},${orderRelation},${b})`;
class Proof {
    commands = [];
    next = 0;
    witness = 0;
    step(rule, ...args) {
        this.commands.push(`${rule === 'mcpt' ? 'mcpt' : `d ${rule}`} ${args.join(' ')}`.trimEnd());
        return ++this.next;
    }
    variable(x) { this.commands.push(`var ${x}`); ++this.next; }
    cond(p) { this.commands.push(`cond ${p}`); return ++this.next; }
    pop() { this.commands.push('pop'); }
    root() { this.commands.push('cd 0'); }
    mp(p, q) { return this.step('mp', p, q); }
    spec(p, ...xs) {
        for (const x of xs)
            p = this.step('<a4', p, x);
        return p;
    }
    forward(e, p) { return this.mp(this.step('<.<>1', e), p); }
    backward(e, p) { return this.mp(this.step('<.<>2', e), p); }
    use(rule, terms, ...premises) {
        let p = this.step(rule, ...terms);
        for (const q of premises)
            p = this.mp(p, q);
        return p;
    }
    cases(a, b, target, left, right, either) {
        return this.use('.setCases', [a, target, b], left, right, either);
    }
    exists(x, predicate, witness, proof) {
        return this.mp(this.step('.setEi', predicate, x, witness), proof);
    }
    rewrite(e, a, b, p, template) {
        return this.mp(this.mp(this.step('a8', a, b, template, '#'), e), p);
    }
    nonempty(a, b, member) {
        const empty = this.cond(eq(b, '{}'));
        const contradiction = this.rewrite(empty, b, '{}', member, mem(a, '#'));
        this.pop();
        return this.mp(this.step('<.a30', contradiction), this.spec(this.step('d{}'), a));
    }
    existsElim(x, predicate, goal, proof, branch) {
        const negativeGoal = this.cond(not(goal));
        const w = `#nsw${this.witness++}`;
        this.variable(w);
        const premise = this.cond(predicate(w));
        const result = branch(w, premise);
        this.pop();
        const negativePredicate = this.mp(this.step('<.a30', result), negativeGoal);
        this.pop();
        this.variable(x);
        const generalized = this.spec(negativePredicate, x);
        this.pop();
        this.pop();
        const notAll = this.forward(this.step('d\\e', x, predicate(x)), proof);
        return this.mp(this.step('<.a31', generalized), notAll);
    }
    induction(x, predicate, base, step) {
        const b = base();
        this.variable(x);
        const nx = this.cond(natural(x)), ih = this.cond(predicate(x));
        const s = step(nx, ih);
        this.pop();
        this.pop();
        this.pop();
        return this.mp(this.mp(this.step('apn5', predicate(x), x), b), s);
    }
    successorMembership(a, b, member) {
        const disjunction = member === undefined
            ? this.step('.\\/2', this.backward(this.step('d{.}', a, a), this.step('a7', a)), mem(a, b))
            : this.step('.\\/1', member, mem(a, `{${b}}`));
        return this.backward(this.step('d\\u', a, b, `{${b}}`), disjunction);
    }
    inS(a, b, member) {
        return this.rewrite(this.step('.=s', this.step('dS', b)), successor(b), `S(${b})`, this.successorMembership(a, b, member), mem(a, '#'));
    }
    /** Rename the bound variables before substituting a set containing an
     * arbitrary schematic predicate (which may itself contain x or y).
     */
    omegaApply(n, hn, candidate, base, closure) {
        const omega = this.forward(this.spec(this.step('d\\o'), n), hn);
        this.variable('#nsA');
        const h = this.cond(and(mem('{}', '#nsA'), all('#nsY', imp(mem('#nsY', '#nsA'), mem(successor('#nsY'), '#nsA')))));
        const renamed = this.step('.\\acn', this.step('./\\2', h), 'y');
        const incoming = this.step('./\\', this.step('./\\1', h), renamed);
        const result = this.mp(this.spec(omega, '#nsA'), incoming);
        this.pop();
        this.pop();
        return this.mp(this.spec(result, candidate), this.step('./\\', base, closure));
    }
    leNext(x, nx) {
        const nz = this.step('apn1'), n1 = this.mp(this.spec(this.step('apn2'), '0'), nz);
        const one = this.step('d1');
        const oneNatural = this.rewrite(this.step('.=s', one), 'S(0)', '1', n1, natural('#'));
        const sumZero = this.use('d+1', [x], nx);
        const sumSuccessor = this.use('d+2', [x, '0'], nx, nz);
        const equality = this.rewrite(sumZero, plus(x, '0'), x, sumSuccessor, eq(plus(x, 'S(0)'), 'S(#)'));
        const oneSum = this.rewrite(this.step('.=s', one), 'S(0)', '1', equality, eq(plus(x, '#'), `S(${x})`));
        return this.rewrite(oneSum, plus(x, '1'), `S(${x})`, this.use('.<=+', [x, '1'], nx, oneNatural), `${x}≤#`);
    }
    relIntro(a, b, na, nb, le) {
        return this.forward(this.step('.<=Rel', a, b), this.step('./\\', this.step('./\\', na, nb), le));
    }
    relOrder(a, b, h) {
        return this.step('./\\2', this.backward(this.step('.<=Rel', a, b), h));
    }
}
const rules = [];
function closed(name, variables, statement, body) {
    const p = new Proof();
    const locals = variables.map((_, i) => `#ns${i}`);
    locals.forEach(x => p.variable(x));
    let result = body(p, ...locals);
    p.root();
    variables.forEach(x => p.variable(x));
    result = p.spec(result, ...variables);
    p.root();
    // Referencing across a closed scope constructs its checked quantifiers.
    p.mp(p.step('.i', statement), result);
    rules.push(`${name}:⊢${statement};${p.commands.join(';')};`);
}
function schema(name, parameters, statement, body) {
    const p = new Proof(), locals = parameters.map((_, i) => `#ns${i}`);
    locals.forEach(x => p.variable(x));
    const result = body(p, ...locals);
    p.root();
    p.spec(result, ...parameters);
    rules.push(`${name}:⊢${statement(...parameters)};${p.commands.join(';')};`);
}
closed('.pn1', [], mem('{}', 'ω'), p => {
    p.variable('x');
    const h = p.cond(inductive('x'));
    const base = p.step('./\\1', h);
    p.root();
    return p.backward(p.spec(p.step('d\\o'), '{}'), base);
});
closed('.pn2', ['n'], all('n', imp(mem('n', 'ω'), mem(successor('n'), 'ω'))), (p, n) => {
    const hn = p.cond(mem(n, 'ω'));
    const omega = p.forward(p.spec(p.step('d\\o'), n), hn);
    p.variable('x');
    const h = p.cond(inductive('x'));
    const nx = p.mp(p.spec(omega, 'x'), h);
    const snx = p.mp(p.spec(p.step('./\\2', h), n), nx);
    p.pop();
    p.pop();
    return p.backward(p.spec(p.step('d\\o'), successor(n)), snx);
});
closed('.pn3', ['x'], all('x', not(eq(successor('x'), '{}'))), (p, x) => p.nonempty(x, successor(x), p.successorMembership(x, x)));
closed('.pn4', ['x', 'y'], all('x', all('y', imp(eq(successor('x'), successor('y')), eq('x', 'y')))), (p, x, y) => {
    const equal = p.cond(eq(successor(x), successor(y)));
    const goal = eq(x, y), pair = `{${x},${y}}`;
    // If the successors coincide and x != y, each belongs to the other.
    const unequal = p.cond(not(goal));
    const yInXSuccessor = p.rewrite(p.step('.=s', equal), successor(y), successor(x), p.successorMembership(y, y), mem(y, '#'));
    const xInYSuccessor = p.rewrite(equal, successor(x), successor(y), p.successorMembership(x, x), mem(x, '#'));
    const difference = (a, b, incoming, distinct) => {
        const disj = p.forward(p.step('d\\u', a, b, `{${b}}`), incoming);
        const h = p.cond(mem(a, `{${b}}`));
        const same = p.forward(p.step('d{.}', a, b), h);
        p.pop();
        const absent = p.mp(p.step('<.a30', same), distinct);
        return p.mp(p.mp(p.step('mcpt', imp(`(${mem(a, b)}∨${mem(a, `{${b}}`)})`, imp(not(mem(a, `{${b}}`)), mem(a, b)))), disj), absent);
    };
    const yx = difference(y, x, yInXSuccessor, p.mp(p.step('<.a30', p.step('>.=s', y, x)), unequal));
    const xy = difference(x, y, xInYSuccessor, unequal);
    const nonemptyIntersection = (a, b, h) => {
        const other = p.backward(p.step('d{..}', b, x, y), p.step(a === x ? '.\\/2' : '.\\/1', p.step('a7', b), a === x ? eq(b, x) : eq(b, y)));
        return p.nonempty(b, `(${a}∩${pair})`, p.backward(p.step('d\\i', b, a, pair), p.step('./\\', h, other)));
    };
    const notEmptyX = nonemptyIntersection(x, y, yx);
    const notEmptyY = nonemptyIntersection(y, x, xy);
    const pairNonempty = p.nonempty(x, pair, p.backward(p.step('d{..}', x, x, y), p.step('.\\/1', p.step('a7', x), eq(x, y))));
    const regularity = p.mp(p.spec(p.step('areg'), pair), pairNonempty);
    const impossible = p.existsElim('y', z => and(mem(z, pair), eq(`(${z}∩${pair})`, '{}')), goal, regularity, (w, h) => {
        const which = p.forward(p.step('d{..}', w, x, y), p.step('./\\1', h));
        const empty = p.step('./\\2', h);
        const hx = p.cond(eq(w, x));
        const nx = p.rewrite(p.step('.=s', hx), x, w, notEmptyX, not(eq(`(#∩${pair})`, '{}')));
        p.pop();
        const hy = p.cond(eq(w, y));
        const ny = p.rewrite(p.step('.=s', hy), y, w, notEmptyY, not(eq(`(#∩${pair})`, '{}')));
        p.pop();
        const target = not(eq(`(${w}∩${pair})`, '{}'));
        const negative = p.mp(p.mp(p.mp(p.step('mcpt', imp(imp(eq(w, x), target), imp(imp(eq(w, y), target), imp(`(${eq(w, x)}∨${eq(w, y)})`, target)))), nx), ny), which);
        return p.mp(p.mp(p.step('.m', eq(`(${w}∩${pair})`, '{}'), goal), negative), empty);
    });
    p.pop();
    // Classical case elimination discharges the temporary inequality.
    const yes = p.cond(goal);
    const same = p.mp(p.step('.i', goal), yes);
    p.pop();
    return p.step('.m2', same, impossible);
});
{
    const p = new Proof();
    const predicate = '$P', n = '$n', subset = `{${n}∈ω|${predicate}}`;
    const sb = (term) => `#sb(${predicate},${n},${term})`;
    const statement = imp(sb('{}'), imp(all(n, imp(mem(n, 'ω'), imp(predicate, sb(successor(n))))), all(n, imp(mem(n, 'ω'), predicate))));
    const base = p.cond(sb('{}'));
    const step = p.cond(all(n, imp(mem(n, 'ω'), imp(predicate, sb(successor(n))))));
    p.variable(n);
    const separationBody = p.step('dsep', n, 'ω', predicate);
    p.pop();
    const separation = p.mp(p.step('.i', all(n, `(${mem(n, subset)}↔${and(mem(n, 'ω'), predicate)})`)), separationBody);
    const zeroInSubset = p.backward(p.spec(separation, '{}'), p.step('./\\', p.step('.pn1'), base));
    // Prove closure at the schema's own binder. Specializing its induction
    // hypothesis at that same binder avoids composing two symbolic #sb nodes.
    p.variable(n);
    const member = p.cond(mem(n, subset));
    const pieces = p.forward(p.spec(separation, n), member);
    const inOmega = p.step('./\\1', pieces), property = p.step('./\\2', pieces);
    const nextProperty = p.mp(p.mp(p.spec(step, n), inOmega), property);
    const nextInOmega = p.mp(p.spec(p.step('.pn2'), n), inOmega);
    const closureAtN = p.backward(p.spec(separation, successor(n)), p.step('./\\', nextInOmega, nextProperty));
    p.pop();
    p.pop();
    const closure = p.step('.\\acn', closureAtN, '#nsY');
    p.variable('#nsT');
    const hn = p.cond(mem('#nsT', 'ω'));
    const result = p.step('./\\2', p.forward(p.spec(separation, '#nsT'), p.omegaApply('#nsT', hn, subset, zeroInSubset, closure)));
    p.pop();
    p.pop();
    p.step('.\\acn', result, n);
    rules.push(`.pn5:⊢${statement};${p.commands.join(';')};`);
}
schema('.N@+', ['$x', '$y'], (x, y) => imp(natural(x), imp(natural(y), mem(x, plus(x, `S(${y})`)))), (p, x, y) => {
    const nx = p.cond(natural(x)), ny = p.cond(natural(y));
    const predicate = (n) => mem(x, plus(x, `S(${n})`));
    const induction = p.induction('#nsK', predicate, () => {
        const sx = p.inS(x, x);
        const plusZero = p.use('d+1', [x], nx);
        const sum = p.rewrite(p.step('.=s', plusZero), x, plus(x, '0'), sx, mem(x, 'S(#)'));
        return p.rewrite(p.step('.=s', p.use('d+2', [x, '0'], nx, p.step('apn1'))), `S(${plus(x, '0')})`, plus(x, 'S(0)'), sum, mem(x, '#'));
    }, (nk, ih) => {
        const k = '#nsK', sk = `S(${k})`, nsk = p.mp(p.spec(p.step('apn2'), k), nk);
        return p.rewrite(p.step('.=s', p.use('d+2', [x, sk], nx, nsk)), `S(${plus(x, sk)})`, plus(x, `S(${sk})`), p.inS(x, plus(x, sk), ih), mem(x, '#'));
    });
    return p.mp(p.spec(induction, y), ny);
});
schema('.N@<=', ['$x', '$y'], (x, y) => imp(natural(x), imp(mem(y, x), `${y}≤${x}`)), (p, x, y) => {
    const predicate = (n) => all('#nsV', imp(mem('#nsV', n), `#nsV≤${n}`));
    const induction = p.induction('#nsK', predicate, () => {
        p.variable('#nsV');
        const empty = p.spec(p.step('d{}'), '#nsV');
        const notZero = p.rewrite(p.step('.=s', p.step('d0')), '{}', '0', empty, not(mem('#nsV', '#')));
        const result = p.mp(p.step('.m', mem('#nsV', '0'), '#nsV≤0'), notZero);
        p.pop();
        return result;
    }, (nk, ih) => {
        const k = '#nsK', v = '#nsV', sk = `S(${k})`;
        const nsk = p.mp(p.spec(p.step('apn2'), k), nk), next = p.leNext(k, nk);
        p.variable(v);
        const h = p.cond(mem(v, sk));
        const either = p.forward(p.step('d\\u', v, k, `{${k}}`), p.rewrite(p.step('dS', k), sk, successor(k), h, mem(v, '#')));
        const left = p.cond(mem(v, k));
        const nv = p.use('.setNt', [k, v], nk, left), vk = p.mp(p.spec(ih, v), left);
        const first = p.step('.<=t', nv, nk, nsk, vk, next);
        p.pop();
        const right = p.cond(mem(v, `{${k}}`));
        const same = p.forward(p.step('d{.}', v, k), right);
        const second = p.rewrite(p.step('.=s', same), k, v, next, `#≤${sk}`);
        p.pop();
        const result = p.cases(mem(v, k), mem(v, `{${k}}`), `${v}≤${sk}`, first, second, either);
        p.pop();
        p.pop();
        return result;
    });
    const nx = p.cond(natural(x)), h = p.cond(mem(y, x));
    return p.mp(p.spec(p.mp(p.spec(induction, x), nx), y), h);
});
schema('.<=Rel', ['$x', '$y'], (x, y) => `(${and(and(natural(x), natural(y)), `${x}≤${y}`)}↔${rel(x, y)})`, (p, x, y) => {
    const pair = `(${x},${y})`, first = `pr1(${pair})`, second = `pr2(${pair})`;
    p.variable('x');
    const separation = p.step('dsep', 'x', '(ℕ×ℕ)', 'pr1(x)≤pr2(x)');
    p.pop();
    const projections = [p.step('.Pr1', x, y), p.step('.Pr2', x, y)];
    const definition = p.spec(p.step('dRel'), x, y, orderRelation);
    const left = p.cond(and(and(natural(x), natural(y)), `${x}≤${y}`));
    const naturals = p.step('./\\1', left), le = p.step('./\\2', left);
    const product = p.step('.Xi', p.step('./\\1', naturals), p.step('./\\2', naturals));
    const projected = p.rewrite(p.step('.=s', projections[1]), y, second, p.rewrite(p.step('.=s', projections[0]), x, first, le, `#≤${y}`), `${first}≤#`);
    const pairInRelation = p.backward(p.spec(separation, pair), p.step('./\\', product, projected));
    const witness = p.exists('f', and(mem('f', orderRelation), eq('f', pair)), pair, p.step('./\\', pairInRelation, p.step('a7', pair)));
    const forward = p.backward(definition, witness);
    p.pop();
    const right = p.cond(rel(x, y));
    const backward = p.existsElim('f', f => and(mem(f, orderRelation), eq(f, pair)), and(and(natural(x), natural(y)), `${x}≤${y}`), p.forward(definition, right), (f, h) => {
        const member = p.rewrite(p.step('./\\2', h), f, pair, p.step('./\\1', h), mem('#', orderRelation));
        const pieces = p.forward(p.spec(separation, pair), member);
        const values = p.step('.Xe', p.step('./\\1', pieces));
        const nx = p.rewrite(projections[0], first, x, p.step('./\\1', values), natural('#'));
        const ny = p.rewrite(projections[1], second, y, p.step('./\\2', values), natural('#'));
        const inequality = p.rewrite(projections[1], second, y, p.rewrite(projections[0], first, x, p.step('./\\2', pieces), `#≤${second}`), `${x}≤#`);
        return p.step('./\\', p.step('./\\', nx, ny), inequality);
    });
    p.pop();
    return p.step('.<>', forward, backward);
});
closed('.<=Order', [], `Order(ℕ,${orderRelation})`, p => {
    p.variable('a');
    p.variable('b');
    const hab = p.cond(and(natural('a'), natural('b')));
    const na = p.step('./\\1', hab), nb = p.step('./\\2', hab);
    const comparable = p.use('.<=|>=', ['a', 'b'], na, nb);
    const ab = p.cond('a≤b');
    const forward = p.step('.\\/1', p.relIntro('a', 'b', na, nb, ab), rel('b', 'a'));
    p.pop();
    const ba = p.cond('b≤a');
    const reverse = p.step('.\\/2', p.relIntro('b', 'a', nb, na, ba), rel('a', 'b'));
    p.pop();
    const either = p.cases('a≤b', 'b≤a', `(${rel('a', 'b')}∨${rel('b', 'a')})`, forward, reverse, comparable);
    const both = p.cond(and(rel('a', 'b'), rel('b', 'a')));
    const same = p.use('.<=s', ['a', 'b'], na, nb, p.relOrder('a', 'b', p.step('./\\1', both)), p.relOrder('b', 'a', p.step('./\\2', both)));
    p.pop();
    const equal = p.cond('a=b');
    const reflexive = p.relIntro('a', 'a', na, na, p.use('.<=i', ['a'], na));
    const bothRelations = p.step('./\\', p.rewrite(equal, 'a', 'b', reflexive, rel('a', '#')), p.rewrite(equal, 'a', 'b', reflexive, rel('#', 'a')));
    p.pop();
    const firstClause = p.step('./\\', either, p.step('.<>', same, bothRelations));
    p.pop();
    p.pop();
    p.pop();
    p.variable('a');
    p.variable('b');
    p.variable('c');
    const habc = p.cond(and(and(natural('a'), natural('b')), natural('c')));
    const nab = p.step('./\\1', habc), na2 = p.step('./\\1', nab), nb2 = p.step('./\\2', nab), nc = p.step('./\\2', habc);
    const chain = p.cond(and(rel('a', 'b'), rel('b', 'c')));
    const transitive = p.step('.<=t', na2, nb2, nc, p.relOrder('a', 'b', p.step('./\\1', chain)), p.relOrder('b', 'c', p.step('./\\2', chain)));
    const secondClause = p.relIntro('a', 'c', na2, nc, transitive);
    p.root();
    return p.backward(p.spec(p.step('dOrder'), 'ℕ', orderRelation), p.step('./\\', firstClause, secondClause));
});
/** Definitions for ternary Rel(a,r,b) and Order(A,r) must precede their
 * historical order theorems. NBG's unary Rel(r) is a different predicate.
 */
export const naturalSetTheorems = rules.join('\n');
//# sourceMappingURL=natural-set.js.map