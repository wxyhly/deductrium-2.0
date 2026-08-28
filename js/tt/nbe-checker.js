const success = (value) => ({ status: "success", value });
const invalid = (code) => ({ status: "invalid", code });
const unsupported = (code) => ({ status: "unsupported", code });
function validId(id) {
    return Number.isFinite(id) && id > 0;
}
function takeStep(state) {
    state.steps++;
    return state.steps <= state.maxSteps
        && (state.deadline === undefined || Date.now() < state.deadline);
}
function kernelOptions(state) {
    return {
        maxSteps: Math.max(1, state.maxSteps - state.steps),
        deadline: state.deadline,
        rigidMetas: state.metas.size > 0,
        freshBondVarId: state.freshBondVarId
    };
}
function allocateId(state) {
    let id;
    if (state.freshBondVarId) {
        for (let attempts = 0; attempts < 1024; attempts++) {
            const candidate = state.freshBondVarId();
            if (validId(candidate) && !state.usedIds.has(candidate)) {
                id = candidate;
                break;
            }
        }
    }
    if (!id) {
        id = Math.max(1, state.nextId);
        while (state.usedIds.has(id))
            id++;
    }
    state.usedIds.add(id);
    state.nextId = Math.max(state.nextId, id + 1);
    return id;
}
function allocateMeta(state) {
    let name;
    do
        name = `?nbe${state.nextMeta++}`;
    while (state.metas.has(name));
    state.metas.add(name);
    return name;
}
function isLocalMeta(ast, state) {
    return ast?.type === "var" && state.metas.has(ast.name);
}
function lookupScope(ast, scope, sourceIdsOnly = false) {
    if (validId(ast.bondVarId)) {
        return scope.find(binding => binding.sourceId === ast.bondVarId)
            ?? (!sourceIdsOnly ? scope.find(binding => binding.id === ast.bondVarId) : undefined);
    }
    return scope.find(binding => binding.name === ast.name);
}
function reserveBondVarId(id, state) {
    if (!validId(id))
        return;
    state.usedIds.add(id);
    state.nextId = Math.max(state.nextId, id + 1);
}
function isPreparedAst(ast, scope, state) {
    if (!ast || typeof ast !== "object")
        return false;
    reserveBondVarId(ast.bondVarId, state);
    if (ast.type === "var") {
        if (!ast.name || ast.name === "_" || ast.name.startsWith("?"))
            return false;
        const binding = lookupScope(ast, scope);
        return !binding || ast.bondVarId === binding.id;
    }
    if (ast.type === "L" || ast.type === "P" || ast.type === "S" || ast.type === "W") {
        if (!validId(ast.bondVarId)
            || !isPreparedAst(ast.nodes?.[0], scope, state))
            return false;
        return isPreparedAst(ast.nodes?.[1], [{
                name: ast.name,
                id: ast.bondVarId,
                sourceId: ast.bondVarId
            }, ...scope], state);
    }
    return (ast.nodes ?? []).every(child => isPreparedAst(child, scope, state));
}
function scopePosition(ast, scope) {
    if (validId(ast.bondVarId)) {
        return scope.findIndex(binding => binding.id === ast.bondVarId
            || binding.sourceId === ast.bondVarId);
    }
    return scope.findIndex(binding => !validId(binding.id)
        && !validId(binding.sourceId)
        && binding.name === ast.name);
}
function abstractScopeVariable(ast, scope, position, replacement) {
    if (!ast || typeof ast !== "object")
        return null;
    if (ast.type === "var") {
        const found = scopePosition(ast, scope);
        if (found >= 0)
            return found === position ? cloneSyntax(replacement) : null;
        return cloneSyntax(ast);
    }
    const nodes = [];
    for (const child of ast.nodes ?? []) {
        const next = abstractScopeVariable(child, scope, position, replacement);
        if (!next)
            return null;
        nodes.push(next);
    }
    return {
        type: ast.type,
        name: ast.name,
        bondVarId: ast.bondVarId,
        nodes: ast.nodes ? nodes : undefined
    };
}
function abstractContextVariable(ast, targetId, replacement, shadowed = false) {
    if (ast.type === "var") {
        return !shadowed && ast.bondVarId === targetId
            ? cloneSyntax(replacement)
            : cloneSyntax(ast);
    }
    if (ast.type === "L" || ast.type === "P" || ast.type === "S" || ast.type === "W") {
        return {
            type: ast.type,
            name: ast.name,
            bondVarId: ast.bondVarId,
            nodes: [
                abstractContextVariable(ast.nodes?.[0], targetId, replacement, shadowed),
                abstractContextVariable(ast.nodes?.[1], targetId, replacement, shadowed || ast.bondVarId === targetId)
            ]
        };
    }
    return {
        type: ast.type,
        name: ast.name,
        bondVarId: ast.bondVarId,
        nodes: ast.nodes?.map(child => abstractContextVariable(child, targetId, replacement, shadowed)),
        displayExplicitAt: ast.displayExplicitAt
    };
}
/** Translate free references from one alpha-equivalent binder telescope to
 * the other before storing a metavariable solution. Binder positions are the
 * semantic identity here; their freshly allocated numeric ids differ. */
function alignScopeSyntax(ast, sourceScope, targetScope) {
    if (!ast || typeof ast !== "object")
        return null;
    if (ast.type === "var") {
        const position = scopePosition(ast, sourceScope);
        if (position < 0)
            return cloneSyntax(ast);
        const target = targetScope[position];
        return target ? makeVariable(target.name, target.id) : null;
    }
    const nodes = [];
    for (const child of ast.nodes ?? []) {
        const aligned = alignScopeSyntax(child, sourceScope, targetScope);
        if (!aligned)
            return null;
        nodes.push(aligned);
    }
    return {
        type: ast.type,
        name: ast.name,
        bondVarId: ast.bondVarId,
        ...(ast.nodes ? { nodes } : {})
    };
}
const scopedContextCache = new WeakMap();
function contextWithScope(scope, context) {
    if (!scope.length)
        return context;
    let byScope = scopedContextCache.get(context);
    if (!byScope) {
        byScope = new WeakMap;
        scopedContextCache.set(context, byScope);
    }
    const cached = byScope.get(scope);
    if (cached)
        return cached;
    const scoped = [];
    for (const binding of scope) {
        if (binding.type)
            scoped.push([binding.name, binding.type, binding.id]);
    }
    const merged = scoped.length ? [...scoped, ...context] : context;
    byScope.set(scope, merged);
    return merged;
}
function reserveBondVarIds(ast, state) {
    if (!ast || typeof ast !== "object")
        return;
    reserveBondVarId(ast.bondVarId, state);
    for (const child of ast.nodes ?? [])
        reserveBondVarIds(child, state);
}
function prepareAst(ast, scope, state, dropUnboundIds = false, freshenBinders = false, metaRenames) {
    if (ast.type === "var") {
        let name = ast.name;
        if (name === "_") {
            // A rename map marks syntax owned by a compiled constant scheme
            // (or an explicitly expanded definition), not the user's input.
            // Its implicit holes are part of the cached polymorphic type and
            // must be instantiated even during a non-elaborating recursive
            // probe. User holes still require elaborateMetas.
            if (state.elaborateMetas || metaRenames) {
                name = allocateMeta(state);
                if (metaRenames)
                    state.generatedSchematicMetas.add(name);
                if (!metaRenames) {
                    state.hadInputHoles = true;
                    state.inputMetas.add(name);
                }
            }
        }
        else if (name?.startsWith("?") && metaRenames) {
            let renamed = metaRenames.get(name);
            if (!renamed) {
                renamed = allocateMeta(state);
                state.generatedSchematicMetas.add(renamed);
                metaRenames.set(name, renamed);
            }
            name = renamed;
        }
        else if (name?.startsWith("?") && state.allowNamedSchematicMetas
            && !state.sourceMetas.has(name)) {
            let renamed = state.namedInputMetas.get(name);
            if (!renamed) {
                renamed = allocateMeta(state);
                state.namedInputMetas.set(name, renamed);
                state.inputMetaSurfaceNames.set(renamed, name);
                state.inputMetas.add(renamed);
                state.hadInputHoles = true;
            }
            name = renamed;
        }
        if (state.metas.has(name))
            return { type: "var", name };
        const binding = lookupScope(ast, scope, freshenBinders);
        return {
            type: "var",
            name,
            bondVarId: binding?.id ?? (dropUnboundIds ? undefined : ast.bondVarId),
            displayExplicitAt: ast.displayExplicitAt
        };
    }
    if (ast.type === "L" || ast.type === "P" || ast.type === "S" || ast.type === "W") {
        const domain = prepareAst(ast.nodes?.[0], scope, state, dropUnboundIds, freshenBinders, metaRenames);
        const sourceId = validId(ast.bondVarId) ? ast.bondVarId : undefined;
        const id = !freshenBinders && sourceId ? sourceId : allocateId(state);
        state.nextId = Math.max(state.nextId, id + 1);
        const body = prepareAst(ast.nodes?.[1], [{ name: ast.name, id, sourceId }, ...scope], state, dropUnboundIds, freshenBinders, metaRenames);
        return { type: ast.type, name: ast.name, nodes: [domain, body], bondVarId: id };
    }
    return {
        type: ast.type,
        name: ast.name,
        nodes: ast.nodes?.map(child => prepareAst(child, scope, state, dropUnboundIds, freshenBinders, metaRenames))
    };
}
function cloneSyntax(ast) {
    return {
        type: ast.type,
        name: ast.name,
        bondVarId: ast.bondVarId,
        nodes: ast.nodes?.map(cloneSyntax),
        displayExplicitAt: ast.displayExplicitAt
    };
}
/**
 * A metavariable solution may be inserted more than once into the same term.
 * Reusing its binder ids would make the copies capture one another during a
 * later beta reduction. Freshen only locally bound ids; genuine free context
 * references keep their original identity.
 */
function freshenMetaSolution(ast, state) {
    const hasBinder = (root) => {
        const stack = [root];
        while (stack.length) {
            const node = stack.pop();
            if (!node)
                continue;
            if (node.type === "L" || node.type === "P"
                || node.type === "S" || node.type === "W")
                return true;
            for (const child of node.nodes ?? [])
                stack.push(child);
        }
        return false;
    };
    if (!hasBinder(ast))
        return cloneSyntax(ast);
    const visit = (node, scope) => {
        if (node.type === "var") {
            const binding = validId(node.bondVarId)
                ? scope.find(candidate => candidate.sourceId === node.bondVarId)
                : scope.find(candidate => !validId(candidate.sourceId)
                    && candidate.name === node.name);
            return {
                type: "var",
                name: binding?.name ?? node.name,
                bondVarId: binding?.id ?? node.bondVarId,
                displayExplicitAt: node.displayExplicitAt
            };
        }
        if (node.type === "L" || node.type === "P"
            || node.type === "S" || node.type === "W") {
            const domain = visit(node.nodes?.[0], scope);
            const id = allocateId(state);
            const binding = {
                name: node.name,
                id,
                sourceId: validId(node.bondVarId) ? node.bondVarId : undefined,
                type: domain
            };
            return {
                type: node.type,
                name: node.name,
                bondVarId: id,
                nodes: [domain, visit(node.nodes?.[1], [binding, ...scope])],
                displayExplicitAt: node.displayExplicitAt
            };
        }
        return {
            type: node.type,
            name: node.name,
            bondVarId: node.bondVarId,
            nodes: node.nodes?.map(child => visit(child, scope)),
            displayExplicitAt: node.displayExplicitAt
        };
    };
    return visit(ast, []);
}
function exactSyntaxEqual(left, right) {
    if (left === right)
        return true;
    if (!left || !right
        || left.type !== right.type
        || left.name !== right.name
        || left.bondVarId !== right.bondVarId
        || (left.nodes?.length ?? 0) !== (right.nodes?.length ?? 0)) {
        return false;
    }
    const leftNodes = left.nodes ?? [];
    const rightNodes = right.nodes ?? [];
    for (let index = 0; index < leftNodes.length; index++) {
        if (!exactSyntaxEqual(leftNodes[index], rightNodes[index]))
            return false;
    }
    return true;
}
function containsElaborationHole(ast) {
    if (!ast || typeof ast !== "object")
        return false;
    if (ast.type === "var" && (ast.name === "_" || ast.name?.startsWith("?")))
        return true;
    return (ast.nodes ?? []).some(containsElaborationHole);
}
function referencesConstant(ast, name) {
    if (!ast || typeof ast !== "object")
        return false;
    if (ast.type === "var" && ast.name === name && !ast.bondVarId)
        return true;
    return (ast.nodes ?? []).some(child => referencesConstant(child, name));
}
function assignSyntax(target, source) {
    target.type = source.type;
    target.name = source.name;
    target.bondVarId = source.bondVarId;
    target.nodes = source.nodes?.map(cloneSyntax);
    target.checked = source.checked ? cloneSyntax(source.checked) : undefined;
    target.displayExplicitAt = source.displayExplicitAt;
}
function restoreResolvedSyntax(target, source, state) {
    const checked = target.checked;
    assignSyntax(target, resolveMetas(source, state));
    target.checked = checked;
    return target;
}
function containsSemanticMetadata(ast) {
    if (!ast || typeof ast !== "object")
        return false;
    if (ast.origin && typeof ast.origin === "object")
        return true;
    return (ast.nodes ?? []).some(containsSemanticMetadata);
}
function containsForeignMetavariable(ast, state) {
    if (!ast || typeof ast !== "object")
        return false;
    if (ast.type === "var" && (ast.name === "_"
        || (ast.name?.startsWith("?") && !state.metas.has(ast.name))))
        return true;
    return (ast.nodes ?? []).some(child => containsForeignMetavariable(child, state));
}
function resolveMetas(ast, state, resolving = new Set()) {
    if (isLocalMeta(ast, state)) {
        const solution = state.metaSolutions.get(ast.name);
        if (solution && !resolving.has(ast.name)) {
            const nextResolving = new Set(resolving).add(ast.name);
            const resolved = resolveMetas(freshenMetaSolution(solution, state), state, nextResolving);
            if (ast.checked && !resolved.checked) {
                resolved.checked = resolveMetas(ast.checked, state, resolving);
            }
            return resolved;
        }
        return {
            type: "var",
            name: ast.name,
            checked: ast.checked ? resolveMetas(ast.checked, state, resolving) : undefined
        };
    }
    return {
        type: ast.type,
        name: ast.name,
        bondVarId: ast.bondVarId,
        nodes: ast.nodes?.map(child => resolveMetas(child, state, resolving)),
        checked: ast.checked ? resolveMetas(ast.checked, state, resolving) : undefined,
        displayExplicitAt: ast.displayExplicitAt
    };
}
function restoreUnsolvedInputHoles(ast, state) {
    if (isLocalMeta(ast, state)
        && !state.metaSolutions.has(ast.name)
        && state.inputMetas.has(ast.name)) {
        return {
            type: "var",
            name: state.inputMetaSurfaceNames.get(ast.name) ?? "_",
            checked: ast.checked
                ? restoreUnsolvedInputHoles(ast.checked, state)
                : undefined
        };
    }
    return {
        type: ast.type,
        name: ast.name,
        bondVarId: ast.bondVarId,
        nodes: ast.nodes?.map(child => restoreUnsolvedInputHoles(child, state)),
        checked: ast.checked
            ? restoreUnsolvedInputHoles(ast.checked, state)
            : undefined,
        displayExplicitAt: ast.displayExplicitAt
    };
}
function canReturnUnsolvedInputMetas(names, state) {
    const namedClosure = collectNamedInputMetaClosure(state);
    const inputClosure = collectInputMetaClosure(state);
    return [...names].every(name => {
        if (!state.metaExpectedTypes.has(name))
            return false;
        if (state.inputMetas.has(name)) {
            return state.inputMetaSurfaceNames.has(name)
                ? state.allowNamedSchematicMetas
                : state.allowUnsolvedTermMetas;
        }
        if (state.allowUnsolvedTermMetas && inputClosure.has(name))
            return true;
        if (state.generatedSchematicMetas.has(name)) {
            return state.allowGeneratedSchematicMetas
                && state.metaExpectedTypes.has(name);
        }
        return state.allowNamedSchematicMetas && namedClosure.has(name);
    });
}
function collectInputMetaClosure(state) {
    const closure = new Set(state.inputMetas);
    const pending = [...closure];
    while (pending.length) {
        const name = pending.pop();
        for (const value of [
            state.metaSolutions.get(name),
            state.metaExpectedTypes.get(name)
        ]) {
            if (!value)
                continue;
            for (const dependency of collectUnsolvedLocalMetaNames(value, state)) {
                if (closure.has(dependency))
                    continue;
                closure.add(dependency);
                pending.push(dependency);
            }
        }
    }
    return closure;
}
function collectNamedInputMetaClosure(state) {
    const closure = new Set(state.inputMetaSurfaceNames.keys());
    const pending = [...closure];
    while (pending.length) {
        const name = pending.pop();
        for (const value of [
            state.metaSolutions.get(name),
            state.metaExpectedTypes.get(name)
        ]) {
            if (!value)
                continue;
            for (const dependency of collectUnsolvedLocalMetaNames(value, state)) {
                if (closure.has(dependency))
                    continue;
                closure.add(dependency);
                pending.push(dependency);
            }
        }
    }
    return closure;
}
function recordMetaExpectedType(name, expected, state) {
    const stored = cloneSyntax(expected);
    state.metaExpectedTypes.set(name, stored);
    const resolvedExpected = resolveMetas(stored, state);
    if (isLocalMeta(resolvedExpected, state)) {
        state.localTypeMetas.add(resolvedExpected.name);
    }
}
function ensureLocalMetaIsType(meta, context, state) {
    if (!isLocalMeta(meta, state))
        return null;
    const sourceMeta = state.sourceMetas.get(meta.name);
    const allowedContextIds = new Set(sourceMeta
        ? sourceMeta.allowedBondVarIds
        : context.map(([, , id]) => id).filter(validId));
    state.localTypeMetas.add(meta.name);
    state.metaAllowedContextIds.set(meta.name, allowedContextIds);
    let expectedType = state.metaExpectedTypes.get(meta.name);
    if (!expectedType) {
        const levelName = allocateMeta(state);
        const level = makeVariable(levelName);
        recordMetaExpectedType(levelName, makeVariable("U@"), state);
        state.metaAllowedContextIds.set(levelName, allowedContextIds);
        expectedType = makeUniverse(level);
        recordMetaExpectedType(meta.name, expectedType, state);
    }
    return resolveMetas(expectedType, state);
}
function containsUnsolvedLocalMeta(ast, state) {
    if (!ast || typeof ast !== "object")
        return false;
    if (isLocalMeta(ast, state) && !state.metaSolutions.has(ast.name))
        return true;
    const resolved = isLocalMeta(ast, state) ? state.metaSolutions.get(ast.name) : null;
    if (resolved)
        return containsUnsolvedLocalMeta(resolved, state);
    return (ast.nodes ?? []).some(child => containsUnsolvedLocalMeta(child, state));
}
/** Collect unresolved local metas after following solved-meta substitutions. */
function collectUnsolvedLocalMetaNames(ast, state, result = new Set(), resolving = new Set()) {
    if (!ast || typeof ast !== "object")
        return result;
    if (isLocalMeta(ast, state)) {
        const solution = state.metaSolutions.get(ast.name);
        if (!solution) {
            result.add(ast.name);
            return result;
        }
        if (resolving.has(ast.name))
            return result;
        collectUnsolvedLocalMetaNames(solution, state, result, new Set(resolving).add(ast.name));
        return result;
    }
    for (const child of ast.nodes ?? []) {
        collectUnsolvedLocalMetaNames(child, state, result, resolving);
    }
    return result;
}
/**
 * Check whether an AST mentions one of the context binders free. Binder IDs
 * inside a nested telescope are local to that telescope and therefore do not
 * constitute a capture of the definition's creation context.
 */
function referencesAllowedContext(ast, allowedIds, bound = new Set()) {
    if (!ast || typeof ast !== "object")
        return false;
    if (ast.type === "var") {
        return validId(ast.bondVarId)
            && allowedIds.has(ast.bondVarId)
            && !bound.has(ast.bondVarId);
    }
    const binder = ast.type === "L" || ast.type === "P"
        || ast.type === "S" || ast.type === "W";
    if (ast.nodes?.[0] && referencesAllowedContext(ast.nodes[0], allowedIds, bound)) {
        return true;
    }
    if (!ast.nodes?.[1])
        return false;
    const bodyBound = binder && validId(ast.bondVarId)
        ? new Set(bound).add(ast.bondVarId)
        : bound;
    return referencesAllowedContext(ast.nodes[1], allowedIds, bodyBound)
        || (ast.nodes?.slice(2) ?? []).some(child => referencesAllowedContext(child, allowedIds, bound));
}
function collectMetaOccurrenceRoles(ast, state, roles, levelPosition = false) {
    if (!ast)
        return;
    if (isLocalMeta(ast, state)) {
        const role = roles.get(ast.name) ?? { level: false, ordinary: false };
        if (levelPosition)
            role.level = true;
        else
            role.ordinary = true;
        roles.set(ast.name, role);
        return;
    }
    const { head, args } = flattenApplication(ast);
    if (!levelPosition && head?.type === "var" && !head.bondVarId
        && head.name === "U" && args.length === 1) {
        collectMetaOccurrenceRoles(args[0], state, roles, true);
        return;
    }
    if (levelPosition && head?.type === "var" && !head.bondVarId
        && ((head.name === "@succ" && args.length === 1)
            || (head.name === "@max" && args.length === 2))) {
        for (const argument of args) {
            collectMetaOccurrenceRoles(argument, state, roles, true);
        }
        return;
    }
    for (const child of ast.nodes ?? []) {
        collectMetaOccurrenceRoles(child, state, roles, false);
    }
}
/**
 * Determine which unsolved metas can safely become parameters of a cached
 * definition type. This includes dependent term/function parameters hidden by
 * public aliases, provided every parameter occurs in the returned type. The
 * closure follows expected-type relations so all dependencies are retained.
 */
function collectGeneralizedMetas(type, term, state) {
    const names = collectUnsolvedLocalMetaNames(type, state);
    const termNames = collectUnsolvedLocalMetaNames(term, state);
    const occurrenceRoles = new Map();
    collectMetaOccurrenceRoles(type, state, occurrenceRoles);
    collectMetaOccurrenceRoles(term, state, occurrenceRoles);
    for (const expected of state.metaExpectedTypes.values()) {
        collectMetaOccurrenceRoles(expected, state, occurrenceRoles);
    }
    // Keep all expected-type dependencies reachable from the result.
    let changed = true;
    while (changed) {
        changed = false;
        for (const name of [...names]) {
            const expected = state.metaExpectedTypes.get(name);
            if (!expected) {
                const role = occurrenceRoles.get(name);
                if (role?.level && !role.ordinary)
                    continue;
                return null;
            }
            const dependencies = collectUnsolvedLocalMetaNames(expected, state);
            for (const dependency of dependencies) {
                if (!names.has(dependency)) {
                    names.add(dependency);
                    changed = true;
                }
            }
        }
    }
    if (!names.size)
        return [];
    for (const name of names) {
        if (state.sourceMetas.has(name))
            return null;
        if (state.metaSolutions.has(name))
            return null;
        const expected = state.metaExpectedTypes.get(name);
        if (!expected) {
            const role = occurrenceRoles.get(name);
            if (role?.level && !role.ordinary)
                continue;
            return null;
        }
        const resolvedExpected = resolveMetas(expected, state);
        if (containsForeignMetavariable(resolvedExpected, state))
            return null;
        const allowedIds = state.metaAllowedContextIds.get(name);
        if (allowedIds && referencesAllowedContext(resolvedExpected, allowedIds)) {
            return null;
        }
    }
    // Every unresolved meta in the term must be reachable from the returned
    // type (directly or through another parameter's expected type). Otherwise
    // we would silently turn an unfinished proof term into a scheme.
    for (const name of termNames) {
        if (!names.has(name))
            return null;
    }
    return [...names].map(name => {
        const expected = state.metaExpectedTypes.get(name);
        return {
            name,
            expectedType: expected
                ? cloneSyntax(resolveMetas(expected, state))
                : makeVariable("U@")
        };
    });
}
function containsLocalMeta(ast, state) {
    if (!ast || typeof ast !== "object")
        return false;
    if (isLocalMeta(ast, state))
        return true;
    return (ast.nodes ?? []).some(child => containsLocalMeta(child, state));
}
function collectSourceMetaConstraints(state) {
    const constraints = [];
    for (const name of state.sourceMetas.keys()) {
        const solution = state.metaSolutions.get(name);
        if (!solution)
            continue;
        const resolved = resolveMetas(solution, state);
        if (containsUnsolvedLocalMeta(resolved, state)
            || containsForeignMetavariable(resolved, state))
            return null;
        constraints.push({ name, value: cloneSyntax(resolved) });
    }
    return constraints;
}
function occursMeta(name, ast, state, seen = new Set()) {
    if (!ast || typeof ast !== "object")
        return false;
    if (isLocalMeta(ast, state)) {
        if (ast.name === name)
            return true;
        if (seen.has(ast.name))
            return false;
        const solution = state.metaSolutions.get(ast.name);
        return solution
            ? occursMeta(name, solution, state, new Set(seen).add(ast.name))
            : false;
    }
    return (ast.nodes ?? []).some(child => occursMeta(name, child, state, seen));
}
function containsFiniteBondVarId(ast) {
    if (!ast || typeof ast !== "object")
        return false;
    if (validId(ast.bondVarId))
        return true;
    return (ast.nodes ?? []).some(containsFiniteBondVarId);
}
function collectFreeBondVarIds(ast, result = new Set(), scope = new Set()) {
    if (!ast || typeof ast !== "object")
        return result;
    if (ast.type === "var" && validId(ast.bondVarId) && !scope.has(ast.bondVarId)) {
        result.add(ast.bondVarId);
        return result;
    }
    const binder = ast.type === "L" || ast.type === "P" || ast.type === "S" || ast.type === "W";
    for (const [index, child] of (ast.nodes ?? []).entries()) {
        const childScope = binder && index === 1 && validId(ast.bondVarId)
            ? new Set(scope).add(ast.bondVarId)
            : scope;
        collectFreeBondVarIds(child, result, childScope);
    }
    return result;
}
function normalizeMetaName(name) {
    return name.replace(/^\?/, "").replace(/:+$/, "");
}
function referencesSourceContext(ast, sourceContext) {
    if (!ast)
        return false;
    const ids = new Set(sourceContext.map(([, , id]) => id).filter(validId));
    const names = new Set(sourceContext.filter(([, , id]) => validId(id)).map(([name]) => name));
    const visit = (node) => {
        if (node.type === "var") {
            if (validId(node.bondVarId))
                return ids.has(node.bondVarId);
            if (names.has(node.name))
                return true;
        }
        return (node.nodes ?? []).some(visit);
    };
    return visit(ast);
}
function collectAppliedMetaHeads(ast, result) {
    if (!ast)
        return;
    if (ast.type === "apply") {
        const { head } = flattenApplication(ast);
        if (head?.type === "var" && head.name?.startsWith("?")) {
            result.add(normalizeMetaName(head.name));
        }
    }
    for (const child of ast.nodes ?? [])
        collectAppliedMetaHeads(child, result);
}
function compileTypeScheme(input) {
    if (input.inferTable.defered.length)
        return null;
    if (input.bondVarRel.parent.some(([id, parent]) => id !== parent)
        || input.bondVarRel.size.some(([, size]) => size > 1))
        return null;
    const declared = new Set(input.inferTable.list.map(([name]) => normalizeMetaName(name)));
    const appliedMetaHeads = new Set();
    collectAppliedMetaHeads(input.type, appliedMetaHeads);
    for (const value of Object.values(input.inferTable.rel)) {
        collectAppliedMetaHeads(value, appliedMetaHeads);
    }
    const metas = [];
    for (const [sourceName, sourceContext] of input.inferTable.list) {
        const normalized = normalizeMetaName(sourceName);
        const expectedType = input.inferTable.rel[`?${normalized}:`];
        const preset = input.inferTable.rel[`?${normalized}`];
        if (sourceContext.length && (referencesSourceContext(expectedType, sourceContext)
            || referencesSourceContext(preset, sourceContext)
            || appliedMetaHeads.has(normalized)))
            return null;
        metas.push({
            sourceName: normalized,
            expectedType: expectedType ? cloneSyntax(expectedType) : undefined,
            preset: preset ? cloneSyntax(preset) : undefined,
            // InferTable records everything visible when a meta was created.
            // If its constraints do not actually mention that telescope, erase
            // it and retain the stricter use-site capture rule at instantiation.
            sourceContext: []
        });
    }
    const referenced = new Set();
    const collect = (ast) => {
        if (!ast || typeof ast !== "object")
            return;
        if (ast.type === "var" && ast.name?.startsWith("?")) {
            referenced.add(normalizeMetaName(ast.name));
        }
        for (const child of ast.nodes ?? [])
            collect(child);
    };
    collect(input.type);
    for (const meta of metas) {
        if (meta.expectedType)
            collect(meta.expectedType);
        if (meta.preset)
            collect(meta.preset);
    }
    if ([...referenced].some(name => !declared.has(name)))
        return null;
    return { body: cloneSyntax(input.type), metas };
}
function compileTypeSchemeSnapshot(input) {
    if (!input?.type || typeof input.type.type !== "string" || !Array.isArray(input.metas)) {
        return null;
    }
    const metas = [];
    const declared = new Set();
    for (const meta of input.metas) {
        if (!meta || typeof meta.name !== "string")
            return null;
        const sourceName = normalizeMetaName(meta.name);
        if (!sourceName || declared.has(sourceName))
            return null;
        declared.add(sourceName);
        metas.push({
            sourceName,
            expectedType: meta.expectedType ? cloneSyntax(meta.expectedType) : undefined,
            preset: meta.preset ? cloneSyntax(meta.preset) : undefined,
            sourceContext: []
        });
    }
    const referenced = new Set();
    const collect = (ast) => {
        if (!ast || typeof ast !== "object")
            return;
        if (ast.type === "var" && ast.name?.startsWith("?")) {
            referenced.add(normalizeMetaName(ast.name));
        }
        for (const child of ast.nodes ?? [])
            collect(child);
    };
    collect(input.type);
    for (const meta of input.metas) {
        collect(meta.expectedType);
        collect(meta.preset);
    }
    if ([...referenced].some(name => !declared.has(name)))
        return null;
    return { body: cloneSyntax(input.type), metas };
}
function isUniverseLevelSolution(ast, state, context = []) {
    const resolved = resolveMetas(ast, state);
    if (isLocalMeta(resolved, state))
        return true;
    if (resolved.type === "var") {
        if (/^@(0|[1-9][0-9]*)$/.test(resolved.name))
            return true;
        const contextualType = lookupContextType(resolved, context);
        return contextualType?.type === "var"
            && (contextualType.name === "U@" || contextualType.name === "U@:");
    }
    const { head, args } = flattenApplication(resolved);
    if (head?.type !== "var" || head.bondVarId)
        return false;
    if (head.name === "@succ" && args.length === 1) {
        return isUniverseLevelSolution(args[0], state, context);
    }
    if (head.name === "@max" && args.length === 2) {
        return isUniverseLevelSolution(args[0], state, context)
            && isUniverseLevelSolution(args[1], state, context);
    }
    return false;
}
function isUniverseLevelMeta(name, state) {
    const expected = state.metaExpectedTypes.get(name);
    if (!expected)
        return false;
    const resolved = resolveMetas(expected, state);
    return resolved.type === "var"
        && (resolved.name === "U@" || resolved.name === "U@:");
}
/**
 * Universe inference can legitimately produce the recursive-looking equation
 * `u = max(u, v)` while checking a dependent Sigma telescope.  This is an
 * upper-bound constraint, not a term-level occurs-check cycle: the level
 * remains abstract and the enclosing polymorphic declaration may generalize
 * it.  Defer this one shape conservatively; ordinary term metas still use the
 * strict occurs check below and closed synthesis will reject any meta that
 * cannot subsequently be generalized.
 */
function isDeferredUniverseMax(name, value, state) {
    if (!isUniverseLevelMeta(name, state))
        return false;
    const { head, args } = flattenApplication(resolveMetas(value, state));
    if (head?.type !== "var" || head.name !== "@max" || args.length !== 2)
        return false;
    return args.some(argument => isLocalMeta(argument, state) && argument.name === name);
}
function makeVariable(name, bondVarId) {
    return { type: "var", name, bondVarId };
}
function makeApplication(...terms) {
    let result = terms[0];
    for (let index = 1; index < terms.length; index++) {
        result = { type: "apply", name: "", nodes: [result, terms[index]] };
    }
    return result;
}
function makeUniverse(level) {
    return makeApplication(makeVariable("U"), level);
}
function flattenApplication(ast) {
    const args = [];
    let head = ast;
    while (head?.type === "apply") {
        args.unshift(head.nodes?.[1]);
        head = head.nodes?.[0];
    }
    return { head, args };
}
function naturalLiteralValue(ast) {
    if (ast?.type !== "var" || ast.bondVarId
        || !/^(0|[1-9][0-9]*)$/.test(ast.name ?? ""))
        return null;
    try {
        return BigInt(ast.name);
    }
    catch {
        return null;
    }
}
function naturalSuccessorArgument(ast) {
    const { head, args } = flattenApplication(ast);
    return head?.type === "var" && head.name === "succ" && !head.bondVarId
        && args.length === 1
        ? args[0]
        : null;
}
function isRigidTypeFormer(ast) {
    return ast?.type === "P" || ast?.type === "S"
        || ast?.type === "W" || ast?.type === "->";
}
function constantHeadName(ast) {
    const { head } = flattenApplication(ast);
    return head?.type === "var" && !head.bondVarId ? head.name : undefined;
}
function universeLevel(type) {
    if (type.type === "var" && type.name === "U" && !type.bondVarId) {
        return makeVariable("@0");
    }
    if (type.type === "var" && type.name === "U@:" && !type.bondVarId) {
        // Legacy Core uses U@: as the (external) sort of universe levels.
        // It may classify U@ itself as a binder domain, but must not make
        // ordinary level terms such as @0 into types.
        return makeVariable("@0");
    }
    const { head, args } = flattenApplication(type);
    return head?.type === "var" && head.name === "U" && !head.bondVarId && args.length === 1
        ? cloneSyntax(args[0])
        : null;
}
function lookupContextType(ast, context) {
    if (validId(ast.bondVarId)) {
        const binding = context.find(([, , id]) => id === ast.bondVarId);
        return binding?.[1] ? cloneSyntax(binding[1]) : null;
    }
    const binding = context.find(([name]) => name === ast.name);
    return binding?.[1] ? cloneSyntax(binding[1]) : null;
}
function instantiateBinder(body, name, id, argument) {
    const visit = (ast, shadowed) => {
        if (ast.type === "var") {
            const matches = validId(id)
                ? !shadowed && ast.bondVarId === id
                : !shadowed && !ast.bondVarId && ast.name === name;
            return matches ? cloneSyntax(argument) : cloneSyntax(ast);
        }
        if (ast.type === "L" || ast.type === "P" || ast.type === "S" || ast.type === "W") {
            const domain = visit(ast.nodes?.[0], shadowed);
            const hidesTarget = validId(id)
                ? ast.bondVarId === id
                : ast.name === name;
            const nestedBody = visit(ast.nodes?.[1], shadowed || hidesTarget);
            return {
                type: ast.type,
                name: ast.name,
                nodes: [domain, nestedBody],
                bondVarId: ast.bondVarId
            };
        }
        return {
            type: ast.type,
            name: ast.name,
            nodes: ast.nodes?.map(child => visit(child, shadowed))
        };
    };
    return visit(body, false);
}
/** Reduce only beta redexes at the head of an inferred type. Leaving a
 * dependent codomain such as `(Lx:nat,U) n` unreduced can make a valid type
 * look non-universe even though no full normalization is needed. */
function reduceBetaHead(ast) {
    if (!ast || ast.type !== "apply")
        return ast;
    const { head, args } = flattenApplication(ast);
    if (head?.type !== "L" || !args.length)
        return ast;
    let reduced = head;
    let argumentIndex = 0;
    while (reduced.type === "L" && argumentIndex < args.length) {
        reduced = instantiateBinder(reduced.nodes?.[1], reduced.name, reduced.bondVarId, args[argumentIndex++]);
    }
    return argumentIndex < args.length
        ? makeApplication(reduced, ...args.slice(argumentIndex).map(cloneSyntax))
        : reduced;
}
/** Resolve beta redexes introduced by local-meta substitution without
 * unfolding named definitions. Full kernel normalization is needlessly
 * destructive here: a single solved universe/family meta can delta-expand an
 * otherwise compact inferred type by tens of thousands of nodes. */
function normalizeResolvedBetaSyntax(ast, state) {
    if (!takeStep(state))
        return null;
    const nodes = [];
    for (const child of ast.nodes ?? []) {
        const normalized = normalizeResolvedBetaSyntax(child, state);
        if (!normalized)
            return null;
        nodes.push(normalized);
    }
    const rebuilt = {
        type: ast.type,
        name: ast.name,
        bondVarId: ast.bondVarId,
        ...(ast.nodes ? { nodes } : {})
    };
    const reduced = reduceBetaHead(rebuilt);
    return reduced === rebuilt
        ? rebuilt
        : normalizeResolvedBetaSyntax(reduced, state);
}
function normalizeResolvedUniverseSyntax(ast, kernel, context, state) {
    if (!takeStep(state))
        return null;
    const nodes = [];
    for (const child of ast.nodes ?? []) {
        const normalized = normalizeResolvedUniverseSyntax(child, kernel, context, state);
        if (!normalized)
            return null;
        nodes.push(normalized);
    }
    const rebuilt = {
        type: ast.type,
        name: ast.name,
        bondVarId: ast.bondVarId,
        ...(ast.nodes ? { nodes } : {})
    };
    const { head, args } = flattenApplication(rebuilt);
    if (head?.type !== "var" || head.bondVarId || head.name !== "U" || args.length !== 1) {
        return rebuilt;
    }
    const level = kernel.tryNormalizeUniverseLevel(args[0], context, kernelOptions(state));
    return level ? makeUniverse(level) : rebuilt;
}
function compactResolvedType(ast, kernel, context, state) {
    const betaNormalized = normalizeResolvedBetaSyntax(ast, state);
    return betaNormalized
        ? normalizeResolvedUniverseSyntax(betaNormalized, kernel, context, state)
        : null;
}
/**
 * Remove elaboration-only prefixes from a semantic result. Public aliases are
 * registered in the initial system as definitions such as
 * `pr0 := @pr0 _ _`; the kernel intentionally keeps those sources even when
 * it cannot compile their holes. Reifying the explicit head is useful for
 * equality, but retaining its hidden arguments would make an otherwise closed
 * result fail the final metavariable check. Fold only prefixes proven to be
 * such aliases, and preserve an occurrence that the user wrote with `@`.
 */
function compactImplicitAliasSyntax(ast, kernel, onlyIfPrefixHasUnsolvedMeta) {
    const aliasPrefixes = new Map();
    const visitedNames = new Set();
    const prefixFor = (headName) => {
        if (!headName.startsWith("@") || visitedNames.has(headName))
            return undefined;
        visitedNames.add(headName);
        const publicName = headName.slice(1);
        const source = kernel.getDefinitionSource(publicName);
        if (!source)
            return undefined;
        const sourceArgs = [];
        let sourceHead = source;
        while (sourceHead?.type === "apply") {
            sourceArgs.unshift(sourceHead.nodes?.[1]);
            sourceHead = sourceHead.nodes?.[0];
        }
        if (sourceHead?.type !== "var"
            || sourceHead.bondVarId
            || sourceHead.name !== headName
            || sourceArgs.length === 0
            || sourceArgs.some(argument => argument?.type !== "var"
                || (argument.name !== "_" && !argument.name?.startsWith("?")))) {
            return undefined;
        }
        const prefixLength = sourceArgs.length + 1;
        aliasPrefixes.set(headName, prefixLength);
        return prefixLength;
    };
    const visit = (node, root = false) => {
        if (!node || typeof node !== "object")
            return node;
        const children = node.nodes?.map(child => visit(child));
        let current = {
            type: node.type,
            name: node.name,
            bondVarId: node.bondVarId,
            ...(children ? { nodes: children } : {}),
            displayExplicitAt: node.displayExplicitAt,
            // `annotateTerm` attaches checked types to every source node for
            // the proof assistant.  Keep those annotations while folding an
            // elaboration-only alias; Core.applySemanticTerm clones them into
            // the caller-owned AST afterwards.
            checked: node.checked
        };
        if (current.type !== "apply")
            return current;
        const application = [];
        let head = current;
        while (head.type === "apply") {
            application.unshift(head.nodes?.[1]);
            head = head.nodes?.[0];
        }
        application.unshift(head);
        if (head.type !== "var" || head.bondVarId || head.displayExplicitAt) {
            return current;
        }
        const prefixLength = aliasPrefixes.get(head.name)
            ?? prefixFor(head.name);
        if (!prefixLength || application.length < prefixLength)
            return current;
        // A root alias is the declaration's public spelling and remains safe
        // to re-infer when a portable Worker definition has no cache yet.
        // Nested solved prefixes retain their explicit arguments for the NbE
        // kernel; only inference-only nested prefixes may be discarded.
        if (!root && onlyIfPrefixHasUnsolvedMeta
            && !application.slice(1, prefixLength).some(argument => containsUnsolvedLocalMeta(argument, onlyIfPrefixHasUnsolvedMeta))) {
            return current;
        }
        let replacement = {
            type: "var",
            name: head.name.slice(1)
        };
        for (const argument of application.slice(prefixLength)) {
            replacement = makeApplication(replacement, argument);
        }
        replacement.displayExplicitAt = head.displayExplicitAt;
        replacement.checked = current.checked;
        return replacement;
    };
    return visit(ast, true);
}
/**
 * Immutable syntax-directed checker for the closed, fully elaborated NbE
 * fragment. It assumes registered constant types are themselves valid.
 */
export class SemanticNbeTypeChecker {
    kernel;
    constantTypes = new Map();
    revision = 0;
    constructor(kernel) {
        this.kernel = kernel;
    }
    setConstantType(name, type) {
        if (type)
            this.constantTypes.set(name, { type: cloneSyntax(type) });
        else
            this.constantTypes.delete(name);
        this.revision++;
    }
    setConstantScheme(name, input) {
        if (!input) {
            this.constantTypes.delete(name);
            this.revision++;
            return false;
        }
        const scheme = compileTypeScheme(input);
        this.constantTypes.set(name, {
            type: scheme?.body ?? cloneSyntax(input.type),
            ...(scheme ? { scheme } : {})
        });
        this.revision++;
        return !!scheme;
    }
    setConstantSchemeSnapshot(name, input) {
        if (!input) {
            this.constantTypes.delete(name);
            this.revision++;
            return false;
        }
        const scheme = compileTypeSchemeSnapshot(input);
        if (scheme) {
            this.constantTypes.set(name, {
                type: scheme.body,
                scheme
            });
        }
        else {
            this.constantTypes.delete(name);
        }
        this.revision++;
        return !!scheme;
    }
    replaceConstantTypes(entries) {
        this.constantTypes.clear();
        for (const [name, type] of entries) {
            this.constantTypes.set(name, { type: cloneSyntax(type) });
        }
        this.revision++;
        return this.constantTypes.size;
    }
    clearConstantTypes() {
        if (!this.constantTypes.size)
            return;
        this.constantTypes.clear();
        this.revision++;
    }
    hasConstantType(name) {
        return this.constantTypes.has(name);
    }
    hasElaborationDefinitionReference(ast) {
        const seen = new WeakSet();
        const stack = [ast];
        while (stack.length) {
            const current = stack.pop();
            if (!current || typeof current !== "object" || seen.has(current))
                continue;
            seen.add(current);
            if (current.type === "var" && !current.bondVarId) {
                const definition = this.kernel.getDefinitionSource(current.name);
                if (definition && containsElaborationHole(definition))
                    return true;
            }
            for (const child of current.nodes ?? [])
                stack.push(child);
        }
        return false;
    }
    get constantTypeCount() {
        return this.constantTypes.size;
    }
    trySynthesize(ast, context = [], options = {}) {
        const prepared = this.prepare(ast, context, options);
        if (prepared.status !== "success")
            return prepared;
        prepared.value.state.directMetaBeforeDelta = true;
        const result = this.synthesize(prepared.value.ast, prepared.value.context, prepared.value.state);
        if (result.status !== "success")
            return result;
        const resolvedType = resolveMetas(result.value, prepared.value.state);
        const type = compactResolvedType(resolvedType, this.kernel, prepared.value.context, prepared.value.state);
        if (!type)
            return unsupported("budget-exhausted");
        const needsTerm = prepared.value.state.hadInputHoles
            || prepared.value.state.hadElaborationChanges
            || prepared.value.state.annotateTerm;
        const resolvedTerm = needsTerm
            ? resolveMetas(prepared.value.ast, prepared.value.state)
            : undefined;
        const explicitElaboratedTerm = resolvedTerm ? cloneSyntax(resolvedTerm) : undefined;
        const term = resolvedTerm
            ? compactImplicitAliasSyntax(resolvedTerm, this.kernel, prepared.value.state)
            : undefined;
        const generalizationAttempted = prepared.value.state.generalizeMetas;
        const allowGeneratedMetas = prepared.value.state.allowGeneratedSchematicMetas;
        const unresolvedResultMetas = collectUnsolvedLocalMetaNames(type, prepared.value.state);
        collectUnsolvedLocalMetaNames(term ?? explicitElaboratedTerm, prepared.value.state, unresolvedResultMetas);
        const generatedOnly = unresolvedResultMetas.size > 0
            && [...unresolvedResultMetas].every(name => prepared.value.state.generatedSchematicMetas.has(name));
        const generalizedMetas = generalizationAttempted
            || (allowGeneratedMetas && generatedOnly)
            ? collectGeneralizedMetas(type, term ?? explicitElaboratedTerm, prepared.value.state)
            : [];
        const allowedGeneralizedNames = new Set(generalizedMetas?.map(meta => meta.name) ?? []);
        const hasDisallowedUnsolvedMeta = [...unresolvedResultMetas].some(name => !allowedGeneralizedNames.has(name)
            && !canReturnUnsolvedInputMetas(new Set([name]), prepared.value.state));
        // A fully explicit public alias can carry an inference-only prefix,
        // for example `@nil ?level ?element`. Once the public alias is folded
        // back to `nil`, those metas are neither part of the proof nor its
        // type. Prefer the explicit term when it is closed, otherwise retain
        // the closed folded term as the kernel definition.
        const elaboratedTerm = explicitElaboratedTerm
            && !collectUnsolvedLocalMetaNames(explicitElaboratedTerm, prepared.value.state).size
            ? explicitElaboratedTerm
            : term;
        if ((generalizationAttempted && generalizedMetas === null)
            || (allowGeneratedMetas && generalizedMetas === null)
            || hasDisallowedUnsolvedMeta) {
            return unsupported("metavariable");
        }
        const sourceMetaConstraints = collectSourceMetaConstraints(prepared.value.state);
        if (!sourceMetaConstraints)
            return unsupported("metavariable");
        const publicType = resolvedTerm && !options.preserveKernelType
            ? compactImplicitAliasSyntax(type, this.kernel)
            : type;
        return {
            status: "success",
            type: publicType,
            ...(term ? { term } : {}),
            ...(elaboratedTerm ? { elaboratedTerm } : {}),
            ...(generalizedMetas?.length ? { generalizedMetas } : {}),
            ...(unresolvedResultMetas.size ? {
                schematicMetaNames: [...unresolvedResultMetas].map(name => prepared.value.state.inputMetaSurfaceNames.get(name) ?? name)
            } : {}),
            ...(sourceMetaConstraints.length ? { sourceMetaConstraints } : {})
        };
    }
    tryCheck(ast, expected, context = [], options = {}) {
        const prepared = this.prepare(ast, context, options);
        if (prepared.status !== "success")
            return prepared;
        prepared.value.state.directMetaBeforeDelta = true;
        if (containsSemanticMetadata(expected))
            return unsupported("unsupported-syntax");
        const preparedExpected = prepareAst(expected, prepared.value.scope, prepared.value.state);
        if (containsForeignMetavariable(preparedExpected, prepared.value.state)) {
            return unsupported("metavariable");
        }
        const synthesized = isLocalMeta(prepared.value.ast, prepared.value.state)
            ? this.checkTermAgainstExpected(prepared.value.ast, preparedExpected, prepared.value.context, prepared.value.state)
            : this.synthesize(prepared.value.ast, prepared.value.context, prepared.value.state);
        if (synthesized.status !== "success")
            return synthesized;
        // Classify holes in the expected type before conversion. In a target
        // such as `Pi _:_, Even 2`, the domain hole must be known to denote a
        // type before it can be solved from the synthesized function domain.
        // Universe validation remains after conversion so a concrete mismatch
        // is still the primary diagnostic.
        const inferredExpectedType = isLocalMeta(preparedExpected, prepared.value.state) ? ensureLocalMetaIsType(preparedExpected, prepared.value.context, prepared.value.state) : null;
        const expectedType = inferredExpectedType
            ? success(inferredExpectedType)
            : this.synthesize(preparedExpected, prepared.value.context, prepared.value.state);
        const conversion = this.convertTypes(synthesized.value, preparedExpected, prepared.value.context, prepared.value.state, [], [], "left");
        if (conversion === "budget-exhausted")
            return unsupported("budget-exhausted");
        if (conversion === "unsupported")
            return unsupported("conversion-unsupported");
        if (conversion === "unequal")
            return invalid("type-mismatch");
        if (expectedType.status !== "success")
            return expectedType;
        const expectedUniverse = this.expectUniverse(expectedType.value, prepared.value.context, prepared.value.state);
        if (expectedUniverse.status !== "success")
            return expectedUniverse;
        const resolvedType = resolveMetas(synthesized.value, prepared.value.state);
        const normalizedType = compactResolvedType(resolvedType, this.kernel, prepared.value.context, prepared.value.state);
        if (!normalizedType)
            return unsupported("budget-exhausted");
        const resolvedExpected = resolveMetas(preparedExpected, prepared.value.state);
        const needsTerm = prepared.value.state.hadInputHoles
            || prepared.value.state.hadElaborationChanges
            || prepared.value.state.annotateTerm;
        const resolvedTerm = needsTerm
            ? resolveMetas(prepared.value.ast, prepared.value.state)
            : undefined;
        // Public aliases can hide inference-only prefixes. Judge all returned
        // syntax after folding those prefixes, then allow only the named input
        // schematic variables (and their type-dependency closure) to escape.
        const compactTypeSyntax = compactImplicitAliasSyntax(normalizedType, this.kernel, prepared.value.state);
        const compactExpectedSyntax = compactImplicitAliasSyntax(resolvedExpected, this.kernel, prepared.value.state);
        const compactTermSyntax = resolvedTerm
            ? compactImplicitAliasSyntax(resolvedTerm, this.kernel, prepared.value.state)
            : undefined;
        const unresolvedResultMetas = collectUnsolvedLocalMetaNames(compactTypeSyntax, prepared.value.state);
        collectUnsolvedLocalMetaNames(compactExpectedSyntax, prepared.value.state, unresolvedResultMetas);
        collectUnsolvedLocalMetaNames(compactTermSyntax, prepared.value.state, unresolvedResultMetas);
        const canReturnUnsolvedTermMetas = canReturnUnsolvedInputMetas(unresolvedResultMetas, prepared.value.state);
        if (unresolvedResultMetas.size && !canReturnUnsolvedTermMetas) {
            return unsupported("metavariable");
        }
        const generatedOnly = unresolvedResultMetas.size > 0
            && [...unresolvedResultMetas].every(name => prepared.value.state.generatedSchematicMetas.has(name));
        const generalizedMetas = prepared.value.state.generalizeMetas
            || (prepared.value.state.allowGeneratedSchematicMetas && generatedOnly)
            ? collectGeneralizedMetas(compactTypeSyntax, compactTermSyntax, prepared.value.state)
            : [];
        if (generalizedMetas === null)
            return unsupported("metavariable");
        const restoreReturnedSyntax = (value) => canReturnUnsolvedTermMetas
            ? restoreUnsolvedInputHoles(value, prepared.value.state)
            : value;
        const returnedTypeSyntax = restoreReturnedSyntax(compactTypeSyntax);
        const returnedExpectedSyntax = restoreReturnedSyntax(compactExpectedSyntax);
        const returnedTermSyntax = compactTermSyntax
            ? restoreReturnedSyntax(compactTermSyntax)
            : undefined;
        const type = unresolvedResultMetas.size
            ? returnedTypeSyntax
            : normalizedType;
        const expectedTerm = unresolvedResultMetas.size
            ? returnedExpectedSyntax
            : options.preserveKernelType
                ? cloneSyntax(resolvedExpected)
                : compactExpectedSyntax;
        const explicitElaboratedTerm = resolvedTerm
            ? cloneSyntax(restoreReturnedSyntax(resolvedTerm))
            : undefined;
        const term = returnedTermSyntax;
        const elaboratedTerm = explicitElaboratedTerm
            && !containsUnsolvedLocalMeta(explicitElaboratedTerm, prepared.value.state)
            ? explicitElaboratedTerm
            : term;
        // Hidden parameters introduced while expanding a public alias are not
        // proof holes once the alias has been folded back to its source form.
        // Judge closure on the term we will return, while explicit `@` aliases
        // remain expanded (and therefore strict) via displayExplicitAt.
        const sourceMetaConstraints = collectSourceMetaConstraints(prepared.value.state);
        if (!sourceMetaConstraints)
            return unsupported("metavariable");
        const publicType = resolvedTerm && !options.preserveKernelType
            ? compactImplicitAliasSyntax(type, this.kernel)
            : type;
        const schematicMetaNames = [...unresolvedResultMetas].map(name => prepared.value.state.inputMetaSurfaceNames.get(name) ?? name);
        return {
            status: "success",
            type: publicType,
            expectedTerm,
            ...(term ? { term } : {}),
            ...(elaboratedTerm ? { elaboratedTerm } : {}),
            ...(generalizedMetas.length ? { generalizedMetas } : {}),
            ...(schematicMetaNames.length ? { schematicMetaNames } : {}),
            ...(sourceMetaConstraints.length ? { sourceMetaConstraints } : {})
        };
    }
    /**
     * Check two well-typed terms for definitional equality while elaborating
     * holes on both sides in one solver state.  This is intentionally stronger
     * than composing trySynthesize/tryCheck: a hole such as the domain in
     * `Pi _:_, False` is only determined when the opposite term is compared.
     */
    tryDefinitionalEquality(left, right, context = [], options = {}) {
        const prepared = this.prepare(left, context, options);
        if (prepared.status !== "success")
            return prepared;
        const { state, scope, context: preparedContext } = prepared.value;
        state.directMetaBeforeDelta = true;
        if (!right || typeof right !== "object" || containsSemanticMetadata(right)) {
            return unsupported("unsupported-syntax");
        }
        reserveBondVarIds(right, state);
        const preparedRight = prepareAst(right, scope, state);
        if (containsForeignMetavariable(preparedRight, state)) {
            return unsupported("metavariable");
        }
        const leftType = this.synthesize(prepared.value.ast, preparedContext, state);
        if (leftType.status !== "success")
            return leftType;
        const rightType = this.synthesize(preparedRight, preparedContext, state);
        if (rightType.status !== "success")
            return rightType;
        // Compare terms first: their structure may determine a type hole that
        // otherwise leaves the synthesized universe constraint ambiguous.
        const termConversion = this.convertTypes(prepared.value.ast, preparedRight, preparedContext, state);
        if (termConversion === "budget-exhausted")
            return unsupported("budget-exhausted");
        if (termConversion === "unsupported")
            return unsupported("conversion-unsupported");
        if (termConversion === "unequal")
            return invalid("type-mismatch");
        const typeConversion = this.convertTypes(leftType.value, rightType.value, preparedContext, state);
        if (typeConversion === "budget-exhausted")
            return unsupported("budget-exhausted");
        if (typeConversion === "unsupported")
            return unsupported("conversion-unsupported");
        if (typeConversion === "unequal")
            return invalid("type-mismatch");
        const resolvedType = resolveMetas(leftType.value, state);
        const resolvedLeft = resolveMetas(prepared.value.ast, state);
        const resolvedRight = resolveMetas(preparedRight, state);
        // Public aliases can hide fresh inference-only prefixes. Judge the
        // remaining schematic variables after folding those prefixes away.
        const compactTypeSyntax = compactImplicitAliasSyntax(resolvedType, this.kernel, state);
        const compactLeftSyntax = compactImplicitAliasSyntax(resolvedLeft, this.kernel, state);
        const compactRightSyntax = compactImplicitAliasSyntax(resolvedRight, this.kernel, state);
        const unresolvedResultMetas = collectUnsolvedLocalMetaNames(compactTypeSyntax, state);
        collectUnsolvedLocalMetaNames(compactLeftSyntax, state, unresolvedResultMetas);
        collectUnsolvedLocalMetaNames(compactRightSyntax, state, unresolvedResultMetas);
        const canReturnUnsolvedTermMetas = canReturnUnsolvedInputMetas(unresolvedResultMetas, state);
        if (unresolvedResultMetas.size && !canReturnUnsolvedTermMetas) {
            return unsupported("metavariable");
        }
        const generatedOnly = unresolvedResultMetas.size > 0
            && [...unresolvedResultMetas].every(name => state.generatedSchematicMetas.has(name));
        const generalizedMetas = state.generalizeMetas
            || (state.allowGeneratedSchematicMetas && generatedOnly)
            ? collectGeneralizedMetas(compactTypeSyntax, compactLeftSyntax, state)
            : [];
        if (generalizedMetas === null)
            return unsupported("metavariable");
        const returnedType = canReturnUnsolvedTermMetas
            ? restoreUnsolvedInputHoles(compactTypeSyntax, state)
            : compactTypeSyntax;
        const type = unresolvedResultMetas.size
            ? returnedType
            : compactResolvedType(resolvedType, this.kernel, preparedContext, state);
        if (!type)
            return unsupported("budget-exhausted");
        const sourceMetaConstraints = collectSourceMetaConstraints(state);
        if (!sourceMetaConstraints)
            return unsupported("metavariable");
        const returnedLeft = canReturnUnsolvedTermMetas
            ? restoreUnsolvedInputHoles(compactLeftSyntax, state)
            : compactLeftSyntax;
        const returnedRight = canReturnUnsolvedTermMetas
            ? restoreUnsolvedInputHoles(compactRightSyntax, state)
            : compactRightSyntax;
        const needsTerms = state.hadInputHoles
            || state.hadElaborationChanges
            || state.annotateTerm;
        const publicType = needsTerms && !options.preserveKernelType
            ? compactImplicitAliasSyntax(type, this.kernel)
            : type;
        const schematicMetaNames = [...unresolvedResultMetas].map(name => state.inputMetaSurfaceNames.get(name) ?? name);
        return {
            status: "success",
            type: publicType,
            ...(needsTerms ? {
                leftTerm: compactImplicitAliasSyntax(returnedLeft, this.kernel, state),
                rightTerm: compactImplicitAliasSyntax(returnedRight, this.kernel, state)
            } : {}),
            ...(generalizedMetas.length ? { generalizedMetas } : {}),
            ...(schematicMetaNames.length ? { schematicMetaNames } : {}),
            ...(sourceMetaConstraints.length ? { sourceMetaConstraints } : {})
        };
    }
    prepare(ast, context, options) {
        if (!ast || typeof ast !== "object" || containsSemanticMetadata(ast)) {
            return unsupported("unsupported-syntax");
        }
        const state = {
            steps: 0,
            maxSteps: options.maxSteps ?? 65_536,
            deadline: options.deadline,
            nextId: 1,
            usedIds: new Set,
            nextMeta: 0,
            metas: new Set,
            inputMetas: new Set,
            namedInputMetas: new Map,
            inputMetaSurfaceNames: new Map,
            metaSolutions: new Map,
            metaExpectedTypes: new Map,
            localTypeMetas: new Set,
            metaAllowedContextIds: new Map,
            sourceMetas: new Map,
            hadInputHoles: false,
            hadElaborationChanges: false,
            elaborateMetas: options.elaborateMetas ?? true,
            generalizeMetas: options.generalizeMetas ?? false,
            annotateTerm: options.annotateTerm ?? false,
            allowUnsolvedTermMetas: options.allowUnsolvedTermMetas ?? false,
            allowNamedSchematicMetas: options.allowNamedSchematicMetas ?? false,
            allowGeneratedSchematicMetas: options.allowGeneratedSchematicMetas ?? false,
            generatedSchematicMetas: new Set,
            directMetaBeforeDelta: false,
            expandingDefinitions: new Set,
            freshBondVarId: options.freshBondVarId
        };
        for (const sourceMeta of options.sourceMetas ?? []) {
            if (sourceMeta.role !== "type"
                || !/^\?[^:]+$/.test(sourceMeta.name)
                || state.sourceMetas.has(sourceMeta.name)) {
                return unsupported("metavariable");
            }
            const registered = {
                name: sourceMeta.name,
                role: sourceMeta.role,
                allowedBondVarIds: sourceMeta.allowedBondVarIds.filter(validId)
            };
            state.sourceMetas.set(registered.name, registered);
            state.metas.add(registered.name);
            state.localTypeMetas.add(registered.name);
            state.metaAllowedContextIds.set(registered.name, new Set(registered.allowedBondVarIds));
        }
        if (!state.elaborateMetas && !state.annotateTerm) {
            let reusable = true;
            let reusableScope = [];
            for (let index = context.length - 1; index >= 0; index--) {
                const [name, type, sourceId] = context[index];
                const sentinel = sourceId === Infinity;
                reserveBondVarId(sourceId, state);
                if ((!sentinel && !validId(sourceId))
                    || (type && !isPreparedAst(type, reusableScope, state))) {
                    reusable = false;
                    break;
                }
                reusableScope = [{
                        name,
                        id: sourceId,
                        sourceId
                    }, ...reusableScope];
            }
            if (reusable && isPreparedAst(ast, reusableScope, state)) {
                return success({ ast, context, scope: reusableScope, state });
            }
            state.usedIds.clear();
            state.nextId = 1;
        }
        reserveBondVarIds(ast, state);
        for (const [, type, id] of context) {
            reserveBondVarId(id, state);
            if (type)
                reserveBondVarIds(type, state);
        }
        const preparedContext = [];
        let scope = [];
        for (let index = context.length - 1; index >= 0; index--) {
            const [name, type, sourceId] = context[index];
            const sentinel = sourceId === Infinity;
            const id = sentinel ? Infinity : validId(sourceId) ? sourceId : allocateId(state);
            const preparedType = type ? prepareAst(type, scope, state) : null;
            preparedContext.unshift([name, preparedType, id]);
            scope = [{
                    name,
                    id,
                    sourceId: sentinel || validId(sourceId) ? sourceId : undefined
                }, ...scope];
        }
        const preparedAst = prepareAst(ast, scope, state);
        if (containsForeignMetavariable(preparedAst, state)
            || (state.elaborateMetas
                && preparedContext.some(([, type]) => type && containsForeignMetavariable(type, state)))) {
            return unsupported("metavariable");
        }
        return success({ ast: preparedAst, context: preparedContext, scope, state });
    }
    synthesize(ast, context, state) {
        if (!takeStep(state))
            return unsupported("budget-exhausted");
        const expandedDefinition = this.tryExpandDefinition(ast, state);
        if (expandedDefinition) {
            const alreadyExpanding = state.expandingDefinitions.has(expandedDefinition);
            if (!alreadyExpanding)
                state.expandingDefinitions.add(expandedDefinition);
            try {
                return this.synthesize(ast, context, state);
            }
            finally {
                if (!alreadyExpanding)
                    state.expandingDefinitions.delete(expandedDefinition);
            }
        }
        let result;
        if (ast.type === "var")
            result = this.synthesizeVariable(ast, context, state);
        else if (ast.type === "L" || ast.type === "P" || ast.type === "S" || ast.type === "W") {
            result = this.synthesizeBinder(ast, context, state);
        }
        else if (ast.type === "->")
            result = this.synthesizeArrow(ast, context, state);
        else if (ast.type === "apply")
            result = this.synthesizeApplication(ast, context, state);
        else
            result = unsupported("unsupported-syntax");
        if (result.status === "success" && state.annotateTerm) {
            ast.checked = cloneSyntax(result.value);
        }
        return result;
    }
    tryExpandDefinition(ast, state, allowDefinitionHoles = false) {
        if (!state.elaborateMetas && !allowDefinitionHoles)
            return null;
        const { head, args } = flattenApplication(ast);
        if (head?.type !== "var" || head.bondVarId)
            return null;
        const definitionName = head.name;
        const definition = this.kernel.getDefinitionSource(definitionName);
        if (!definition || !containsElaborationHole(definition))
            return null;
        if (state.expandingDefinitions.has(definitionName)
            && referencesConstant(definition, definitionName))
            return null;
        const preparedDefinition = prepareAst(definition, [], state, true, true, new Map);
        const expanded = makeApplication(preparedDefinition, ...args.map(argument => cloneSyntax(argument)));
        assignSyntax(ast, expanded);
        state.hadElaborationChanges = true;
        return definitionName;
    }
    synthesizeVariable(ast, context, state) {
        if (isLocalMeta(ast, state)) {
            const expectedType = state.metaExpectedTypes.get(ast.name);
            if (expectedType)
                return success(resolveMetas(expectedType, state));
            const sourceMeta = state.sourceMetas.get(ast.name);
            if (sourceMeta?.role === "type") {
                const inferredType = ensureLocalMetaIsType(ast, context, state);
                if (inferredType)
                    return success(inferredType);
            }
            if (state.allowUnsolvedTermMetas && state.inputMetas.has(ast.name)) {
                const typeName = allocateMeta(state);
                const typeMeta = makeVariable(typeName);
                const typeUniverse = ensureLocalMetaIsType(typeMeta, context, state);
                if (!typeUniverse)
                    return unsupported("metavariable");
                recordMetaExpectedType(ast.name, typeMeta, state);
                state.metaAllowedContextIds.set(ast.name, new Set(context.map(([, , id]) => id).filter(validId)));
                return success(typeMeta);
            }
            return unsupported("metavariable");
        }
        if (ast.name === "_" || ast.name?.startsWith("?")) {
            return unsupported("metavariable");
        }
        const contextual = lookupContextType(ast, context);
        if (contextual)
            return success(contextual);
        if (validId(ast.bondVarId))
            return invalid("unbound-variable");
        if (ast.name === "U")
            return success(makeUniverse(makeVariable("@1")));
        if (/^@(0|[1-9][0-9]*)$/.test(ast.name))
            return success(makeVariable("U@"));
        if (/^(0|[1-9][0-9]*)$/.test(ast.name))
            return success(makeVariable("nat"));
        const constantType = this.constantTypes.get(ast.name);
        if (!constantType)
            return invalid("unknown-constant");
        // A compiled cache scheme is already closed over its creation
        // context: instantiating its generalized metas only allocates fresh
        // local solver variables and does not elaborate user holes.  Keep it
        // available during the non-elaborating recursive probe as well so its
        // use-site can constrain the freshly instantiated metas.
        if (constantType.scheme) {
            return this.instantiateScheme(constantType.scheme, context, state);
        }
        reserveBondVarIds(constantType.type, state);
        const preparedType = prepareAst(constantType.type, [], state, true, true, state.elaborateMetas ? new Map : undefined);
        return containsForeignMetavariable(preparedType, state)
            ? unsupported("metavariable")
            : success(preparedType);
    }
    instantiateScheme(scheme, context, state) {
        reserveBondVarIds(scheme.body, state);
        for (const meta of scheme.metas) {
            if (meta.expectedType)
                reserveBondVarIds(meta.expectedType, state);
            if (meta.preset)
                reserveBondVarIds(meta.preset, state);
        }
        const metaRenames = new Map();
        const localNames = new Map();
        for (const meta of scheme.metas) {
            const localName = allocateMeta(state);
            state.generatedSchematicMetas.add(localName);
            localNames.set(meta.sourceName, localName);
            metaRenames.set(`?${meta.sourceName}`, localName);
            metaRenames.set(`?${meta.sourceName}:`, localName);
        }
        const body = prepareAst(scheme.body, [], state, true, true, metaRenames);
        if (containsForeignMetavariable(body, state))
            return unsupported("metavariable");
        const allowedContextIds = new Set(context.map(([, , id]) => id).filter(validId));
        for (const meta of scheme.metas) {
            const localName = localNames.get(meta.sourceName);
            if (!localName)
                return unsupported("metavariable");
            if (meta.expectedType) {
                const expectedType = prepareAst(meta.expectedType, [], state, true, true, metaRenames);
                recordMetaExpectedType(localName, expectedType, state);
            }
            state.metaAllowedContextIds.set(localName, new Set(allowedContextIds));
        }
        for (const meta of scheme.metas) {
            if (!meta.preset)
                continue;
            const localName = localNames.get(meta.sourceName);
            if (!localName)
                return unsupported("metavariable");
            const preset = prepareAst(meta.preset, [], state, true, true, metaRenames);
            const bound = this.bindMeta(localName, preset, context, state);
            if (bound === "budget-exhausted")
                return unsupported("budget-exhausted");
            if (bound !== "equal")
                return unsupported("metavariable");
        }
        return success(body);
    }
    synthesizeBinder(ast, context, state) {
        const surfaceDomain = cloneSyntax(ast.nodes?.[0]);
        const annotatedDomain = ast.nodes?.[0];
        let domainType;
        if (isLocalMeta(annotatedDomain, state)) {
            const expectedType = ensureLocalMetaIsType(annotatedDomain, context, state);
            domainType = expectedType
                ? success(expectedType)
                : unsupported("metavariable");
        }
        else {
            domainType = this.synthesize(annotatedDomain, context, state);
        }
        if (domainType.status !== "success")
            return domainType;
        const domainLevel = this.expectUniverse(domainType.value, context, state);
        if (domainLevel.status !== "success")
            return domainLevel;
        const resolvedDomain = restoreResolvedSyntax(ast.nodes?.[0], surfaceDomain, state);
        const subcontext = [
            [ast.name, cloneSyntax(resolvedDomain), ast.bondVarId],
            ...context
        ];
        const body = ast.nodes?.[1];
        const inferredBodyType = ast.type !== "L" && isLocalMeta(body, state)
            ? ensureLocalMetaIsType(body, subcontext, state)
            : null;
        const bodyType = inferredBodyType
            ? success(inferredBodyType)
            : this.synthesize(body, subcontext, state);
        if (bodyType.status !== "success")
            return bodyType;
        if (ast.type === "L") {
            return success({
                type: "P",
                name: ast.name,
                nodes: [cloneSyntax(resolvedDomain), bodyType.value],
                bondVarId: ast.bondVarId
            });
        }
        const bodyLevel = this.expectUniverse(bodyType.value, subcontext, state);
        if (bodyLevel.status !== "success")
            return bodyLevel;
        if (annotatedDomain.type === "var" && !annotatedDomain.bondVarId
            && (annotatedDomain.name === "U@" || annotatedDomain.name === "U@:")) {
            return success(makeVariable("U@:"));
        }
        return this.makeMaxUniverse(domainLevel.value, bodyLevel.value, context, state);
    }
    synthesizeArrow(ast, context, state) {
        const domainType = this.synthesize(ast.nodes?.[0], context, state);
        if (domainType.status !== "success")
            return domainType;
        const domainLevel = this.expectUniverse(domainType.value, context, state);
        if (domainLevel.status !== "success")
            return domainLevel;
        const bodyType = this.synthesize(ast.nodes?.[1], context, state);
        if (bodyType.status !== "success")
            return bodyType;
        const bodyLevel = this.expectUniverse(bodyType.value, context, state);
        if (bodyLevel.status !== "success")
            return bodyLevel;
        return this.makeMaxUniverse(domainLevel.value, bodyLevel.value, context, state);
    }
    synthesizeApplication(ast, context, state) {
        const { head, args } = flattenApplication(ast);
        if (head?.type === "var" && head.name === "U" && !head.bondVarId && args.length === 1) {
            const expectedLevelType = makeVariable("U@");
            const levelCheck = this.checkTermAgainstExpected(args[0], expectedLevelType, context, state);
            if (levelCheck.status !== "success")
                return levelCheck;
            const resolvedLevel = state.metas.size
                ? resolveMetas(args[0], state)
                : args[0];
            const successorTerm = makeApplication(makeVariable("@succ"), cloneSyntax(resolvedLevel));
            const successor = this.kernel.tryNormalize(successorTerm, context, kernelOptions(state));
            return successor
                ? success(makeUniverse(successor))
                : isUniverseLevelSolution(resolvedLevel, state, context)
                    ? success(makeUniverse(successorTerm))
                    : unsupported("conversion-unsupported");
        }
        const functionType = this.synthesize(ast.nodes?.[0], context, state);
        if (functionType.status !== "success")
            return functionType;
        const hasLocalMetas = state.metas.size > 0;
        const resolvedFunctionType = hasLocalMetas
            ? resolveMetas(functionType.value, state)
            : functionType.value;
        if (isLocalMeta(resolvedFunctionType, state)
            && state.sourceMetas.has(resolvedFunctionType.name)) {
            return unsupported("metavariable");
        }
        const whnf = this.functionTypeWhnf(resolvedFunctionType, context, state);
        if (!whnf)
            return unsupported("conversion-unsupported");
        let domain;
        let codomain;
        let binderName;
        let binderId;
        if (whnf.type === "P") {
            domain = whnf.nodes?.[0];
            codomain = whnf.nodes?.[1];
            binderName = whnf.name;
            binderId = whnf.bondVarId;
        }
        else if (whnf.type === "->") {
            domain = whnf.nodes?.[0];
            codomain = whnf.nodes?.[1];
        }
        else
            return invalid("expected-function");
        const argument = ast.nodes?.[1];
        const argumentCheck = this.checkTermAgainstExpected(argument, domain, context, state);
        if (argumentCheck.status !== "success")
            return argumentCheck;
        const result = whnf.type === "P"
            ? instantiateBinder(codomain, binderName, binderId, argument)
            : cloneSyntax(codomain);
        const resolvedResult = hasLocalMetas ? resolveMetas(result, state) : result;
        return success(reduceBetaHead(resolvedResult));
    }
    functionTypeWhnf(type, context, state) {
        if (type.type === "P" || type.type === "->")
            return type;
        const whnf = this.kernel.tryWhnf(type, context, kernelOptions(state));
        if (whnf?.type === "P" || whnf?.type === "->")
            return whnf;
        const expanded = cloneSyntax(type);
        if (!this.tryExpandDefinition(expanded, state, true))
            return whnf;
        // Expanding a polymorphic transparent alias allocates fresh metas for
        // its hidden parameters. Check the applied expansion once so explicit
        // arguments constrain those metas before its function WHNF escapes.
        const expandedType = this.synthesize(expanded, context, state);
        const elaborated = expandedType.status === "success"
            ? resolveMetas(expanded, state)
            : expanded;
        const betaReduced = reduceBetaHead(elaborated);
        if (betaReduced.type === "P" || betaReduced.type === "->")
            return betaReduced;
        return this.kernel.tryWhnf(betaReduced, context, kernelOptions(state));
    }
    checkTermAgainstExpected(ast, expected, context, state) {
        const resolvedExpected = containsLocalMeta(expected, state)
            ? resolveMetas(expected, state)
            : expected;
        const expectedWhnf = ast.type === "L"
            ? this.functionTypeWhnf(resolvedExpected, context, state)
            : resolvedExpected.type === "P" || resolvedExpected.type === "->"
                ? resolvedExpected
                : this.kernel.tryWhnf(resolvedExpected, context, kernelOptions(state));
        if (ast.type === "L" && (expectedWhnf?.type === "P" || expectedWhnf?.type === "->")) {
            const expectedDomain = expectedWhnf.nodes?.[0];
            const annotatedDomain = ast.nodes?.[0];
            const surfaceDomain = cloneSyntax(annotatedDomain);
            if (isLocalMeta(annotatedDomain, state)) {
                if (!state.metaExpectedTypes.has(annotatedDomain.name)) {
                    const resolvedDomain = resolveMetas(expectedDomain, state);
                    const expectedDomainType = isLocalMeta(resolvedDomain, state)
                        ? state.metaExpectedTypes.get(resolvedDomain.name)
                        : this.synthesize(cloneSyntax(resolvedDomain), context, state);
                    if (!expectedDomainType)
                        return unsupported("metavariable");
                    if ("status" in expectedDomainType) {
                        if (expectedDomainType.status !== "success")
                            return expectedDomainType;
                        recordMetaExpectedType(annotatedDomain.name, expectedDomainType.value, state);
                    }
                    else {
                        recordMetaExpectedType(annotatedDomain.name, expectedDomainType, state);
                    }
                }
                state.metaAllowedContextIds.set(annotatedDomain.name, new Set(context.map(([, , id]) => id).filter(validId)));
            }
            else {
                const annotatedDomainType = this.synthesize(annotatedDomain, context, state);
                if (annotatedDomainType.status !== "success")
                    return annotatedDomainType;
                const universe = this.expectUniverse(annotatedDomainType.value, context, state);
                if (universe.status !== "success")
                    return universe;
            }
            const domainConversion = this.convertTypes(annotatedDomain, expectedDomain, context, state);
            if (domainConversion === "budget-exhausted")
                return unsupported("budget-exhausted");
            if (domainConversion === "unsupported")
                return unsupported("conversion-unsupported");
            if (domainConversion === "unequal")
                return invalid("argument-type-mismatch");
            const resolvedDomain = restoreResolvedSyntax(annotatedDomain, surfaceDomain, state);
            const bodyContext = [
                [ast.name, cloneSyntax(resolvedDomain), ast.bondVarId],
                ...context
            ];
            const expectedBody = expectedWhnf.type === "P"
                ? instantiateBinder(expectedWhnf.nodes?.[1], expectedWhnf.name, expectedWhnf.bondVarId, makeVariable(ast.name, ast.bondVarId))
                : cloneSyntax(expectedWhnf.nodes?.[1]);
            const body = ast.nodes?.[1];
            if (isLocalMeta(body, state)) {
                recordMetaExpectedType(body.name, expectedBody, state);
                state.metaAllowedContextIds.set(body.name, new Set(bodyContext.map(([, , id]) => id).filter(validId)));
                if (state.annotateTerm)
                    body.checked = cloneSyntax(expectedBody);
            }
            else {
                const bodyCheck = this.checkTermAgainstExpected(body, expectedBody, bodyContext, state);
                if (bodyCheck.status !== "success")
                    return bodyCheck;
            }
            if (state.annotateTerm)
                ast.checked = cloneSyntax(resolvedExpected);
            return success(cloneSyntax(resolvedExpected));
        }
        if (isLocalMeta(ast, state)) {
            if (!state.metaExpectedTypes.has(ast.name)) {
                recordMetaExpectedType(ast.name, expected, state);
                state.metaAllowedContextIds.set(ast.name, new Set(context.map(([, , id]) => id).filter(validId)));
            }
            if (state.annotateTerm)
                ast.checked = cloneSyntax(expected);
            return success(cloneSyntax(expected));
        }
        const actual = this.synthesize(ast, context, state);
        if (actual.status !== "success") {
            if (actual.code === "expected-function"
                || actual.code === "conversion-unsupported"
                || actual.code === "metavariable") {
                const refined = this.tryRefineSourceTypeMetaApplication(ast, resolvedExpected, context, state);
                if (refined)
                    return refined;
            }
            return actual;
        }
        const conversion = this.convertTypes(actual.value, resolvedExpected, context, state, [], [], "left");
        if (conversion === "budget-exhausted")
            return unsupported("budget-exhausted");
        if (conversion === "unsupported")
            return unsupported("conversion-unsupported");
        if (conversion === "unequal")
            return invalid("argument-type-mismatch");
        return success(actual.value);
    }
    tryRefineSourceTypeMetaApplication(ast, expected, context, state) {
        if (ast.type !== "apply")
            return null;
        const functionType = this.synthesize(ast.nodes?.[0], context, state);
        if (functionType.status !== "success")
            return null;
        const resolvedFunctionType = resolveMetas(functionType.value, state);
        if (!isLocalMeta(resolvedFunctionType, state)
            || !state.sourceMetas.has(resolvedFunctionType.name))
            return null;
        const argumentType = this.synthesize(ast.nodes?.[1], context, state);
        if (argumentType.status !== "success")
            return argumentType;
        const binderId = allocateId(state);
        const candidate = {
            type: "P",
            name: "_",
            bondVarId: binderId,
            nodes: [
                resolveMetas(argumentType.value, state),
                resolveMetas(expected, state)
            ]
        };
        const bound = this.bindMeta(resolvedFunctionType.name, candidate, context, state);
        if (bound === "budget-exhausted")
            return unsupported("budget-exhausted");
        if (bound !== "equal")
            return unsupported("metavariable");
        const resolvedExpected = resolveMetas(expected, state);
        if (state.annotateTerm)
            ast.checked = cloneSyntax(resolvedExpected);
        return success(resolvedExpected);
    }
    convertTypes(left, right, context, state, leftScope = [], rightScope = [], synthesizedTypeSide) {
        if (exactSyntaxEqual(left, right))
            return "equal";
        let semanticBudgetExhausted = false;
        // Universe-level normalization is tiny and independent of ordinary
        // term reduction. Keep it available when the general conversion
        // budget is exhausted; otherwise a harmless `max 0 0` can strand an
        // entire large dependent type behind an unsupported result.
        if (state.maxSteps - state.steps <= 32) {
            const universeEqual = this.tryLowBudgetUniverseEquality(left, right, context, state, leftScope, rightScope);
            if (universeEqual)
                return "equal";
        }
        if (synthesizedTypeSide !== undefined && state.steps >= state.maxSteps) {
            const resolvedLeft = resolveMetas(left, state);
            const resolvedRight = resolveMetas(right, state);
            if (synthesizedTypeSide === "left"
                && !isLocalMeta(resolvedLeft, state)
                && isLocalMeta(resolvedRight, state)) {
                const alignedLeft = alignScopeSyntax(resolvedLeft, leftScope, rightScope);
                return alignedLeft
                    ? this.bindSynthesizedTypeMetaAtBudget(resolvedRight.name, alignedLeft, contextWithScope(rightScope, context), state)
                    : "unsupported";
            }
            if (synthesizedTypeSide === "right"
                && isLocalMeta(resolvedLeft, state)
                && !isLocalMeta(resolvedRight, state)) {
                const alignedRight = alignScopeSyntax(resolvedRight, rightScope, leftScope);
                return alignedRight
                    ? this.bindSynthesizedTypeMetaAtBudget(resolvedLeft.name, alignedRight, contextWithScope(leftScope, context), state)
                    : "unsupported";
            }
        }
        if (!state.metas.size) {
            const semantic = this.kernel.tryEqualResult(left, right, context, kernelOptions(state));
            if (semantic === "equal" || !state.elaborateMetas)
                return semantic;
            if (semantic === "budget-exhausted")
                semanticBudgetExhausted = true;
            // Elaborating conversion has additional syntax-directed rules
            // (implicit aliases, arrow/Pi equivalence and eta) that the
            // closed kernel intentionally does not model. Only a positive
            // kernel result is authoritative on this path.
        }
        if (!containsLocalMeta(left, state) && !containsLocalMeta(right, state)) {
            const semantic = this.kernel.tryEqualResult(left, right, context, kernelOptions(state));
            // A local-meta request may still need syntax-directed alias
            // elaboration even when this particular subtree is meta-free.
            // Only a positive semantic result is authoritative here.
            if (semantic === "equal")
                return semantic;
            if (semantic === "budget-exhausted")
                semanticBudgetExhausted = true;
        }
        if (!takeStep(state))
            return "budget-exhausted";
        let resolvedLeft = resolveMetas(left, state);
        let resolvedRight = resolveMetas(right, state);
        const reduceBetaHead = (term) => {
            if (term.type !== "apply")
                return term;
            const { head, args } = flattenApplication(term);
            if (head?.type !== "L" || !args.length)
                return term;
            let reduced = head;
            let argumentIndex = 0;
            while (reduced.type === "L" && argumentIndex < args.length) {
                reduced = instantiateBinder(reduced.nodes?.[1], reduced.name, reduced.bondVarId, args[argumentIndex++]);
            }
            return argumentIndex < args.length
                ? makeApplication(reduced, ...args.slice(argumentIndex).map(cloneSyntax))
                : reduced;
        };
        resolvedLeft = reduceBetaHead(resolvedLeft);
        resolvedRight = reduceBetaHead(resolvedRight);
        if (state.elaborateMetas
            && !containsUnsolvedLocalMeta(resolvedLeft, state)
            && !containsUnsolvedLocalMeta(resolvedRight, state)) {
            const leftContext = contextWithScope(leftScope, context);
            const rightContext = contextWithScope(rightScope, context);
            // These WHNFs are transient conversion probes. Quoting the two
            // sides through the caller's global allocator gives alpha-equal
            // binders different ids and can strand a later structural retry.
            // Let each kernel call derive the same deterministic ids from its
            // context snapshot instead; returned elaborated terms still use
            // the caller allocator on their normal synthesis path.
            const conversionOptions = {
                ...kernelOptions(state),
                freshBondVarId: undefined
            };
            resolvedLeft = this.kernel.tryWhnf(resolvedLeft, leftContext, conversionOptions) ?? resolvedLeft;
            resolvedRight = this.kernel.tryWhnf(resolvedRight, rightContext, conversionOptions) ?? resolvedRight;
            const alignedResolvedRight = alignScopeSyntax(resolvedRight, rightScope, leftScope);
            // Syntax-directed conversion has already paid for reaching these
            // closed WHNFs. Let the final semantic comparison use the caller's
            // full per-probe budget instead of subtracting those checker steps.
            const finishingOptions = {
                ...conversionOptions,
                maxSteps: state.maxSteps
            };
            if (alignedResolvedRight) {
                if (exactSyntaxEqual(resolvedLeft, alignedResolvedRight))
                    return "equal";
                const finishingEquality = this.kernel.tryEqualResult(resolvedLeft, alignedResolvedRight, leftContext, finishingOptions);
                if (finishingEquality === "equal")
                    return "equal";
                if (finishingEquality === "budget-exhausted") {
                    semanticBudgetExhausted = true;
                }
            }
        }
        const leftPattern = this.tryBindAppliedPatternMeta(resolvedLeft, resolvedRight, leftScope, rightScope, context, state);
        if (leftPattern !== null) {
            if (leftPattern !== "equal")
                return leftPattern;
            return this.convertTypes(resolveMetas(resolvedLeft, state), resolvedRight, context, state, leftScope, rightScope, synthesizedTypeSide);
        }
        const rightPattern = this.tryBindAppliedPatternMeta(resolvedRight, resolvedLeft, rightScope, leftScope, context, state);
        if (rightPattern !== null) {
            if (rightPattern !== "equal")
                return rightPattern;
            return this.convertTypes(resolvedLeft, resolveMetas(resolvedRight, state), context, state, leftScope, rightScope, synthesizedTypeSide);
        }
        // A direct metavariable already accepts any candidate that passes
        // bindMeta's occurs, scope and type checks. Expanding a transparent
        // candidate first can turn a compact eqvComp endpoint into a huge
        // pair term and exhaust the conversion budget before those checks.
        if (state.directMetaBeforeDelta && isLocalMeta(resolvedLeft, state)) {
            const alignedRight = alignScopeSyntax(resolvedRight, rightScope, leftScope);
            return alignedRight
                ? this.bindMeta(resolvedLeft.name, alignedRight, contextWithScope(leftScope, context), state, synthesizedTypeSide === "right")
                : "unsupported";
        }
        if (state.directMetaBeforeDelta && isLocalMeta(resolvedRight, state)) {
            const alignedLeft = alignScopeSyntax(resolvedLeft, leftScope, rightScope);
            return alignedLeft
                ? this.bindMeta(resolvedRight.name, alignedLeft, contextWithScope(rightScope, context), state, synthesizedTypeSide === "left")
                : "unsupported";
        }
        const leftSuccessorArgument = naturalSuccessorArgument(resolvedLeft);
        const rightLiteral = naturalLiteralValue(resolvedRight);
        if (leftSuccessorArgument && rightLiteral !== null) {
            if (rightLiteral === 0n)
                return "unequal";
            return this.convertTypes(leftSuccessorArgument, makeVariable(String(rightLiteral - 1n)), context, state, leftScope, rightScope, synthesizedTypeSide);
        }
        const rightSuccessorArgument = naturalSuccessorArgument(resolvedRight);
        const leftLiteral = naturalLiteralValue(resolvedLeft);
        if (rightSuccessorArgument && leftLiteral !== null) {
            if (leftLiteral === 0n)
                return "unequal";
            return this.convertTypes(makeVariable(String(leftLiteral - 1n)), rightSuccessorArgument, context, state, leftScope, rightScope, synthesizedTypeSide);
        }
        for (let pass = 0; pass < 2; pass++) {
            const leftHeadName = constantHeadName(resolvedLeft);
            const rightHeadName = constantHeadName(resolvedRight);
            if (leftHeadName === rightHeadName)
                break;
            resolvedLeft = this.prepareConversionHead(resolvedLeft, rightHeadName, contextWithScope(leftScope, context), state);
            resolvedRight = this.prepareConversionHead(resolvedRight, leftHeadName, contextWithScope(rightScope, context), state);
        }
        if (isLocalMeta(resolvedLeft, state)) {
            const alignedRight = alignScopeSyntax(resolvedRight, rightScope, leftScope);
            return alignedRight
                ? this.bindMeta(resolvedLeft.name, alignedRight, contextWithScope(leftScope, context), state, synthesizedTypeSide === "right")
                : "unsupported";
        }
        if (isLocalMeta(resolvedRight, state)) {
            const alignedLeft = alignScopeSyntax(resolvedLeft, leftScope, rightScope);
            return alignedLeft
                ? this.bindMeta(resolvedRight.name, alignedLeft, contextWithScope(rightScope, context), state, synthesizedTypeSide === "left")
                : "unsupported";
        }
        if (resolvedLeft.type === "var" && resolvedRight.type === "var") {
            const leftPosition = scopePosition(resolvedLeft, leftScope);
            const rightPosition = scopePosition(resolvedRight, rightScope);
            if (leftPosition >= 0 || rightPosition >= 0) {
                return leftPosition === rightPosition ? "equal" : "unequal";
            }
            if (resolvedLeft.name === resolvedRight.name
                && (!validId(resolvedLeft.bondVarId) || resolvedLeft.bondVarId === resolvedRight.bondVarId)) {
                return "equal";
            }
        }
        // `A -> B` is the non-dependent surface form of `Pi _:A, B`.
        // Constant caches can legitimately use either spelling, so compare
        // them through the ordinary Pi telescope machinery. The synthetic
        // binder is fresh and absent from the arrow codomain; a genuinely
        // dependent Pi body will therefore still compare unequal.
        if (resolvedLeft.type === "->" && resolvedRight.type === "P") {
            const binderId = allocateId(state);
            return this.convertTypes({
                type: "P",
                name: `*nbe${binderId}`,
                bondVarId: binderId,
                nodes: [
                    cloneSyntax(resolvedLeft.nodes?.[0]),
                    cloneSyntax(resolvedLeft.nodes?.[1])
                ]
            }, resolvedRight, context, state, leftScope, rightScope, synthesizedTypeSide);
        }
        if (resolvedLeft.type === "P" && resolvedRight.type === "->") {
            const binderId = allocateId(state);
            return this.convertTypes(resolvedLeft, {
                type: "P",
                name: `*nbe${binderId}`,
                bondVarId: binderId,
                nodes: [
                    cloneSyntax(resolvedRight.nodes?.[0]),
                    cloneSyntax(resolvedRight.nodes?.[1])
                ]
            }, context, state, leftScope, rightScope, synthesizedTypeSide);
        }
        const leftBinder = resolvedLeft.type === "L" || resolvedLeft.type === "P"
            || resolvedLeft.type === "S" || resolvedLeft.type === "W";
        const rightBinder = resolvedRight.type === "L" || resolvedRight.type === "P"
            || resolvedRight.type === "S" || resolvedRight.type === "W";
        if (leftBinder && rightBinder && resolvedLeft.type === resolvedRight.type) {
            const domain = this.convertTypes(resolvedLeft.nodes?.[0], resolvedRight.nodes?.[0], context, state, leftScope, rightScope, synthesizedTypeSide);
            if (domain === "budget-exhausted")
                semanticBudgetExhausted = true;
            if (domain === "equal") {
                const body = this.convertTypes(resolvedLeft.nodes?.[1], resolvedRight.nodes?.[1], context, state, [{
                        name: resolvedLeft.name,
                        id: resolvedLeft.bondVarId,
                        type: resolvedLeft.nodes?.[0]
                    }, ...leftScope], [{
                        name: resolvedRight.name,
                        id: resolvedRight.bondVarId,
                        type: resolvedRight.nodes?.[0]
                    }, ...rightScope], synthesizedTypeSide);
                if (body === "equal")
                    return "equal";
                if (body === "budget-exhausted")
                    semanticBudgetExhausted = true;
            }
        }
        const leftLambda = resolvedLeft.type === "L";
        const rightLambda = resolvedRight.type === "L";
        if (leftLambda !== rightLambda) {
            const lambda = leftLambda ? resolvedLeft : resolvedRight;
            const lambdaScope = leftLambda ? leftScope : rightScope;
            const other = leftLambda ? resolvedRight : resolvedLeft;
            const otherScope = leftLambda ? rightScope : leftScope;
            if (validId(lambda.bondVarId)) {
                const otherDomain = alignScopeSyntax(lambda.nodes?.[0], lambdaScope, otherScope);
                if (otherDomain) {
                    const otherBinderId = allocateId(state);
                    const otherVariable = makeVariable(lambda.name, otherBinderId);
                    const lambdaBinding = {
                        name: lambda.name,
                        id: lambda.bondVarId,
                        type: lambda.nodes?.[0]
                    };
                    const otherBinding = {
                        name: lambda.name,
                        id: otherBinderId,
                        type: otherDomain
                    };
                    const body = leftLambda
                        ? this.convertTypes(lambda.nodes?.[1], makeApplication(cloneSyntax(other), otherVariable), context, state, [lambdaBinding, ...leftScope], [otherBinding, ...rightScope], synthesizedTypeSide)
                        : this.convertTypes(makeApplication(cloneSyntax(other), otherVariable), lambda.nodes?.[1], context, state, [otherBinding, ...leftScope], [lambdaBinding, ...rightScope], synthesizedTypeSide);
                    if (body === "equal")
                        return "equal";
                    if (body === "unsupported" || body === "budget-exhausted")
                        return body;
                }
            }
        }
        if (resolvedLeft.type === resolvedRight.type
            && resolvedLeft.type !== "var"
            && (resolvedLeft.nodes?.length ?? 0) === (resolvedRight.nodes?.length ?? 0)) {
            const leftNodes = resolvedLeft.nodes ?? [];
            const rightNodes = resolvedRight.nodes ?? [];
            let structurallyEqual = true;
            // A later explicit argument can solve the type of an earlier
            // opaque one. Preserve left-to-right constraints, then retry only
            // children that were blocked by still-unsolved metas.
            const deferredChildren = [];
            for (let index = 0; index < leftNodes.length; index++) {
                const child = this.convertTypes(leftNodes[index], rightNodes[index], context, state, leftScope, rightScope, synthesizedTypeSide);
                const blockedByUnsolvedMeta = child === "unsupported"
                    && synthesizedTypeSide !== undefined
                    && (containsUnsolvedLocalMeta(leftNodes[index], state)
                        || containsUnsolvedLocalMeta(rightNodes[index], state));
                if (blockedByUnsolvedMeta) {
                    deferredChildren.push(index);
                }
                else if (child !== "equal") {
                    if (child === "budget-exhausted")
                        semanticBudgetExhausted = true;
                    structurallyEqual = false;
                    break;
                }
            }
            for (const index of structurallyEqual ? deferredChildren : []) {
                const child = this.convertTypes(leftNodes[index], rightNodes[index], context, state, leftScope, rightScope, synthesizedTypeSide);
                if (child !== "equal") {
                    if (child === "budget-exhausted")
                        semanticBudgetExhausted = true;
                    structurallyEqual = false;
                    break;
                }
            }
            if (structurallyEqual && (leftNodes.length || resolvedLeft.name === resolvedRight.name)) {
                return "equal";
            }
        }
        const semanticLeft = resolveMetas(resolvedLeft, state);
        const semanticRight = resolveMetas(resolvedRight, state);
        const alignedSemanticRight = alignScopeSyntax(semanticRight, rightScope, leftScope);
        if (!alignedSemanticRight)
            return "unsupported";
        const semantic = this.kernel.tryEqualResult(semanticLeft, alignedSemanticRight, contextWithScope(leftScope, context), kernelOptions(state));
        if (semantic === "equal")
            return "equal";
        if (semantic === "unequal"
            && semanticLeft.type !== alignedSemanticRight.type
            && (isRigidTypeFormer(semanticLeft) || isRigidTypeFormer(alignedSemanticRight))) {
            return "unequal";
        }
        const hasUnsolvedMetas = containsUnsolvedLocalMeta(semanticLeft, state)
            || containsUnsolvedLocalMeta(alignedSemanticRight, state);
        if (hasUnsolvedMetas)
            return "unsupported";
        return semantic === "unsupported" && semanticBudgetExhausted
            ? "budget-exhausted"
            : semantic;
    }
    tryLowBudgetUniverseEquality(left, right, context, state, leftScope, rightScope) {
        const options = {
            maxSteps: 64,
            deadline: state.deadline,
            rigidMetas: state.metas.size > 0,
            freshBondVarId: state.freshBondVarId
        };
        const normalizedLeft = this.kernel.tryNormalizeUniverseLevel(resolveMetas(left, state), contextWithScope(leftScope, context), options);
        if (!normalizedLeft)
            return false;
        const normalizedRight = this.kernel.tryNormalizeUniverseLevel(resolveMetas(right, state), contextWithScope(rightScope, context), options);
        if (!normalizedRight)
            return false;
        const alignedRight = alignScopeSyntax(normalizedRight, rightScope, leftScope);
        if (!alignedRight)
            return false;
        if (exactSyntaxEqual(normalizedLeft, alignedRight))
            return true;
        return this.kernel.tryEqualResult(normalizedLeft, alignedRight, contextWithScope(leftScope, context), options) === "equal";
    }
    bindSynthesizedTypeMetaAtBudget(name, value, context, state) {
        const contextualType = value.type === "var"
            ? lookupContextType(value, context)
            : null;
        if (!contextualType) {
            return this.bindMeta(name, value, context, state, true);
        }
        // The surrounding synthesized type already validated this context
        // entry. Give strict meta binding a small finishing reserve so it can
        // re-establish the expected type/universe constraints without making
        // the whole theorem's speculative budget unbounded.
        const previousMaxSteps = state.maxSteps;
        state.maxSteps = Math.max(previousMaxSteps, state.steps + 256);
        try {
            return this.bindMeta(name, value, context, state, true);
        }
        finally {
            state.maxSteps = previousMaxSteps;
        }
    }
    tryBindAppliedPatternMeta(term, other, termScope, otherScope, context, state) {
        const { head, args } = flattenApplication(term);
        // Start with the unary Miller-pattern case used by dependent family
        // parameters such as the `b` in `pr0 : (Σx:a,b x) -> a`. Higher
        // arities can be added without weakening the capture restriction.
        if (!isLocalMeta(head, state) || args.length !== 1 || args[0].type !== "var") {
            return null;
        }
        // Do not abstract an unresolved meta into the body of another meta.
        // A later solution for `other` is expressed in the current context,
        // so storing `?F := λx.?m` here would leave references in `?m`
        // pointing at the outer x instead of the freshly bound lambda x.
        // Let ordinary direct-meta binding record `?m := ?F x`; once either
        // side becomes concrete this pattern branch can abstract it safely.
        if (isLocalMeta(other, state))
            return null;
        const position = scopePosition(args[0], termScope);
        const sourceBinding = position >= 0 ? termScope[position] : undefined;
        if (sourceBinding?.type && otherScope[position]) {
            const binderId = allocateId(state);
            const binderVariable = makeVariable(sourceBinding.name, binderId);
            const alignedOther = alignScopeSyntax(other, otherScope, termScope);
            const domain = abstractScopeVariable(sourceBinding.type, termScope, position, binderVariable);
            const body = alignedOther && abstractScopeVariable(alignedOther, termScope, position, binderVariable);
            if (!domain || !body)
                return "unsupported";
            const remainingScope = termScope.filter((_, index) => index !== position);
            return this.bindMeta(head.name, {
                type: "L",
                name: sourceBinding.name,
                bondVarId: binderId,
                nodes: [domain, body]
            }, contextWithScope(remainingScope, context), state);
        }
        // checkTermAgainstExpected instantiates a dependent codomain with the
        // lambda's freshly prepared context variable before conversion. That
        // leaves no ScopeBinding telescope, but it is still the unary Miller
        // pattern ?F x when x has a unique context binder id.
        if (termScope.length || otherScope.length || !validId(args[0].bondVarId))
            return null;
        const contextBinding = context.find(([, , id]) => id === args[0].bondVarId);
        if (!contextBinding?.[1])
            return null;
        const binderId = allocateId(state);
        const binderVariable = makeVariable(contextBinding[0], binderId);
        return this.bindMeta(head.name, {
            type: "L",
            name: contextBinding[0],
            bondVarId: binderId,
            nodes: [
                cloneSyntax(contextBinding[1]),
                abstractContextVariable(other, args[0].bondVarId, binderVariable)
            ]
        }, context, state);
    }
    prepareConversionHead(ast, targetHeadName, context, state) {
        let candidate = ast;
        if (!this.hasElaborationDefinition(candidate, targetHeadName)) {
            const reduced = this.kernel.tryWhnf(candidate, context, kernelOptions(state));
            if (reduced)
                candidate = reduced;
        }
        if (!this.hasElaborationDefinition(candidate, targetHeadName))
            return candidate;
        const expanded = cloneSyntax(candidate);
        if (!this.tryExpandDefinition(expanded, state, true))
            return candidate;
        const synthesized = this.synthesize(expanded, context, state);
        if (synthesized.status === "success") {
            // Public aliases such as `isProp a` expand to an applied lambda.
            // Expose the resulting Pi head before structural conversion; the
            // semantic kernel cannot compile the original hole-bearing alias.
            return reduceBetaHead(resolveMetas(expanded, state));
        }
        // A bare implicit alias such as `rfl := refl _` cannot synthesize its
        // hidden endpoint in isolation. Keep its local metas so the explicit
        // term on the other side of conversion can constrain them.
        if (synthesized.status === "unsupported" && synthesized.code === "metavariable") {
            return reduceBetaHead(resolveMetas(expanded, state));
        }
        return candidate;
    }
    hasElaborationDefinition(ast, targetHeadName) {
        const { head } = flattenApplication(ast);
        if (head?.type !== "var" || head.bondVarId)
            return false;
        const visited = new Set();
        let name = head.name;
        while (!visited.has(name)) {
            visited.add(name);
            const definition = this.kernel.getDefinitionSource(name);
            if (!definition || !containsElaborationHole(definition))
                return false;
            const definitionHeadName = constantHeadName(definition);
            if (targetHeadName === undefined || definitionHeadName === targetHeadName)
                return true;
            if (!definitionHeadName)
                return false;
            const transparentHead = this.kernel.getDefinitionSource(definitionHeadName);
            // A public wrapper can supply holes to a fully explicit lambda
            // whose body has the target head (for example rec_S1 -> @rec_S1
            // -> @ind_S1). Elaborate the compact wrapper once and let the
            // semantic kernel decide the remaining transparent conversion.
            if (transparentHead
                && !containsElaborationHole(transparentHead)
                && this.kernel.hasDefinition(definitionHeadName))
                return true;
            name = definitionHeadName;
        }
        return false;
    }
    bindMeta(name, value, context, state, candidateFromSynthesizedType = false) {
        const resolved = resolveMetas(value, state);
        if (isLocalMeta(resolved, state) && resolved.name === name)
            return "equal";
        if (isLocalMeta(resolved, state)) {
            // Keep a user-written schematic meta as the representative when a
            // fresh implicit-alias meta is unified with it. This preserves the
            // shared `?x` surface name and makes its inferred type dependencies
            // reachable from the schematic root.
            if (state.inputMetaSurfaceNames.has(name)
                && !state.inputMetaSurfaceNames.has(resolved.name)) {
                return this.bindMeta(resolved.name, makeVariable(name), context, state, candidateFromSynthesizedType);
            }
            if (occursMeta(name, resolved, state))
                return "unequal";
            const sourceExpected = state.metaExpectedTypes.get(name);
            const targetExpected = state.metaExpectedTypes.get(resolved.name);
            if (sourceExpected && targetExpected) {
                const expectedConversion = this.convertTypes(sourceExpected, targetExpected, context, state);
                if (expectedConversion !== "equal")
                    return expectedConversion;
            }
            else if (sourceExpected) {
                recordMetaExpectedType(resolved.name, sourceExpected, state);
            }
            if (state.localTypeMetas.has(name) || state.localTypeMetas.has(resolved.name)) {
                state.localTypeMetas.add(name);
                state.localTypeMetas.add(resolved.name);
            }
            const sourceAllowed = state.metaAllowedContextIds.get(name);
            const targetAllowed = state.metaAllowedContextIds.get(resolved.name);
            if (sourceAllowed || targetAllowed) {
                const merged = sourceAllowed && targetAllowed
                    ? new Set([...sourceAllowed].filter(id => targetAllowed.has(id)))
                    : new Set(sourceAllowed ?? targetAllowed);
                state.metaAllowedContextIds.set(resolved.name, merged);
            }
            state.metaSolutions.set(name, makeVariable(resolved.name));
            return "equal";
        }
        if (occursMeta(name, resolved, state)) {
            if (isDeferredUniverseMax(name, resolved, state))
                return "equal";
            return "unequal";
        }
        const allowedContextIds = state.metaAllowedContextIds.get(name);
        if (allowedContextIds) {
            for (const id of collectFreeBondVarIds(resolved)) {
                if (!allowedContextIds.has(id))
                    return "unsupported";
            }
        }
        const expectedType = state.metaExpectedTypes.get(name);
        if (expectedType) {
            const candidateType = this.synthesize(cloneSyntax(resolved), context, state);
            if (candidateType.status === "success") {
                const expectedConversion = this.convertTypes(candidateType.value, expectedType, context, state);
                // A successful candidate check is authoritative. Provenance
                // must never turn a real mismatch into an accepted binding.
                if (expectedConversion !== "equal")
                    return expectedConversion;
            }
            else {
                const resolvedExpectedType = resolveMetas(expectedType, state);
                const targetIsTypeMeta = state.localTypeMetas.has(name)
                    || state.sourceMetas.get(name)?.role === "type";
                const expectedIsClosed = !containsUnsolvedLocalMeta(resolvedExpectedType, state) && !containsForeignMetavariable(resolvedExpectedType, state);
                const candidateIsClosed = !containsUnsolvedLocalMeta(resolved, state)
                    && !containsForeignMetavariable(resolved, state);
                const expectedUniverse = this.expectUniverse(resolvedExpectedType, context, state);
                // Registered constant types are trusted. An opaque endpoint
                // from such a synthesized type may therefore solve an
                // ordinary term meta even when re-synthesizing that endpoint
                // in isolation is unsupported. Keep type/source metas and
                // partially constrained terms on the strict path.
                if (!candidateFromSynthesizedType
                    || targetIsTypeMeta
                    || !expectedIsClosed
                    || !candidateIsClosed
                    || expectedUniverse.status !== "invalid"
                    || expectedUniverse.code !== "expected-universe") {
                    return "unsupported";
                }
            }
        }
        else if (state.localTypeMetas.has(name)
            || state.sourceMetas.get(name)?.role === "type") {
            const candidateType = this.synthesize(cloneSyntax(resolved), context, state);
            if (candidateType.status !== "success")
                return "unsupported";
            const universe = this.expectUniverse(candidateType.value, context, state);
            if (universe.status !== "success")
                return "unsupported";
        }
        else if (!isUniverseLevelSolution(resolved, state, context)) {
            // Anonymous holes and cache metas without a recorded `?m:` type
            // remain restricted to universe levels. A visible U@ binder is a
            // valid level even though it carries a binder id.
            return "unsupported";
        }
        state.metaSolutions.set(name, cloneSyntax(resolved));
        return "equal";
    }
    expectUniverse(type, context, state) {
        const hasLocalMetas = state.metas.size > 0;
        const resolved = hasLocalMetas ? resolveMetas(type, state) : type;
        const directLevel = universeLevel(resolved);
        if (directLevel)
            return success(directLevel);
        const whnf = this.kernel.tryWhnf(resolved, context, kernelOptions(state));
        if (!whnf)
            return unsupported("conversion-unsupported");
        const level = universeLevel(whnf);
        return level ? success(level) : invalid("expected-universe");
    }
    makeMaxUniverse(left, right, context, state) {
        const maximumTerm = makeApplication(makeVariable("@max"), cloneSyntax(left), cloneSyntax(right));
        const maximum = this.kernel.tryNormalize(maximumTerm, context, kernelOptions(state));
        return maximum
            ? success(makeUniverse(maximum))
            : isUniverseLevelSolution(left, state, context)
                && isUniverseLevelSolution(right, state, context)
                ? success(makeUniverse(maximumTerm))
                : unsupported("conversion-unsupported");
    }
}
//# sourceMappingURL=nbe-checker.js.map