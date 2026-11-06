/** Closed numeric definitions, using the legacy rule names. */
export function getNumberLiteralDefinition(name) {
    // In particular, do not let RegExp's final $ accept a trailing newline.
    if (name !== name.trim())
        return undefined;
    let match = /^d([1-9][0-9]*)$/.exec(name);
    if (match)
        return `⊢${match[1]}=S(${BigInt(match[1]) - 1n})`;
    match = /^dZ([+-]?)(0|[1-9][0-9]*)$/.exec(name);
    if (match) {
        const sign = match[1] || "+";
        const magnitude = BigInt(match[2]);
        const pair = sign === "-" ? `0,${magnitude}` : `${magnitude},0`;
        return `⊢${sign}${magnitude}=Z((${pair}))`;
    }
    match = /^dQ([+-]?)(0|[1-9][0-9]*)q?$/.exec(name)
        || /^d([+-]?)(0|[1-9][0-9]*)q$/.exec(name);
    if (match) {
        const sign = match[1] || "+";
        const magnitude = BigInt(match[2]);
        const literal = `${sign === "-" ? "-" : ""}${magnitude}q`;
        return `⊢${literal}=Q((${sign}${magnitude},+1))`;
    }
    // Bare decimal rule names belong to ℚ, as in the legacy dispatch order.
    match = /^dQ?([+-]?)(0|[1-9][0-9]*)\.([0-9]*)q?$/.exec(name);
    if (match) {
        const sign = match[1] || "+";
        const literal = `${sign === "-" ? "-" : ""}${match[2]}.${match[3]}`;
        const numerator = BigInt(match[2] + match[3]);
        const denominator = 10n ** BigInt(match[3].length);
        return `⊢${literal}=Q((${sign}${numerator},+${denominator}))`;
    }
    match = /^dR([+-]?)(0|[1-9][0-9]*)r?$/.exec(name)
        || /^d([+-]?)(0|[1-9][0-9]*)r$/.exec(name);
    if (match) {
        const literal = `${match[1] === "-" ? "-" : ""}${BigInt(match[2])}`;
        return realDefinition(`${literal}r`, `${literal}q`);
    }
    match = /^dR?([+-]?)(0|[1-9][0-9]*)\.([0-9]*)r?$/.exec(name);
    if (match) {
        const literal = `${match[1] === "-" ? "-" : ""}${match[2]}.${match[3]}`;
        return realDefinition(`${literal}r`, literal);
    }
    return undefined;
}
function realDefinition(literal, boundary) {
    // Both ℚ and the literal boundary are closed terms. The only variable, x,
    // is bound by separation, so these definitions need no #nf premises.
    return `⊢${literal}={x∈ℚ|x≤${boundary}∧¬(x=${boundary})}`;
}
//# sourceMappingURL=literals.js.map