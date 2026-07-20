import { FSParser } from "./fs/core/parser.js";
import { SyntaxEditor } from "./astrender.js";
import { test } from "./fs/core/assert.js";
import { TypeParser } from "./tt/parser.js";
import { PropositionManager, TheoremManager } from "./fs/gui/list.js";
import { loadFSGui } from "./fs/gui/cmd.js";
const initialCode1 = `(∀ₛa: (DdkCut(a) ↔ ((((¬(a = {}) ∧ ¬(a = ℚ)) ∧ (((ℚ＼ a) ∪ a) = ℚ)) ∧ (∀x: (∀y: ((x ∈ a) → ((y ∈ (ℚ＼ a)) → ((x ≤ y) ∧ ¬(x = y))))))) ∧ ¬(∃x: ((x ∈ a) ∧ (∀y: ((y ∈ a) → (x = y))))))))`;
const initialCode2 = `\\lx:x y.x y`;
const initialD =
    `axiom mp: $1>$2, $1 |- $2;
axiom a1: |-$1→$2→$1;
`.split("\n").map(e => ({
        id: e.match(/^[a-z]+\s+([^\s\:]+)/)?.[1],
        name: e.match(/^[a-z]+\s+([^\s\:]+)/)?.[1],
        content: e.match(/\:\s*([^\;]\;)*([^\;]+);$/)?.[2],
        type: 'item'
    }));
const editor1 = new SyntaxEditor(document.getElementById('deduct-editor')!, new FSParser, initialCode1, 'wff');
const editor2 = new SyntaxEditor(document.getElementById('type-editor')!, new TypeParser, initialCode2);
const theoremManager = new TheoremManager(document.getElementById('theoremManager')!, initialD as any);
const propManager = new PropositionManager(document.getElementById('propositionManager')!);
loadFSGui()
test();


// axiom a2: |-($1→$2→$3)→($1→$2)→($1→$3);
// axiom a3: |-(¬$1→¬$2)→($2→$1);
// axiom a4: |-∀$x:$0→#sb($0,$x,$A);
// axiom a5: |-∀$x:($0→$1)→∀$x:$0→∀$x:$1;
// axiom a6: |-$0→∀$x:$0;
// axiom a7: |-$A=$A;
// axiom a8: |-$A=$B→#sb($0,$x,$A)→#sb($0,$x,$B);
// axiom d<>1: |-($0<>$1)>~(($0>$1)>~($1>$0));
// axiom d<>2: |-~(($0>$1)>~($1>$0))>($0<>$1);
// axiom d|: |-$0\\/$1<>(~$0>$1);
// axiom d&: |-$0/\\$1<>~($0>~$1);
// axiom d\\e: |-\\e$x:$1<>~\\a$x:~$1;
// axiom apn1: |-\\ax:~s(x)=0;
// axiom apn2: |-\\ax:\\ay:(s(x)=s(y)>x=y);
// axiom apn3: |-#sb($0,$x,0)>\\a$n:(#sb($0,$x,$n)>#sb($0,$x,s($n)))>\\a$n:#sb($0,$x,$n);
// axiom aext: |-\\ax:\\ay:(\\az:(z@x<>z@y)>x=y);
// axiom apair: |-\\ax:\\ay:\\ez:(x@z/\\y@z);
// axiom d\\a@: |-\\a@$x:$0<>\\a$x:(\\e$y:$x@$y>$0);
// axiom d\\e@: |-\\e@$x:$0<>\\e$x:(\\e$y:$x@$y/\\$0);
// axiom anbgpair: |-\\a@x:\\a@y:\\e@z:(x@z/\\y@z);