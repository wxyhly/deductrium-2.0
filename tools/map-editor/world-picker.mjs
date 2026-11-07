import {Hvec, Rotor} from '../../js/hy/algebra.js';
import {canonicalPath, regionContains} from './geometry.mjs';

const copy = value => value == null ? null : JSON.parse(JSON.stringify(value));
const walkable = tile => tile && (tile.type === 0 || tile.type === 3);

/** A draft-only map interaction; applying either setting remains the caller's job. */
export function installWorldPicker(api, {onRegion, onEntry} = {}) {
    const canvas = document.getElementById('map');
    const host = canvas.parentElement;
    const overlay = document.createElement('canvas');
    overlay.className = 'world-picker-overlay'; overlay.setAttribute('aria-hidden', 'true');
    const toolbar = document.createElement('section');
    toolbar.id = 'world-picker-toolbar'; toolbar.className = 'world-picker-toolbar'; toolbar.hidden = true;
    toolbar.setAttribute('aria-label', '地图范围与入口选取');
    toolbar.innerHTML = '<strong id="world-picker-title"></strong><p id="world-picker-status" role="status" aria-live="polite"></p><div class="world-picker-actions"><button type="button" id="world-picker-flip">翻转 mod 范围</button><button type="button" id="world-picker-relocate">移动 mod 后连接</button><button type="button" id="world-picker-reselect">重选 mod 入口</button><button type="button" id="world-picker-rotate">旋转 mod</button><button type="button" id="world-picker-cancel">取消</button><button type="button" id="world-picker-confirm" class="primary">确认选择</button></div><small>拖动地图平移 · 选取时涂色为 mod 范围 · 确认后涂色侧不可写 · Esc 取消</small>';
    const edges = document.createElement('div');
    edges.className = 'world-picker-edges'; edges.hidden = true;
    edges.setAttribute('role', 'group'); edges.setAttribute('aria-label', '选择边界格的一条边');
    const edgeButtons = Array.from({length: 6}, (_, edge) => {
        const button = document.createElement('button'); button.type = 'button';
        button.id = `world-picker-edge-${edge}`; button.dataset.edge = String(edge);
        button.textContent = String(edge); button.title = `选择第 ${edge} 条边`;
        button.setAttribute('aria-label', `边 ${edge}`);
        button.onclick = () => {
            if (kind === 'entry' && moving?.mainHash != null) place(edge);
            else if (kind === 'region' && draftRegion) draftRegion.edge = edge;
            else return;
            update(); api.redraw();
        };
        edges.append(button); return button;
    });
    host.append(overlay, edges, toolbar);
    const status = toolbar.querySelector('#world-picker-status');
    const confirm = toolbar.querySelector('#world-picker-confirm');
    const flip = toolbar.querySelector('#world-picker-flip');
    const relocate = toolbar.querySelector('#world-picker-relocate');
    const reselect = toolbar.querySelector('#world-picker-reselect');
    const rotate = toolbar.querySelector('#world-picker-rotate');
    let project = api.project, kind = null, draftRegion = null, draftEntry = null;
    let previewRegion = copy(project.region), previewEntry = copy(project.world?.entry);
    let original = null, mainHash = null, message = '', regionError = '';
    let moving = null, placement = null, previewPlacement = null;
    let placementSnapshot = null;
    const frames = new Map();

    const polygon = () => api.world.atlasTile;
    const normalize = hash => canonicalPath(hash, polygon()).join(',');
    const shownRegion = () => kind === 'region' ? draftRegion : moving ? placement?.region : previewRegion;
    const shownEntry = () => kind === 'entry' ? draftEntry : previewEntry;
    const shownTiles = () => (moving ? placement?.tiles : previewPlacement?.tiles) ?? project.tiles;
    const extensionMode = () => project.world?.mode === 'extension'
        || document.getElementById('world-mode')?.value === 'extension';

    function checkRegion() {
        regionError = '';
        if (!draftRegion) return;
        try {
            for (const hash of project.tiles.keys()) if (!regionContains(hash, draftRegion, polygon())) {
                regionError = '当前 mod 格超出涂色范围；可换边或翻转 mod 范围。'; return;
            }
            if (extensionMode()) {
                const opposite = {...draftRegion, side: -draftRegion.side};
                for (const hash of api.officialTiles.keys()) if (!regionContains(hash, opposite, polygon())) {
                    regionError = '此范围穿过官方底图；请选择底图外沿并翻转到外侧。'; return;
                }
            }
        } catch { regionError = '边界坐标无效，请重新选择地图上的格子。'; }
    }

    function update() {
        toolbar.hidden = !kind; edges.hidden = !(kind === 'region' && draftRegion) && !(kind === 'entry' && moving?.mainHash != null);
        flip.hidden = kind !== 'region';
        relocate.hidden = kind !== 'entry' || !!moving;
        reselect.hidden = kind !== 'entry' || !moving?.tileId;
        rotate.hidden = kind !== 'entry' || !moving || moving.mainHash == null;
        toolbar.dataset.kind = kind || '';
        toolbar.querySelector('#world-picker-title').textContent = kind === 'entry' ? '连接扩展入口' : '选择半平面范围';
        if (kind === 'region') {
            checkRegion();
            status.textContent = message || (draftRegion
                ? `边界 [${draftRegion.hash || '原点'}] · 边 ${draftRegion.edge} · ${draftRegion.side === 1 ? 'mod 范围包含边界格' : 'mod 范围在边界格另一侧'}。${regionError || '当前涂色为 mod 范围；确认后遮罩翻到不可写侧。'}`
                : '第 1 步：点选地图上的边界格；再从六条边中选择。');
            confirm.disabled = !draftRegion || !!regionError;
        } else if (kind === 'entry') {
            status.textContent = message || (moving ? placement
                ? `移动预览：${project.tiles.size} 格 · 旋转 ${placement.rotation} · 官方 [${draftEntry.mainHash || '原点'}] → 边 ${draftEntry.edge} → mod ${draftEntry.tileId}。确认后仍须应用世界设置。`
                : !moving.tileId ? '第 1 步：当前仅显示 mod，点击它的道路或奖励格作为连接入口。'
                    : moving.mainHash == null ? `已选 mod ${moving.tileId}；第 2 步：当前仅显示官方地图，点击官方道路或奖励格。`
                        : '请选择官方格的一条连接边；mod 必须整体位于主地图外侧。'
                : draftEntry
                ? `官方 [${draftEntry.mainHash || '原点'}] → 边 ${draftEntry.edge} → mod ${draftEntry.tileId}。确认后填写入口。`
                : mainHash !== null ? `已选官方 [${mainHash || '原点'}]；第 2 步：点相邻的 mod 道路或奖励格。`
                    : '第 1 步：点选官方道路或奖励格；第 2 步：点相邻的 mod 格。');
            confirm.disabled = !draftEntry;
        }
        for (const [edge, button] of edgeButtons.entries()) {
            button.setAttribute('aria-pressed', String((moving ? moving.edge : draftRegion?.edge) === edge));
        }
    }

    function displayPlacement() {
        if (moving) api.setWorldPreview?.({official: !!moving.tileId, tiles: !moving.tileId ? project.tiles : placement?.tiles ?? new Map()});
        else api.setWorldPreview?.(previewPlacement ? {official: true, tiles: previewPlacement.tiles} : null);
    }
    function startMoving() {
        moving = {}; placement = null; placementSnapshot = null; draftEntry = null; mainHash = null; message = '';
        displayPlacement(); update(); api.redraw();
    }
    function place(edge, rotation) {
        moving.edge = edge; placement = null; placementSnapshot = null; draftEntry = null; message = '';
        if (rotation !== undefined) moving.rotation = rotation;
        try {
            placement = project.previewAttachment({tileId:moving.tileId, mainHash:moving.mainHash, edge,
                ...(rotation === undefined ? {} : {rotation})}, api.officialTiles);
            if (placement.errors?.length) throw Error(placement.errors.join('；'));
            placementSnapshot = JSON.stringify(project.toJSON());
            draftEntry = copy(placement.entry); moving.rotation = placement.rotation;
        } catch (error) { placement = null; message = error.message; }
        displayPlacement();
    }

    function stop({restore = false, panel = true, identity = false} = {}) {
        if (!kind) return;
        kind = null;
        if (restore && original && !identity) {
            previewRegion = original.region; previewEntry = original.entry;
        }
        original = null; draftRegion = draftEntry = null; mainHash = null; message = ''; moving = null; placement = null;
        placementSnapshot = null;
        api.showOfficialBase?.(false);
        displayPlacement();
        update();
        if (panel) api.openPanel('project', false);
        api.redraw();
    }

    function refresh() {
        if (api.project !== project) {
            stop({panel: false, identity: true});
            project = api.project;
            previewRegion = copy(project.region); previewEntry = copy(project.world?.entry);
            previewPlacement = null; api.setWorldPreview?.(null);
            frames.clear();
        } else if (placement && placementSnapshot !== JSON.stringify(project.toJSON())) {
            moving = {}; placement = null; placementSnapshot = null; draftEntry = null; mainHash = null;
            message = '项目已变化，请重新选择 mod 入口并生成移动预览。';
        }
        if (moving) displayPlacement();
        update();
    }

    function begin(nextKind) {
        if (!['region', 'entry'].includes(nextKind)) throw Error('未知地图选取方式');
        refresh();
        if (kind) stop({restore: true, panel: false});
        original = {region: copy(previewRegion), entry: copy(previewEntry)};
        kind = nextKind; message = ''; mainHash = null;
        // Start with an explicit click, so a stale form value cannot confirm another tile.
        draftRegion = draftEntry = null;
        api.openPanel(null, false);
        const toggle = document.getElementById('toggle-inspector');
        if (document.getElementById('inspector')?.dataset.expanded === 'true') toggle?.click();
        api.showOfficialBase?.(kind === 'entry' || extensionMode());
        const official = api.officialTiles;
        if (kind === 'entry' && [...project.tiles.keys()].some(hash=>official.has(hash))) startMoving();
        update(); api.redraw();
        toolbar.querySelector('#world-picker-cancel').focus({preventScroll: true});
    }

    function click(hash) {
        refresh();
        if (!kind) return !!previewPlacement;
        message = '';
        try {
            hash = normalize(hash);
            if (kind === 'region') {
                draftRegion = {hash, edge: draftRegion?.edge ?? 0, side: draftRegion?.side ?? 1};
            } else if (moving) {
                if (!moving.tileId) {
                    const mod = project.tiles.get(hash);
                    if (!walkable(mod)) message = '请选择 mod 的道路或奖励格。';
                    else { moving.tileId = mod.id; displayPlacement(); }
                } else {
                    if (!walkable(api.officialTiles.get(hash))) message = '请选择官方地图的道路或奖励格。';
                    else { moving.mainHash = hash; mainHash = hash; placement = null; placementSnapshot = null; draftEntry = null; moving.edge = undefined; displayPlacement(); }
                }
            } else {
                const official = api.officialTiles.get(hash), mod = project.tiles.get(hash);
                if (walkable(official)) {
                    mainHash = hash; draftEntry = null;
                } else if (mainHash === null) {
                    message = '请先选择官方道路或奖励格。';
                } else if (!walkable(mod)) {
                    message = '请选择现有的 mod 道路或奖励格；空白格和墙不能作为入口。';
                } else {
                    const at = canonicalPath(mainHash, polygon());
                    const edge = Array.from({length: 6}, (_, n) => n).find(n =>
                        polygon().getNeighborAndDir(at, n, true)[0].join(',') === hash);
                    if (edge === undefined) message = '两个入口格必须直接相邻，请选择高亮官方格旁的 mod 格。';
                    else {
                        draftEntry = {mainHash, edge, tileId: mod.id};
                    }
                }
            }
        } catch { message = '该位置无法选取，请选择地图上的有效格子。'; }
        update(); api.redraw(); return true;
    }

    toolbar.querySelector('#world-picker-cancel').onclick = () => stop({restore: true});
    relocate.onclick = startMoving;
    reselect.onclick = startMoving;
    rotate.onclick = () => {
        if (moving?.mainHash == null || moving.edge === undefined) return;
        place(moving.edge, ((moving.rotation ?? 0) + 1) % 6); update(); api.redraw();
    };
    flip.onclick = () => {
        if (!draftRegion) return;
        draftRegion.side *= -1; message = ''; update(); api.redraw();
    };
    confirm.onclick = () => {
        refresh();
        if (!kind || confirm.disabled) return;
        const selectedKind = kind, value = copy(kind === 'region' ? draftRegion : draftEntry), selectedPlacement = placement;
        if (selectedKind === 'region') previewRegion = copy(value); else previewEntry = copy(value);
        stop();
        if (selectedKind === 'region') onRegion?.(value); else onEntry?.(value, selectedPlacement);
    };
    window.addEventListener('keydown', event => {
        if (event.key === 'Escape' && kind) {
            event.preventDefault(); event.stopImmediatePropagation(); stop({restore: true});
        }
    }, true);
    window.addEventListener('map-editor-project-change', refresh);

    // The same canonical frames as Polygon.generateRotors, without changing its atlas.
    function rootFrame(hash) {
        if (frames.has(hash)) return frames.get(hash);
        let at = [], frame = new Rotor();
        for (const edge of canonicalPath(hash, polygon())) {
            const [next, back] = polygon().getNeighborAndDir(at, edge, true);
            frame = frame.mul(polygon().getNeighborMatrix(back, edge)); at = next;
        }
        if (frames.size > 2048) frames.clear(); frames.set(hash, frame); return frame;
    }
    function viewFrame(hash) {
        const world = api.world, current = world.currentTile.join(',');
        const rotor = world.atlasTile.rotors.get(hash)
            ?? rootFrame(current).conj().mul(rootFrame(hash));
        return world.localCamMat.mul(rotor);
    }

    function draw() {
        if (api.project !== project) refresh();
        const rect = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
        const width = rect.width, height = rect.height;
        if (!width || !height) return;
        if (overlay.width !== Math.round(width * dpr) || overlay.height !== Math.round(height * dpr)) {
            overlay.width = Math.round(width * dpr); overlay.height = Math.round(height * dpr);
        }
        const ctx = overlay.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
        const region = shownRegion(), entry = shownEntry();
        const official = api.officialTiles;
        const showOfficial = moving ? !!moving.tileId : project.world?.mode === 'extension' || kind === 'entry'
            || (kind === 'region' && extensionMode());
        const tiles = shownTiles();
        const scale = api.world.localDraw.scale * Math.min(width, height) / 2;
        const projectPoint = p => ({x: width / 2 + p.x / (p.z + 1) * scale,
            y: height / 2 + p.y / (p.z + 1) * scale});
        const vertices = [[-1,1],[1,1],[2,0],[1,-1],[-1,-1],[-2,0]]
            .map(([x,y]) => new Hvec(Math.sqrt(3), x / Math.sqrt(2), y * Math.sqrt(1.5)));
        const edgeHash = moving?.mainHash ?? (kind === 'region' ? region?.hash : undefined);
        if (edgeHash != null) {
            let positions = [];
            try {
                const frame=viewFrame(edgeHash), center=projectPoint(frame.apply(new Hvec()));
                positions=edgeButtons.map((_,edge)=>{
                    const p=projectPoint(frame.mul(Rotor.rotate(edge*Math.PI/3)).apply(polygon().edge));
                    let dx=p.x-center.x, dy=p.y-center.y;
                    const length=Math.hypot(dx,dy);
                    if (length<64 && length>0) { dx*=64/length; dy*=64/length; }
                    return {x:center.x+dx,y:center.y+dy};
                });
            } catch { /* Fall back to the edge strip if the boundary is too distant to project. */ }
            const bar=toolbar.getBoundingClientRect();
            const toolbarBox={left:bar.left-rect.left,top:bar.top-rect.top,right:bar.right-rect.left,bottom:bar.bottom-rect.top};
            const fits=positions.length===6 && positions.every((p,i)=>{
                if (!Number.isFinite(p.x) || !Number.isFinite(p.y)
                    || p.x<26 || p.x>width-26 || p.y<26 || p.y>height-26) return false;
                if (p.x+26>toolbarBox.left && p.x-26<toolbarBox.right
                    && p.y+26>toolbarBox.top && p.y-26<toolbarBox.bottom) return false;
                return positions.slice(0,i).every(q=>Math.abs(p.x-q.x)>=48 || Math.abs(p.y-q.y)>=48);
            });
            edges.dataset.layout=fits?'edges':'strip';
            if (!fits) {
                // Move all six together; clamping individual buttons can merge their hit targets.
                const columns=Math.max(1,Math.min(6,Math.floor((width-12)/48)));
                const left=(width-(columns*48-4))/2;
                positions=edgeButtons.map((_,i)=>({x:left+22+(i%columns)*48,y:30+Math.floor(i/columns)*48}));
            }
            edgeButtons.forEach((button,i)=>{
                button.style.left=`${positions[i].x}px`; button.style.top=`${positions[i].y}px`;
            });
        }
        function tilePath(hash) {
            const frame = viewFrame(hash), path = new Path2D();
            const points = vertices.map(v => frame.apply(v));
            for (let i=0; i<points.length; i++) {
                const a=points[i], b=points[(i+1)%points.length];
                const precalc=Hvec.precalcLerp(a,b);
                // Match LocalDraw.drawLine's five hyperbolic subdivisions.
                for (let step=0; step<=5; step++) {
                    const p=projectPoint(Hvec.fastLerp(a,b,step/5,precalc));
                    if (!i && !step) path.moveTo(p.x,p.y); else path.lineTo(p.x,p.y);
                }
            }
            path.closePath(); return path;
        }
        function mark(hash, color, filled = true) {
            const path = tilePath(hash);
            if (filled) { ctx.fillStyle = color; ctx.fill(path); }
            ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke(path);
        }
        try {
            if (region) {
                // Preview the chosen mod side while picking; after confirmation shade the readonly side.
                const shadedSide = kind === 'region' ? region.side : -region.side;
                // Lorentz plane <p,n>=0 becomes an exact orthogonal circle in the disk.
                const normal = viewFrame(region.hash).mul(Rotor.rotate(region.edge * Math.PI / 3)).apply(polygon().n3);
                ctx.save();
                try {
                    ctx.translate(width / 2, height / 2); ctx.scale(scale, scale);
                    const disk = new Path2D(); disk.arc(0,0,1,0,2*Math.PI); ctx.clip(disk);
                    const plane = new Path2D();
                    if (Math.abs(normal.z) < 1e-12) {
                        const length = Math.hypot(normal.x, normal.y), nx = normal.x/length, ny = normal.y/length;
                        const sign = -shadedSide, tx = -ny, ty = nx;
                        plane.moveTo(tx*3,ty*3); plane.lineTo(-tx*3,-ty*3);
                        plane.lineTo(-tx*3+nx*sign*4,-ty*3+ny*sign*4);
                        plane.lineTo(tx*3+nx*sign*4,ty*3+ny*sign*4); plane.closePath();
                        ctx.fillStyle = 'rgba(33,168,105,.17)'; ctx.fill(plane);
                        ctx.beginPath(); ctx.moveTo(tx*3,ty*3); ctx.lineTo(-tx*3,-ty*3);
                    } else {
                        const cx=normal.x/normal.z, cy=normal.y/normal.z;
                        const radius=Math.sqrt(Math.max(0,cx*cx+cy*cy-1));
                        plane.arc(cx,cy,radius,0,2*Math.PI);
                        ctx.fillStyle='rgba(33,168,105,.17)';
                        if (shadedSide*normal.z > 0) { const outside=new Path2D(disk); outside.addPath(plane); ctx.fill(outside,'evenodd'); }
                        else ctx.fill(plane);
                        ctx.beginPath(); ctx.arc(cx,cy,radius,0,2*Math.PI);
                    }
                    ctx.strokeStyle='#168458'; ctx.lineWidth=2/scale; ctx.setLineDash([7/scale,4/scale]); ctx.stroke();
                } finally { ctx.restore(); }
                // Whole-tile eligibility uses the exact six-vertex predicate, including boundary equality.
                for (const hash of api.world.atlasTile.rotors.keys()) {
                    if (!tiles.has(hash) && !(showOfficial && official.has(hash))) continue;
                    const allowed = regionContains(hash,region,polygon()) && !(showOfficial && official.has(hash));
                    if (kind === 'region' ? allowed : !allowed) { ctx.fillStyle = 'rgba(29,174,103,.17)'; ctx.fill(tilePath(hash)); }
                }
                if (kind === 'region') {
                    mark(region.hash,'rgba(231,162,28,.9)',false);
                }
            }
            const officialHash = kind === 'entry' ? mainHash : entry?.mainHash;
            if (officialHash != null) mark(officialHash,'rgba(232,165,33,.5)');
            if (entry) {
                const tile=[...tiles.values()].find(tile=>tile.id===entry.tileId);
                if (tile) {
                    mark(tile.hash,'rgba(21,165,131,.5)');
                    const a=projectPoint(viewFrame(entry.mainHash).apply(new Hvec())), b=projectPoint(viewFrame(tile.hash).apply(new Hvec()));
                    const angle=Math.atan2(b.y-a.y,b.x-a.x);
                    ctx.strokeStyle='#087a65'; ctx.fillStyle='#087a65'; ctx.lineWidth=4;
                    ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(b.x,b.y); ctx.lineTo(b.x-13*Math.cos(angle-.5),b.y-13*Math.sin(angle-.5));
                    ctx.lineTo(b.x-13*Math.cos(angle+.5),b.y-13*Math.sin(angle+.5)); ctx.closePath(); ctx.fill();
                }
            }
        } catch {
            // Incomplete manually typed coordinates are ordinary form drafts.
            ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,width,height);
        }
    }

    function setPreview(region, entry) {
        refresh();
        previewRegion = safeRegion(region); previewEntry = safeEntry(entry);
        api.redraw();
    }
    function setPlacement(value) {
        previewPlacement = value;
        if (!kind) displayPlacement();
        api.redraw();
    }
    function safeRegion(value) {
        try {
            if (!value || !Number.isInteger(value.edge) || value.edge<0 || value.edge>5 || ![1,-1].includes(value.side)) return null;
            return {hash:normalize(value.hash),edge:value.edge,side:value.side};
        } catch { return null; }
    }
    function safeEntry(value) {
        try {
            if (!value || !Number.isInteger(value.edge) || value.edge<0 || value.edge>5 || typeof value.tileId!=='string') return null;
            return {mainHash:normalize(value.mainHash),edge:value.edge,tileId:value.tileId};
        } catch { return null; }
    }
    api.setMapInteraction({click, draw});
    return {begin, refresh, cancel: () => stop({restore:true}), setPreview, setPlacement};
}
