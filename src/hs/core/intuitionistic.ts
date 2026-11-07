/** Optional IPC axioms. Visiting a map area does not grant them; its reward must unlock them. */
export const intuitionisticRules = String.raw`
{ [zh]直觉命题逻辑 [en]Intuitionistic propositional logic
a3i:ax:⊢($1→$2)→¬$2→¬$1;
d/\i:ax:⊢$p→($q→($p∧$q));
d/\i1:ax:⊢($p∧$q)→$p;
d/\i2:ax:⊢($p∧$q)→$q;
d\/i1:ax:⊢$p→($p∨$q);
d\/i2:ax:⊢$q→($p∨$q);
d\/i:ax:⊢($p→$r)→(($q→$r)→(($p∨$q)→$r));
d~i:ax:⊢($p→$q)→(($p→¬$q)→¬$p);
d~i1:ax:⊢¬$p→($p→$q);
d<>i:ax:⊢($p→$q)→(($q→$p)→($p↔$q));
d<>i1:ax:⊢($p↔$q)→($p→$q);
d<>i2:ax:⊢($p↔$q)→($q→$p);
}
`;
