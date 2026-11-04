import { peanoTheorems } from "./peano-proofs.js";
import { naturalSetBridgeTheorems, integerSetTheorems } from "./number-set-proofs.js";
import { naturalSetTheorems } from "./natural-set-proofs.js";

// Definition extensions of the original number systems. Derived rules below
// carry checked proofs; they must never be promoted to axioms during migration.
export const numberRules = String.raw`
{ [zh]皮亚诺算数 [en]Peano Arithmetic
    { [zh]公理 [en]Axioms
        apn1:ax: ⊢0∈ℕ;
        apn2:ax: ⊢∀x:(x∈ℕ→S(x)∈ℕ);
        apn3:ax: ⊢∀x:¬S(x)=0;
        apn4:ax: ⊢∀x:∀y:(S(x)=S(y)→x=y);
        apn5:ax: ⊢#sb($P,$n,0)→(∀$n:($n∈ℕ→($P→#sb($P,$n,S($n))))→∀$n:($n∈ℕ→$P));
    }
    { [zh]符号定义 [en]Definitions
        { [zh]1-10定义 [en]Numerals 1-10
            d1:ax: ⊢1=S(0);
            d2:ax: ⊢2=S(1);
            d3:ax: ⊢3=S(2);
            d4:ax: ⊢4=S(3);
            d5:ax: ⊢5=S(4);
            d6:ax: ⊢6=S(5);
            d7:ax: ⊢7=S(6);
            d8:ax: ⊢8=S(7);
            d9:ax: ⊢9=S(8);
            d10:ax: ⊢10=S(9);
        }
        d+1:ax: ⊢$x∈ℕ→$x+0=$x;
        d+2:ax: ⊢$x∈ℕ→$y∈ℕ→$x+S($y)=S($x+$y);
        d*1:ax: ⊢$x∈ℕ→$x*0=0;
        d*2:ax: ⊢$x∈ℕ→$y∈ℕ→$x*S($y)=$x*$y+$x;
        d<=:ax: ⊢∀x:∀y:(x∈ℕ→y∈ℕ→(x≤y↔∃z:(z∈ℕ∧x+z=y)));
        d>=:ax: ⊢$x≥$y↔$y≤$x;
        d/|:ax: ⊢∀x:∀y:(x∈ℕ→y∈ℕ→(x∣y↔∃z:(z∈ℕ∧x*z=y)));
        dPrime:ax: ⊢∀n:(Prime(n)↔n∈ℕ∧¬∃x:(x∈ℕ∧¬x=1∧¬x=n∧∃y:(y∈ℕ∧x*y=n)));
    }
    { [zh]定理 [en]Theorems
        ${peanoTheorems}
    }
}
{ [zh]数系 [en]Number Systems
    { [zh]自然数 [en]Natural Numbers
        d0:ax: ⊢0={};
        dS:ax: ⊢S($x)=$x∪{$x};
        dN:ax: ⊢ℕ=ω;
        dRel:ax: ⊢∀a:∀b:∀r:(Rel(a,r,b)↔∃f:(f∈r∧f=(a,b)));
        dOrder:ax: ⊢∀x:∀r:(Order(x,r)↔(∀a:∀b:((a∈x∧b∈x)→((Rel(a,r,b)∨Rel(b,r,a))∧((Rel(a,r,b)∧Rel(b,r,a))↔a=b)))∧∀a:∀b:∀c:(((a∈x∧b∈x)∧c∈x)→((Rel(a,r,b)∧Rel(b,r,c))→Rel(a,r,c)))));
        ${naturalSetBridgeTheorems}
        ${naturalSetTheorems}
    }
    { [zh]整数 [en]Integers
        dfZ:ax: ⊢∀x:(x∈ℕ×ℕ→Z(x)={y∈ℕ×ℕ|pr1(x)+pr2(y)=pr2(x)+pr1(y)});
        dZ:ax: ⊢ℤ={Z(x)|x∈ℕ×ℕ};
        dZ+:ax: ⊢$x∈ℕ×ℕ→$y∈ℕ×ℕ→Z($x)+Z($y)=Z((pr1($x)+pr1($y),pr2($x)+pr2($y)));
        dZ-:ax: ⊢$x∈ℕ×ℕ→$y∈ℕ×ℕ→Z($x)-Z($y)=Z((pr1($x)+pr2($y),pr2($x)+pr1($y)));
        dZ*:ax: ⊢$x∈ℕ×ℕ→$y∈ℕ×ℕ→Z($x)*Z($y)=Z((pr1($x)*pr1($y)+pr2($x)*pr2($y),pr1($x)*pr2($y)+pr2($x)*pr1($y)));
        dZ<=:ax: ⊢$x∈ℕ×ℕ→$y∈ℕ×ℕ→(Z($x)≤Z($y)↔pr1($x)+pr2($y)≤pr2($x)+pr1($y));
        dZ-2:ax: ⊢-2=Z((0,2));
        dZ-1:ax: ⊢-1=Z((0,1));
        dZ0:ax: ⊢+0=Z((0,0));
        dZ1:ax: ⊢+1=Z((1,0));
        dZ2:ax: ⊢+2=Z((2,0));
        ${integerSetTheorems}
    }
    { [zh]有理数 [en]Rational Numbers
        dfQ:ax: ⊢∀x:(x∈ℤ×(ℤ＼{+0})→Q(x)={y∈ℤ×(ℤ＼{+0})|pr1(x)*pr2(y)=pr2(x)*pr1(y)});
        dQ:ax: ⊢ℚ={Q(x)|x∈ℤ×(ℤ＼{+0})};
        dQ+:ax: ⊢$x∈ℤ×(ℤ＼{+0})→$y∈ℤ×(ℤ＼{+0})→Q($x)+Q($y)=Q((pr1($x)*pr2($y)+pr1($y)*pr2($x),pr2($x)*pr2($y)));
        dQ-:ax: ⊢$x∈ℤ×(ℤ＼{+0})→$y∈ℤ×(ℤ＼{+0})→Q($x)-Q($y)=Q((pr1($x)*pr2($y)-pr1($y)*pr2($x),pr2($x)*pr2($y)));
        dQ*:ax: ⊢$x∈ℤ×(ℤ＼{+0})→$y∈ℤ×(ℤ＼{+0})→Q($x)*Q($y)=Q((pr1($x)*pr1($y),pr2($x)*pr2($y)));
        dQ/:ax: ⊢$x∈ℤ×(ℤ＼{+0})→$y∈(ℤ＼{+0})×(ℤ＼{+0})→Q($x)/Q($y)=Q((pr1($x)*pr2($y),pr2($x)*pr1($y)));
        dQ<=:ax: ⊢$x∈ℤ×(ℤ＼{+0})→$y∈ℤ×(ℤ＼{+0})→pr2($x)*pr2($y)≥+0→(Q($x)≤Q($y)↔pr1($x)*pr2($y)≤pr2($x)*pr1($y));
        dQ-2:ax: ⊢-2q=Q((-2,+1));
        dQ-1:ax: ⊢-1q=Q((-1,+1));
        dQ0:ax: ⊢0q=Q((+0,+1));
        dQ1:ax: ⊢1q=Q((+1,+1));
        dQ2:ax: ⊢2q=Q((+2,+1));
    }
    { [zh]实数 [en]Real Numbers
        ddkCut:ax: ⊢∀a:(DdkCut(a)↔¬a={}∧¬a=ℚ∧(ℚ＼a)∪a=ℚ∧∀x:∀y:(x∈a→y∈ℚ＼a→(x≤y∧¬x=y))∧¬∃x:(x∈a∧∀y:(y∈a→x≥y)));
        dR:ax: ⊢ℝ={a∈pow(ℚ)|DdkCut(a)};
        dR+:ax: ⊢∀x:∀y:(x∈ℝ→y∈ℝ→x+y={z∈ℚ|∃m:∃n:(m∈x∧n∈y∧z=m+n)});
        dR-:ax: ⊢∀x:∀y:(x∈ℝ→y∈ℝ→x-y={z∈ℚ|∃m:∃n:(m∈x∧n∈ℚ＼y∧z=m-n)});
        dR*1:ax: ⊢∀x:∀y:(x∈ℝ→y∈ℝ→∀m:(m∈ℚ＼x→m≥0q)→∀m:(m∈ℚ＼y→m≥0q)→x*y={z∈ℚ|¬∃m:∃n:(m∈ℚ＼x∧n∈ℚ＼y∧z=m*n)});
        dR*2:ax: ⊢∀x:∀y:(x∈ℝ→y∈ℝ→(x*y=0r-(0r-x)*y∧x*y=0r-x*(0r-y)));
        dR/1:ax: ⊢∀x:∀y:(x∈ℝ→y∈ℝ→0q∈x→y/x=y*{z∈ℚ|z≤0q∨∃m:(m∈ℚ＼x∧¬m≤0q∧z≤1q/m∧¬z=1q/m)});
        dR/2:ax: ⊢∀x:∀y:(x∈ℝ→y∈ℝ→¬y=0r→x/(0r-y)=0r-x/y);
        dR<=:ax: ⊢$x∈ℝ→$y∈ℝ→($x≤$y↔$x⊂$y);
        dR-2:ax: ⊢-2r={x∈ℚ|x≤-2q∧¬x=-2q};
        dR-1:ax: ⊢-1r={x∈ℚ|x≤-1q∧¬x=-1q};
        dR0:ax: ⊢0r={x∈ℚ|x≤0q∧¬x=0q};
        dR1:ax: ⊢1r={x∈ℚ|x≤1q∧¬x=1q};
        dR2:ax: ⊢2r={x∈ℚ|x≤2q∧¬x=2q};
    }
}
`;
