import { Rational, AlgebraicNumber } from './algebra.js';
import { ExactCoord, GeoPoint, GeoLine, GeoCircle, LayerManager, ConstructionEngine, Layer } from './geometry.js';

// ============================================================
// 约束验证器
// ============================================================
export class ConstraintValidator {
    constructor(private engine: ConstructionEngine) {}

    checkEqualDistance(p1: GeoPoint, p2: GeoPoint, p3: GeoPoint, p4: GeoPoint) {
        const d12 = p1.coord.distanceSquaredTo(p2.coord);
        const d34 = p3.coord.distanceSquaredTo(p4.coord);
        const diff = Math.abs(d12.sub(d34).toNumber());
        return {
            ok: diff < 1e-8,
            description: `|${p1.id}${p2.id}| ${diff < 1e-8 ? '=' : '≠'} |${p3.id}${p4.id}|`,
            diff
        };
    }

    checkEquilateralTriangle(p1: GeoPoint, p2: GeoPoint, p3: GeoPoint) {
        const c1 = this.checkEqualDistance(p1, p2, p2, p3);
        const c2 = this.checkEqualDistance(p2, p3, p3, p1);
        return {
            ok: c1.ok && c2.ok,
            description: `△${p1.id}${p2.id}${p3.id} ${c1.ok && c2.ok ? '是' : '不是'}等边三角形`,
            checks: [c1, c2]
        };
    }

    checkRightAngle(vertex: GeoPoint, p1: GeoPoint, p2: GeoPoint) {
        const a = vertex.coord.distanceSquaredTo(p1.coord);
        const b = vertex.coord.distanceSquaredTo(p2.coord);
        const c = p1.coord.distanceSquaredTo(p2.coord);
        const diff = Math.abs(a.add(b).sub(c).toNumber());
        return {
            ok: diff < 1e-8,
            description: `∠${p1.id}${vertex.id}${p2.id} ${diff < 1e-8 ? '是' : '不是'}直角`
        };
    }

    checkSquare(p1: GeoPoint, p2: GeoPoint, p3: GeoPoint, p4: GeoPoint) {
        const e1 = this.checkEqualDistance(p1, p2, p2, p3);
        const e2 = this.checkEqualDistance(p2, p3, p3, p4);
        const e3 = this.checkEqualDistance(p3, p4, p4, p1);
        const diag = this.checkEqualDistance(p1, p3, p2, p4);
        const ok = e1.ok && e2.ok && e3.ok && diag.ok;
        return {
            ok,
            description: `四边形 ${ok ? '是' : '不是'}正方形`,
            checks: [e1, e2, e3, diag]
        };
    }
}

// ============================================================
// 关卡定义
// ============================================================
interface Level {
    id: number;
    name: string;
    desc: string;
    verify: (engine: ConstructionEngine, validator: ConstraintValidator) => any;
}

export const LEVELS: Level[] = [
    {
        id: 1,
        name: '等边三角形',
        desc: '构造一个等边三角形',
        verify: (eng, val) => {
            const pts = eng.getAllPoints().slice(-3);
            if (pts.length < 3) return { ok: false, description: '至少需要3个点' };
            return val.checkEquilateralTriangle(pts[0], pts[1], pts[2]);
        }
    },
    {
        id: 2,
        name: '正方形',
        desc: '构造一个正方形',
        verify: (eng, val) => {
            const pts = eng.getAllPoints().slice(-4);
            if (pts.length < 4) return { ok: false, description: '至少需要4个点' };
            return val.checkSquare(pts[0], pts[1], pts[2], pts[3]);
        }
    },
    {
        id: 3,
        name: '直角三角形',
        desc: '构造一个直角三角形',
        verify: (eng, val) => {
            const pts = eng.getAllPoints().slice(-3);
            if (pts.length < 3) return { ok: false, description: '至少需要3个点' };
            for (let i = 0; i < 3; i++) {
                const vertex = pts[i];
                const others = pts.filter((_, j) => j !== i);
                const res = val.checkRightAngle(vertex, others[0], others[1]);
                if (res.ok) return res;
            }
            return val.checkRightAngle(pts[1], pts[0], pts[2]);
        }
    }
];

// ============================================================
// 渲染器
// ============================================================
export class Renderer {
    public offsetX = 0;
    public offsetY = 0;
    public scale = 50;
    public selectedElements: Set<GeoPoint | GeoLine | GeoCircle> = new Set();
    public hoveredElement: GeoPoint | GeoLine | GeoCircle | null = null;
    public inspectedPoint: GeoPoint | null = null;

    private dpr: number;
    private width!: number;
    private height!: number;

    constructor(
        private canvas: HTMLCanvasElement,
        private engine: ConstructionEngine,
        private layerMgr: LayerManager
    ) {
        this.dpr = window.devicePixelRatio || 1;
        this.resize();
    }

    resize(): void {
        const rect = this.canvas.parentElement!.getBoundingClientRect();
        this.canvas.width = rect.width * this.dpr;
        this.canvas.height = rect.height * this.dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        const ctx = this.canvas.getContext('2d')!;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(this.dpr, this.dpr);
        this.width = rect.width;
        this.height = rect.height;
    }

    worldToScreen(wx: number, wy: number): { x: number; y: number } {
        return {
            x: wx * this.scale + this.width / 2 + this.offsetX,
            y: -wy * this.scale + this.height / 2 + this.offsetY
        };
    }

    screenToWorld(sx: number, sy: number): { x: number; y: number } {
        return {
            x: (sx - this.width / 2 - this.offsetX) / this.scale,
            y: -(sy - this.height / 2 - this.offsetY) / this.scale
        };
    }

    findNearPoint(sx: number, sy: number, threshold = 15): GeoPoint | null {
        let best: GeoPoint | null = null;
        let bestDist = threshold;
        for (const pt of this.engine.getAllPoints()) {
            if (!this.layerMgr.getLayer(pt.layerId)?.visible) continue;
            const { x, y } = pt.coord.toNumbers();
            const pos = this.worldToScreen(x, y);
            const d = Math.hypot(pos.x - sx, pos.y - sy);
            if (d < bestDist) { bestDist = d; best = pt; }
        }
        return best;
    }

    findNearLine(sx: number, sy: number, threshold = 10): GeoLine | null {
        let best: GeoLine | null = null;
        let bestDist = threshold;
        for (const line of this.engine.getAllLines()) {
            if (!this.layerMgr.getLayer(line.layerId)?.visible) continue;
            const p1 = this.worldToScreen(line.p1.coord.toNumbers().x, line.p1.coord.toNumbers().y);
            const p2 = this.worldToScreen(line.p2.coord.toNumbers().x, line.p2.coord.toNumbers().y);
            const d = this.distToSegment(sx, sy, p1.x, p1.y, p2.x, p2.y);
            if (d < bestDist) { bestDist = d; best = line; }
        }
        return best;
    }

    findNearCircle(sx: number, sy: number, threshold = 10): GeoCircle | null {
        let best: GeoCircle | null = null;
        let bestDist = threshold;
        for (const cir of this.engine.getAllCircles()) {
            if (!this.layerMgr.getLayer(cir.layerId)?.visible) continue;
            const c = this.worldToScreen(cir.center.coord.toNumbers().x, cir.center.coord.toNumbers().y);
            const rp = this.worldToScreen(cir.radiusPoint.coord.toNumbers().x, cir.radiusPoint.coord.toNumbers().y);
            const r = Math.hypot(rp.x - c.x, rp.y - c.y);
            const d = Math.abs(Math.hypot(sx - c.x, sy - c.y) - r);
            if (d < bestDist) { bestDist = d; best = cir; }
        }
        return best;
    }

    private distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
        const dx = x2 - x1, dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    render(): void {
        const ctx = this.canvas.getContext('2d')!;
        const w = this.width, h = this.height;
        ctx.clearRect(0, 0, w, h);

        // 网格
        ctx.strokeStyle = '#ffffff08';
        ctx.lineWidth = 0.5;
        const gs = this.scale;
        for (let x = (this.offsetX % gs + gs) % gs; x < w; x += gs) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        for (let y = (this.offsetY % gs + gs) % gs; y < h; y += gs) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }

        // 坐标轴
        const origin = this.worldToScreen(0, 0);
        ctx.strokeStyle = '#ffffff20';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, origin.y); ctx.lineTo(w, origin.y);
        ctx.moveTo(origin.x, 0); ctx.lineTo(origin.x, h);
        ctx.stroke();

        // 按图层顺序绘制
        for (const layer of this.layerMgr.layers) {
            if (!layer.visible) continue;
            const color = layer.color;

            // 圆
            for (const cir of this.engine.getAllCircles().filter(c => c.layerId === layer.id)) {
                const c = this.worldToScreen(cir.center.coord.toNumbers().x, cir.center.coord.toNumbers().y);
                const rp = this.worldToScreen(cir.radiusPoint.coord.toNumbers().x, cir.radiusPoint.coord.toNumbers().y);
                const r = Math.hypot(rp.x - c.x, rp.y - c.y);
                const selected = this.selectedElements.has(cir) || this.hoveredElement === cir;
                ctx.strokeStyle = selected ? '#fff' : color + '99';
                ctx.lineWidth = selected ? 2.5 : 1.5;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // 直线
            for (const line of this.engine.getAllLines().filter(l => l.layerId === layer.id)) {
                const p1 = this.worldToScreen(line.p1.coord.toNumbers().x, line.p1.coord.toNumbers().y);
                const p2 = this.worldToScreen(line.p2.coord.toNumbers().x, line.p2.coord.toNumbers().y);
                const dx = p2.x - p1.x, dy = p2.y - p1.y;
                const len = Math.hypot(dx, dy) || 1;
                const ext = 2000;
                const ux = dx / len * ext, uy = dy / len * ext;
                const selected = this.selectedElements.has(line) || this.hoveredElement === line;
                ctx.strokeStyle = selected ? '#fff' : color + 'aa';
                ctx.lineWidth = selected ? 2.5 : 1.2;
                ctx.beginPath();
                ctx.moveTo(p1.x - ux, p1.y - uy);
                ctx.lineTo(p2.x + ux, p2.y + uy);
                ctx.stroke();
            }

            // 点
            for (const pt of this.engine.getAllPoints().filter(p => p.layerId === layer.id)) {
                const pos = this.worldToScreen(pt.coord.toNumbers().x, pt.coord.toNumbers().y);
                const isSelected = this.selectedElements.has(pt);
                const isHovered = this.hoveredElement === pt;
                const isInspected = this.inspectedPoint === pt;
                const radius = isSelected ? 8 : (isHovered || isInspected) ? 7 : 5;

                if (isSelected || isHovered || isInspected) {
                    ctx.fillStyle = isSelected ? '#e2b04a88' : '#ffffff33';
                    ctx.beginPath();
                    ctx.arc(pos.x, pos.y, radius + 5, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.fillStyle = pt.isFree ? '#e2b04a' : color;
                ctx.strokeStyle = (isSelected || isInspected) ? '#fff' : '#222';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = '#fff';
                ctx.font = 'bold 10px sans-serif';
                ctx.fillText(pt.id, pos.x + radius + 3, pos.y - radius - 2);
            }
        }
    }
}

// ============================================================
// 主应用
// ============================================================
export class App {
    public layerMgr: LayerManager;
    public engine: ConstructionEngine;
    public validator: ConstraintValidator;
    private renderer: Renderer;
    private currentTool = 'free-point';
    private tempSelection: any[] = [];
    private currentLevelIndex = 0;
    private draggingPoint: GeoPoint | null = null;
    private dragStartCoord: ExactCoord | null = null;

    private canvas: HTMLCanvasElement;

    constructor() {
        this.canvas = document.getElementById('mainCanvas') as HTMLCanvasElement;
        this.layerMgr = new LayerManager();
        this.engine = new ConstructionEngine(this.layerMgr);
        this.validator = new ConstraintValidator(this.engine);
        this.renderer = new Renderer(this.canvas, this.engine, this.layerMgr);
        this.init();
    }

    private init(): void {
        this.setupUI();
        this.setupCanvasEvents();
        this.updateAll();
        window.addEventListener('resize', () => {
            this.renderer.resize();
            this.renderer.render();
        });
    }

    private setupUI(): void {
        // 工具按钮
        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                const tool = (btn as HTMLElement).dataset.tool!;
                this.currentTool = tool;
                this.clearToolState();
                document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.updateHint();
                this.renderer.render();
            });
        });

        document.getElementById('btnUndo')!.onclick = () => this.undo();
        document.getElementById('btnClear')!.onclick = () => {
            if (confirm('确定清空所有构造吗？')) {
                this.engine.clear();
                this.clearToolState();
                this.renderer.inspectedPoint = null;
                this.updateAll();
            }
        };
        document.getElementById('btnVerify')!.onclick = () => this.verify();
        document.getElementById('btnNextGoal')!.onclick = () => this.nextLevel();

        // 图层切换
        document.getElementById('btnAddLayerTop')!.onclick = () => {
            this.layerMgr.addLayer();
            this.updateLayerUI();
            this.renderer.render();
        };
        document.getElementById('btnPrevLayer')!.onclick = () => {
            const layers = this.layerMgr.layers;
            const idx = layers.findIndex(l => l.id === this.layerMgr.currentLayerId);
            this.layerMgr.setCurrent(layers[(idx - 1 + layers.length) % layers.length].id);
            this.updateLayerUI();
            this.renderer.render();
        };
        document.getElementById('btnNextLayer')!.onclick = () => {
            const layers = this.layerMgr.layers;
            const idx = layers.findIndex(l => l.id === this.layerMgr.currentLayerId);
            this.layerMgr.setCurrent(layers[(idx + 1) % layers.length].id);
            this.updateLayerUI();
            this.renderer.render();
        };

        this.updateLayerUI();
    }

    private setupCanvasEvents(): void {
        this.canvas.addEventListener('mousedown', e => this.onPointerDown(e));
        this.canvas.addEventListener('mousemove', e => this.onPointerMove(e));
        window.addEventListener('mouseup', e => this.onPointerUp(e));
        this.canvas.addEventListener('wheel', e => { e.preventDefault(); this.onWheel(e); });
        this.canvas.addEventListener('contextmenu', e => e.preventDefault());
        this.canvas.addEventListener('touchstart', e => this.onTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', e => this.onTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', e => this.onTouchEnd(e));
    }

    private getEventPos(e: MouseEvent | Touch): { x: number; y: number } {
        const rect = this.canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    private onPointerDown(e: MouseEvent): void {
        if (e.button !== 0) return;
        const pos = this.getEventPos(e);
        const nearPt = this.renderer.findNearPoint(pos.x, pos.y);
        if (nearPt && nearPt.isFree && this.currentTool === 'free-point') {
            this.draggingPoint = nearPt;
            this.dragStartCoord = nearPt.coord.clone();
            return;
        }
        this.handleClick(pos);
    }

    private onPointerMove(e: MouseEvent): void {
        const pos = this.getEventPos(e);
        if (this.draggingPoint) {
            const world = this.renderer.screenToWorld(pos.x, pos.y);
            const newCoord = ExactCoord.fromNumbers(world.x, world.y);
            if (this.tryDragPoint(this.draggingPoint.id, newCoord)) {
                this.renderer.render();
            }
            return;
        }
        // 悬停检测
        this.renderer.hoveredElement =
            this.renderer.findNearPoint(pos.x, pos.y) ||
            this.renderer.findNearLine(pos.x, pos.y) ||
            this.renderer.findNearCircle(pos.x, pos.y) ||
            null;
        this.renderer.render();
    }

    private onPointerUp(e: MouseEvent): void {
        if (this.draggingPoint) {
            this.draggingPoint = null;
            this.updateAll();
        }
    }

    private onWheel(e: WheelEvent): void {
        const pos = this.getEventPos(e);
        const before = this.renderer.screenToWorld(pos.x, pos.y);
        const zoom = e.deltaY > 0 ? 0.9 : 1.1;
        this.renderer.scale = Math.max(5, Math.min(500, this.renderer.scale * zoom));
        const after = this.renderer.screenToWorld(pos.x, pos.y);
        this.renderer.offsetX += (after.x - before.x) * this.renderer.scale;
        this.renderer.offsetY -= (after.y - before.y) * this.renderer.scale;
        this.renderer.render();
    }

    private touchStartDist: number | null = null;
    private touchStartScale: number | null = null;

    private onTouchStart(e: TouchEvent): void {
        if (e.touches.length === 2) {
            this.touchStartDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            this.touchStartScale = this.renderer.scale;
        } else if (e.touches.length === 1) {
            const t = e.touches[0];
            this.handleClick(this.getEventPos(t));
        }
        e.preventDefault();
    }

    private onTouchMove(e: TouchEvent): void {
        if (e.touches.length === 2 && this.touchStartDist) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            this.renderer.scale = Math.max(5, Math.min(500, this.touchStartScale! * (dist / this.touchStartDist)));
            this.renderer.render();
        }
        e.preventDefault();
    }

    private onTouchEnd(e: TouchEvent): void {
        this.touchStartDist = null;
    }

    // ---------- 核心交互逻辑 ----------
    private handleClick(pos: { x: number; y: number }): void {
        const world = this.renderer.screenToWorld(pos.x, pos.y);
        const coord = ExactCoord.fromNumbers(world.x, world.y);
        const nearPt = this.renderer.findNearPoint(pos.x, pos.y);
        const nearLine = this.renderer.findNearLine(pos.x, pos.y);
        const nearCircle = this.renderer.findNearCircle(pos.x, pos.y);

        const selectable = (el: GeoPoint | GeoLine | GeoCircle | null) =>
            el && this.layerMgr.getLayer(el.layerId)?.selectable;

        // 更新代数预览
        if (nearPt) this.renderer.inspectedPoint = nearPt;
        else if (!nearPt && this.currentTool === 'free-point') this.renderer.inspectedPoint = null;

        if (this.currentTool === 'free-point') {
            if (!nearPt) {
                const pt = this.engine.addFreePoint(coord);
                this.renderer.inspectedPoint = pt;
                this.clearToolState();
                this.updateAll();
            } else if (selectable(nearPt)) {
                this.renderer.inspectedPoint = nearPt;
                this.renderer.render();
            }
        }
        else if (this.currentTool === 'line') {
            if (nearPt && selectable(nearPt)) {
                if (this.tempSelection.includes(nearPt.id)) {
                    alert('不能选择相同的点');
                    return;
                }
                this.tempSelection.push(nearPt.id);
                this.renderer.selectedElements.add(nearPt);
                if (this.tempSelection.length === 2) {
                    const [id1, id2] = this.tempSelection;
                    try {
                        this.engine.addLine(id1, id2);
                    } catch (ex) {
                        alert((ex as Error).message);
                    }
                    this.clearToolState();
                    this.updateAll();
                } else {
                    this.updateHint(`已选择点 ${nearPt.id}，请选择第二个点`);
                    this.renderer.render();
                }
            }
        }
        else if (this.currentTool === 'circle') {
            if (nearPt && selectable(nearPt)) {
                if (this.tempSelection.includes(nearPt.id)) {
                    alert('不能选择相同的点');
                    return;
                }
                this.tempSelection.push(nearPt.id);
                this.renderer.selectedElements.add(nearPt);
                if (this.tempSelection.length === 2) {
                    const [cId, rId] = this.tempSelection;
                    try {
                        this.engine.addCircle(cId, rId);
                    } catch (ex) {
                        alert((ex as Error).message);
                    }
                    this.clearToolState();
                    this.updateAll();
                } else {
                    this.updateHint(`已选圆心 ${nearPt.id}，请选择圆上一点`);
                    this.renderer.render();
                }
            }
        }
        else if (this.currentTool === 'intersection') {
            let sel: { type: string; id: string; element: GeoLine | GeoCircle } | null = null;
            if (nearLine && selectable(nearLine)) sel = { type: 'line', id: nearLine.id, element: nearLine };
            else if (nearCircle && selectable(nearCircle)) sel = { type: 'circle', id: nearCircle.id, element: nearCircle };

            if (sel) {
                this.tempSelection.push(sel);
                this.renderer.selectedElements.add(sel.element);
                if (this.tempSelection.length === 2) {
                    const a = this.tempSelection[0], b = this.tempSelection[1];
                    let results: GeoPoint[] = [];
                    if (a.type === 'line' && b.type === 'line') results = this.engine.intersectLines(a.id, b.id);
                    else if (a.type === 'line' && b.type === 'circle') results = this.engine.intersectLineCircle(a.id, b.id);
                    else if (a.type === 'circle' && b.type === 'line') results = this.engine.intersectLineCircle(b.id, a.id);
                    else if (a.type === 'circle' && b.type === 'circle') results = this.engine.intersectCircles(a.id, b.id);

                    this.clearToolState();
                    if (results.length > 0) {
                        results.forEach(r => this.renderer.selectedElements.add(r));
                        this.renderer.inspectedPoint = results[0];
                    }
                    this.updateAll();
                } else {
                    this.updateHint(`已选择一个图元，请选择另一个`);
                    this.renderer.render();
                }
            }
        }
        this.updateAlgebraPreview();
    }

    private clearToolState(): void {
        this.tempSelection = [];
        this.renderer.selectedElements.clear();
        this.renderer.hoveredElement = null;
    }

    private tryDragPoint(pointId: string, newCoord: ExactCoord): boolean {
        const pt = this.engine.elements.get(pointId) as GeoPoint;
        if (!pt || !pt.isFree) return false;
        const backup = pt.coord;
        pt.coord = newCoord;
        if (this.reconstructAll()) {
            return true;
        } else {
            pt.coord = backup;
            this.reconstructAll();
            return false;
        }
    }

    /**
     * 根据步骤历史完全重建几何模型，用于拖拽自由点后验证约束是否依然满足。
     * 若任何一步交点数量变化或重建失败，则回滚。
     */
    private reconstructAll(): boolean {
        const history = [...this.engine.stepHistory];
        const oldElements = new Map(this.engine.elements);
        this.engine.elements.clear();
        this.engine.resetIdCounter();

        for (const step of history) {
            try {
                if (step.type === 'free-point') {
                    const orig = oldElements.get(step.outputIds[0]) as GeoPoint;
                    const pt = new GeoPoint(step.outputIds[0], orig.coord, orig.layerId, true);
                    this.engine.elements.set(pt.id, pt);
                } else if (step.type === 'line') {
                    const p1 = this.engine.elements.get(step.params.p1Id) as GeoPoint;
                    const p2 = this.engine.elements.get(step.params.p2Id) as GeoPoint;
                    if (!p1 || !p2) throw new Error('缺少点');
                    const line = new GeoLine(step.outputIds[0], p1, p2, this.engine.layerMgr.currentLayerId);
                    this.engine.elements.set(line.id, line);
                } else if (step.type === 'circle') {
                    const c = this.engine.elements.get(step.params.centerId) as GeoPoint;
                    const r = this.engine.elements.get(step.params.radiusPtId) as GeoPoint;
                    if (!c || !r) throw new Error('缺少点');
                    const cir = new GeoCircle(step.outputIds[0], c, r, this.engine.layerMgr.currentLayerId);
                    this.engine.elements.set(cir.id, cir);
                } else if (step.type === 'intersection') {
                    const { kind, id1, id2 } = step.params;
                    let coords: ExactCoord[] = [];
                    if (kind === 'line-line') {
                        const l1 = this.engine.elements.get(id1) as GeoLine;
                        const l2 = this.engine.elements.get(id2) as GeoLine;
                        const p = this.engine.calcLineLineIntersection(l1, l2);
                        if (p) coords = [p];
                    } else if (kind === 'line-circle') {
                        const line = this.engine.elements.get(id1) as GeoLine;
                        const circle = this.engine.elements.get(id2) as GeoCircle;
                        coords = this.engine.calcLineCircleIntersections(line, circle);
                    } else if (kind === 'circle-circle') {
                        const c1 = this.engine.elements.get(id1) as GeoCircle;
                        const c2 = this.engine.elements.get(id2) as GeoCircle;
                        coords = this.engine.calcCircleCircleIntersections(c1, c2);
                    }
                    if (coords.length !== step.outputIds.length) throw new Error('交点数量变化');
                    for (let i = 0; i < coords.length; i++) {
                        const pt = new GeoPoint(step.outputIds[i], coords[i], this.engine.layerMgr.currentLayerId, false);
                        this.engine.elements.set(pt.id, pt);
                    }
                }
            } catch (e) {
                this.engine.elements = oldElements;
                return false;
            }
        }
        this.engine.stepHistory = history;
        return true;
    }

    private undo(): void {
        const last = this.engine.stepHistory.pop();
        if (last) {
            last.outputIds.forEach(id => this.engine.elements.delete(id));
            this.clearToolState();
            this.renderer.inspectedPoint = null;
            this.updateAll();
        }
    }

    private verify(): void {
        const level = LEVELS[this.currentLevelIndex];
        const result = level.verify(this.engine, this.validator);
        this.updateConstraintUI(result);
        alert(result.ok ? '✅ 验证通过' : '❌ 未通过');
    }

    private updateAll(): void {
        this.updateStepUI();
        this.updateConstraintUI();
        this.updateHint();
        this.updateAlgebraPreview();
        this.updateLayerUI();
        this.renderer.render();
    }

    private updateHint(msg?: string): void {
        document.getElementById('hintBar')!.innerHTML = msg || `工具：${this.currentTool}`;
    }

    private updateStepUI(): void {
        const list = document.getElementById('stepList')!;
        list.innerHTML = this.engine.stepHistory
            .map((s, i) => `<div class="step-item">${i + 1}. ${s.type}</div>`)
            .join('') || '<div class="step-item">暂无</div>';
    }

    private updateConstraintUI(result?: any): void {
        const res = result || LEVELS[this.currentLevelIndex].verify(this.engine, this.validator);
        const list = document.getElementById('constraintList')!;
        if (res.checks) {
            list.innerHTML = res.checks.map((c: any) =>
                `<div class="constraint-item"><span class="status ${c.ok ? 'ok' : 'fail'}">${c.ok ? '✓' : '✗'}</span>${c.description}</div>`
            ).join('');
        } else {
            list.innerHTML = `<div class="constraint-item"><span class="status ${res.ok ? 'ok' : 'pending'}">${res.ok ? '✓' : '?'}</span>${res.description || '等待'}</div>`;
        }
    }

    private updateAlgebraPreview(): void {
        const pt = this.renderer.inspectedPoint;
        const el = document.getElementById('algebraPreview')!;
        if (pt) {
            el.textContent = `${pt.id}: (${pt.coord.x.toNumber().toFixed(6)}, ${pt.coord.y.toNumber().toFixed(6)})`;
        } else {
            el.textContent = '点击任意点查看坐标';
        }
    }

    private updateLayerUI(): void {
        const container = document.getElementById('layerList')!;
        container.innerHTML = this.layerMgr.layers.map(l => `
            <div class="layer-item">
                <span class="layer-color" style="background:${l.color}"></span>
                <span style="flex:1">${l.name} ${l.id === this.layerMgr.currentLayerId ? '✓' : ''}</span>
                <button class="btn btn-outline" style="font-size:10px;padding:2px 6px;" data-action="visible" data-id="${l.id}">${l.visible ? '👁' : '─'}</button>
                <button class="btn btn-outline" style="font-size:10px;padding:2px 6px;" data-action="select" data-id="${l.id}">${l.selectable ? '🔍' : '🚫'}</button>
                <button class="btn btn-outline" style="font-size:10px;padding:2px 6px;" data-action="delete" data-id="${l.id}">🗑</button>
                <button class="btn btn-outline" style="font-size:10px;padding:2px 6px;" data-action="current" data-id="${l.id}">激活</button>
            </div>`).join('');

        container.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = (btn as HTMLElement).dataset.action!;
                const id = (btn as HTMLElement).dataset.id!;
                if (action === 'visible') this.layerMgr.toggleVisible(id);
                if (action === 'select') this.layerMgr.toggleSelectable(id);
                if (action === 'delete') {
                    if (!this.layerMgr.deleteLayer(id)) alert('无法删除最后一个图层');
                }
                if (action === 'current') this.layerMgr.setCurrent(id);
                this.updateLayerUI();
                this.renderer.render();
            });
        });

        const currLayer = this.layerMgr.getLayer(this.layerMgr.currentLayerId)!;
        document.getElementById('currentLayerColor')!.style.background = currLayer.color;
        document.getElementById('currentLayerName')!.textContent = currLayer.name;
    }

    private nextLevel(): void {
        this.currentLevelIndex = (this.currentLevelIndex + 1) % LEVELS.length;
        this.engine.clear();
        this.clearToolState();
        this.renderer.inspectedPoint = null;
        document.getElementById('goalDesc')!.innerHTML = `🎯 ${LEVELS[this.currentLevelIndex].name}<br>${LEVELS[this.currentLevelIndex].desc}`;
        this.updateAll();
    }
}

// 启动应用
window.addEventListener('DOMContentLoaded', () => {
    (window as any).app = new App();
});