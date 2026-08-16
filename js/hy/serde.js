import { Rotor } from "./algebra.js";
// 几何层存档：与 hs/serde.ts 组织方式一致
// （Serde 持有 world 引用，serialize 返回对象，deserialize 接收对象并写回）
export class Serde {
    world;
    constructor(world) {
        this.world = world;
    }
    serialize() {
        const w = this.world;
        const thash = w.currentTile.join(",");
        const pos = w.localCamMat;
        // 紧凑字符串：thash:r,x,y,z:ord（便于阅读，扩展字段时放到 p 之外的新 key）
        const p = thash + `:${pos.r.toPrecision(4)},${pos.x.toPrecision(4)},${pos.y.toPrecision(4)},${pos.z.toPrecision(4)}:${w.currentOrd?.join(",") ?? ''}`;
        return { p };
    }
    deserialize(data) {
        if (!data)
            return;
        const w = this.world;
        const [thash, pos, currentOrd] = data.p.split(":");
        w.currentTile = thash ? thash.split(",").map(n => Number(n)) : [];
        w.atlasTile.generateRotors(w.currentTile);
        w.localCamMat = new Rotor(...(pos || "1,0,0,0").split(",").map(n => Number(n)));
        w.currentOrd = currentOrd === "" || currentOrd == null ? [] : currentOrd.split(",").map(n => Number(n));
        w.onLoop();
    }
}
//# sourceMappingURL=serde.js.map