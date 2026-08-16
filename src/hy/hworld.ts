import { Hvec, Quaternion, Rotor } from "./algebra.js";
import { LangMgr } from "../lang.js";
import { LocalDraw } from "./localdraw.js";
import { TileBlock, TileBlockType, blockMap, initMap, nameMap } from "./maploader.js";
import { genOrdTiles } from "./ordinal.js";
import { Polygon, TileHash } from "./tiling.js";

// 多语言文本（Record）暂按当前语言选取显示；翻译逻辑尚未接入
function tileText(tb: TileBlock): string {
    return typeof tb.text === "string" ? tb.text : tb.text[LangMgr.lang] ?? Object.values(tb.text)[0] ?? "";
}

export class HWorld {
    debugDraw = false;
    navigateDraw = false;
    localDraw: LocalDraw;
    localCamMat = new Rotor;
    currentTile: TileHash = [];
    currentOrd: number[] = null!;
    gravity = true;
    prettyPrint = true;
    highLightGetD = false;
    // if tile doesn't have name, name is hash
    // 游戏交互尚未接入：闸门默认不可通过、奖励默认不发放，避免未绑定回调时报错
    onPassGate: (name: string, tile: TileBlock, hash: string) => boolean = () => false;
    onGetReward: (hash: string, tile: TileBlock, isLoading?: boolean) => void = () => { };
    onStateChange = () => { };
    onStepToAnotherTile = () => { };
    // 渲染回调（由 game.ts 注入，参数为 tile）：按 tile.data/type 决定颜色与显示文本
    onTileColor?: (block: TileBlock, highLightGetD: boolean) => string;
    onTextColor?: (block: TileBlock) => string;
    onTileText?: (block: TileBlock) => string;
    atlasTile: Polygon;
    constructor(canvas: HTMLCanvasElement) {
        this.localDraw = new LocalDraw(canvas);
        this.atlasTile = new Polygon(6, 4);
        this.atlasTile.generateRotors();
        initMap(this.atlasTile);
    }
    reload() {
        initMap(this.atlasTile);
    }
    getBlock(hash: string):TileBlock {
        const r = blockMap.get(hash) ?? blockMap.get(nameMap.get(hash)!);
        if (!r && hash.startsWith("1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,3,3")) {
            if (hash.match(/^1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,3,3,(3|4(,2)*,1)/)) {
                const stone = hash.match(/2,3$/);
                const k = "卍般摩波慧迦莲净空寂禅佛孤於婆玄冥尔智超菩提修皈灵尊弥咒唵噜嘿噶吽萨魅魂丧魄心戒律缚摒幽乾刹伽吒禄衰阳阴若陀";
                return { type: stone ? 2 : hash.match(/(3|4(,2)*,1)...+(2|4),(3|4(,2)*,1)/) ? 4 : hash.match(/((3,3)|(4,4)|(2,2))$/) ? 3 : 0, name: "", text: stone ? k[(hash.length * 31 + hash.lastIndexOf("2") * 53 + hash.lastIndexOf("3") * 11 + 3) % k.length] : "", data: undefined };
            }
        }
        return r!;
    }
    getNamedBlockHash(name: string) {
        return nameMap.get(name);
    }
    // 默认 tile 填充色（含高亮获取推理素的方块），未注入回调时使用
    private defaultTileColor(block: TileBlock): string {
        if (this.highLightGetD && typeof block?.text === "string" && block.text.match(/^获取(.+)推理素$/)) return "rgb(255,255,0)";
        return ["rgb(255,255,255)", "rgb(220,220,220)", "rgb(250,160,20)", "rgb(200,255,20)", "rgb(180,255,240)"][block?.type ?? 1];
    }
    // 默认文字颜色
    private defaultTextColor(block: TileBlock): string {
        return ["rgb(0,80,0)", "rgb(60,60,255)", "rgb(33,38,255)", "rgb(255,0,0)", "rgb(30,20,100)"][block.type];
    }
    onLoop() {
        const ctxt = this.localDraw.ctxt;
        this.localDraw.clear();
        ctxt.fillStyle = "rgb(220,220,220)";
        this.localDraw.drawOutBorder();
        ctxt.textAlign = "center";
        ctxt.fillStyle = "rgb(0,0,255)";

        for (const [s, r] of this.atlasTile.rotors) {
            const block = this.getBlock(s);
            if (!block && !this.debugDraw) continue;
            // tile 填充色：由回调按 data/type 决定（game.ts 注入），未设置时用默认值
            ctxt.fillStyle = this.onTileColor?.(block, this.highLightGetD) ?? this.defaultTileColor(block);
            this.localDraw.drawPolygon(this.atlasTile, this.localCamMat.mul(r), this.navigateDraw);
        }
        for (const [s, r] of this.atlasTile.rotors) {
            const block = this.getBlock(s);
            if (!block) {
                if (this.debugDraw) {
                    ctxt.fillStyle = "rgb(0,0,0)";
                    this.localDraw.textTo(this.localCamMat.mul(r).apply(new Hvec), s);
                }
                continue;
            }
            // 文字颜色：由回调决定（game.ts 注入），未设置时用默认值
            ctxt.fillStyle = this.onTextColor?.(block) ?? this.defaultTextColor(block);
            // 显示文本：由回调处理多语言挑选、p/d 解析转 unicode、del/unl 等（game.ts 注入）
            const text = this.onTileText?.(block) ?? tileText(block);
            this.localDraw.textTo(this.localCamMat.mul(r).apply(new Hvec), text);
        }
        ctxt.fillStyle = "rgba(0,0,0,0.2)";
        this.localDraw.drawPlayer();
    }
    hitTest(t: TileHash) {
        // return true;
        const b = this.getBlock(t.join(','));
        if (!b || b.type === TileBlockType.Wall) return false;
        if (b.type === TileBlockType.Road) return true;
        if (b.type === TileBlockType.Reward) {
            this.hitReward(b, t.join(","));
            return true;
        }
        if (b.type === TileBlockType.Gate || b.type === TileBlockType.Ordinal) {
            return this.onPassGate(b.name ?? t.join(','), b, t.join(','));
        }
    }
    hitReward(b: TileBlock, hash: string, isLoading?: boolean) {
        if (!b) return;
        this.onGetReward(b.name ?? hash, b, isLoading);
        // 奖励的后续处理（data.got、type→road）由 game.ts 注入的 onGetReward 回调负责
    }
    setTileByName(tile: string, text: string, type: TileBlockType) {
        const tb = blockMap.get(nameMap.get(tile)!);
        if (!tb) { console.log("no no no!"); return; }
        tb.text = text;
        tb.type = type;
    }
    onPassOrd(hash: string, ord: number[]) {
        genOrdTiles(blockMap, nameMap, this.atlasTile, hash.split(",").map(e => Number(e)), ord);
    }
    updateCharactor(x: number, y: number) {
        x *= 10;
        y *= 10;
        const R = Quaternion.expset(-x, 0, x * 0.05 + 0.001, y, 0, 0.001414);
        this.localDraw.rotorL.mulsl(R[0]).norms();
        this.localDraw.rotorR.mulsr(R[1]).norms();
    }
    rotate(z:number){
        this.localCamMat = Rotor.rotate(z).mul(this.localCamMat).normalize();
    }
    moveCam(x: number, y: number) {
        this.localCamMat = Rotor.move(x, y).mul(this.localCamMat).normalize();
        if (isNaN(this.localCamMat.r + this.localCamMat.x + this.localCamMat.y + this.localCamMat.z)) this.localCamMat = new Rotor();
        this.updateCharactor(x, y);
        const pos = this.localCamMat.conj().apply(new Hvec);
        this.onStateChange();
        const newDomain = this.atlasTile.isInDomain(pos);
        if (newDomain !== -1) {
            const [newHash, dir] = this.atlasTile.getNeighborAndDir(this.currentTile, newDomain, true);
            const hitTest = this.hitTest(newHash);
            if (!hitTest) {
                const normal = this.localCamMat.conj().mul(Rotor.rotate(- Math.PI * 2 * newDomain / this.atlasTile.p)).apply(this.atlasTile.n3);
                const theta = Math.atan2(normal.y, normal.x); const ds = Math.hypot(x, y);
                const xx = Math.cos(theta) * ds - x;
                const yy = Math.sin(theta) * ds - y;
                this.localCamMat = Rotor.move(xx, yy).mul(this.localCamMat);
                this.updateCharactor(xx, yy);
            } else {
                this.onStepToAnotherTile();
                const r = this.atlasTile.getNeighborMatrix(dir, newDomain);
                this.atlasTile.generateRotors(newHash);
                this.localCamMat = this.localCamMat.mul(r);
                this.currentTile = newHash;
            }
        }
    }
}