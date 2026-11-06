// ============================================================
// 尺规层（R-layer）：2D / 3D 尺规作图
// 工具：选择 / 点 / 直线尺 / 圆规 / 球规 / 平面尺 / 交点
// 3D 圆规：先选择平面，再在平面内选圆心与圆上一点
// ============================================================
import { v3, v3add, v3sub, v3scale, v3dot, v3dist, collinear, GeoPoint, GeoLine, GeoPlane, GeoCircle, GeoSphere, planeNormal, planeBasis, sampleCirclePoints, raySphereIntersections, projectPointToLine, projectPointToCircle, sphereSilhouette, ConstructionEngine } from './geometry.js';
// ============================================================
// 语言（与全局 LangMgr 解耦：直接读 localStorage 'lang'）
// ============================================================
function drawingColor(light, dark) {
    return document.documentElement.dataset.theme === 'dark' ? dark : light;
}
function getLang() {
    const s = localStorage.getItem('lang');
    if (s === 'zh' || s === 'en')
        return s;
    return (navigator.language || '').toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en';
}
const T = {
    zh: {
        layerName: '尺规层',
        mode2d: '2D', mode3d: '3D',
        toolSelect: '选择', toolPoint: '点', toolLine: '直线尺', toolCircle: '圆规',
        toolSphere: '球规', toolPlane: '平面尺', toolIntersect: '交点',
        goalLabel: '目标', stepsLabel: '构造步骤', hintLabel: '提示', coordLabel: '坐标',
        nextLevel: '下一关', undoLabel: '撤销', clearLabel: '清空',
        emptySteps: '暂无步骤',
        clearConfirm: '确定清空所有构造吗？',
        selectHint2d: '点击点查看坐标；拖拽自由点移动；滚轮缩放、拖拽空白平移',
        selectHint3d: '点击点查看坐标；拖拽自由点移动；滚轮缩放；左键拖拽空白旋转视图，右键平移',
        pointHint2d: '点击空白处放置自由点',
        pointHint3d: '点击放置自由点（在垂直相机的平面上，靠近所选图元中心或原点）',
        lineHint: '依次选择两个点作直线',
        circleHint2d: '选择圆心，再选择圆上一点',
        circleHint3d: '① 选圆心 ② 选圆上一点 ③ 选平面内另一点',
        sphereHint: '选择球心，再选择球面上一点',
        planeHint: '依次选择三个不共线的点构造平面',
        intersectHint: '依次选择两个图元求交点（直线/圆/球/平面）',
        picked: '已选',
        errNeedPlane: '请先点击一个平面',
        errSamePoint: '不能选择同一个点',
        errCollinear: '三点共线，无法构造平面',
        errZeroRadius: '半径不能为零',
        errNeedTwoPoints: '需要两个不同的点',
        errNoIntersection: '无交点',
        stepPoint: '点', stepLine: '直线', stepCircle: '圆', stepSphere: '球', stepPlane: '平面',
        stepInter: '交点', stepInterCircle: '交圆',
        elemsLabel: '图元', elemsEmpty: '暂无图元',
        levels2d: [
            { name: '等边三角形', desc: '用直尺和圆规构造一个等边三角形' },
            { name: '正方形', desc: '构造一个正方形' },
            { name: '垂直平分线', desc: '构造线段 AB 的垂直平分线' },
            { name: '角平分线', desc: '构造角 ∠ABC 的平分线' },
        ],
        levels3d: [
            { name: '平面', desc: '用平面尺过三个点构造一个平面' },
            { name: '球体', desc: '用球规构造一个球体' },
            { name: '平面上的圆', desc: '先选择平面，再用圆规在平面内画圆' },
            { name: '直线与球的交点', desc: '作一条直线和一个球，求它们的交点' },
        ],
    },
    en: {
        layerName: 'Ruler & Compass',
        mode2d: '2D', mode3d: '3D',
        toolSelect: 'Select', toolPoint: 'Point', toolLine: 'Line', toolCircle: 'Compass',
        toolSphere: 'Sphere', toolPlane: 'Plane', toolIntersect: 'Intersect',
        goalLabel: 'Goal', stepsLabel: 'Steps', hintLabel: 'Hint', coordLabel: 'Coords',
        nextLevel: 'Next', undoLabel: 'Undo', clearLabel: 'Clear',
        emptySteps: 'No steps yet',
        clearConfirm: 'Clear all constructions?',
        selectHint2d: 'Click a point to inspect; drag free points; wheel zooms, drag empty to pan',
        selectHint3d: 'Click a point to inspect; drag free points; wheel zooms; LMB-drag empty rotates, RMB pans',
        pointHint2d: 'Click empty space to place a free point',
        pointHint3d: 'Click to place a free point (on the camera-facing plane, near the picked element or origin)',
        lineHint: 'Pick two points to draw a line',
        circleHint2d: 'Pick center, then a point on the circle',
        circleHint3d: '① Pick center ② Pick a point on the circle ③ Pick a third point for the plane',
        sphereHint: 'Pick center, then a point on the sphere',
        planeHint: 'Pick three non-collinear points to build a plane',
        intersectHint: 'Pick two elements to intersect (line/circle/sphere/plane)',
        picked: 'Picked',
        errNeedPlane: 'Pick a plane first',
        errSamePoint: 'Cannot pick the same point',
        errCollinear: 'Collinear points — cannot build a plane',
        errZeroRadius: 'Radius cannot be zero',
        errNeedTwoPoints: 'Need two distinct points',
        errNoIntersection: 'No intersection',
        stepPoint: 'Point', stepLine: 'Line', stepCircle: 'Circle', stepSphere: 'Sphere', stepPlane: 'Plane',
        stepInter: 'Intersection', stepInterCircle: 'Circle',
        elemsLabel: 'Elements', elemsEmpty: 'No elements',
        levels2d: [
            { name: 'Equilateral Triangle', desc: 'Construct an equilateral triangle' },
            { name: 'Square', desc: 'Construct a square' },
            { name: 'Perp. Bisector', desc: 'Construct the perpendicular bisector of AB' },
            { name: 'Angle Bisector', desc: 'Construct the bisector of ∠ABC' },
        ],
        levels3d: [
            { name: 'Plane', desc: 'Build a plane through three points' },
            { name: 'Sphere', desc: 'Construct a sphere with the sphere compass' },
            { name: 'Circle on a Plane', desc: 'Pick a plane, then draw a circle in it' },
            { name: 'Line ∩ Sphere', desc: 'Draw a line and a sphere, then intersect them' },
        ],
    },
};
const L = T[getLang()];
const isZh = getLang() === 'zh';
// ============================================================
// 工具函数
// ============================================================
function el(id) {
    return document.getElementById(id);
}
/** 点标签：A B C … Z AA AB … */
function pointLabel(n) {
    if (n < 26)
        return String.fromCharCode(65 + n);
    return pointLabel(Math.floor(n / 26) - 1) + String.fromCharCode(65 + (n % 26));
}
const GREEK = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ'];
function levelsOf(mode) {
    return (mode === '3d' ? L.levels3d : L.levels2d);
}
function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0)
        return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function distToPolyline(px, py, pts) {
    let best = Infinity;
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        best = Math.min(best, distToSegment(px, py, a.x, a.y, b.x, b.y));
    }
    return best;
}
function pointInPolygon(px, py, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
        if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi)
            inside = !inside;
    }
    return inside;
}
function strokePolyline(ctx, pts) {
    if (!pts.length)
        return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++)
        ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.stroke();
}
/** 3D 相机基：u 右 / v 上 / w 视线方向 */
function cameraBasis(yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    return {
        u: v3(cy, 0, sy),
        v: v3(sy * sp, cp, -cy * sp),
        w: v3(-sy * cp, sp, cy * cp),
    };
}
/** 图元的几何中心（自由点放置平面经过它） */
function elementCenter(e) {
    if (e instanceof GeoPoint)
        return e.pos;
    if (e instanceof GeoLine)
        return v3scale(v3add(e.p1.pos, e.p2.pos), 0.5);
    if (e instanceof GeoCircle)
        return e.centerPos;
    if (e instanceof GeoSphere)
        return e.center.pos;
    if (e instanceof GeoPlane)
        return v3scale(v3add(v3add(e.a.pos, e.b.pos), e.c.pos), 1 / 3);
    return v3(0, 0, 0);
}
// ============================================================
// 渲染器（2D 平面视图 / 3D 正交轨道投影）
// ============================================================
export class Renderer {
    canvas;
    engine;
    dpr;
    width = 0;
    height = 0;
    // 2D 相机
    scale2d = 50;
    offsetX = 0;
    offsetY = 0;
    // 3D 相机（正交轨道）
    yaw = -0.7;
    pitch = 0.5;
    zoom = 1;
    panX = 0;
    panY = 0;
    mode = '2d';
    hovered = null;
    selected = new Set();
    inspectedPoint = null;
    selectedPlane = null;
    getLabel = id => id;
    getPlaneLabel = id => id;
    planePolys = [];
    constructor(canvas, engine) {
        this.canvas = canvas;
        this.engine = engine;
        this.dpr = window.devicePixelRatio || 1;
    }
    resize() {
        const parent = this.canvas.parentElement;
        if (!parent)
            return;
        const rect = parent.getBoundingClientRect();
        this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
        this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        this.width = rect.width;
        this.height = rect.height;
    }
    // ---- 投影 ----
    project(pos) {
        if (this.mode === '2d') {
            return {
                x: pos.x * this.scale2d + this.width / 2 + this.offsetX,
                y: -pos.y * this.scale2d + this.height / 2 + this.offsetY,
            };
        }
        const { u, v } = cameraBasis(this.yaw, this.pitch);
        const s = 70 * this.zoom;
        return {
            x: v3dot(pos, u) * s + this.width / 2 + this.panX,
            y: -v3dot(pos, v) * s + this.height / 2 + this.panY,
        };
    }
    screenToWorld(sx, sy) {
        return {
            x: (sx - this.width / 2 - this.offsetX) / this.scale2d,
            y: -(sy - this.height / 2 - this.offsetY) / this.scale2d,
        };
    }
    /** 3D：过屏幕点的视线与平面 (n, pt0) 的交点 */
    unprojectToPlane(sx, sy, n, pt0) {
        const { u, v, w } = cameraBasis(this.yaw, this.pitch);
        const s = 70 * this.zoom;
        const X0 = (sx - this.width / 2 - this.panX) / s;
        const Y0 = -(sy - this.height / 2 - this.panY) / s;
        const Q = v3add(v3scale(u, X0), v3scale(v, Y0));
        const denom = v3dot(n, w);
        if (Math.abs(denom) < 1e-12)
            return Q;
        const t = v3dot(n, v3sub(pt0, Q)) / denom;
        return v3add(Q, v3scale(w, t));
    }
    // ---- 拾取 ----
    inGround(e) {
        if (this.mode === '2d') {
            if (e instanceof GeoPoint)
                return Math.abs(e.pos.z) < 1e-6;
            if (e instanceof GeoLine)
                return Math.abs(e.p1.pos.z) < 1e-6 && Math.abs(e.p2.pos.z) < 1e-6;
            if (e instanceof GeoCircle)
                return e.plane === null;
            return false; // 球/平面在 2D 不可见
        }
        return true;
    }
    pickPoint(sx, sy) {
        let best = null;
        let bestD = 14;
        for (const p of this.engine.getAllPoints()) {
            if (!this.inGround(p))
                continue;
            const s = this.project(p.pos);
            const d = Math.hypot(s.x - sx, s.y - sy);
            if (d < bestD) {
                bestD = d;
                best = p;
            }
        }
        return best;
    }
    pickLine(sx, sy) {
        let best = null;
        let bestD = 8;
        for (const l of this.engine.getAllLines()) {
            if (!this.inGround(l))
                continue;
            const p1 = this.project(l.p1.pos), p2 = this.project(l.p2.pos);
            const d = distToSegment(sx, sy, p1.x, p1.y, p2.x, p2.y);
            if (d < bestD) {
                bestD = d;
                best = l;
            }
        }
        return best;
    }
    pickCircle(sx, sy) {
        let best = null;
        let bestD = 8;
        for (const c of this.engine.getAllCircles()) {
            if (!this.inGround(c))
                continue;
            const d = this.distToCirclePts(sx, sy, c);
            if (d < bestD) {
                bestD = d;
                best = c;
            }
        }
        return best;
    }
    /** 拾取球：只在大圆线框（三个大圆）附近命中，轮廓内部不命中（避免球体粘住鼠标） */
    pickSphere(sx, sy) {
        if (this.mode === '2d')
            return null;
        let best = null;
        let bestD = 10;
        for (const sph of this.engine.getAllSpheres()) {
            const C = sph.center.pos, r = v3dist(C, sph.radiusPt.pos);
            const d = this.distToSphereWireframe(sx, sy, C, r);
            if (d < bestD) {
                bestD = d;
                best = sph;
            }
        }
        return best;
    }
    /** 3D：点落在球面轮廓线附近时，返回球面前表面的点（视线-球面求交） */
    pickSphereSurface(sx, sy) {
        if (this.mode === '2d')
            return null;
        let best = null;
        let bestD = 12;
        const { w } = cameraBasis(this.yaw, this.pitch);
        for (const sph of this.engine.getAllSpheres()) {
            const C = sph.center.pos;
            const r = v3dist(C, sph.radiusPt.pos);
            // 只有点击靠近球面轮廓（永远正圆的那个大圆）才视为“点球面上”
            const dSil = this.distToSilhouette(sx, sy, sph, w);
            if (dSil > 12)
                continue;
            const Q = this.unprojectToPlane(sx, sy, w, v3(0, 0, 0));
            const hits = raySphereIntersections(Q, w, C, r);
            if (!hits.length)
                continue;
            // 取靠相机近（t 小）的交点
            let front = hits[0];
            for (const h of hits)
                if (v3dot(h, w) < v3dot(front, w))
                    front = h;
            if (dSil < bestD) {
                bestD = dSil;
                best = { pt: front, sphere: sph };
            }
        }
        return best;
    }
    pickPlane(sx, sy) {
        if (this.mode === '2d')
            return null;
        for (const poly of this.planePolys) {
            if (pointInPolygon(sx, sy, poly.pts))
                return poly.plane;
        }
        return null;
    }
    pickAny(sx, sy) {
        return this.pickPoint(sx, sy) || this.pickLine(sx, sy) || this.pickCircle(sx, sy) || this.pickSphere(sx, sy) || this.pickPlane(sx, sy);
    }
    distToCirclePts(sx, sy, c) {
        const pts = sampleCirclePoints(c.centerPos, c.radius, c.normal, 48).map(p => this.project(p));
        return distToPolyline(sx, sy, pts);
    }
    distToGreatCircles(sx, sy, C, r) {
        let best = Infinity;
        for (const n of [v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1)]) {
            const pts = sampleCirclePoints(C, r, n, 48).map(p => this.project(p));
            best = Math.min(best, distToPolyline(sx, sy, pts));
        }
        return best;
    }
    /** 球面线框（三个大圆）距离 */
    distToSphereWireframe(sx, sy, C, r) {
        return this.distToGreatCircles(sx, sy, C, r);
    }
    /** 球面轮廓（永远正圆的那个大圆，法向=视线）距离 */
    distToSilhouette(sx, sy, sphere, viewDir) {
        const pts = sphereSilhouette(sphere, viewDir, 64).map(p => this.project(p));
        return distToPolyline(sx, sy, pts);
    }
    // ---- 渲染 ----
    isHi(el) {
        return this.hovered === el || this.selected.has(el);
    }
    render() {
        const ctx = this.canvas.getContext('2d');
        if (!ctx)
            return;
        // dpr 缩放：CSS 像素坐标 → 设备像素（否则 clearRect 只清左上角、绘制只有一半）
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(this.dpr, this.dpr);
        ctx.clearRect(0, 0, this.width, this.height);
        if (this.mode === '2d')
            this.render2d(ctx);
        else
            this.render3d(ctx);
    }
    render2d(ctx) {
        const w = this.width, h = this.height;
        // 网格：以世界原点投影位置为锚点（与坐标轴对齐），避免缩放时网格与轴不同步
        ctx.strokeStyle = drawingColor('#e8edf4', '#28384c');
        ctx.lineWidth = 1;
        const gs = this.scale2d;
        const originX = this.width / 2 + this.offsetX;
        const originY = this.height / 2 + this.offsetY;
        for (let x = ((originX % gs) + gs) % gs; x < w; x += gs) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
        for (let y = ((originY % gs) + gs) % gs; y < h; y += gs) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }
        // 坐标轴
        const o = this.project(v3(0, 0, 0));
        ctx.strokeStyle = drawingColor('#cbd5e1', '#536780');
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, o.y);
        ctx.lineTo(w, o.y);
        ctx.moveTo(o.x, 0);
        ctx.lineTo(o.x, h);
        ctx.stroke();
        // 圆（地面）
        for (const c of this.engine.getAllCircles()) {
            if (c.plane)
                continue;
            const p = this.project(c.centerPos);
            const r = c.radius * this.scale2d;
            const hi = this.isHi(c);
            ctx.strokeStyle = hi ? drawingColor('#1a5cff', '#8db5ff') : drawingColor('rgba(26,92,255,0.6)', 'rgba(141,181,255,0.7)');
            ctx.lineWidth = hi ? 2.5 : 1.5;
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        // 直线
        for (const l of this.engine.getAllLines()) {
            if (!this.inGround(l))
                continue;
            this.drawLine(ctx, l, this.isHi(l));
        }
        // 点
        for (const p of this.engine.getAllPoints()) {
            if (!this.inGround(p))
                continue;
            this.drawPoint(ctx, p);
        }
    }
    render3d(ctx) {
        const w = this.width, h = this.height;
        // 地面网格（z=0）
        ctx.strokeStyle = drawingColor('#e8edf4', '#28384c');
        ctx.lineWidth = 1;
        for (let i = -10; i <= 10; i++) {
            const a = this.project(v3(i, 0, -10));
            const b = this.project(v3(i, 0, 10));
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            const c = this.project(v3(-10, 0, i));
            const d = this.project(v3(10, 0, i));
            ctx.beginPath();
            ctx.moveTo(c.x, c.y);
            ctx.lineTo(d.x, d.y);
            ctx.stroke();
        }
        // 坐标轴（红 x / 绿 y / 蓝 z）
        const axCol = ['#e05555', '#5cb878', drawingColor('#1a5cff', '#8db5ff')];
        const dirs = [v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1)];
        const o0 = this.project(v3(0, 0, 0));
        for (let i = 0; i < 3; i++) {
            const b = this.project(v3scale(dirs[i], 2));
            ctx.strokeStyle = axCol[i];
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(o0.x, o0.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        }
        // 平面（半透明多边形）
        this.planePolys = [];
        for (const pl of this.engine.getAllPlanes()) {
            const { u, v } = planeBasis(pl);
            const cen = v3scale(v3add(v3add(pl.a.pos, pl.b.pos), pl.c.pos), 1 / 3);
            const ext = 5;
            const corners = [
                v3add(cen, v3add(v3scale(u, ext), v3scale(v, ext))),
                v3add(cen, v3add(v3scale(u, ext), v3scale(v, -ext))),
                v3add(cen, v3add(v3scale(u, -ext), v3scale(v, -ext))),
                v3add(cen, v3add(v3scale(u, -ext), v3scale(v, ext))),
            ].map(p => this.project(p));
            this.planePolys.push({ plane: pl, pts: corners });
            const isSelPlane = this.selectedPlane === pl;
            const isHi = this.hovered === pl;
            ctx.fillStyle = isSelPlane ? drawingColor('rgba(26,92,255,0.22)', 'rgba(141,181,255,0.22)') : isHi ? drawingColor('rgba(26,92,255,0.16)', 'rgba(141,181,255,0.16)') : drawingColor('rgba(26,92,255,0.07)', 'rgba(141,181,255,0.07)');
            ctx.strokeStyle = isSelPlane ? drawingColor('#1a5cff', '#8db5ff') : drawingColor('rgba(26,92,255,0.35)', 'rgba(141,181,255,0.5)');
            ctx.lineWidth = isSelPlane ? 2 : 1;
            ctx.beginPath();
            ctx.moveTo(corners[0].x, corners[0].y);
            for (let i = 1; i < 4; i++)
                ctx.lineTo(corners[i].x, corners[i].y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // 平面标签
            ctx.fillStyle = drawingColor('rgba(26,92,255,0.75)', 'rgba(141,181,255,0.85)');
            ctx.font = '600 12px "Segoe UI", sans-serif';
            ctx.fillText(this.getPlaneLabel(pl.id), corners[0].x - 12, corners[0].y + 18);
        }
        const items = [];
        const depthOf = (pts3) => {
            const { w: fw } = cameraBasis(this.yaw, this.pitch);
            let sum = 0;
            for (const p of pts3)
                sum += v3dot(p, fw);
            return sum / Math.max(1, pts3.length);
        };
        for (const c of this.engine.getAllCircles()) {
            const pts3 = sampleCirclePoints(c.centerPos, c.radius, c.normal, 64);
            const scr = pts3.map(p => this.project(p));
            const hi = this.isHi(c);
            items.push({
                depth: depthOf(pts3),
                draw: () => {
                    ctx.strokeStyle = hi ? drawingColor('#1a5cff', '#8db5ff') : drawingColor('rgba(26,92,255,0.75)', 'rgba(141,181,255,0.85)');
                    ctx.lineWidth = hi ? 2.5 : 1.6;
                    ctx.setLineDash([5, 4]);
                    strokePolyline(ctx, scr);
                    ctx.setLineDash([]);
                }
            });
        }
        for (const s of this.engine.getAllSpheres()) {
            const C = s.center.pos, r = v3dist(C, s.radiusPt.pos);
            const hi = this.isHi(s);
            items.push({
                depth: depthOf([C]),
                draw: () => {
                    // 三个大圆：虚线
                    ctx.strokeStyle = hi ? drawingColor('#7c3aed', '#bf9cff') : drawingColor('rgba(124,58,237,0.55)', 'rgba(191,156,255,0.7)');
                    ctx.lineWidth = hi ? 2.5 : 1.3;
                    ctx.setLineDash([6, 5]);
                    for (const n of [v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1)]) {
                        strokePolyline(ctx, sampleCirclePoints(C, r, n, 48).map(p => this.project(p)));
                    }
                    // 永远正圆的轮廓（与视线垂直的大圆）：淡实线
                    const { w: viewDir } = cameraBasis(this.yaw, this.pitch);
                    ctx.strokeStyle = hi ? '#c084fc' : drawingColor('rgba(168,85,247,0.32)', 'rgba(198,160,255,0.5)');
                    ctx.lineWidth = hi ? 2 : 1.1;
                    ctx.setLineDash([]);
                    strokePolyline(ctx, sphereSilhouette(s, viewDir, 64).map(p => this.project(p)));
                }
            });
        }
        for (const l of this.engine.getAllLines()) {
            const hi = this.isHi(l);
            items.push({
                depth: depthOf([l.p1.pos, l.p2.pos]),
                draw: () => this.drawLine(ctx, l, hi),
            });
        }
        items.sort((a, b) => b.depth - a.depth);
        for (const it of items)
            it.draw();
        // 点（最上层）
        for (const p of this.engine.getAllPoints())
            this.drawPoint(ctx, p);
    }
    /** 直线：两点间实线（可选区），两端超出部分用淡虚线 */
    drawLine(ctx, l, hi) {
        const p1 = this.project(l.p1.pos), p2 = this.project(l.p2.pos);
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy) || 1;
        const ext = 2000;
        const ux = dx / len * ext, uy = dy / len * ext;
        // 主体：两点之间实线
        ctx.strokeStyle = hi ? drawingColor('#334155', '#d4dfef') : drawingColor('rgba(100,116,139,0.85)', 'rgba(178,197,222,0.85)');
        ctx.lineWidth = hi ? 2.5 : 1.4;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        // 两端延伸：淡虚线（不可选）
        ctx.strokeStyle = hi ? drawingColor('rgba(51,65,85,0.35)', 'rgba(212,223,239,0.4)') : drawingColor('rgba(100,116,139,0.22)', 'rgba(178,197,222,0.25)');
        ctx.lineWidth = hi ? 1.4 : 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(p1.x - ux, p1.y - uy);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(p2.x + ux, p2.y + uy);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    drawPoint(ctx, p) {
        const pos = this.project(p.pos);
        const isSel = this.selected.has(p) || this.hovered === p;
        const isIns = this.inspectedPoint === p;
        const r = isSel ? 7 : isIns ? 6 : 4.5;
        if (isSel || isIns) {
            ctx.fillStyle = drawingColor('rgba(26,92,255,0.12)', 'rgba(141,181,255,0.18)');
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, r + 6, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = p.isFree ? '#e2b04a' : drawingColor('#1a5cff', '#8db5ff');
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // 标签
        ctx.fillStyle = drawingColor('#334155', '#d4dfef');
        ctx.font = '600 11px "Segoe UI", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(this.getLabel(p.id), pos.x + r + 4, pos.y - r - 3);
    }
}
export class App {
    engine = new ConstructionEngine();
    renderer;
    mode = '2d';
    currentTool = 'select';
    levelIndex = 0;
    tempSelection = [];
    selectedPlane = null;
    /** 最近选中的图元：自由点放置平面以它为中心（无则用原点） */
    lastPickedElement = null;
    canvas;
    pointOrder = [];
    planeOrder = [];
    drag = null;
    constructor() {
        this.canvas = el('rlCanvas');
        this.renderer = new Renderer(this.canvas, this.engine);
        this.renderer.getLabel = id => this.labelOf(id);
        this.renderer.getPlaneLabel = id => this.planeLabelOf(id);
        this.setupUI();
        this.setupCanvasEvents();
        this.updateAll();
        window.addEventListener('deductrium-theme-change', () => this.renderer.render());
        window.addEventListener('resize', () => {
            this.renderer.resize();
            this.renderer.render();
        });
    }
    resize() {
        this.renderer.resize();
        this.renderer.render();
    }
    // ---- 标签 ----
    labelOf(id) {
        const i = this.pointOrder.indexOf(id);
        return i >= 0 ? pointLabel(i) : id;
    }
    planeLabelOf(id) {
        const i = this.planeOrder.indexOf(id);
        return i >= 0 ? GREEK[i % GREEK.length] : id;
    }
    registerPoint(p) {
        if (!this.pointOrder.includes(p.id))
            this.pointOrder.push(p.id);
    }
    // ---- UI ----
    setupUI() {
        el('rlMode2d').onclick = () => this.setMode('2d');
        el('rlMode3d').onclick = () => this.setMode('3d');
        el('rlNext').onclick = () => this.nextLevel();
        el('rlUndo').onclick = () => this.undo();
        el('rlClear').onclick = () => {
            if (confirm(L.clearConfirm)) {
                this.engine.clear();
                this.pointOrder = [];
                this.planeOrder = [];
                this.clearToolState();
                this.lastPickedElement = null;
                this.renderer.inspectedPoint = null;
                this.updateAll();
            }
        };
        this.buildToolbar();
        this.updateGoal();
    }
    setMode(mode) {
        this.mode = mode;
        this.renderer.mode = mode;
        el('rlMode2d').classList.toggle('active', mode === '2d');
        el('rlMode3d').classList.toggle('active', mode === '3d');
        this.currentTool = 'select';
        this.levelIndex = 0;
        this.clearToolState();
        this.buildToolbar();
        this.updateGoal();
        this.updateAll();
    }
    buildToolbar() {
        const bar = el('rlToolbar');
        const tools = this.mode === '3d'
            ? [['select', L.toolSelect, '🖐'], ['point', L.toolPoint, '✚'], ['line', L.toolLine, '📏'], ['circle', L.toolCircle, '⭕'], ['sphere', L.toolSphere, '🔮'], ['plane', L.toolPlane, '🔻'], ['intersect', L.toolIntersect, '✕']]
            : [['select', L.toolSelect, '🖐'], ['point', L.toolPoint, '✚'], ['line', L.toolLine, '📏'], ['circle', L.toolCircle, '⭕'], ['intersect', L.toolIntersect, '✕']];
        bar.innerHTML = '';
        for (const [tool, name, ico] of tools) {
            const b = document.createElement('button');
            b.className = 'rl-tool' + (tool === this.currentTool ? ' active' : '');
            b.dataset.tool = tool;
            b.title = name;
            b.innerHTML = `<span class="rl-tool-ico">${ico}</span><span class="rl-tool-name">${name}</span>`;
            b.onclick = () => {
                this.currentTool = tool;
                this.clearToolState();
                this.buildToolbar();
                this.updateHint();
                this.renderer.render();
            };
            bar.appendChild(b);
        }
    }
    updateGoal() {
        const lv = levelsOf(this.mode)[this.levelIndex];
        el('rlGoalName').textContent = `${L.goalLabel}${isZh ? '：' : ': '}${lv.name}`;
        el('rlGoalDesc').textContent = lv.desc;
    }
    nextLevel() {
        const list = levelsOf(this.mode);
        this.levelIndex = (this.levelIndex + 1) % list.length;
        this.engine.clear();
        this.pointOrder = [];
        this.planeOrder = [];
        this.clearToolState();
        this.lastPickedElement = null;
        this.renderer.inspectedPoint = null;
        this.updateGoal();
        this.updateAll();
    }
    // ---- 画布事件 ----
    setupCanvasEvents() {
        this.canvas.addEventListener('mousedown', e => this.onPointerDown(e));
        window.addEventListener('mousemove', e => this.onPointerMove(e));
        window.addEventListener('mouseup', e => this.onPointerUp(e));
        this.canvas.addEventListener('wheel', e => { e.preventDefault(); this.onWheel(e); }, { passive: false });
        this.canvas.addEventListener('contextmenu', e => e.preventDefault());
        this.canvas.addEventListener('touchstart', e => this.onTouchStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', e => this.onTouchMove(e), { passive: false });
        this.canvas.addEventListener('touchend', e => this.onTouchEnd(e));
    }
    getEventPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    onPointerDown(e) {
        if (e.button !== 0 && e.button !== 1 && e.button !== 2)
            return;
        const pos = this.getEventPos(e);
        if (e.button === 0 && this.currentTool === 'select') {
            const pt = this.renderer.pickPoint(pos.x, pos.y);
            if (pt && pt.isFree) {
                this.drag = { kind: 'point', pt, startX: pos.x, startY: pos.y, lastX: pos.x, lastY: pos.y, moved: false, button: e.button };
                this.renderer.selected.add(pt);
                this.renderer.inspectedPoint = pt;
                this.lastPickedElement = pt;
                this.renderer.render();
                return;
            }
        }
        this.drag = { kind: 'cam', startX: pos.x, startY: pos.y, lastX: pos.x, lastY: pos.y, moved: false, button: e.button };
    }
    onPointerMove(e) {
        const pos = this.getEventPos(e);
        if (this.drag) {
            const dx = pos.x - this.drag.lastX, dy = pos.y - this.drag.lastY;
            this.drag.lastX = pos.x;
            this.drag.lastY = pos.y;
            if (Math.hypot(pos.x - this.drag.startX, pos.y - this.drag.startY) > 4)
                this.drag.moved = true;
            if (this.drag.kind === 'point' && this.drag.pt) {
                const newPos = this.dragPointPos(this.drag.pt, pos.x, pos.y);
                if (this.tryDragPoint(this.drag.pt, newPos)) {
                    // reconstructAll 会重建全部元素对象：重新解析被拖点，否则引用失效只能拖一帧
                    const fresh = this.engine.elements.get(this.drag.pt.id);
                    if (fresh)
                        this.drag.pt = fresh;
                    this.renderer.render();
                    this.updateCoord();
                }
                return;
            }
            if (this.drag.button === 2 || this.drag.button === 1) {
                this.renderer.panX += dx;
                this.renderer.panY += dy;
            }
            else if (this.mode === '3d') {
                this.renderer.yaw += dx * 0.008;
                this.renderer.pitch = Math.max(-1.4, Math.min(1.4, this.renderer.pitch + dy * 0.008));
            }
            else {
                this.renderer.offsetX += dx;
                this.renderer.offsetY += dy;
            }
            this.renderer.render();
            return;
        }
        this.renderer.hovered = this.renderer.pickAny(pos.x, pos.y);
        this.renderer.render();
    }
    onPointerUp(e) {
        if (!this.drag)
            return;
        const drag = this.drag;
        this.drag = null;
        if (drag.kind === 'point') {
            this.updateAll();
            return;
        }
        if (!drag.moved)
            this.handleClick(this.getEventPos(e));
    }
    onWheel(e) {
        const pos = this.getEventPos(e);
        if (this.mode === '3d') {
            this.renderer.zoom = Math.max(0.2, Math.min(8, this.renderer.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
        }
        else {
            const before = this.renderer.screenToWorld(pos.x, pos.y);
            this.renderer.scale2d = Math.max(5, Math.min(500, this.renderer.scale2d * (e.deltaY > 0 ? 0.9 : 1.1)));
            const after = this.renderer.screenToWorld(pos.x, pos.y);
            this.renderer.offsetX += (after.x - before.x) * this.renderer.scale2d;
            this.renderer.offsetY -= (after.y - before.y) * this.renderer.scale2d;
        }
        this.renderer.render();
    }
    dragPointPos(pt, sx, sy) {
        if (this.mode === '2d') {
            const w = this.renderer.screenToWorld(sx, sy);
            return v3(w.x, w.y, 0);
        }
        const { w } = cameraBasis(this.renderer.yaw, this.renderer.pitch);
        return this.renderer.unprojectToPlane(sx, sy, w, pt.pos);
    }
    tryDragPoint(pt, newPos) {
        // 半自由点：先把目标位置投影到约束元素（直线/圆周）上，保证拖拽不脱约束
        const target = this.engine.constrainPoint(pt, newPos);
        const backup = pt.pos;
        pt.pos = target;
        if (this.engine.reconstructAll())
            return true;
        pt.pos = backup;
        this.engine.reconstructAll();
        return false;
    }
    // 触摸
    touch = [];
    pinchDist = 0;
    pinchZoom = 1;
    onTouchStart(e) {
        e.preventDefault();
        this.touch = Array.from(e.touches).map(t => ({ id: t.identifier, x: t.clientX, y: t.clientY }));
        if (this.touch.length === 2) {
            this.pinchDist = Math.hypot(this.touch[0].x - this.touch[1].x, this.touch[0].y - this.touch[1].y);
            this.pinchZoom = this.mode === '3d' ? this.renderer.zoom : this.renderer.scale2d;
        }
    }
    onTouchMove(e) {
        e.preventDefault();
        const ts = Array.from(e.touches);
        if (ts.length === 2 && this.pinchDist) {
            const d = Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY);
            const ratio = d / this.pinchDist;
            if (this.mode === '3d')
                this.renderer.zoom = Math.max(0.2, Math.min(8, this.pinchZoom * ratio));
            else
                this.renderer.scale2d = Math.max(5, Math.min(500, this.pinchZoom * ratio));
            this.renderer.render();
        }
        else if (ts.length === 1 && this.touch.length === 1) {
            const dx = ts[0].clientX - this.touch[0].x, dy = ts[0].clientY - this.touch[0].y;
            if (this.mode === '3d') {
                this.renderer.yaw += dx * 0.01;
                this.renderer.pitch = Math.max(-1.4, Math.min(1.4, this.renderer.pitch + dy * 0.01));
            }
            else {
                this.renderer.offsetX += dx;
                this.renderer.offsetY += dy;
            }
            this.renderer.render();
        }
        this.touch = ts.map(t => ({ id: t.identifier, x: t.clientX, y: t.clientY }));
    }
    onTouchEnd(e) {
        if (e.touches.length === 0 && this.touch.length === 1) {
            const t = this.touch[0];
            const rect = this.canvas.getBoundingClientRect();
            this.handleClick({ x: t.x - rect.left, y: t.y - rect.top });
        }
        this.touch = Array.from(e.touches).map(t => ({ id: t.identifier, x: t.clientX, y: t.clientY }));
        this.pinchDist = 0;
    }
    // ---- 核心交互逻辑 ----
    /** 垂直相机放置平面：过选中图元中心/原点 + 微小随机偏移（3D 自由点用） */
    placePlane(plane) {
        if (plane)
            return { n: planeNormal(plane), pt0: plane.a.pos };
        const anchor = this.freePointAnchor();
        return anchor;
    }
    /** 点击处：现成点 > 直线吸附 > 圆周吸附 > 球面 > 平面；plane 参数显式指定时优先 */
    ensurePoint(pos, plane) {
        const near = this.renderer.pickPoint(pos.x, pos.y);
        if (near)
            return near;
        if (this.mode === '3d') {
            // 显式指定平面（圆规工具）
            if (plane !== undefined) {
                const { n, pt0 } = plane
                    ? { n: planeNormal(plane), pt0: plane.a.pos }
                    : { n: v3(0, 0, 1), pt0: v3(0, 0, 0) };
                const world = this.renderer.unprojectToPlane(pos.x, pos.y, n, pt0);
                const pt = this.engine.addFreePoint(world);
                this.registerPoint(pt);
                return pt;
            }
            // 球面选点
            const sph = this.renderer.pickSphereSurface(pos.x, pos.y);
            if (sph) {
                const pt = this.engine.addFreePoint(sph.pt);
                this.registerPoint(pt);
                return pt;
            }
            // 直线吸附（半自由点）
            const line = this.renderer.pickLine(pos.x, pos.y);
            if (line) {
                const { n, pt0 } = this.placePlane();
                const world = this.renderer.unprojectToPlane(pos.x, pos.y, n, pt0);
                const snapped = projectPointToLine(world, line);
                const pt = this.engine.addFreePoint(snapped, { kind: 'line', id: line.id });
                this.registerPoint(pt);
                return pt;
            }
            // 圆周吸附（半自由点）
            const circle = this.renderer.pickCircle(pos.x, pos.y);
            if (circle) {
                const world = this.renderer.unprojectToPlane(pos.x, pos.y, circle.normal, circle.centerPos);
                const snapped = projectPointToCircle(world, circle);
                const pt = this.engine.addFreePoint(snapped, { kind: 'circle', id: circle.id });
                this.registerPoint(pt);
                return pt;
            }
            // 默认自由点：垂直相机平面（过选中图元中心/原点 + 随机偏移）
            const anchor = this.placePlane();
            const world = this.renderer.unprojectToPlane(pos.x, pos.y, anchor.n, anchor.pt0);
            const pt = this.engine.addFreePoint(world);
            this.registerPoint(pt);
            return pt;
        }
        // 2D：直线/圆周吸附
        const w = this.renderer.screenToWorld(pos.x, pos.y);
        const wp = v3(w.x, w.y, 0);
        const line = this.renderer.pickLine(pos.x, pos.y);
        if (line) {
            const snapped = projectPointToLine(wp, line);
            const pt = this.engine.addFreePoint(snapped, { kind: 'line', id: line.id });
            this.registerPoint(pt);
            return pt;
        }
        const circle = this.renderer.pickCircle(pos.x, pos.y);
        if (circle) {
            const snapped = projectPointToCircle(wp, circle);
            const pt = this.engine.addFreePoint(snapped, { kind: 'circle', id: circle.id });
            this.registerPoint(pt);
            return pt;
        }
        const pt = this.engine.addFreePoint(wp);
        this.registerPoint(pt);
        return pt;
    }
    /** 自由点放置平面：垂直相机，过当前选中图元中心（或原点），带微小随机偏移 */
    freePointAnchor() {
        const { w } = cameraBasis(this.renderer.yaw, this.renderer.pitch);
        let center;
        if (this.lastPickedElement)
            center = elementCenter(this.lastPickedElement);
        else if (this.renderer.inspectedPoint)
            center = this.renderer.inspectedPoint.pos;
        else
            center = v3(0, 0, 0);
        const jitter = (Math.random() - 0.5) * 0.1; // ±0.05 微小随机偏移（体现自由）
        return { n: w, pt0: v3add(center, v3scale(w, jitter)) };
    }
    handleClick(pos) {
        switch (this.currentTool) {
            case 'select':
                this.onSelectClick(pos);
                break;
            case 'point':
                this.onPointClick(pos);
                break;
            case 'line':
                this.onLineClick(pos);
                break;
            case 'circle':
                this.onCircleClick(pos);
                break;
            case 'sphere':
                this.onSphereClick(pos);
                break;
            case 'plane':
                this.onPlaneClick(pos);
                break;
            case 'intersect':
                this.onIntersectClick(pos);
                break;
        }
        this.updateCoord();
    }
    onSelectClick(pos) {
        const pt = this.renderer.pickPoint(pos.x, pos.y);
        if (pt) {
            this.renderer.inspectedPoint = pt;
            this.lastPickedElement = pt;
            this.setHint(`${L.picked} ${this.labelOf(pt.id)}`);
        }
        else {
            this.renderer.inspectedPoint = null;
            this.setHint(this.mode === '3d' ? L.selectHint3d : L.selectHint2d);
        }
        this.renderer.render();
    }
    onPointClick(pos) {
        this.ensurePoint(pos);
        this.updateAll();
    }
    onLineClick(pos) {
        const pt = this.ensurePoint(pos);
        if (this.tempSelection.includes(pt)) {
            this.showError(L.errSamePoint);
            return;
        }
        this.tempSelection.push(pt);
        this.renderer.selected.add(pt);
        this.lastPickedElement = pt;
        if (this.tempSelection.length === 2) {
            try {
                this.engine.addLine(this.tempSelection[0], this.tempSelection[1]);
            }
            catch (e) {
                this.showError(L.errNeedTwoPoints);
            }
            this.clearToolState();
            this.updateAll();
        }
        else {
            this.setHint(`${L.picked} ${this.labelOf(pt.id)} — ${L.lineHint}`);
            this.renderer.render();
        }
    }
    onCircleClick(pos) {
        const pt = this.ensurePoint(pos);
        if (this.tempSelection.includes(pt)) {
            this.showError(L.errSamePoint);
            return;
        }
        this.tempSelection.push(pt);
        this.renderer.selected.add(pt);
        this.lastPickedElement = pt;
        if (this.mode === '3d') {
            // 三点定面：圆心 + 圆上一点 + 平面内另一点（信息无冗余）
            if (this.tempSelection.length < 3) {
                const n = this.tempSelection.length;
                const first = this.labelOf(this.tempSelection[0].id);
                this.setHint(`${L.picked} ${first} · ${n}/3 — ${L.circleHint3d}`);
                this.renderer.render();
                return;
            }
            const [c, r, p3] = this.tempSelection;
            if (collinear(c.pos, r.pos, p3.pos)) {
                this.showError(L.errCollinear);
                this.clearToolState();
                this.renderer.render();
                return;
            }
            try {
                this.engine.addCircle(c, r, null, p3);
            }
            catch (e) {
                this.showError(e.message === 'zeroRadius' ? L.errZeroRadius : L.errNeedTwoPoints);
            }
            this.clearToolState();
            this.updateAll();
            return;
        }
        // 2D：圆心 + 圆上一点（地面）
        if (this.tempSelection.length === 2) {
            try {
                this.engine.addCircle(this.tempSelection[0], this.tempSelection[1], null);
            }
            catch (e) {
                this.showError(e.message === 'zeroRadius' ? L.errZeroRadius : L.errNeedTwoPoints);
            }
            this.clearToolState();
            this.updateAll();
        }
        else {
            this.setHint(`${L.picked} ${this.labelOf(pt.id)} — ${L.circleHint2d}`);
            this.renderer.render();
        }
    }
    onSphereClick(pos) {
        const pt = this.ensurePoint(pos);
        if (this.tempSelection.includes(pt)) {
            this.showError(L.errSamePoint);
            return;
        }
        this.tempSelection.push(pt);
        this.renderer.selected.add(pt);
        this.lastPickedElement = pt;
        if (this.tempSelection.length === 2) {
            try {
                this.engine.addSphere(this.tempSelection[0], this.tempSelection[1]);
            }
            catch (e) {
                this.showError(e.message === 'zeroRadius' ? L.errZeroRadius : L.errNeedTwoPoints);
            }
            this.clearToolState();
            this.updateAll();
        }
        else {
            this.setHint(`${L.picked} ${this.labelOf(pt.id)} — ${L.sphereHint}`);
            this.renderer.render();
        }
    }
    onPlaneClick(pos) {
        const pt = this.ensurePoint(pos);
        if (this.tempSelection.includes(pt)) {
            this.showError(L.errSamePoint);
            return;
        }
        this.tempSelection.push(pt);
        this.renderer.selected.add(pt);
        this.lastPickedElement = pt;
        if (this.tempSelection.length === 3) {
            try {
                const pl = this.engine.addPlane(this.tempSelection[0], this.tempSelection[1], this.tempSelection[2]);
                this.lastPickedElement = pl;
                this.planeOrder.push(pl.id);
            }
            catch (e) {
                this.showError(L.errCollinear);
            }
            this.clearToolState();
            this.updateAll();
        }
        else {
            this.setHint(`${L.picked} ${this.tempSelection.length}/3 — ${L.planeHint}`);
            this.renderer.render();
        }
    }
    onIntersectClick(pos) {
        const e = this.renderer.pickAny(pos.x, pos.y);
        if (!e)
            return;
        if (this.tempSelection.includes(e))
            return;
        this.tempSelection.push(e);
        this.renderer.selected.add(e);
        this.lastPickedElement = e;
        if (this.tempSelection.length === 2) {
            const created = this.engine.createIntersection(this.tempSelection[0], this.tempSelection[1]);
            if (created.points.length || created.circle) {
                created.points.forEach(p => this.registerPoint(p));
                if (created.circle)
                    this.registerPoint(created.circle.center);
                created.points.forEach(p => this.renderer.selected.add(p));
                if (created.circle)
                    this.renderer.selected.add(created.circle);
            }
            else {
                this.showError(L.errNoIntersection);
            }
            this.clearToolState();
            this.updateAll();
        }
        else {
            this.setHint(`${L.picked} ${this.elName(this.tempSelection[0])} — ${L.intersectHint}`);
            this.renderer.render();
        }
    }
    elName(e) {
        if (e instanceof GeoPoint)
            return this.labelOf(e.id);
        if (e instanceof GeoLine)
            return L.stepLine;
        if (e instanceof GeoCircle)
            return L.stepCircle;
        if (e instanceof GeoSphere)
            return L.stepSphere;
        return L.stepPlane;
    }
    clearToolState() {
        this.tempSelection = [];
        this.renderer.selected.clear();
        this.renderer.hovered = null;
        this.selectedPlane = null;
        this.renderer.selectedPlane = null;
    }
    updateAll() {
        this.updateElems();
        this.updateSteps();
        this.updateHint();
        this.updateCoord();
        this.renderer.render();
    }
    /** 图元列表：点/线/圆/球/平面，点击列表项 = 选中该图元（解决 3D 中平面等难以点选的问题） */
    updateElems() {
        const list = el('rlElems');
        const all = this.engine.getAllElements();
        if (!all.length) {
            list.innerHTML = `<div class="rl-elem rl-step-empty">${L.elemsEmpty}</div>`;
            return;
        }
        // 按类型分组排序：点、线、圆、球、平面
        const kindOf = (e) => e instanceof GeoPoint ? 0 : e instanceof GeoLine ? 1 : e instanceof GeoCircle ? 2 : e instanceof GeoSphere ? 3 : 4;
        const sorted = [...all].sort((a, b) => kindOf(a) - kindOf(b));
        const iconOf = (e) => e instanceof GeoPoint ? '•' : e instanceof GeoLine ? '—' : e instanceof GeoCircle ? '○' : e instanceof GeoSphere ? '◍' : '▱';
        list.innerHTML = sorted.map(e => {
            const name = this.elName(e);
            const sel = this.renderer.selected.has(e) ? ' active' : '';
            return `<div class="rl-elem${sel}" data-id="${e.id}"><span class="rl-elem-ico">${iconOf(e)}</span><span class="rl-elem-name">${name}</span></div>`;
        }).join('');
        list.querySelectorAll('.rl-elem').forEach(div => {
            div.addEventListener('click', () => {
                const id = div.dataset.id;
                const elem = this.engine.elements.get(id);
                if (!elem)
                    return;
                this.onListPick(elem);
            });
        });
    }
    /** 列表点击图元：按当前工具走对应选择逻辑（与画布点击共用“收集+执行”） */
    onListPick(e) {
        switch (this.currentTool) {
            case 'select': {
                // 选中/取消
                if (this.renderer.selected.has(e))
                    this.renderer.selected.delete(e);
                else {
                    this.renderer.selected.clear();
                    this.renderer.selected.add(e);
                }
                if (e instanceof GeoPoint)
                    this.renderer.inspectedPoint = e;
                this.updateAll();
                break;
            }
            case 'point': {
                // 点工具：列表中选中 = 聚焦该点（无动作）
                this.renderer.selected.clear();
                this.renderer.selected.add(e);
                this.updateAll();
                break;
            }
            case 'line': {
                if (e instanceof GeoPoint)
                    this.appendPick(e, 2, L.lineHint, 'line');
                break;
            }
            case 'circle': {
                if (e instanceof GeoPoint) {
                    if (this.mode === '3d')
                        this.appendPick(e, 3, L.circleHint3d, 'circle');
                    else
                        this.appendPick(e, 2, L.circleHint2d, 'circle');
                }
                break;
            }
            case 'sphere': {
                if (e instanceof GeoPoint)
                    this.appendPick(e, 2, L.sphereHint, 'sphere');
                break;
            }
            case 'plane': {
                if (e instanceof GeoPoint)
                    this.appendPick(e, 3, L.planeHint, 'plane');
                break;
            }
            case 'intersect': {
                if (e instanceof GeoLine || e instanceof GeoCircle || e instanceof GeoSphere || e instanceof GeoPlane) {
                    this.appendPick(e, 2, L.intersectHint, 'intersect');
                }
                break;
            }
        }
    }
    /** 收集第 n 个选择并执行对应构造（供列表点击用，与画布点击逻辑一致） */
    appendPick(e, need, hint, kind) {
        if (this.tempSelection.includes(e)) {
            this.showError(L.errSamePoint);
            return;
        }
        this.tempSelection.push(e);
        this.renderer.selected.add(e);
        this.lastPickedElement = e;
        if (this.tempSelection.length < need) {
            this.setHint(`${L.picked} ${this.tempSelection.length}/${need} — ${hint}`);
            this.renderer.render();
            return;
        }
        // 数量已够：执行构造
        if (kind === 'line') {
            try {
                this.engine.addLine(this.tempSelection[0], this.tempSelection[1]);
            }
            catch (ex) {
                this.showError(L.errNeedTwoPoints);
            }
        }
        else if (kind === 'circle') {
            if (this.mode === '3d') {
                const [c, r, p3] = this.tempSelection;
                if (collinear(c.pos, r.pos, p3.pos)) {
                    this.showError(L.errCollinear);
                }
                else {
                    try {
                        this.engine.addCircle(c, r, null, p3);
                    }
                    catch (ex) {
                        this.showError(ex.message === 'zeroRadius' ? L.errZeroRadius : L.errNeedTwoPoints);
                    }
                }
            }
            else {
                try {
                    this.engine.addCircle(this.tempSelection[0], this.tempSelection[1], null);
                }
                catch (ex) {
                    this.showError(ex.message === 'zeroRadius' ? L.errZeroRadius : L.errNeedTwoPoints);
                }
            }
        }
        else if (kind === 'sphere') {
            try {
                this.engine.addSphere(this.tempSelection[0], this.tempSelection[1]);
            }
            catch (ex) {
                this.showError(ex.message === 'zeroRadius' ? L.errZeroRadius : L.errNeedTwoPoints);
            }
        }
        else if (kind === 'plane') {
            try {
                const pl = this.engine.addPlane(this.tempSelection[0], this.tempSelection[1], this.tempSelection[2]);
                this.lastPickedElement = pl;
                this.planeOrder.push(pl.id);
            }
            catch (ex) {
                this.showError(L.errCollinear);
            }
        }
        else if (kind === 'intersect') {
            const created = this.engine.createIntersection(this.tempSelection[0], this.tempSelection[1]);
            if (created.points.length || created.circle) {
                created.points.forEach(p => this.registerPoint(p));
                if (created.circle)
                    this.registerPoint(created.circle.center);
                created.points.forEach(p => this.renderer.selected.add(p));
                if (created.circle)
                    this.renderer.selected.add(created.circle);
            }
            else {
                this.showError(L.errNoIntersection);
            }
        }
        this.clearToolState();
        this.updateAll();
    }
    updateHint() {
        const h = el('rlHint');
        h.classList.remove('err');
        switch (this.currentTool) {
            case 'select':
                h.textContent = this.mode === '3d' ? L.selectHint3d : L.selectHint2d;
                break;
            case 'point':
                h.textContent = this.mode === '3d' ? L.pointHint3d : L.pointHint2d;
                break;
            case 'line':
                h.textContent = L.lineHint;
                break;
            case 'circle':
                h.textContent = this.mode === '3d' ? L.circleHint3d : L.circleHint2d;
                break;
            case 'sphere':
                h.textContent = L.sphereHint;
                break;
            case 'plane':
                h.textContent = L.planeHint;
                break;
            case 'intersect':
                h.textContent = L.intersectHint;
                break;
        }
    }
    setHint(text, err = false) {
        const h = el('rlHint');
        h.textContent = text;
        h.classList.toggle('err', err);
    }
    showError(text) {
        this.setHint(text, true);
    }
    updateSteps() {
        const list = el('rlSteps');
        if (!this.engine.stepHistory.length) {
            list.innerHTML = `<div class="rl-step rl-step-empty">${L.emptySteps}</div>`;
            return;
        }
        list.innerHTML = this.engine.stepHistory
            .map((s, i) => `<div class="rl-step">${i + 1}. ${this.formatStep(s)}</div>`)
            .join('');
    }
    formatStep(s) {
        const l = this.labelOf.bind(this);
        switch (s.type) {
            case 'free-point': {
                let text = `${L.stepPoint} ${l(s.outputIds[0])}`;
                const on = s.params.on;
                if (on) {
                    const elm = this.engine.elements.get(on.id);
                    if (on.kind === 'line' && elm instanceof GeoLine) {
                        text += ` · ${L.stepLine} ${l(elm.p1.id)}${l(elm.p2.id)}`;
                    }
                    else if (on.kind === 'circle' && elm instanceof GeoCircle) {
                        text += ` · ⊙${l(elm.center.id)}`;
                    }
                }
                return text;
            }
            case 'line': return `${L.stepLine} ${l(s.params.p1Id)}${l(s.params.p2Id)}`;
            case 'circle': return L.stepCircle;
            case 'sphere': return L.stepSphere;
            case 'plane': return L.stepPlane;
            case 'intersection': return `${L.stepInter} (${s.params.kind})`;
            case 'inter-circle': return L.stepInterCircle;
        }
    }
    updateCoord() {
        const pt = this.renderer.inspectedPoint;
        const c = el('rlCoord');
        if (pt) {
            c.textContent = this.mode === '3d'
                ? `${this.labelOf(pt.id)} (${pt.pos.x.toFixed(4)}, ${pt.pos.y.toFixed(4)}, ${pt.pos.z.toFixed(4)})`
                : `${this.labelOf(pt.id)} (${pt.pos.x.toFixed(4)}, ${pt.pos.y.toFixed(4)})`;
        }
        else {
            c.textContent = '—';
        }
    }
    undo() {
        const last = this.engine.stepHistory.pop();
        if (!last)
            return;
        last.outputIds.forEach(id => {
            this.engine.elements.delete(id);
            const i = this.pointOrder.indexOf(id);
            if (i >= 0)
                this.pointOrder.splice(i, 1);
            const j = this.planeOrder.indexOf(id);
            if (j >= 0)
                this.planeOrder.splice(j, 1);
        });
        this.clearToolState();
        this.renderer.inspectedPoint = null;
        this.updateAll();
    }
}
// ============================================================
// DOM 注入：导航按钮 + 面板（不改 index.html 结构）
// ============================================================
let app = null;
function buildDOM() {
    const nav = document.querySelector('.layer-buttons');
    const btn = document.createElement('button');
    btn.dataset.layer = 'R-layer';
    btn.textContent = L.layerName;
    nav.appendChild(btn);
    const panel = document.createElement('div');
    panel.dataset.layer = 'R-layer';
    panel.className = 'hide';
    panel.innerHTML = `
    <div class="rl-root">
      <div class="rl-top">
        <div class="rl-mode">
          <button class="btn-sm active" id="rlMode2d">${L.mode2d}</button>
          <button class="btn-sm" id="rlMode3d">${L.mode3d}</button>
        </div>
        <div class="rl-goal">
          <div class="rl-goal-name" id="rlGoalName"></div>
          <div class="rl-goal-desc" id="rlGoalDesc"></div>
        </div>
        <div class="rl-actions">
          <button class="btn-sm" id="rlUndo">${L.undoLabel}</button>
          <button class="btn-sm warning" id="rlClear">${L.clearLabel}</button>
          <button class="btn-sm primary" id="rlNext">${L.nextLevel}</button>
        </div>
      </div>
      <div class="rl-main">
        <div class="rl-toolbar" id="rlToolbar"></div>
        <div class="rl-canvas-wrap"><canvas id="rlCanvas"></canvas></div>
        <div class="rl-side">
          <div class="manager-card rl-card">
            <div class="card-header"><h2>${L.elemsLabel}</h2></div>
            <div class="rl-elems" id="rlElems"></div>
          </div>
          <div class="manager-card rl-card">
            <div class="card-header"><h2>${L.stepsLabel}</h2></div>
            <div class="rl-steps" id="rlSteps"></div>
          </div>
          <div class="manager-card rl-card">
            <div class="card-header"><h2>${L.hintLabel}</h2></div>
            <div class="rl-hint" id="rlHint"></div>
          </div>
          <div class="manager-card rl-card">
            <div class="card-header"><h2>${L.coordLabel}</h2></div>
            <div class="rl-coord" id="rlCoord"></div>
          </div>
        </div>
      </div>
    </div>`;
    document.body.appendChild(panel);
    // 层切换：显示/隐藏 + 激活 + 重测画布（与 game.js 的 initLayerGUI 逻辑一致）
    btn.addEventListener('click', () => {
        btn.blur();
        document.querySelectorAll('.layer-buttons button').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('div[data-layer]').forEach(p => p.classList.add('hide'));
        btn.classList.add('active');
        panel.classList.remove('hide');
        if (app)
            app.resize();
    });
}
function boot() {
    buildDOM();
    app = new App();
    window.app = app; // 便于调试
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
}
else {
    boot();
}
//# sourceMappingURL=main.js.map