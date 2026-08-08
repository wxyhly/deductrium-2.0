// ============================================================
// 统一代数表达式系统：所有值均为 AlgebraicNumber，内部支持
// 简单形 a + b·√c 或复合运算树。对外提供统一接口。
// ============================================================
export class Rational {
    num;
    den;
    constructor(num, den = 1) {
        if (den === 0)
            throw new Error('分母不能为零');
        if (den < 0) {
            num = -num;
            den = -den;
        }
        const g = Rational.gcd(Math.abs(num), Math.abs(den));
        this.num = num / g;
        this.den = den / g;
    }
    static gcd(a, b) {
        return b === 0 ? a : Rational.gcd(b, a % b);
    }
    static fromInt(n) { return new Rational(n, 1); }
    static get zero() { return new Rational(0, 1); }
    static get one() { return new Rational(1, 1); }
    add(r) { return new Rational(this.num * r.den + r.num * this.den, this.den * r.den); }
    sub(r) { return new Rational(this.num * r.den - r.num * this.den, this.den * r.den); }
    mul(r) { return new Rational(this.num * r.num, this.den * r.den); }
    div(r) {
        if (r.num === 0)
            throw new Error('除以零');
        return new Rational(this.num * r.den, this.den * r.num);
    }
    neg() { return new Rational(-this.num, this.den); }
    isZero() { return this.num === 0; }
    isPositive() { return this.num > 0; }
    isNegative() { return this.num < 0; }
    toNumber() { return this.num / this.den; }
    equals(r) { return this.num === r.num && this.den === r.den; }
    toString() { return this.den === 1 ? `${this.num}` : `${this.num}/${this.den}`; }
}
/**
 * AlgebraicNumber 统一表示所有代数表达式。
 * - 当 op === 'simple' 时，使用字段 a, b, inner 表示 a + b·√inner。
 * - 其他 op 表示复合运算，使用 left / right 指向子表达式。
 */
export class AlgebraicNumber {
    // 简单形式字段
    a = Rational.zero;
    b = Rational.zero;
    inner = Rational.one;
    // 复合形式字段
    op = 'simple';
    left = null;
    right = null;
    // ---------- 构造函数 ----------
    constructor() { }
    /** 创建简单 a + b·√inner */
    static simple(a, b, inner) {
        const node = new AlgebraicNumber();
        node.op = 'simple';
        node.a = a;
        node.b = b;
        node.inner = inner;
        return node.normalize();
    }
    /** 从有理数创建 */
    static fromRational(r) {
        return AlgebraicNumber.simple(r, Rational.zero, Rational.one);
    }
    static fromInt(n) {
        return AlgebraicNumber.fromRational(Rational.fromInt(n));
    }
    /** 创建平方根 */
    static sqrt(expr) {
        // 如果 expr 是有理数且为完全平方数，直接返回有理数
        if (expr instanceof Rational) {
            if (expr.isZero())
                return AlgebraicNumber.fromRational(Rational.zero);
            const n = Math.round(Math.sqrt(Math.abs(expr.num)));
            const d = Math.round(Math.sqrt(Math.abs(expr.den)));
            if (n * n === Math.abs(expr.num) && d * d === Math.abs(expr.den) && expr.num >= 0) {
                return AlgebraicNumber.fromRational(new Rational(n, d));
            }
            // 无法简化，创建 sqrt(有理数)
            const node = new AlgebraicNumber();
            node.op = 'sqrt';
            node.left = AlgebraicNumber.fromRational(expr);
            return node;
        }
        // expr 是 AlgebraicNumber，如果是简单形式且 b=0，递归取平方根
        if (expr.op === 'simple' && expr.b.isZero()) {
            return AlgebraicNumber.sqrt(expr.a);
        }
        // 一般情况，创建 sqrt(expr)
        const node = new AlgebraicNumber();
        node.op = 'sqrt';
        node.left = expr;
        return node;
    }
    // ---------- 算术运算（返回新 AlgebraicNumber） ----------
    add(other) {
        if (other instanceof Rational)
            other = AlgebraicNumber.fromRational(other);
        return AlgebraicNumber.binary('add', this, other).flatten();
    }
    sub(other) {
        if (other instanceof Rational)
            other = AlgebraicNumber.fromRational(other);
        return AlgebraicNumber.binary('sub', this, other).flatten();
    }
    mul(other) {
        if (other instanceof Rational)
            other = AlgebraicNumber.fromRational(other);
        return AlgebraicNumber.binary('mul', this, other).flatten();
    }
    div(other) {
        if (other instanceof Rational)
            other = AlgebraicNumber.fromRational(other);
        return AlgebraicNumber.binary('div', this, other).flatten();
    }
    neg() {
        const node = new AlgebraicNumber();
        node.op = 'neg';
        node.left = this;
        return node.flatten();
    }
    // ---------- 内部工具 ----------
    static binary(op, left, right) {
        // 当且仅当两个操作数都是简单形式且内层相同时，尝试简化
        if (left.op === 'simple' && right.op === 'simple') {
            const leftInner = left.inner;
            const rightInner = right.inner;
            const sameInner = leftInner instanceof Rational && rightInner instanceof Rational
                ? leftInner.equals(rightInner)
                : leftInner === rightInner;
            if (sameInner) {
                const a1 = left.a, b1 = left.b;
                const a2 = right.a, b2 = right.b;
                const inner = left.inner;
                switch (op) {
                    case 'add':
                        return AlgebraicNumber.simple(a1.add(a2), b1.add(b2), inner);
                    case 'sub':
                        return AlgebraicNumber.simple(a1.sub(a2), b1.sub(b2), inner);
                    case 'mul': {
                        const b1b2 = b1.mul(b2); // Rational
                        const innerAN = inner instanceof Rational
                            ? AlgebraicNumber.fromRational(inner)
                            : inner;
                        // 如果 innerAN 不是简单形式，放弃简化，直接返回复合节点
                        if (innerAN.op !== 'simple')
                            break;
                        // 计算 b1b2 * innerAN，因为 innerAN 是 simple，可以直接构造乘积的中间表达式
                        // b1b2 是有理数，乘以 innerAN.a + innerAN.b·√inner，结果为 (b1b2*innerAN.a) + (b1b2*innerAN.b)·√inner
                        const termA = b1b2.mul(innerAN.a); // Rational
                        const termB = b1b2.mul(innerAN.b); // Rational
                        // 现在 a1a2 + (termA + termB·√inner) = (a1a2 + termA) + termB·√inner
                        const aExpr = a1.mul(a2).add(termA); // Rational
                        const bExpr = a1.mul(b2).add(a2.mul(b1)).add(termB); // Rational (注意这里需要加上 a1b2 + a2b1 和 termB？)
                        // 更正：完整公式是 a = a1a2 + b1b2*c, b = a1b2 + a2b1
                        // termB 已经包含了 b1b2 乘 innerAN.b，所以 b 应为 a1b2 + a2b1 + b1b2 * innerAN.b
                        // 但 innerAN 的 inner 可能与当前 inner 不同，所以不能简单加上 termB！
                        // 因此，如果 innerAN 的 inner 不同，也不能简化。
                        // 需要检查 innerAN.inner 是否等于当前 inner
                        const innerANinner = innerAN.inner;
                        const sameInner2 = (innerANinner instanceof Rational && inner instanceof Rational)
                            ? innerANinner.equals(inner)
                            : innerANinner === inner;
                        if (!sameInner2)
                            break; // 无法简化
                        // 到这里，innerAN 形式为 a' + b'√inner，其中 inner 与当前 inner 相同
                        // 则 term = b1b2 * (a' + b'√inner) = (b1b2*a') + (b1b2*b')·√inner
                        // 所以 a = a1a2 + (b1b2 * a'), b = a1b2 + a2b1 + (b1b2 * b')
                        const finalA = a1.mul(a2).add(b1b2.mul(innerAN.a)); // Rational
                        const finalB = a1.mul(b2).add(a2.mul(b1)).add(b1b2.mul(innerAN.b)); // Rational
                        return AlgebraicNumber.simple(finalA, finalB, inner);
                    }
                    case 'div': {
                        // 分母的共轭
                        const conj = AlgebraicNumber.simple(a2, b2.neg(), inner);
                        const numerator = AlgebraicNumber.simple(a1, b1, inner).mul(conj);
                        const denominator = AlgebraicNumber.simple(a2, b2, inner).mul(conj);
                        // 分母必须是 simple 且 b=0（即有理数）才能继续
                        if (denominator.op === 'simple' && denominator.b.isZero()) {
                            const denomA = denominator.a;
                            if (numerator.op === 'simple') {
                                return AlgebraicNumber.simple(numerator.a.div(denomA), numerator.b.div(denomA), inner);
                            }
                        }
                        // 无法得到简单结果，退回除法节点
                        break;
                    }
                }
            }
        }
        // 所有无法简化的情况：创建复合表达式节点
        const node = new AlgebraicNumber();
        node.op = op;
        node.left = left;
        node.right = right;
        return node;
    }
    /** 简化表达式树（常量折叠、合并简单形式等） */
    flatten() {
        if (this.op === 'simple')
            return this.normalize();
        if (this.op === 'neg' && this.left) {
            const inner = this.left.flatten();
            if (inner.op === 'simple') {
                return AlgebraicNumber.simple(inner.a.neg(), inner.b.neg(), inner.inner);
            }
            return this;
        }
        // 递归展开二元运算
        if (this.left)
            this.left = this.left.flatten();
        if (this.right)
            this.right = this.right.flatten();
        // 尝试常量运算
        const lNum = this.left?.toNumber();
        const rNum = this.right?.toNumber();
        if (lNum !== undefined && rNum !== undefined &&
            this.left && this.right &&
            this.left.op === 'simple' && this.right.op === 'simple' &&
            this.left.b.isZero() && this.right.b.isZero()) {
            // 两个有理数，直接计算为有理数
            const val = new Rational(Math.round((() => {
                switch (this.op) {
                    case 'add': return lNum + rNum;
                    case 'sub': return lNum - rNum;
                    case 'mul': return lNum * rNum;
                    case 'div': return lNum / rNum;
                    default: return 0;
                }
            })() * 1e12), 1000000000000);
            return AlgebraicNumber.fromRational(val);
        }
        return this;
    }
    normalize() {
        if (this.b.isZero()) {
            this.inner = Rational.one;
            return this;
        }
        if (this.inner instanceof Rational && this.inner.isZero()) {
            this.b = Rational.zero;
            this.inner = Rational.one;
        }
        // 如果 inner 是 AlgebraicNumber 且已经是简单形式且 b=0，则直接取其 a
        if (this.inner instanceof AlgebraicNumber && this.inner.op === 'simple' && this.inner.b.isZero()) {
            this.inner = this.inner.a;
        }
        // 不要再次调用 flatten 或其他可能递归的方法
        return this;
    }
    /** 数值近似 */
    toNumber() {
        switch (this.op) {
            case 'simple': {
                const innerVal = this.inner instanceof Rational
                    ? Math.sqrt(this.inner.toNumber())
                    : this.inner.toNumber();
                return this.a.toNumber() + this.b.toNumber() * innerVal;
            }
            case 'add': return (this.left?.toNumber() ?? 0) + (this.right?.toNumber() ?? 0);
            case 'sub': return (this.left?.toNumber() ?? 0) - (this.right?.toNumber() ?? 0);
            case 'mul': return (this.left?.toNumber() ?? 0) * (this.right?.toNumber() ?? 0);
            case 'div': return (this.left?.toNumber() ?? 0) / (this.right?.toNumber() ?? 0);
            case 'neg': return -(this.left?.toNumber() ?? 0);
            case 'sqrt': return Math.sqrt(this.left?.toNumber() ?? 0);
            default: return 0;
        }
    }
    isZero() { return Math.abs(this.toNumber()) < 1e-14; }
    isNegative() { return this.toNumber() < -1e-14; }
    equals(other, tolerance = 1e-12) {
        if (other instanceof Rational)
            other = AlgebraicNumber.fromRational(other);
        return Math.abs(this.toNumber() - other.toNumber()) < tolerance;
    }
    toString() {
        if (this.op === 'simple') {
            const parts = [];
            if (!this.a.isZero())
                parts.push(this.a.toString());
            if (!this.b.isZero()) {
                const bStr = this.b.num === 1 && this.b.den === 1 ? '' :
                    this.b.num === -1 && this.b.den === 1 ? '-' :
                        this.b.toString();
                const innerStr = this.inner.toString();
                parts.push(`${bStr}√(${innerStr})`);
            }
            return parts.length === 0 ? '0' : parts.join(' + ').replace('+ -', '- ');
        }
        if (this.op === 'neg')
            return `-(${this.left?.toString()})`;
        if (this.op === 'sqrt')
            return `√(${this.left?.toString()})`;
        return `(${this.left?.toString()} ${this.op} ${this.right?.toString()})`;
    }
    /** 深拷贝（用于拖拽等场景） */
    clone() {
        if (this.op === 'simple') {
            return AlgebraicNumber.simple(this.a, this.b, this.inner instanceof Rational ? this.inner : this.inner.clone());
        }
        const node = new AlgebraicNumber();
        node.op = this.op;
        node.left = this.left?.clone() ?? null;
        node.right = this.right?.clone() ?? null;
        return node;
    }
}
//# sourceMappingURL=algebra.js.map