/** HSLayer command proofs bridging the set constructions of the number systems. */
const rules = [String.raw `
.setEi:⊢#sb($P,$x,$A)→∃$x:$P;d a4 $x ¬$P $A;d <.a30 1;d .ni #sb($P,$x,$A);d .t 3 2;d d\e $x $P;d <.<>2 5;d .t 4 6;
.setEe:#nf($Q,$x),∀$x:($P→$Q),∃$x:$P⊢$Q;d v<.a30 2;d <a5 4;d a6 ¬$Q $x;d .t 6 5;d <.a31 7;d d\e $x $P;d <<.<>1 9 3;d mp 8 10;
.setCases:⊢($P→$R)→($Q→$R)→$P∨$Q→$R;mcpt ($P→$R)→($Q→$R)→$P∨$Q→$R;
.N@ω:$x∈ℕ⊢$x∈ω;d dN;d <a8 2 $x∈# #;d mp 3 1;
.ω@N:$x∈ω⊢$x∈ℕ;d dN;d .=s 2;d <a8 3 $x∈# #;d mp 4 1;
`];
const member = (x, a) => `${x}∈${a}`;
const natural = (x) => member(x, 'ℕ');
const pair = (a, b) => `(${a},${b})`;
const and = (a, b) => `(${a}∧${b})`;
const imp = (a, b) => `(${a}→${b})`;
const all = (x, p) => `∀${x}:(${p})`;
/** Every entry is an actual HS command; local binders prevent schematic capture. */
class Proof {
    commands = [];
    next = 0;
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
    rewrite(equality, fact, predicate) {
        return this.mp(this.step('<a8', equality, predicate, '#'), fact);
    }
    exists(variable, predicate, witness, fact) {
        return this.mp(this.step('.setEi', predicate, variable, witness), fact);
    }
    conjunction(a, b) { return this.step('./\\', a, b); }
    backward(iff, fact) { return this.step('<<.<>2', iff, fact); }
    forward(iff, fact) { return this.step('<<.<>1', iff, fact); }
    cases(disjunction, a, b, result, left, right) {
        const ha = this.cond(a), ra = left(ha);
        this.pop();
        const hb = this.cond(b), rb = right(hb);
        this.pop();
        return this.use('.setCases', [a, result, b], ra, rb, disjunction);
    }
    copy(fact, formula) { return this.mp(this.step('.i', formula), fact); }
    singleton(x) { return this.backward(this.step('d{.}', x, x), this.step('a7', x)); }
    duo(x, y, second = false) {
        const value = second ? y : x;
        const equal = this.step('a7', value);
        const disjunction = second ? this.step('.\\/2', equal, `${y}=${x}`)
            : this.step('.\\/1', equal, `${x}=${y}`);
        return this.backward(this.step('d{..}', value, x, y), disjunction);
    }
    trans(a, b, start) { return this.rewrite(b, a, `${start}=#`); }
    eliminate(exists, variable, predicate, body) {
        this.variable(variable);
        const result = body(this.cond(predicate));
        this.pop();
        this.pop();
        return this.step('.setEe', result, exists);
    }
}
function theorem(name, parameters, statement, body) {
    const p = new Proof();
    const locals = parameters.map((_, i) => `#s${i}`);
    locals.forEach(x => p.variable(x));
    const last = body(p, ...locals);
    p.root();
    p.spec(last, ...parameters);
    rules.push(`${name}:⊢${statement(...parameters)};${p.commands.join(';')};`);
}
theorem('.setUnordered2', ['$a', '$b', '$d'], (a, b, d) => imp(`{${a},${b}}={${a},${d}}`, `${b}=${d}`), (p, a, b, d) => {
    const h = p.cond(`{${a},${b}}={${a},${d}}`);
    const bm = p.rewrite(h, p.duo(a, b, true), member(b, '#'));
    const dm = p.rewrite(p.step('.=s', h), p.duo(a, d, true), member(d, '#'));
    const be = p.forward(p.step('d{..}', b, a, d), bm);
    const de = p.forward(p.step('d{..}', d, a, b), dm);
    return p.cases(be, `${b}=${a}`, `${b}=${d}`, `${b}=${d}`, ba => p.cases(de, `${d}=${a}`, `${d}=${b}`, `${b}=${d}`, da => p.trans(ba, p.step('.=s', da), b), db => p.step('.=s', db)), bd => p.copy(bd, `${b}=${d}`));
});
theorem('.setPair1', ['$a', '$b', '$c', '$d'], (a, b, c, d) => imp(`${pair(a, b)}=${pair(c, d)}`, `${a}=${c}`), (p, a, b, c, d) => {
    const h = p.cond(`${pair(a, b)}=${pair(c, d)}`);
    const sa = `{${a}}`, sc = `{${c}}`, ab = `{${a},${b}}`, cd = `{${c},${d}}`;
    const encoded = p.rewrite(p.step('dpair', c, d), p.rewrite(p.step('dpair', a, b), h, `#=${pair(c, d)}`), `{${sa},${ab}}=#`);
    const inOther = p.rewrite(encoded, p.duo(sa, ab), member(sa, '#'));
    const either = p.forward(p.step('d{..}', sa, sc, cd), inOther);
    return p.cases(either, `${sa}=${sc}`, `${sa}=${cd}`, `${a}=${c}`, same => p.forward(p.step('d{.}', a, c), p.rewrite(same, p.singleton(a), member(a, '#'))), same => p.step('.=s', p.forward(p.step('d{.}', c, a), p.rewrite(p.step('.=s', same), p.duo(c, d), member(c, '#')))));
});
theorem('.setPair2', ['$a', '$b', '$c', '$d'], (a, b, c, d) => imp(`${pair(a, b)}=${pair(c, d)}`, `${b}=${d}`), (p, a, b, c, d) => {
    const h = p.cond(`${pair(a, b)}=${pair(c, d)}`);
    const ac = p.use('.setPair1', [a, b, c, d], h);
    const sameFirst = p.rewrite(p.step('.=s', ac), h, `${pair(a, b)}=(#,${d})`);
    const encoded = p.rewrite(p.step('dpair', a, d), p.rewrite(p.step('dpair', a, b), sameFirst, `#=${pair(a, d)}`), `{{${a}},{${a},${b}}}=#`);
    const unordered = p.use('.setUnordered2', [`{${a}}`, `{${a},${b}}`, `{${a},${d}}`], encoded);
    return p.use('.setUnordered2', [a, b, d], unordered);
});
for (const index of [1, 2]) {
    theorem(`.Pr${index}`, ['$a', '$b'], (a, b) => `pr${index}(${pair(a, b)})=${index === 1 ? a : b}`, (p, a, b) => {
        const ab = pair(a, b);
        const inner = p.exists('#j', `${ab}=(${a},#j)`, b, p.step('a7', ab));
        const outer = p.exists('#i', `∃#j:${ab}=(#i,#j)`, a, inner);
        const projected = p.mp(p.step('dpr', '#i', '#j', ab), outer);
        return p.step('.=s', p.use(`.setPair${index}`, [a, b, `pr1(${ab})`, `pr2(${ab})`], projected));
    });
}
theorem('.setNt', ['$x', '$y'], (x, y) => imp(natural(x), imp(member(y, x), natural(y))), (p, x, y) => {
    const predicate = (n) => all('#v', imp(member('#v', n), natural('#v')));
    p.variable('#v');
    const empty = p.spec(p.step('d{}'), '#v');
    const notZero = p.rewrite(p.step('.=s', p.step('d0')), empty, `¬${member('#v', '#')}`);
    const base = p.mp(p.step('.m', member('#v', '0'), natural('#v')), notZero);
    p.pop();
    p.variable('#n');
    const nn = p.cond(natural('#n')), ih = p.cond(predicate('#n'));
    p.variable('#v');
    const h = p.cond(member('#v', 'S(#n)'));
    const un = p.rewrite(p.step('dS', '#n'), h, member('#v', '#'));
    const either = p.forward(p.step('d\\u', '#v', '#n', '{#n}'), un);
    const left = p.spec(ih, '#v');
    const singleton = p.cond(member('#v', '{#n}'));
    const same = p.forward(p.step('d{.}', '#v', '#n'), singleton);
    const right = p.rewrite(p.step('.=s', same), nn, natural('#'));
    p.pop();
    const step = p.mp(p.mp(p.mp(p.step('.setCases', member('#v', '#n'), natural('#v'), member('#v', '{#n}')), left), right), either);
    p.pop();
    p.pop();
    p.pop();
    p.pop();
    p.pop();
    const induction = p.mp(p.mp(p.step('apn5', predicate('#n'), '#n'), base), step);
    const nx = p.cond(natural(x));
    return p.spec(p.mp(p.spec(induction, x), nx), y);
});
rules.push(String.raw `.N@t:⊢$x∈ℕ→$y∈$x→$y∈ℕ;d .setNt $x $y;`);
theorem('.setXi', ['$x', '$y', '$A', '$B'], (x, y, a, b) => imp(member(x, a), imp(member(y, b), member(pair(x, y), `${a}×${b}`))), (p, x, y, a, b) => {
    const hx = p.cond(member(x, a)), hy = p.cond(member(y, b));
    const xy = pair(x, y), row = `{(${x},#j)|#j∈${b}}`;
    const rows = `{{(#i,#j)|#j∈${b}}|#i∈${a}}`;
    const inner = p.exists('#j', and(member('#j', b), `(${x},#j)=${xy}`), y, p.conjunction(hy, p.step('a7', xy)));
    const inRow = p.backward(p.step('drepl', xy, `(${x},#j)`, '#j', b), inner);
    const outer = p.exists('#i', and(member('#i', a), `{(#i,#j)|#j∈${b}}=${row}`), x, p.conjunction(hx, p.step('a7', row)));
    const rowInRows = p.backward(p.step('drepl', row, `{(#i,#j)|#j∈${b}}`, '#i', a), outer);
    const union = p.backward(p.step('dunion', xy, rows, '#u'), p.exists('#u', and(member(xy, '#u'), member('#u', rows)), row, p.conjunction(inRow, rowInRows)));
    return p.rewrite(p.step('.=s', p.step('d\\x', a, b, '#i', '#j')), union, member(xy, '#'));
});
rules.push(String.raw `.Xi:$x∈$A,$y∈$B⊢($x,$y)∈$A×$B;d .setXi $x $A $y $B;d mp 3 1;d mp 4 2;`);
theorem('.setXe', ['$x', '$A', '$B'], (x, a, b) => imp(member(x, `${a}×${b}`), and(member(`pr1(${x})`, a), member(`pr2(${x})`, b))), (p, x, a, b) => {
    const h = p.cond(member(x, `${a}×${b}`));
    const row = `{(#i,#j)|#j∈${b}}`, rows = `{${row}|#i∈${a}}`;
    const un = p.rewrite(p.step('d\\x', a, b, '#i', '#j'), h, member(x, '#'));
    const outer = p.forward(p.step('dunion', x, rows, '#u'), un);
    return p.eliminate(outer, '#u', and(member(x, '#u'), member('#u', rows)), hu => {
        const inU = p.step('./\\1', hu), uRows = p.step('./\\2', hu);
        const middle = p.forward(p.step('drepl', '#u', row, '#i', a), uRows);
        return p.eliminate(middle, '#i', and(member('#i', a), `${row}=#u`), hi => {
            const ia = p.step('./\\1', hi), rowU = p.step('./\\2', hi);
            const inRow = p.rewrite(p.step('.=s', rowU), inU, member(x, '#'));
            const inner = p.forward(p.step('drepl', x, '(#i,#j)', '#j', b), inRow);
            return p.eliminate(inner, '#j', and(member('#j', b), `(#i,#j)=${x}`), hj => {
                const jb = p.step('./\\1', hj), ijX = p.step('./\\2', hj);
                const pi = p.rewrite(ijX, p.step('.Pr1', '#i', '#j'), 'pr1(#)=#i');
                const pj = p.rewrite(ijX, p.step('.Pr2', '#i', '#j'), 'pr2(#)=#j');
                return p.conjunction(p.rewrite(p.step('.=s', pi), ia, member('#', a)), p.rewrite(p.step('.=s', pj), jb, member('#', b)));
            });
        });
    });
});
rules.push(String.raw `.Xe:$x∈$A×$B⊢pr1($x)∈$A∧pr2($x)∈$B;d .setXe $x $A $B;d mp 2 1;`);
const integerStart = rules.length;
theorem('.setZIntro', ['$x', '$y'], (x, y) => imp(natural(x), imp(natural(y), member(`Z(${pair(x, y)})`, 'ℤ'))), (p, x, y) => {
    const hx = p.cond(natural(x)), hy = p.cond(natural(y));
    const xy = pair(x, y), z = `Z(${xy})`;
    const inPairs = p.step('.Xi', hx, hy);
    const exists = p.exists('x', and(member('x', 'ℕ×ℕ'), `Z(x)=${z}`), xy, p.conjunction(inPairs, p.step('a7', z)));
    const image = p.backward(p.step('drepl', z, 'Z(x)', 'x', 'ℕ×ℕ'), exists);
    return p.rewrite(p.step('.=s', p.step('dZ')), image, member(z, '#'));
});
rules.push(String.raw `.@Z:$x∈ℕ,$y∈ℕ⊢Z(($x,$y))∈ℤ;d .setZIntro $x $y;d mp 3 1;d mp 4 2;`);
theorem('.setAddSwap', ['$a', '$z', '$v'], (a, z, v) => imp(natural(a), imp(natural(z), imp(natural(v), `(${a}+${z})+${v}=(${a}+${v})+${z}`))), (p, a, z, v) => {
    const na = p.cond(natural(a)), nz = p.cond(natural(z)), nv = p.cond(natural(v));
    const avz = p.use('.+a', [a, z, v], na, nz, nv);
    const zv = p.use('.+s', [z, v], nz, nv);
    const swapped = p.rewrite(zv, avz, `(${a}+${z})+${v}=${a}+#`);
    return p.trans(swapped, p.step('.=s', p.use('.+a', [a, v, z], na, nv, nz)), `(${a}+${z})+${v}`);
});
theorem('.setShiftBalance', ['$a', '$b', '$z', '$u', '$v'], (a, b, z, u, v) => imp(natural(a), imp(natural(b), imp(natural(z), imp(natural(u), imp(natural(v), `(${a}+${v}=${b}+${u}↔(${a}+${z})+${v}=(${b}+${z})+${u})`))))), (p, a, b, z, u, v) => {
    const na = p.cond(natural(a)), nb = p.cond(natural(b)), nz = p.cond(natural(z));
    const nu = p.cond(natural(u)), nv = p.cond(natural(v));
    const left = p.use('.setAddSwap', [a, z, v], na, nz, nv);
    const right = p.use('.setAddSwap', [b, z, u], nb, nz, nu);
    const h = p.cond(`${a}+${v}=${b}+${u}`);
    const plus = p.rewrite(h, p.step('a7', `(${a}+${v})+${z}`), `(${a}+${v})+${z}=#+${z}`);
    const fwd = p.rewrite(p.step('.=s', right), p.rewrite(p.step('.=s', left), plus, `#=(${b}+${u})+${z}`), `(${a}+${z})+${v}=#`);
    p.pop();
    const hs = p.cond(`(${a}+${z})+${v}=(${b}+${z})+${u}`);
    const equal = p.rewrite(right, p.rewrite(left, hs, `#=(${b}+${z})+${u}`), `(${a}+${v})+${z}=#`);
    const nav = p.use('.+@N', [a, v], na, nv), nbu = p.use('.+@N', [b, u], nb, nu);
    const back = p.use('.+e', [`${a}+${v}`, `${b}+${u}`, z], nav, nbu, nz, equal);
    p.pop();
    return p.step('.<>', fwd, back);
});
theorem('.setZShift', ['$a', '$b', '$z'], (a, b, z) => imp(natural(a), imp(natural(b), imp(natural(z), `Z((${a},${b}))=Z((${a}+${z},${b}+${z}))`))), (p, a, b, z) => {
    const na = p.cond(natural(a)), nb = p.cond(natural(b)), nz = p.cond(natural(z));
    const az = `${a}+${z}`, bz = `${b}+${z}`;
    const naz = p.use('.+@N', [a, z], na, nz), nbz = p.use('.+@N', [b, z], nb, nz);
    const pairN = p.step('.Xi', na, nb), shiftedN = p.step('.Xi', naz, nbz);
    const def = (left, right, domain) => {
        let d = p.mp(p.spec(p.step('dfZ'), pair(left, right)), domain);
        d = p.rewrite(p.step('.Pr1', left, right), d, `Z((${left},${right}))={y∈ℕ×ℕ|#+pr2(y)=pr2((${left},${right}))+pr1(y)}`);
        return p.rewrite(p.step('.Pr2', left, right), d, `Z((${left},${right}))={y∈ℕ×ℕ|${left}+pr2(y)=#+pr1(y)}`);
    };
    const d1 = def(a, b, pairN), d2 = def(az, bz, shiftedN);
    p.variable('#e');
    const sep = (left, right, definition) => {
        const general = p.step('vdsep', 'y', 'y', 'ℕ×ℕ', `${left}+pr2(y)=${right}+pr1(y)`);
        const concrete = p.spec(general, '#e');
        return p.rewrite(p.step('.=s', definition), concrete, `(#e∈#↔(#e∈ℕ×ℕ∧${left}+pr2(#e)=${right}+pr1(#e)))`);
    };
    const iff1 = sep(a, b, d1), iff2 = sep(az, bz, d2);
    const first = `#e∈Z((${a},${b}))`, second = `#e∈Z((${az},${bz}))`;
    const direction = (from, to, hypothesis, reverse) => {
        const h = p.cond(hypothesis), facts = p.forward(from, h);
        const domain = p.step('./\\1', facts), equation = p.step('./\\2', facts);
        const ns = p.step('.Xe', domain);
        const balance = p.use('.setShiftBalance', [a, b, z, 'pr1(#e)', 'pr2(#e)'], na, nb, nz, p.step('./\\1', ns), p.step('./\\2', ns));
        const rewritten = reverse ? p.backward(balance, equation) : p.forward(balance, equation);
        const result = p.backward(to, p.conjunction(domain, rewritten));
        p.pop();
        return result;
    };
    const forward = direction(iff1, iff2, first, false), backward = direction(iff2, iff1, second, true);
    const equalMembers = p.step('.<>', forward, backward);
    p.pop();
    const renamed = p.step('.\\acn', equalMembers, 'z');
    return p.mp(p.spec(p.step('aext'), `Z((${a},${b}))`, `Z((${az},${bz}))`), renamed);
});
rules.push(String.raw `.Zr:$x∈ℕ,$y∈ℕ,$z∈ℕ⊢Z(($x,$y))=Z(($x+$z,$y+$z));d .setZShift $x $y $z;d mp 4 1;d mp 5 2;d mp 6 3;`);
theorem('.setZPairAddCommute', ['$x', '$y'], (x, y) => imp(member(x, 'ℕ×ℕ'), imp(member(y, 'ℕ×ℕ'), `Z(${x})+Z(${y})=Z(${y})+Z(${x})`)), (p, x, y) => {
    const hx = p.cond(member(x, 'ℕ×ℕ')), hy = p.cond(member(y, 'ℕ×ℕ'));
    const nx = p.step('.Xe', hx), ny = p.step('.Xe', hy);
    const first = p.use('dZ+', [x, y], hx, hy);
    const second = p.use('dZ+', [y, x], hy, hx);
    const swap1 = p.use('.+s', [`pr1(${x})`, `pr1(${y})`], p.step('./\\1', nx), p.step('./\\1', ny));
    const swap2 = p.use('.+s', [`pr2(${x})`, `pr2(${y})`], p.step('./\\2', nx), p.step('./\\2', ny));
    const swapped1 = p.rewrite(swap1, first, `Z(${x})+Z(${y})=Z((#,pr2(${x})+pr2(${y})))`);
    const swapped2 = p.rewrite(swap2, swapped1, `Z(${x})+Z(${y})=Z((pr1(${y})+pr1(${x}),#))`);
    return p.trans(swapped2, p.step('.=s', second), `Z(${x})+Z(${y})`);
});
theorem('.Z+s', ['$x', '$y'], (x, y) => imp(member(x, 'ℤ'), imp(member(y, 'ℤ'), `${x}+${y}=${y}+${x}`)), (p, x, y) => {
    const hx = p.cond(member(x, 'ℤ')), hy = p.cond(member(y, 'ℤ'));
    const representatives = (value, fact, binder) => {
        const inImage = p.rewrite(p.step('dZ'), fact, member(value, '#'));
        const original = p.forward(p.step('drepl', value, 'Z(x)', 'x', 'ℕ×ℕ'), inImage);
        return p.eliminate(original, 'x', and(member('x', 'ℕ×ℕ'), `Z(x)=${value}`), h => p.exists(binder, and(member(binder, 'ℕ×ℕ'), `Z(${binder})=${value}`), 'x', h));
    };
    const ex = representatives(x, hx, '#i'), ey = representatives(y, hy, '#j');
    return p.eliminate(ex, '#i', and(member('#i', 'ℕ×ℕ'), `Z(#i)=${x}`), hi => p.eliminate(ey, '#j', and(member('#j', 'ℕ×ℕ'), `Z(#j)=${y}`), hj => {
        const commuted = p.use('.setZPairAddCommute', ['#i', '#j'], p.step('./\\1', hi), p.step('./\\1', hj));
        const replaceX = p.rewrite(p.step('./\\2', hi), commuted, `#+Z(#j)=Z(#j)+#`);
        return p.rewrite(p.step('./\\2', hj), replaceX, `${x}+#=#+${x}`);
    }));
});
export const naturalSetBridgeTheorems = rules.slice(0, integerStart).join('\n');
export const integerSetTheorems = rules.slice(integerStart).join('\n');
export const numberSetTheorems = [naturalSetBridgeTheorems, integerSetTheorems].join('\n');
//# sourceMappingURL=number-set-proofs.js.map