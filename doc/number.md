# 数系

创造模式包含「皮亚诺算数」及「数系 / 自然数、整数、有理数、实数」。规则与证明位于 `src/hs/core/number/`，浏览器产物位于 `js/hs/core/number/`。

## 命令示例

```text
d d37
d dZ-37
d dQ0.125
d dR37
d .3@N
d .2+3
d .2*3
d .+2@Z
d .+2+-3
d .-2*-3
```

前四条生成字面量定义，后六条生成带有实际证明的成员或运算规则。`1`、`+1`、`1q`、`1r` 分属不同数系；有理数、实数提供定义与字面量，未增加自动计算证明。

自然数证明以及整数证明中的自然数坐标、运算中间值受 1000 步后继预算限制，超出时明确报错。字面量定义使用 BigInt，不受此展开预算限制。动态规则在命令重放时重新生成。

## 旧版兼容

保留旧版规则名称及 `dPrime` 的边界定义。实数倒数改用正确的戴德金下分割，负分母分支要求分母非零；有理数序关系 `dQ<=` 的分母乘积与整数零 `+0` 比较。

## 检查

先用 TypeScript 编译器按 `tsconfig.json` 编译，然后依次运行：

```text
node test/number/integration.mjs
node test/number/literals.mjs
node test/number/peano.mjs
node test/number/set.mjs
node test/number/natural-set.mjs
node test/test-set-substitution.mjs
```

全量检查需包括 `test/` 及其子目录中的所有 `.mjs` 测试文件。
