
export const initialRules =
    `
// folder Prop. Logic Axioms:
mp:ax: $1→$2, $1 ⊢ $2;
a1:ax: ⊢$1→$2→$1;
a2:ax: ⊢($1→$2→$3)→($1→$2)→($1→$3);
a3:ax: ⊢(¬$1→¬$2)→($2→$1);
// end 
// folder 1st Order Logic Axioms:
a4:ax: ⊢∀$x:$→#sb($,$x,$A);
a5:ax: ⊢∀$x:($1→$2)→∀$x:$1→∀$x:$2;
a6:ax: #nf($,$x) ⊢ $→∀$x:$;
a7:ax: ⊢$A=$A;
a8:ax: ⊢$A=$B→#sb($,$x,$A)→#sb($,$x,$B);
// end
d<>1:ax: ⊢($1↔$2)→¬(($1→$2)→¬($2→$1));
d<>2:ax: ⊢¬(($1→$2)→¬($2→$1))→($1↔$2);
d\\/:ax: ⊢$1∨$2↔(¬$1→$2);
d/\\:ax: ⊢$1∧$2↔¬($1→¬$2);
d\\e:ax: ⊢∃$x:$↔¬∀$x:¬$;

// apn1: |-\\ax:~s(x)=0;
// apn2: |-\\ax:\\ay:(s(x)=s(y)>x=y);
// apn3: |-#sb($0,$x,0)>\\a$n:(#sb($0,$x,$n)>#sb($0,$x,s($n)))>\\a$n:#sb($0,$x,$n);
// aext: |-\\ax:\\ay:(\\az:(z@x<>z@y)>x=y);
// apair: |-\\ax:\\ay:\\ez:(x@z/\\y@z);
// d\\a@: |-\\a@$x:$0<>\\a$x:(\\e$y:$x@$y>$0);
// d\\e@: |-\\e@$x:$0<>\\e$x:(\\e$y:$x@$y/\\$0);
// anbgpair: |-\\a@x:\\a@y:\\e@z:(x@z/\\y@z);

.i:⊢$→$; a1 $ $; a1 $ $→$; a2 $ $→$ $; mp 3 2; mp 4 1;
.t:$1→$2,$2→$3⊢$1→$3; hyp $1→$2;hyp $2→$3;cond $1;d mp 1 3;d mp 2 4;

`