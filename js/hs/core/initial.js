export const initialSurvivalRules = `mp:ax: $1→$2, $1 ⊢ $2;
a1:ax: ⊢$1→$2→$1;
a2:ax: ⊢($1→$2→$3)→($1→$2)→($1→$3);`;
export const initialCreativeRules = `
{ [zh]逻辑 [en]Logic
    { [zh]逻辑公理 [en]Logic Axioms
        mp:ax: $1→$2, $1 ⊢ $2;
        a1:ax: ⊢$1→$2→$1;
        a2:ax: ⊢($1→$2→$3)→($1→$2)→($1→$3);
        a3:ax: ⊢(¬$1→¬$2)→($2→$1);
        a4:ax: ⊢∀$x:$→#sb($,$x,$A);
        a5:ax: ⊢∀$x:($1→$2)→∀$x:$1→∀$x:$2;
        a6:ax: #nf($,$x) ⊢ $→∀$x:$;
        a7:ax: ⊢$A=$A;
        a8:ax: ⊢$A=$B→#sb($,$x,$A)→#sb($,$x,$B);
    }
    { [zh]逻辑符号定义 [en]Symbol Definitions
        d<>1:ax: ⊢($1↔$2)→¬(($1→$2)→¬($2→$1));
        d<>2:ax: ⊢¬(($1→$2)→¬($2→$1))→($1↔$2);
        d\\/:ax: ⊢$1∨$2↔(¬$1→$2);
        d/\\:ax: ⊢$1∧$2↔¬($1→¬$2);
        d\\e:ax: ⊢∃$x:$↔¬∀$x:¬$;
        d\\e!:ax: #nf($,$y),#dt($x $y)⊢∃!$x:$↔∃$y:∀$x:($↔$x=$y);
        d\\ab:ax: ⊢∀$x∈$A:$↔∀$x:($x∈$A→$);
        d\\eb:ax: ⊢∃$x∈$A:$↔∃$x:($x∈$A∧$);  
        d\\e!b:ax: ⊢∃!$x∈$A:$↔∃!$x:($x∈$A∧$);
    }

    { [zh]内置宏 [en]Builtin Macros
        .i:⊢$→$; a1 $ $; a1 $ $→$; a2 $ $→$ $; mp 3 2; mp 4 1;
        .t:$1→$2,$2→$3⊢$1→$3;cond $1;d mp 1 3;d mp 2 4;
        .cs:$1→$2→$3⊢$2→$1→$3;cond $2;cond $1;d mp 1 3;d mp 4 2;
        .ne:⊢¬¬$→$;cond ¬¬$;d <a1 1 ¬¬¬¬$;d <a3 2;d <a3 3;d mp 4 1;
        .ni:⊢$→¬¬$;d .ne ¬$;d <a3 1;
        .m:⊢¬$1→$1→$2;d a1 ¬$1 ¬$2;d c<a3 1;
        .a30:⊢($1→$2)→¬$2→¬$1;d .ne $1;d .ni $2;d a3 ¬$1 ¬$2;cond $1→$2;d .t 1 4;d .t 5 2;d mp 3 6;
        .a31:⊢(¬$1→$2)→¬$2→$1;d .i ¬$1→$2;d .ni $2;d <a1 2 ¬$1→$2;d c.t 1 3;d a3 $1 ¬$2;d .t 4 5;
        .a32:⊢($1→¬$2)→$2→¬$1;d .a30 $1 ¬$2;d c.ni $1→¬$2 $2;d c.t 2 1;
        .mn:⊢(¬$1→$1)→$1;cond ¬$1→$1;cond ¬$1;d mp 1 2;d .m $1 ¬(¬$1→$1);d mp 4 2;d mp 5 3;cd 1;d a3 $1 ¬$1→$1;d mp 7 6;d mp 8 1;
        .m1:¬$1→¬$2,¬$1→$2⊢$1;d <.a31 2;d .t 1 3;d <.mn 4;
        .m2:$1→$2,¬$1→$2⊢$2;d <.a30 1;d <.a31 2;d .m1 3 4;
        .>n:$1,¬$2⊢¬($1→$2);cond $1→$2;d mp 3 1;cd 0;d <.a30 4;d mp 5 2
        .m&:$1,$2⊢¬($1→¬$2);cond $1→¬$2;d <a1 2 ¬¬$1;d .t(.ne) 3;d .m1 5 4;cd 0;d <.a32 6;d mp 7 1;
        .m&1:⊢¬($1→$2)→$1;cond ¬($1→$2);d .a31 $1 $1→$2;d .m $1 $2;d mp 2 3;d mp 4 1;
        .m&2:⊢¬($1→$2)→¬$2;cond ¬($1→$2);cond $2;d a1 $2 $1;d mp 3 2;d .m $1→$2 ¬$2;d mp 5 1;d mp 6 4;cd 1;d .i ¬$2;d .m2 7 8;
        .<>:$1→$2,$2→$1⊢$1↔$2;d .m& 1 2;d mp(d<>2) 3;
        .<>1:⊢($1↔$2)→$1→$2;d .m&1 $1→$2 ¬($2→$1);d .t(d<>1) 1;
        .<>2:⊢($1↔$2)→$2→$1;d .m&2 $1→$2 ¬($2→$1);d c<.ne 1;d .t(d<>1) 2;
        .<>i:⊢$↔$;d .i $;d .<> 1 1;
        .<>s:$0↔$1⊢$1↔$0;d <.<>1 1;d <.<>2 1;d .<> 3 2;
        .<>t:$1↔$2,$2↔$3⊢$1↔$3;.t(<.<>1,<.<>1) 1 2;.t(<.<>2,<.<>2) 2 1;.<> 3 4;
        .TT<>:$1,$2⊢$1↔$2;d <a1 1 $2;d <a1 2 $1;d .<> 4 3;
        .FF<>:¬$1,¬$2⊢$1↔$2;d <a1 1 ¬$2;d <a1 2 ¬$1;d .<>(<a3,<a3) 3 4;
        .TF<>:$1,¬$2⊢¬($1↔$2);cond $1↔$2;d <<.<>1 3 1;cd 0;d <.a30 4;d mp 5 2;
        .FT<>:¬$1,$2⊢¬($1↔$2);cond $1↔$2;d <<.<>2 3 2;cd 0;d <.a30 4;d mp 5 1;
        ./\\:$1,$2⊢$1∧$2;d .m& 1 2;d <<.<>2(d/\\) 3;
        ./\\1:$1∧$2⊢$1;d <<.<>1(d/\\) 1;d <.m&1 2;
        ./\\2:$1∧$2⊢$2;d <<.<>1(d/\\) 1;d <.m&2 2;d <.ne 3;
        .\\/1:$1⊢$1∨$2;d a1 ¬¬$1 ¬$2;d c<a3 2;d .t(.ni) 3;d mp 4 1;d <<.<>2(d\\/) 5
        .\\/2:$2⊢$1∨$2;d <a1 1 ¬$1;d <<.<>2(d\\/) 2
        .\\/n:¬$1,¬$2⊢¬($1∨$2);d .>n 1 2;d <<.a30(>:<<.<>1(d\\/)) 3
        .<>r>:$1a↔$1b,$2a↔$2b⊢($1a→$2a)↔($1b→$2b);cond $1a→$2a;.t(<.<>2) 1 3;.t(#,<.<>1) 4 2;cd 0;cond $1b→$2b;.t(<.<>1) 1 6;.t(#,<.<>2) 7 2;cd 0;.<> 5 8;
        .<>r~:$1a↔$1b⊢¬$1a↔¬$1b;<.a30(<.<>1) 1;<.a30(<.<>2) 1;.<> 3 2;
        .<>r/\\:$1a↔$1b,$2a↔$2b⊢$1a∧$2a↔$1b∧$2b;cond $1a∧$2a;./\\1 3;./\\2 3;<<.<>1 1 4;<<.<>1 2 5;./\\ 6 7;cd 0;cond $1b∧$2b;./\\1 9;./\\2 9;<<.<>2 1 10;<<.<>2 2 11;./\\ 12 13;cd 0;.<> 8 14;
        .<>r\\/:$1a↔$1b,$2a↔$2b⊢$1a∨$2a↔$1b∨$2b;mcpt ($1a↔$1b)→($2a↔$2b)→$1a∨$2a↔$1b∨$2b;mp 3 1;mp 4 2;
        .<>r<>:$1a↔$1b,$2a↔$2b⊢($1a↔$2a)↔($1b↔$2b);mcpt ($1a↔$1b)→($2a↔$2b)→($1a↔$2a)↔$1b↔$2b;mp 3 1;mp 4 2;
        .<>r\\a:∀$x:($1a↔$1b)⊢∀$x:$1a↔∀$x:$1b;v<.<>1 1;v<.<>2 1;.<>(<a5,<a5) 2 3;
        .=s:$A=$B⊢$B=$A;<a8 1 #=$A #;mp(#,a7) 2;
        .\\acn:#nf($,$b),∀$a:$⊢∀$b:#sb($,$a,$b);<a6 2 $b;v<a4 3 $b;
        .\\acn<>:#nf($,$b)⊢∀$a:$↔∀$b:#sb($,$a,$b);>.\\acn $a $ $b;>.\\acn $b #sb($,$a,$b) $a;.<> 2 3;
    }
}
{ [zh]ZFC集合论 [en]ZFC Set Theory
    { [zh]ZFC公理 [en]ZFC Axioms
        aext:ax: ⊢∀x:∀y:(∀z:(z∈x↔z∈y)→x=y);
        asep:ax: #nf($0,$y),#dt($x $y $z)⊢∀$x:∃$y:∀$z:($z∈$y↔$z∈$x∧$0);
        apair:ax: ⊢∀x:∀y:∃z:(x∈z∧y∈z);
        aunion:ax: ⊢∀x:∃a:∀y:∀z:(z∈y→y∈x→z∈a);
        apow:ax: ⊢∀x:∃y:∀z:(z⊂x→z∈y);
        arepl:ax: #nf($0,$y),#dt($x $y $z)⊢∀$x:∃$y:∀$z:($0→$z=$y)→∀$y:∃$x:∀$z:($z∈$x↔∃$x:($x∈$y∧$0));
        ainf:ax: ⊢∃x:({}∈x∧∀y:(y∈x→y∪{y}∈x));
        areg:ax: ⊢∀x:(¬x={}→∃y:(y∈x∧y∩x={}));
        achoice:ax: ⊢∀x:∃y:∀z:∀w:(z∈w∧w∈x→∃v:∀u:(∃t:(u∈w∧w∈t∧(u∈t∧t∈y))↔u=v));
    }
    { [zh]集合符号定义 [en]Symbol Definitions
        d{}:ax: ⊢∀x:¬x∈{};
        d{.}:ax: ⊢$A∈{$B}↔$A=$B;
        d{..}:ax: ⊢$A∈{$B,$C}↔$A=$B∨$A=$C;
        dpair:ax: ⊢($A,$B)={{$A},{$A,$B}};
        dpr:ax: ⊢∃$x:∃$y:$A=($x,$y)→$A=(pr1($A),pr2($A));
        d\\c:ax: #nf($A,$x),#nf($B,$x)⊢$A⊂$B↔∀$x:($x∈$A→$x∈$B);
        dunion:ax: #nf($A,$x),#nf($B,$x)⊢$A∈union($B)↔∃$x:($A∈$x∧$x∈$B);
        d\\u:ax: ⊢$A∈$B∪$C↔$A∈$B∨$A∈$C;
        d\\i:ax: ⊢$A∈$B∩$C↔$A∈$B∧$A∈$C;
        dpow:ax: ⊢$A∈pow($B)↔$A⊂$B;
        dsep:ax: #nf($A,$x)⊢$x∈{$x∈$A|$}↔$x∈$A∧$;
        drepl:ax: #nf($A,$x),#nf($C,$x)⊢$A∈{$B|$x∈$C}↔∃$x:($x∈$C∧$B=$A);
        d\\\\:ax: #nf($A,$x),#nf($B,$x)⊢$A＼$B={$x∈$A|¬$x∈$B};
        d\\x:ax: #nf($A,$x $y),#nf($B,$x $y),#dt($x $y)⊢$A×$B=union({{($x,$y)|$y∈$B}|$x∈$A});
        d\\o:ax: ⊢∀n:(n∈ω↔∀x:({}∈x∧∀y:(y∈x→y∪{y}∈x)→n∈x));
    }
}
{ [zh]NBG集合论 [en]NBG Theory
    { [zh]集合符号定义 [en]Symbol Definitions
        dn\\a:ax: #nf($,$y),#dt($x $y)⊢∀ₛ$x:$↔∀$x:(∃$y:$x∈$y→$);
        dn\\e:ax: #nf($,$y),#dt($x $y)⊢∃ₛ$x:$↔∃$x:(∃$y:$x∈$y∧$);
        dn\\e!:ax: #nf($,$y),#dt($x $y)⊢∃!ₛ$x:$↔∃!$x:(∃$y:$x∈$y∧$);
        dn\\c:ax: #nf($A,$x),#nf($B,$x)⊢$A⊂$B↔∀$x:($x∈$A→$x∈$B);
        dnSet:ax:#nf($A,$x)⊢Set($A)↔∃$x:$A∈$x;
        dn{..}:ax: ⊢∀ₛx:∀ₛy:∀ₛu:(u∈{x,y}↔u=x∨u=y);
        dn{.}:ax: ⊢{$A,$A}={$A};
        dnpair:ax: ⊢∀ₛx:∀ₛy:(x,y)={{x},{x,y}};
        dnpair3:ax: ⊢∀ₛx:∀ₛy:∀ₛz:(x,y,z)=((x,y),z);
        dn.E:ax: ⊢∀ₛz:(z∈.E↔∃ₛx:∃ₛy:(x∈y∧z=(x,y)));
        dndom:ax: ⊢∀x:∀ₛy:(y∈dom(d)↔∃ₛy:(x,y)∈x);
        dn.U:ax: ⊢.U=dom(.E);
        dn\\\\:ax: ⊢∀x:∀y:∀ₛu:(u∈x＼y↔u∈x∧¬u∈y);
        dn\\i:ax: ⊢$A∩$B=$A＼($A＼$B);
        dn\\u:ax: ⊢$A∪$B=.U＼((.U＼$A)∩(.U＼$B));
        dn{}:ax: ⊢{}=.U＼.U;
        dn\\x:ax: ⊢∀x:∀y:∀ₛu:(u∈x×y↔∃v∈x:∃w∈y:u=(v,w));
        dn..U:ax: ⊢..U=.U×.U;
        dn...U:ax: ⊢...U=..U×.U;
        dnRel:ax: ⊢Rel($R)↔$R⊂..U;
        dninv:ax: ⊢∀x:∀ₛp:(p∈inv(x)↔∃ₛu:∃ₛv:((u,v)∈x∧p=(v,u)));
        dncycl:ax: ⊢∀x:∀ₛt:(t∈cycl(x)↔∃ₛu:∃ₛv:∃ₛw:((u,v,w)∈x∧t=(w,u,v)));
        dnunion:ax: ⊢union($A)=dom(.E∩(.U×$A));
        dnintsc:ax: ⊢intsc($A)=.U＼dom((.U×$A)＼.E);
        dnpow:ax: ⊢pow($A)=.U＼dom(inv(.E)＼(.U×$A));
        dnFn:ax: ⊢Fn($F)↔Rel($F)∧∀xa:∀ya:∀xb:∀yb:((xa,ya)∈$F→(xb,yb)∈$F→xa=xb→ya=yb);
        dnapply:ax: ⊢$x∈dom($F)→($x,apply($F,$x))∈$F;
        dnimage:ax:⊢∀fn:∀ₛx:∀ₛa:(a∈image(fn,x)↔∃z∈x:(z,a)∈fn);
    }
    { [zh]NBG公理 [en]NBG Axioms
        anext:ax: ⊢∀x:∀y:(∀z:(z∈x↔z∈y)→x=y);
        anpair:ax: ⊢∀ₛx:∀ₛy:∃ₛz:∀ₛu:(u∈z↔u=x∨u=y);
        anmem:ax: ⊢∃e:∀ₛz:(z∈e↔∃ₛx:∃ₛy:(x∈y∧z=(x,y)));
        andom:ax: ⊢∀x:∃d:∀ₛy:(y∈d↔∃ₛy:(x,y)∈x);
        andiff:ax: ⊢∀x:∀y:∃z:∀ₛu:(u∈z↔u∈x∧¬u∈y);
        anprod:ax: ⊢∀x:∀y:∃z:∀ₛu:(u∈z↔∃v∈x:∃w∈y:u=(v,w));
        aninv:ax: ⊢∀x:∃y:∀ₛp:(p∈y↔∃ₛu:∃ₛv:((u,v)∈x∧p=(v,u)));
        ancycl:ax: ⊢∀x:∃y:∀ₛt:(t∈y↔∃ₛu:∃ₛv:∃ₛw:((u,v,w)∈x∧t=(w,u,v)));
        anrepl:ax: ⊢∀ₛx:∀fn:(Fn(fn)→Set(image(fn,x)));
        anunion:ax: ⊢∀ₛx:Set(union(x));
        anpow:ax: ⊢∀ₛx:Set(pow(x));
        aninf:ax: ⊢∃x∈.U:({}∈x∧∀n:(n∈x→n∪{n}∈x));
        anfond:ax: ⊢∀x∈.U:(¬x={}→∃y∈x:∀z∈y:¬z∈x);
        angchoice:ax: ⊢∃fn:(Fn(fn)∧∀x∈.U:(¬x={}→∃y∈x:(x,y)∈fn));
    }
}
`;
//# sourceMappingURL=initial.js.map