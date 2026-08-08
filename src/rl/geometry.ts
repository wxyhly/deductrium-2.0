import { Rational, AlgebraicNumber } from './algebra.js';

// ============================================================
// 精确坐标
// ============================================================
export class ExactCoord {
    public x: AlgebraicNumber;
    public y: AlgebraicNumber;

    constructor(x: AlgebraicNumber | Rational, y: AlgebraicNumber | Rational) {
        this.x = x instanceof AlgebraicNumber ? x : AlgebraicNumber.fromRational(x);
        this.y = y instanceof AlgebraicNumber ? y : AlgebraicNumber.fromRational(y);
    }

    /** 从浮点数创建，四舍五入到分母为 1000000 的有理数 */
    static fromNumbers(nx: number, ny: number): ExactCoord {
        const scale = 1000000;
        return new ExactCoord(
            new Rational(Math.round(nx * scale), scale),
            new Rational(Math.round(ny * scale), scale)
        );
    }

    distanceSquaredTo(other: ExactCoord): AlgebraicNumber {
        const dx = this.x.sub(other.x);
        const dy = this.y.sub(other.y);
        return dx.mul(dx).add(dy.mul(dy));
    }

    toNumbers(): { x: number; y: number } {
        return { x: this.x.toNumber(), y: this.y.toNumber() };
    }

    clone(): ExactCoord {
        return new ExactCoord(this.x, this.y);
    }
}

// ============================================================
// 几何元素（带图层标识）
// ============================================================
export abstract class GeoElement {
    constructor(public id: string, public layerId: string) { }
}

export class GeoPoint extends GeoElement {
    public isFree: boolean;  // 是否为自由点
    constructor(id: string, public coord: ExactCoord, layerId: string, isFree: boolean = false) {
        super(id, layerId);
        this.isFree = isFree;
    }
}

export class GeoLine extends GeoElement {
    constructor(id: string, public p1: GeoPoint, public p2: GeoPoint, layerId: string) {
        super(id, layerId);
    }
}

export class GeoCircle extends GeoElement {
    public radiusSquared: AlgebraicNumber;
    constructor(id: string, public center: GeoPoint, public radiusPoint: GeoPoint, layerId: string) {
        super(id, layerId);
        this.radiusSquared = center.coord.distanceSquaredTo(radiusPoint.coord);
    }
}

// ============================================================
// 图层管理器
// ============================================================
export interface Layer {
    id: string;
    name: string;
    visible: boolean;
    selectable: boolean;
    color: string;
}

export class LayerManager {
    public layers: Layer[] = [
        { id: 'layer0', name: '图层 0', visible: true, selectable: true, color: '#4a9eff' }
    ];
    public currentLayerId: string = 'layer0';

    addLayer(): string {
        const colors = ['#e2b04a', '#5cb878', '#e05555', '#c084fc', '#f97316', '#06b6d4'];
        const id = 'layer_' + Date.now();
        const color = colors[this.layers.length % colors.length];
        this.layers.push({ id, name: `图层 ${this.layers.length}`, visible: true, selectable: true, color });
        return id;
    }

    deleteLayer(id: string): boolean {
        if (this.layers.length <= 1) return false;
        const idx = this.layers.findIndex(l => l.id === id);
        if (idx === -1) return false;
        this.layers.splice(idx, 1);
        if (this.currentLayerId === id) {
            this.currentLayerId = this.layers[0].id;
        }
        return true;
    }

    getLayer(id: string): Layer | undefined {
        return this.layers.find(l => l.id === id);
    }

    toggleVisible(id: string): void {
        const layer = this.getLayer(id);
        if (layer) layer.visible = !layer.visible;
    }

    toggleSelectable(id: string): void {
        const layer = this.getLayer(id);
        if (layer) layer.selectable = !layer.selectable;
    }

    setCurrent(id: string): void {
        if (this.getLayer(id)) this.currentLayerId = id;
    }
}

// ============================================================
// 构造引擎（记录步骤，支持精确重建）
// ============================================================
export interface Step {
    type: 'free-point' | 'line' | 'circle' | 'intersection';
    params: any;
    outputIds: string[];
}

export class ConstructionEngine {
    public elements: Map<string, GeoPoint | GeoLine | GeoCircle> = new Map();
    public stepHistory: Step[] = [];
    private nextId = 0;

    constructor(public layerMgr: LayerManager) { }

    public resetIdCounter() {
        this.nextId = 0;
    }

    private genId(prefix: string): string {
        return `${prefix}_${this.nextId++}`;
    }
    private findExistingPoint(coord: ExactCoord): GeoPoint | null {
        const tol = 1e-8;
        for (const p of this.getAllPoints()) {
            const dx = p.coord.x.toNumber() - coord.x.toNumber();
            const dy = p.coord.y.toNumber() - coord.y.toNumber();
            if (Math.hypot(dx, dy) < tol) {
                return p;
            }
        }
        return null;
    }
    private currentLayer(): string {
        return this.layerMgr.currentLayerId;
    }

    addFreePoint(coord: ExactCoord): GeoPoint {
        const id = this.genId('P');
        const pt = new GeoPoint(id, coord, this.currentLayer(), true);
        this.elements.set(id, pt);
        this.stepHistory.push({ type: 'free-point', params: { coord }, outputIds: [id] });
        return pt;
    }

    addLine(p1Id: string, p2Id: string): GeoLine {
        const p1 = this.elements.get(p1Id) as GeoPoint;
        const p2 = this.elements.get(p2Id) as GeoPoint;
        if (!p1 || !p2 || p1Id === p2Id) throw new Error('需要两个不同的点');
        const id = this.genId('L');
        const line = new GeoLine(id, p1, p2, this.currentLayer());
        this.elements.set(id, line);
        this.stepHistory.push({ type: 'line', params: { p1Id, p2Id }, outputIds: [id] });
        return line;
    }

    addCircle(centerId: string, radiusPtId: string): GeoCircle {
        const c = this.elements.get(centerId) as GeoPoint;
        const r = this.elements.get(radiusPtId) as GeoPoint;
        if (!c || !r || centerId === radiusPtId) throw new Error('需要不同的点');
        const id = this.genId('C');
        const circle = new GeoCircle(id, c, r, this.currentLayer());
        this.elements.set(id, circle);
        this.stepHistory.push({ type: 'circle', params: { centerId, radiusPtId }, outputIds: [id] });
        return circle;
    }

    intersectLines(l1Id: string, l2Id: string): GeoPoint[] {
        const l1 = this.elements.get(l1Id) as GeoLine;
        const l2 = this.elements.get(l2Id) as GeoLine;
        const coord = this.calcLineLineIntersection(l1, l2);
        if (!coord) return [];
        const existing = this.findExistingPoint(coord);
        if (existing) return [existing];
        const id = this.genId('I');
        const pt = new GeoPoint(id, coord, this.currentLayer(), false);
        this.elements.set(id, pt);
        this.stepHistory.push({ type: 'intersection', params: { kind: 'line-line', id1: l1Id, id2: l2Id }, outputIds: [id] });
        return [pt];
    }

    intersectLineCircle(lineId: string, circleId: string): GeoPoint[] {
        const line = this.elements.get(lineId) as GeoLine;
        const circle = this.elements.get(circleId) as GeoCircle;
        const coords = this.calcLineCircleIntersections(line, circle);
        const ids: string[] = [];
        for (const coord of coords) {
            const id = this.genId('I');
            this.elements.set(id, new GeoPoint(id, coord, this.currentLayer(), false));
            ids.push(id);
        }
        if (ids.length > 0) {
            this.stepHistory.push({ type: 'intersection', params: { kind: 'line-circle', id1: lineId, id2: circleId }, outputIds: ids });
        }
        return ids.map(id => this.elements.get(id) as GeoPoint);
    }

    intersectCircles(c1Id: string, c2Id: string): GeoPoint[] {
        const c1 = this.elements.get(c1Id) as GeoCircle;
        const c2 = this.elements.get(c2Id) as GeoCircle;
        const coords = this.calcCircleCircleIntersections(c1, c2);
        const ids: string[] = [];
        for (const coord of coords) {
            const id = this.genId('I');
            this.elements.set(id, new GeoPoint(id, coord, this.currentLayer(), false));
            ids.push(id);
        }
        if (ids.length > 0) {
            this.stepHistory.push({ type: 'intersection', params: { kind: 'circle-circle', id1: c1Id, id2: c2Id }, outputIds: ids });
        }
        return ids.map(id => this.elements.get(id) as GeoPoint);
    }

    /** 求直线交点（精确代数） */
    calcLineLineIntersection(l1: GeoLine, l2: GeoLine): ExactCoord | null {
        const { x: x1, y: y1 } = l1.p1.coord;
        const { x: x2, y: y2 } = l1.p2.coord;
        const { x: x3, y: y3 } = l2.p1.coord;
        const { x: x4, y: y4 } = l2.p2.coord;
        const dx1 = x2.sub(x1);
        const dy1 = y2.sub(y1);
        const dx2 = x4.sub(x3);
        const dy2 = y4.sub(y3);
        const det = dx1.mul(dy2).sub(dy1.mul(dx2));
        if (Math.abs(det.toNumber()) < 1e-12) return null;
        const t = (x3.sub(x1).mul(dy2).sub(y3.sub(y1).mul(dx2))).div(det);
        return new ExactCoord(x1.add(dx1.mul(t)), y1.add(dy1.mul(t)));
    }

    /** 直线与圆交点 */
    calcLineCircleIntersections(line: GeoLine, circle: GeoCircle): ExactCoord[] {
        const cx = circle.center.coord.x;
        const cy = circle.center.coord.y;
        const rSq = circle.radiusSquared;
        const { x: x1, y: y1 } = line.p1.coord;
        const dx = line.p2.coord.x.sub(x1);
        const dy = line.p2.coord.y.sub(y1);
        const fx = x1.sub(cx);
        const fy = y1.sub(cy);
        const a = dx.mul(dx).add(dy.mul(dy));
        const b = AlgebraicNumber.fromInt(2).mul(fx.mul(dx).add(fy.mul(dy)));
        const c = fx.mul(fx).add(fy.mul(fy)).sub(rSq);
        const disc = b.mul(b).sub(a.mul(c).mul(Rational.fromInt(4)));
        if (disc.toNumber() < -1e-10) return [];
        const sqrtD = AlgebraicNumber.sqrt(disc);
        const twoA = a.mul(Rational.fromInt(2));
        const t1 = b.neg().sub(sqrtD).div(twoA);
        const t2 = b.neg().add(sqrtD).div(twoA);
        return [new ExactCoord(x1.add(dx.mul(t1)), y1.add(dy.mul(t1))),
        new ExactCoord(x1.add(dx.mul(t2)), y1.add(dy.mul(t2)))];
    }

    /** 两圆交点（修复精确计算） */
    calcCircleCircleIntersections(c1: GeoCircle, c2: GeoCircle): ExactCoord[] {
        const x1 = c1.center.coord.x, y1 = c1.center.coord.y;
        const x2 = c2.center.coord.x, y2 = c2.center.coord.y;
        const r1Sq = c1.radiusSquared, r2Sq = c2.radiusSquared;
        const dx = x2.sub(x1), dy = y2.sub(y1);
        const dSq = dx.mul(dx).add(dy.mul(dy));
        const d = AlgebraicNumber.sqrt(dSq);
        if (d.toNumber() < 1e-10) return []; // 同心

        const r1 = AlgebraicNumber.sqrt(r1Sq);
        const r2 = AlgebraicNumber.sqrt(r2Sq);
        const dNum = d.toNumber();
        // 不相交或内切/外切但未给出交点？
        if (dNum > r1.toNumber() + r2.toNumber() + 1e-8 ||
            dNum < Math.abs(r1.toNumber() - r2.toNumber()) - 1e-8) return [];

        // 计算 a：圆心连线上的投影距离（从 c1 到垂足）
        const a = (r1Sq.sub(r2Sq).add(dSq)).div(d.mul(Rational.fromInt(2)));
        const hSq = r1Sq.sub(a.mul(a).div(dSq).mul(dSq)); // 实际上是 r1² - a²，但需要保持代数精度
        const h = AlgebraicNumber.sqrt(hSq);
        const midX = x1.add(dx.mul(a).div(d));
        const midY = y1.add(dy.mul(a).div(d));
        const perpX = dy.neg().mul(h).div(d);
        const perpY = dx.mul(h).div(d);
        return [
            new ExactCoord(midX.add(perpX), midY.add(perpY)),
            new ExactCoord(midX.sub(perpX), midY.sub(perpY))
        ];
    }

    clear(): void {
        this.elements.clear();
        this.stepHistory = [];
        this.nextId = 0;
    }

    getAllPoints(): GeoPoint[] {
        return Array.from(this.elements.values()).filter(e => e instanceof GeoPoint) as GeoPoint[];
    }

    getAllLines(): GeoLine[] {
        return Array.from(this.elements.values()).filter(e => e instanceof GeoLine) as GeoLine[];
    }

    getAllCircles(): GeoCircle[] {
        return Array.from(this.elements.values()).filter(e => e instanceof GeoCircle) as GeoCircle[];
    }
}