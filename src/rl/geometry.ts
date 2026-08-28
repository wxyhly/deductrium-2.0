// ============================================================
// 尺规层几何引擎（浮点坐标，2D / 3D）
// 元素：点、直线（无限）、平面、圆（平面内）、球
// 交点：线-线 / 线-圆 / 线-球 / 圆-圆 / 圆-球 / 线-面 / 圆-面 / 球-面(交圆) / 球-球(交圆)
// ============================================================

export interface Vec3 { x: number; y: number; z: number }

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const v3add = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const v3sub = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const v3scale = (a: Vec3, s: number): Vec3 => v3(a.x * s, a.y * s, a.z * s);
export const v3dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const v3cross = (a: Vec3, b: Vec3): Vec3 => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const v3len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const v3dist = (a: Vec3, b: Vec3): number => v3len(v3sub(a, b));
export const v3norm = (a: Vec3): Vec3 => {
    const l = v3len(a);
    return l < 1e-12 ? v3(0, 0, 0) : v3scale(a, 1 / l);
};

/** 三点是否共线 */
export function collinear(a: Vec3, b: Vec3, c: Vec3, tol = 1e-8): boolean {
    return v3len(v3cross(v3sub(b, a), v3sub(c, a))) < tol;
}

// ============================================================
// 几何元素
// ============================================================
export abstract class GeoElement {
    constructor(public id: string) { }
}

/** 半自由点约束：点被约束在直线/圆上（位置沿元素自由） */
export type PointConstraint =
    | { kind: 'line'; id: string }
    | { kind: 'circle'; id: string };

export class GeoPoint extends GeoElement {
    /** 半自由点约束（addFreePoint 传入）；完全自由点为 undefined */
    public constraint?: PointConstraint;
    constructor(id: string, public pos: Vec3, public isFree = false, constraint?: PointConstraint) {
        super(id);
        this.constraint = constraint;
    }
}

export class GeoLine extends GeoElement {
    constructor(id: string, public p1: GeoPoint, public p2: GeoPoint) { super(id); }
}

export class GeoPlane extends GeoElement {
    constructor(id: string, public a: GeoPoint, public b: GeoPoint, public c: GeoPoint) { super(id); }
}

export class GeoCircle extends GeoElement {
    constructor(
        id: string,
        public center: GeoPoint,
        public radiusPt: GeoPoint,
        public plane: GeoPlane | null,   // null = 地面（z=0）
        public centerPos: Vec3,          // 圆心（已投影到平面）
        public radius: number,
        public normal: Vec3              // 圆所在平面法向
    ) { super(id); }
}

export class GeoSphere extends GeoElement {
    constructor(id: string, public center: GeoPoint, public radiusPt: GeoPoint) { super(id); }
}

// ============================================================
// 平面工具
// ============================================================
export function planeNormal(p: GeoPlane): Vec3 {
    return v3norm(v3cross(v3sub(p.b.pos, p.a.pos), v3sub(p.c.pos, p.a.pos)));
}

/** 平面内正交基 {o 原点, u, v} */
export function planeBasis(p: GeoPlane): { o: Vec3; u: Vec3; v: Vec3 } {
    const n = planeNormal(p);
    const u = v3norm(v3sub(p.b.pos, p.a.pos));
    const v = v3norm(v3cross(n, u));
    return { o: p.a.pos, u, v };
}

/** 点投影到平面 */
export function projectToPlane(pos: Vec3, n: Vec3, planePt: Vec3): Vec3 {
    const d = v3dot(v3sub(pos, planePt), n);
    return v3sub(pos, v3scale(n, d));
}

/** 由点 + 法向构造平面（合成 3 个虚拟点，仅作载体） */
export function planeFromPointNormal(centerPos: Vec3, normal: Vec3): GeoPlane {
    const n = v3norm(normal);
    const ref = Math.abs(n.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0);
    const u = v3norm(v3cross(ref, n));
    const v = v3norm(v3cross(n, u));
    return new GeoPlane('__plane',
        new GeoPoint('__s1', v3add(centerPos, u)),
        new GeoPoint('__s2', v3add(centerPos, v)),
        new GeoPoint('__s3', v3sub(centerPos, u)));
}

/** 构造平面内的圆：圆心/半径点投影到平面后取距离 */
export function makeCircle(id: string, center: GeoPoint, radiusPt: GeoPoint, plane: GeoPlane | null): GeoCircle {
    if (!plane) {
        const cx = center.pos.x, cy = center.pos.y;
        const r = Math.hypot(radiusPt.pos.x - cx, radiusPt.pos.y - cy);
        return new GeoCircle(id, center, radiusPt, null, v3(cx, cy, 0), r, v3(0, 0, 1));
    }
    const n = planeNormal(plane);
    const cp = projectToPlane(center.pos, n, plane.a.pos);
    const rp = projectToPlane(radiusPt.pos, n, plane.a.pos);
    return new GeoCircle(id, center, radiusPt, plane, cp, v3dist(cp, rp), n);
}

/** 采样圆上的点（3D 渲染/拾取用） */
export function sampleCirclePoints(centerPos: Vec3, radius: number, normal: Vec3, seg = 64): Vec3[] {
    const n = v3norm(normal);
    const ref = Math.abs(n.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0);
    const u = v3norm(v3cross(ref, n));
    const v = v3norm(v3cross(n, u));
    const pts: Vec3[] = [];
    for (let i = 0; i < seg; i++) {
        const t = (i / seg) * Math.PI * 2;
        pts.push(v3add(centerPos, v3add(v3scale(u, Math.cos(t) * radius), v3scale(v, Math.sin(t) * radius))));
    }
    return pts;
}

/** 点到直线的最近点（把点投影到直线上） */
export function projectPointToLine(p: Vec3, line: GeoLine): Vec3 {
    const a = line.p1.pos, d = v3sub(line.p2.pos, a);
    const lenSq = v3dot(d, d);
    if (lenSq < 1e-12) return a;
    const t = v3dot(v3sub(p, a), d) / lenSq;
    return v3add(a, v3scale(d, t));
}

/** 点径向投影到圆周（先投影到圆所在平面，再按半径缩放；与圆心重合时取任意方向） */
export function projectPointToCircle(p: Vec3, circle: GeoCircle): Vec3 {
    const planePt = projectToPlane(p, circle.normal, circle.centerPos);
    const d = v3sub(planePt, circle.centerPos);
    const dist = v3len(d);
    if (dist < 1e-12) {
        const ref = Math.abs(circle.normal.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0);
        const u = v3norm(v3cross(ref, circle.normal));
        return v3add(circle.centerPos, v3scale(u, circle.radius));
    }
    return v3add(circle.centerPos, v3scale(d, circle.radius / dist));
}

/** 球面永远正圆的轮廓（与视线方向 w 垂直的大圆 = 球面投影轮廓），返回采样点 */
export function sphereSilhouette(sphere: GeoSphere, viewDir: Vec3, seg = 64): Vec3[] {
    const C = sphere.center.pos, r = v3dist(C, sphere.radiusPt.pos);
    const w = v3norm(viewDir);
    // 轮廓大圆法向 = 视线方向；基 u/v 由 w 构造
    const ref = Math.abs(w.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0);
    const u = v3norm(v3cross(ref, w));
    const v = v3norm(v3cross(w, u));
    const pts: Vec3[] = [];
    for (let i = 0; i < seg; i++) {
        const t = (i / seg) * Math.PI * 2;
        pts.push(v3add(C, v3add(v3scale(u, Math.cos(t) * r), v3scale(v, Math.sin(t) * r))));
    }
    return pts;
}

// ============================================================
// 交点计算
// ============================================================
export interface CircleResult { centerPos: Vec3; radius: number; normal: Vec3 }

function solveQuadratic(A: number, B: number, C: number): number[] {
    if (Math.abs(A) < 1e-14) {
        if (Math.abs(B) < 1e-14) return [];
        return [-C / B];
    }
    const disc = B * B - 4 * A * C;
    if (disc < -1e-9) return [];
    if (disc < 0) return [-B / (2 * A)];
    const sq = Math.sqrt(disc);
    return [(-B - sq) / (2 * A), (-B + sq) / (2 * A)];
}

function dedupe(pts: Vec3[], tol = 1e-7): Vec3[] {
    const out: Vec3[] = [];
    for (const p of pts) {
        if (!out.some(o => v3dist(o, p) < tol)) out.push(p);
    }
    return out;
}

/** 直线与直线（3D，最近点近似） */
export function lineLineIntersection(l1: GeoLine, l2: GeoLine): Vec3[] {
    const p = l1.p1.pos, d1 = v3sub(l1.p2.pos, p);
    const q = l2.p1.pos, d2 = v3sub(l2.p2.pos, q);
    const w0 = v3sub(p, q);
    const a = v3dot(d1, d1), b = v3dot(d1, d2), c = v3dot(d2, d2);
    const d = v3dot(d1, w0), e = v3dot(d2, w0);
    const denom = a * c - b * b;
    if (Math.abs(denom) < 1e-12) return [];   // 平行 / 异面
    const t = (b * e - c * d) / denom;
    const s = (a * e - b * d) / denom;
    const pt = v3add(p, v3scale(d1, t));
    if (v3dist(pt, v3add(q, v3scale(d2, s))) < 1e-6) return [pt];
    return [];
}

/** 直线与圆（3D：直线 ∩ 圆所在平面 ∩ 球面） */
export function lineCircleIntersections(line: GeoLine, circle: GeoCircle): Vec3[] {
    const p0 = line.p1.pos, d = v3sub(line.p2.pos, p0);
    const n = circle.normal, C = circle.centerPos, r = circle.radius;
    const dn = v3dot(d, n);
    if (Math.abs(dn) < 1e-12) {
        if (Math.abs(v3dot(v3sub(p0, C), n)) > 1e-6) return [];
        const f = v3sub(p0, C);
        const A = v3dot(d, d), B = 2 * v3dot(d, f), Cc = v3dot(f, f) - r * r;
        return dedupe(solveQuadratic(A, B, Cc).map(t => v3add(p0, v3scale(d, t))));
    }
    const t = -v3dot(v3sub(p0, C), n) / dn;
    const pt = v3add(p0, v3scale(d, t));
    if (Math.abs(v3dist(pt, C) - r) < 1e-6) return [pt];
    return [];
}

/** 直线与球 */
export function lineSphereIntersections(line: GeoLine, sphere: GeoSphere): Vec3[] {
    const p0 = line.p1.pos, d = v3sub(line.p2.pos, p0);
    const C = sphere.center.pos, r = v3dist(sphere.center.pos, sphere.radiusPt.pos);
    const f = v3sub(p0, C);
    const A = v3dot(d, d), B = 2 * v3dot(d, f), Cc = v3dot(f, f) - r * r;
    return solveQuadratic(A, B, Cc).map(t => v3add(p0, v3scale(d, t)));
}

/** 射线（正交投影视线）与球交点：q 为射线上一点，dir 为方向 */
export function raySphereIntersections(q: Vec3, dir: Vec3, center: Vec3, radius: number): Vec3[] {
    const f = v3sub(q, center);
    const A = v3dot(dir, dir), B = 2 * v3dot(dir, f), C = v3dot(f, f) - radius * radius;
    return solveQuadratic(A, B, C).map(t => v3add(q, v3scale(dir, t)));
}

/** 圆与圆（3D：共面走 2D，异面取两平面交线再验证） */
export function circleCircleIntersections(c1: GeoCircle, c2: GeoCircle): Vec3[] {
    const n1 = c1.normal, C1 = c1.centerPos, r1 = c1.radius;
    const n2 = c2.normal, C2 = c2.centerPos, r2 = c2.radius;
    const parallel = Math.abs(v3dot(n1, n2)) > 1 - 1e-9;
    if (parallel) {
        if (Math.abs(v3dot(v3sub(C2, C1), n1)) > 1e-6) return [];
        const d = v3sub(C2, C1), dist = v3len(d);
        if (dist < 1e-9) return [];                       // 同心
        if (dist > r1 + r2 + 1e-8 || dist < Math.abs(r1 - r2) - 1e-8) return [];
        const a = (r1 * r1 - r2 * r2 + dist * dist) / (2 * dist);
        const h2 = r1 * r1 - a * a;
        if (h2 < -1e-8) return [];
        const h = Math.sqrt(Math.max(0, h2));
        const dir = v3scale(d, 1 / dist);
        const P = v3add(C1, v3scale(dir, a));
        const perp = v3norm(v3cross(n1, dir));
        return dedupe([v3add(P, v3scale(perp, h)), v3sub(P, v3scale(perp, h))]);
    }
    // 两平面交线 L：Q + t·dl
    const dl = v3norm(v3cross(n1, n2));
    const denom = v3dot(n2, dl);
    if (Math.abs(denom) < 1e-12) return [];
    const s = v3dot(n2, v3sub(C2, C1)) / denom;
    const Q = v3add(C1, v3scale(dl, s));
    const w = v3sub(Q, C1);
    const out: Vec3[] = [];
    for (const t of solveQuadratic(1, 2 * v3dot(w, dl), v3dot(w, w) - r1 * r1)) {
        const pt = v3add(Q, v3scale(dl, t));
        if (Math.abs(v3dist(pt, C2) - r2) < 1e-6) out.push(pt);
    }
    return dedupe(out);
}

/** 圆与球 */
export function circleSphereIntersections(circle: GeoCircle, sphere: GeoSphere): Vec3[] {
    const C = circle.centerPos, r = circle.radius, n = circle.normal;
    const Cs = sphere.center.pos, rs = v3dist(sphere.center.pos, sphere.radiusPt.pos);
    const ref = Math.abs(n.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0);
    const u = v3norm(v3cross(ref, n));
    const v = v3norm(v3cross(n, u));
    const w = v3sub(C, Cs);
    const A = 2 * r * v3dot(w, u), B = 2 * r * v3dot(w, v);
    const D = rs * rs - v3dot(w, w) - r * r;
    const R = Math.hypot(A, B);
    if (R < 1e-12) return [];
    if (Math.abs(D) > R + 1e-8) return [];
    const phi = Math.atan2(B, A);
    const delta = Math.acos(Math.max(-1, Math.min(1, D / R)));
    const out: Vec3[] = [];
    for (const th of [phi + delta, phi - delta]) {
        out.push(v3add(C, v3add(v3scale(u, Math.cos(th) * r), v3scale(v, Math.sin(th) * r))));
    }
    return dedupe(out);
}

/** 直线与平面 */
export function linePlaneIntersection(line: GeoLine, plane: GeoPlane): Vec3[] {
    const n = planeNormal(plane), pt0 = plane.a.pos;
    const p0 = line.p1.pos, d = v3sub(line.p2.pos, p0);
    const dn = v3dot(d, n);
    if (Math.abs(dn) < 1e-12) return [];
    const t = -v3dot(v3sub(p0, pt0), n) / dn;
    return [v3add(p0, v3scale(d, t))];
}

/** 圆与平面（圆所在平面 ∩ 目标平面 = 交线，再验证在圆上） */
export function circlePlaneIntersections(circle: GeoCircle, plane: GeoPlane): Vec3[] {
    const n1 = circle.normal, C = circle.centerPos, r = circle.radius;
    const n2 = planeNormal(plane), pt0 = plane.a.pos;
    const parallel = Math.abs(v3dot(n1, n2)) > 1 - 1e-9;
    if (parallel) {
        if (Math.abs(v3dot(v3sub(C, pt0), n1)) > 1e-6) return [];
        return [];   // 圆在平面上 → 无穷多交点
    }
    const dl = v3norm(v3cross(n1, n2));
    const denom = v3dot(n2, dl);
    if (Math.abs(denom) < 1e-12) return [];
    const s = v3dot(n2, v3sub(pt0, C)) / denom;
    const Q = v3add(C, v3scale(dl, s));
    const w = v3sub(Q, C);
    return solveQuadratic(1, 2 * v3dot(w, dl), v3dot(w, w) - r * r).map(t => v3add(Q, v3scale(dl, t)));
}

/** 球与平面 → 交圆 */
export function spherePlaneCircle(sphere: GeoSphere, plane: GeoPlane): CircleResult | null {
    const n = planeNormal(plane), pt0 = plane.a.pos;
    const C = sphere.center.pos, r = v3dist(sphere.center.pos, sphere.radiusPt.pos);
    const d = v3dot(v3sub(C, pt0), n);
    if (Math.abs(d) > r + 1e-8) return null;
    const rr = Math.sqrt(Math.max(0, r * r - d * d));
    if (rr < 1e-9) return null;   // 相切 → 单点，不生成圆
    return { centerPos: v3sub(C, v3scale(n, d)), radius: rr, normal: n };
}

/** 球与球 → 交圆 */
export function sphereSphereCircle(s1: GeoSphere, s2: GeoSphere): CircleResult | null {
    const C1 = s1.center.pos, r1 = v3dist(s1.center.pos, s1.radiusPt.pos);
    const C2 = s2.center.pos, r2 = v3dist(s2.center.pos, s2.radiusPt.pos);
    const dvec = v3sub(C2, C1), d = v3len(dvec);
    if (d < 1e-9) return null;
    if (d > r1 + r2 + 1e-8 || d < Math.abs(r1 - r2) - 1e-8) return null;
    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const h2 = r1 * r1 - a * a;
    if (h2 < -1e-8) return null;
    const h = Math.sqrt(Math.max(0, h2));
    if (h < 1e-9) return null;
    const dir = v3scale(dvec, 1 / d);
    return { centerPos: v3add(C1, v3scale(dir, a)), radius: h, normal: dir };
}

// ============================================================
// 构造步骤 / 引擎
// ============================================================
export type Step =
    | { type: 'free-point'; params: { x: number; y: number; z: number; on?: PointConstraint }; outputIds: string[] }
    | { type: 'line'; params: { p1Id: string; p2Id: string }; outputIds: string[] }
    | { type: 'plane'; params: { aId: string; bId: string; cId: string }; outputIds: string[] }
    | { type: 'circle'; params: { centerId: string; radiusPtId: string; planeId: string; thirdId?: string }; outputIds: string[] }   // planeId '' = 地面；thirdId = 三点定面
    | { type: 'sphere'; params: { centerId: string; radiusPtId: string }; outputIds: string[] }
    | { type: 'intersection'; params: { kind: string; id1: string; id2: string }; outputIds: string[] }            // 交点
    | { type: 'inter-circle'; params: { kind: string; id1: string; id2: string }; outputIds: string[] };           // 交圆 [圆心Id, 圆Id]

export interface IntersectResult { kind: string; points: Vec3[]; circle: CircleResult | null }

export class ConstructionEngine {
    public elements: Map<string, GeoElement> = new Map();
    public stepHistory: Step[] = [];
    private nextId = 0;

    resetIdCounter() { this.nextId = 0; }
    genId(prefix: string): string { return `${prefix}${this.nextId++}`; }

    // ---- 构造 ----
    addFreePoint(pos: Vec3, constraint?: PointConstraint): GeoPoint {
        const id = this.genId('P');
        const pt = new GeoPoint(id, pos, true, constraint);
        this.elements.set(id, pt);
        this.stepHistory.push({
            type: 'free-point',
            params: constraint
                ? { x: pos.x, y: pos.y, z: pos.z, on: constraint }
                : { x: pos.x, y: pos.y, z: pos.z },
            outputIds: [id]
        });
        return pt;
    }

    addLine(p1: GeoPoint, p2: GeoPoint): GeoLine {
        if (p1 === p2 || v3dist(p1.pos, p2.pos) < 1e-9) throw new Error('needTwoPoints');
        const id = this.genId('L');
        const line = new GeoLine(id, p1, p2);
        this.elements.set(id, line);
        this.stepHistory.push({ type: 'line', params: { p1Id: p1.id, p2Id: p2.id }, outputIds: [id] });
        return line;
    }

    addPlane(a: GeoPoint, b: GeoPoint, c: GeoPoint): GeoPlane {
        if (collinear(a.pos, b.pos, c.pos)) throw new Error('collinear');
        const id = this.genId('F');
        const plane = new GeoPlane(id, a, b, c);
        this.elements.set(id, plane);
        this.stepHistory.push({ type: 'plane', params: { aId: a.id, bId: b.id, cId: c.id }, outputIds: [id] });
        return plane;
    }

    /** 画圆：plane 为 null 时在地面（z=0）；third 提供时由 圆心+半径点+第三点 确定平面（不创建独立平面元素） */
    addCircle(center: GeoPoint, radiusPt: GeoPoint, plane: GeoPlane | null, third?: GeoPoint): GeoCircle {
        if (center === radiusPt) throw new Error('needTwoPoints');
        let usePlane = plane;
        const params: { centerId: string; radiusPtId: string; planeId: string; thirdId?: string } = {
            centerId: center.id,
            radiusPtId: radiusPt.id,
            planeId: plane ? plane.id : '',
        };
        if (third) {
            if (collinear(center.pos, radiusPt.pos, third.pos)) throw new Error('collinear');
            usePlane = new GeoPlane('__plane', center, radiusPt, third);   // 匿名平面，不入 elements
            params.thirdId = third.id;
            params.planeId = '';
        }
        const id = this.genId('C');
        const circle = makeCircle(id, center, radiusPt, usePlane);
        if (circle.radius < 1e-9) throw new Error('zeroRadius');
        this.elements.set(id, circle);
        this.stepHistory.push({ type: 'circle', params, outputIds: [id] });
        return circle;
    }

    addSphere(center: GeoPoint, radiusPt: GeoPoint): GeoSphere {
        if (center === radiusPt) throw new Error('needTwoPoints');
        if (v3dist(center.pos, radiusPt.pos) < 1e-9) throw new Error('zeroRadius');
        const id = this.genId('S');
        const sphere = new GeoSphere(id, center, radiusPt);
        this.elements.set(id, sphere);
        this.stepHistory.push({ type: 'sphere', params: { centerId: center.id, radiusPtId: radiusPt.id }, outputIds: [id] });
        return sphere;
    }

    // ---- 求交 ----
    /** 归一化顺序：line < circle < sphere < plane */
    intersectElements(a: GeoElement, b: GeoElement): IntersectResult | null {
        const kindOf = (e: GeoElement): number =>
            e instanceof GeoLine ? 0 : e instanceof GeoCircle ? 1 : e instanceof GeoSphere ? 2 : 3;
        if (kindOf(a) > kindOf(b)) [a, b] = [b, a];
        return this.tryIntersect(a, b);
    }

    private tryIntersect(a: GeoElement, b: GeoElement): IntersectResult | null {
        if (a instanceof GeoLine) {
            if (b instanceof GeoLine) return { kind: 'line-line', points: lineLineIntersection(a, b), circle: null };
            if (b instanceof GeoCircle) return { kind: 'line-circle', points: lineCircleIntersections(a, b), circle: null };
            if (b instanceof GeoSphere) return { kind: 'line-sphere', points: lineSphereIntersections(a, b), circle: null };
            if (b instanceof GeoPlane) return { kind: 'line-plane', points: linePlaneIntersection(a, b), circle: null };
        }
        if (a instanceof GeoCircle) {
            if (b instanceof GeoCircle) return { kind: 'circle-circle', points: circleCircleIntersections(a, b), circle: null };
            if (b instanceof GeoSphere) return { kind: 'circle-sphere', points: circleSphereIntersections(a, b), circle: null };
            if (b instanceof GeoPlane) return { kind: 'circle-plane', points: circlePlaneIntersections(a, b), circle: null };
        }
        if (a instanceof GeoSphere) {
            if (b instanceof GeoSphere) return { kind: 'sphere-sphere', points: [], circle: sphereSphereCircle(a, b) };
            if (b instanceof GeoPlane) return { kind: 'sphere-plane', points: [], circle: spherePlaneCircle(a, b) };
        }
        return null;
    }

    private calcByKind(kind: string, a: GeoElement, b: GeoElement): IntersectResult | null {
        if (kind === 'line-line') return { kind, points: lineLineIntersection(a as GeoLine, b as GeoLine), circle: null };
        if (kind === 'line-circle') return { kind, points: lineCircleIntersections(a as GeoLine, b as GeoCircle), circle: null };
        if (kind === 'line-sphere') return { kind, points: lineSphereIntersections(a as GeoLine, b as GeoSphere), circle: null };
        if (kind === 'line-plane') return { kind, points: linePlaneIntersection(a as GeoLine, b as GeoPlane), circle: null };
        if (kind === 'circle-circle') return { kind, points: circleCircleIntersections(a as GeoCircle, b as GeoCircle), circle: null };
        if (kind === 'circle-sphere') return { kind, points: circleSphereIntersections(a as GeoCircle, b as GeoSphere), circle: null };
        if (kind === 'circle-plane') return { kind, points: circlePlaneIntersections(a as GeoCircle, b as GeoPlane), circle: null };
        if (kind === 'sphere-sphere') return { kind, points: [], circle: sphereSphereCircle(a as GeoSphere, b as GeoSphere) };
        if (kind === 'sphere-plane') return { kind, points: [], circle: spherePlaneCircle(a as GeoSphere, b as GeoPlane) };
        return null;
    }

    /** 由两图元创建交点/交圆，返回创建的点和圆（交圆圆心已注册为点） */
    createIntersection(a: GeoElement, b: GeoElement): { points: GeoPoint[]; circle: GeoCircle | null } {
        const res = this.intersectElements(a, b);
        if (!res) return { points: [], circle: null };
        const pts: GeoPoint[] = [];
        if (res.points.length) {
            const ids: string[] = [];
            for (const pos of res.points) {
                const id = this.genId('I');
                this.elements.set(id, new GeoPoint(id, pos, false));
                ids.push(id);
            }
            this.stepHistory.push({ type: 'intersection', params: { kind: res.kind, id1: a.id, id2: b.id }, outputIds: ids });
            ids.forEach(id => pts.push(this.elements.get(id) as GeoPoint));
            return { points: pts, circle: null };
        }
        if (res.circle) {
            const center = new GeoPoint(this.genId('I'), res.circle.centerPos, false);
            this.elements.set(center.id, center);
            const circle = this.makeInterCircle(this.genId('C'), center, res.circle);
            this.elements.set(circle.id, circle);
            this.stepHistory.push({ type: 'inter-circle', params: { kind: res.kind, id1: a.id, id2: b.id }, outputIds: [center.id, circle.id] });
            return { points: [], circle };
        }
        return { points: [], circle: null };
    }

    private makeInterCircle(id: string, center: GeoPoint, res: CircleResult): GeoCircle {
        const plane = planeFromPointNormal(res.centerPos, res.normal);
        const ref = Math.abs(res.normal.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0);
        const u0 = v3norm(v3cross(ref, res.normal));
        const radiusPt = new GeoPoint('__r', v3add(res.centerPos, v3scale(u0, Math.max(res.radius, 1e-9))));
        return new GeoCircle(id, center, radiusPt, plane, res.centerPos, res.radius, v3norm(res.normal));
    }

    // ---- 查询 ----
    getAllPoints(): GeoPoint[] {
        return Array.from(this.elements.values()).filter(e => e instanceof GeoPoint) as GeoPoint[];
    }
    getAllLines(): GeoLine[] {
        return Array.from(this.elements.values()).filter(e => e instanceof GeoLine) as GeoLine[];
    }
    getAllCircles(): GeoCircle[] {
        return Array.from(this.elements.values()).filter(e => e instanceof GeoCircle) as GeoCircle[];
    }
    getAllSpheres(): GeoSphere[] {
        return Array.from(this.elements.values()).filter(e => e instanceof GeoSphere) as GeoSphere[];
    }
    getAllPlanes(): GeoPlane[] {
        return Array.from(this.elements.values()).filter(e => e instanceof GeoPlane) as GeoPlane[];
    }
    getAllElements(): GeoElement[] {
        return Array.from(this.elements.values());
    }

    // ---- 步骤回放（拖拽自由点后重建全部派生元素） ----
    reconstructAll(): boolean {
        const history = [...this.stepHistory];
        const old = new Map(this.elements);
        this.elements.clear();
        this.resetIdCounter();
        try {
            for (const step of history) this.replayStep(step, old);
            this.stepHistory = history;
            this.applyAllConstraints();
            return true;
        } catch (e) {
            this.elements = old;
            return false;
        }
    }

    /** 半自由点约束重投影：重建后把约束点拉回直线/圆周上 */
    private applyAllConstraints(): void {
        for (const pt of this.getAllPoints()) {
            if (!pt.constraint) continue;
            const c = pt.constraint;
            const el = this.elements.get(c.id);
            if (c.kind === 'line' && el instanceof GeoLine) {
                pt.pos = projectPointToLine(pt.pos, el);
            } else if (c.kind === 'circle' && el instanceof GeoCircle) {
                pt.pos = projectPointToCircle(pt.pos, el);
            }
        }
    }

    /** 把点约束到直线/圆上（用于拖拽时保持约束） */
    constrainPoint(pt: GeoPoint, target: Vec3): Vec3 {
        if (!pt.constraint) return target;
        const c = pt.constraint;
        const el = this.elements.get(c.id);
        if (c.kind === 'line' && el instanceof GeoLine) return projectPointToLine(target, el);
        if (c.kind === 'circle' && el instanceof GeoCircle) return projectPointToCircle(target, el);
        return target;
    }

    private replayStep(step: Step, old: Map<string, GeoElement>): void {
        const el = (id: string): GeoElement => this.elements.get(id) as GeoElement;
        switch (step.type) {
            case 'free-point': {
                const orig = old.get(step.outputIds[0]) as GeoPoint;
                const pos = orig ? orig.pos : v3(step.params.x, step.params.y, step.params.z);
                this.elements.set(step.outputIds[0], new GeoPoint(step.outputIds[0], pos, true, step.params.on));
                break;
            }
            case 'line': {
                const p1 = el(step.params.p1Id) as GeoPoint;
                const p2 = el(step.params.p2Id) as GeoPoint;
                if (!p1 || !p2) throw new Error('missing');
                this.elements.set(step.outputIds[0], new GeoLine(step.outputIds[0], p1, p2));
                break;
            }
            case 'plane': {
                const a = el(step.params.aId) as GeoPoint;
                const b = el(step.params.bId) as GeoPoint;
                const c = el(step.params.cId) as GeoPoint;
                if (!a || !b || !c) throw new Error('missing');
                this.elements.set(step.outputIds[0], new GeoPlane(step.outputIds[0], a, b, c));
                break;
            }
            case 'circle': {
                const center = el(step.params.centerId) as GeoPoint;
                const rp = el(step.params.radiusPtId) as GeoPoint;
                if (!center || !rp) throw new Error('missing');
                if (step.params.thirdId) {
                    const p3 = el(step.params.thirdId) as GeoPoint;
                    if (!p3) throw new Error('missing');
                    // 三点定面（匿名平面，重建约束与圆一致）
                    const pl = new GeoPlane('__plane', center, rp, p3);
                    this.elements.set(step.outputIds[0], makeCircle(step.outputIds[0], center, rp, pl));
                } else {
                    const plane = step.params.planeId ? el(step.params.planeId) as GeoPlane : null;
                    this.elements.set(step.outputIds[0], makeCircle(step.outputIds[0], center, rp, plane));
                }
                break;
            }
            case 'sphere': {
                const center = el(step.params.centerId) as GeoPoint;
                const rp = el(step.params.radiusPtId) as GeoPoint;
                if (!center || !rp) throw new Error('missing');
                this.elements.set(step.outputIds[0], new GeoSphere(step.outputIds[0], center, rp));
                break;
            }
            case 'intersection': {
                const a = el(step.params.id1);
                const b = el(step.params.id2);
                const res = this.calcByKind(step.params.kind, a, b);
                const pts = res ? res.points : [];
                if (pts.length !== step.outputIds.length) throw new Error('countChanged');
                for (let i = 0; i < pts.length; i++) {
                    this.elements.set(step.outputIds[i], new GeoPoint(step.outputIds[i], pts[i], false));
                }
                break;
            }
            case 'inter-circle': {
                const a = el(step.params.id1);
                const b = el(step.params.id2);
                const res = this.calcByKind(step.params.kind, a, b);
                if (!res || !res.circle) throw new Error('noInterCircle');
                const center = new GeoPoint(step.outputIds[0], res.circle.centerPos, false);
                this.elements.set(center.id, center);
                const circle = this.makeInterCircle(step.outputIds[1], center, res.circle);
                this.elements.set(circle.id, circle);
                break;
            }
        }
    }

    clear(): void {
        this.elements.clear();
        this.stepHistory = [];
        this.nextId = 0;
    }
}

