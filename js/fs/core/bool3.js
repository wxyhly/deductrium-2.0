export var Bool3;
(function (Bool3) {
    Bool3[Bool3["T3"] = 1] = "T3";
    Bool3[Bool3["F3"] = 2] = "F3";
    Bool3[Bool3["U3"] = 3] = "U3";
})(Bool3 || (Bool3 = {}));
export const T3 = Bool3.T3;
export const F3 = Bool3.F3;
export const U3 = Bool3.U3;
export function not3(a) {
    return a === F3 ? T3 : a === T3 ? F3 : a;
}
export function and3(a, b) {
    if (a === T3 && b === T3)
        return T3;
    if (a === F3 || b === F3)
        return F3;
    return U3;
}
export function or3(a, b) {
    if (a === T3 || b === T3)
        return T3;
    if (a === F3 && b === F3)
        return F3;
    return U3;
}
//# sourceMappingURL=bool3.js.map