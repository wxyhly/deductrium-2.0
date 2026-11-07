export function stringifyDeductriumAmout(n: number): string {
    const absn = Math.abs(n);
    if (absn >= 1e12) {
        return n / 1e12 + "T";
    } if (absn >= 1e9) {
        return n / 1e9 + "kg";
    } if (absn >= 1e6) {
        return n / 1e6 + "g";
    } if (absn >= 1e3) {
        return n / 1e3 + "mg";
    }
    return n + "µg";
}
