import { initialRules } from "./hs/core/initial.js";
import { HSLayer } from "./hs/main.js";
import { LangMgr } from "./lang.js";
import { SaveLoad } from "./saveload.js";
const gameModeURL = window.location.search.substring(1);
const gameMode = gameModeURL === "creative" ? gameModeURL : "survival";

class Game {
    langMgr = new LangMgr;
    hsLayer = new HSLayer;
    saveload = new SaveLoad(gameMode, () => ({
        hs: this.hsLayer.serialize(),
    }), (data) => {
        this.hsLayer.deserialize(data.hs);
    })
    constructor() {
        this.hsLayer.unlockBasicPropCmd();
        this.hsLayer.unlockBasicRuleCmd();
        this.hsLayer.unlockMetaBlock("c");
        this.hsLayer.unlockMetaBlock("v");
        this.hsLayer.unlockMetaBlock("f");

        this.hsLayer.onchange = () => this.saveload.notifySave();
        if (!this.saveload.load()) {
            this.hsLayer.addRules(initialRules);
        }
    }
}
new Game;


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