const EMPTY_CAPTURES = new Map();
const EMPTY_COMPUTE_RULES = new Map();
const EMPTY_OPAQUE_DEFINITIONS = new Set();
const DIRECT_COMPUTE_HEADS = new Set(["add", "mul", "pow", "pred", "succ", "@succ", "@max"]);
const EMPTY_CONTEXT_BINDINGS = {
    entries: [],
    bindings: [],
    nextId: 1
};
const contextBindingSnapshots = new WeakMap();
function step(state) {
    state.steps++;
    // Checking the clock every semantic step is disproportionately expensive
    // on large proof saves. The first step catches an already-expired probe;
    // subsequent checks bound overshoot to 63 evaluator steps.
    if (state.steps > state.maxSteps
        || (state.deadline !== undefined
            && (state.steps === 1 || (state.steps & 63) === 0)
            && Date.now() >= state.deadline)) {
        state.exhausted = true;
        return false;
    }
    return true;
}
function validId(id) {
    return Number.isFinite(id) && id > 0;
}
function contextBindings(context) {
    if (!context.length)
        return EMPTY_CONTEXT_BINDINGS;
    const cached = contextBindingSnapshots.get(context);
    if (cached && cached.entries.length === context.length
        && cached.entries[0] === context[0]
        && cached.entries[context.length - 1] === context[context.length - 1]) {
        return cached;
    }
    let nextId = 1;
    const bindings = context.map(([name, , id], index) => {
        if (validId(id))
            nextId = Math.max(nextId, id + 1);
        return {
            name,
            id: validId(id) ? id : undefined,
            key: validId(id) ? `context-id:${id}` : `context-name:${index}:${name}`
        };
    });
    const snapshot = {
        entries: Array.from(context),
        bindings,
        nextId
    };
    contextBindingSnapshots.set(context, snapshot);
    return snapshot;
}
function findScopeIndex(ast, scope) {
    if (validId(ast.bondVarId)) {
        for (let index = 0; index < scope.length; index++) {
            if (scope[index].id === ast.bondVarId)
                return index;
        }
        return -1;
    }
    for (let index = 0; index < scope.length; index++) {
        // Name lookup is only sound for a wholly unmarked syntax tree. Once
        // a binder has an identity, an id-less same-name variable can be an
        // intentionally free constant inserted by substitution. Treating it
        // as bound here captures values such as the global `g` in
        // `Pf:...,Pg:...` after applying the first binder to `g`.
        if (!validId(scope[index].id) && scope[index].name === ast.name)
            return index;
    }
    return -1;
}
function findContextBinding(ast, context) {
    if (validId(ast.bondVarId)) {
        return context.find(binding => binding.id === ast.bondVarId);
    }
    return context.find(binding => binding.name === ast.name);
}
function compile(ast, scope, context, state, allowMetas = false, rigidMetas = false, rigidHoles = false) {
    if (!ast || typeof ast !== "object" || !step(state))
        return null;
    if (ast.origin && typeof ast.origin === "object")
        return null;
    if (ast.type === "whnf" || ast.type === ":" || ast.type === ":=" || ast.type === "===")
        return null;
    if (ast.type === "var") {
        if (!ast.name)
            return null;
        // Generalized system aliases (for example `rfl := refl _`) retain
        // their source holes for lazy computation-rule matching.  Treat such
        // holes as opaque neutral values; quote them back as `_` below.
        if (ast.name === "_") {
            return rigidHoles ? { kind: "free", key: "hole:_" } : null;
        }
        if (ast.name.startsWith("?")) {
            if (allowMetas)
                return { kind: "meta", name: ast.name };
            return rigidMetas ? { kind: "free", key: `infer:${ast.name}` } : null;
        }
        const index = findScopeIndex(ast, scope);
        if (index >= 0)
            return { kind: "bound", index };
        const contextBinding = findContextBinding(ast, context);
        if (contextBinding)
            return { kind: "free", key: contextBinding.key };
        if (validId(ast.bondVarId))
            return null;
        return { kind: "free", key: `constant:${ast.name}`, definitionName: ast.name };
    }
    if (ast.type === "L") {
        const domain = compile(ast.nodes?.[0], scope, context, state, allowMetas, rigidMetas, rigidHoles);
        const body = compile(ast.nodes?.[1], [{ name: ast.name, id: validId(ast.bondVarId) ? ast.bondVarId : undefined }, ...scope], context, state, allowMetas, rigidMetas, rigidHoles);
        return domain && body ? { kind: "lambda", name: ast.name, domain, body } : null;
    }
    if (ast.type === "P" || ast.type === "S" || ast.type === "W") {
        const domain = compile(ast.nodes?.[0], scope, context, state, allowMetas, rigidMetas, rigidHoles);
        const body = compile(ast.nodes?.[1], [{ name: ast.name, id: validId(ast.bondVarId) ? ast.bondVarId : undefined }, ...scope], context, state, allowMetas, rigidMetas, rigidHoles);
        return domain && body ? { kind: "binder", binder: ast.type, name: ast.name, domain, body } : null;
    }
    if (ast.type === "apply") {
        const fn = compile(ast.nodes?.[0], scope, context, state, allowMetas, rigidMetas, rigidHoles);
        const arg = compile(ast.nodes?.[1], scope, context, state, allowMetas, rigidMetas, rigidHoles);
        return fn && arg ? { kind: "application", fn, arg } : null;
    }
    const children = [];
    for (const child of ast.nodes ?? []) {
        const compiled = compile(child, scope, context, state, allowMetas, rigidMetas, rigidHoles);
        if (!compiled)
            return null;
        children.push(compiled);
    }
    return { kind: "rigid", type: ast.type, name: ast.name, children };
}
/** Keep nested schematic holes in a computation result, but reject a bare
 * hole because it does not determine a semantic result. */
function compileRuleResult(ast, state) {
    if (ast?.type === "var" && ast.name === "_")
        return null;
    return compile(ast, [], [], state, true, false, true);
}
function compilePattern(ast, state, topLevelWildcard = false) {
    return compilePatternInScope(ast, state, topLevelWildcard, []);
}
function compilePatternInScope(ast, state, topLevelWildcard, scope) {
    if (!ast || typeof ast !== "object" || !step(state))
        return null;
    if (ast.type === "var") {
        // In a computation rule, an underscore is a pattern wildcard at any
        // depth.  The RHS compiler deliberately keeps `_` unsupported, so
        // this cannot turn an unresolved inference hole into a value.
        if (ast.name === "_")
            return { kind: "wildcard" };
        if (ast.name?.startsWith("?"))
            return { kind: "capture", name: ast.name };
        const boundIndex = findScopeIndex(ast, scope);
        if (boundIndex >= 0)
            return { kind: "bound", index: boundIndex };
        if (!ast.name || validId(ast.bondVarId))
            return null;
        return { kind: "free", key: `constant:${ast.name}` };
    }
    if (ast.type === "apply") {
        const fn = compilePatternInScope(ast.nodes?.[0], state, false, scope);
        const arg = compilePatternInScope(ast.nodes?.[1], state, false, scope);
        return fn && arg ? { kind: "application", fn, arg } : null;
    }
    if (ast.type === "L" || ast.type === "P" || ast.type === "S" || ast.type === "W") {
        const domain = compilePatternInScope(ast.nodes?.[0], state, false, scope);
        const body = compilePatternInScope(ast.nodes?.[1], state, false, [{ name: ast.name, id: validId(ast.bondVarId) ? ast.bondVarId : undefined }, ...scope]);
        return domain && body
            ? { kind: "binder", binder: ast.type, domain, body }
            : null;
    }
    if (ast.type === "whnf" || ast.type === ":" || ast.type === ":=" || ast.type === "===")
        return null;
    const children = [];
    for (const child of ast.nodes ?? []) {
        const compiled = compilePatternInScope(child, state, false, scope);
        if (!compiled)
            return null;
        children.push(compiled);
    }
    return { kind: "rigid", type: ast.type, name: ast.name, children };
}
function collectPatternCaptures(pattern, result = new Set()) {
    if (pattern.kind === "capture")
        result.add(pattern.name);
    else if (pattern.kind === "application") {
        collectPatternCaptures(pattern.fn, result);
        collectPatternCaptures(pattern.arg, result);
    }
    else if (pattern.kind === "binder") {
        collectPatternCaptures(pattern.domain, result);
        collectPatternCaptures(pattern.body, result);
    }
    else if (pattern.kind === "rigid") {
        for (const child of pattern.children)
            collectPatternCaptures(child, result);
    }
    return result;
}
function collectTermMetas(term, result = new Set()) {
    const stack = [term];
    while (stack.length) {
        const current = stack.pop();
        if (current.kind === "meta")
            result.add(current.name);
        else if (current.kind === "lambda")
            stack.push(current.domain, current.body);
        else if (current.kind === "binder")
            stack.push(current.domain, current.body);
        else if (current.kind === "application")
            stack.push(current.fn, current.arg);
        else if (current.kind === "rigid")
            stack.push(...current.children);
    }
    return result;
}
function collectDefinitionDependencies(term, result = new Set()) {
    const stack = [term];
    while (stack.length) {
        const current = stack.pop();
        if (current.kind === "free") {
            if (current.definitionName)
                result.add(current.definitionName);
        }
        else if (current.kind === "meta") {
            continue;
        }
        else if (current.kind === "lambda") {
            stack.push(current.domain, current.body);
        }
        else if (current.kind === "binder") {
            stack.push(current.domain, current.body);
        }
        else if (current.kind === "application") {
            stack.push(current.fn, current.arg);
        }
        else if (current.kind === "rigid") {
            stack.push(...current.children);
        }
    }
    return result;
}
function collectTransitiveDefinitionDependencies(term, definitions, dependencies) {
    const result = collectDefinitionDependencies(term);
    const pending = Array.from(result);
    while (pending.length) {
        const name = pending.pop();
        for (const dependency of dependencies.get(name) ?? []) {
            if (result.has(dependency))
                continue;
            result.add(dependency);
            pending.push(dependency);
        }
    }
    for (const name of Array.from(result)) {
        if (!definitions.has(name))
            result.delete(name);
    }
    return result;
}
function sharedDefinitionBarriers(left, right, definitions, dependencies, opaqueDefinitions) {
    if (!dependencies?.size || !definitions.size)
        return null;
    const leftDependencies = collectTransitiveDefinitionDependencies(left, definitions, dependencies);
    if (!leftDependencies.size)
        return null;
    const rightDependencies = collectTransitiveDefinitionDependencies(right, definitions, dependencies);
    const barriers = new Set();
    const [smaller, larger] = leftDependencies.size <= rightDependencies.size
        ? [leftDependencies, rightDependencies]
        : [rightDependencies, leftDependencies];
    for (const name of smaller) {
        if (larger.has(name) && !opaqueDefinitions.has(name))
            barriers.add(name);
    }
    return barriers.size ? barriers : null;
}
/**
 * Definitional equality is reflexive before any reduction is needed. Keep
 * metavariables and input holes unsupported here because they require the
 * elaborator rather than a closed semantic equality decision.
 */
function syntaxReflectsEqual(left, right, rigidMetas) {
    const pending = [[left, right]];
    while (pending.length) {
        const [a, b] = pending.pop();
        if (!a || !b || a.type !== b.type || a.name !== b.name)
            return false;
        if (a.type === "var"
            && (a.name === "_" || b.name === "_"
                || (!rigidMetas && (a.name?.startsWith("?") || b.name?.startsWith("?"))))) {
            return false;
        }
        if (a.bondVarId !== b.bondVarId)
            return false;
        const aNodes = a.nodes;
        const bNodes = b.nodes;
        if ((aNodes?.length ?? 0) !== (bNodes?.length ?? 0))
            return false;
        for (let index = 0; index < (aNodes?.length ?? 0); index++) {
            pending.push([aNodes[index], bNodes[index]]);
        }
    }
    return true;
}
/**
 * Cheap semantic-source fingerprint used to detect in-place UI edits. The
 * semantic compiler intentionally ignores checked metadata, so the
 * fingerprint does the same while retaining binder identity and structure.
 */
function sourceFingerprint(ast) {
    let hash = 2166136261 >>> 0;
    let nodes = 0;
    const mix = (text) => {
        for (let index = 0; index < text.length; index++) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619) >>> 0;
        }
    };
    const stack = [ast];
    while (stack.length) {
        const current = stack.pop();
        if (!current) {
            mix(")");
            continue;
        }
        nodes++;
        mix("(");
        mix(current.type ?? "");
        mix(":");
        mix(current.name ?? "");
        mix(":");
        mix(String(current.bondVarId ?? ""));
        mix(":");
        mix(current.origin && typeof current.origin === "object" ? "origin-object" : current.origin ? "origin" : "");
        stack.push(null);
        for (let index = (current.nodes?.length ?? 0) - 1; index >= 0; index--) {
            stack.push(current.nodes[index]);
        }
    }
    return `${nodes}:${hash >>> 0}`;
}
function delayed(term, environment, captures = EMPTY_CAPTURES) {
    return { term, environment, captures };
}
function known(value) {
    return { value };
}
function force(thunk, state) {
    if (thunk.value)
        return thunk.value;
    if (!thunk.term || !thunk.environment)
        return null;
    const value = evaluate(thunk.term, thunk.environment, state, thunk.captures);
    if (value)
        thunk.value = value;
    return value;
}
function hasDefinition(name, state) {
    return state.definitions.has(name) || !!state.definitionSources?.has(name);
}
function getDefinitionTerm(name, state) {
    const compiled = state.definitions.get(name);
    if (compiled)
        return compiled;
    const source = state.definitionSources?.get(name);
    if (!source)
        return null;
    const cached = state.sourceTerms?.get(name);
    if (cached !== undefined)
        return cached;
    // Source aliases may contain generalized `_` holes.  Compile them only
    // for a lazy probe; ordinary eager evaluation never supplies this map.
    const term = compile(source, [], [], state, false, true, true);
    state.sourceTerms?.set(name, term);
    return term;
}
function evaluate(term, environment, state, captures = EMPTY_CAPTURES) {
    if (!step(state))
        return null;
    if (term.kind === "bound")
        return force(environment[term.index], state);
    if (term.kind === "meta") {
        const captured = captures.get(term.name);
        return captured ? force(captured, state) : null;
    }
    if (term.kind === "free") {
        const neutral = {
            kind: "neutral",
            head: { kind: "free", key: term.key },
            spine: [],
            definitionName: term.definitionName
        };
        const definition = term.definitionName && getDefinitionTerm(term.definitionName, state);
        if (definition && !state.opaqueDefinitions.has(term.definitionName)
            && state.lazyDefinitions)
            return neutral;
        if (definition && !state.opaqueDefinitions.has(term.definitionName)
            && !state.unfolding.has(term.definitionName)) {
            const cached = state.definitionValues.get(term.definitionName);
            if (cached)
                return cached;
            state.unfolding.add(term.definitionName);
            const value = evaluate(definition, [], state, EMPTY_CAPTURES);
            state.unfolding.delete(term.definitionName);
            if (value) {
                state.definitionValues.set(term.definitionName, value);
                return value;
            }
        }
        const reduced = tryComputeNeutral(neutral, state);
        return reduced === undefined ? neutral : reduced;
    }
    if (term.kind === "lambda")
        return {
            kind: "lambda",
            name: term.name,
            domain: delayed(term.domain, environment, captures),
            body: term.body,
            environment,
            captures
        };
    if (term.kind === "binder") {
        return {
            kind: "binder",
            binder: term.binder,
            name: term.name,
            domain: delayed(term.domain, environment, captures),
            body: term.body,
            environment,
            captures
        };
    }
    if (term.kind === "application") {
        const args = [];
        let head = term;
        while (head.kind === "application") {
            args.unshift(delayed(head.arg, environment, captures));
            head = head.fn;
        }
        // Transparent arithmetic aliases such as `mul` normally unfold before
        // applyMany sees their arguments.  For closed naturals that bypasses
        // the BigInt reducer and builds a Peano-sized `succ` stack instead.
        // Probe the definitionally equivalent direct reduction first, while
        // retaining ordinary delta reduction for open or unsupported terms.
        if (head.kind === "free" && head.definitionName
            && DIRECT_COMPUTE_HEADS.has(head.definitionName)) {
            const direct = tryDirectComputeNeutral({
                kind: "neutral",
                head: { kind: "free", key: head.key },
                spine: args,
                definitionName: head.definitionName
            }, state);
            if (direct !== undefined)
                return direct;
        }
        const fn = evaluate(head, environment, state, captures);
        if (!fn)
            return null;
        return applyMany(fn, args, state);
    }
    return {
        kind: "rigid",
        type: term.type,
        name: term.name,
        children: term.children.map(child => delayed(child, environment, captures))
    };
}
function apply(fn, arg, state) {
    return applyMany(fn, [arg], state);
}
function applyMany(fn, args, state) {
    let value = fn;
    let index = 0;
    while (index < args.length) {
        if (!step(state))
            return null;
        if (value.kind === "lambda") {
            const applied = evaluate(value.body, [args[index], ...value.environment], state, value.captures);
            if (!applied)
                return null;
            value = applied;
            index++;
            continue;
        }
        if (value.kind === "neutral") {
            const neutral = {
                kind: "neutral",
                head: value.head,
                spine: [...value.spine, ...args.slice(index)],
                definitionName: value.definitionName
            };
            const deferred = deferredDefinitionName(neutral, state);
            // Equality's lazy-delta probe must unfold a compiled definition
            // before considering a rule on that same head.  The proof-assistant
            // normalization path additionally supplies source aliases (such
            // as `rfl := refl _`); those aliases are intentionally allowed to
            // participate in rule matching without globally enabling delta.
            if (deferred && !state.definitionSources)
                return neutral;
            const reduced = tryComputeNeutral(neutral, state);
            // Keep definitions opaque for ordinary quoting, but still let a
            // computation rule inspect a transparent alias on demand.  This
            // is what makes `id2eqv rfl` match the compiled `refl` rule while
            // an unrelated named definition remains displayed by name.
            if (reduced !== undefined)
                return reduced;
            if (deferred)
                return neutral;
            return neutral;
        }
        value = { kind: "application", fn: value, arg: args[index++] };
    }
    return value;
}
function splitApplication(value) {
    if (value.kind === "application")
        return [value.fn, value.arg];
    if (value.kind !== "neutral" || !value.spine.length)
        return null;
    return [
        {
            kind: "neutral",
            head: value.head,
            spine: value.spine.slice(0, -1),
            definitionName: value.definitionName
        },
        value.spine[value.spine.length - 1]
    ];
}
function matchNatSuccessor(pattern, value, captures, state, bound) {
    if (pattern.fn.kind !== "free" || pattern.fn.key !== "constant:succ"
        || value.kind !== "neutral" || value.head.kind !== "free" || value.spine.length)
        return undefined;
    const literal = value.head.key.slice("constant:".length);
    if (!/^(0|[1-9][0-9]*)$/.test(literal))
        return undefined;
    const number = BigInt(literal);
    if (number === 0n)
        return false;
    return matchPattern(pattern.arg, known({
        kind: "neutral",
        head: { kind: "free", key: `constant:${number - 1n}` },
        spine: []
    }), captures, state, bound);
}
function matchPattern(pattern, thunk, captures, state, bound = []) {
    if (!step(state))
        return null;
    if (pattern.kind === "wildcard")
        return true;
    if (pattern.kind === "capture") {
        const captured = captures.get(pattern.name);
        if (!captured) {
            captures.set(pattern.name, thunk);
            return true;
        }
        return equalThunk(captured, thunk, 0, state);
    }
    if (pattern.kind === "bound") {
        const captured = bound[pattern.index];
        return captured ? equalThunk(captured, thunk, 0, state) : null;
    }
    const value = force(thunk, state);
    if (!value)
        return null;
    if (value.kind === "neutral" && value.definitionName
        && state.blockedPatternDefinitions?.has(value.definitionName))
        return null;
    const unfoldedMatch = withUnfoldedDefinition(value, state, unfolded => matchPattern(pattern, known(unfolded), captures, state, bound));
    if (unfoldedMatch !== undefined)
        return unfoldedMatch;
    if (pattern.kind === "free") {
        return value.kind === "neutral" && value.head.kind === "free"
            && value.head.key === pattern.key && value.spine.length === 0;
    }
    if (pattern.kind === "application") {
        const natMatch = matchNatSuccessor(pattern, value, captures, state, bound);
        if (natMatch !== undefined)
            return natMatch;
        const application = splitApplication(value);
        if (!application)
            return false;
        const fnMatches = matchPattern(pattern.fn, known(application[0]), captures, state, bound);
        if (fnMatches !== true)
            return fnMatches;
        return matchPattern(pattern.arg, application[1], captures, state, bound);
    }
    if (pattern.kind === "binder") {
        if (pattern.binder === "L") {
            if (value.kind !== "lambda")
                return false;
            const domainMatches = matchPattern(pattern.domain, value.domain, captures, state, bound);
            if (domainMatches !== true)
                return domainMatches;
            const fresh = { kind: "neutral", head: { kind: "level", level: bound.length }, spine: [] };
            const body = apply(value, known(fresh), state);
            if (!body)
                return null;
            return matchPattern(pattern.body, known(body), captures, state, [known(fresh), ...bound]);
        }
        if (value.kind !== "binder" || value.binder !== pattern.binder)
            return false;
        const domainMatches = matchPattern(pattern.domain, value.domain, captures, state, bound);
        if (domainMatches !== true)
            return domainMatches;
        const fresh = { kind: "neutral", head: { kind: "level", level: bound.length }, spine: [] };
        const body = evaluate(value.body, [known(fresh), ...value.environment], state, value.captures);
        if (!body)
            return null;
        return matchPattern(pattern.body, known(body), captures, state, [known(fresh), ...bound]);
    }
    if (pattern.kind !== "rigid")
        return false;
    if (value.kind !== "rigid" || value.type !== pattern.type || value.name !== pattern.name
        || value.children.length !== pattern.children.length)
        return false;
    for (let index = 0; index < pattern.children.length; index++) {
        const matches = matchPattern(pattern.children[index], value.children[index], captures, state, bound);
        if (matches !== true)
            return matches;
    }
    return true;
}
function neutralDefinitionName(value) {
    if (value.head.kind !== "free" || !value.head.key.startsWith("constant:"))
        return null;
    return value.head.key.slice("constant:".length);
}
function deferredDefinitionName(value, state) {
    if (!state.lazyDefinitions || value.kind !== "neutral" || !value.definitionName)
        return null;
    if (state.opaqueDefinitions.has(value.definitionName)
        || !hasDefinition(value.definitionName, state))
        return null;
    return value.definitionName;
}
function withDefinitionBody(name, state, use) {
    if (state.unfolding.has(name))
        return null;
    const definition = getDefinitionTerm(name, state);
    if (!definition)
        return null;
    state.unfolding.add(name);
    try {
        let body = state.definitionValues.get(name);
        if (!body) {
            body = evaluate(definition, [], state, EMPTY_CAPTURES);
            if (!body)
                return null;
            state.definitionValues.set(name, body);
        }
        return use(body);
    }
    finally {
        state.unfolding.delete(name);
    }
}
function withUnfoldedDefinition(value, state, use) {
    const name = deferredDefinitionName(value, state);
    if (!name || value.kind !== "neutral")
        return undefined;
    return withDefinitionBody(name, state, body => {
        const unfolded = applyMany(body, value.spine, state);
        return unfolded ? use(unfolded) : null;
    });
}
function equalAfterLazyDelta(left, right, level, state) {
    const leftName = deferredDefinitionName(left, state);
    const rightName = deferredDefinitionName(right, state);
    if (!leftName && !rightName)
        return undefined;
    if (leftName && rightName && leftName === rightName
        && left.kind === "neutral" && right.kind === "neutral") {
        return withDefinitionBody(leftName, state, body => {
            const leftUnfolded = applyMany(body, left.spine, state);
            const rightUnfolded = applyMany(body, right.spine, state);
            if (!leftUnfolded || !rightUnfolded)
                return null;
            return equalValue(leftUnfolded, rightUnfolded, level, state);
        });
    }
    if (leftName) {
        return withUnfoldedDefinition(left, state, leftUnfolded => {
            if (!rightName)
                return equalValue(leftUnfolded, right, level, state);
            const rightResult = withUnfoldedDefinition(right, state, rightUnfolded => equalValue(leftUnfolded, rightUnfolded, level, state));
            return rightResult === undefined ? null : rightResult;
        });
    }
    return withUnfoldedDefinition(right, state, rightUnfolded => equalValue(left, rightUnfolded, level, state));
}
function neutralConstant(name) {
    return { kind: "neutral", head: { kind: "free", key: `constant:${name}` }, spine: [] };
}
function naturalLiteral(value) {
    if (value.kind !== "neutral" || value.head.kind !== "free" || value.spine.length)
        return null;
    const name = value.head.key.slice("constant:".length);
    if (!/^(0|[1-9][0-9]*)$/.test(name))
        return null;
    try {
        return BigInt(name);
    }
    catch {
        return null;
    }
}
function universeLiteral(value) {
    if (value.kind !== "neutral" || value.head.kind !== "free" || value.spine.length)
        return null;
    const name = value.head.key.slice("constant:".length);
    if (!/^@(0|[1-9][0-9]*)$/.test(name))
        return null;
    try {
        return BigInt(name.slice(1));
    }
    catch {
        return null;
    }
}
function universeBaseKey(value) {
    if (value.kind !== "neutral" || value.spine.length)
        return null;
    if (value.head.kind === "level")
        return `level:${value.head.level}`;
    const name = neutralDefinitionName(value);
    if (name === "@succ" || name === "@max" || (name && /^@(0|[1-9][0-9]*)$/.test(name)))
        return null;
    return `free:${value.head.key}`;
}
function mergeUniverseLevels(left, right) {
    if (right.numeric !== null && (left.numeric === null || right.numeric > left.numeric)) {
        left.numeric = right.numeric;
    }
    for (const [key, atom] of right.atoms) {
        const current = left.atoms.get(key);
        if (!current || atom.offset > current.offset)
            left.atoms.set(key, atom);
    }
    return left;
}
function universeLevelFromValue(value, state) {
    if (!step(state))
        return null;
    const literal = universeLiteral(value);
    if (literal !== null)
        return { numeric: literal, atoms: new Map() };
    if (value.kind === "neutral") {
        const name = neutralDefinitionName(value);
        if (name === "@succ" && value.spine.length === 1) {
            const argument = force(value.spine[0], state);
            if (!argument)
                return null;
            const level = universeLevelFromValue(argument, state);
            if (!level)
                return null;
            if (level.numeric !== null)
                level.numeric++;
            for (const atom of level.atoms.values())
                atom.offset++;
            return level;
        }
        if (name === "@max" && value.spine.length >= 2) {
            const level = { numeric: null, atoms: new Map() };
            for (const argumentThunk of value.spine) {
                const argument = force(argumentThunk, state);
                if (!argument)
                    return null;
                const argumentLevel = universeLevelFromValue(argument, state);
                if (!argumentLevel)
                    return null;
                mergeUniverseLevels(level, argumentLevel);
            }
            return level;
        }
    }
    const key = universeBaseKey(value);
    return key ? {
        numeric: null,
        atoms: new Map([[key, { base: value, offset: 0 }]])
    } : null;
}
function neutralApplication(name, args) {
    return {
        kind: "neutral",
        head: { kind: "free", key: `constant:${name}` },
        spine: args.map(known)
    };
}
function universeLevelValue(level, state) {
    const values = [];
    const numericDominated = level.numeric !== null && Array.from(level.atoms.values()).some(atom => BigInt(atom.offset) >= level.numeric);
    if (level.numeric !== null && (!numericDominated || level.atoms.size === 0)) {
        values.push(neutralConstant(`@${level.numeric}`));
    }
    const atoms = Array.from(level.atoms.entries()).sort(([left], [right]) => left.localeCompare(right));
    for (const [, atom] of atoms) {
        let value = atom.base;
        for (let offset = 0; offset < atom.offset; offset++) {
            if (!step(state))
                return null;
            value = neutralApplication("@succ", [value]);
        }
        values.push(value);
    }
    if (!values.length)
        return neutralConstant("@0");
    let result = values[0];
    for (let index = 1; index < values.length; index++) {
        if (!step(state))
            return null;
        result = neutralApplication("@max", [result, values[index]]);
    }
    return result;
}
function universeLevelAstShape(ast, rigidMetas = false) {
    if (!ast || typeof ast !== "object")
        return false;
    if (ast.type === "var") {
        return !!ast.name && ast.name !== "_"
            && (rigidMetas || !ast.name.startsWith("?"))
            && (validId(ast.bondVarId) || (ast.name !== "@succ" && ast.name !== "@max"));
    }
    if (ast.type !== "apply")
        return false;
    const args = [];
    let head = ast;
    while (head.type === "apply") {
        args.unshift(head.nodes?.[1]);
        head = head.nodes?.[0];
    }
    if (head.type !== "var" || validId(head.bondVarId))
        return false;
    if (head.name === "@succ") {
        return args.length === 1 && universeLevelAstShape(args[0], rigidMetas);
    }
    return head.name === "@max" && args.length >= 2
        && args.every(argument => universeLevelAstShape(argument, rigidMetas));
}
function closedNatAstShape(ast) {
    let current = ast;
    let steps = 0;
    while (current?.type === "apply") {
        if (++steps > 512)
            return false;
        const head = current.nodes?.[0];
        if (head?.type !== "var" || head.bondVarId || head.name !== "succ")
            return false;
        current = current.nodes?.[1];
    }
    return current?.type === "var" && !current.bondVarId
        && /^(0|[1-9][0-9]*)$/.test(current.name ?? "");
}
function applyConstant(name, args, state) {
    return applyMany(neutralConstant(name), args, state);
}
function tryDirectComputeNeutral(value, state) {
    const name = neutralDefinitionName(value);
    if (name === "@succ" && value.spine.length === 1) {
        const argument = force(value.spine[0], state);
        if (!argument)
            return null;
        const level = universeLevelFromValue(argument, state);
        if (!level)
            return null;
        if (level.numeric !== null)
            level.numeric++;
        for (const atom of level.atoms.values())
            atom.offset++;
        return universeLevelValue(level, state);
    }
    if (name === "@max" && value.spine.length >= 2) {
        const level = { numeric: null, atoms: new Map() };
        for (const argumentThunk of value.spine) {
            const argument = force(argumentThunk, state);
            if (!argument)
                return null;
            const argumentLevel = universeLevelFromValue(argument, state);
            if (!argumentLevel)
                return null;
            mergeUniverseLevels(level, argumentLevel);
        }
        return universeLevelValue(level, state);
    }
    if ((name === "add" || name === "mul" || name === "pow") && value.spine.length === 2) {
        const left = force(value.spine[0], state);
        const right = force(value.spine[1], state);
        if (!left || !right)
            return null;
        if (right.kind === "neutral" && right.head.kind === "free"
            && right.head.key === "constant:succ" && right.spine.length === 1) {
            const recursive = applyConstant(name, [value.spine[0], right.spine[0]], state);
            if (!recursive)
                return null;
            if (name === "add")
                return applyConstant("succ", [known(recursive)], state);
            return applyConstant(name === "mul" ? "add" : "mul", [known(recursive), value.spine[0]], state);
        }
        const rightLiteral = naturalLiteral(right);
        if (rightLiteral === 0n) {
            if (name === "add")
                return left;
            return neutralConstant(name === "pow" ? "1" : "0");
        }
        if (rightLiteral === 1n) {
            if (name === "add")
                return applyConstant("succ", [value.spine[0]], state);
            // The right unit is definitionally neutral for multiplication and
            // exponentiation even when the left operand is still open. Do not
            // introduce a stuck `add 0 x` / `mul 1 x` wrapper: return the
            // already-forced left value directly.
            return left;
        }
        const leftLiteral = naturalLiteral(left);
        if (leftLiteral === null || rightLiteral === null)
            return undefined;
        if (name === "pow") {
            if (leftLiteral === 0n || leftLiteral === 1n)
                return neutralConstant(String(leftLiteral));
            const remainingSteps = Math.max(1, state.maxSteps - state.steps);
            const baseBits = BigInt(leftLiteral.toString(2).length);
            if (rightLiteral > BigInt(remainingSteps) / baseBits) {
                // This is an intentional semantic work bound rather than an
                // unsupported syntax path.  Preserve the distinction for the
                // public equality result so the checker can report a resource
                // limit (and still retain its syntax fallback when enabled).
                state.exhausted = true;
                return null;
            }
        }
        try {
            const result = name === "add"
                ? leftLiteral + rightLiteral
                : name === "mul"
                    ? leftLiteral * rightLiteral
                    : leftLiteral ** rightLiteral;
            return neutralConstant(String(result));
        }
        catch {
            return undefined;
        }
    }
    if ((name === "pred" || name === "succ") && value.spine.length === 1) {
        const argument = force(value.spine[0], state);
        if (!argument)
            return null;
        const literal = naturalLiteral(argument);
        if (literal === null)
            return undefined;
        return neutralConstant(String(name === "pred" ? (literal > 0n ? literal - 1n : 0n) : literal + 1n));
    }
    return undefined;
}
function tryComputeNeutral(value, state) {
    if (value.definitionName && state.blockedPatternDefinitions?.has(value.definitionName))
        return undefined;
    const direct = tryDirectComputeNeutral(value, state);
    if (direct !== undefined)
        return direct;
    const name = neutralDefinitionName(value);
    const rules = name && state.computeRules.get(name);
    if (!rules?.length)
        return undefined;
    for (const rule of rules) {
        if (rule.kind === "supported") {
            if (rule.arguments.length > value.spine.length)
                continue;
            const captures = new Map();
            let matched = true;
            for (let index = 0; index < rule.arguments.length; index++) {
                const result = matchPattern(rule.arguments[index], value.spine[index], captures, state);
                if (result === null)
                    return null;
                if (!result) {
                    matched = false;
                    break;
                }
            }
            if (!matched)
                continue;
            const reduced = evaluate(rule.result, [], state, captures);
            if (!reduced)
                return null;
            return applyMany(reduced, value.spine.slice(rule.arguments.length), state);
        }
        if (rule.arity > value.spine.length)
            continue;
        let possible = true;
        const captures = new Map();
        for (let index = 0; index < rule.precheck.length; index++) {
            const pattern = rule.precheck[index];
            if (!pattern)
                continue;
            const result = matchPattern(pattern, value.spine[index], captures, state);
            if (result === null)
                return null;
            if (!result) {
                possible = false;
                break;
            }
        }
        if (possible)
            return null;
    }
    return undefined;
}
function equalHead(left, right) {
    return left.kind === right.kind && (left.kind === "free"
        ? left.key === right.key
        : left.level === right.level);
}
function equalThunk(left, right, level, state) {
    if (left === right)
        return true;
    const leftValue = force(left, state);
    const rightValue = force(right, state);
    if (!leftValue || !rightValue)
        return null;
    return equalValue(leftValue, rightValue, level, state);
}
function equalValue(left, right, level, state) {
    if (left === right)
        return true;
    if (!step(state))
        return null;
    const rightMemo = state.equalityMemo?.get(left)?.get(right);
    if (rightMemo?.has(level))
        return rightMemo.get(level);
    const result = equalValueUncached(left, right, level, state);
    if (result !== null) {
        const memo = state.equalityMemo ??= new WeakMap();
        const leftMemo = memo.get(left) ?? new WeakMap();
        if (!memo.has(left))
            memo.set(left, leftMemo);
        const levels = leftMemo.get(right) ?? new Map();
        levels.set(level, result);
        leftMemo.set(right, levels);
        const reverseMemo = memo.get(right) ?? new WeakMap();
        if (!memo.has(right))
            memo.set(right, reverseMemo);
        const reverseLevels = reverseMemo.get(left) ?? new Map();
        reverseLevels.set(level, result);
        reverseMemo.set(left, reverseLevels);
    }
    return result;
}
function equalValueUncached(left, right, level, state) {
    if (left.kind === "lambda" && right.kind === "lambda") {
        const domainEqual = equalThunk(left.domain, right.domain, level, state);
        if (domainEqual !== true)
            return domainEqual;
    }
    if (left.kind === "lambda" || right.kind === "lambda") {
        const fresh = { kind: "neutral", head: { kind: "level", level }, spine: [] };
        const leftBody = apply(left, known(fresh), state);
        const rightBody = apply(right, known(fresh), state);
        if (!leftBody || !rightBody)
            return null;
        return equalValue(leftBody, rightBody, level + 1, state);
    }
    if (left.kind !== right.kind) {
        const deltaEqual = equalAfterLazyDelta(left, right, level, state);
        return deltaEqual === undefined ? false : deltaEqual;
    }
    if (left.kind === "binder") {
        const other = right;
        if (left.binder !== other.binder)
            return false;
        const domainEqual = equalThunk(left.domain, other.domain, level, state);
        if (domainEqual !== true)
            return domainEqual;
        const fresh = { kind: "neutral", head: { kind: "level", level }, spine: [] };
        const leftBody = evaluate(left.body, [known(fresh), ...left.environment], state, left.captures);
        const rightBody = evaluate(other.body, [known(fresh), ...other.environment], state, other.captures);
        if (!leftBody || !rightBody)
            return null;
        return equalValue(leftBody, rightBody, level + 1, state);
    }
    if (left.kind === "neutral") {
        const other = right;
        if (!equalHead(left.head, other.head) || left.spine.length !== other.spine.length) {
            const deltaEqual = equalAfterLazyDelta(left, other, level, state);
            return deltaEqual === undefined ? false : deltaEqual;
        }
        for (let index = 0; index < left.spine.length; index++) {
            const equal = equalThunk(left.spine[index], other.spine[index], level, state);
            if (equal !== true) {
                const deltaEqual = equalAfterLazyDelta(left, other, level, state);
                return deltaEqual === undefined ? equal : deltaEqual;
            }
        }
        return true;
    }
    if (left.kind === "application") {
        const other = right;
        const fnEqual = equalValue(left.fn, other.fn, level, state);
        if (fnEqual !== true)
            return fnEqual;
        return equalThunk(left.arg, other.arg, level, state);
    }
    const other = right;
    if (left.type !== other.type || left.name !== other.name || left.children.length !== other.children.length)
        return false;
    for (let index = 0; index < left.children.length; index++) {
        const equal = equalThunk(left.children[index], other.children[index], level, state);
        if (equal !== true)
            return equal;
    }
    return true;
}
function nextQuoteId(state) {
    return state.freshBondVarId ? state.freshBondVarId() : state.nextId++;
}
function quoteContextHead(key, context) {
    if (key === "hole:_")
        return { type: "var", name: "_" };
    if (key.startsWith("constant:")) {
        return { type: "var", name: key.slice("constant:".length) };
    }
    if (key.startsWith("infer:")) {
        return { type: "var", name: key.slice("infer:".length) };
    }
    if (key.startsWith("context-id:")) {
        const id = Number(key.slice("context-id:".length));
        const binding = context.find(entry => entry.id === id);
        return binding
            ? { type: "var", name: binding.name, bondVarId: id }
            : null;
    }
    if (key.startsWith("context-name:")) {
        const match = key.match(/^context-name:(\d+):(.*)$/s);
        if (!match)
            return null;
        const binding = context[Number(match[1])];
        return binding
            ? { type: "var", name: binding.name, bondVarId: validId(binding.id) ? binding.id : undefined }
            : { type: "var", name: match[2] };
    }
    return null;
}
function quoteLevelHead(level, state) {
    const binding = state.levels.get(level)?.at(-1);
    if (binding)
        return { type: "var", name: binding.name, bondVarId: binding.id };
    return { type: "var", name: `*${level}` };
}
function quoteNeutralHead(head, state) {
    if (head.kind === "level")
        return quoteLevelHead(head.level, state);
    return quoteContextHead(head.key, state.context);
}
function quoteThunk(thunk, state, quoteState) {
    const value = force(thunk, state);
    return value ? quoteValue(value, state, quoteState) : null;
}
function quoteValue(value, state, quoteState) {
    if (!step(state))
        return null;
    if (value.kind === "lambda") {
        const domain = quoteThunk(value.domain, state, quoteState);
        if (!domain)
            return null;
        const id = nextQuoteId(quoteState);
        const name = value.name && value.name !== "_" ? value.name : `*${id}`;
        const level = quoteState.depth++;
        const stack = quoteState.levels.get(level) ?? [];
        stack.push({ id, name });
        quoteState.levels.set(level, stack);
        const fresh = { kind: "neutral", head: { kind: "level", level }, spine: [] };
        const bodyValue = apply(value, known(fresh), state);
        const body = bodyValue ? quoteValue(bodyValue, state, quoteState) : null;
        stack.pop();
        if (!stack.length)
            quoteState.levels.delete(level);
        quoteState.depth--;
        return body ? { type: "L", name, nodes: [domain, body], bondVarId: id } : null;
    }
    if (value.kind === "binder") {
        const domain = quoteThunk(value.domain, state, quoteState);
        if (!domain)
            return null;
        const id = nextQuoteId(quoteState);
        const name = value.name && value.name !== "_" ? value.name : `*${id}`;
        const level = quoteState.depth++;
        const stack = quoteState.levels.get(level) ?? [];
        stack.push({ id, name });
        quoteState.levels.set(level, stack);
        const fresh = { kind: "neutral", head: { kind: "level", level }, spine: [] };
        const bodyValue = evaluate(value.body, [known(fresh), ...value.environment], state, value.captures);
        const body = bodyValue ? quoteValue(bodyValue, state, quoteState) : null;
        stack.pop();
        if (!stack.length)
            quoteState.levels.delete(level);
        quoteState.depth--;
        return body
            ? { type: value.binder, name, nodes: [domain, body], bondVarId: id }
            : null;
    }
    if (value.kind === "neutral") {
        let result = quoteNeutralHead(value.head, quoteState);
        if (!result)
            return null;
        for (const argument of value.spine) {
            const arg = quoteThunk(argument, state, quoteState);
            if (!arg)
                return null;
            result = { type: "apply", name: "", nodes: [result, arg] };
        }
        return result;
    }
    if (value.kind === "application") {
        const fn = quoteValue(value.fn, state, quoteState);
        const arg = quoteThunk(value.arg, state, quoteState);
        return fn && arg ? { type: "apply", name: "", nodes: [fn, arg] } : null;
    }
    const children = [];
    for (const child of value.children) {
        const quoted = quoteThunk(child, state, quoteState);
        if (!quoted)
            return null;
        children.push(quoted);
    }
    return { type: value.type, name: value.name, nodes: children };
}
/*
 * Quote only the outer shape of a semantic value.  Unlike quoteValue, this
 * deliberately leaves the body of lambdas/binders and the children of rigid
 * constructors in their original syntax (apart from substitutions forced by
 * bound variables).  This is the immutable counterpart of Core.whnf.
 */
function quoteTermWhnf(term, environment, state, quoteState, captures = EMPTY_CAPTURES) {
    if (!step(state))
        return null;
    if (term.kind === "bound") {
        const thunk = environment[term.index];
        return thunk ? quoteThunkWhnf(thunk, state, quoteState) : null;
    }
    if (term.kind === "meta") {
        const thunk = captures.get(term.name);
        return thunk ? quoteThunkWhnf(thunk, state, quoteState) : null;
    }
    if (term.kind === "free") {
        return quoteNeutralHead({ kind: "free", key: term.key }, quoteState);
    }
    if (term.kind === "lambda" || term.kind === "binder") {
        const domain = quoteTermWhnf(term.domain, environment, state, quoteState, captures);
        if (!domain)
            return null;
        const id = nextQuoteId(quoteState);
        const name = term.name && term.name !== "_" ? term.name : `*${id}`;
        const level = quoteState.depth++;
        const stack = quoteState.levels.get(level) ?? [];
        stack.push({ id, name });
        quoteState.levels.set(level, stack);
        const fresh = { kind: "neutral", head: { kind: "level", level }, spine: [] };
        const body = quoteTermWhnf(term.body, [known(fresh), ...environment], state, quoteState, captures);
        stack.pop();
        if (!stack.length)
            quoteState.levels.delete(level);
        quoteState.depth--;
        if (!body)
            return null;
        return term.kind === "lambda"
            ? { type: "L", name, nodes: [domain, body], bondVarId: id }
            : { type: term.binder, name, nodes: [domain, body], bondVarId: id };
    }
    if (term.kind === "application") {
        const fn = quoteTermWhnf(term.fn, environment, state, quoteState, captures);
        const arg = quoteTermWhnf(term.arg, environment, state, quoteState, captures);
        return fn && arg ? { type: "apply", name: "", nodes: [fn, arg] } : null;
    }
    const children = [];
    for (const child of term.children) {
        const quoted = quoteTermWhnf(child, environment, state, quoteState, captures);
        if (!quoted)
            return null;
        children.push(quoted);
    }
    return { type: term.type, name: term.name, nodes: children };
}
function quoteThunkWhnf(thunk, state, quoteState) {
    if (thunk.value)
        return quoteValueWhnf(thunk.value, state, quoteState);
    if (!thunk.term || !thunk.environment)
        return null;
    return quoteTermWhnf(thunk.term, thunk.environment, state, quoteState, thunk.captures);
}
function quoteValueWhnf(value, state, quoteState) {
    if (!step(state))
        return null;
    if (value.kind === "lambda" || value.kind === "binder") {
        const domain = quoteThunkWhnf(value.domain, state, quoteState);
        if (!domain)
            return null;
        const id = nextQuoteId(quoteState);
        const name = value.name && value.name !== "_" ? value.name : `*${id}`;
        const level = quoteState.depth++;
        const stack = quoteState.levels.get(level) ?? [];
        stack.push({ id, name });
        quoteState.levels.set(level, stack);
        const fresh = { kind: "neutral", head: { kind: "level", level }, spine: [] };
        const body = quoteTermWhnf(value.body, [known(fresh), ...value.environment], state, quoteState, value.captures);
        stack.pop();
        if (!stack.length)
            quoteState.levels.delete(level);
        quoteState.depth--;
        if (!body)
            return null;
        return value.kind === "lambda"
            ? { type: "L", name, nodes: [domain, body], bondVarId: id }
            : { type: value.binder, name, nodes: [domain, body], bondVarId: id };
    }
    if (value.kind === "neutral") {
        let result = quoteNeutralHead(value.head, quoteState);
        if (!result)
            return null;
        for (const argument of value.spine) {
            const arg = quoteThunkWhnf(argument, state, quoteState);
            if (!arg)
                return null;
            result = { type: "apply", name: "", nodes: [result, arg] };
        }
        return result;
    }
    if (value.kind === "application") {
        const fn = quoteValueWhnf(value.fn, state, quoteState);
        const arg = quoteThunkWhnf(value.arg, state, quoteState);
        return fn && arg ? { type: "apply", name: "", nodes: [fn, arg] } : null;
    }
    const children = [];
    for (const child of value.children) {
        const quoted = quoteThunkWhnf(child, state, quoteState);
        if (!quoted)
            return null;
        children.push(quoted);
    }
    return { type: value.type, name: value.name, nodes: children };
}
function tryNormalizeWithDefinitions(ast, context, options, definitions, opaqueDefinitions, definitionValues, computeRules, lazyDefinitions = false, definitionSources) {
    const state = {
        steps: 0,
        maxSteps: options.maxSteps ?? 65_536,
        deadline: options.deadline,
        exhausted: false,
        definitions,
        definitionSources,
        sourceTerms: definitionSources ? new Map() : undefined,
        opaqueDefinitions,
        definitionValues,
        computeRules,
        unfolding: new Set(),
        lazyDefinitions
    };
    const contextSnapshot = contextBindings(context);
    const bindings = contextSnapshot.bindings;
    const term = compile(ast, [], bindings, state, false, options.rigidMetas === true);
    if (!term || state.exhausted)
        return null;
    const value = evaluate(term, [], state);
    if (!value || state.exhausted)
        return null;
    const quoteState = {
        context: bindings,
        levels: new Map(),
        depth: 0,
        nextId: contextSnapshot.nextId,
        freshBondVarId: options.freshBondVarId
    };
    const result = quoteValue(value, state, quoteState);
    return state.exhausted ? null : result;
}
function tryWhnfWithDefinitions(ast, context, options, definitions, opaqueDefinitions, definitionValues, computeRules, lazyDefinitions = false, definitionSources) {
    const state = {
        steps: 0,
        maxSteps: options.maxSteps ?? 65_536,
        deadline: options.deadline,
        exhausted: false,
        definitions,
        definitionSources,
        sourceTerms: definitionSources ? new Map() : undefined,
        opaqueDefinitions,
        definitionValues,
        computeRules,
        unfolding: new Set(),
        lazyDefinitions
    };
    const contextSnapshot = contextBindings(context);
    const bindings = contextSnapshot.bindings;
    const term = compile(ast, [], bindings, state, false, options.rigidMetas === true);
    if (!term || state.exhausted)
        return null;
    const value = evaluate(term, [], state);
    if (!value || state.exhausted)
        return null;
    const quoteState = {
        context: bindings,
        levels: new Map(),
        depth: 0,
        nextId: contextSnapshot.nextId,
        freshBondVarId: options.freshBondVarId
    };
    const result = quoteValueWhnf(value, state, quoteState);
    return state.exhausted ? null : result;
}
function equalCompiledTerms(leftTerm, rightTerm, state) {
    const leftValue = evaluate(leftTerm, [], state);
    const rightValue = evaluate(rightTerm, [], state);
    if (!leftValue || !rightValue || state.exhausted)
        return null;
    return equalValue(leftValue, rightValue, 0, state);
}
/**
 * Decide beta/eta definitional equality without mutating either AST. A null
 * result means the term needs elaboration or exhausted the evaluation budget.
 */
function tryEqualWithDefinitions(left, right, context, options, definitions, opaqueDefinitions, definitionValues, computeRules, dependencies) {
    if (options.deadline !== undefined && Date.now() >= options.deadline) {
        return "budget-exhausted";
    }
    if (syntaxReflectsEqual(left, right, options.rigidMetas === true))
        return true;
    const state = {
        steps: 0,
        maxSteps: options.maxSteps ?? 65_536,
        deadline: options.deadline,
        exhausted: false,
        definitions,
        opaqueDefinitions,
        definitionValues,
        computeRules,
        unfolding: new Set()
    };
    const bindings = contextBindings(context).bindings;
    const leftTerm = compile(left, [], bindings, state, false, options.rigidMetas === true);
    const rightTerm = compile(right, [], bindings, state, false, options.rigidMetas === true);
    if (!leftTerm || !rightTerm)
        return state.exhausted ? "budget-exhausted" : null;
    if (state.exhausted)
        return "budget-exhausted";
    let remainingSteps = Math.max(0, state.maxSteps - state.steps);
    const chargeProbe = (probe) => {
        const consumed = Math.min(remainingSteps, probe.steps);
        remainingSteps -= consumed;
        state.steps += consumed;
    };
    const barriers = sharedDefinitionBarriers(leftTerm, rightTerm, definitions, dependencies, opaqueDefinitions);
    if (barriers && remainingSteps > 0) {
        // A positive result under extra opacity is conservative: making a
        // transparent definition opaque can only remove reductions, never
        // introduce a new definitional equality. Keep this speculative cache
        // separate because semantic values depend on the opacity set.
        const barrierOpaqueDefinitions = new Set(opaqueDefinitions);
        for (const name of barriers)
            barrierOpaqueDefinitions.add(name);
        const barrierState = {
            steps: 0,
            maxSteps: Math.min(remainingSteps, 16_384),
            deadline: options.deadline,
            exhausted: false,
            definitions,
            opaqueDefinitions: barrierOpaqueDefinitions,
            definitionValues: new Map(),
            computeRules,
            unfolding: new Set(),
            blockedPatternDefinitions: barriers
        };
        const barrierResult = equalCompiledTerms(leftTerm, rightTerm, barrierState);
        chargeProbe(barrierState);
        if (barrierResult === true && !barrierState.exhausted)
            return true;
    }
    const leftDefinitionDependencies = collectDefinitionDependencies(leftTerm);
    const rightDefinitionDependencies = collectDefinitionDependencies(rightTerm);
    const leftHasDefinition = Array.from(leftDefinitionDependencies).some(name => definitions.has(name));
    const rightHasDefinition = Array.from(rightDefinitionDependencies).some(name => definitions.has(name));
    if (definitions.size && leftHasDefinition && rightHasDefinition && remainingSteps > 0) {
        // Keep lazy delta isolated from the eager semantic-value cache. Only a
        // positive result is authoritative; every miss continues through the
        // established eager semantic evaluator.
        const lazyState = {
            steps: 0,
            maxSteps: Math.min(remainingSteps, 32_768),
            deadline: options.deadline,
            exhausted: false,
            definitions,
            opaqueDefinitions,
            definitionValues: new Map(),
            computeRules,
            unfolding: new Set(),
            lazyDefinitions: true
        };
        const lazyResult = equalCompiledTerms(leftTerm, rightTerm, lazyState);
        chargeProbe(lazyState);
        if (lazyResult === true && !lazyState.exhausted)
            return true;
    }
    const result = equalCompiledTerms(leftTerm, rightTerm, state);
    return state.exhausted ? "budget-exhausted" : result;
}
export class SemanticNbeKernel {
    definitions = new Map();
    definitionValues = new Map();
    computeRules = new Map();
    opaqueDefinitions = new Set();
    definitionSources = new Map();
    definitionSourceFingerprints = new Map();
    dependencies = new Map();
    reverseDependencies = new Map();
    revision = 0;
    setDefinition(name, ast, options = {}) {
        const fingerprint = sourceFingerprint(ast);
        if (this.definitionSourceFingerprints.get(name) === fingerprint)
            return this.definitions.has(name);
        const state = {
            steps: 0,
            maxSteps: options.maxSteps ?? 65_536,
            deadline: options.deadline,
            exhausted: false,
            definitions: this.definitions,
            opaqueDefinitions: this.opaqueDefinitions,
            definitionValues: this.definitionValues,
            computeRules: this.computeRules,
            unfolding: new Set()
        };
        const term = compile(ast, [], [], state, false, options.rigidMetas === true);
        this.definitionSources.set(name, ast);
        if (!term || state.exhausted) {
            this.definitionSourceFingerprints.delete(name);
            const removed = this.definitions.delete(name);
            this.removeOutgoingDependencies(name);
            if (removed)
                this.invalidateDefinitionValues(name);
            return false;
        }
        this.removeOutgoingDependencies(name);
        this.definitions.set(name, term);
        this.definitionSourceFingerprints.set(name, fingerprint);
        this.addDependencies(name, term);
        this.invalidateDefinitionValues(name);
        return true;
    }
    replaceDefinitions(entries, options = {}) {
        const sources = new Map(entries);
        if (sources.size === this.definitionSources.size) {
            let unchanged = true;
            for (const [name, ast] of sources) {
                if (this.definitionSourceFingerprints.get(name) !== sourceFingerprint(ast)) {
                    unchanged = false;
                    break;
                }
            }
            if (unchanged)
                return this.definitions.size;
        }
        const compiled = new Map();
        for (const [name, ast] of sources) {
            const state = {
                steps: 0,
                maxSteps: options.maxSteps ?? 65_536,
                deadline: options.deadline,
                exhausted: false,
                definitions: compiled,
                opaqueDefinitions: this.opaqueDefinitions,
                definitionValues: new Map(),
                computeRules: this.computeRules,
                unfolding: new Set()
            };
            const term = compile(ast, [], [], state, false, options.rigidMetas === true);
            if (term && !state.exhausted)
                compiled.set(name, term);
        }
        this.definitions.clear();
        for (const [name, term] of compiled)
            this.definitions.set(name, term);
        this.definitionSources.clear();
        this.definitionSourceFingerprints.clear();
        for (const [name, ast] of sources)
            this.definitionSources.set(name, ast);
        for (const [name, ast] of sources) {
            if (compiled.has(name))
                this.definitionSourceFingerprints.set(name, sourceFingerprint(ast));
        }
        this.dependencies.clear();
        this.reverseDependencies.clear();
        for (const [name, term] of compiled)
            this.addDependencies(name, term);
        this.invalidateValues();
        return this.definitions.size;
    }
    deleteDefinition(name) {
        const hadSource = this.definitionSources.delete(name);
        this.definitionSourceFingerprints.delete(name);
        const removed = this.definitions.delete(name);
        this.removeOutgoingDependencies(name);
        if (hadSource || removed)
            this.invalidateDefinitionValues(name);
        return removed;
    }
    clearDefinitions() {
        if (!this.definitions.size && !this.definitionSources.size)
            return;
        this.definitions.clear();
        this.definitionSources.clear();
        this.definitionSourceFingerprints.clear();
        this.dependencies.clear();
        this.reverseDependencies.clear();
        this.invalidateValues();
    }
    replaceOpaqueDefinitions(names) {
        const next = new Set(names);
        if (next.size === this.opaqueDefinitions.size
            && Array.from(next).every(name => this.opaqueDefinitions.has(name))) {
            return this.opaqueDefinitions.size;
        }
        this.opaqueDefinitions.clear();
        for (const name of next)
            this.opaqueDefinitions.add(name);
        this.invalidateValues();
        return this.opaqueDefinitions.size;
    }
    replaceComputeRules(source, options = {}) {
        const compiled = new Map();
        let count = 0;
        for (const [name, rules] of Object.entries(source)) {
            const compiledRules = [];
            for (const rule of rules ?? []) {
                if (!rule.pattern?.length)
                    continue;
                const arity = rule.pattern.length - 1;
                const state = {
                    steps: 0,
                    maxSteps: options.maxSteps ?? 65_536,
                    deadline: options.deadline,
                    exhausted: false,
                    definitions: this.definitions,
                    opaqueDefinitions: this.opaqueDefinitions,
                    definitionValues: this.definitionValues,
                    computeRules: compiled,
                    unfolding: new Set()
                };
                const precheck = [];
                let supported = true;
                for (const ast of rule.pattern.slice(1)) {
                    const pattern = compilePattern(ast, state, true);
                    if (!pattern)
                        supported = false;
                    precheck.push(pattern);
                }
                const result = supported ? compileRuleResult(rule.result, state) : null;
                if (!result || state.exhausted) {
                    compiledRules.push({ kind: "unsupported", arity, precheck });
                    continue;
                }
                const argumentsPattern = precheck.filter((pattern) => !!pattern);
                const captures = new Set();
                for (const pattern of argumentsPattern)
                    collectPatternCaptures(pattern, captures);
                if (Array.from(collectTermMetas(result)).some(name => !captures.has(name))) {
                    compiledRules.push({ kind: "unsupported", arity, precheck });
                    continue;
                }
                compiledRules.push({ kind: "supported", arguments: argumentsPattern, result });
            }
            if (compiledRules.length) {
                compiled.set(name, compiledRules);
                count += compiledRules.length;
            }
        }
        this.computeRules.clear();
        for (const [name, rules] of compiled)
            this.computeRules.set(name, rules);
        this.invalidateValues();
        return count;
    }
    clearComputeRules() {
        if (!this.computeRules.size)
            return;
        this.computeRules.clear();
        this.invalidateValues();
    }
    tryEqual(left, right, context = [], options = {}) {
        const result = this.tryEqualResult(left, right, context, options);
        return result === "equal" ? true : result === "unequal" ? false : null;
    }
    tryEqualResult(left, right, context = [], options = {}) {
        const result = tryEqualWithDefinitions(left, right, context, options, this.definitions, this.opaqueDefinitions, this.definitionValues, this.computeRules, this.dependencies);
        return result === true
            ? "equal"
            : result === false
                ? "unequal"
                : result === "budget-exhausted"
                    ? result
                    : "unsupported";
    }
    /**
     * Normalize a supported term without mutating its source AST. A null
     * result means the term is unsupported or exhausted the evaluation budget.
     */
    tryNormalize(ast, context = [], options = {}) {
        const unfoldDefinitions = options.unfoldDefinitions !== false;
        return tryNormalizeWithDefinitions(ast, context, options, this.definitions, this.opaqueDefinitions, unfoldDefinitions ? this.definitionValues : new Map(), this.computeRules, !unfoldDefinitions, !unfoldDefinitions ? this.definitionSources : undefined);
    }
    /** Canonicalize only the built-in universe-level language. Named
     * definitions stay opaque so compact inferred types cannot be expanded as
     * a side effect of solving an unrelated level metavariable. */
    tryNormalizeUniverseLevel(ast, context = [], options = {}) {
        if (!universeLevelAstShape(ast, options.rigidMetas === true))
            return null;
        return tryNormalizeWithDefinitions(ast, context, options, new Map(), new Set(), new Map(), new Map());
    }
    /**
     * Reduce a supported term to weak-head normal form without mutating its
     * source AST. Bodies and constructor arguments remain syntactic unless a
     * substitution requires forcing a bound value.
     */
    tryWhnf(ast, context = [], options = {}) {
        const unfoldDefinitions = options.unfoldDefinitions !== false;
        return tryWhnfWithDefinitions(ast, context, options, this.definitions, this.opaqueDefinitions, unfoldDefinitions ? this.definitionValues : new Map(), this.computeRules, !unfoldDefinitions, !unfoldDefinitions ? this.definitionSources : undefined);
    }
    get definitionCount() {
        return this.definitions.size;
    }
    get cachedDefinitionCount() {
        return this.definitionValues.size;
    }
    get computeRuleCount() {
        let count = 0;
        for (const rules of this.computeRules.values())
            count += rules.length;
        return count;
    }
    get opaqueDefinitionCount() {
        return this.opaqueDefinitions.size;
    }
    hasDefinition(name) {
        return this.definitions.has(name);
    }
    getDefinitionSource(name) {
        return this.definitionSources.get(name);
    }
    hasComputeRules(name) {
        return this.computeRules.has(name);
    }
    hasReduction(name) {
        return DIRECT_COMPUTE_HEADS.has(name) || this.computeRules.has(name) || this.definitions.has(name);
    }
    hasComputeReduction(name) {
        return DIRECT_COMPUTE_HEADS.has(name) || this.computeRules.has(name);
    }
    canReduce(ast) {
        if (!ast || typeof ast !== "object")
            return false;
        const args = [];
        let head = ast;
        while (head.type === "apply") {
            args.unshift(head.nodes?.[1]);
            head = head.nodes?.[0];
        }
        if (head.type !== "var" || head.bondVarId)
            return false;
        if (head.name === "add" || head.name === "mul" || head.name === "pow")
            return args.length === 2;
        if (head.name === "pred" || head.name === "succ")
            return args.length === 1;
        if (head.name === "@succ")
            return args.length === 1 && universeLevelAstShape(args[0]);
        if (head.name === "@max")
            return args.length >= 2
                && args.every(argument => universeLevelAstShape(argument));
        const rules = this.computeRules.get(head.name);
        if (!rules?.length)
            return false;
        let hasSupportedRule = false;
        let unsupportedPossible = false;
        for (const rule of rules) {
            const arity = rule.kind === "supported" ? rule.arguments.length : rule.arity;
            if (arity > args.length)
                continue;
            if (rule.kind === "unsupported") {
                let possible = true;
                for (let index = 0; index < rule.precheck.length; index++) {
                    const pattern = rule.precheck[index];
                    if (pattern && !this.patternCouldMatchAst(pattern, args[index])) {
                        possible = false;
                        break;
                    }
                }
                if (possible)
                    unsupportedPossible = true;
                continue;
            }
            hasSupportedRule = true;
            let possible = true;
            for (let index = 0; index < rule.arguments.length; index++) {
                if (!this.patternCouldMatchAst(rule.arguments[index], args[index])) {
                    possible = false;
                    break;
                }
            }
            if (possible)
                return true;
        }
        // An unsupported rule is only a reason to probe NbE when it is the
        // sole description of this head. If a supported rule family exists
        // but none can match this AST shape, the semantic kernel would return
        // null without reducing the term.
        return !hasSupportedRule && unsupportedPossible;
    }
    /**
     * Conservative probe gate for Core. Open natural eliminations can take a
     * valid first iota step, but their recursive tail is intentionally opaque
     * to this kernel and would immediately return null. Exclude those terms
     * from the semantic-reduction probe while retaining canReduce's contract.
     */
    canSemanticReduce(ast) {
        if (!ast || typeof ast !== "object")
            return false;
        const args = [];
        let head = ast;
        while (head.type === "apply") {
            args.unshift(head.nodes?.[1]);
            head = head.nodes?.[0];
        }
        if (head.type === "var" && !head.bondVarId
            && (head.name === "ind_nat" || head.name === "@ind_nat")
            && args.length && !closedNatAstShape(args[args.length - 1])) {
            return false;
        }
        return this.canReduce(ast);
    }
    invalidateValues() {
        this.definitionValues.clear();
        this.revision++;
    }
    patternCouldMatchAst(pattern, ast) {
        if (pattern.kind === "wildcard" || pattern.kind === "capture" || pattern.kind === "bound")
            return true;
        if (!ast || typeof ast !== "object")
            return false;
        if (pattern.kind === "free") {
            return ast.type === "var" && !ast.bondVarId && pattern.key === `constant:${ast.name}`;
        }
        if (pattern.kind === "application") {
            if (pattern.fn.kind === "free" && pattern.fn.key === "constant:succ"
                && ast.type === "var" && /^(0|[1-9][0-9]*)$/.test(ast.name))
                return ast.name !== "0";
            return ast.type === "apply"
                && this.patternCouldMatchAst(pattern.fn, ast.nodes?.[0])
                && this.patternCouldMatchAst(pattern.arg, ast.nodes?.[1]);
        }
        if (pattern.kind === "binder") {
            // The body may contain bound-pattern variables, so this gate only
            // rejects a definitely different binder shape. Detailed matching
            // happens after semantic evaluation.
            return ast.type === pattern.binder;
        }
        if (ast.type !== pattern.type || ast.name !== pattern.name
            || ast.nodes?.length !== pattern.children.length)
            return false;
        for (let index = 0; index < pattern.children.length; index++) {
            if (!this.patternCouldMatchAst(pattern.children[index], ast.nodes[index]))
                return false;
        }
        return true;
    }
    addDependencies(name, term) {
        const dependencies = collectDefinitionDependencies(term);
        dependencies.delete(name);
        this.dependencies.set(name, dependencies);
        for (const dependency of dependencies) {
            const dependents = this.reverseDependencies.get(dependency) ?? new Set();
            dependents.add(name);
            this.reverseDependencies.set(dependency, dependents);
        }
    }
    removeOutgoingDependencies(name) {
        for (const dependency of this.dependencies.get(name) ?? []) {
            const dependents = this.reverseDependencies.get(dependency);
            dependents?.delete(name);
            if (!dependents?.size)
                this.reverseDependencies.delete(dependency);
        }
        this.dependencies.delete(name);
    }
    invalidateDefinitionValues(name) {
        const pending = [name];
        const visited = new Set();
        while (pending.length) {
            const current = pending.pop();
            if (visited.has(current))
                continue;
            visited.add(current);
            this.definitionValues.delete(current);
            for (const dependent of this.reverseDependencies.get(current) ?? [])
                pending.push(dependent);
        }
        this.revision++;
    }
}
export function tryNbeDefinitionalEqual(left, right, context = [], options = {}) {
    const result = tryEqualWithDefinitions(left, right, context, options, new Map(), EMPTY_OPAQUE_DEFINITIONS, new Map(), EMPTY_COMPUTE_RULES);
    return result === true ? true : result === false ? false : null;
}
export function tryNbeNormalize(ast, context = [], options = {}) {
    return tryNormalizeWithDefinitions(ast, context, options, new Map(), EMPTY_OPAQUE_DEFINITIONS, new Map(), EMPTY_COMPUTE_RULES);
}
export function tryNbeWhnf(ast, context = [], options = {}) {
    return tryWhnfWithDefinitions(ast, context, options, new Map(), EMPTY_OPAQUE_DEFINITIONS, new Map(), EMPTY_COMPUTE_RULES);
}
//# sourceMappingURL=nbe-kernel.js.map