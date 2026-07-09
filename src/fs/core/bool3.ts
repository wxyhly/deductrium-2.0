export enum Bool3 {
    T, F, U
}
export const T = Bool3.T;
export const F = Bool3.F;
export const U = Bool3.U;
export function not3(a: Bool3) {
    return a === F ? T : a === T ? F : a;
}
export function and3(a: Bool3, b: Bool3) {
    if (a === T && b === T) return T;
    if (a === F || b === F) return F;
    return U;
}
export function or3(a: Bool3, b: Bool3) {
    if (a === T || b === T) return T;
    if (a === F && b === F) return F;
    return U;
}

export function isReplvar(n: string) {
    return n.startsWith("$");
}
export function isLocalvar(n: string) {
    return n.startsWith("#");
}
export function nameEq(a: string, b: string) {
    if (a === b) return T;
    if (isLocalvar(a) || isLocalvar(b)) return F;
    if (isReplvar(a) || isReplvar(b)) return U;
}