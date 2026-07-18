export var Bool3;
(function (Bool3) {
    Bool3[Bool3["T"] = 0] = "T";
    Bool3[Bool3["F"] = 1] = "F";
    Bool3[Bool3["U"] = 2] = "U";
})(Bool3 || (Bool3 = {}));
export const T = Bool3.T;
export const F = Bool3.F;
export const U = Bool3.U;
export function not3(a) {
    return a === F ? T : a === T ? F : a;
}
export function and3(a, b) {
    if (a === T && b === T)
        return T;
    if (a === F || b === F)
        return F;
    return U;
}
export function or3(a, b) {
    if (a === T || b === T)
        return T;
    if (a === F && b === F)
        return F;
    return U;
}
//# sourceMappingURL=bool3.js.map