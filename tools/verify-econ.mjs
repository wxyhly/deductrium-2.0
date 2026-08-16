// 复刻 game.ts 的经济/门逻辑测试（payD/getD/dG拆门/步数）
const LangMgr = {
    lang: "zh",
    formalize: {
        payDWarning: (needed, has, hasDg) => `进入此门将消耗${needed}推理素，您只有${has}推理素，确认要继续吗？${hasDg ? "" : "注意，退出后重新进入门会重复扣钱！"}`,
    },
};
const TileBlockType = { Road: 0, Wall: 1, Gate: 2, Reward: 3, Ordinal: 4 };
function stringifyDeductriumAmout(n) {
    const absn = Math.abs(n);
    if (absn >= 1e12) return n / 1e12 + "T";
    if (absn >= 1e9) return n / 1e9 + "kg";
    if (absn >= 1e6) return n / 1e6 + "g";
    if (absn >= 1e3) return n / 1e3 + "mg";
    return n + "µg";
}

// 模拟 Game 状态
const state = {
    deductrium: 1000,       // 1mg
    deductriumConsumed: 0,
    tilesParcour: 0,
    gotRewards: new Set(),
    destructedGates: new Set(),
};

function addDeductrium(amount) {
    state.deductrium += amount;
    console.log(`  推理素: ${stringifyDeductriumAmout(state.deductrium)} (变化 ${amount >= 0 ? "+" : ""}${stringifyDeductriumAmout(amount)})`);
}

function onGetReward(hash, block, isLoading) {
    block.data ??= {};
    block.data.got = true;
    state.gotRewards.add(block.name || hash);
    if (block.type === TileBlockType.Reward) block.type = TileBlockType.Road;
    if (!isLoading && block.data.getD !== undefined) {
        addDeductrium(block.data.getD);
    }
}

function onPassGate(name, tile, hash) {
    const gateTest = () => {
        const data = tile.data ?? {};
        if (data.payD !== undefined) {
            const needed = data.payD;
            if (state.deductrium < needed) return false;
            if (state.deductrium < needed * 2) {
                if (!confirm(LangMgr.formalize.payDWarning(stringifyDeductriumAmout(needed), stringifyDeductriumAmout(state.deductrium), state.gotRewards.has("dG")))) return false;
            }
            state.deductriumConsumed += needed;
            addDeductrium(-needed);
            return true;
        }
        return false;
    };
    if (!gateTest()) return false;
    if (state.gotRewards.has("dG") && tile.type !== TileBlockType.Ordinal) {
        tile.data ??= {};
        tile.data.del = true;
        tile.type = TileBlockType.Road;
        state.destructedGates.add(name || hash);
    }
    return true;
}

// ===== 测试 1：getD 加钱（游戏中） =====
console.log("=== getD 游戏中领取 ===");
const reward = { name: "r1", type: TileBlockType.Reward, data: { getD: 100 } };
onGetReward("h1", reward, false);
console.log("  领取后 deductrium:", stringifyDeductriumAmout(state.deductrium), "(应 1.1mg)");

// ===== 测试 2：getD 加载存档不加钱 =====
console.log("=== getD 加载存档（isLoading） ===");
const reward2 = { name: "r2", type: TileBlockType.Reward, data: { getD: 5000 } };
onGetReward("h2", reward2, true);
console.log("  加载后 deductrium:", stringifyDeductriumAmout(state.deductrium), "(应仍 1.1mg)");

// ===== 测试 3：payD 余额不足 =====
console.log("=== payD 余额不足 ===");
state.deductrium = 10;
const gate1 = { name: "g1", type: TileBlockType.Gate, data: { payD: 50 } };
console.log("  过门:", onPassGate("g1", gate1, "h3"), "(应 false)");

// ===== 测试 4：payD 余额充足但不足2倍（confirm 模拟确认） =====
console.log("=== payD 需确认（无 dG） ===");
state.deductrium = 80;
globalThis.confirm = () => true;
const gate2 = { name: "g2", type: TileBlockType.Gate, data: { payD: 50 } };
console.log("  警告文案:", LangMgr.formalize.payDWarning("50µg", "80µg", false));
console.log("  过门:", onPassGate("g2", gate2, "h4"), "(应 true)");
console.log("  扣费后 deductrium:", stringifyDeductriumAmout(state.deductrium), "consumed:", stringifyDeductriumAmout(state.deductriumConsumed));

// ===== 测试 5：confirm 拒绝 =====
console.log("=== payD 确认被拒 ===");
state.deductrium = 80;
globalThis.confirm = () => false;
const gate3 = { name: "g3", type: TileBlockType.Gate, data: { payD: 50 } };
console.log("  过门:", onPassGate("g3", gate3, "h5"), "(应 false，不扣费)");
console.log("  deductrium:", stringifyDeductriumAmout(state.deductrium));

// ===== 测试 6：dG 拆门 =====
console.log("=== dG 拆门 ===");
state.gotRewards.add("dG");
state.deductrium = 100;
const gate4 = { name: "g4", type: TileBlockType.Gate, data: { payD: 10 } };
console.log("  过门:", onPassGate("g4", gate4, "h6"), "(应 true)");
console.log("  门 data.del:", gate4.data.del, "type:", gate4.type, "destructedGates:", [...state.destructedGates]);

// ===== 测试 7：Ordinal 门不拆 =====
console.log("=== Ordinal 门不拆 ===");
const ord = { name: "O1", type: TileBlockType.Ordinal, data: {} };
console.log("  过序数门（无判定分支返回 false）:", onPassGate("O1", ord, "h7"));

// ===== 测试 8：步数 =====
console.log("=== 步数 ===");
state.tilesParcour += 5;
console.log("  累计步数:", state.tilesParcour);
