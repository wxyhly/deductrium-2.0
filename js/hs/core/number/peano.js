const N = (x) => `${x}∈ℕ`;
const S = (x) => `S(${x})`;
const add = (x, y) => `(${x}+${y})`;
const mul = (x, y) => `(${x}*${y})`;
const imp = (x, y) => `(${x}→${y})`;
const eq = (x, y) => `${x}=${y}`;
const all = (x, p) => `∀${x}:(${p})`;
const ex = (x, p) => `∃${x}:(${p})`;
const and = (x, y) => `(${x}∧${y})`;
const not = (p) => `¬(${p})`;
const le = (x, y) => `${x}≤${y}`;
const or = (p, q) => `(${p}∨${q})`;
class Proof {
    next;
    commands = [];
    constructor(next = 0) {
        this.next = next;
    }
    witness = 0;
    step(rule, ...args) {
        this.commands.push(`d ${rule} ${args.join(' ')}`.trimEnd());
        return ++this.next;
    }
    cond(p) { this.commands.push(`cond ${p}`); return ++this.next; }
    variable(x) { this.commands.push(`var ${x}`); return ++this.next; }
    pop() { this.commands.push('pop'); }
    root() { this.commands.push('cd 0'); }
    mp(p, q) { return this.step('mp', p, q); }
    spec(p, ...terms) {
        for (const t of terms)
            p = this.step('<a4', p, t);
        return p;
    }
    use(rule, terms, ...premises) {
        let p = this.step(rule, ...terms);
        for (const q of premises)
            p = this.mp(p, q);
        return p;
    }
    refl(x) { return { id: this.step('a7', x), left: x, right: x }; }
    sym(p) { return { id: this.step('.=s', p.id), left: p.right, right: p.left }; }
    rewrite(p, q, template) {
        return this.mp(this.mp(this.step('a8', p.left, p.right, template, '#'), p.id), q);
    }
    trans(p, q) {
        if (p.right !== q.left)
            throw new Error(`PA equality chain: ${p.right} != ${q.left}`);
        return { id: this.rewrite(q, p.id, eq(p.left, '#')), left: p.left, right: q.right };
    }
    chain(...ps) { return ps.reduce((a, b) => this.trans(a, b)); }
    congr(p, context) {
        const a = context(p.left), b = context(p.right);
        return { id: this.rewrite(p, this.refl(a).id, eq(a, context('#'))), left: a, right: b };
    }
    equality(id, left, right) { return { id, left, right }; }
    zero() { return this.step('apn1'); }
    successor(n, x) { return this.mp(this.spec(this.step('apn2'), x), n); }
    plus0(x, nx) { return this.equality(this.use('d+1', [x], nx), add(x, '0'), x); }
    plusS(x, y, nx, ny) {
        return this.equality(this.use('d+2', [x, y], nx, ny), add(x, S(y)), S(add(x, y)));
    }
    times0(x, nx) { return this.equality(this.use('d*1', [x], nx), mul(x, '0'), '0'); }
    timesS(x, y, nx, ny) {
        return this.equality(this.use('d*2', [x, y], nx, ny), mul(x, S(y)), add(mul(x, y), x));
    }
    theoremEq(rule, terms, premises, left, right) {
        return this.equality(this.use(rule, terms, ...premises), left, right);
    }
    existsIntro(x, predicate, witness, proof) {
        const specialize = this.step('a4', x, not(predicate), witness);
        const negative = this.mp(this.step('<.a32', specialize), proof);
        return this.mp(this.step('<.<>2', this.step('d\\e', x, predicate)), negative);
    }
    /** Eliminate a witness in a fresh scope, using only a4, d\\e and classical logic. */
    existsElim(x, predicate, goal, proof, branch) {
        const negativeGoal = this.cond(not(goal));
        const w = `#w${this.witness++}`;
        this.variable(w);
        const premise = this.cond(predicate(w));
        const q = branch(w, premise);
        this.pop();
        const negativePredicate = this.mp(this.step('<.a30', q), negativeGoal);
        this.pop();
        // a4 changes the bound name explicitly; AST equality is not alpha equality.
        this.variable(x);
        const generalized = this.spec(negativePredicate, x);
        this.pop();
        this.pop();
        const reductio = this.step('<.a31', generalized);
        const notAll = this.mp(this.step('<.<>1', this.step('d\\e', x, predicate(x))), proof);
        return this.mp(reductio, notAll);
    }
    orderDefinition(x, y, nx, ny) {
        return this.mp(this.mp(this.spec(this.step('d<='), x, y), nx), ny);
    }
    orderIntro(x, y, nx, ny, w, nw, equality) {
        const pair = this.step('./\\', nw, equality.id);
        const witness = this.existsIntro('z', and(N('z'), eq(add(x, 'z'), y)), w, pair);
        return this.mp(this.step('<.<>2', this.orderDefinition(x, y, nx, ny)), witness);
    }
    orderWitness(x, y, nx, ny, order) {
        return this.mp(this.step('<.<>1', this.orderDefinition(x, y, nx, ny)), order);
    }
    cases(predicate, yes, no) {
        const a = yes(this.cond(predicate));
        this.pop();
        const b = no(this.cond(not(predicate)));
        this.pop();
        return this.step('.m2', a, b);
    }
    successorOrder(x, y, nx, ny, order) {
        const target = le(S(x), S(y)), nsx = this.successor(nx, x), nsy = this.successor(ny, y);
        return this.existsElim('z', z => and(N(z), eq(add(x, z), y)), target, this.orderWitness(x, y, nx, ny, order), (w, pair) => {
            const nw = this.step('./\\1', pair), e = this.equality(this.step('./\\2', pair), add(x, w), y);
            return this.orderIntro(S(x), S(y), nsx, nsy, w, nw, this.trans(this.theoremEq('.S+', [x, w], [nx, nw], add(S(x), w), S(add(x, w))), this.congr(e, S)));
        });
    }
    /** base and step are proved in sibling scopes, before apn5 is applied. */
    induction(x, predicate, base, step) {
        const b = base();
        this.variable(x);
        const nx = this.cond(N(x));
        const ih = this.cond(predicate(x));
        const s = step(nx, ih);
        this.pop();
        this.pop();
        this.pop();
        const ax = this.step('apn5', predicate(x), x);
        return this.mp(this.mp(ax, b), s);
    }
}
const rules = [];
function theorem(name, parameters, statement, body, conditions = []) {
    const p = new Proof(conditions.length);
    const vars = parameters.map((_, i) => `#p${i}`);
    vars.forEach(x => p.variable(x));
    const last = body(p, ...vars);
    p.root();
    let result = p.spec(last, ...parameters);
    for (let i = 1; i <= conditions.length; i++)
        result = p.mp(result, i);
    rules.push(`${name}:${conditions.join(',')}⊢${statement(...parameters)};${p.commands.join(';')};`);
}
theorem('.=Se', ['$x', '$y'], (x, y) => imp(eq(S(x), S(y)), eq(x, y)), (p, x, y) => p.spec(p.step('apn4'), x, y));
theorem('.=Si', ['$0', '$1'], (x, y) => imp(eq(x, y), eq(S(x), S(y))), (p, x, y) => {
    const h = p.cond(eq(x, y));
    return p.congr(p.equality(h, x, y), S).id;
});
theorem('.=S', ['$0', '$1'], (x, y) => `(${eq(x, y)}↔${eq(S(x), S(y))})`, (p, x, y) => {
    const a = p.step('.=Si', x, y), b = p.step('.=Se', x, y);
    return p.step('.<>', a, b);
});
theorem('.0+', ['$0'], x => imp(N(x), eq(add('0', x), x)), (p, x) => {
    const result = p.induction('#n', n => eq(add('0', n), n), () => p.plus0('0', p.zero()).id, (nn, ih) => p.trans(p.plusS('0', '#n', p.zero(), nn), p.congr(p.equality(ih, add('0', '#n'), '#n'), S)).id);
    return p.spec(result, x);
});
theorem('.S+', ['$0', '$1'], (x, y) => imp(N(x), imp(N(y), eq(add(S(x), y), S(add(x, y))))), (p, x, y) => {
    const nx = p.cond(N(x)), nsx = p.successor(nx, x);
    const r = p.induction('#n', n => eq(add(S(x), n), S(add(x, n))), () => p.trans(p.plus0(S(x), nsx), p.sym(p.congr(p.plus0(x, nx), S))).id, (nn, ih) => p.chain(p.plusS(S(x), '#n', nsx, nn), p.congr(p.equality(ih, add(S(x), '#n'), S(add(x, '#n'))), S), p.sym(p.congr(p.plusS(x, '#n', nx, nn), S))).id);
    return p.spec(r, y);
});
theorem('.+@N', ['$x', '$y'], (x, y) => imp(N(x), imp(N(y), N(add(x, y)))), (p, x, y) => {
    const nx = p.cond(N(x));
    const r = p.induction('#n', n => N(add(x, n)), () => p.rewrite(p.sym(p.plus0(x, nx)), nx, N('#')), (nn, ih) => p.rewrite(p.sym(p.plusS(x, '#n', nx, nn)), p.successor(ih, add(x, '#n')), N('#')));
    return p.spec(r, y);
});
theorem('.+s', ['$x', '$y'], (x, y) => imp(N(x), imp(N(y), eq(add(x, y), add(y, x)))), (p, x, y) => {
    const nx = p.cond(N(x));
    const r = p.induction('#n', n => eq(add(x, n), add(n, x)), () => p.trans(p.plus0(x, nx), p.sym(p.theoremEq('.0+', [x], [nx], add('0', x), x))).id, (nn, ih) => p.chain(p.plusS(x, '#n', nx, nn), p.congr(p.equality(ih, add(x, '#n'), add('#n', x)), S), p.sym(p.theoremEq('.S+', ['#n', x], [nn, nx], add(S('#n'), x), S(add('#n', x))))).id);
    return p.spec(r, y);
});
theorem('.+a', ['$x', '$y', '$z'], (x, y, z) => imp(N(x), imp(N(y), imp(N(z), eq(add(add(x, y), z), add(x, add(y, z)))))), (p, x, y, z) => {
    const nx = p.cond(N(x)), ny = p.cond(N(y));
    const nxy = p.use('.+@N', [x, y], nx, ny);
    const r = p.induction('#n', n => eq(add(add(x, y), n), add(x, add(y, n))), () => p.trans(p.plus0(add(x, y), nxy), p.sym(p.congr(p.plus0(y, ny), t => add(x, t)))).id, (nn, ih) => p.chain(p.plusS(add(x, y), '#n', nxy, nn), p.congr(p.equality(ih, add(add(x, y), '#n'), add(x, add(y, '#n'))), S), p.sym(p.plusS(x, add(y, '#n'), nx, p.use('.+@N', [y, '#n'], ny, nn))), p.congr(p.sym(p.plusS(y, '#n', ny, nn)), t => add(x, t))).id);
    return p.spec(r, z);
});
theorem('.+e', ['$a', '$b', '$c'], (a, b, c) => imp(N(a), imp(N(b), imp(N(c), imp(eq(add(a, c), add(b, c)), eq(a, b))))), (p, a, b, c) => {
    const na = p.cond(N(a)), nb = p.cond(N(b));
    const r = p.induction('#n', n => imp(eq(add(a, n), add(b, n)), eq(a, b)), () => {
        const h = p.cond(eq(add(a, '0'), add(b, '0')));
        const r = p.chain(p.sym(p.plus0(a, na)), p.equality(h, add(a, '0'), add(b, '0')), p.plus0(b, nb)).id;
        p.pop();
        return r;
    }, (nn, ih) => {
        const h = p.cond(eq(add(a, S('#n')), add(b, S('#n'))));
        const e = p.chain(p.sym(p.plusS(a, '#n', na, nn)), p.equality(h, add(a, S('#n')), add(b, S('#n'))), p.plusS(b, '#n', nb, nn));
        const inject = p.use('.=Se', [add(a, '#n'), add(b, '#n')], e.id);
        const r = p.mp(ih, inject);
        p.pop();
        return r;
    });
    return p.spec(r, c);
});
theorem('.+=0', ['$x', '$y'], (x, y) => imp(N(x), imp(N(y), imp(eq(add(x, y), '0'), and(eq(x, '0'), eq(y, '0'))))), (p, x, y) => {
    const nx = p.cond(N(x));
    const r = p.induction('#n', n => imp(eq(add(x, n), '0'), and(eq(x, '0'), eq(n, '0'))), () => {
        const h = p.cond(eq(add(x, '0'), '0'));
        const e = p.trans(p.sym(p.plus0(x, nx)), p.equality(h, add(x, '0'), '0'));
        const r = p.step('./\\', e.id, p.refl('0').id);
        p.pop();
        return r;
    }, (nn, _ih) => {
        const h = p.cond(eq(add(x, S('#n')), '0'));
        const e = p.trans(p.sym(p.plusS(x, '#n', nx, nn)), p.equality(h, add(x, S('#n')), '0'));
        const ne = p.spec(p.step('apn3'), add(x, '#n'));
        const r = p.use('.m', [eq(S(add(x, '#n')), '0'), and(eq(x, '0'), eq(S('#n'), '0'))], ne, e.id);
        p.pop();
        return r;
    });
    return p.spec(r, y);
});
theorem('.pred', [], () => all('x', imp(N('x'), imp(not(eq('x', '0')), ex('z', and(eq('x', S('z')), N('z')))))), p => {
    const predicate = (x) => imp(not(eq(x, '0')), ex('z', and(eq(x, S('z')), N('z'))));
    return p.induction('x', predicate, () => {
        const h = p.cond(not(eq('0', '0')));
        const r = p.use('.m', [eq('0', '0'), ex('z', and(eq('0', S('z')), N('z')))], h, p.refl('0').id);
        p.pop();
        return r;
    }, (nx, _ih) => {
        p.cond(not(eq(S('x'), '0')));
        const pair = p.step('./\\', p.refl(S('x')).id, nx);
        const r = p.existsIntro('z', and(eq(S('x'), S('z')), N('z')), 'x', pair);
        p.pop();
        return r;
    });
});
theorem('.0*', ['$x'], x => imp(N(x), eq(mul('0', x), '0')), (p, x) => {
    const r = p.induction('#n', n => eq(mul('0', n), '0'), () => p.times0('0', p.zero()).id, (nn, ih) => p.chain(p.timesS('0', '#n', p.zero(), nn), p.congr(p.equality(ih, mul('0', '#n'), '0'), t => add(t, '0')), p.plus0('0', p.zero())).id);
    return p.spec(r, x);
});
theorem('.*@N', ['$x', '$y'], (x, y) => imp(N(x), imp(N(y), N(mul(x, y)))), (p, x, y) => {
    const nx = p.cond(N(x));
    const r = p.induction('#n', n => N(mul(x, n)), () => p.rewrite(p.sym(p.times0(x, nx)), p.zero(), N('#')), (nn, ih) => p.rewrite(p.sym(p.timesS(x, '#n', nx, nn)), p.use('.+@N', [mul(x, '#n'), x], ih, nx), N('#')));
    return p.spec(r, y);
});
theorem('.S*', ['$x', '$y'], (x, y) => imp(N(x), imp(N(y), eq(mul(S(x), y), add(mul(x, y), y)))), (p, x, y) => {
    const nx = p.cond(N(x)), nsx = p.successor(nx, x);
    const r = p.induction('#n', n => eq(mul(S(x), n), add(mul(x, n), n)), () => p.chain(p.times0(S(x), nsx), p.sym(p.plus0('0', p.zero())), p.congr(p.sym(p.times0(x, nx)), t => add(t, '0'))).id, (nn, ih) => {
        const u = mul(x, '#n'), nu = p.use('.*@N', [x, '#n'], nx, nn);
        const un = add(u, '#n'), ua = add(u, x);
        const nun = p.use('.+@N', [u, '#n'], nu, nn), nua = p.use('.+@N', [u, x], nu, nx);
        const permute = p.chain(p.theoremEq('.+a', [u, '#n', x], [nu, nn, nx], add(un, x), add(u, add('#n', x))), p.congr(p.theoremEq('.+s', ['#n', x], [nn, nx], add('#n', x), add(x, '#n')), t => add(u, t)), p.sym(p.theoremEq('.+a', [u, x, '#n'], [nu, nx, nn], add(ua, '#n'), add(u, add(x, '#n')))));
        return p.chain(p.timesS(S(x), '#n', nsx, nn), p.congr(p.equality(ih, mul(S(x), '#n'), un), t => add(t, S(x))), p.plusS(un, x, nun, nx), p.congr(permute, S), p.sym(p.plusS(ua, '#n', nua, nn)), p.congr(p.sym(p.timesS(x, '#n', nx, nn)), t => add(t, S('#n')))).id;
    });
    return p.spec(r, y);
});
theorem('.*s', ['$x', '$y'], (x, y) => imp(N(x), imp(N(y), eq(mul(x, y), mul(y, x)))), (p, x, y) => {
    const nx = p.cond(N(x));
    const r = p.induction('#n', n => eq(mul(x, n), mul(n, x)), () => p.trans(p.times0(x, nx), p.sym(p.theoremEq('.0*', [x], [nx], mul('0', x), '0'))).id, (nn, ih) => p.chain(p.timesS(x, '#n', nx, nn), p.congr(p.equality(ih, mul(x, '#n'), mul('#n', x)), t => add(t, x)), p.sym(p.theoremEq('.S*', ['#n', x], [nn, nx], mul(S('#n'), x), add(mul('#n', x), x)))).id);
    return p.spec(r, y);
});
theorem('.*+d', ['$x', '$y', '$z'], (x, y, z) => imp(N(x), imp(N(y), imp(N(z), eq(mul(x, add(y, z)), add(mul(x, y), mul(x, z)))))), (p, x, y, z) => {
    const nx = p.cond(N(x)), ny = p.cond(N(y)), xy = mul(x, y), nxy = p.use('.*@N', [x, y], nx, ny);
    const r = p.induction('#n', n => eq(mul(x, add(y, n)), add(xy, mul(x, n))), () => p.chain(p.congr(p.plus0(y, ny), t => mul(x, t)), p.sym(p.plus0(xy, nxy)), p.congr(p.sym(p.times0(x, nx)), t => add(xy, t))).id, (nn, ih) => p.chain(p.congr(p.plusS(y, '#n', ny, nn), t => mul(x, t)), p.timesS(x, add(y, '#n'), nx, p.use('.+@N', [y, '#n'], ny, nn)), p.congr(p.equality(ih, mul(x, add(y, '#n')), add(xy, mul(x, '#n'))), t => add(t, x)), p.theoremEq('.+a', [xy, mul(x, '#n'), x], [nxy, p.use('.*@N', [x, '#n'], nx, nn), nx], add(add(xy, mul(x, '#n')), x), add(xy, add(mul(x, '#n'), x))), p.congr(p.sym(p.timesS(x, '#n', nx, nn)), t => add(xy, t))).id);
    return p.spec(r, z);
});
theorem('.+*d', ['$x', '$y', '$z'], (x, y, z) => imp(N(x), imp(N(y), imp(N(z), eq(mul(add(x, y), z), add(mul(x, z), mul(y, z)))))), (p, x, y, z) => {
    const nx = p.cond(N(x)), ny = p.cond(N(y)), nz = p.cond(N(z));
    return p.chain(p.theoremEq('.*s', [add(x, y), z], [p.use('.+@N', [x, y], nx, ny), nz], mul(add(x, y), z), mul(z, add(x, y))), p.theoremEq('.*+d', [z, x, y], [nz, nx, ny], mul(z, add(x, y)), add(mul(z, x), mul(z, y))), p.congr(p.theoremEq('.*s', [z, x], [nz, nx], mul(z, x), mul(x, z)), t => add(t, mul(z, y))), p.congr(p.theoremEq('.*s', [z, y], [nz, ny], mul(z, y), mul(y, z)), t => add(mul(x, z), t))).id;
});
theorem('.*a', ['$x', '$y', '$z'], (x, y, z) => imp(N(x), imp(N(y), imp(N(z), eq(mul(mul(x, y), z), mul(x, mul(y, z)))))), (p, x, y, z) => {
    const nx = p.cond(N(x)), ny = p.cond(N(y)), xy = mul(x, y), nxy = p.use('.*@N', [x, y], nx, ny);
    const r = p.induction('#n', n => eq(mul(xy, n), mul(x, mul(y, n))), () => p.chain(p.times0(xy, nxy), p.sym(p.times0(x, nx)), p.congr(p.sym(p.times0(y, ny)), t => mul(x, t))).id, (nn, ih) => p.chain(p.timesS(xy, '#n', nxy, nn), p.congr(p.equality(ih, mul(xy, '#n'), mul(x, mul(y, '#n'))), t => add(t, xy)), p.sym(p.theoremEq('.*+d', [x, mul(y, '#n'), y], [nx, p.use('.*@N', [y, '#n'], ny, nn), ny], mul(x, add(mul(y, '#n'), y)), add(mul(x, mul(y, '#n')), xy))), p.congr(p.sym(p.timesS(y, '#n', ny, nn)), t => mul(x, t))).id);
    return p.spec(r, z);
});
theorem('.*=0', ['$x', '$y'], (x, y) => imp(N(x), imp(N(y), imp(eq(mul(x, S(y)), '0'), eq(x, '0')))), (p, x, y) => {
    const nx = p.cond(N(x)), ny = p.cond(N(y)), h = p.cond(eq(mul(x, S(y)), '0'));
    const e = p.trans(p.sym(p.timesS(x, y, nx, ny)), p.equality(h, mul(x, S(y)), '0'));
    const both = p.use('.+=0', [mul(x, y), x], p.use('.*@N', [x, y], nx, ny), nx, e.id);
    return p.step('./\\2', both);
});
theorem('.*n=0', ['$x', '$y'], (x, y) => imp(N(x), imp(N(y), imp(not(eq(x, '0')), imp(not(eq(y, '0')), not(eq(mul(x, y), '0')))))), (p, x, y) => {
    const nx = p.cond(N(x)), ny = p.cond(N(y)), xNonzero = p.cond(not(eq(x, '0'))), yNonzero = p.cond(not(eq(y, '0')));
    const predecessor = p.mp(p.mp(p.spec(p.step('.pred'), y), ny), yNonzero);
    return p.existsElim('z', z => and(eq(y, S(z)), N(z)), not(eq(mul(x, y), '0')), predecessor, (w, pair) => {
        const e = p.equality(p.step('./\\1', pair), y, S(w)), nw = p.step('./\\2', pair);
        const cancel = p.use('.*=0', [x, w], nx, nw);
        const nonzero = p.mp(p.step('<.a30', cancel), xNonzero);
        return p.rewrite(p.sym(e), nonzero, not(eq(mul(x, '#'), '0')));
    });
});
theorem('.<=i', ['$x'], x => imp(N(x), le(x, x)), (p, x) => {
    const nx = p.cond(N(x));
    return p.orderIntro(x, x, nx, nx, '0', p.zero(), p.plus0(x, nx));
});
theorem('.<=+', ['$x', '$y'], (x, y) => imp(N(x), imp(N(y), le(x, add(x, y)))), (p, x, y) => {
    const nx = p.cond(N(x)), ny = p.cond(N(y));
    return p.orderIntro(x, add(x, y), nx, p.use('.+@N', [x, y], nx, ny), y, ny, p.refl(add(x, y)));
});
theorem('.<=t', ['$x', '$y', '$z'], (x, _y, z) => le(x, z), (p, x, y, z) => {
    const nx = p.cond(N(x)), ny = p.cond(N(y)), nz = p.cond(N(z)), xy = p.cond(le(x, y)), yz = p.cond(le(y, z));
    return p.existsElim('z', u => and(N(u), eq(add(x, u), y)), le(x, z), p.orderWitness(x, y, nx, ny, xy), (u, pair) => {
        const nu = p.step('./\\1', pair), e = p.equality(p.step('./\\2', pair), add(x, u), y);
        return p.existsElim('z', v => and(N(v), eq(add(y, v), z)), le(x, z), p.orderWitness(y, z, ny, nz, yz), (v, pair2) => {
            const nv = p.step('./\\1', pair2), f = p.equality(p.step('./\\2', pair2), add(y, v), z);
            const sum = add(u, v), nsum = p.use('.+@N', [u, v], nu, nv);
            const equality = p.chain(p.sym(p.theoremEq('.+a', [x, u, v], [nx, nu, nv], add(add(x, u), v), add(x, sum))), p.congr(e, t => add(t, v)), f);
            return p.orderIntro(x, z, nx, nz, sum, nsum, equality);
        });
    });
}, [N('$x'), N('$y'), N('$z'), le('$x', '$y'), le('$y', '$z')]);
theorem('.<=s', ['$x', '$y'], (x, y) => imp(N(x), imp(N(y), imp(le(x, y), imp(le(y, x), eq(x, y))))), (p, x, y) => {
    const nx = p.cond(N(x)), ny = p.cond(N(y)), xy = p.cond(le(x, y)), yx = p.cond(le(y, x));
    return p.existsElim('z', u => and(N(u), eq(add(x, u), y)), eq(x, y), p.orderWitness(x, y, nx, ny, xy), (u, pair) => {
        const nu = p.step('./\\1', pair), e = p.equality(p.step('./\\2', pair), add(x, u), y);
        return p.existsElim('z', v => and(N(v), eq(add(y, v), x)), eq(x, y), p.orderWitness(y, x, ny, nx, yx), (v, pair2) => {
            const nv = p.step('./\\1', pair2), f = p.equality(p.step('./\\2', pair2), add(y, v), x);
            const sum = add(u, v), nsum = p.use('.+@N', [u, v], nu, nv);
            const e0 = p.chain(p.theoremEq('.+s', [sum, x], [nsum, nx], add(sum, x), add(x, sum)), p.sym(p.theoremEq('.+a', [x, u, v], [nx, nu, nv], add(add(x, u), v), add(x, sum))), p.congr(e, t => add(t, v)), f, p.sym(p.theoremEq('.0+', [x], [nx], add('0', x), x)));
            const sum0 = p.use('.+e', [sum, '0', x], nsum, p.zero(), nx, e0.id);
            const u0 = p.equality(p.step('./\\1', p.use('.+=0', [u, v], nu, nv, sum0)), u, '0');
            return p.chain(p.sym(p.plus0(x, nx)), p.congr(p.sym(u0), t => add(x, t)), e).id;
        });
    });
});
theorem('.+n<=', ['$x', '$y'], (x, y) => imp(N(x), imp(N(y), not(le(add(x, S(y)), x)))), (p, x, y) => {
    const nx = p.cond(N(x)), ny = p.cond(N(y)), nsy = p.successor(ny, y);
    const left = add(x, S(y)), nleft = p.use('.+@N', [x, S(y)], nx, nsy), h = p.cond(le(left, x));
    const bad = p.existsElim('z', z => and(N(z), eq(add(left, z), x)), eq(S(y), '0'), p.orderWitness(left, x, nleft, nx, h), (w, pair) => {
        const nw = p.step('./\\1', pair), e = p.equality(p.step('./\\2', pair), add(left, w), x);
        const sum = add(S(y), w), nsum = p.use('.+@N', [S(y), w], nsy, nw);
        const e0 = p.chain(p.theoremEq('.+s', [sum, x], [nsum, nx], add(sum, x), add(x, sum)), p.sym(p.theoremEq('.+a', [x, S(y), w], [nx, nsy, nw], add(left, w), add(x, sum))), e, p.sym(p.theoremEq('.0+', [x], [nx], add('0', x), x)));
        const sum0 = p.use('.+e', [sum, '0', x], nsum, p.zero(), nx, e0.id);
        return p.step('./\\1', p.use('.+=0', [S(y), w], nsy, nw, sum0));
    });
    p.pop();
    return p.mp(p.step('<.a30', bad), p.spec(p.step('apn3'), y));
});
theorem('.<=|>=', ['$x', '$y'], (x, y) => imp(N(x), imp(N(y), or(le(x, y), le(y, x)))), (p, x, y) => {
    const nx = p.cond(N(x)), ny = p.cond(N(y));
    const property = (n) => all('#a', imp(N('#a'), or(le('#a', n), le(n, '#a'))));
    const result = p.induction('#n', property, () => {
        p.variable('#a');
        const na = p.cond(N('#a'));
        const lower = p.orderIntro('0', '#a', p.zero(), na, '#a', na, p.theoremEq('.0+', ['#a'], [na], add('0', '#a'), '#a'));
        const r = p.step('.\\/2', lower, le('#a', '0'));
        p.pop();
        p.pop();
        return r;
    }, (nn, ih) => {
        p.variable('#a');
        const na = p.cond(N('#a')), nsn = p.successor(nn, '#n');
        const target = or(le('#a', S('#n')), le(S('#n'), '#a'));
        const r = p.cases(eq('#a', '0'), h => {
            const lower = p.orderIntro('0', S('#n'), p.zero(), nsn, S('#n'), nsn, p.theoremEq('.0+', [S('#n')], [nsn], add('0', S('#n')), S('#n')));
            const order = p.rewrite(p.sym(p.equality(h, '#a', '0')), lower, le('#', S('#n')));
            return p.step('.\\/1', order, le(S('#n'), '#a'));
        }, nonzero => {
            const predecessor = p.mp(p.mp(p.spec(p.step('.pred'), '#a'), na), nonzero);
            return p.existsElim('z', z => and(eq('#a', S(z)), N(z)), target, predecessor, (w, pair) => {
                const e = p.equality(p.step('./\\1', pair), '#a', S(w)), nw = p.step('./\\2', pair);
                const alternatives = p.mp(p.spec(ih, w), nw);
                return p.cases(le(w, '#n'), h => {
                    const order = p.rewrite(p.sym(e), p.successorOrder(w, '#n', nw, nn, h), le('#', S('#n')));
                    return p.step('.\\/1', order, le(S('#n'), '#a'));
                }, negative => {
                    const reverse = p.mp(p.mp(p.step('<.<>1', p.step('d\\/', le(w, '#n'), le('#n', w))), alternatives), negative);
                    const order = p.rewrite(p.sym(e), p.successorOrder('#n', w, nn, nw, reverse), le(S('#n'), '#'));
                    return p.step('.\\/2', order, le('#a', S('#n')));
                });
            });
        });
        p.pop();
        p.pop();
        return r;
    });
    return p.mp(p.spec(p.mp(p.spec(result, y), ny), x), nx);
});
theorem('.*e', ['$x', '$y', '$z'], (x, y, z) => imp(N(x), imp(N(y), imp(N(z), imp(eq(mul(x, S(z)), mul(y, S(z))), eq(x, y))))), (p, x, y, z) => {
    const nx = p.cond(N(x)), ny = p.cond(N(y)), nz = p.cond(N(z));
    const property = (a) => all('#b', all('#c', imp(N('#b'), imp(N('#c'), imp(eq(mul(a, S('#c')), mul('#b', S('#c'))), eq(a, '#b'))))));
    const result = p.induction('#a', property, () => {
        p.variable('#b');
        p.variable('#c');
        const nb = p.cond(N('#b')), nc = p.cond(N('#c'));
        const h = p.cond(eq(mul('0', S('#c')), mul('#b', S('#c'))));
        const e = p.trans(p.sym(p.equality(h, mul('0', S('#c')), mul('#b', S('#c')))), p.theoremEq('.0*', [S('#c')], [p.successor(nc, '#c')], mul('0', S('#c')), '0'));
        const b0 = p.use('.*=0', ['#b', '#c'], nb, nc, e.id);
        const r = p.sym(p.equality(b0, '#b', '0')).id;
        for (let i = 0; i < 5; i++)
            p.pop();
        return r;
    }, (na, ih) => {
        p.variable('#b');
        p.variable('#c');
        const nb = p.cond(N('#b')), nc = p.cond(N('#c'));
        const a = '#a', b = '#b', c = '#c', sc = S(c), sa = S(a);
        const h = p.cond(eq(mul(sa, sc), mul(b, sc))), nsc = p.successor(nc, c), nsa = p.successor(na, a);
        const r = p.cases(eq(b, '0'), b0 => {
            const e = p.chain(p.equality(h, mul(sa, sc), mul(b, sc)), p.congr(p.equality(b0, b, '0'), t => mul(t, sc)), p.theoremEq('.0*', [sc], [nsc], mul('0', sc), '0'));
            const nonzero = p.use('.*n=0', [sa, sc], nsa, nsc, p.spec(p.step('apn3'), a), p.spec(p.step('apn3'), c));
            return p.use('.m', [eq(mul(sa, sc), '0'), eq(sa, b)], nonzero, e.id);
        }, nonzero => {
            const predecessor = p.mp(p.mp(p.spec(p.step('.pred'), b), nb), nonzero);
            return p.existsElim('z', d => and(eq(b, S(d)), N(d)), eq(sa, b), predecessor, (d, pair) => {
                const e = p.equality(p.step('./\\1', pair), b, S(d)), nd = p.step('./\\2', pair);
                const products = p.rewrite(e, h, eq(mul(sa, sc), mul('#', sc)));
                const left = mul(a, sc), right = mul(d, sc);
                const sums = p.chain(p.sym(p.theoremEq('.S*', [a, sc], [na, nsc], mul(sa, sc), add(left, sc))), p.equality(products, mul(sa, sc), mul(S(d), sc)), p.theoremEq('.S*', [d, sc], [nd, nsc], mul(S(d), sc), add(right, sc)));
                const equalProducts = p.use('.+e', [left, right, sc], p.use('.*@N', [a, sc], na, nsc), p.use('.*@N', [d, sc], nd, nsc), nsc, sums.id);
                const equality = p.mp(p.mp(p.mp(p.spec(ih, d, c), nd), nc), equalProducts);
                return p.trans(p.congr(p.equality(equality, a, d), S), p.sym(e)).id;
            });
        });
        for (let i = 0; i < 5; i++)
            p.pop();
        return r;
    });
    return p.mp(p.mp(p.spec(p.mp(p.spec(result, x), nx), y, z), ny), nz);
});
/** Public loader input; no theorem in this string is installed as an axiom. */
export const peanoTheorems = rules.join('\n');
//# sourceMappingURL=peano.js.map