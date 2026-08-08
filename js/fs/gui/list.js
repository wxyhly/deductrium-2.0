// import { SyntaxViewer } from "../../astrender.js";
// import { FlatTreeManager, ListNode, ROOT_ID } from "../../listmgr.js";
// import { Deduction, DeductionStep, Proposition } from "../core/deduct.js";
// import { FSParser } from "../core/parser.js";
// export class RuleManager extends FlatTreeManager {
//     constructor(container: HTMLElement, data: ListNode[]) {
//         super({
//             container,
//             data,
//             renderName: (item) => item.name,
//             renderContent: (item) => {
//                 const span = document.createElement('span');
//                 span.classList.add("inner", "ast");
//                 new SyntaxViewer(span, new FSParser, item.content || "", 'rule')
//                 return span;
//             },
//             renderExtra: (item) => {
//                 const colors: Record<string, string> = {
//                     't': '#dbeafe',
//                     'd': '#d1fae5',
//                     'a': '#fef3c7',
//                 };
//                 const bg = colors[item.name[0]??"t"] || '#f1f5f9';
//                 // const label = item.name[0] || '未分类';
//                 const span = document.createElement('span');
//                 span.style.backgroundColor = bg;
//                 span.style.cssText = `background-color: ${bg}; border: 1px solid #d1d9e6; display: inline-block; width: 12px; height: 12px; border-radius: 50%;`;
//                 // span.title = label;
//                 return span;
//             },
//             itemMenuItems: [
//                 { label: '复制', icon: '📋', handler: (id) => { alert('复制功能示例'); } },
//             ],
//             folderMenuItems: [
//                 { label: '导出', icon: '📤', handler: (id) => { alert('导出示例'); } },
//             ],
//             // onRename: (id, newName) => console.log('[定理] 重命名', id, newName),
//             // onDelete: (id) => console.log('[定理] 删除', id),
//             allowDrag: true,
//         });
//     }
//     addRule(rule: Deduction) {
//         this.getDataManager().addNode(ROOT_ID, {
//             name: rule.name.toString(),
//             type: 'item',
//             children: null,
//             content: rule.toString()
//         } as any);
//     }
// }
// export class PropManager extends FlatTreeManager {
//     constructor(container: HTMLElement, data: ListNode[]) {
//         super({
//             container,
//             data,
//             renderName: (item) => item.name || String(item.id),
//             renderContent: (item) => {
//                 const span = document.createElement('span');
//                 span.className = "inner";
//                 new SyntaxViewer(span, new FSParser, FSParser.stringify(item.ast, false), 'wff');
//                 return span;
//             },
//             renderExtra: (it) => {
//                 const item = it as any as Proposition;
//                 const span = document.createElement('span');
//                 let val = "";
//                 if (item.from.type === "h" || item.from.type === "a") val = "hyp";
//                 if (item.from.type === "d") {
//                     const data = item.from.data;
//                     val = `${data.deduction} ${data.conditions.map(p => p.name || p.id).join(" ")}`;
//                 }
//                 new SyntaxViewer(span, new FSParser, val, "cmd");
//                 return span;
//             },
//             itemMenuItems: [
//                 {
//                     label: '复制命令', icon: '🔗', handler: (id) => {
//                         alert('依赖检查示例');
//                     }
//                 },
//             ],
//             folderMenuItems: [
//                 { label: '折叠全部', icon: '📂', handler: (id) => { /* 示例 */ } },
//             ],
//             // onRename: (id, newName) => console.log('[命题] 重命名', id, newName),
//             // onDelete: (id) => console.log('[命题] 删除', id),
//             allowDrag: true,
//         });
//     }
// }
//# sourceMappingURL=list.js.map