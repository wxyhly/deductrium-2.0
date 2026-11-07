import { HWorld } from "./hworld.js";
import { Serde } from "./serde.js";
export class HyLayer {
    canvas = document.getElementById("hyper");
    world = new HWorld(this.canvas, true);
    serde = new Serde(this.world);
    onchange;
    moveSpeed = 0.5;
    touchSpeed = 0.1;
    needUpdate = false;
    keyDowns;
    prevTime = new Date().getTime();
    touchDx = 0;
    touchDy = 0;
    active = true;
    outside = false;
    touchStartX = 0;
    touchStartY = 0;
    blur() {
        this.keyDowns.clear();
    }
    constructor() {
        window.addEventListener("deductrium-theme-change", () => {
            this.needUpdate = true;
        });
        window.onresize = () => { this.onresize(); };
        this.onresize();
        this.keyDowns = new Set;
        this.canvas.addEventListener("mousemove", ev => {
            if (!(ev.buttons & 1))
                return;
            if (this.outside) {
                const startX = ev.offsetX - ev.movementX;
                const startY = ev.offsetY - ev.movementY;
                const centerX = this.canvas.width / 2 / window.devicePixelRatio;
                const centerY = this.canvas.height / 2 / window.devicePixelRatio;
                this.world.rotate(Math.atan2(startY - centerY, startX - centerX) - Math.atan2(ev.offsetY - centerY, ev.offsetX - centerX));
            }
            else
                this.world.moveCam(-ev.movementX / 1000, ev.movementY / 1000);
            this.needUpdate = true;
        });
        const isControl = (target) => target instanceof Element &&
            target.closest('input, textarea, select, button, [contenteditable]:not([contenteditable="false"])');
        const releaseControlFocus = () => {
            const control = document.activeElement;
            if (control instanceof HTMLElement && isControl(control))
                control.blur();
        };
        document.addEventListener("focusin", ev => {
            if (isControl(ev.target))
                this.keyDowns.clear();
        });
        document.addEventListener("keydown", ev => {
            if (isControl(ev.target)) {
                this.keyDowns.clear();
                return;
            }
            this.keyDowns.add(ev.code);
        });
        document.addEventListener("keyup", ev => {
            this.keyDowns.delete(ev.code);
        });
        document.addEventListener("blur", ev => {
            this.keyDowns.clear();
        });
        this.canvas.addEventListener("mousedown", ev => {
            // if (ev.button !== 2) return;
            releaseControlFocus();
            ev.preventDefault();
            ev.stopPropagation();
            this.outside = this.world.localDraw.hitTestPoincareDisk(ev.offsetX, ev.offsetY);
            this.needUpdate = true;
        });
        this.canvas.addEventListener("touchstart", ev => {
            releaseControlFocus();
            ev.preventDefault();
            ev.stopPropagation();
            this.touchStartX = ev.targetTouches[0].clientX;
            this.touchStartY = ev.targetTouches[0].clientY;
            this.outside = this.world.localDraw.hitTestPoincareDisk(ev.targetTouches[0].clientX - this.canvas.getBoundingClientRect().left, ev.targetTouches[0].clientY - this.canvas.getBoundingClientRect().top);
        });
        // 面板 #panel-0 尚未引入新界面，元素不存在时跳过 prettyPrint 开关绑定
        const prettyPrintInput = document.querySelector("#panel-0 input");
        if (prettyPrintInput) {
            prettyPrintInput.onfocus = () => prettyPrintInput.blur();
            prettyPrintInput.addEventListener('change', (e) => {
                this.world.prettyPrint = !prettyPrintInput.checked;
                this.needUpdate = true;
            });
        }
        this.canvas.addEventListener("touchmove", ev => {
            ev.preventDefault();
            ev.stopPropagation();
            this.touchDx = ev.targetTouches[0].clientX - this.touchStartX;
            this.touchDy = ev.targetTouches[0].clientY - this.touchStartY;
            if (this.outside) {
                this.touchStartX = ev.targetTouches[0].clientX;
                this.touchStartY = ev.targetTouches[0].clientY;
            }
        });
        this.canvas.addEventListener("contextmenu", ev => {
            ev.preventDefault();
            ev.stopPropagation();
            return false;
        });
        // 移动/换格后通知存档（防抖由 SaveLoad.notifySave 处理）
        this.world.onStateChange = () => this.onchange?.();
        this.world.onStepToAnotherTile = () => this.onchange?.();
        this.mainLoop(1 / 60);
    }
    serialize() { return this.serde.serialize(); }
    deserialize(data) {
        this.serde.deserialize(data);
        this.needUpdate = true;
    }
    onresize() {
        if (!this.canvas.clientHeight || !this.canvas.clientWidth)
            return;
        this.canvas.width = this.canvas.clientWidth * window.devicePixelRatio;
        this.canvas.height = this.canvas.clientHeight * window.devicePixelRatio;
        this.world.onLoop();
    }
    mainLoop(deltaTime) {
        if (this.active) {
            if (this.touchDx || this.touchDy) {
                if (this.outside) {
                    const centerX = this.canvas.width / 2 / window.devicePixelRatio;
                    const centerY = this.canvas.height / 2 / window.devicePixelRatio;
                    const startX = this.touchStartX - this.canvas.getBoundingClientRect().left;
                    const startY = this.touchStartY - this.canvas.getBoundingClientRect().top;
                    const endX = startX + this.touchDx;
                    const endY = startY + this.touchDy;
                    this.world.rotate(Math.atan2(startY - centerY, startX - centerX) - Math.atan2(endY - centerY, endX - centerX));
                }
                else
                    this.world.moveCam(this.touchSpeed * this.touchDx / this.canvas.width, -this.touchSpeed * this.touchDy / this.canvas.width);
                this.touchDx = 0;
                this.touchDy = 0;
                this.needUpdate = true;
            }
            if (this.keyDowns.has("KeyW") || this.keyDowns.has("ArrowUp")) {
                this.world.moveCam(0, this.moveSpeed * deltaTime);
                this.needUpdate = true;
            }
            if (this.keyDowns.has("KeyS") || this.keyDowns.has("ArrowDown")) {
                this.world.moveCam(0, -this.moveSpeed * deltaTime);
                this.needUpdate = true;
            }
            if (this.keyDowns.has("KeyA") || this.keyDowns.has("ArrowLeft")) {
                this.world.moveCam(-this.moveSpeed * deltaTime, 0);
                this.needUpdate = true;
            }
            if (this.keyDowns.has("KeyD") || this.keyDowns.has("ArrowRight")) {
                this.world.moveCam(this.moveSpeed * deltaTime, 0);
                this.needUpdate = true;
            }
            if (this.needUpdate) {
                this.world.onLoop();
                this.needUpdate = false;
            }
        }
        const newDt = (new Date().getTime() - this.prevTime) / 1000;
        window.requestAnimationFrame(() => { this.mainLoop(Math.min(newDt, 0.3)); });
        this.prevTime = new Date().getTime();
    }
}
//# sourceMappingURL=gui.js.map