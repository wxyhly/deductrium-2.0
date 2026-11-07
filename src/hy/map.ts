export const mapData = `


// 游戏大厅

@[zh]欢迎来到游戏[n]Deductrium![n]按WASD或[n]拖动画面进行移动[en]Welcome to the game[n]Deductrium![n]Use WASD keys or[n]drag the screen to move
5$[[zh-en]]Toggle Language:[n]English
1@
3@[zh]这是一个形式系统推理结合[n]双曲空间解谜小游戏[n]游戏作者：Hqak(wxyhly)[en]This is a puzzle game [n]combining formal system deduction[n]with hyperbolic space exploration[n]Game Developer: Hqak(wxyhly)
:%,4;5;5;5;0;5@
:%,3$[=getD:1]
4,1,3,1,3@
:%,4;2;3;4;4;2@
:%,2@[[bank-entrance]][zh]银行入口[n]前方可以兑换货币[en]Bank entrance[n]Currency exchange ahead
:%,2@[[bank-lobby]][=bank:"builtin:lobby"][zh]银行[n]推理素 ↔ 类型币[n]双向 1:1，手续费 1%[n]本金之外另扣手续费[n]侧边奖励格标有兑换金额[n]走入一次兑换一次[n]沿道路选择金额，无需逐个兑换[en]Bank[n]Deductrium ↔ Type currency[n]1:1 both ways; 1% fee[n]Fee is charged on top of principal[n]Step into a marked reward to exchange[n]Use the road to choose an amount[n]Each entry makes one exchange
:%,2;2;2;2;5@
1,1#[[#ω]]
2@
3,2@
:%,4$[[pL]][=ac:"progL"][=unl:{layer:"P-layer"}][zh]进度层[en]progress layer

2,2$[[dL]][=unl:{layer:"D-layer"}][zh]推理层[n]与符号“→”（>）[n]注：为方便输入特殊符号[n]可用括号中的字符“>”[n]来代替字符“→”[en]deduct layer [n]and symbol “→” (>)[n]Note: For convenience,[n] you can use the symbol “>”[n] to replace the symbol “→”
1,3#[=payD:1e9]
1,3,1$[=getD:5e10]

// 玩家反馈后补充的入门教程

:dL,5@[zh][D]表中推理规则都是这样的形式：[n]( A1, A2, ...An ⊢ C )[n]它代表若A1、A2、... An[n]都是[P]定理表中的定理[n]则执行该规则后[n]就能把C加入到定理表[P]中[en]Deduction rules in table [D][n]have the following form:[n]( A1, A2, ...An ⊢ C )[n]This means that if A1, A2, ... An[n]are all theorems in theorem table [P][n]then after applying the rule[n]C can be added to theorem table [P]
:%*,3@[zh]$开头的东西叫替换变量[n]它可以替换成任何表达式[n]系统会根据你选择的条件[n]尝试自动匹配出它们的值[n]无法确定时会让你直接输入表达式[en]Items beginning with $[n]are called substitution variables[n]They may be replaced by any expression[n]The system will try to infer their values[n]automatically from the premises you select[n]If it cannot determine them[n]you will be asked to enter an expression manually
:%*,3,2@[zh]请尝试使用某个推理规则[n]得到定理A>(A>A)[n]从而可以通过门[n]A>(A>A)[n]#p[en]Try using a deduction rule[n]to derive the theorem A>(A>A)[n]so that you can pass the gate[n]A>(A>A)[n]#p
:%*,3,4@[zh]提示：系统等待你输入表达式时[n]可以点击定理中的表达式[n]来快速复制插入到命令框[en]Hint: When the system is waiting[n]for you to enter an expression[n]you can click an expression[n]inside a theorem[n]to quickly copy it into the command box
:%,5@[zh]要执行某个推理规则[n]可在底部命令框中输入规则名[n]或直接点击[D]表中的推理规则[n]然后系统将提示你[n]在[P]定理表中选择条件定理[en]To apply a deduction rule[n]you may enter its name[n]in the command box at the bottom[n]or click the rule directly in table [D][n]The system will then prompt you[n]to select premise theorems[n]from theorem table [P]
:%*,3@[zh]什么是表达式？[n]小写字母组成的单词是表达式[n](表达式1 > 表达式2)也是表达式[n]在没有歧义时括号可以随意增删[en]What is an expression?[n]A word consisting of lowercase letters[n]is an expression[n](expression1 > expression2)[n]is also an expression[n]Parentheses may be added or removed[n]whenever there is no ambiguity
:%*,5@[zh][D]中有些规则直接以 ⊢ 开头[n]它们能够无条件产生定理[n]我们称之为“公理”[en]Some rules in [D][n]begin directly with ⊢[n]They generate theorems unconditionally[n]We call them "axioms"

// A>A 与推理宏引导

:dL,3@[zh]#p闸门开启方法：[n]当推理层的定理列表中[n]包含闸门上的字符串时[n]才能通过闸门[en]Method to unlock Gate #p:[n] you can pass through it[n]When the [P] list in the deduct layer[n]contains the string on the gate
:dL,4#[[aa]][=ac:"aa"][p]A→A
:%,4#[p]B→B
:%*,1$[=getD:1]
:%,5#[p](A→B)→(A→B)
:%,5$[=getD:1]
:aa,2@[[否定/宏分路]][zh]提示：每通过一次[n]推理素“收费站”[n]你就得交一次过路费！[n]跟本格子的某顶点[n]相邻的另一个格子能够[n]解锁拆门技能[n]赶快去解锁它吧！[en]Hint: Every time you pass[n]through a Deductrium toll gate[n]you must pay![n]A neighboring cell[n]sharing a vertex with this one[n]can unlock the gate destruction skill[n]Go unlock it NOW!
:%,1#[[宏门]][=payD:1]
:%,2$[[macro]][=unl:true][zh]使用推理宏[n]（即“录制宏”按钮）[n]提示：前往⊢($0>$0)[n]后方以解锁假设[en]deduction macros[n](ie, the "Record Macro" button)[n]Hint: Pass through of ⊢($0>$0)[n]to unlock hypotheses
:%*,4#[d]⊢$0→(($0→$1)→$0)
:%*,4,1$[=getD:2]
:%,1@[[nd]][zh]#d闸门开启方法：[n]当推理层的推理规则列表中[n]包含闸门上的字符串时[n]才能通过闸门[en]Method to unlock Gate #d:[n] you can pass through it[n]When the [D] list in the deduct layer[n]contains the string on the gate
:%*,3$[=getD:1]
:aa,1#[p]A→(C→(B→A))
:%,2$[=getD:8]
:dL,2#[p]A→(A→A)
:%*,3#[[preord]][zh]健身俱乐部会员：[n]进度层中累计的[n]总方块步数达到[n]256步才能通过此门[en]Jogging Club Member:[n]To pass through this gate[n]The total block steps in progress layer[n]must reach 256 steps
:%*,3,1$[[omega]][=dstrTarget:"w"][=dstr:"#ω"]
:%,4@[zh]提示：解锁符号“~”后[n]才能开这些门[n]另外：[n]大写字母为系统保留[n]建议输入小写字母[en]Hint: You can only open these[n] gates after unlocking the symbol "~"[n]Other Hints: Uppercase[n] letters are reserved by the system[n]Lowercase letters are recommended
:%,4@[zh]向前走，有推出[n]A>A[n]的提示[en]Go forward for a hint[n] on deriving A>A
:%,5@
:%,5#[p]A→((A→A)→A)
:%,4@[zh]要想推出A>A[n]尝试使用a2公理看看[n]A>((A>A)>A)[n]能推出什么[n]然后再尝试使用[n]两次推理规则mp[en]To derive A>A[n]Try using Axiom a2 on[n]A>((A>A)>A)[n] to see what you can derive[n]Then try using[n]the deduction rule MP twice
:%,3$[=getD:1]
:omega,4;3;1;4;5;3;1;3;3;1;4;2;3;2;3@
:omega,4;3;1;4;5;3;2;2;3;4;5;5;4;3@
:omega,4;3;1;2;3;4;2;4;3;4;5@
:%,3$[[base-1]][zh]获得奖励：[n]若序数进位基底大于5[n]则将基底减1[en]Obtain Reward:[n]Reduce the limit carry base by 1[n]if the ordinal base is greater than 5
:omega,4;3;3;4;3;4;2;4;3;4;5@
:omega,4;3;3;4;3;4;2;2;1;2;1;2;3;3;4@
:omega,4;3;1;2;3;4;2;4;3;4;5;4;3;4;5;2;3@
:omega,4;3;1;2;3;4;2;4;3;4;5;4;3;4;5;4;5;5;0@
:omega,4;3;1;2;3;4;2;4;3;2;3;2;3;2;1;2;5;3;3@
:%,2$[[cmpss]][zh]获取指南针[en]Obtain Compass
:omega,4;3;1;2;3;4;2;4;3;2;3;1;3;2;1;2;5;3;3@
:omega,4;3;1;2;3;4;2;4;3;2;3;2;3;2;3;4;5;3;2@
:omega,4@[zh]向前走寻找指南针[en]Go forward to find the compass
:否定/宏分路,2;1;2;1;1;1@
:否定/宏分路,4#[[否定门]][=payD:2]
:%,5$[[neg]][=ac:"neg"][=unl:true][zh]否定公理a3[n]即符号“¬”（~）[en]Negation Axiom a3 [n] and symbol “¬” (~)
:%,2;1;1;1;1;1;1@

// 引导 a>b,b>c > a>c

:否定/宏分路,3#[d]($0→($1→$2)),($0→$1)⊢($0→$2)
:%*,3$[=getD:1]
:macro,5#[[.i]][=ac:".i"][d]⊢($0→$0)
:%*,2@[zh]提示：录制宏会将[n]整个定理列表[n]保存到推理规则表中[n]“$xxx”可被任意替换使用[en]Hint: Recording macro will save[n]the entire [P] list[n]to the deduction rule table[n]“$xxx” can be replaced with anything
:%,5#[d](¬$0→¬$1)⊢($1→$0)
:%*,5$[=getD:1]
:%,0#[d]($0→($1→$2))⊢(($0→$1)→($0→$2))
:%*,5$[=getD:1]

:.i,4$[[hyp]][=ac:"hyp"][=unl:true][zh]假设[n]注意：定理表中若有假设[n]不可开启对应门#p[n]假设是用来录制宏的[en]Hypotheses[n]Note: If there are hypotheses in [P] list[n]the Gate #p cannot be opened[n]Hypotheses are for recording macro
:%*,3@[zh]将定理列表清空后添加假设[n]录制成宏后假设将作为[n]推理条件出现在[n]推出符号“⊢”前[en]To add hypotheses, you need to[n] clear the [P] list first.[n]After recorded as a macro, the hypotheses[n] will occur as conditions[n]before the turnstile symbol “⊢”
:%*,3,3$[=getD:1]
:否定门,1$[[dG]][=ac:"delgate"][=unl:true][zh]拆门技能[n]通过门后将其拆除[n]提示：考虑逆否命题[n]（建议推出否定爆炸后[n]再探索前方系列谜题）[en]gate destruction skill:[n]Remove gates after passing through them[n]Hint: Consider contrapositive statements[n](recommend to get the principle of explosion[n]before exploring the puzzles ahead)

// 玩家反馈在能拆门前容易用光推理素导致重置游戏

:否定/宏分路,2,2$[[JJZO-1]][zh]被耗光了推理素[n]但不想重置游戏？[n]请跟我来！[en]Ran out of Deductrium[n]but don't want to reset the game?[n]Follow me!
:%,3#[[JJZP-1]][zh]只有没解锁拆门技能[n]且推理素余额小于4µg[n]才能通过此门[n]#救济站[en]Only players who have not unlocked[n]the gate destruction skill[n]and have less than 4 µg of Deductrium[n]may pass through this gate[n]#ReliefStation
:%,3$[[JJZI-1]][zh]请向前走40格[n]领取救济站发放的[n]！！~免费推理素~！！[n]5 µ g ！[en]Please move forward 40 tiles[n]to collect the relief station's[n]!! ~FREE DEDUCTRIUM~ !![n]5 µ g !
:%,3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3@
:%,3$[[JJZ-1]][=getD:5]

:nd,2$[[JJZO-2]][zh]被耗光了推理素[n]但不想重置游戏？[n]请跟我来！[en]Ran out of Deductrium[n]but don't want to reset the game?[n]Follow me!
:%,3#[[JJZP-2]][zh]只有没解锁拆门技能[n]且推理素余额小于4µg[n]才能通过此门[n]#救济站[en]Only players who have not unlocked[n]the gate destruction skill[n]and have less than 4 µg of Deductrium[n]may pass through this gate[n]#ReliefStation
:%,3$[[JJZI-2]][zh]请向前走40格[n]领取救济站发放的[n]！！~免费推理素~！！[n]5 µ g ！[en]Please move forward 40 tiles[n]to collect the relief station's[n]!! ~FREE DEDUCTRIUM~ !![n]5 µ g !
:%,3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3;3@
:%,3$[[JJZ-2]][=getD:5]

// 一些l7z8的元定理，可挣分买演绎定理

:nd,1;1@
:%,1#[d]⊢($0→(($0→$1)→$1))
:%*,2$[=getD:5]

// iff门, m1, m2

:dG,3#[d]¬($0→$1)⊢¬$1
:dG,4#[d]$0,¬$1⊢¬($0→$1)
:%*,3$[[del<>]][=dstrTarget:"port-iff"][=dstr:"#<>(↔)\\n提示：该门后才解锁相应符号"]
:%*,3,3$[[base-7]][zh]获得奖励：[n]若序数进位基底大于5[n]则将基底减1[en]Obtain Reward:[n]Reduce the limit carry base by 1[n]if the ordinal base is greater than 5
:%,1#[d]¬($0→$1)⊢$0
:%*,3$[[andor]][=ac:"andor"][=unl:true][zh]逻辑符号[n]“∧”（&）与“∨”（|）[en]logical symbols[n]“∧” (&) and “∨” (|)
:%*,3,2#[[lem]][=ac:"lem"][p](P∨¬P)
:%*,3,2,2$[[base-8]][zh]获得奖励：[n]若序数进位基底大于5[n]则将基底减1[en]Obtain Reward:[n]Reduce the limit carry base by 1[n]if the ordinal base is greater than 5
:%*,3,2,4$[=getD:9]
:%*,3,2,3#[[contra]][=ac:"contra"][p]¬(P∧¬P)
:%*,3,2,3,2$[[base-9]][zh]获得奖励：[n]若序数进位基底大于5[n]则将基底减1[en]Obtain Reward:[n]Reduce the limit carry base by 1[n]if the ordinal base is greater than 5
:%*,3,2,3,3$[=getD:18]
:%*,3,3@[zh]提示：需解锁[n]“<>”(↔)符号[n]才能使用逻辑符号[en]Hint: You need to unlock[n]the “<>” (↔) symbol[n]to use logical symbols
:%*,3,3,4#[[pierce]][=ac:"pierce"][p]((P→Q)→P)→P
:%*,3,3,4,5$[=getD:50]

:%*,3,3,1#[=payD:20]
:%*,3,3,1,5$[[highlightd]][zh]高亮显示[n]仅奖励推理素的方块[en]Highlight blocks[n]that only reward deductrium

// <>基本定理

:del<>,1#[d]($0→$1),($1→$0)⊢($0↔$1)
:%*,3$[=getD:10]
:%,2#[p](A↔A)
:%*,2$[=getD:10]
:%,1#[d]($0↔$1)⊢$0→$1
:%*,2$[=getD:10]
:%,1#[d]($0↔$1)⊢$1→$0
:%*,2$[=getD:10]
:%,1#[d]($0↔$1)⊢($1↔$0)
:%*,2$[=getD:10]
:%,1#[p]($0↔$1)↔($1↔$0)
:%*,2$[=getD:10]
:%,1#[d]($0↔$1),($1↔$2)⊢($0↔$2)
:%*,2$[=getD:10]
:%,1#[p]($0↔¬¬$0)
:%*,2$[=getD:10]
:%,1#[d]($0↔$1)⊢(¬¬$0→$2)↔($1→$2)
:%*,3$[=getD:100]

// or
:andor,1#[p]($0∨$1)→(¬$0→$1)
:%*,3$[=getD:10]
:%,2#[p](¬$0→$1)→($0∨$1)
:%*,2$[=getD:10]
:%,1#[d]$0⊢($0∨$1)
:%*,2$[=getD:10]
:%,1#[d]$1⊢($0∨$1)
:%*,2$[=getD:10]
:%,1#[d]($0∨$0)⊢$0
:%*,2$[=getD:10]
:%,1#[d]($0∨$1)⊢($1∨$0)
:%*,2$[=getD:10]
:%,1#[d]($0∨$1)∨$2⊢$0∨($1∨$2)
:%*,2$[=getD:10]
:%,1#[d]¬$0,¬$1⊢¬($0∨$1)
:%*,2$[=getD:10]
:%,0#[p](¬$0∨¬$1)↔¬($0∧$1)
:%*,1$[=getD:10]

//and
:andor,5#[p]($0∧$1)→¬($0→¬$1)
:%*,2$[=getD:10]
:%,5#[p]¬($0→¬$1)→($0∧$1)
:%*,2$[=getD:10]
:%,0#[d]$0,$1⊢($0∧$1)
:%*,2$[=getD:10]
:%,5#[d]($0∧$1)⊢$0
:%*,2$[=getD:10]
:%,0#[d]($0∧$1)⊢$1
:%*,2$[=getD:10]
:%,5#[d]($0∧$1)⊢($1∧$0)
:%*,2$[=getD:10]
:%,0#[d]($0∧$1)∧$2⊢$0∧($1∧$2)
:%*,2$[=getD:10]
:%,5#[d]¬$0⊢¬($0∧$1)
:%*,2$[=getD:10]
:%,0#[d]¬$1⊢¬($0∧$1)
:%*,3$[=getD:10]

// 自动推理

:%,5#[=payD:130]
:%,2$[[delL]][=dstrTarget:"L"][=dstr:"#L"]
// :%,2$[[mcpt]]解锁完备性元定理[n]（命题逻辑自动推理）
:dG,2;5;5;0@
:dG,5;2;2;1@

// mct

:hyp,5;5;0;5;0;4;1;2@
:%,1@[zh]条件演绎元定理[n]将自动帮你生成[n]带条件的推理宏[en]Conditional Deduction Metatheorem[n]will automatically generate[n]conditional macros for you
:%,0#[[ccmp]][d]($0→($1→$2)),($0→($1→($2→$3)))⊢($0→($1→$3))
:%,3$[[mct]][=unl:true][zh]条件演绎元定理[en]Conditional[n]Deduction Metatheorem
:%,5#[d]($0→¬¬$1)⊢($0→$1)
:%*,5$[=getD:5]
:mct,1,1$[=getD:10]

// mdt后好证的从#p门含义出来的岔路：

:ccmp,1#[[mct2mdt]][=requiresReward:"mct",payD:20][zh]通过此门需[n]1.解锁条件演绎元定理[n]2.消耗推理素20µg[en]To pass this gate you need:[n]1. Unlock the Conditional Deduction Metatheorem[n]2. Consume 20µg of Deductrium
:%*,2$[[mdt]][=ac:"mdt"][=unl:true][zh]演绎元定理[n]解锁演绎元定理[n]解锁演绎元定理[en]Deduction Metatheorem![n]Go for Unlock Deduction Metatheorem![n]Go for Unlock Deduction Metatheorem!
:%,1@[zh]重要的元定理说三遍[n]重要的元定理说三遍[n]重要的元定理说三遍[en]Something is worth repeating 3 times[n]Something is worth repeating 3 times[n]Something is worth repeating 3 times
:%,4#[p]($0→($1→$2))→(($0→($1→($2→$3)))→($0→($1→$3)))
:%*,3$[=getD:1]
2,2,3,2#[p]($0→($1→$2))→($1→($0→$2))
:%,1$[=getD:20]

// 否定逻辑词

:neg,0#[[.dne]][=ac:".dne"][p]¬¬A→A
:%*,5@[zh]提示：要证A>~~A[n]需先证~~~A>~A[en]Hint: To prove A>~~A[n]you first need to prove ~~~A>~A
:%*,5,0$[[base-6]][zh]获得奖励：[n]若序数进位基底大于5[n]则将基底减1[en]Obtain Reward:[n]Reduce the limit carry base by 1[n]if the ordinal base is greater than 5
:%,3#[p]A→¬¬A
:%*,5$[[dniM]][=getD:5]
:%*,1@[zh]提示：[n]门A>(A>A)[n]后有些关于双重否定[n]推理的提示[en]Hint:[n]Behind the gate A>(A>A)[n]there are hints for[n] double negation elimination
:%*,1,3#[p](¬A→¬¬A)→(¬A→A)
:%*,1,4#[p](¬A→¬A)→(A→A)
:%*,1,4,5$[=getD:1]
:%*,1,4,1$[=getD:1]
:%*,1,3,1$[=getD:2]
:%,2#[d]($0→$1)⊢(¬$1→¬$0)
:%*,2,1$[=getD:10]
:%*,3$[=getD:3]
:%*,5@[zh]提示：这里继续深入[n]前进可拆除门#K[en]Hint: Continuing deeper here[n]will allow you to destruct gate #K
:%,2#[p]($0→$1)→(¬$1→¬$0)
:%,5#[p]($0→¬$1)→($1→¬$0)
:%,5#[p](¬$0→$1)→(¬$1→$0)
:%,4$[[delK]][=dstrTarget:"K"][=dstr:"#K"]
:%,2$[=getD:15]
2,2,2,4,2#[p]¬¬A→(¬¬¬¬A→¬¬A)
:%*,3$[=getD:1]
:%*,3,3@[zh]提示：先从a2公理出发证明[n]($0>$1),($0>($1>$2))⊢($0>$2)[en]Hint: Using axiom a2, firstly prove[n]($0>$1),($0>($1>$2))⊢($0>$2)
:%*,3,3,3@[zh]提示2：通过a1公理可以证明[n]($1>$2)⊢($0>($1>$2))[en]Hint 2: Using axiom a1 to prove[n]($1>$2)⊢($0>($1>$2))
:%*,1#[p](¬¬¬¬A→¬¬A)→(¬A→¬¬¬A)
:%*,1,5@[zh]提示：证明规则[n]($0>$1),($1>$2)⊢($0>$2)[n]后使用它[en]Hint: Prove the rule[n]($0>$1),($1>$2)⊢($0>$2)[n]then use it
:%,2#[p]¬¬A→(¬A→¬¬¬A)
:%*,5#[d]($0→$1),($1→$2)⊢($0→$2)
:%*,5,5$[=getD:9]
:%,2#[p]¬¬A→(¬¬A→A)
:%*,3@[zh]提示：~~A>(~~A>A)[n]与a2公理[en]Hint: ~~A>(~~A>A)[n]and Axiom a2
:%,2#[p](¬¬A→¬¬A)→(¬¬A→A))
:%,2$[=getD:5]
:%,1$[[base-10]][zh]获得奖励：[n]若序数进位基底大于5[n]则将基底减1[en]Obtain Reward:[n]Reduce the limit carry base by 1[n]if the ordinal base is greater than 5
:neg,3#[[exfalso2]][=ac:"exfalso2"][d]$0⊢(¬$0→$1)
:%*,2$[=getD:4]
:%,1#[d]$0→($0→$1)⊢$0→$1
:%*,2$[=getD:4]
:neg,4#[[exfalso1]][=ac:"exfalso1"][p]A→(¬A→B)
:%*,2$[=getD:8]
:%*,1@[zh]提示：证否定爆炸须先证A>~~A[n]关键步骤：[n]A⊢~B>A[n]~B>A⊢~A>B[en]Hint: To prove[n] the principle of explosion,[n] you must first prove A>~~A[n]Key steps:[n]A⊢~B>A[n]~B>A⊢~A>B
:%*,1,2#[d]$0,¬$0⊢¬$1
:%*,1,2,3$[=getD:2]
:%*,1,4#[d]¬$0,$0⊢¬$1
:%*,1,4,3$[=getD:2]

2,1#[=payD:101]
:%*,3$[[base-5]][zh]获得奖励：[n]若序数进位基底大于5[n]则将基底减1[en]Obtain Reward:[n]Reduce the limit carry base by 1[n]if the ordinal base is greater than 5
:%,4$[[.prop]][=ac:".prop"][zh]获得常见[n]命题逻辑定理[n]大礼包！可直接使用！[en]Obtain a Toolkit of[n]common propositional logic theorems![n]You can use these rules directly!
:%*,2#[=payD:1e3]
:%*,3#[=payD:500]
:%*,2,1$[[renameD]][=unl:true][zh]直接重命名[n]推理规则的能力[en]the ability [n]to directly rename[D] rules.
:%*,3,5$[[mkdir]][=unl:true][zh]建立文件夹[n]整理规则列表的能力[en]the ability [n]to create folders[n]to organize the list of [D] rules.
// 门k及之后: a3/T互推，自动推理

2,2,3,4,4#[[K]][zh][n]未解锁的闸门无法通过[n]请寻找线索解开闸门[n]#K[en][n]Locked gate cannot be passed[n]Find clues to unlock it[n]#K
:%,5@
// 提示门K在哪
:.i,3;4;3;2@
:%,3@[zh]门#K在离[n]#p闸门开启方法说明[n]直线距离2格远的地方[n][en]Gate #K is[n]2 grids away in straight line[n]from gate #p unlock method description[n]
:%,1@[zh]要解锁门#L[n]需要从“解锁拆门技能”[n]方块旁经过[en]To unlock Gate #L[n]you need to pass by the block[n]"Unlock Gate Destruction Skill"
:K,1#[p](B→C)→((¬B→C)→C)
:%,1#[p](¬B→C)→((B→C)→C)
:%,1#[p](¬B→¬C)→((¬B→C)→B)
:%,1#[p](¬B→C)→((¬B→¬C)→B)
:%,1#[[L]][zh][n]未解锁的闸门无法通过[n]请寻找线索解开闸门[n]#L[en][n]Locked gate cannot be passed[n]Find clues to unlock it[n]#L
:%,1$[[mcpt]][=ac:"mcpt"][=unl:true][zh]完备性元定理[n]（命题逻辑自动推理）[en]Completeness Metatheorem[n](Automated propositional logic reasoning)

// 一阶逻辑与iff的引子

:dL,1@[=unl:true][zh]拆门技能奖励方块前方[n]可解锁<>、&、|逻辑符号[n]然后有很多推理素奖励[en]You can unlock logical symbols <>, & and |[n]Ahead of the gate destruct skill reward[n]Then, there are many deductriums
:dL,1,4#[=payD:100]
:dL,1,3#[[port-iff]][zh][n]未解锁的闸门无法通过[n]请寻找线索解开闸门[n]#<>(↔)[en][n]Locked gate cannot be passed[n]Find clues to unlock it[n]#<>(↔)
:dL,1,4,5$[[1st]][=ac:"1st"][=unl:true][zh]一阶逻辑[n]量词公理a4、a5、a6[n]与公理模式元规则mq[n]建议先前往介绍[n]量词、公式那条路[n]后面再来公理a4相关关卡[en]1st-order logic[n]Quantifier Axioms a4, a5, a6[n]and Axiom Schema Meta-rule mq[n]Recommend: first go to the path[n] introducing quantifiers and formulas[n]Then back to the Axiom a4 later
:dL,1,3,1$[[iff]][=ac:"iff"][=unl:true][zh]当且仅当（互推）[n]逻辑符号“↔”（<>）[en]iff (mutual implication)[n]Logical symbol “↔” (<>)
:%,5#[p](¬(A→¬B)→C)↔(A→(B→C)))
:%,5$[=getD:20]
:1st,4#[=payD:50]
:%,4$[[italic-item]][=unl:true][zh]用斜体区分[n]显示项与公式[en]the use of italics [n]to distinguish terms and formulas.

// idt和cmt元定理、快速元定理教程

:iff,2,4#[=payD:49]
:%*,1$[[midt]][=unl:true][zh]逆演绎元定理[en]inverse deduction metatheorem
:%*,5$[[mcmt]][=unl:true][zh]组合元定理[en]combination metatheorem
:%*,4@[zh]逆演绎元定理其实就是[n]相应公理与mp规则的简单组合[n]但组合后的条件自动匹配[n]如推理规则“<a1”为[n]$1⊢$2>$1[en]Inverse deduction metatheorem is [n]simple combination of corresponding axioms and mp rule[n]but conditions automatically match[n]E.g., deduction rule “<a1” is $1⊢$2>$1
:%*,2@[zh]组合元定理将两个[n]带条件的推理规则a与b[n]自动匹配组合成[n]一条规则“:a,b”[n]比如推理规则[n]“:a7,<a1”将自动得到[n]⊢ $1 > ($0=$0)[en]Combination metatheorem [n]automatically matches 2 [n]conditional deduction rules[n] a and b into one rule ":a,b"[n]E.g., deduction rule":a7,<a1”[n] will be ⊢ $1 > ($0=$0)
:%*,2,3@[zh]往前走，还有更高级的[n]组合元定理用法[n]（仅限快捷执行元规则）[en]Further on, there are more advanced uses[n]of the combination metatheorem[n](for execution of fast-meta-rules only).
:%*,2,3,3#[=payD:50]
:%*,2,3,3,3#[=payD:100]
:%*,2,3,3,3,3@[zh]组合元定理可以嵌套[n]如::a,b,c相当于[n]令m = :a,b[n]则::a,b,c = :m,c[en]Combination rules can be nested.[n]For example, ::a,b,c is equivalent to[n]let m = :a,b[n]then ::a,b,c = :m,c.
:%*,2,3,3,3,3,1@[zh]第二个参数同理[n]如:a,:b,c相当于[n]令m = :b,c[n]则:a,:b,c = :a,m[en]The second parameter can also be nested.[n]For example, :a,:b,c is equivalent to[n]let m = :b,c[n]then :a,:b,c = :a,m.
:%*,2,3,3,3,3,2@[zh]第二个参数规则[n]也可以有多个条件[n]如:a:b,c表示[n]先执行推理规则a与b[n]然后把它们的结论[n]分别作为规则c的条件[n]再执行c[en]The second parameter rule[n]can also have multiple conditions.[n]For example, :a:b,c means[n]first execute rules a and b[n]and then use their conclusions[n]as conditions for rule c,[n]and then execute c.
:%*,2,3,3,3,3,3@[zh]条件之间用“:”分隔[n]条件与结论之间用“,”分隔[n]“#”为放入默认条件[n]条件没写够则默认为“#”[en]Conditions are separated by “:”.[n]Conditions and conclusions are separated by “,”.[n]“#” represents the insertion of the default condition.[n]If not enough conditions are written,[n] it defaults to “#”.
:%*,2,3,3,3,3,4@[zh]你可以输入这几个规则体会一下：[n]:<a1,c.t[n]:<a1:#,c.t[n]:#:<a1,c.t[en]You can input these rules to experience it:[n]:<a1,c.t[n]:<a1:#,c.t[n]:#:<a1,c.t
:%*,2,3,3,3,3,5@[zh]定理.t($a>$b,$b>$c⊢$a>$c)[n]可以输入规则名直接生成：[n]<:<a1,<a2[n](虽然两个条件顺序反了)[en]The theorem .t($a>$b,$b>$c⊢$a>$c)[n]can be generated directly by entering the rule name:[n]<:<a1,<a2[n](although the order of the two conditions is reversed).
:%*,3@[zh]快捷执行元规则：[n]可输入元规则名字前方括号内[n]的字符前缀加上推理规则名[n]来执行元规则。该方式生成的新规则[n]不列入推理规则表中[en]Quick execute metarule:[n]Enter prefix between '[' and ']' [n]before metarule name, then follow[n] deduction rule name[n]to execute metarule.[n]New rules generated this way[n]will not  be added to [D] rule table
// 一阶逻辑断言函数教程

:1st,5#[p](∀$2:$0)→((∀$2:$1)→(∀$2:$0))
:%,0#[p]∀$2:($0→($1→$0))
:%*,2@[zh]提示：对某个[n]命题逻辑的公理使用[n]元推理规则mq[n]来打开这扇门[en]Hint: Use metadeduction rule mq on[n]some propositional logic axiom[n]to open this gate
:%,5#[p](∀$2:$0) → ∀$2:($1→$0)
:%,0@[zh]公理a6解读：[n]#nf($0,$1)的值为$0[n]外加验证变量$1不在[n]表达式$0中自由出现[n](nf为not free缩写)[en]Axiom a6 interpretation:[n]Value of #nf($0,$1) is $0[n]with verifying variable $1 not free [n]in expression $0[n]('nf' is for not free)
:%,5@[zh]若$0中没有一阶逻辑量词[n]则自由出现指$0中含有$1[n][en]If $0 has no first-order logic quantifiers[n]free occurrence means $0 contains $1[n]
:%,5@[zh]验证#nf(Vx:$0,$1)[n]有两种情况：[n]1.若x为$1，则[n]$1不在Vx:$0中自由出现[n]若$0中有x,我们说[n]x被量词约束[en]To verify #nf(Vx:$0,$1)[n]There's two cases. Frist case:[n]If x is $1, then[n] variable x is not free in Vx:$0[n]If x occurs in $0, we say[n]x bound by quantifier
:%,0@[zh]2.若x不是$1[n]则#nf(Vx:$0,$1)=[n]Vx:#nf($0,$1)[n]即$1在Vx:$0中是否自由出现[n]取决于$1在$0中是否自由出现[en]2. If x is not $1[n]then #nf(Vx:$0,$1)=[n]Vx:#nf($0,$1)[n]i.e., whether $1 is free in Vx:$0[n]depends on whether $1 is free in $0
:%,5@[zh]若#nf函数验证成功[n]则系统自动删去#nf函数[n]若验证失败系统将报错[en]If #nf function verification succeeds[n]the system automatically removes it[n]If verification fails, the system gets an error
:%,0@[zh]由于$开头的公式或项[n]在录制宏后可替换成任意值[n]无法确定时[n]#nf函数将保留[en]Since $-prefixed formulas or terms[n]can be replaced with any value in macro usage[n]#nf function remains when there's uncertainty
:%,0#[[nf]][=ac:"nf"][p](∀x:$1)→(∀x:(∀x:$1))
:%*,5@[zh]Vx:$1中x被量词约束[n]不会自由出现[n]因此可使用公理a6[en]In Vx:$1, x is bound by quantifier[n]will not occur freely[n]Thus can use axiom a6
:%,0#[p](∀x:$1)→(∀y:(∀x:$1))
:%*,3,1#[p](∀x:F(x)∈y)→(∀y:(∀x:F(x)∈y))
:%*,3$[never]
:%,2@[zh]Vx:$1中y没被量词约束[n]可能在$1中自由出现[n]因此无法使用公理a6[en]In Vx:$1, y is not bound by quantifier[n]may occur freely in $1[n]Thus cannot use axiom a6
:%,4#[d]#nf($1,y) ⊢ (∀x:$1)→(∀y:(∀x:$1))
:%,5#[p](∀x:x=z)→(∀y:(∀x:x=z))
:%*,2$[=getD:10]
:%,5#[p](∀x:x∈y)→(∀y:(∀x:x∈y))
:%,0@你暂时别想拿到这个奖励！
:%,2$[=getD:3e3]

// 可替换教程
:1st,3@[zh]公理a4解读：[n]#rp($0,$1,$2)的值[n]为将$0中自由出现的$1[n]全替换为$2后的新值[n](即replace)[en]Axiom a4 interpretation:[n]Value of #rp($0,$1,$2)[n]is to replace all free $1 in $0[n]with $2[n]('rp' is for replace)
:%*,5@[zh]假设中若有未化简的#rp函数[n]会导致匹配机制失效[n]因此会被系统禁止[en]If an unreduced #rp function[n] occurs in hypotheses,[n] the matching mechanism will fail.[n]This will not be allowed
:1st,2@[[crp]][zh]公理a4解读：[n]#rp($0,$1,$2)执行替换前[n]还会外加验证$0中[n]可将$1替换为$2[en]Axiom a4 interpretation:[n]Expression #rp($0,$1,$2)[n]will verify that[n]All $1 in $0 can be replaced with $2[n]Before replacement execution
:%,2@[zh]若本来自由出现的变量[n]替换后被量词约束[n]则不可替换[en]If free variable becomes bound[n] by quantifier after replacement[n] this replacement can't be allowed
:%*,2#[p]∀x:(¬∀y:(x=y)) → ¬∀y:(y=y)
:%*,2,1$[never]
:%,3@[zh]例如#rp(~Vy:(x=y),x,y)[n]系统将验证失败[n][en]E.g., #rp(~Vy:(x=y),x,y)[n]#rp verification will fail[n]
:%*,1#[p]¬(∀x:(¬∀y:(x=y)) → ¬∀y:(y=y))
:%*,2,1$[[sysrule]][zh]获取关于系统函数#nf、#rp[n]自动化简规则的提示[en]Get hints about the system functions #nf, #rp,[n]and the automated simplification rules.
:%*,3@[zh]道理是这个道理[n]但否定挪进去后[n]真相就又变了[n](这边是附加题)[en]The rule is clear, but[n]once the negation is moved in[n]the truth changes again.[n](This part is an extra question)
:%*,2#[p]∀x:(∀y:¬(x=y)) → ∀y:¬(y=y)
:%*,2,5#[p]¬(∀x:(∀y:¬(x=y)) → ∀y:¬(y=y))
:%*,1,4$[=getD:30]
:%*,3,1,5$[never]
:1st,3,1#[[rp]][=ac:"rp"][p](∀$0:$1)→$1
:%,4@[zh]带第四个参数的[n]#rp函数可部分替换[n]输入数字指定仅替换[n]第几个出现的变量[n]数字0表示全部替换[n]负数代表倒数第几个出现的变量[en]#rp functions allow partial [n]replacement with fourth parameter[n]Enter number to specify replacing only the[n]nth occurrence of variable[n]0 means replace all[n]Negative numbers mean nth from end
:%,1$[[a8]][=unl:true][zh]等词公理a8[en]equational axiom a8

// 谓词、变量、项教程

:1st,5@[zh]“∀”(V)叫做量词[n]量词后紧跟的叫变量[n]冒号后的公式叫[n]该量词的管辖范围[n]整个V$0:$1是公式[en]“∀” (V) is called quantifier symbol[n]After quantifier is variable[n]Formula after colon is called[n]scope of this quantifier[n]Whole expression V$0:$1 is formula
:%*,5@[zh]注意：变量都是“项”[n]不能说某项为真或假[n]只有公式才能讨论其真假[n]纯命题逻辑都是公式[n]即都可判断真假[en]Note: Variables are all "terms"[n]We can't say term is true/false[n]Only formulas can be assigned[n] with True or False[n]Pure propositional logic are all formulas[n]ie, all can be judged true/false
:%*,0,3#[p](∀$2:($0↔$1))→((∀$2:$0)↔(∀$2:$1))
:%*,0,3,5$[[I1]][=unl:true][zh]门#I1[en]gate #I1
:%*,3#[p]∀x:x∈y → ∀x:x∈y
:%*,2#[[vx=x]][p]∀x:x=x
:%,4@[zh]谓词属于“∈”（@）与[n]相等“=”只能连接项[n]连接后的整体是公式[n]如x@y与x=y都是公式[n]它们都能谈论真假[en]Predicates like “∈” (@) and[n]equality “=” can only connect terms[n]After connection, the expression[n] becomes formula[n]E.g., x@y and x=y are both formulas[n]They can all be assigned with truth values
:%*,1@[zh]所有命题逻辑连词符号[n]即>、<>、~、&、|[n]都只能连接公式[n]不能直接连接项[n]连接后的整体也是公式[en]All propositional logic connective[n]symbols, ie, >, <>, ~, &, |[n]can only connect formulas[n]They can't directly connect terms[n]After connection, the expression is also formula
:%*,1,4@[zh]比如输入Vx:x>x[n]系统会报错[n]因为x出现在V后[n]就判定x为变量[n]而“>”不能连接变量[en]E.g., enter Vx:x>x[n]You will get an error[n]Because x occurs after V as a variable[n]but ">" cannot connect variables
// :%,4@

:vx=x,5$[[a7]][=ac:"a7"][=unl:true][zh]等词公理a7[en]equational axiom a7
:vx=x,4$[=getD:10]

// 等词性质

:a8,1#[d]$0=$1⊢$1=$0
:%*,4,5@[zh]a8公理使用提示1[n]若想把$a=$b中的$b替换成$c[n]写“#rp($a=$b,$b,$c,0)”[n]会发现系统无法计算#rp函数[n]因为$a的值不确定，[n]不能判断是否会[n]也包含$b并参与替换。[en]Axiom a8 usage tip 1[n]To replace $b with $c in $a=$b[n]you'll find that system cannot execute [n]replacement expression “#rp($a=$b,$b,$c,0)”[n]Because value of $a is uncertain[n] it may participates in replacement[n] if it also contains $b
:%*,4@[zh]a8公理使用提示2[n]若想把$a=$b中的$a替换成$c[n]写“#rp($a=$b,$a,$c,1)”[n]则没问题，因为$a第一个出现[n]是一定要被替换的。因此[n]让系统只替换第一个变量[n]不再管后面的变量即可[en]Axiom a8 usage tip 2[n]To replace $a with $c in $a=$b[n]we can write “#rp($a=$b,$a,$c,1)”,[n] because $a occurs first so it must be replaced[n] Therefore let system replace only first variable[n]and ignore latter variables
:%*,2$[=getD:30]
:%,1@[zh]导航提示：[n]1.这里离解锁皮亚诺公理[n]ZFC公理与类型层[n]仅有三个方块距离了，[n]2.旁边有着#nf与<>的门后[n]可解锁一阶逻辑大礼包[en]Navigation tips:[n]1. Here is only 3 blocks away from unlocking [n]Peano axioms, ZFC axioms and type layers[n]2. Behind gate with #nf and <>, you can[n]unlock useful 1st-order logic toolkit
:%*,2#[[terr1]][=ac:"terr1"][d]#nf($2,$0) ⊢ (∃$0:($1∨$2)) ↔ ((∃$0:$1)∨$2)
:%*,3#[[terr2]][=ac:"terr2"][d]#nf($2,$0) ⊢ (∀$0:($1∧$2)) ↔ ((∀$0:$1)∧$2)
:%*,2,5#[d]$a1=$a2,$b1=$b2 ⊢$a1∈$b1 ↔ $a2∈$b2
:%*,2,5,2#[[elV1]][=ac:"elV1"][d]∀x:∀y:f(x)=f(y)⊢ f($x)=f($y)
:%*,2,5,2,2$[[copygateD]][=unl:true]自动抄写技能[n]将上次碰到的门上的命题[n]自动抄下，以便复制
:%*,2,5,2,1@[zh]连续消除两个量词[n]需要局部变量机制：[n]由“#”开头的叫局部变量[n]它保证与一切“$XX”的值都不同[n]ZFC集合论后不远的包含符号[n]周围有详细介绍使用方法[en]Eliminating 2 quantifiers consecutively[n]needs local variable mechanism:[n]Local variable started with “#”[n]Guarantes different from all “$XX” values[n]Near inclusion symbol behind ZFC set Theroy[n]There're detailed usage instructions around
:%*,2,5,2,5@
:%*,2,5,3#[d]#nf($2,$0) ⊢ (∀$0:($1→$2)) ↔ ((∃$0:$1)→$2)
:%*,2,5,4#[d]#nf($2,$0) ⊢ (∀$0:($1∨$2)) ↔ ((∀$0:$1)∨$2)
:%*,2,5,3,5$[[.1st]][=ac:".1st"][=unl:true][zh]一阶逻辑大礼包[en]useful first-order logic[n] theorem toolkit
:%*,4;1;2;1;1;1;1;1;1;2;2;1;1;1;1;1;1@
:%*,4,1,2,1,1,1,1,1,1#[=payD:5e3]
:%,1#[d]$0=$1,$1=$2⊢$0=$2
:%*,3#[p](∀x:∃y:f(x)=g(y)) ↔(∀m:∃n:f(m)=g(n))
:%*,3,5$[[mnt]][=dstrTarget:"port-rp"][=ac:"mnt"][=dstr:"#rp"]
:%*,3,4$[=getD:333]
:%,2#[=payD:100]
:%*,5$[[type]][=ac:"type"][=unl:true][zh]类型层[en]type layer
:%*,3$[[peano]][=ac:"peano"][=unl:true][zh]皮亚诺公理[n]apn1 - apn5[n]与10以内数字定义[en]Peano axioms[n]apn1 - apn5[n]and definitions for numbers ≤10
:%,1$[[aExt]][=ac:"aExt"][=unl:true][zh]ZFC集合论[n]外延公理(aExt)[en]ZFC set theory[n]axiom of extensionality (aExt)
:%,2@[zh]卡住了？可交钱绕行[en]Stucked? Pay deductrium to bypass
:%,1#[=payD:100]
:%,2;1;1@
:%,1@[zh]其实若解锁了[n]互推替换元定理[n]就可直接生成：[n]先证( ⊢ (~(($0>$1) > ~($1>$0)) <> ($0<>$1)))[n]然后使用元定理[n]把aExt的内容作为$$2[n]$$3填0（意思为全部替换）[en]If unlocked IFF metatheorem[n] you can directly generate:[n]First prove ( ⊢ (~(($0>$1) > ~($1>$0)) <> ($0<>$1)))[n]Then use metatheorem:[n]Enter aExt content as $$2[n]then enter 0 as $$3 (meaning replace all)
:%,1@[zh]如果用不惯或未解锁元定理[n]也可使用一阶逻辑大礼包中的[n]“.<>rxx”系列推理宏规则[n]结合“.<>s”、“.<>t”、“.<>1”等[n]手动等价代换得到[en]If not used to or not unlocked metatheorem[n]you can also use ".<>rxx" series macro rules[n]in first-order logic toolkit[n]combine with ".<>s", ".<>t", ".<>1", etc.[n]to manually get equivalent substitution for iff
:%,1#[=payD:66]
:%,1@
:1st,5,3,4$[[dE]][=unl:true][zh]量词符号[n]“∃”(E)[en]quantifier symbol[n]“∃”(E)
:%*,2#[p](∃$0:($1∨$2)) ↔ ((∃$0:$1)∨(∃$0:$2))
:%*,2,5$[=getD:123]
:%,5#[d]#nf($1,$0) ⊢ ∃$0:$0=$1
:%,5$[=getD:30]

// mcvt, mvt, vxvy = vyvx
:1st,3,3#[=payD:100]
:%*,4$[[base-3]][zh]获得奖励：[n]若序数进位基底大于5[n]则将基底减1[en]Obtain Reward:[n]Reduce the limit carry base by 1[n]if the ordinal base is greater than 5
:%*,5$[[mcvt]][=dstrTarget:"V"][=unl:true][zh]条件概括元定理[n]并拆除门#V[n](门#V后解锁概括元定理)[en]conditional generalization metatheorem[n]and destruct gate #V[n](Unlock Generalization metatheorem behind gate #V)
:%,1#[=payD:100]
:%*,4$[[base-4]][zh]获得奖励：[n]若序数进位基底大于5[n]则将基底减1[en]Obtain Reward:[n]Reduce the limit carry base by 1[n]if the ordinal base is greater than 5
:%*,2#[[V]][zh]该门后可解锁概括元定理[n]#V[en]Generalization metatheorem #V[n]can be unlocked behind this gate
:%*,2,5$[[mvt]][=ac:"mvt"][=unl:true][zh]概括元定理[en]generalization metatheorem
:%,1#[p](∀$0:∀$1:$2)→$2
:%,4#[p](∀$0:∀$1:$2)→(∀$1:∀$0:$2)
:%,4#[p](∃$0:∃$1:$2)→(∃$1:∃$0:$2)
:%*,2$[=getD:60]
:%,4#[p](∃$0:∀$1:$2)→(∀$1:∃$0:$2)
:%,5$[=getD:70]
:mcvt,0#[p](∀$0:($1∧$2)) ↔ ((∀$0:$1) ∧ (∀$0:$2))
:%,2$[=getD:40]
:mcvt,3@[zh]条件概括元定理可把[n]定理的所有条件和结论[n]都加上相同的量词[en]Conditional generalization metatheorem[n] can add same quantifier to all conditions [n]and conclusions of a given deduction rule
:mvt,0@[zh]概括元定理是说[n]若定理的所有条件[n]都没自由出现$0[n]则可单独在结论中[n]加上量词V$0[en]Generalization metatheorem states that[n]if all conditions of a rule[n]have no free occurrence of $0[n]then quantifier V$0 can be added to conclusion
// 分离公理与空集

:aExt,1#[p]∀x:∀y:((∀z:(z∈x↔z∈y))→(x=y))
:%,1$[[aSep]][=unl:true][zh]ZFC集合论[n]分离公理(aSep)[en]ZFC set theory[n]axiom of separation (aSep)
:%*,2#[[ext<]][=ac:"ext<"][p]∀x:∀y:((x⊂y)→((y⊂x)→(x=y)))
:%*,2,3#[[elV2]][=ac:"elV2"][p](($x⊂$y)∧($y⊂$x)) → ($x=$y)
:%*,2,2$[=getD:150]
:%*,2,3,5$[=getD:198]
:%*,2,3,1@[zh]看似直接使用两次[n]“<a4”规则即可消去量词[n]但$x或$y可能是y或x[n]因此可能一个变量被替换两次[en]It seems that applying the"<a4" rule[n] twice would directly eliminate the quantifiers.[n]However, $x or $y could be y or x,[n]which may cause a variable being replaced twice.
:%*,2,3,1,5@[zh]解决方法：先把x、y替换成[n]与$x、$y永不相同的[n]#x、#y，然后用概括定理[n]加上量词V#x:V#y:[n](也可先用a6公理加量词[n]再用“vv<a4”消内部量词[n]并同时将x/y替换为#x/#y）[en]Solution: First replace x and y with[n]#x and #y, symbol “#” are guaranteed to be different from “$”.[n]Then apply the generalization theorem[n]with the quantifiers ∀#x:∀#y:[n](Or, you can first introduce quantifiers using Axiom a6,[n]then eliminate the inner quantifier with rule "vv<a4",[n]while replacing x/y with #x/#y).
:%*,2,3,2@[zh]然后再使用两次[n]“<a4”规则消去量词[n]这时由于$x、$y不可能是[n]#x、#y，不再出现循环替换问题[en]Then apply the "<a4" rule twice to remove the quantifiers.[n]Since $x and $y cannot be #x and #y,[n]the problem of cyclic substitution is avoided.

:%*,2,5@[zh]受够了自由出现[n]的条件#nf了吗？[n]快试用“#”开头的局部变量[n]在录制宏的过程中[n]它将视为与一切“$”开头[n]的符号都不同[n]摆脱#nf的困扰[en]Tired of the #nf condition for variables?[n]Try using local variables prefixed with "#".[n]During macro recording,[n]they are treated as distinct from all symbols starting with "$",[n]freeing you from #nf constraints.

:%*,3#[p](x⊂y)→((y⊂z)→(x⊂z))
:%*,3,2$[=getD:50]
:%,1@[zh]尝试把分离公理中的$0[n]替换为~(z=z)[n]以证明空集存在[en]Try replacing $0 in the Axiom of Separation[n] with ~(z=z) to prove the existence of the empty set.
:%*,1#[=payD:5e3]
:%*,5$[[d<]][=unl:true][zh]谓词包含符号“⊂”(<)[en]the predicate inclusion symbol "⊂" (<).
:%,2#[[empty]][=ac:"empty"][p]∃y:∀z:¬(z∈y)
:%*,5#[p]∀x:∀y:¬∀a:¬∀z:(z∈a↔(z∈x ∧ z∈y))
:%*,5,2$[=getD:10]
:%*,5,0#[p]∀x:∀y:∃!a:∀z:(z∈a↔(z∈x ∧ z∈y))
:%*,5,0,5$[[dI]][=unl:true][zh]交集运算符[n]“∩”(I)[en]the intersection operator[n]“∩” (I).
:%*,5,0,5,0#[=payD:5e3]
:%,1@
:%,1@[zh]提示:配对公理大概说的是[n]任意两个集合x,y[n]都存在集合{x,y}[en]Hint: The Axiom of Pairing roughly states that[n]For any two sets x, y,[n]the set {x, y} exists.
:%,1#[[beforePair]][=payD:500]
:%*,3#[[port-rp]][zh]未解锁的闸门无法通过[n]请寻找线索解开闸门[n]#rp[en]Unlocked gates cannot be passed[n]Find clues to unlock it[n]#rp
:%,2#[d]∀$x:($1 ↔ $2) ⊢(∃!$x: $1) ↔ (∃!$x: $2)
:port-rp,1;2;1@
:%,1#[d]∀$x:($1 ↔ $2) ⊢ #rp($1,$x,$y)↔#rp($2,$x,$y)
:%,1@
:%,1#[=payD:4e3]
:%,1$[[ifft-EU]][=unl:true][zh]替换元定理中[n]可跨越量词E!进行替换[en]Replacement across the quantifier E![n]In the IFF Metatheorem
:port-rp,1@[zh]后方解锁替换元定理中[n]可跨越量词E!进行替换[en]Go forward to unlock Replacement [n]across the quantifier E! in IFF Metatheorem
:port-rp,3@[zh]特称元定理可给[n]任何带一个条件的规则[n]的条件和结论都加上[n]相同的存在量词[en]The Existential Metatheorem adds[n]the same existential quantifier[n]to both the condition and conclusion[n]of any rule with one condition
:port-rp,2@[zh]尝试执行规则">veve.Vcn"[n]试试一键证明[n]“解锁特称元定理”方块[n]旁边的定理[en]Try executing the rule ">veve.Vcn"[n]to proof the theorem next to the[n]"Unlock Particularization Metatheorem" block
:port-rp,5#[d]#nf($1,$z) ⊢ ∀$4:∃$3:∀$2:∃$0:∀$x:$1 →∀$4:∃$3:∀$2:∃$0:∀$z:#rp($1,$x,$z)
:port-rp,4#[=payD:1e4]
:%,5$[[met]][=unl:true][zh]特称元定理[en]Existential Metatheorem
:d<,4@[zh]向前走，有更多关于证明[n]空集存在性的提示[en]Go forward for more hints on proving[n]the existence of the empty set.
:%,3@[zh]首先把分离公理[n]通过互推替换化简为[n]正常人类使用的形式：[n]Vx:Ey:Vz:[n](z@y <> (z@x & ~z=z))[en]First, simplify the Axiom of Separation[n]through IFF metatheorem into [n]a form read by normal humans:[n]Vx:Ey:Vz:(z@y <> (z@x & ~z=z))
:%,3@[zh]由于我们通过a7公理[n]知道z=z是对的，因此[n]~z=z是错的，[n]继而有z@x & ~z=z是错的[n]则与之等价的z@y也是错的[en]Since via axiom a7[n] we know z=z is true, thus[n]~z=z is false,[n]thus z@x & ~z=z is false[n]Then equivalent z@y is also false
:%,3@[zh]具体做法：先证明$zz ⊢ [n]($zy<>($zx&~$zz)) <> ~$zy[n](提示：命题逻辑自动推理[n]元规则可一键完成该证明)[n]然后将$XXX代入具体值[n]使用互推替换即可[en]Specific approach: First prove $zz ⊢ [n]($zy<>($zx&~$zz)) <> ~$zy[n](Hint: Completeness metarule can[n] complete this proof with one click)[n]Then substitute specific values for $XXX[n]use IFF metatheorem
:d<,2#[[.<i]][=ac:".<i"][p]$0⊂$0
:%,5$[=getD:30]

:crp,3#[=payD:19]
:%,5$[[dE!]][=unl:true][zh]唯一存在量词[n]“∃!”(E!)[en]unique existence quantifier[n]“∃!”(E!)
:%,5#[p](∃!x:∀y:¬y∈x)↔((∃x:∀y:¬(y∈x))∧(∀x:∀z:(((∀y:¬(y∈x))∧∀y:¬(y∈z)) → x=z)))
:%,5$[=getD:49]
:%,0@
:%,5#[p]∃!x:∀y:¬y∈x
:%,2#[=payD:501]
:%,5$[[d{}]][=unl:true][zh]空集常量符号[n]“{}”[en]empty set constant symbol[n]“{}”
:dE!,2#[d]#nf($a,y), #nf($b,x) ⊢ (∃x:∃y:($a∧$b))↔(∃x:$a∧∃y:$b)
:%,5$[=getD:399]
:dE!,4#[=payD:2e3]
:%,1$[[omit-fn]][=unl:true][zh]简化显示#nf等系统函数[en]Display Omitted [n] System Functions e.g. #nf(...)
// 配对公理、正则公理

:beforePair,4$[[aPair]][=unl:true][zh]ZFC集合论[n]配对公理(aPair)[en]ZFC set theory[n]axiom of pairing (aPair)
:%*,4#[p]∀x:∀y:∃z:(x∈z ∧ y∈z)
:%,5#[p]∀x:∀y:∃!z:∀a:(a∈z ↔ (a=x ∨ a=y))
:%,2#[=payD:1e3]
:%,5@
:%,0$[[d{..}]][=unl:true][zh]配对集合构造符号[n]“{#0,#1}”[en]pairing set construction symbol[n]“{#0,#1}”
:%,5#[p]{$0,$1}={$1,$0}
:%*,2$[[d{.}]][=unl:true][zh]一元集合构造符号[n]“{#0}”[en]unary set construction symbol[n]“{#0}”
:%,0#[p]$0∈{$0,$1}
:%*,3$[=getD:99]
:%,5#[p]∀a:((∃x:x∈a) → ¬(a∈{{},{}}))
:%*,3$[=getD:188]
:%,0#[p]a∈{b} ↔ a=b
:%*,0#[=payD:5e3]
:%*,0,5$[[.zfc]][=ac:".zfc"][=unl:true][zh]ZFC简化大礼包[n]即用更方便的[n]人类习惯的符号[n]重新书写ZFC所有公理[en]ZFC simplify toolkit[n]which rewrites all ZFC axioms[n]using more convenient symbols[n] that human get used to
:%,5#[p]{a}={b} ↔ a=b
:%*,3#[p]$c＼($a∪$b)=($c＼$a)∩($c＼$b)
:%*,3,1@提示：解锁差集符号“＼”[n]需要先解锁有序数对[n]或重新证明皮亚诺公理
:%*,3,2$[=getD:4e3]
:%*,5#[[a@a]][=ac:"a@a"][p]¬(a∈{{a}})
:%*,5,2@[zh]集合论中直接定义：[n]0={}，S(x)=xU{x}[n]若皮亚诺公理此时[n]不限制只对数推理的话[n]会推出矛盾[en]In set theory, we have definitions: [n]0={} and S(x)=x∪{x}[n]If the Peano axioms[n]are not restricted to natural numbers[n]this leads to a contradiction
:%*,5,2,1@[zh]若apn5中去掉$0中[n]不自由出现x的条件[n]也能推出矛盾。[en]If the condition that x does not occur freely[n]in $0 is removed from apn5,[n]a contradiction can still be derived.
:%*,5,2,1,3@[[apn5-err-in]][zh]向前走获得错误的[n]apn5公理apn5x[n]该公理只能在前方[n]门后的区域中使用[en]Go forward and get the incorrect[n]apn5 axiom: apn5x.[n]This axiom can only be used in the area[n]beyond the gate ahead.
:%*,5,2,1,1@[zh]分离公理中的[n]不自由出现条件[n]取消掉后也能推出矛盾。[en]If the non-free occurrence [n]condition in the Axiom of Separation is removed,[n] a contradiction can also be derived.
:%*,5,2,1,1,5@[[asep-err-in]][zh]向前走获得错误的[n]asep公理asepx[n]该公理只能在前方[n]门后的区域中使用[en]Go forward and get the incorrect[n]asep axiom: asepx.[n]This axiom can only be used in the area[n]beyond the gate ahead.
:%*,5,3$[=getD:4.2e3]
:%*,5,5$[[aChoice]][=unl:true][zh]ZFC集合论[n]选择公理(aChoice)[en]ZFC set theory[n]axiom of choice (aChoice)
:%,0#[p]{a,b}={b,c} ↔ a=c
:%*,2$[[aReg]][=unl:true][zh]ZFC集合论[n]正则公理(aReg)[en]ZFC set theory[n]axiom of regularity (aReg)
:%*,3#[d]{{$a},{$a,$b}}={{$c},{$c,$d}} ⊢ ($a=$c) ∧ ($b=$d)
:%*,3,4$[[d()]][=ac:"d()"][=unl:true][zh]有序数对符号[n] (a, b)[en]the ordered pair symbol[n](a, b).
:%*,4#[=payD:100]
:d(),2#[=payD:2e4]
:d(),4#[=payD:2e4]
:d(),3@[zh]整个{..|..}是项[n]其中z(x)中的x被[n]广义量词“x@y”约束[n]注意y中的x（如果有）是自由的[en]The entire {..|..} is a term.[n]Here, x in z(x) is bound by[n]the generalized quantifier “x@y”.[n]Note that x in y (if any) is free.
:d(),4,5$[[d{@|}]][=unl:true][zh]分离公理[n]构造集合符号[en]the set construction symbol[n]from the Axiom of Separation.
:d(),3,5@[zh]{x@y|z(x)}的意思是[n]把集合y中满足条件z(x)[n]的元素拿出来[n]构成新集合。[n]z是谓词，z(x)是公式[en]{x@y|z(x)} means[n]to take the elements from set y[n]that satisfy the condition z(x)[n]and form a new set.[n]z is a predicate, and z(x) is a formula.
:d(),3,1@[zh]{z(x)|x@y}的意思是[n]把集合y的所有元素x[n]通过函数z映射到z(x)[n]构成新集合。[n]z是函数，z(x)是项[en]{z(x)|x@y} means[n]to map all elements x of set y[n]through the function z to z(x)[n]and form a new set.[n]z is a function, and z(x) is a term.
:d(),2,1$[[d{|@}]][=unl:true][zh]替换公理[n]构造集合符号[en]the set construction symbol[n]from the Axiom of Replacement.
:d(),0,0,5#[[.pn1]][p]{}∈ω
:%,5#[=payD:6e3]
:%,0$[[mc]][=unl:true]自定义常量的公理模式[n]元规则mc
:%,3@用法：$$0是新常量名[n]该名字不能在[D]或[P]中[n]的约束变量中出现过
:%,1@$$1为任意的约束变量名，如x[n]$$2则是关于该常量的性质[n]但用$$1来表达
:%,4@给个例子：重新定义空集[n]$$0：empty[n]$$1：x[n]$$2：Vy:~y@x  

:d(),3,4#[d]#nf($x,$z), #nf($y,$z) ⊢[n] $x ∩ $y = {$z∈$x|$z∈$y}
:%,1$[[dsub]][=unl:true]差集运算符[n]“＼”
:d(),3,2#[p]¬0∈(N＼{0})
// :d(),3,2#($a＼$b)U$b=$aU$b[n]#p
:d(),3,2,5$[=getD:500]

:d(),1#[p]∀x:∀y:∃d:∀a:∀b:((a∈x∧b∈y)↔(a,b)∈d)
:d(),1,2$[[dX]][=ac:"dX"][=unl:true][zh]集合[n]笛卡尔积运算[n]“×”(X)[en]the set[n]Cartesian product operation[n]“×”(X).
:dX,1#[p](1,2)∈N×N
:%,1;1;1@..........
:%,1#[p]∀a:∀b:∀x:(x∈a×b → ∃!m:∃!n:x=(m,n))
:%*,3#[=payD:2e4]
:%*,3,5$[[mf]][=unl:true]自定义函数公理模式[n]元规则mf
:%,1@
:%,1$[[d()pr]][=unl:true][zh]有序数对投影函数[n]Pr1与Pr2[en]the ordered pair projection[n] functions Pr1 and Pr2.
:%,1#[p]x = Pr1((x,y))
:%,1#[p]y = Pr2((x,y))
:%,2#[p]∀x:(x∈(N＼{0})→∃y:x=S(y))
:%,1#[p]∀x:(x∈N×{0,1}→(Pr2(x)=0∨Pr2(x)=1))
:%,1@[zh]ZFC中把整数a-b看成(a,b)[n]其中a与b是自然数[en]In ZFC, the integer a-b is[n] represented as (a,b),[n]where a and b are natural numbers.
:%,1$[[dfZ]][=unl:true][zh]整数等价类生成函数“Z”[en]the integer equivalence[n] class generating function “Z”.
:%,1@[zh]若a+d=b+c，则[n](a,b)跟(c,d)表示同一个整数[n]因此ZFC中把整数[n]定义为整个等价类的集合[en]If a+d=b+c, then[n](a,b) and (c,d) represent the same integer.[n]Therefore, in ZFC, integers are defined[n]as the set of the equivalence class.
:%,1$[[dZ]][=ac:"dZ"][=unl:true][zh]整数集合(Z)[en]the set of[n] integers (Z).
:%,1#[p]Z((0,0))=Z((1,1))
:%,1#[p]Z((1,2))=Z((0,1))
:%*,3@[zh]有难度？绕行的路上给些提示[en]Too difficult? [n]Get some hints [n]along the detour.
:%*,3,1#[[.Zr]][d]$x∈N,$y∈N,$z∈N⊢Z(($x,$y))=Z(($x+$z,$y+$z))
:%,2#[d]x1a∈N,x2a∈N,x1b∈N,x2b∈N,y1a∈N,y2a∈N,y1b∈N,y2b∈N,Z((x1a,x2a))=Z((x1b,x2b)),Z((y1a,y2a))=Z((y1b,y2b))⊢Z((x1a+y1a,x2a+y2a))=Z((x1b+y1b,x2b+y2b))
:%,1$[[dZ+]][=unl:true][zh]整数加法运算[en]the integer[n] addition operation.
:%,1#[p]$1∈Z→($2∈Z→($1+$2)∈Z)
:%,1#[p]$1∈Z→($2∈Z→($1+$2)=($2+$1))
:%,1$[[dZ<=]][=unl:true][zh]整数序关系谓词[en]the integer[n] order relation predicate.
:%,1#[p]($x∈Z∧$y∈Z∧$x≤$y∧$y≤$x)→$x=$y
:%,2$[[dZ*]][=unl:true][zh]整数乘法运算[en]the integer[n] multiplication operation.

:mf,2@用法：$$0是新函数名[n]该名字不能在[D]或[P]中[n]以谓词形式出现过[n]即出现的$$0(...)是项，不能是公式
:%,2@$$1是变量列表[n]是几元函数就输入几个变量[n]如x,y,z[n]$$2为任意的约束变量名，如a
:%,5@$$3则是关于该函数的性质的公式[n]其中$$2代表函数值[n]$$1是函数的参数
:%,4@$$3则是关于该函数的性质的公式[n]其中$$2代表函数值[n]$$1是函数的参数
:%*,2@注意：这里函数值[n]完全没说唯一性[n]f(...)只代表是[n]满足$$3关系的某个函数值
:%,4@给个例子：重新定义幂集函数[n]$$0：powerset[n]$$1：x[n]$$2：a[n]$$3：Vn:(n<x<>n@a) 


:.Zr,5$[[dZn]][=unl:true][zh]整数常数定义[n]如dZ0/dZ-1/dZ2[n]将引入整数+0/-1/+2[en]the integer constant definitions[n]such as dZ0/dZ-1/dZ2.[n]This introduces the integers +0/-1/+2.
:.Zr,2$[=getD:5e3]
:%,1#[d]$x∈N,$y∈N,$z∈N⊢Z(($x,$y))=Z(($z,0))↔$x=$y+$z
:%,1$[=getD:5e3]
:%,1#[d]$x∈N,$y∈N,$z∈N⊢Z(($x,$y))=Z((0,$z))↔$y=$x+$z
:%,1$[=getD:5e3]
:%,1#[d]$x∈N,$y∈N⊢$x≤$y∨$x≥$y
:%,1#[=payD:1e5]

// :dX,1#~(1,0)@NX(N\{0})[n]#p


:.pn1,3@[zh]我们将在集合论框架下[n]实现皮亚诺公理系统[en]We'll implement the Peano Axiom System[n]within the framework of set theory.
:%,1;2;1@
:%,1@[zh]空集相当于0[n]后继S(x)相当于xU{x}[en]The empty set is equivalent to 0.[n]The successor S(x) is[n] equivalent to xU{x}.
:%,1@[zh]要将ω与ℕ两者等同[n]就要重新“证明”5个公理[en]To equate ω and ℕ,[n]we must “prove” the 5 axioms again.
:%,1@
:%,1#[[.pn2]][p]∀n:(n∈ω → n∪{n}∈ω)
:%,2;1;1;@oma
:%,1@[zh]提示：证明序数ω2的存在性[n]需要使用替换公理[en]Hint: Proving the existence of the ordinal ω2[n]requires the use of the Axiom of Replacement.
:%,1;1;1@
:%,1#[[.pn3]][p]∀x:¬x∪{x}={}
:%,2;1;1;1;1;1@..........
:%,1@[zh]旁边付费看提示[en]Pay nearby to see the hint.
:%,1#[[.pn4]][p]∀x:∀y:(x∪{x}=y∪{y}→x=y)
:%,2;1;1;1;1;1;1@...............
:%,1#[[.pn5]][d]#nf($0,x) ⊢ #rp($0,$1,{})→(∀x:(x∈ω→(#rp($0,$1,x)→#rp($0,$1,x∪{x})))→∀x:(x∈ω→#rp($0,$1,x)))
:%,2;1;1;1@................
:%,1$[[del-pn]][=dstrTarget:".pn"][=dstr:"#pn"]
:%,1#[[.pn]][zh]未解锁的闸门无法通过[n]请寻找线索解开闸门[n]#pn[en]Locked gate cannot be passed.[n]Find clues to unlock it[n]#pn.
:%,4$[=getD:1e4]
:.pn,3$[[dSd0]][=ac:"dSd0"][=unl:true][zh]自然数与[n]后继函数[n]的集合论定义[en]the ZFC set definitions of [n]natural numbers and successor function

:.pn4,5,5#[=payD:3e3]
:%,3@
:%*,3@[zh]从前提易得x@yU{y}[n]因此要么x=y要么x@y[n]正则公理可证x@y不可能[n]因此x=y得证[en]It is easily derived from the premise that x@yU{y}.[n]Therefore, either x=y or x@y.[n]The Axiom of Regularity[n] proves x@y is impossible.[n]Thus, x=y is proven.
:%,2@[zh]提示还不够？[n]没事，继续付费嘛！[en]Not enough hints?[n]No worries, continue paying!
:%,2#[=payD:3e3]
:%,3@
:%,3@[zh]因为x跟y的地位对称[n]所以同样可得到y@x[n]即：若~x=y，有x@y&y@x成立。[n]易证集合{x,y}违背了正则公理[n]说明假设~x=y错误[en]Because x and y are symmetric,[n]we can similarly get y@x.[n]That is: If ~x=y,[n] then x@y & y@x holds.[n]It is easily proven that the set [n]{x,y} violates the Axiom of Regularity,[n]which shows that[n] the assumption ~x=y is false.

:.pn2,5@[zh]侧面买提示[en]Buy a hint on the side
:%,3#[=payD:3e3]
:%,3@
:%,3@[zh]由omega定义可知[n]x属于omega等价于[n]x属于任意一个归纳集S[n]对xU{x}也同理[n]x@omega推出x@S[n]归纳集定义可知[n]x@S能推出xU{x}@S[en]From the definition of omega,[n] we know that x is [n]an element of omega if and only if[n]x is an element of any inductive set S.[n]The same applies to xU{x}.[n]x@omega implies x@S.[n]From the definition of an inductive set,[n] we know that x@S implies xU{x}@S.
:.pn5,5,0@[zh]侧面买提示2[en]Buy hint 2 on the side.
:%,3#[=payD:4e3]
:%,3@
:%,3@[zh]自然数是最小的归纳集[n]因此{x@omega|P(x)}=omega[n]所以P(x)对所有自然数成立[en]The natural numbers are the smallest inductive set.[n]Therefore, {x@omega|P(x)}=omega.[n]So, P(x) holds for all natural numbers.
:.pn5,5@[zh]侧面买提示1[en]Buy hint 1 on the side.
:%,3#[=payD:5e3]
:%,3@
:%,3@[zh]归纳集指满足{}@x且[n]Va:(a@x>aU{a}@x)的集合[n]若已知P(0)、Vx:(P(x)>P(xU{x}))[n]可证{x@omega|P(x)}是个归纳集[en]An inductive set is a set [n]that satisfies {}@x and[n]Va:(a@x > aU{a}@x).[n]If P(0) and Vx:(P(x) > P(xU{x})) are given,[n]we can prove that {x@omega|P(x)} is an inductive set.

:.pn5,2,2#[d]$x∈N,$y∈N ⊢($x≤$y∧¬$x=$y) ↔ $x∈$y
:%,5$[=getD:3e4]

:aReg,3#[p]∃quiv(ω,ω∪{ω})
:%,1@[zh]提示：omega、Equiv[n]的定义分别在[n]序数ω^ω+ω^2与[n]序数ω^ω^ω附近[en]Hint: Definitions of omega、Equiv are [n]respectively near ordinal [n]ω^ω+ω^2 and ordinal ω^ω^ω
:%,2$[=getD:1.5e6]
:%,1@[zh]提示：利用反证法[n]假设存在双射r，则可[n]通过“对角线法则”[n]构造矛盾[en]Hint: Use proof by contradiction[n]Assume bijection r exists, then[n]construct contradiction via "diagonal method"
:%,1#[p]¬∃quiv(ω,Pow(ω))
:%,1$[[delAl]][=dstrTarget:"Aleph"][=ac:"delAl"][=dstr:"#א"]
:%,1$[=getD:1.2345678899999999e7]
:%,1@[zh]提示：门#א在序数的尽头之后[en]Hint: Gate #א is beyond end of ordinals
:aChoice,2#[[vwo]][=ac:"vwo"][p]∀x∃r:WellOrder(x, r)
:%*,1@[zh]提示：解锁WellOrder(良序)的定义[n]需要到达序数ω^(ω2)[n]（前往该序数需在[n]解锁并集公理的不远处[n]用替代公理证明[n]{ω,ω+1,ω+2,...}[n]的存在性）[en]Hint: Unlock WellOrder definition[n]Need to reach ordinal ω^(ω2)[n](To get there, near unlocked union axiom[n]use replacement axiom to prove[n]{ω,ω+1,ω+2,...}[n]existence)
:%,2$[=getD:4.2e8]
// 并集、幂集、无穷公理、序数之门
:empty,3@[zh]卡住了？前往序数[n]ω³+ω²3+ω5+7查看[n]证明并集符号U合法性的提示[en]Got Stucked? Go to the ordinal[n]ω³+ω²3+ω5+7 to see a hint [n]for proving the legality[n] of the union symbol U.
:empty,2$[[aUnion]][=unl:true][zh]ZFC集合论[n]并集公理(aUnion)[en]ZFC set theory[n]axiom of union (aUnion)
:%,5#[p]∀x:∀y:∃z:∀w:(w∈z ↔ (w∈x ∨ w∈y))
:%*,5$[[dU]][=unl:true][zh]并集公理定义的“Union”函数[n]与二元函数符号“U”[en]the “Union” function [n]defined by the Axiom of Union[n]and the binary function symbol “U”.
:%,2$[[aPow]][=unl:true][zh]ZFC集合论[n]幂集公理(aPow)[en]ZFC set theory[n]axiom of power set (aPow)
:aUnion,4#[p]∀x:∃y:∀z:(z∈y ↔ z⊂x)
:%,1$[[base5]][zh]将序数进位基底[n]降至5[n](提示：到达在#ω门后的[n]序数ω^ω后才能[n]解锁无穷公理)[en]Reduce ordinal base to 5[n](Hint: After reaching ordinal ω^ω behind gate #ω[n]you can unlock axiom of infinity)
:base5,1#[p]∃x:(ω∈x ∧∀y:(y∈x → y∪{y}∈x))
:%*,3$[[ww2]][zh]到达序数[n]ω^(ω2)[en]Reach ordinal[n]ω^(ω2)
:%,1$[[base4]][zh]将序数进位基底[n]降至4[en]Reduce ordinal base to 4
:%,1#[p]∃x:∀z:(z∈x→(z={} ∨ ∃y:(y∈x ∧ z=y∪{y})))
// :%,1#Ex:({}@x &[n]Vy:(y@x > yU{y}@x))[n]#p
:%,1$[[w4234]][zh]到达序数[n]ω⁴4+ω³4+ω²4[en]Reach ordinal[n]ω⁴4+ω³4+ω²4
:%,0#[[UUII]][=ac:"UUII"][p]($a∩$b)∪$c = ($a∪$c)∩($b∪$c)
:%,1$[[aRepl]][=unl:true][zh]ZFC集合论[n]替换公理(aRepl)[en]ZFC set theory[n]axiom of replacement (aRepl)
// iff定理

:dE,1#[d]∀$2:($0↔$1)⊢(∃$2:$0)↔(∃$2:$1)
:%,5$[[I2]][=unl:true][zh]门#I2[en]gate #I2

:port-iff,2@[zh]此处向前有开#I3的钥匙[en]Ahead lies the key to open gate #I3
:port-iff,2,5#[d]$a1↔$a2,$b1↔$b2⊢($a1→$b1)↔($a2→$b2)
:%*,4$[=getD:24]
:port-iff,2,4#[d]$a1↔$a2,$b1↔$b2⊢($a1↔$b1)↔($a2↔$b2)
:%*,2$[=getD:24]
:%,5#[p]¬($0↔$1)↔(¬$0↔$1)
:%*,5#[d]$a1↔$a2,$b1↔$b2⊢($a1∧$b1)↔($a2∧$b2)
:%*,5,4$[=getD:29]
:%,4#[d]$a1↔$a2,$b1↔$b2⊢($a1∨$b1)↔($a2∨$b2)
:%*,2$[=getD:29]
:%,5$[[I3]][=unl:true][zh]门#I3[en]gate #I3
:iff,1#[[I1I2I3]][zh]该门上有三把锁：[n]#I1 #I2 #I3[n](提示：前两把锁在[n]解锁一阶逻辑之后)[en]This gate has three locks:[n]#I1 #I2 #I3[n](Hint: First two locks are after[n]unlocking first-order logic)
:%*,3$[[mifft]][=ac:"mifft"][=unl:true][zh]互推替换元定理[en]IFF (mutual replacement) metatheorem
:%*,3,5#[=payD:6e3]
:%*,2$[=getD:1e3]
:%,4;5@

:%,2#[d](B→A),(C→A)⊢((A∧B↔A∧C)↔(B↔C))
:%*,4$[=getD:37]
:%,1#[d](B→¬A),(C→¬A)⊢((A∨B↔A∨C)↔(B↔C))
:%*,2$[=getD:37]

// PeanoAxiom


:peano,1#[=payD:1e3]
:peano,4#[p]¬1=0
:%,5$[[add-mul]][=unl:true][zh]加法与乘法算数[en]addition and[n] multiplication arithmetic
:peano,2#[p]¬1=2
:%,1#[p]1+0=1
:%,2#[[1+1]][=ac:"1+1"][p]1+1=2
:%*,3#[p]3+4=7
:%*,2#[p]4+3=7
:%*,3,1$[=getD:111]
:%*,4#[[commu+]][=ac:"commu+"][p]$0∈N→($1∈N→$0+$1=$1+$0)
:%*,4,5$[=getD:1.11e3]
:%,1#[[2x2]][=ac:"2x2"][p]2*2=4
:%,1#[p]∀x:(x∈N→x*0=0)
:%,1#[p]$0∈N→$0*1=$0
:%,1#[p]$0∈N→$0*3=$0+($0+$0)
:%,1#[[commux]][p]$1∈N→($2∈N→$1*$2=$2*$1)
:%,1#[[xdistr]][=ac:"xdistr"][p]$1∈N→($2∈N→($3∈N→($1+$2)*$3=($1*$3)+($2*$3)))
:%*,0#[[3<4]][=ac:"3<4"][p]∀x:(x∈N→¬(4+x=3))
:%,1#[p]∀x:(x∈N→¬(4+x=0))
:%,1#[p]∀x:(x∈N→¬(4+x=1))
:1+1,3,5@[zh]证加法交换律[n]需要用数学归纳法apn5[n]若不会证[n]请向前走看教程[en]Proving additive commutativity[n]need axiom of induction apn5[n]If you get stucked[n]Go forward for tutorial
:%,5@[zh]首先证明对0成立[n]Vy:(y@N>0+y=y+0)[n]提示：证明该命题[n]也需要数学归纳法[en]First prove holds for 0[n]Vy:(y@N>0+y=y+0)[n]Hint: Prove this proposition[n]Also need induction (apn5)
:%,0#[p]∀y:(y∈N→0+y=y)
:%,5#[p]∀x:∀y:(x∈N→(y∈N→(x+y=y+x →S(x+y)=S(y+x))))
:%,0#[p]∀x:∀y:(x∈N→(y∈N→S(y)+x=S(y+x)))
:%,5@[zh]下面是重点：消去量词[n]看似直接使用两次[n]“<a4”规则即可消去量词[n]但$0或$1可能是y或x[n]因此可能一个变量被替换两次[en]The key point: Eliminating quantifiers.[n]It seems that applying[n] the "<a4" rule twice can work,[n]but $0 or $1 might be y or x,[n] may leading to substitution twice.
:%,0#[[elV3]][=ac:"elV3"][p]$0∈N→($1∈N→S($0)+$1=S($0+$1))
:3<4,1#[[5R6]][=ac:"5R6"][p]∀x:(x∈N→¬(x*5=6))
:3<4,2$[=getD:3.4e3]
:%*,2#[p]∀y:(y∈N→∃x:y*(y+1)=2*x)
:%*,2,5$[=getD:4.321e3]
:%,1#[p]∀x:(x∈N→¬(x+5=1))
:%*,3$[[d<=]][=unl:true][zh]序关系谓词符号[n]“≤”(<=)与“≥”(>=)[en]the order relation[n] predicate symbols[n]“≤”(<=) and “≥”(>=).
:%*,2#[p]$x∈N→$x≤$x
:%*,2,1#[=payD:1.2e5]
:%*,2,2#[p]($x∈N∧$y∈N∧$x≤$y∧$y≤$x)→$x=$y
:%*,2,2,5$[=getD:2.1e3]
:%*,2,2,1#[p]($x∈N∧$y∈N∧$z∈N∧$x≤$y∧$y≤$z)→$x≤$z
:%*,2,2,1,5$[=getD:2.2e3]
:%*,2,2,1,2#[p]($x∈N∧$y∈N∧$z∈N∧$x≤$y)→$x+$z≤$y+$z
:%*,2,2,1,2,5$[=getD:2.3e3]
:%*,2,2,1,2,1#[p]($x∈N∧$y∈N∧$z∈N∧$x+$z≤$y+$z)→$x≤$y
:%*,2,2,1,2,1,4$[=getD:2.4e3]
:%*,2,2,1,2,1,1#[p]($x∈N∧$y∈N)→$x≤$x*S($y)
:%*,2,2,1,2,1,1,5$[=getD:2.5e3]
:%*,2,2,1,2,1,1,1#[p]($x∈N∧$y∈N∧$z∈N∧$x≤$y)→$x*$z≤$y*$z
:%*,2,2,1,2,1,1,1,4$[=getD:2.6e3]
:%*,2,2,1,2,1,1,1,1#[p]($x∈N∧$y∈N∧$z∈N∧$x*S($z)≤$y*S($z))→$x≤$y
:%*,2,2,1,2,1,1,1,1,1$[[ddiv]][=unl:true][zh]整除谓词“∣”(/|)[en]the divisibility[n] predicate “∣”(/|).
:%*,2,2,1,2,1,1,1,1,1,1#[p]x∈N→((1∣x)∧(x∣0))

:%,1#[p]∀x:(x∈N→¬(x*5=1))
:%*,2#[=payD:5e3]
:%*,2,5$[[kit+*]][zh]获得常见[n]加法乘法性质定理[n]大礼包！[en]Obtain a tookit of common[n]theorems on the properties of[n] addition and multiplication!
:%,1$[=getD:5.1e3]
:%*,3#[p]1*2*3*4*5*6*7*8*9 = 10*(8+10*(8+10*(2+10*(6+10*3))))
:%*,3,5$[=getD:1e3]
:%*,4#[p](-13)*(+23)=(-299)
:%*,4,4$[[dZop]][=unl:true][zh]自动计算[n]整数的加减法与乘法[n]如.1*-2生成[n]⊢ +1 * -2 = -2[en]automatic calculation[n]of integer addition, subtraction,[n] and multiplication.[n]For example, .1*-2 generates[n]⊢ +1 * -2 = -2.

:%,2#[=payD:5.09e3]
:%*,1@[=unl:true][zh]后命令行输入.3+4[n]可生成规则⊢3+4=7[n]乘法同理[en]After unlocking, enter ".3+4"[n]in the command line to[n] generate the rule ⊢3+4=7.[n]Multiplication is also supported.
:%,5$[[natop]][=unl:true][zh]所有正常计算机[n]能表示的自然数常量[n]且可自动计算加法与乘法[en]all natural number constants[n]representable by a normal computer[n]and enables automatic calculation[n] of addition and multiplication.
:5R6,1$[[dPrime]][=ac:"dPrime"][=unl:true][zh]谓词“是素数”[n](Prime)[en]predicate "is prime"[n](Prime)
:5R6,2#[p]Prime(2)
:%*,3$[[mprd]][=unl:true]自定义谓词公理模式[n]元规则mprd
:%*,4#[p]¬Prime(4)
:%*,4,5$[=getD:4e3]
:%*,4,4#[p]∀z:((z∈N∧¬z=0∧z≤3) → z∣6)
:%*,4,4,4#[[ex!]][=ac:"ex!"][p]∀x:∃y:(¬y=0∧∀z:((x∈N∧z∈N∧¬z=0∧z≤x) → (z∣y)))
:%*,4,4,4,5$[=getD:1.23456e5]
:%*,2#[[prm7]][=ac:"prm7"][p]Prime(7)
:%*,2,1$[=getD:7e3]
:%*,2,2#[p]∀x:∀y:((x∈N∧y∈N∧¬x=0∧¬x=1)→(x∣y→¬(x∣y+1)))
:%*,2,2,2#[[infprm]][=ac:"infprm"][p]∀x:(x∈N→∃y:(Prime(y) ∧ y≥x))
:%*,2,2,2,1$[=getD:9.99e5]

:mprd,3@用法：$$0是新谓词名[n]该名字不能在[D]或[P]中[n]以函数的形式出现过[n]即出现的$$0(...)是公式，不能是项
:%,3@$$1是变量列表[n]是几元谓词就输入几个变量[n]如x,y,z[n]$$2是关于它们的性质的公式
:%,3@例如定义三元谓词neq3表示[n]“三者两两不相等”[n]则$$0：neq3[n]$$1：x,y,z[n]$$2：~x=y&~x=z&~y=z
// inconsist axioms

:apn5-err-in,1#[zh]退出该门前请[n]清除所有依赖错误公理[n]的定理与规则！[n]然后执行“del apn5x”[n](该门为自动门，且无法被拆)[n]#imm[en]Before exiting this gate,[n]please clear all props and rules[n]that rely on the incorrect axiom![n]Then execute “del apn5x”[n](This gate is automatic and cannot be destructed)[n]#imm
:%,2$[[apn5-err-out]][zh]获得错误公理apn5x[en]Obtain the incorrect axiom apn5x.
:%,1#[d]⊢ $1
:%,4$[=getD:5e3]
:asep-err-in,5#[zh]退出该门前请[n]清除所有依赖错误公理[n]的定理与规则！[n]然后执行“del asepx”[n](该门为自动门，且无法被拆)[n]#imm[en]Before exiting this gate,[n]please clear all props and rules[n]that rely on the incorrect axiom![n]Then execute “del asepx”[n](This gate is automatic and cannot be destructed)[n]#imm
:%,0$[[asep-err-out]][zh]获得错误公理asepx[en]Obtain the incorrect axiom asepx
:%,5#[d]⊢ $1
:%,0$[=getD:5e3]

// type theory

:port-iff,5@[zh]提示：建议有条件优先解锁[n]距此处两格的一阶逻辑，之后[n]才可能解锁皮亚诺公理[n]或ZFC集合论、类型层[en]Hint: First recommend to unlock[n] 1st-order logic (two grids away from here)[n]Then ahead you can unlock [n] Peano axioms, ZFC set theory and type layers
:type,4@[zh]值a的类型是A[n]记作a:A[en]Type of value a is A[n]denotes as a:A
:type,5@[zh]#t闸门开启方法：[n]当类型层定理列表中有[n]门上写的类型的值时[n]才能通过闸门[en]How to unlock gate #t:[n]You can pass through it when there's [n]a value in type layer's proposition list[n]whose type is written on the gate
:%*,0;5;0@
:%*,0#[t]U
:%*,0,5@[zh]类型的类型是U0[n]可简写成U[n]叫“宇宙”或“全类”[n]U0的类型是更大的全类U1[en]Type of a type is U0[n]Abbreviated as U[n]Called universe type.[n]Type of U0 is larger universa type U1
:%*,0,5,0,5#[t]U2
:%*,4@[zh]开启之门即为真理[n]谬误之门无法通过[n]提示：解锁“+”后继续前进[n]可大量挣钱与解锁ind_eq[en]Opened gate is truth[n]False gate can never be passed[n]Hint: Go ahead after Unlocking "+"[n]Cyou can earn a lot and unlock ind_eq
:%*,4,2#[t]Pa:U,(not(not a))->a
:%*,4,3#[t]eq (refl true) (refl true)
:%*,4,4#[t]Pa:U, a + (not a)
:%*,5#[t]False
:%,3#[[ttrue]][=ac:"ttrue"][t]True
:%,4@[zh]介绍函数符号“λ”（L）[n]与函数类型符号“Π”（P）[n][en]Introduce function symbol “λ” (L)[n]and function type symbol “Π” (P)[n]
:%*,1@[zh]函数表达式为λx:A.b[n]其自变量x类型为A[n]输出(因变量)值为b[en]Function expression is λx:A.b[n] where input variable x has type A[n]and output value is b
:%*,1,1@[zh]若假设x:A能推出b:B[n]则λx:A.b的类型为[n]Πx:A,B[en]If assuming x:A we can derive b:B[n]Then type of λx:A.b is[n]Πx:A,B
:%*,1,1,1@[zh]注意函数输出类型B[n]可能依赖于x的值[n]以后将看到例子[en]Note that function output type B[n]May depend on value of x[n]Examples will be seen later
:%*,1,1,1,1@[zh]λx:A.x的类型是Πx:A,A[n]因为x的类型是A[en]The type of λx:A.x is Πx:A,A[n]because the type of x is A.
:%*,1,1,1,1,1@[zh]λx:A.True的类型是Πx:A,U[n]因为True的类型是U[en]The type of λx:A.True is Πx:A,U[n]because the type of True is U.
:%*,1,1,1,1,1,1@[zh]函数可以嵌套，如[n]λx:A.λy:B.x其实是[n]λx:A.(λy:B.x)[n]其类型是[n]Πx:A,Πy:B,A[en]Functions can be nested, e.g.[n]λx:A.λy:B.x is actually[n]λx:A.(λy:B.x)[n]Its type is[n]Πx:A,Πy:B,A
:%*,3@[zh]与量词类似[n]λ后的变量x出现在“.”后的表达式中[n]都是约束变量[en]Similar to quantifiers[n]Variables x after λ occuring in expression after “.”[n]Are all bound variables
:%*,3,5@[zh]类似也有变量[n]在某表达式中[n]“自由出现”的概念[en]Similarly, there is the concept of a variable[n]"free" or "bound"[n]in an expression.
:%,5#[t]Px:True,True
:%,5#[t]Px:False,False
:%,0#[t]Pa:U,U
:%*,4@[zh]不同于传统编程中的函数[n]函数输出值的类型[n]可以依赖于输入的自变量[en]Different from functions[n] in traditional computer programming[n]Type of function output value[n]Can depend on input argument
:%*,4,5@[zh]λx:U.λy:x.y类型为[n]Πx:U,Πy:x,x[n]因为λy:x.y[n]类型为Πy:x,x[en]The type of λx:U.λy:x.y is[n]Πx:U,Πy:x,x[n]because the type of λy:x.y[n]is Πy:x,x.
:%,5#[t]Pa:U,Px:a,a
:%*,4$[=getD:50]
:%,0#[t]Px:True,Py:False,True
:%,5#[t]Pa:U,Pb:U,Px:a,Py:b,a
:%,0$[[ttsimplFn]][=ac:"ttsimplFn"][=unl:true][zh]简写非依赖函数[n]类型符号“→”（->）[en]abbreviation [n]for non-dependent function[n]type symbol “→” (->) 
:%*,4@[zh]若类型Πx:A,B中[n]x不在表达式B中自由出现[n]则该类型可省去x[n]并记作：A→B[en]If in type Πx:A,B[n]x is not free in expression B[n]Then x can be omitted from type[n]And denoted: A→B
:%*,4,1@系统这时会把“Πx:A,B”跟[n]“A→B”完全视为等同[n]这叫做“定义相等”
:%*,4,5@[zh]默认符号“→”是右结合的[n]即A→B→C为[n]A→(B→C)[en]Symbol “→” is right-associative by default[n]i.e., A→B→C is A→(B→C)
:%*,4,5,5@[zh]例：λx:A→B.x[n]的类型为(A→B)→(A→B)[en]Example: The type of λx:A→B.x[n]is (A→B)→(A→B).
:%*,4,5,5,0@[zh]α-转换规则：[n]若z不在y中自由出现[n]则λx:A.y等价于λz:A.y'[n]其中y'是将y中自由的x[n]替换为z的结果[en]α-conversion rule:[n]If z is not free in y[n]Then λx:A.y is equivalent to λz:A.y'[n]Where y' is result of replacing free x in y with z
:%*,4,5,5,0,5@[zh]α-转换前后的两表达式[n]是“定义相等”的[n]由系统自动判定；[n]函数类型[n]简写前(Π)后(→)[n]也“定义相等”[en]Expressions before and after α-conversion[n]Are "definitionally equal" which can[n] be automatically checked by system;[n]Function types before (Π) and after (→) abbreviation[n] are also "definitionally equal"
:%*,4,5,5,0,5,5@[zh]有时也把依赖函数[n]Px:a.f(x)写成(x:a)->f(x)[n]它们定义相等[n]你可以切换显示方式[en]Dependent functions[n]Px:a.f(x) are also sometimes[n] written as (x:a)->f(x)[n]They are definitionally equal[n]You can switch the display style
:%,5#[t]Pa:U,Pb:U,Pc:U,a->b->a
:%*,5@[zh]若a:A，f:A->B[n]则函数f可以作用于a[n]记作f a[n]且f a类型为B[en]If a:A, f:A->B[n]Then function f can apply to a[n]Denoted as (f a)[n](f a) has type of B
:%*,5,5@类型论中[n]“f a”就是“f(a)”[n]一般会省略函数括号[n]直接在函数和变量之间加空格
:%*,5,2@[zh]下面介绍函数作用[n][en]Next, we introduce function application.[n]
:%*,5,0@[zh]β-归约规则：[n]若a:A，则有[n](λx:A.y) a等价于[n]将y中自由的x替换成a[en]β-reduction rule:[n]If a:A, then[n]((λx:A.y) a) is equivalent to[n]Replacing free x in y with a
:%*,5,0,5,3@[zh]注意λx:A.y a的含义是[n]λx:A.(y a)而不是[n](λx:A.y) a[en]Note: 'λx:A.y a' means[n]'λx:A.(y a)', not[n]'(λx:A.y) a'
:%*,5,0,5@[zh]计算(λx:A.λy:B.z) y时[n]将z中自由的x替换为y[n]将被λy:B约束[n]系统将自动使用α-等价[n]更改自变量名称来规避[en]When computing (λx:A.λy:B.z) y[n]Replace free x in z with y[n]Will be bound by λy:B[n]System will automatically use [n]α-conversion to rename variable
:%*,5,0,5,0@[zh]例：λx:A→B.λy:A.x y[n]的类型为(A→B)→(A→B)[n]因为x y的类型为B[en]Example: The type of (λx:A→B.λy:A.x y)[n]is (A→B)→(A→B)[n]because the type of (x y) is B.
:%*,5,0,5,0,5@[zh]“存在某个值其类型是A”[n]可翻译成“A是定理”[n]那个值就是该命题[n]成立的证据[en]"There exists a value of type A"[n]Can be translated as "A is a theorem"[n]That value is evidence or witness[n] for this proposition to hold
:%*,5,0,5,0,5,0@[zh]旁边的#t门打不开？[n]付费后给提示[en]Can't open adjacent gate #t?[n]After payment, I'll give some hints
:%*,5,0,5,0,5,0,3#[[hint-tt-a3]][=payD:300]
:%,0#[t]Pa:U,Pb:U,Pc:U,(a->b->c)->(a->b)->(a->c)
:%,5$[[ttnotFn]][=unl:true][zh]简写否定符号“not”[n]即，将“A->False”[n]简写为“not A”[en]negation symbol “not”[n]I.e., abbreviate “A->False”[n]to “not A”
:%*,3$[[ttactic1]][=ac:"ttactic1"][=unl:true][zh]证明策略[n]intro/expand/apply/exact[en]proof strategies[n]intro/expand/apply/exact
:%*,4@简写前后[n]也是定义相等的[n]即系统会认为[n]“not a”跟“a->False”[n]是同一个东西
:%*,5@[zh]由于False为空类型[n]因此若存在函数A->False[n]则若A类型不为空[n]就能推出False也不为空[n]因此A类型只能为空[n]即A是假命题[en]Since False is empty type[n]Thus if function A->False exists[n]Then if A type is non-empty[n]Can derive False is also non-empty[n]Thus A type can only be empty[n]I.e., A is false proposition
:%,0#[t]Pa:U,a->(not (not a))
:%,5#[t]Pa:U,Pb:U,(a->b)->[n]((not b)->(not a))
:%,0@[zh]类型论不同于经典逻辑[n]not(not A)仅表明[n]无法提供A为假的证据[n]并不能证明A为真[n]因此有扇相邻的门[n]是永远无法打开的[en]Type theory is different from classical logic[n]“not(not A)” only indicates[n]we cannot provide evidence of A being false[n]This cannot prove A is true[n]Thus there is an adjacent gate[n]That can never be opened
:%,5#[t]Pa:U,(not (not (not a)))[n]->(not a)
:%*,3@[zh]除了点击推荐的策略[n]还可直接输入策略点加号[n]比如目标是A[n]你恰好知道值a:A[n]可手动输入“apply a”[n]完成目标[en]Besides clicking recommended strategies[n]You can also enter strategy then [n]click "+" button. E.g., the goal is A[n]and you know some value a:A[n]Then you can manually enter "apply a"[n]To complete the goal
:%*,2@[zh]如果觉得写这些函数太晕[n]建议把待证命题写在定理列表中[n]然后点证明策略的加号[n]使用解锁的证明助手[en]If you feel writing these [n]evidence functions is too diffcult[n]you can write the target type in proposition list[n]Then press proof strategy's "+" button[n]And use unlocked strategies of proof assistant
:%,0$[[ttEq]][=ac:"ttEq"][=unl:true][zh]相等类型[en]identity type
:%*,4@[zh]若a与b类型都是A[n]则eq a b是个类型[n]可翻译为命题“a等于b”[n]显然若a与b定义相等[n]则命题“a等于b”一定成立[n]故引入“refl a”表示该事实[en]If both a and b have type A[n]Then 'eq a b' is a type[n]This can be translated as proposition "a equals b"[n]Obviously if a and b are definitionally equal[n]Then proposition "a equals b" must hold[n]Thus introduce evidence "refl a" to this fact 
:%,5#[t]eq true true
:%*,2@[zh]注意现在有“定义相等”[n]与“命题相等”两种概念[n]由于是否定义相等[n]直接由系统判定[n]故不引入相等类型[n]就无法表达含假设命题[n]“若两值相等，则...”[en]Note there are two concepts: [n]"definitional equal" and "propositional equal"[n]Since definitional equal[n]is directly determined by system[n]Thus without identity type[n] We cannot express hypothetical proposition:[n]"If two values are equal, then..."
:%*,2,5@[zh]提示：你可以在定理列表中[n]输入a:b，让系统[n]帮你检查a的类型[n]是否为b[en]Hint: you can enter a:b[n] in proposition list to let [n]the system check whether [n]the type of a is b
:%*,2,5,0@[zh]提示：你可以在定理列表中[n]输入a===b，让系统[n]帮你检查a与b[n]是否定义相等[en]Hint: you can enter a===b[n] in proposition list to let [n]the system check whether a and b[n]are definitionally equal
:%*,2,5,0,5@[zh]定义相等一定命题相等[n]反之不一定成立哦[en]Definitional equal implies propositional equal[n]but the converse is not necessarily true
:%,0#[t]eq False False
:%*,2,1@[zh]“eq”其实有些隐藏参数[n]故其类型中带问号[n]系统可通过[n]上下文的函数作用[n]智能推断匹配[n]问号开头的类型[en]“eq” actually has hidden parameters[n] e.g. the question marks in its type.[n]The system can  infer these[n] question mark-prefixed types[n]through contextual function application
:%*,2,1,0@[zh][n]完整版是多元函数“@eq”[n]它接受以下参数[n]1.全类的下标数字u[n]2.类型a:Uu[n]3.值x:a与值y:a[n]最后得到一个命题(即Uu类型)[n]eq省略了前两个参数[en][n]The full version is function “@eq”[n]which accepts the following parameters[n]1. Subscript number u of the universe[n]2. Type a:Uu[n]3. Values x:a and y:a[n]It Finally returns a proposition (i.e., of type Uu)[n]function “eq” omits the first 2 parameters
:%*,3$[=getD:100]
:%*,4@[zh]提示：一般来说没必要[n]使用“expand eq”将其[n]展开为“@eq”[n]展开前后虽都定义相等[n]但这只会让目标更复杂[en]Hint: It's unnecessary to Use[n] “expand eq” to expand it into “@eq”[n]Although they are definitionally equal [n]this only make the goal more complex
:%,5#[t]eq (False->False) (not False)
:%*,5$[[ttrfl]][=unl:true][zh]rfl与相应证明策略[n](自动推断定义相等)[en]rfl and corresponding proof strategy[n](automatically infer definitional equality)
:%,0$[[ttNat]][=unl:true][zh]自然数nat类型[en]natural number (nat) type
:%,5#[t]eq (succ 0) 1
:%*,2@[zh]自然数“1”定义为[n]succ 0[n]“2”定义为[n]succ (succ 0)[n] ...[en]Natural number "1" is[n] defined as "succ 0"[n]"2" is defined as[n]"succ (succ 0)"[n] ...
:%,0$[[ttBool]][=unl:true][zh]布尔类型Bool[en]boolean type (Bool)
:%,2#[t]eq 0b 0b
:%,3$[=getD:20]

// taactic tutorial

:ttactic1,1@教程：先把要证的命题[n]在定理列表中抄写下来[n]然后点击证明策略下面的加号[n]再点击要证的命题
:%,2@证明目标会显示[n](?#0):你的命题[n]证明助手的任务就是[n]一步一步帮你构造[n](?#xx)处的值
:%,1@下面介绍“intro”策略[n]如果目标是函数类型A->B[n]则“intro”策略会帮你[n]填上Lx:A,???[n]其中???的类型是B[n]???的值暂时未知
:%,1@使用了“intro”策略后[n]证明目标由构造A->B[n]变成了在假设x:A下来构造B[n]即填充刚才的???处的值
:%,1@可以指定引入变量的名字[n]如“intro y”会填入Ly:A,???[n]并引入假设y:A
:ttactic1,1,2,3@下面介绍expand策略[n]expand xx可以[n]自动展开目标中的定义常量[n]比如目标是“not False”时[n]使用“expand not”后[n]变成“False->False”
:%*,3@“expand n xx”[n]可只展开从左往右第n个xx[n]“expand -n xx”[n]可只展开从右往左第n个xx
:%,0,5@下面介绍exact：[n]如果你本来就知道[n]证明目标A的值a[n]你可以用“exact a”直接填进去
:%,5@下面介绍apply：[n]若证明目标是B[n]且假设环境中有[n]f:A->B[n]则apply策略可填入f xxx[n]然后把目标换成A[n]即填入xxxx的具体值

// tt ind_xxx

:ttBool,5$[[ttindTrue]][=unl:true][zh]ind_True[n]提示：后方可解锁[n]ind_eq[en]ind_True[n]Hint: ind_eq can be unlocked ahead
// :%,5@这些ind_xxx都是啥？[n]往前走详细提示
// :%,5@我们先来看个rec_xxx函数[n]它是对应的ind_xxx的简化版
// :%,5$[[ttrec]]解锁rec_True与rec_Bool
//     :ttrec,0@rec_Bool是一个构造函数f:Bool->a的函数[n]它接受一个类型a[n]和一个值f(0b):a[n]及一个值f(1b):a[n]就输出一个函数Bool->a
//     :%*,0@比如我们输入rec_Bool nat[n]系统提示它的类型是[n]nat->nat->Bool->nat[n]说明我们还要输入两个自然数
//     :%*,0@我们接着输入rec_Bool nat 1 2[n]系统提示它的类型是[n]Bool->nat
//     :%*,0@按照定义，rec_Bool nat 1 2 0b的值是1[n]rec_Bool nat 1 2 1b的值是2
:ttindTrue,0@[zh]类型True只有一个值true[n]要证对任意x:True成立[n]其实只需论证对true成立[n]引入ind_True作为[n]该事实的证据[en]Type True has only one value “true”[n]To prove for any x:True[n]actually only need to check for value true[n]Introduce ind_True as[n]evidence of this fact
:%*,4@[zh]ind_True接受一个[n]关于x:True的命题[n]（命题的类型都是U，[n]因此通过函数True->U定义）[n]和该命题对true成立的证据[n]从而输出该命题对[n]任意x:True成立的证据[en]ind_True accepts a[n]proposition about x:True[n](All propositions have type U,[n]thus defined via function True->U)[n]and evidence that the proposition holds for true[n]It returns an evidence that [n]the proposition holds for any x:True
:%*,4,5@[zh]给些证旁边命题的提示：[n]看看表达式“ind_True [n](Lx:True.eq x true)”的类型[en]Hints for solve the adjacent puzzle:[n]Think of the type of expression [n]“ind_True (Lx:True.eq x true)”,
:%*,4,5,5@[zh]除了理解为命题[n]ind_True也可用于构造函数：[n]要构造f:True->XXX[n]只需给定f(true)的值即可[n]公理类型列表中[n]ind_True的计算规则[n]表示这一事实[en]Besides understood as a proposition[n]ind_True can also be used to construct functions:[n]To construct f:True->XXX[n]just need the value of f(true)[n]In the axiom type list[n]ind_True's computation rule[n](marked with 'COMP') shows this fact
:%,5#[[AllTrue]][=ac:"AllTrue"][t]Px:True,eq x true
:%,0$[[ttProd]][=unl:true][zh]积类型“X”与[n]有序对构造子“(,)”、[n]依赖值对类型“Σ”(S)与[n]依赖有序对构造子“pair”[en]product type “X” and[n]ordered pair constructor “(,)”,[n]dependent pair type “Σ” (S) and[n]dependent ordered pair constructor “pair”[n](constructors are marked with CTOR)
:%,5@[zh]对任意a:A与b:B[n]可以构造有序对[n](a,b) : A X B[en]For any a:A and b:B[n]we can construct ordered pair[n](a,b) : A X B
:%,0#[t]nat X nat
:%*,3#[t]not (True X False)
:%*,4@[zh]对积类型A X B[n]需要同时提供[n]a:A与b:B才能构造[n]因此积类型可[n]理解为命题“A且B”[en]For product type A X B[n]both[n]a:A and b:B are needed to construct it[n]Thus product type can be[n]understood as proposition "A and B"
:%*,3,1$[=getD:100]
:%,5@[zh]若(a,b)中，b的类型依赖于[n]a的值，则是依赖值对类型。[en]If in (a,b), the type of b depends on[n]the value of a, it is a dependent pair type.
:%,0@[zh]即若B:A->U，a:A，b:B(a)，[n]则依赖值对记作[n]pair B a b : Sx:A,B(x)[n]若B是常函数则[n]退化为非依赖的积类型[en]That is, if B:A->U, a:A, b:B(a),[n]then dependent pair is denoted[n]pair B a b : Sx:A,B(x)[n]If B is a constant function[n]it degenerates into a non-dependent product type
:%*,4@[zh]要构造类型Sx:nat,eq x 1[n]需要提供一个nat类型的值x[n]和eq x 1类型的值[n]明显我们可以选择1:nat[n]和refl 1 : eq 1 1[n]组成依赖有序对[en]To construct type Sx:nat,eq x 1[n]you need to provide a nat type value x[n]and eq x 1 type value[n]Obviously we can choose 1:nat[n]and refl 1 : eq 1 1[n]to form a dependent ordered pair
:%*,4,5@[zh]因此也可把该[n]依赖有序对类型[n]理解为命题“存在x:nat[n]使得eq x 1成立”[en]Thus this dependent pair type[n]can also be understood as proposition [n]"There exists a natural number x[n]such that x equals 1"
:%,5#[t]Sx:nat,eq x 1
:%*,4#[=payD:100]
:%*,4,1$[[ttacticEx]][=unl:true][zh]证明策略[n]“ex”与“case”[en]proof strategies[n]“ex” and “case”
:%*,4,5$[[tthyp]][=unl:true][zh]证明策略“hyp”（假设）[n]通过“hyp XXX”可以引入[n]新的证明子目标XXX[n]完成后将得到值:XXX[n]作为条件供后续证明使用[n]执行“hyp a:A”可将引入的目标[n]证明后得到的变量命名为a[en]proof strategy “hyp” (hypothesis)[n]Using “hyp XXX” can introduce[n]new proof subgoal XXX[n]After subgoal completion, you'll get a value with type XXX,[n] as a condition for subsequent proof steps[n]Executing “hyp a:A” can name [n]the introduced goal as variable a
:%,0$[[ttSum]][=unl:true][zh]和类型“+”[en]sum type “+”
:%,3@[zh]和类型有左(inl)右(inr)[n]两个构造子[n]要构造类型A + B[n]仅需提供a:A或b:B即可[n]可翻译为“A或B”[en]Sum type has left (inl) and right (inr)[n]two constructors[n]To construct a value of type A + B[n]we only need to provide a:A or b:B[n]This can be translated as proposition "A or B"
:%,5@[zh]提示：可以直接在定理列表中[n]写xxx : XXX[n]断言xxx有类型XXX[n]系统类型推断可自动[n]匹配并验证其正确性[en]Hint: You can write xxx : XXX[n]in the proposition list[n] to assert xxx has type XXX[n]System type inference will[n]check and verify its correctness
:%,0#[t]True + False
:%,5#[t]False + True
:%,5#[=payD:100]
:%,0$[[ttacticLR]][=unl:true][zh]证明策略[n]“left”/“right”[en]proof strategies[n]“left”/“right”
:ttSum,0#[t]Px:Bool,(eq x 0b)+(eq x 1b)
:%*,3@[zh]欲证该命题，需对x:Bool[n]通过ind_Bool分类讨论[n]建议采用“destruct”/“rfl”[n]“left”/“right”等证明策略[n]辅助构造证据[en]To prove this proposition, [n]proving by cases for x:Bool[n]through ind_Bool is needed[n]Recommend using proof strategies [n]like “destruct”/“rfl”/“left”/“right”[n]to construct evidence automatically
:%*,3,3@[zh]积类型、依赖有序对[n]它们类似Bool、nat、[n]True、False、eq[n]都是归纳类型[n]也有相应的ind_xxx函数[n]和相应的destruct策略[en]Product types, dependent pairs[n]They are similar to Bool, nat,[n]True, False, eq[n]All are inductive types[n]Also have corresponding ind_xxx functions[n](ind is for induction, i.e. destructor, marked with DTOR)[n]and corresponding destruct strategies
:%*,3,3,2$[[ttindProd]][=unl:true][zh]ind_Prod[en]ind_Prod
:ttindProd,5@[zh]依赖有序对类型只有唯一[n]的带两个参数的构造子pair[n]因此仅需证明由任意的两值[n]组成的有序对成立，[n]就可证对所有有序对成立[en]Dependent pair type has only one[n]constructor pair with two parameters[n]to prove a proposition for all ordered pairs,[n]we only need to check that ordered pairs[n] composed of any two values hold
:%,5#[t]Pa:U,Pb:U,aXb -> a
:%*,2@[zh]提示：可通过ind_Prod定义函数[n]f : aXb -> a，[n]使得对任意x:a和y:b[n]有f (x,y) === x[en]Hint: To define function[n]f : aXb -> a via ind_Prod,[n]such that for any x:a and y:b[n]f (x,y) === x
:%,0$[=getD:150]
:%*,4#[t]Pa:U,Pb:U,Pc:U,(a->b->c)->((aXb)->c)
:%*,4,5$[=getD:200]
:%*,4,5,2#[t]Pa:U,Pb:U,Pc:U,((aXb)->c)->(a->b->c)
:%*,4,5,2,5$[=getD:200]
:%*,5#[t]Pa:U,Pb:U,Px:aXb,eq x (pr0 x, pr1 x)
:%,3$[[ttpr]][=unl:true][zh]投影函数pr0/pr1[n]与依赖投影函数prd1[en]projection functions pr0/pr1[n]and dependent projection function prd1
:%*,4#[t]Px:U,Pa:U,Pb:U,(x->aXb)->(x->a)X(x->b)
:%*,4,5$[=getD:200]
:%*,2#[t]Pa:U,Pb:U,(aXb)->(bXa)
:%*,2,1$[=getD:100]
:%,3#[t]eq (pr0 (1,2)) 1
:%,3#[t]eq (pr1 (3,4)) 4
:%,3$[=getD:20]
:ttindProd,0,4$[[ttindSum]][=unl:true][zh]ind_Sum[en]ind_Sum
:ttindSum,1@[zh]和类型A+B有两个[n]分别带一个参数的构造子[n]要证对所有A+B的值均成立[n]需分别证明任意a:A对(inl a)成立，[n]且任意b:B对(inr b)成立[en]Sum type A+B has two[n]constructors each with one parameter[n]To prove for all values of A+B[n]need to respectively prove for any a:A holds for (inl a),[n]and for any b:B holds for (inr b)
:%*,3#[t]Pa:U,Pb:U,(a+b)->(b+a)
:%*,3,1$[=getD:100]
:%*,3,1,2#[t]Pa:U,Pb:U,Pc:U,[n]((a+b)+c)->(a+(b+c))
:%*,3,1,2,5$[=getD:100]
:%,2#[t]Pa:U,Pb:U,Pc:U,[n](a->c)->(b->c)->(a+b)->c
:%,1$[=getD:100]
:%*,2@[zh]不会解可交钱绕行[en]Can't solve? Pay to bypass
:%*,2,1#[=payD:500]
:%*,2,1,2@
:%,1#[t]Pa:U,Pb:U,(a+b)->[n](not((not a) X (not b)))
:%,4;1;1;1;1;1@
:%,0$[[ttindeq]][=ac:"ttindeq"][=unl:true][zh]ind_eq[en]ind_eq
:%*,3#[t]Pa:U,Pb:U,(eq a b)->(a->b)
:%*,2#[t]not (eq True False)
:%*,2,5$[[ttelimeq]][=unl:true][zh]证明助手中[n]用destruct策略[n]解构相等类型[en]using the destruct strategy[n]in the proof assistant[n]to destruct equality types
:%,4@[zh]类型eq a b只有一个带参数[n]的构造子refl[n]且只能构造出类型eq a a[n]因此要证对任意m:eq a b成立[n]只需证明对refl a成立[en]Type eq a b has only one [n]parameterized constructor refl[n]and can only construct type eq a a[n]Thus to prove for any m:eq a b holds[n]only need to prove for refl a
:%*,3#[t]Pa:U,Px:a,Py:a,(eq x y)->(eq y x)
:%*,3,5$[[ttinveq]][=unl:true][zh]相等逆路径运算[n]inveq[en]inverse path operation for equality[n]inveq
:%*,2#[=payD:2e3]
:%*,2,1$[[ttelimcond]][=unl:true][zh]证明助手中[n]用destruct策略时[n]自动抓取环境中的[n]依赖条件变量[n]避免一些“类型不匹配”错误[en]automatic capture of[n]dependent variables from the context[n]when using the destruct strategy[n]in the proof assistant[n]to avoid some "type mismatch" errors

:%,5@注意eq类型本身带参数[n]而不像nat\和\积类型[n]只是构造子带参数[n]因此ind_eq是在对[n]一簇类型使用“归纳法”
:%*,5,2#[=payD:2e3]
:%*,5,2,5$[[ttapply2]][=unl:true][zh]证明助手中[n]apply策略支持多元函数[n]例如当前目标是c[n]有f:a->b->c[n]可用apply f[n]将当前目标c拆分成[n]两个子目标a与b[en]support for [n]multi-argument functions[n]in the apply strategy of the proof assistant[n]For example, if the current goal is c[n]and f:a->b->c[n]then apply f[n]will split goal c[n]into two subgoals a and b

:%*,3#[t]Pa:U,Px:a,Py:a,Pz:a,(eq x y)->(eq y z)->(eq x z)
:%*,3,1$[[ttcompeq]][=unl:true][zh]相等连接路径运算[n]compeq[n]与简写：x * y === [n] compeq x y[en]concatenation path[n] operation for equality[n]compeq, and abbreviation[n]x * y === compeq x y

:ttSum,0,4@[zh]然而对任意类型a:U[n]并不是非真即假[n]比如有无法证明的命题[n]还有其它复杂的非命题类型[n]其实排中律Pa:U,a+(not a)[n]在类型论中不可证[en]However for any type a:U[n]it may not be true and also not be false[n]For example, there are unprovable propositions[n]and other complex non-propositional types[n]In fact, the law of excluded middle Pa:U,a+(not a)[n]is unprovable in type theory
:%,3@[zh]若把命题逻辑中a3公理[n](~$0>~$1)>($1>$0)[n]改成($1>$0)>(~$0>~$1)[n]则跟类型论一样[n]无法证明排中律[n]与双重否定消去律[n]还有皮尔士定律[en]If axiom a3 in propositional logic[n](~$0>~$1)>($1>$0)[n]is changed to ($1>$0)>(~$0>~$1)[n]then like in type theory[n]we cannot prove the law of excluded middle[n]and double negation elimination[n]and also Peirce's law
:%,3$[[ttlazy]][=unl:true][zh]自动抄写技能[n]将上次碰到的门上的命题[n]抄下，以便使用证明助手[en]auto-copy skill[n]Copy the proposition on the last touched gate[n]to make the proof assistant usage easier
:ttSum,0,5@[zh]类型论可引入额外的公理[n]让排中律成立[n]从而可推出双重否定消去[n]然而引入同伦类型论相关公理[n]可以证明刚才对任意[n]类型的排中律是错误的[n]仅能引入公理让[n]排中律对“纯命题”成立[en]Type theory can introduce extra axioms[n]to make the law of excluded middle hold[n]therefore double negation elimination can be proved[n]However, introducing homotopy type theory related axioms[n]can prove that the law of excluded middle [n]for unlimited any type is wrong[n]We can only introduce axioms to make[n]the law of excluded middle hold for "mere propositions"
:%*,3#[t]Pa:U,not(not(a+(not a)))
:%*,3,1#[t]Pa:U,Pc:a->U,[n](not Sx:a,c x)->(Px:a,not(c x))
:%*,3,1,2#[t]Pa:U,Pc:a->U,[n](Px:a,not(c x))->(not Sx:a,c x)
:%*,3,1,2,1#[t]Pa:U,Pc:a->U,[n](Sx:a,c x)->(not Px:a,not(c x))
:%*,3,1,2,1,1#[t](Pa:U,(not(not a))->a)[n]->(Pa:U,a+(not a))
:%*,3,1,2,1,1,1#[t](Pa:U,a+(not a))->[n](Pa:U,(not(not a))->a)
:%*,3,1,2,1,1,1,1#[[ttpierce]][=ac:"ttpierce"][t](Pa:U,a+(not a))->[n](Pa:U,Pb:U,((a->b)->a)->a)
:%*,3,1,2,1,1,1,1,1$[=getD:2e3]
:%*,3,5$[=getD:490]
:%,4#[[lemlie]][=ac:"lemlie"][t]not Pa:U,a+(not a)
:%,5$[=getD:1e4]
:ttBool,4$[[ttindFalse]][=unl:true][zh]ind_False[en]ind_False
:%,3@[zh]类型False没有值[n]要证对任意x:False成立[n]其实都永远成立[n]引入ind_False作为[n]该事实的证据[n]即“从谬误能推出一切”[en]Type False has no values[n]To prove for any x:False holds[n]we do nothing, it actually always holds[n]Introduce ind_False as[n]evidence of this fact[n]namely "from falsehood, anything follows"
:%*,1#[t]Pa:U,False->a
:%*,1,5$[=getD:100]
:%,5#[t]False->(eq 0b 1b)
:%,2$[=getD:100]
:ttBool,3$[[ttindBool]][=unl:true][zh]ind_Bool[n]提示：后方可解锁[n]ind_nat与[n]策略destruct[en]ind_Bool[n]Hint: ind_nat and strategy "destruct"[n] can be unlocked ahead
:%,3@[zh]类型Bool有值0b和1b[n]要证对任意x:Bool成立[n]只需对0b与1b均成立[n]引入ind_Bool作为[n]该事实的证据[en]Type Bool has values 0b and 1b[n]To prove for any x:Bool holds[n]only need to check 2 cases: 0b and 1b[n]Introduce ind_Bool as[n]evidence of this fact
:%*,4@[zh]提示：需分别证明[n]1. (not (eq 0b 0b))[n]->(eq 0b 1b)；[n]2. (not (eq 1b 0b))[n]->(eq 1b 1b)。[n]还有困难可交钱给更多提示[en]Hint: Need to prove respectively[n]1. (not (eq 0b 0b))[n]->(eq 0b 1b);[n]2. (not (eq 1b 0b))[n]->(eq 1b 1b).[n]Still stucked? Pay for more hints
:%*,4,5#[=payD:100]
:%*,4,5,3@[zh]ind_Bool函数首先接受[n]一个关于x:Bool的命题[n]然后分别接受对0b与1b[n]成立的命题证据[n]最后返回该命题的证据[en]ind_Bool function first accepts[n]a proposition about x:Bool[n]then accepts evidences for 0b and 1b[n]finally returns evidence of the proposition
:%*,4,5,4@[zh]看看值“ind_Bool [n](Lx:Bool.(not (eq x 0b))[n]->(eq x 1b))”的类型[n]它将提醒你还需要[n]提供哪些参数[en]Consider the type of value “ind_Bool [n](Lx:Bool.(not (eq x 0b))[n]->(eq x 1b))”[n]It will remind you which [n]kind of evidences are still needed
:%*,4,5,4,5@[zh]1.要证关于0b的命题[n]可通过假设“not (eq 0b 0b)”[n]得到一个False类型的值[n]然后用否定爆炸ind_False即可；[n]2.要证关于1b的命题则很简单[en]1. To prove the proposition about 0b[n]we can obtain a False type value via assuming “not (eq 0b 0b)”[n]then use explosion principle from ind_False;[n]2. Proving the proposition about 1b is simple
:%,5#[t]Px:Bool,[n](not (eq x 0b))[n]->(eq x 1b)
:%*,3$[=getD:300]

// nat 递归函数

:%,5$[[ttindnat]][=ac:"ttindnat"][=unl:true][zh]ind_nat[en]ind_nat
:%*,5$[[base-2]][zh]获得奖励：[n]若序数进位基底大于5[n]则将基底减1[en]Obtain Reward:[n]Reduce the limit carry base by 1[n]if the ordinal base is greater than 5
:%*,2@[zh]自然数(nat)类型有两个构造子[n]“0”与“succ”[n]其中“succ”是带一个[n]递归参数的构造子[en]Natural number (nat) type[n] has two constructors: “0” and “succ”[n]where “succ” is a constructor[n]with a recursive parameter
:%*,2,5@[zh]因此要证关于任意自然数的命题[n]要提供命题对0成立的证据[n]和对“succ”成立的证据[en]Thus to prove a proposition about any natural number,[n]We need to provide evidence that the proposition holds for 0[n]and also it holds for “succ”
:%*,3@[zh]带递归参数的“succ”有点复杂[n]类似于积类型、和类型的参数[n]这意味着要证对任意的n:nat[n]命题对succ n都成立[en]“succ” with a recursive parameter is a bit complex[n]similar to parameters of product and sum types[n]This means we need to show evidence [n]that for any n:nat, it holds for succ n
:%*,3,5@[zh]然而该参数的递归性[n]却给我们提供了额外信息[n]即由于递归构造，[n]其实已经知道[n]命题对该参数n成立了[en]However, the recursiveness of this parameter[n]provides us with extra information[n]that is, due to recursive construction,[n]we actually already know[n]the proposition holds for parameter n
:%*,4@[zh]因此命题“对构造子succ成立”[n]其实是，对任意的n:nat[n]都有若已知命题对n成立[n]都能推出对succ n成立[n]即等价于数学归纳法[en]Thus the proposition "holds for constructor succ"[n]is actually, for any n:nat[n]if the proposition holds for n[n]can derive it holds for succ n[n]which is equivalent to mathematical induction
:%,0#[t]eq (ind_nat (Lx:nat.Bool) 0b[n] (Lx:nat.Ly:Bool.1b) 0) 0b
:%,5#[t]eq (ind_nat (Lx:nat.Bool) 0b[n] (Lx:nat.Ly:Bool.1b) 1) 1b
:%,0#[t]eq (ind_nat (Lx:nat.Bool) 0b[n] (Lx:nat.Ly:Bool.1b) 2) 1b
:%,5#[t]eq (ind_nat (Lx:nat.Bool) 0b[n] (Lx:nat.Ly:Bool.1b) 3) 1b
:%*,5$[[ttdestruct]][=unl:true][zh]证明策略destruct[n]它将自动引入ind_XXX[n]改写证明目标[en]proof strategy destruct[n]It will automatically introduce ind_XXX[n]to rewrite the proof goal
:%*,4$[[ttsimpl]][=unl:true][zh]证明策略[n]“simpl”[n]即系统通过定义相等关系[n]自动化简证明目标[en]proof strategy simpl:[n] the system automatically simplifies [n]the proof goal through definitional equality
:%,0#[t]Sf:nat->Bool,[n](eq (f 0) 0b) X[n](Pn:nat,eq (f (succ n)) 1b)
:%*,2@[zh]ind_nat还可以理解为[n]递归函数的生成器：[n]构造函数f(x)需要给定f(0)的值，[n]然后对任意自然数n[n]通过n与f(n)的值来给出f(n+1)的值[en]ind_nat can also be understood as[n]a generator of recursive functions:[n]To construct function f(x), the value of f(0) is needed,[n]then for any natural number n[n]f(n+1) is contructed by n and f(n)[n] hence a function (n and f(n) as its parameters) is needed
:%,5$[[ttdbl]][=unl:true][zh]翻倍函数[n]double : nat->nat[en]double function[n]double : nat->nat
:%,0$[[ttadd]][=unl:true][zh]加法函数[n]add : nat->nat->nat[en]addition function[n]add : nat->nat->nat
:%,0#[[tt1+1]][=ac:"tt1+1"][t]eq (add 1 1) 2
:%*,4#[[:=what]][zh]请定义一个常量what[n]使得下面的定义相等成立[n]what 0b === what 1b True[n]#t:=[en]Please define a constant what[n]such that the following definitional equality holds[n]what 0b === what 1b True[n]#t:=
:%*,4,1$[=getD:150]
:%*,4,5@[zh]门 #t:= 开启方法：[n]在定理列表中定义[n]满足规定性质的常量后[n]才能通过此门[n]如旁边的门需定义[n]what := xxxxxx [en]How to open gate #t:= :[n]You must define a constant[n]with the required property[n]in the theorem list[n]before passing through this gate[n]For example, the nearby gate requires[n]what := xxxxxx 
:%,5#[t]Px:nat,eq (double (succ x))[n](succ (succ (double x)))
:%,5#[t]Px:nat,eq (add x 0) x
:%*,0@[zh]来都来了，[n]这点小钱都出不起吗？[n]赶紧交钱，[n]不然你自己想办法过去[en]Since you're already here,[n]can't afford this small amount of money?[n]Pay up quickly,[n]otherwise figure out how to pass by yourself
:%*,0,2#[=payD:2.222e3]
:%,5#[[0+x]][=ac:"0+x"][t]Px:nat,eq (add 0 x) x
:%*,4#[t]Sf:nat->nat,[n](eq (f 0) 0) X[n](Pn:nat,eq (f(succ n)) n)
:%*,4,1$[[ttpred]][=unl:true][zh]“前继”函数[n]pred : nat->nat[en]"predecessor" function[n]pred : nat->nat
:%*,4,4$[[ttEven]][=ac:"ttEven"][=unl:true][zh]递归定义的谓词“是偶数”[n]Even: nat->U[en]the recursively defined predicate "is even"[n]Even: nat->U
:%*,4,3#[[:=ftr]][zh]请定义函数ftr:nat->U[n]使得ftr 0 === True[n]ftr n === True->...->True[n]其中的True有n+1个[n]#t:=[en]Please define a function ftr:nat->U[n]such that ftr 0 === True[n]and ftr n === True->...->True[n]with n+1 occurrences of True[n]#t:=
:%*,4,3,4$[[ftrdetour]][=getD:200]
:%*,4,3,1#[[:=ftreq]][zh]请定义函数ftreq:Px:nat,(ftr x)->U[n]使得ftreq 0 === Lx:ftr 0,eq x true[n]ftreq 1 === Lx:ftr 1,Pa:True,eq (x a) true[n]ftreq 2 === Lx:ftr 2,Pa:True,Pa':True,eq (x a a') true[n]....[n]#t:=[en]Please define a function[n] ftreq:Px:nat,(ftr x)->U[n]such that ftreq 0 === Lx:ftr 0,eq x true[n]ftreq 1 === Lx:ftr 1,Pa:True,eq (x a) true[n]ftreq 2 === Lx:ftr 2,Pa:True,Pa':True,eq (x a a') true[n]....[n]#t:=
:%*,4,3,1,2$[=getD:400]
:%*,4,3,1,5#[t]Px:nat,Py:ftr x,ftreq x y
:%*,4,3,1,5,2$[=getD:800]
:%,5$[[ttrw]][=unl:true][zh]相等替换改写策略[n]rw(rewrite)[n]与rwb(rewrite back)[en]equality substitution rewrite strategies[n]rw (rewrite)[n]and rwb (rewrite back)
:%*,0@[zh]若m: eq a b，则[n]执行策略“rw m”[n]将通过ind_eq把证明目标[n]中的所有a改写成b[en]If m: eq a b, then[n]execute strategy “rw m”[n]it will rewrite all a to b in the proof goal[n]via ind_eq
:%*,4@[zh]若没解锁ind_eq[n]系统会认为ind_eq未定义[n]无法使用该策略完成证明[n]提示：在ind_True的后方[n]可解锁ind_eq[en]If ind_eq is not unlocked yet[n]the system will consider ind_eq undefined[n]and you can't use this strategy for the proof[n]Hint: ind_eq can be unlocked behind ind_True
:%,2@[zh]若m: eq a b，则[n]执行策略“rwb m”[n]将通过ind_eq把证明目标[n]中的所有b改写成a[en]If m: eq a b, then[n]execute strategy “rwb m”[n]it will rewrite all b to a in the proof goal[n]via ind_eq
:%,3;1;2;1;1;1;2;1;2;1;1;1;1;1;2;1;1;1;1;1;1;1;2;1;1;1;1;1;1;1;2;1;1;1;1;1@...............................................
:%,1#[[ttpAleph]][zh]未解锁的闸门无法通过[n]请寻找线索解开闸门[n]#Aleph[en]Locked gates cannot be passed[n]Find clues to unlock it[n]#Aleph

:ftrdetour,5;5;0;5;0;4;5;5;0;5;0;5;0;5;0;5;0;5;0;5;0;5;0;5;0;5;0;5;0;5;0;5;0;5;0@...............................................
:%,0#[[W]][zh]未解锁的闸门无法通过[n]请寻找线索解开闸门[n]#W[en]Locked gates cannot be passed[n]Find clues to unlock it[n]#W

:ttEven,3#[t]Even 0
:%,5#[t]Even 4
:%,5#[t]Px:nat, Even (double x)
:%,0#[t]not (Even 1)
:%,5#[t]not (Even 11)
:%,0#[t]not (Even 111)
:%,5#[t]Px:nat, Even x ->[n] Even (pred (pred x))
:%,0$[[ttAleph]][=unl:true][zh]小于ω的基数Aleph(א)[en]cardinal numbers[n] below ω: Aleph (א)

:ttEven,3,1#[t]Px:nat,Even x->[n]Sy:nat,eq (double y) x
:%,2#[t]Px:nat,Py:nat,Even x->Even y->[n]Even (add x y)
:%,1#[t]Px:nat,Even x->[n]not (Even (succ x))
:%,1#[t]Px:nat,not (Even x)->[n]Even (succ x)
:%,1#[t]Px:nat,Even (succ (succ x))[n]-> Even x
:%,1#[t]Px:nat,Py:nat,[n]not (Even x)->not (Even y)->[n]Even (add x y)
:%,1$[[ttW]][=unl:true][zh]W类型[en]the W type

:ttEven,2#[t]Px:nat,Even x ~=[n]Sy:nat,eq (double y) x
:%,1$[=getD:5e3]
:ttEven,4#[[tteven0]][=ac:"tteven0"][t]Px:Even 0, eq x even0
:%,5$[=getD:5e3]

// W-type

:ttSum,0,5,0#[t]Pa:U,not (Wx:False,a)
:%*,5#[t]Pa:U,a->Wx:a,False
:%*,5,0$[[ttsup]][=unl:true][zh]证明策略sup[n]遇到目标是W类型时[n]将帮你填上构造子sup[en]proof strategy sup[n]When the goal is a W type[n]it will automatically fill in[n]the constructor sup
:%*,3#[t]Wx:True,True
:%,2@[zh]提示：解锁W类型的地方[n]在解锁Even类型的后方[en]Hint: The place where the W type is unlocked[n]is beyond the place where[n]Even is unlocked
:%,5#[=payD:500]
:%,5;0;5;0@...
:%*,5#[t]Wx:Bool,ind_Bool (Lx:Bool,U) False True x
:%*,5,5$[[ttNW]][=unl:true][zh]该类型的简写NW[en]the abbreviation NW[n]for this type
:%*,5,5,0@[zh]NW类型有两个构造子[n]0b对应的构造子没参数[n]因为ind_Bool xxxx 0b = False[n]1b对应的构造子有一个递归参数[n]因为ind_Bool xxxx 1b = True[en]The NW type has two constructors[n]The constructor corresponding to 0b has no arguments[n]because ind_Bool xxxx 0b = False[n]The constructor corresponding to 1b has one recursive argument[n]because ind_Bool xxxx 1b = True
:%*,5,0#[t]Sx:NW,Sy:NW,not (x=y)
:%*,5,0,4$[=getD:500]
:%*,2#[t](Wx:True,True) ~= False
:%*,2,3$[=getD:200]
:%*,2,5@[zh]这个类型等价于[n]不能终止的递归类型T[n]T : U[n]ct : T->T[n]因此不能被构造[en]This type is equivalent to[n]a non-terminating recursive type T[n]T : U[n]ct : T->T[n]Therefore it cannot be constructed
:%*,4#[t](Wx:True,False) ~= True
:%*,4,3$[=getD:200]
:%*,4,1@[zh]类型Wx:a,b x解读：[n]这是一个递归类型[n]x:a代表它的构造子[n]y:b x则表示构造子x的参数[en]Interpretation of the type Wx:a,b x:[n]This is a recursive type[n]x:a represents a constructor[n]and y:b x represents[n]the arguments of constructor x
:%*,4,1,5#[t]Sa:U,Sb:a->U,[n](Wx:a,b x) ~= Option nat
:%*,4,1,5,2$[=getD:200]
:%*,4,5@[zh]类型Wx:True,False[n]只有一个true对应的构造子[n]找不到y:False[n]说明它不带参数[n]这就是单点类型True[en]For the type Wx:True,False[n]there is only one constructor[n]corresponding to true[n]There is no y:False[n]so the constructor has no arguments[n]This is exactly the singleton type True
:%,3#[[ttWnat]][=ac:"ttWnat"][t]NW ~= nat
:%*,4$[=getD:2e3]
:%*,2$[=getD:2e3]
:%,3#[t]Pa:U,List a ~= [n]Wx:True+a,ind_Sum (Lx:True+a,U)[n](Lx:True,False) (Lx:a,True) x
:%*,4$[=getD:4e3]
:%*,2$[=getD:4e3]

:ttindTrue,2#[[x+x]][=ac:"x+x"][t]Px:nat,(eq x 1)->(eq (add x x) 2)
:%*,3$[[ttsimplEq]][=unl:true][zh]将eq x y简写为x = y[en]abbreviation[n] for "eq x y" as "x = y"
:%,2#[t]Pf:nat->nat->nat,[n](f = add)->((f 1 1) = 2)
:%,2#[t]Pa:nat,Pb:nat,[n](a = b)->[n]succ a = succ b
:%,2$[[ttap]][=unl:true][zh]函数作用[n]传递相等的证据ap[n]即x=y能推出f(x)=f(y)[en]ap, the evidence that[n]functions preserve equality[n]namely x=y implies f(x)=f(y)
:%*,1@[zh]证succ m=succ n -> m=n 的提示：[n]直接用ind_nat归纳法[n]无法化简证明目标[n]需引入pred函数[en]Hint for proving succ m=succ n -> m=n:[n]Directly using ind_nat induction[n]cannot simplify the proof goal[n]We need to introduce pred function
:%*,1,4#[t]Pa:nat,a = (pred (succ a))
:%*,1,4,4#[t]Pa:nat,Pb:nat,[n]((succ a) = (succ b))[n]->((pred (succ a)) = (pred (succ b)))
:%*,1,4,4,4#[t]Px:Z,predZ(succZ x)=x
:%*,1,4,4,4,4$[[pred_succZ]][=unl:true][zh]证据pred_succZ[n]解锁证明策略eq后[n]可自动化简相应表达式[en]the evidence pred_succZ[n]After unlocking the eq strategy[n]corresponding expressions[n]can be simplified automatically
:%*,1,4,4,3#[t]Px:Z,succZ(predZ x)=x
:%*,1,4,4,3,5#[[nrflZ]][t]Sp:Z=Z,not (p = refl Z)
:%*,1,4,4,3,1$[[succ_predZ]][=unl:true][zh]证据succ_predZ[n]解锁证明策略eq后[n]可自动化简相应表达式[en]the evidence succ_predZ[n]After unlocking the eq strategy[n]corresponding expressions[n]can be simplified automatically
:%*,1,4,4,1@[zh]怎么证明not(0=1)?[n]用ind_nat定义一个函数[n]f(x):U，f(0)=True，f(1)=False[n]然后就好办了[en]How do we prove not(0=1)?[n]Define a function using ind_nat[n]f(x):U, with f(0)=True and f(1)=False[n]Then the proof becomes easy
:%,2#[t]Pa:nat,Pb:nat,[n](succ a = succ b)[n]-> a = b
:%*,5#[=payD:580]
:%*,5,3@[zh]提示：如果你卡在了证明[n]关于base和loop的命题上[n]不要着急[en]Hint: If you're stuck proving[n]a theorem involving base and loop[n]don't panic
:%*,5,3,1@[zh]ind_eq是对一簇类型做归纳[n]如果一来就固定了两端[n]反而会陷入绝境[en]ind_eq performs induction[n]over a family of types[n]If you fix both endpoints immediately[n]you may get stuck
:%*,5,3,1,2@[zh]这些其实都是[n]相等路径的通用性质[n]可以先对任意类型[n]完成证明后[n]代入base与loop即可[en]These are actually[n]general properties of equality paths[n]You can first prove them[n]for an arbitrary type[n]and then substitute base and loop
:%*,5,3,1,2,1@[zh]还有个问题就是[n]策略destruct不好用了[n]它无法自动知道[n]怎样从具体问题出发[n]构造通用问题[en]Another issue is that[n]the destruct strategy becomes inconvenient[n]It cannot automatically determine[n]how to generalize[n]a specific problem
:%*,5,3,1,2,1,1@[zh]因此我们后面专门引入[n]新的策略eq自动匹配[n]使用解锁的通用证据[n]来化简很多东西[en]Therefore we later introduce[n]a new strategy, eq[n]which automatically matches[n]unlocked general proofs[n]to simplify many expressions
:%*,5,3,1,2,1,1,1$[[ttacticeq]][=unl:true][zh]证明策略eq[n]（斜对面就有一些通用证据）[en]the proof strategy eq[n](There are some general proofs[n]diagonally across from here)
:%,2#[t]not (0 = 1)
:%*,2$[[ttS1]][=unl:true][zh]圆周类型[n]S1[n](高阶同伦归纳类型)[en]circle type[n]S1[n](high-order homotopy inductive type)
:%,5#[[1neq2]][=ac:"1neq2"][t]not (1 = 2)
:%*,5$[[ttap2]][=unl:true][zh]相等类型证据[n]trans(传输)与[n]apd(依赖路径作用)[en]equality proofs[n]trans (transport)[n]and apd (dependent path application)
:%*,5,5#[t]Pa:U,Pb:U,Px:a,Py:a,[n]Pk:b,Pm:x=y,[n](trans (Lx:a.b) m k) = k
:%*,5,5,0$[[ttransC]][=unl:true][zh]刚才命题的证据transconst[n](常函数的传输是恒同函数[n]支持使用eq策略匹配化简)[en]the evidence transconst[n]for the previous theorem[n](Transport along a constant function[n]is the identity function[n]and can be simplified using strategy "eq")
:%*,5,5,0,5#[t]Pa:U,Pb:U,Px:a,Py:a,[n]Pf:a->b,Pp:x=y,[n](apd f p)=[n]((transconst p (f x))*(ap f p))
:%*,5,5,0,5,0#[t]Pa:U,Pb:U,Px:a,Py:a,[n]Pf:a->b,Pp:x=y,[n]((inveq (transconst p (f x)))[n]*(apd f p))=[n](ap f p)
:%*,5,5,0,5,0,5$[[ttindS1]][=unl:true][zh]ind_S1[en]ind_S1
:%*,5,2@[zh]1.ap是x=y推出[n]f(x)=f(y)的证据[n]2.trans是若x=y，则命题对x成立[n]就能推出对y成立的证据[n]3.apd是ap的依赖类型函数版本[n]由于x与y可以不定义相等[n]故若f(x)与f(y)类型不同[n]无法直接用eq比较相等[n]需要通过trans函数转换到[n]同一类型后才能用eq比较[en]1. ap is evidence that x=y implies f(x)=f(y)[n]2. trans is evidence that if x=y, then a proposition [n]holding for x implies it also holds for y[n]3. apd is the dependent type function version of ap[n]Since x and y may not be definitionally equal[n]if f(x) and f(y) have different types[n]we cannot directly compare equality with eq[n]Convertion to the same type via trans function[n] is needed before comparing with eq
:%*,2$[=getD:2.2e3]
:%,0#[[ttPathElim]][=ac:"ttPathElim"][t]Pm:base=base,Pn:base=base,[n]((loop*m)=(loop*n))->(m=n)
:%*,2#[t]Px:S1,x=base
:%*,3#[[ttmno]][t]Pm:base=base,[n]Pn:base=base,[n]Po:base=base,[n](m*n)*o = m*(n*o)
:%*,3,3@[zh]提示：路径的结合律[n]是个普遍规律[en]Hint: Associativity of paths[n]is a universal law
:%*,3,2#[t]Pm:base=base,[n]Pn:base=base,[n]m*n = n*m
:%*,3,2,4$[=getD:6.6e3]
:%*,3,2,5@[zh]但路径的交换律[n]是S1的特殊性质[n]对其它类型可以不成立[n]证明它有点难度[en]But commutativity of paths[n]is a special property of S1[n]It may fail for other types[n]and is somewhat difficult to prove
:%*,3,1#[t]not (loop*loop = loop)
:%*,3,1,2@[[loop2-lin]]
:%*,3,1,3#[t]not (loop*loop = (refl base))
:%*,3,1,2,1#[t]1I=0I
:%,0,4#[[S1S1]][=ac:"S1S1"][t](refl base) = [n](loop * (inveq loop))
:%*,4#[t]inveq(inveq loop) = loop
:%*,4,5$[[tteqprop1]][=unl:true][zh]证据 rightrfl / [n]leftinveq / rightinveq / invinveq [en]proofs rightrfl /[n]leftinveq / rightinveq / invinveq 

:%,3$[[tteqv]][=unl:true][zh]“等价”关系[n]eqv: U->U->U[n]与简写：x ~= y[n](~=显示为≃)[en]"equivalence" relation[n]eqv: U->U->U[n]and abbreviation for[n]eqv x y as[n] x ~= y[n](display symbol ~= as ≃)
:%,1@[zh]如果两个类型a与b之间[n]存在可逆的[n]一到一的双射f:a->b[n]则它们等价，记作[n]eqv A B[en]If between two types a and b[n]exists an invertible[n]bijection f:a->b[n]then they are equivalent, denoted[n]eqv A B
:%,1@[zh]“f是双射”即为[n]存在函数g与h[n]使得f(g x) = x[n]且h(f x) = x[en]"f is a bijection" means[n]exist functions g and h[n]such that f(g x) = x[n]and h(f x) = x
:%,1#[t]True ~= True
:%,2#[[eqvid]][=ac:"eqvid"][t]Pa:U,a ~= a
:%,2#[t](True+True) ~= Bool
:%,2#[t](True+False) ~= True
:%,2#[t](False+False) ~= False
:%,1#[t](FalseXFalse) ~= False
:%,1#[t](TrueXFalse) ~= False
:%,1#[t](TrueXTrue) ~= True
:%,1#[t](not Bool) ~= False
:%,1#[t]((not Bool) + Bool) ~= Bool
:%,1#[t]Pa:U,Pb:U,Px:a,Py:b,[n]not (inl x = inr y)
:%,1$[=getD:999]
:%*,0#[t]Px:Bool=Bool,[n]pair (Lx:U.Bool=x) Bool x[n] = [n]pair (Lx:U.Bool=x) Bool rfl
:%*,1#[=payD:2.99e3]
:%*,1,1$[[ttfnext]][=ac:"ttfnext"][=unl:true][zh]函数外延公理[n]fnext[en]the function extensionality axiom[n]fnext
:%*,1,1,1#[t]Pa:U,Pb:U,[n]Px1:a,Px2:a,Py1:b,Py2:b,[n](x1,y1)=(x2,y2) ~= [n]((x1=x2)X(y1=y2))
:%,2@
:%,1#[t]Pa:U,Pb:U,Px:a,Py:b,[n]False ~= ((inl x) = (inr y))
:%*,3$[=getD:300]
:%,1@
:%,1#[t](True->True) ~= True
:%*,3$[=getD:300]
:%,1@
:%,1#[t](False->True) ~= True
:%*,3$[=getD:300]
:%,1@
:ttfnext,2#[t](not(not Bool)) ~= True
:%,1$[[ttacticFnext]][=unl:true][zh]证明策略fnext[n]遇到函数相等目标[n]自动使用fnext公理[en]proof strategy fnext[n]When the goal is equality of functions[n]it automatically uses[n]the fnext axiom
:%,1#[t]Pa:U,Pb:U,Pc:U,[n](aXb->c)~=(a->b->c)
:%,1@[zh]不知你是否疑惑过[n]eqv的定义方式[n]为何要左右逆[n]分开给证据[en]Have you ever wondered[n]why eqv is defined[n]with separate proofs[n]for left and right inverses?
:%,1@[zh]按理说该定义成[n]Sf:a->b,Sg:b->a,[n](Px:a,x=(g(f x)))X(Px:b,x=(f(g x)))[en]One might expect it[n]to be defined as[n]Sf:a->b,Sg:b->a,[n](Px:a,x=(g(f x)))X(Px:b,x=(f(g x)))
:%,1$[[ttpseudoeqv]][=unl:true][zh]这个定义，记作naiveqv[n]它其实跟eqv逻辑等价。[en]this definition,[n]called naiveqv[n]It is logically equivalent to eqv
:%,1#[t]Pa:U,Pb:U,(naiveqv a b)->(a~=b)
:%,2#[t]Pa:U,Pb:U,(a ~= b)->(naiveqv a b)
:%,1@[zh]它跟eqv的区别在于[n]它的证据太多了[n]eqv中函数是双射[n]的证据是唯一的[en]The difference from eqv is that[n]it contains too many proofs[n]In eqv, the proof that a function[n]is an equivalence is unique
:%,1@[zh]如果想让(a~=b)~=(a=b)成立[n]则eqv就只该区分不同的双射[n]没有多余的结构[n]两边才能等价[en]If we want (a~=b)~=(a=b) to hold[n]then eqv should distinguish only[n]different equivalences[n]without extra structure[n]so that the two sides are equivalent
:%,1@[zh]多余的结构是什么呢？[n]高阶同伦类型如S1中[n]base=base的证据不唯一[en]What is the extra structure?[n]In higher homotopy types such as S1[n]proofs of base=base[n]are not unique
:%,2@[zh]这正是Px:a,x=(g(f x))[n]这部分的证据数量[en]This is precisely the amount of proof data[n]contained in[n]Px:a,x=(g(f x))
:%,1@[zh]感觉eqv的信息比[n]pseudo_eqv还多[n]为何它能把不同的[n]证据的差异抹去？[en]It seems that eqv contains[n]more information than pseudo_eqv[n]Why can it erase the differences[n]between distinct proofs?
:%,2@[zh]这源于以下事实：[n]证明两个证据相等，[n]我们也可以提供[n]不同于rfl的其它证据[en]This comes from the fact that[n]when proving two proofs equal[n]we may provide proofs[n]other than rfl
:%,1@[zh]把左右逆分开，[n]允许我们能精准[n]两次选择非平凡的[n]相等证据，通过trans[n]机制抵消掉多余自由度[en]Separating left and right inverses[n]allows us to choose[n]nontrivial equality proofs twice[n]and use transport[n]to cancel the extra degrees of freedom
:%,1@[zh]这源于让人迷惑的[n]依赖有序对相等结构：[n]直觉上两个分量都相等[n]能推出依赖有序对相等[n]但第二个分量类型可能不同[n]需要用trans运输后才能比较[en]This comes from the subtle[n]structure of equality for dependent pairs:[n]Intuitively, equality of both components[n]should imply equality of the dependent pair[n]but the second components may have different types[n]and must be transported before comparison
:%,1#[t]Pa:U,Pb:a->U,[n]Pm:Sx:a,b x,Pn:Sx:a,b x,[n]Pp:pr0 m=pr0 n,[n]trans b p (prd1 m) = (prd1 n)[n] -> m = n
:%,1@[zh]没思路？其实你需要借助[n]刚才的推出依赖有序对[n]相等的运输条件，[n]构造旁边这个类型的值即可[en]No idea?[n]You actually need to use[n]the transport condition[n]from the previous theorem[n]about equality of dependent pairs[n]to construct a value of the nearby type
:%*,2#[t]trans (Lx:S1.base=x)[n] loop rfl = loop
:%,1#[t]pair (Lx:S1.base=x) base (refl base)[n] = [n]pair (Lx:S1.base=x) base loop
:%*,4@[zh]还是没思路？[n]其实在刚解锁trans的不远处[n]就有命题能让你[n]构造旁边这个类型的值了[en]Still stuck?[n]There is actually a theorem[n]not far from where trans was unlocked[n]that lets you construct[n]a value of the nearby type
:%*,2$[=getD:999]

:ttS1,5@同伦类型论介绍：[n]类型不仅能看成命题[n]还可以看成拓扑空间[n]类型的值不仅可以看成证据[n]还可处看成空间中的点
:%,0@定义相等的值[n]相当于同一个点[n]命题相等的值[n]不一定是相同的点[n]命题相等的证据[n]是连接这两点的“道路”
:%,2@相等证据的相等[n]则是连接道路的道路[n]道路会从一维线状[n]变成面状、体状...
:%,1@每个点a:A都有自己到[n]自己的平凡道路[n]即refl a : a=a[n]道路的连接、逆正好对应[n]等式的传递性、自反性
:%,5@现在你可能会明白[n]为什么刚才解锁的东西[n]叫做圆周类型了[n]因为loop是个自己到自己[n]但不是rfl的路径[n]它就是一个圈

:pred_succZ,0,3#[=payD:500]
:pred_succZ,0,2#[t]Sf:Z->Z->Z,Px:Z.Py:Z,[n](f x (succZ y) = succZ (f x y))X[n](f (succZ x) y = succZ (f x y))
:%,5$[[ttaddZ]][=unl:true][zh]整数加法函数addZ[en]integer addition function addZ
:%,2#[t]Sx:nat, neg x = [n]addZ (neg 2) (pos 0)
:%,1#[t]Px:Z,addZ x 0Z = x
:%,1#[t]Px:Z,addZ 0Z x = x
:%,1#[t]Px:Z,Py:Z,addZ x (succZ y)[n] = succZ (addZ x y)
:%,1#[t]Px:Z,Py:Z,addZ (succZ x) y[n] = succZ (addZ x y)
:%,1#[t]Px:Z,addZ x (negZ x) = 0Z
:%*,3$[=getD:100]
:%,1#[t]Px:Z,addZ (negZ x) x = 0Z
:%*,5$[[ttabsZ]][=unl:true][zh]整数绝对值函数[n]absZ : Z -> Z[en]integer absolute value function[n]absZ : Z -> Z
:%,1#[t]Px:Z,Py:Z,addZ x y = addZ y x
:%*,3#[t]Px:Z,leZ x (absZ x)
:%*,3,5#[t]Px:Z,leZ 0Z (mulZ x x)
:%*,3,5,5#[t]Px:Z,leZ (neg 0)[n](mulZ (predZ (predZ x)) x)
:%*,3,5,5,2$[=getD:500]
:%*,3,3$[=getD:100]
:%*,4$[[ttleZ]][=unl:true][zh]整数小于等于关系[n]leZ : Z -> Z -> U[en]integer less-than-or-equal relation[n]leZ : Z -> Z -> U
:%,2#[t]Px:Z,Py:Z,Pz:Z,[n]addZ (addZ x y) z = [n]addZ x (addZ y z)
:%*,3$[=getD:100]
:%,5#[t]Px:Z,Py:Z,Pz:Z,[n]addZ x z = addZ y z[n]-> x = y
:%*,3$[=getD:100]

:succ_predZ,0,4#[t]Px:Z,Py:Z,[n]addZ (negZ x) (predZ y)[n] = predZ (addZ (negZ x) y)
:%*,4#[=payD:1e3]
:%,5#[t]Sf:Z->Z->Z,Px:Z.Py:Z,[n](f x (succZ y) = addZ (f x y) x)X[n](f (succZ x) y = addZ (f x y) y)
:%,2$[[ttmulZ]][=unl:true][zh]整数乘法函数mulZ[en]integer multiplication function mulZ
:%,5#[t]Sx:nat,neg x = [n]mulZ (pos 8) (neg 11)
:%*,3$[=getD:50]
:%,0#[t]Px:Z,mulZ x 0Z = 0Z
:%*,3$[=getD:100]
:%,5#[t]Px:Z,mulZ 0Z x = 0Z
:%*,3$[=getD:100]
:%,0#[t]Px:Z,mulZ (pos 0) x = x
:%*,3$[=getD:100]
:%,5#[t]Px:Z,mulZ (neg 0) x = negZ x
:%*,3$[=getD:100]
:%,0#[t]Px:Z,Py:Z,mulZ (negZ x) y = negZ (mulZ x y)
:%*,3$[=getD:100]

:nrflZ,3#[t]Sf:Z->base=base,Px:Z,[n](f (succZ x)=loop*(f x))X[n](f (predZ x)=(inveq loop)*(f x))
:nrflZ,4#[=payD:1e3]
:%,1$[[ttloop^]][=unl:true][zh]函数loop_pow : [n]Z -> (base=base)[en]function [n]loop_pow : [n]Z -> (base=base)
:%*,2#[t]Px:Z,Py:Z,[n](loop_pow x)*(loop_pow y)[n] = loop_pow (addZ x y)
:%*,2,3$[=getD:300]
:%*,3#[t]Px:Z,loop_pow (negZ x)[n] = inveq (loop_pow x)
:%*,3,3$[=getD:800]
:%*,4#[t]Px:Z,Py:Z,[n](loop_pow x)*(loop_pow y)[n] = (loop_pow y)*(loop_pow x)
:%*,4,3$[=getD:800]
:%*,5#[t]loop_pow 0Z = refl base
:%*,5,4$[=getD:50]

:loop2-lin,5#[=payD:1e3]
:%,5;0;5;0;5;0;5@......
:%,0#[t]Sf:S1->U,Sp:f base = Z,[n]trans (Lx:U.x->x) p[n] (trans f loop) = succZ
:%,2,5@[zh]为什么要这么多trans?[n]本来想这样写这个谜题[n]Sf:S1->U,(f base=Z) X (trans f loop = succZ)[n]但trans f loop : f base->f base[n]它的类型跟Z->Z不定义相等[n]故需用trans改变类型后再比较[en]Why are there so many trans?[n]Originally I wanted to write this puzzle as[n]Sf:S1->U,(f base=Z) X (trans f loop = succZ)[n]But trans f loop : f base->f base[n]and its type is not definitionally equal to Z->Z[n]So we need trans to change the type[n]before comparing them
:%,0@[zh]提示：不要被这么多trans吓跑了[n]只要你的f base === Z[n]你就能把rfl填入p[n]后面的式子就化简了：[n]trans f loop = succZ[en]Hint: Don't be scared away[n]by all these trans[n]As long as f base === Z[n]you can fill p with rfl[n]Then the remaining expression[n]simplifies to:[n]trans f loop = succZ
:%,5@[zh]最后再提示：[n]用ind_S1把base映射到Z[n]把loop映射到ua(succZ)[en]One final hint:[n]Use ind_S1 to map base to Z[n]and map loop to ua(succZ)
:%,0#[=payD:1e3]
:%,5@
:%,0$[[ttcode_S1]][=unl:true][zh]code_S1 : S1->U[en]code_S1 : S1->U
:ttcode_S1,1,0#[t]Px:S1,base = x -> code_S1 x
:%*,3$[=getD:100]
:%,5#[t]Px:S1,code_S1 x -> base = x
:%*,3$[=getD:100]
:%*,0#[[pi1S1]][=ac:"pi1S1"][t](base=base) ~= Z
:%*,0,5$[=getD:6.6e3]
:%*,0,3#[[pi2S1]][t]Px:refl base=refl base,[n]x = refl (refl base)
:%*,0,3,5$[=getD:2.2e3]
:%,5#[t]Px:S1,(base = x) ~= code_S1 x
:%*,3$[=getD:1e3]


:ttfnext,4#[t]Pa:U,Pb:U,Pf:a->b,[n]fnext (Lx:a.refl (f x))[n] = refl f
:%*,1$[=getD:230]
:%,5#[t]Pa:U,Pb:U,[n]Pf:a->b,Pg:a->b,Pm:f=g,[n]fnext (Lx:a.inveq (happly m x))[n] = inveq m
:%,5#[t]Pa:U,Pb:U,[n]Pf:a->b,Pg:a->b,Ph:a->b,[n]Pm:f=g,Pn:g=h,[n]fnext (Lx:a.(happly m x)*(happly n x))[n] = m*n
:%,5$[=getD:320]
// :loop2,0,2@
:loop2-lin,2@
:%,1;1;1@......
:%,1@[zh]区间类型有[n]两个端点0I和1I[n]以及连接它们的[n]一条路径segI[en]The interval type has[n]two endpoints 0I and 1I[n]and a path segI[n]connecting them
:%,1$[[ttI]][=unl:true][zh]区间类型I[en]the interval type I
:%,3#[t]not (S2 ~= I)
:%*,5$[=getD:2e3]
:%,4$[=getD:2e3]
:ttI,1#[t]Pa:U,Px:a,[n]Pm:refl x=refl x,[n]Pn:refl x=refl x,[n]m*n = n*m
:%*,5$[[ttS2]][=ac:"ttS2"][=unl:true][zh]球面类型S2[en]the sphere type S2
:%*,5,2#[t]S2 ~= Sus S1
:%*,5,2,4$[[ttpo]][=unl:true][zh]Pushout类型[en]the Pushout type
:%*,5,2,3$[=getD:1e3]
:%*,5,0#[t]not (S2 ~= S1)
:%*,5,0,3$[=getD:1e3]
:%*,2@
:%*,4,1#[=payD:5e3]
:%*,3,1@
:%,3@[zh]证明思路：[n]先设三个点：x、y、z[n]四条路径p,q:x=y、r,s:y=z[n]两条二维路径m:p=q、n:r=s[n]证明p*q=r*s后，再[n]令x=y=z、p=q=r=s=rfl[en]Proof idea:[n]First take three points x, y, z[n]Four paths p,q:x=y and r,s:y=z[n]Two 2-paths m:p=q and n:r=s[n]After proving p*q=r*s[n]set x=y=z and p=q=r=s=rfl
:%*,4#[t]Pa:U,Px:a,Py:a,Pz:a,[n]Pp:x=y,Pq:x=y,Pr:y=z,Ps:y=z,[n]Pm:p=q, Pn:r=s,[n]p*r = q*s
:%*,4,2@[zh]先证p*r=p*s，[n]但不要用rw/destruct n[n]把命题变成p*r=p*r[n]这样n被解构了[en]First prove p*r=p*s[n]But do not use rw/destruct n[n]to turn the goal into p*r=p*r[n]because that would destruct n
:%*,4,2,4@[zh]再证p*s=q*s，[n]同理不要用rw/destruct m[n]把命题变成p*s=p*s[n]这样m被解构了[en]Then prove p*s=q*s[n]Likewise, do not use rw/destruct m[n]to turn the goal into p*s=p*s[n]because that would destruct m
:%*,4,2,4,4@[zh]把这两个证据路径连接[n]就得到了p*q=r*s[n]我们把这个生成p*q=r*s[n]的函数记作fR[en]Compose these two proof paths[n]and obtain p*q=r*s[n]We denote the function generating[n]p*q=r*s by fR
:%*,4,2,4,4,2@[zh]通过解构m和n容易证明[n]fR跟另外某个地方[n]定义的fL是相等的[en]By destructing m and n[n]it is easy to prove that[n]fR is equal to fL[n]defined elsewhere
:%*,4,2,4,4,4@[zh]令x=y=z，令4条路径=rfl，即[n]fR a x x x rfl rfl rfl rfl m n[n]化简后的值就是n*m[en]Set x=y=z and all four paths to rfl, namely[n]fR a x x x rfl rfl rfl rfl m n[n]The simplified value is n*m
:%*,4,2,4,2@[zh]解构s得到[n]p*rfl = q*rfl[n]然后用证据rightrfl分别得到[n]p*rfl=p 与 q*rfl=q[n]这其实对p和q解构了[n]但没关系不会卡住[en]Destruct s to obtain[n]p*rfl = q*rfl[n]Then use rightrfl to derive[n]p*rfl=p and q*rfl=q[n]This effectively destructs p and q[n]but that's fine and will not get us stuck
:%*,4,2,4,2,2@[zh]即现在有[n]rightrfl p : p*rfl=p[n]rightrfl q : q*rfl=q[n]m : p=q[n]通过路径组合就能[n]得到p*rfl = q*rfl[en]Now we have[n]rightrfl p : p*rfl=p[n]rightrfl q : q*rfl=q[n]m : p=q[n]Combining these paths[n]we obtain p*rfl = q*rfl
:%*,4,2,2@[zh]我们可以解构p[n]变成证明rfl*r=rfl*s[n]但是p在收缩成rfl时[n]会牵着r和s的端点走动[n]你需要一起带着它们解构[n]即在ind_eq的目标类型中引入条件[en]We may destruct p[n]reducing the goal to proving rfl*r=rfl*s[n]However, when p contracts to rfl[n]it drags the endpoints of r and s along[n]You must destruct them together[n]by introducing conditions[n]into the target type of ind_eq
:%*,4,2,2,2@[zh]证明rfl*r=rfl*s就简单了[n]它跟r=s定义相等[n]可直接填入证据n:r=s[n]我们避免了解构n[en]Proving rfl*r=rfl*s is easy[n]It is definitionally equal to r=s[n]So we can directly use the proof n:r=s[n]and avoid destructing n

:%*,4,4@[zh]先证p*r=q*r，[n]但不要用rw/destruct m[n]把命题变成p*r=p*r[n]这样m被解构了[en]First prove p*r=q*r[n]But do not use rw/destruct m[n]to turn the goal into p*r=p*r[n]because that would destruct m
:%*,4,4,2@[zh]再证q*r=q*s，[n]同理不要用rw/destruct n[n]把命题变成q*r=q*r[n]这样n被解构了[en]Then prove q*r=q*s[n]Likewise, do not use rw/destruct n[n]to turn the goal into q*r=q*r[n]because that would destruct n
:%*,4,4,2,2@[zh]把这两个证据路径连接[n]就得到了p*q=r*s[n]我们把这个生成p*q=r*s[n]的函数记作fL[en]Compose these two proof paths[n]and obtain p*q=r*s[n]We denote the function generating[n]p*q=r*s by fL
:%*,4,4,2,2,4@[zh]通过解构m和n容易证明[n]fL跟另外某个地方[n]定义的fR是相等的[en]By destructing m and n[n]it is easy to prove that[n]fL is equal to fR[n]defined elsewhere
:%*,4,4,2,2,2@[zh]令x=y=z，令4条路径=rfl，即[n]fL a x x x rfl rfl rfl rfl m n[n]化简后的值就是m*n[en]Set x=y=z and all four paths to rfl, namely[n]fL a x x x rfl rfl rfl rfl m n[n]The simplified value is m*n
:%*,4,4,4@[zh]解构r得到[n]p*rfl = q*rfl[n]然后用证据rightrfl分别得到[n]p*rfl=p 与 q*rfl=q[n]这其实对p和q解构了[n]但没关系不会卡住[en]Destruct r to obtain[n]p*rfl = q*rfl[n]Then use rightrfl to derive[n]p*rfl=p and q*rfl=q[n]This effectively destructs p and q[n]but that's fine and will not get us stuck
:%*,4,4,4,4@[zh]即现在有[n]rightrfl p : p*rfl=p[n]rightrfl q : q*rfl=q[n]m : p=q[n]通过路径组合就能[n]得到p*rfl = q*rfl[en]Now we have[n]rightrfl p : p*rfl=p[n]rightrfl q : q*rfl=q[n]m : p=q[n]Combining these paths[n]we obtain p*rfl = q*rfl
:%*,4,4,2,4@[zh]我们可以解构q[n]变成证明rfl*r=rfl*s[n]但是q在收缩成rfl时[n]会牵着r和s的端点走动[n]你需要一起带着它们解构[n]即在ind_eq的目标类型中引入条件[en]We may destruct q[n]reducing the goal to proving rfl*r=rfl*s[n]However, when q contracts to rfl[n]it drags the endpoints of r and s along[n]You must destruct them together[n]by introducing conditions[n]into the target type of ind_eq
:%*,4,4,2,4,4@[zh]证明rfl*r=rfl*s就简单了[n]它跟r=s定义相等[n]可直接填入证据n:r=s[n]我们避免了解构n[en]Proving rfl*r=rfl*s is easy[n]It is definitionally equal to r=s[n]So we can directly use the proof n:r=s[n]and avoid destructing n
:%,5@[zh]但m、n的两端都是rfl[n]无法解构m、n就卡住了[n]所以构造p*r = q*s的证据时[n]别用如rightrfl m这种[n]解构m、n才能得到的证据[en]But both endpoints of m and n are rfl[n]If we cannot destruct m and n[n]we get stuck[n]Therefore, when constructing a proof of p*r = q*s[n]do not use proofs such as rightrfl m[n]which require destructing m and n
:%,0@[zh]这个命题在说：[n]二维道路的连接有交换律[n]对应拓扑学中[n]高阶同伦群[n]都是交换群[en]This theorem states that[n]composition of 2-dimensional paths[n]is commutative[n]Correspondingly, in topology[n]higher homotopy groups[n]are all abelian groups

:ttS2,3#[t]Pa:U,Px:a,Py:a,Pm:x=y,Pn:x=y,[n]Pb:a->U, (m=n)->Pu:b x,[n]trans b m u = trans b n u
:%,1$[[ttrans2]][=unl:true][zh]二维路径传输[n]trans2[en]transport along 2-paths[n]trans2
:ttS2,5#[t]Pa:U,Px:a,Py:a,Pm:x=y,Pn:x=y,[n]Pb:a->U,Pf:Px:a,b x,Pr:m=n,[n](apd f m)=(trans2 b r (f x))*(apd f n)
:%,0$[[ttapd2]][=unl:true][zh]依赖函数[n]作用于二维路径[n]apd2[en]apd2[n]application of dependent functions[n]to 2-paths
:ttS2,4#[t]Pf:S2->U, rfl = [n]trans2 (Lx:S2.U) surf (f base2)
:%,3$[[ttindS2]][=unl:true][zh]ind_S2[en]ind_S2

:ttpo,5#[t]Pa:U, Sus a ~= [n]Pushout a (Lx:a,true) (Lx:a,true)
:%,5$[[ttJoin]][=unl:true][zh]拓扑连接运算Join[en]the topological join operation Join
:%,0#[t]Pa:U,Pb:U,[n]Join a b ~= Join b a
:%,5$[[ttWedge]][=unl:true][zh]拓扑单点并运算Wedge[en]the topological wedge operation Wedge
:%,0#[t]Sus (Wedge base base)[n] ~= [n]Wedge base2 base2
:%,4$[=getD:3e3]
:ttrans2,5#[t]Join S1 S1 ~= Sus S2
:%*,2@[zh]提示：S1 = Join Bool Bool[n]Sus S1 = Join ?? S1[en]Hint: S1 = Join Bool Bool[n]Sus S1 = Join ?? S1
:%*,0@[zh]提示：Join有结合律[en]Hint: Join is associative
:%,3$[[ttS3]][=unl:true][zh]超球面S3[en]the 3-sphere S3
:ttI,4#[t]Sr:refl base2 = refl base2,[n]not (r = rfl)
:%*,2$[=getD:4e3]
:%,5#[[hopf1]][=ac:"hopf1"][t]Sr:refl (refl base2) = refl (refl base2),[n]not (r = rfl)
:%*,4$[=getD:4e6]
:%,5$[=getD:4e6]
:%,0#[[hopf2]][=ac:"hopf2"][t]Sf:S3->S2,[n]not (f = Lx:S3,base2)
:%*,2$[=getD:4e6]

:ttindS1,4@[zh]ind_S1的意思是，[n]要构造从圆周S1[n]到其它类型的映射[n]除了要给定base映射的值[n]还要给出把路径loop[n]映射到哪里[en]The meaning of ind_S1 is:[n]To construct a map from the circle S1[n]to another type[n]Besides specifying the image of base[n]you must also specify[n]where the path loop is mapped
:%*,0,3@[zh]依赖类型的相等[n]apd需要用到trans[n]所以看起来规则很复杂[n]要是有非依赖版的ind_S1[n](即rec_S1)就好了[n]直接ap，不会有[n]讨厌的apd和trans[en]For equalities in dependent types[n]apd requires trans[n]so the rules look complicated[n]It would be nice to have[n]a non-dependent version of ind_S1[n](namely rec_S1)[n]Then we could use ap directly[n]without those annoying[n]apd and trans
:%*,3#[t]Pa:U,[[a]]->not (not a)
:%*,3,4$[[LEM]][=unl:true][zh]纯命题的[n]排中律公理LEM[en]the law of excluded middle axiom[n]LEM[n]for mere propositions
:%*,3,1@[zh]“[[”、“]]”可以把[n]多余的loop的结构截掉[n]这样我们终于能够表达[n]关于S1的值只有base的事实了[n]但，哪里能解锁它呢？[en]"[[" and "]]" can truncate away[n]the extra loop structure[n]So we can finally express[n]the fact that values of S1[n]are only base[n]But where can it be unlocked?
:%,4#[[nxeqbase]][t]not (Px:S1,x=base)
:%*,2$[=getD:150]
:%,1@[zh]旁边的等式看起来成立[n]但构造这个函数会让[n]圆圈loop等于rfl[n]因此该等式不成立[n]除非加上这个东西：[n]“[[”、“]]”[en]The equality nearby looks true[n]But constructing such a function[n]would force the circle loop[n]to equal rfl[n]Therefore the equality is false[n]unless you add this:[n]"[[" and "]]"
:%*,5#[t]Px:S1,[[x=base]]
:%*,5,5@[zh]命题截断后，[n]我们只知道它成立[n]但丢失了其它所都信息[n]即无法重新构造出[n]截断前的类型的值[n]除非[[a]] = a[en]After propositional truncation[n]we only know that it holds[n]but all other information is lost[n]So we cannot reconstruct[n]a value of the original type[n]unless [[a]] = a
:%*,5,4$[=getD:150]
:%*,4#[t]Pa:U,Px:[[a]],trunc x x = refl x
:%*,4,3$[=getD:200]
:%*,4,5#[t]Pa:U,isSet a[n] ->[[a]]->a
:%*,4,5,5$[=getD:9.99e11]
:%*,3#[t]Pa:U,Pb:U,Pf:a->[[b]],[n]Sg:[[a]]->[[b]],[n]Px:a, g[x] = f x
:%*,3,2$[=getD:150]
:%*,3,5#[t]Pa:U,[[a]]->a
:%*,3,5,2$[=getD:9.99e11]
:%,2#[t]Pa:U,[[a]]~=(not (not a))
:%*,2$[=getD:300]
:%*,5#[t]Pa:U,Pb:a->U,[n]isSet a->(Px:a,isProp (b x))->[n](Px:a,not (not(b x)))~=(not (not Px:a,b x))
:%*,5,2$[=getD:3e3]
:nxeqbase,5#[t]Pa:U,Pf:I->a,[n]f(0I)=f(1I)
:%*,2$[=getD:150]
:%,5$[[ttranseq]][=unl:true][zh]用于化简传输非依赖[n]相等类型的证据[n]transeq[en]the evidence transeq[n]for simplifying transport in[n]non-dependent equality types
:%,0#[t]I~=Sus I
:%*,2$[=getD:1.5e3]
:%,5#[t]I~=True
:%*,4$[=getD:100]
:%*,0#[t]Px:I, x = 0I
:%*,0,3$[=getD:100]
:%,2#[t]Px:I,Py:I, x = y
:%*,3$[=getD:250]
:%,1@[zh]这个区间 I 跟[n]单点类型True等价[n]这玩意有什么意义呢？[n]我们来做个挑战！[en]This interval I is equivalent to[n]the singleton type True[n]What is the point of it then?[n]Let's try a challenge!
:%*,4$[[enableI]][zh]恢复I[n](前提是你本来就解锁了I)[en]Restore I[n](provided that you had[n]already unlocked I)
:%*,3$[[enablefnext]][zh]恢复fnext[n](前提是你本来就解锁了fnext)[en]Restore fnext[n](provided that you had[n]already unlocked fnext)
:%,1$[[disablefnext]][zh]暂时将fnext[n]设为未定义常量[en]Temporarily set fnext[n]to an undefined constant
:%*,4$[[disableI]][zh]暂时将I[n]设为未定义常量[en]Temporarily set I[n]to an undefined constant
:%*,3@[zh]这里有两个挑战[n]一个是禁用ua/fnext[n]用I推出fnext[n]一个是禁用I/fnext[n]用ua推出fnexxt[en]There are two challenges here[n]One is to disable ua/fnext[n]and derive fnext from I[n]The other is to disable I/fnext[n]and derive fnext from ua
:%*,5,0$[[enableua]][zh]恢复ua[n](前提是你本来就解锁了ua)[en]Restore ua[n](provided that you had[n]already unlocked ua)
:%*,1@[zh]不要任何公理[n]通过定义区间I上的函数[n]就能直接推出[n]函数外延公理fnext[en]Without using any axioms[n]you can derive the function extensionality axiom fnext[n]directly by defining functions[n]on the interval I
:%,2$[[disableua]][zh]暂时将ua[n]设为未定义常量[en]Temporarily set ua[n]to an undefined constant
:%*,3@[zh]fnext证明思路：向前走交钱可看提示[en]Hint for proving fnext:[n]Walk forward and pay[n]to view the hint
:%*,3,2#[=payD:400]
:%*,3,2,2@[zh]不交钱不准偷看！[en]No peeking without paying!
:%*,3,2,2,2@[zh]fnext证明思路：[n]设 m : Px:a,f x = g x[n]对任意x:a，构造f: I->b，使得[n]f x=0I、g x=1I[n]然后交换刚才整个[n]大函数的某些变量顺序[n]直接构造出I->(a->b)[en]Idea for proving fnext:[n]Assume m : Px:a,f x = g x[n]For each x:a, construct f: I->b such that[n]f x=0I and g x=1I[n]Then rearrange some variables[n]of the large function above[n]and directly construct I->(a->b)
:%*,2@[zh]为什么把ua公理也要禁了呢？[n]因为从ua也能推出fnext[n]快去把区间类型I[n]禁用掉完成这个挑战！[en]Why disable the ua axiom as well?[n]Because ua can also imply fnext[n]Go disable the interval type I[n]and complete that challenge!
:disableua,4#[t]Pa:U,Pb:U,[n]Pf:a->b,Pg:a->b,[n](Px:a,f x = g x)->(f=g)
:%*,5$[=getD:800]
:%*,4@[zh]完整的函数外延公理[n]不仅说fnext存在[n]还说它跟happly是双射[en]The full function extensionality axiom[n]not only states that fnext exists[n]but also that it is inverse to happly
:%*,3@[zh]其实只要有[n]单边方向的fnext存在[n]就足以推出这个等价了[en]In fact, merely having[n]one direction of fnext[n]is enough to derive this equivalence
:%,2#[[ttNoFnext]][=ac:"ttNoFnext"][t]Pa:U,Pb:U,[n]Pf:a->b,Pg:a->b,[n](Px:a,f x = g x)~=(f=g)
:%*,1$[=getD:1.8e3]

:ttmno,4#[t](rec_S1 Bool (refl Bool)[n] base) = Bool
:%*,5#[=payD:2.99e3]
:%,4#[t]Pcl:Bool=Bool,[n](ap (rec_S1 Bool cl)[n] loop) = cl
:%,5$[[ttaploop]][=unl:true][zh]计算规则ap_loop[en]the computation rule ap_loop
:%,2$[=getD:1e3]
:eqvid,1#[t](not True)~= False
:%*,3#[t]Pa:U,Pb:U,(a~=b)->(b~=a)
:%*,3,4$[[ttua]][=ac:"ttua"][=unl:true][zh]同伦类型论[n]泛等公理[n]ua[n](等价即相等)[en]homotopy type theory[n]axiom of univalence (ua)[n](equivalence is equality)
:%*,2#[[looprfl]][=ac:"looprfl"][t]not (refl base = loop)
:%*,2,1@[zh]loop不等于rfl的证明思路：[n]通过ind_S1构造映射f:S1->U[n]其中让f(base)=Bool，[n]f(loop)=ua(e)[n]若loop与rfl相等，则[n]ua(e)与rfl相等[n]后者能推出e(x)=x矛盾[n](e在双重否定消去思路中定义)[en]Proof idea for loop ≠ rfl:[n]Construct map f:S1->U via ind_S1[n]where f(base)=Bool,[n]f(loop)=ua(e)[n]If loop = rfl, then[n]ua(e) = rfl[n]The latter implies e(x)=x contradiction[n](e defined in double negation elimination idea)
:%*,2,4$[[ttrecS1]][=unl:true][zh]ind_S1的简化版rec_S1[en]the simplified version of ind_S1:[n]rec_S1
:%*,2,3$[=getD:4.9e3]
:%,1#[[ttPoint]][=ac:"ttPoint"][t]Px:True,Py:True,(x=y)~=True
:%*,3#[t]Pa:U,isProp(a)->a->(a~=True)
:%*,3,2#[t]Pa:U,isProp(a)->[n](a~=True + a~=False)
:%*,3,2,1,1#[t]True~=True~=True
:%*,3,2,1$[[ttisContr]][=ac:"ttisContr"][=unl:true][zh]谓词“可缩”(isContr)[n]即没其它多余证据的[n]可通过相等路径[n]缩成单点的类型[en]the predicate "contractible" (isContr)[n]A type with no extra proof structure[n]which can be contracted[n]into a single point by equality paths
:%*,4$[[ttisProp]][=unl:true][zh]谓词“纯命题”(isProp)[n]命题只有成立或不成立[n]即没其它多余证据的类型[en]the predicate "mere proposition" (isProp)[n]A proposition is only true or false[n]namely a type with[n]no extra proof structure
:%*,2#[t]isProp(True)
:%*,2,1#[[ttSetNat]][=ac:"ttSetNat"][t]isSet(nat)
:%*,2,1,1@[zh]“编码-解码”方法是[n]同伦类型论研究[n]相等类型的一种套路:[n]定义一个code函数[n]再定义编码、解码函数[n]最后证明code跟相等等价[en]The "encode-decode" method[n]is a common technique in HoTT[n]for studying equality types:[n]Define a code function[n]Then define encode and decode[n]Finally prove that code[n]is equivalent to equality
:%*,2,2#[[:=code_nat]][zh]请定义函数code_nat:nat->nat->U[n]使得输入两个自然数相等时[n]计算值为True，否则为False[n]#t:=[en]Please define a function code_nat:nat->nat->U[n]such that when the two natural numbers are equal[n]it computes to True[n]otherwise it computes to False[n]#t:=
:%*,2,2,2$[=getD:100]
:%*,2,1,4#[t]Px:nat,Py:nat, x = y[n]->code_nat x y
:%*,2,1,4,2$[=getD:100]
:%*,2,1,4,1#[t]Px:nat,Py:nat,[n]code_nat x y[n]-> x = y
:%*,2,1,4,1,4$[=getD:100]
:%*,2,1,4,1,2#[t]Px:nat,Py:nat,[n]code_nat x y = True +[n]code_nat x y = False
:%*,2,1,4,1,2,5@[zh]如果不会证，[n]再给个提示：[n]intro一个变量后[n]就destruct它[n]之后再intro下一个变量[en]If you still can't prove it[n]here is another hint:[n]After introducing a variable[n]destruct it immediately[n]then introduce the next variable
:%*,2,1,3#[t]Px:nat,Py:nat,[n](code_nat x y)[n]~= (x = y)
:%*,2,1,2$[=getD:1.8e3]
:%*,2,3$[[ttisSet]][=unl:true][zh]谓词“集合”(isSet)[n]集合中的元素都是点状的[n]即它的相等类型是纯命题[en]the predicate "set" (isSet)[n]Elements of a set are point-like[n]meaning that their equality types[n]are mere propositions
:%,1@[zh]双重否定消去错误[n]的证明思路：[n]设映射e:Bool->Bool[n]且e(0b)=1b，e(1b)=0b[n]可证e是Bool自身到自身的双射[n]即能构造eqv Bool Bool的证据[en]Proof idea for double negation elimination is wrong:[n]Let map e:Bool->Bool[n]e(0b)=1b, e(1b)=0b[n]We can prove e is a bijection of Bool to itself[n]i.e., construct evidence of eqv Bool Bool
:%*,3#[[tteq2027]][=ac:"tteq2027"][t]Px:2027=2027,x=refl 2027
:%*,3,2$[=getD:2.028e3]
:%*,3,1$[=getD:1.9e3]
:%*,2#[[Bool=Bool=Bool]][=ac:"Bool=Bool=Bool"][t](Bool~=Bool)~=Bool
:%*,2,4$[=getD:1.9e3]
:%*,2,1@[zh]则ua(e):eq Bool Bool[n]通过ua(e)使用ind_eq[n]可证明若存在f:Pa:U,~~a->a[n]则能推出e(f Bool x)=f Bool x[n]从而可推出矛盾[en]Then ua(e):eq Bool Bool[n]Using ind_eq via ua(e)[n] we can prove that if there exists f:Pa:U,~~a->a[n]then e(f Bool x)=f Bool x can be derived[n]thus leading to a contradiction
:%,1#[t]not Pa:U,(not(not a))->a
:%,1$[=getD:1.99e3]

:looprfl,2#[t]not (S1~=True)
:%*,4$[=getD:900]
:%*,2$[[ttSus]][=unl:true][zh]高阶同伦类型构造器[n]纬悬(Sus)[en]the higher inductive type constructor[n]Suspension (Sus)
:%,1#[t]Sus False ~= Bool
:%,2#[[ttdrawS1]][=ac:"ttdrawS1"][t]Sus Bool ~= S1
:%,5$[=getD:1.9e3]

:ttua,0,5@[zh]泛等公理不仅说ua是命题[n]“(eqv a b)->(eq a b)”的证据[n]它还说ua映射与id2eqv[n]映射互为逆映射[en]The axiom of univalence not only indicates[n] ua is evidence for proposition[n]“(eqv a b)->(eq a b)”[n]It also says the ua map and id2eqv[n]map are inverse to each other
:%*,4#[t]Pa:U,Pb:U,(a~=b)~=(a=b)
:%*,4,5$[never]
:%*,4,5,5#[t]Px:base=base,[n]Py:base=base,[n](pair (Lx:S1,x=base) base x =[n] pair (Lx:S1,x=base) base y)[n]->(x=y)
:%,0@[zh]映射id2eqv为命题[n]“(eq a b)->(eqv a b)”的证据[n]该证据可通过ind_eq得到[n]不需要添加新公理[en]Map id2eqv is evidence for proposition[n]“(eq a b)->(eqv a b)”[n]This evidence can be obtained via ind_eq[n]without adding new axioms
:ttua,0,1#[t](ind_S1 (Lx:S1.U) Bool [n](transconst loop Bool) base)=Bool
:%*,2#[=payD:2.99e3]
:ttua,5#[t]Pa:U,Pb:U,Pc:U,[n](a~=b)->(b~=c)->(a~=c)
:%*,2$[=getD:300]
:%,0,3$[[ttLiftU]][=unl:true][zh]全类（宇宙）层级[n]提升操作LiftU[n]（提示：某个门的题目[n]不提升会有作用类型[n]不匹配错误，无法通过）[en]the universe-level[n]lifting operation LiftU[n](Hint: One gate's puzzle[n]will produce a function type[n]mismatch error without lifting[n]and cannot be completed)
:%,5#[t]not (True~=False)
:%*,4@[zh]不会？可以绕行[en]Can't solve it?[n]You can take a detour
:%*,4,5@[zh]绕行都不收费？那是不可能的[en]A free detour?[n]Of course not!
:%*,4,5,5#[=payD:3.9e3]
:%,5#[t]not (Bool~=True)
:%*,3@[zh]换个命题证证吗？比如这个结合律[en]Want to prove a different theorem?[n]How about this associativity law?
:%*,3,5#[t]Pa:U,Pb:U,Pc:U,[n](aXbXc) ~= (aX(bXc))
:%*,4@[zh]或许这个命题能帮助你[n]证明Bool不等价于True[en]Perhaps this theorem[n]can help you prove that[n]Bool is not equivalent to True
:%*,4,5#[t]Pf:True->Bool,Pg:Bool->True,[n]Px:Bool,f(g x) = f true
:%*,5@[zh]然后你再去证这个[en]Then go prove this one
:%*,5,0#[t]Pf:True->Bool,Pg:Bool->True,[n](Px:Bool,f(g x)=0b) + [n](Px:Bool,f(g x)=1b)
:%,0#[t]not (Bool~=(not (not Bool)))
:%*,3@[zh]提示：[n]not (not Bool)~=True[en]Hint:[n]not (not Bool)~=True
:%*,4@
:%,5#[t]not (nat~=Bool)
:%,2;5;0;5;0;5@....
:%,0@[zh]交钱绕行吧，傻孩子[n]或者...[en]Pay for the detour, silly child[n]Or...
:%*,5#[t]not (isProp(Bool))
:%,0#[=payD:2.13e3]
:%*,2#[t]not (isProp(nat))
:%*,2,3$[=getD:100]
:%*,2,5#[t]not (isProp(S1))
:%*,3#[t]not (isSet(S1))
:%*,3,3$[=getD:100]
:%*,4,1#[t]not (isContr(S1))
:%*,4#[t]Pa:U,isProp(isProp(a))
:%*,4,3$[=getD:200]
:%*,4,5#[t]Pa:U,isProp(isSet(a))
:%*,5#[t]Pa:U,isSet(isSet(a))
:%*,5,4$[=getD:200]
:%*,5,0#[t]Pa:U,isSet(isProp(a))
:%*,5,0,5#[t]not (isContr(S1))
:%*,5,0,5,4$[=getD:200]
:%,0@[zh]提示：前往写有下面命题的门后解锁[n]isProp、isSet、isContr：[n]Px:True,Py:True,(x=y)~=True[en]Hint: Go past the gate[n]bearing the following theorem[n]to unlock isProp, isSet, and isContr:[n]Px:True,Py:True,(x=y)~=True
:%,5#[t]not (nat~=S1)
:%,0#[t]Pa:U,isProp(a)->isSet(a)
:%*,5#[t]isSet (S1~=S1)
:%*,3$[=getD:400]
:%,4#[t]Pa:U,isProp(isContr(a))
:%,5#[t]Px:S1,not (isContr (x=base))
:%,5$[[ttTrunc]][=unl:true][zh]命题截断类型“[[”...“]]”[n]它强制把类型变成命题[en]the propositional truncation type[n]"[[" ... "]]"[n]It forcibly turns a type[n]into a proposition
:%,0#[t]Pa:U,isProp([[a]])
:%,5#[t]Pa:U,isProp(a)->(a~=[[a]])
:%,0#[t]Pa:U,isContr(a)->(isContr(isContr(a)))
:%,5#[t]Pa:U,Pb:a->U,[n](Px:a,isContr(b x))[n]->isContr(Px:a,b x)
:%,0$[=getD:1e3]
:%*,0#[t]Pa:U,Px:a,(Sx0:a,x=x0)~=a
:%,5#[t]Sf:Px:S1,x=x,[n]not (f = Lx:S1.refl x)
:%,0#[t]Pa:U,(S1->a)~=(Sx:a,x=x)
:%*,3$[=getD:800]
:%,5#[t]Pa:U,Pb:U,[n]isSet(a)->isSet(b)[n]->isSet(a+b)
:%*,3$[=getD:200]
:%,0#[t]Pa:U,Pb:U,[n]isSet(a)->isSet(b)[n]->isSet(aXb)
:%*,3$[=getD:200]
:%,5#[t]Pa:U,Pb:U,[n]isProp(a)->isProp(b)->[n](a->b)->(b->a)->(a~=b)
:%,0@[zh]当类型是纯命题时[n]类型等价终于跟[n]逻辑等价一样了[en]When a type is a mere proposition[n]type equivalence finally becomes[n]the same as logical equivalence
:%,5@[zh]可是同伦类型论[n]不只是处理逻辑命题[n]在定义等价关系的时候[n]需要用到这个关键事实[en]But HoTT is not only about[n]logical propositions[n]This key fact is needed[n]when defining equivalences
:%,0#[t]Pa:U,Px:a,isContr(Sx0:a,x=x0)
:%,5@[zh]我们离证明“f是双射”[n]是纯命题不远了[en]We are not far from proving that[n]"f is an equivalence"[n]is a mere proposition
:%,0@
:%,5#[[isequivP]][=ac:"isequivP"][t]Pa:U,Pb:U,Pf:a->b,[n]isProp((Sg:b->a,Px:a,x=g(f x))[n]X(Sh:b->a,Px:b,x=f(h x)))
:%*,2$[=getD:4.4e3]
:%*,3@[zh]“f是双射”是纯命题的[n]等价定义很多，不只这一种[n]比如纤维可缩等等[en]There are many equivalent definitions[n]of "f is an equivalence" being a mere proposition[n]not just this one[n]For example, contractible fibers
:%*,5$[=getD:4.4e3]
:%,0@[zh]另一边是从[n]“not (True~=False)”[n]附近出发的[en]The other route starts near[n]"not (True~=False)"
:%,5@[zh]如果这里卡住了[n]可以尝试从另一边绕行[en]If you're stuck here[n]try taking the other route
:%,0@

:ttua,5,5#[t]Pa:U,Pb:U,(LiftU(a~=b))~=(a=b)
:%*,5$[=getD:888]

:ttLiftU,3#[t](nat+True) ~= nat
:%*,5@[zh]欢迎入住[n]希尔伯特无穷旅馆！[en]Welcome to[n]Hilbert's Infinite Hotel!
:%,4#[[infhotel]][=ac:"infhotel"][t](nat+nat) ~= nat
:%*,3$[=getD:1.1e3]
:%,4#[t](natXnat) ~= nat
:%*,3$[=getD:2.2e3]
:%,5#[t](Bool->nat) ~= nat
:%,5#[t]not ((nat->Bool) ~= nat)
:%*,3$[=getD:3.3e3]
:%*,5@[zh]证明思路：将所有满足f(x)=y[n]的数对(x,y)利用[n]natXnat=nat的构造[n]编码成单个自然数[en]Proof idea: Encode every pair (x,y)[n]satisfying f(x)=y[n]into a single natural number[n]using the construction[n]natXnat=nat
:%*,5,0@[zh]每个nat->nat函数[n]由所有编码组成的[n]集合唯一确定[n]编码的集合显然[n]是自然数的子集[n]可由nat->Bool描述[en]Each function nat->nat[n]is uniquely determined[n]by the set of all its encodings[n]This set of encodings[n]is clearly a subset of nat[n]and can be described by nat->Bool
:%,0#[t](nat->nat) ~= (nat->Bool)
:%*,3$[=getD:8.88e3]
:%*,4@[zh]提示：在解锁Even后方[n]可解锁Aleph[en]Hint: Aleph can be unlocked[n]beyond the place where[n]Even is unlocked
:%,5#[t]Pm:nat,Pn:nat,[n](Aleph m~=Aleph n)[n] -> m = n
:%,0#[t](Sn:nat, Aleph n)~=(Pn:nat,Aleph (succ n))
:%*,0#[t]Pn:nat, not (Aleph n[n]~= (Sn:nat, Aleph n))
:%*,0,5$[[delAlw]][=dstrTarget:"AlephW"][=dstr:"#א_ω"]



:ttLiftU,4#[t]Pa:U,Pb:U,Pc:U,[n](aX(b+c)) ~= (aXb+aXc)
:%,2#[[:=Fin]][zh]请定义函数Fin:nat->U[n]使得Fin(0) === False[n]Fin(n+1) === Fin(n) + True[n]#t:=[en]Please define a function Fin:nat->U[n]such that Fin(0) === False[n]and Fin(n+1) === Fin(n) + True[n]#t:=
:%,2#[t]((Fin 1)+(Fin 2))~=(Fin 3)
:%*,3$[=getD:500]
:%,1#[t]Px:nat,Py:nat,[n]((Fin x)+(Fin y))~=(Fin (add x y))
:%*,4$[=getD:1e3]
:%,2#[t]Px:nat,Py:nat,[n]((Fin x)X(Fin y))~=(Fin (mul x y))
:%*,3$[=getD:1.2e3]
:%,1#[t]Px:nat,[n](Bool->Fin x)~=(Fin (mul x x))
:%*,3$[=getD:1.2e3]
:%,1#[t]Px:nat,[n](Fin x->Bool)~=(Fin (pow 2 x))
:%*,3$[=getD:1.5e3]
:%,1#[t]Px:nat,Py:nat,[n](Fin x->Fin y)~=(Fin (pow y x))
:%*,3$[=getD:1.5e3]
:%,0#[[permMaster]][=ac:"permMaster"][t]Px:nat,[n](Fin x ~= Fin x)~=(Fin (factorial x))
:%,2$[=getD:1.888e4]

// List

:ttap,4#[t]List False
:%,4#[t]List nat
:%*,1@[zh]nil表示空列表[n]cons x : List a -> List a[n] 是个函数，对应向列表追加元素x[en]nil represents the empty list[n]cons x : List a -> List a[n]is a function corresponding to[n]adding element x to a list
:%*,4#[t]Sx:List nat,[n]not (x=nil)
:%*,4,5$[[ttOption]][=unl:true][zh]Option类型[en]the Option type
:%*,4,5,2#[t]not (Pa:U,Option a ~=[n] Option (Option a))
:%*,4,5,2,5$[=getD:400]
:%*,4,1$[=getD:150]
:%*,5#[[:=fillList]][zh]请定义一个函数fillList :[n]Pa:U,Px:a,Pn:nat,List a[n]它输出n个x组成的列表[n]如：fillList Bool 1b 2[n] === cons 1b (cons 1b nil)[n]#t:=[en]Please define a function fillList :[n]Pa:U,Px:a,Pn:nat,List a[n]It outputs a list consisting of n copies of x[n]For example:[n]fillList Bool 1b 2[n] === cons 1b (cons 1b nil)[n]#t:=
:%,2#[[:=lastList]][zh]请定义一个函数lastList :[n]Pa:U,Pl:List a,Option a[n]若列表非空则输出[n]最后一个放入的值some x[n]若列表为nil则输出none[n]如 lastList Bool[n](cons 1b (cons 0b nil))[n] === some 1b[n]#t:=[en]Please define a function lastList :[n]Pa:U,Pl:List a,Option a[n]If the list is non-empty[n]output the last inserted value some x[n]If the list is nil[n]output none[n]For example, lastList Bool[n](cons 1b (cons 0b nil))[n] === some 1b[n]#t:=
:%,5#[[:=firstList]][zh]请定义一个函数firstList :[n]Pa:U,Pl:List a,Option a[n]若列表非空则输出[n]第一个放入的值some x[n]若列表为nil则输出none[n]如 firstList Bool[n](cons 1b (cons 0b nil))[n] === some 0b[n]#t:=[en]Please define a function firstList :[n]Pa:U,Pl:List a,Option a[n]If the list is non-empty[n]output the first inserted value some x[n]If the list is nil[n]output none[n]For example, firstList Bool[n](cons 1b (cons 0b nil))[n] === some 0b[n]#t:=
:%,2#[t]Pa:U,Pl:List a,[n]firstList a l = none[n] -> l = nil
:%*,5#[t]Pa:U,Pl:List a,[n](firstList a l = none)[n] ~= (l = nil)
:%*,5,0$[=getD:100]
:%*,5,5$[=getD:1e3]
:%,1#[[:=lenList]][zh]请定义一个函数lenList :[n]Pa:U,Pl:List a,nat[n]输出列表中的元素个数[n]如lenList False nil === 0[n]lenList U (cons nat (cons True nil)) === 2[n]#t:=[en]Please define a function lenList :[n]Pa:U,Pl:List a,nat[n]Output the number of elements in the list[n]For example,[n]lenList False nil === 0[n]lenList U (cons nat (cons True nil)) === 2[n]#t:=
:%*,2#[[:=sumList]][zh]请定义一个函数sumList :[n](List nat)->nat[n]对列表的所有元素求和[n]如sumList (cons 1 (cons 2 (cons 3 nil)))[n] === 6[n]#t:=[en]Please define a function sumList :[n](List nat)->nat[n]which sums all elements of the list[n]For example,[n]sumList (cons 1 (cons 2 (cons 3 nil)))[n] === 6[n]#t:=
:%*,2,5#[t]Pl:List nat,Pn:nat,[n]add (sumList l) n[n]= sumList (cons n l)
:%*,2,5,3$[=getD:160]
:%*,2,4#[t]Pl:List nat,[n]sumList l = [n]sumList (invList nat l)
:%*,2,4,3$[=getD:160]
:%*,3#[[:=mapList]][zh]请定义一个函数mapList :[n]Pa:U,Pb:U,Pf:a->b,List a->List b[n]通过函数f把List a中的元素[n]一一映射构造List b[n]如mapList (List nat) nat sumList[n](cons nil (cons (cons 3 nil) nil))[n] === cons 0 (cons 3 nil)[n]#t:=[en]Please define a function mapList :[n]Pa:U,Pb:U,Pf:a->b,List a->List b[n]which maps each element of List a[n]through function f[n]to construct a List b[n]For example,[n]mapList (List nat) nat sumList[n](cons nil (cons (cons 3 nil) nil))[n] === cons 0 (cons 3 nil)[n]#t:=
:%*,3,3,5#[=payD:8e3]
:%*,3,4#[t]Pa:U,(Px:List a,x=nil)~=(not a)
:%*,3,4,4$[=getD:3e3]
:%*,3,3,5,5$[[del-W]][=dstrTarget:"W"][=dstr:"#W\\n提示：也可以选择不拆除它"]
:%*,3,2$[=getD:660]
:%*,4#[[:=count_0]][zh]请定义一个函数count_0 :[n]List nat -> nat[n]统计列表中0出现的次数，如[n]count_0 (cons 0 (cons 10 (cons 0 nil)))[n] === 2[n]#t:=[en]Please define a function count_0 :[n]List nat -> nat[n]which counts the number of occurrences of 0[n]in the list, for example[n]count_0 (cons 0 (cons 10 (cons 0 nil)))[n] === 2[n]#t:=
:%*,4,4$[=getD:600]
:%*,4,1#[[:=del_0]][zh]请定义一个函数del_0 :[n]List nat -> List nat[n]将列表中的所有0删去[n]其它元素顺序不变，如[n]del_0 (cons 10 (cons 0 (cons 8 nil)))[n] === cons 10 (cons 8 nil)[n]#t:=[en]Please define a function del_0 :[n]List nat -> List nat[n]which removes all 0s from the list[n]while preserving the order of other elements[n]For example,[n]del_0 (cons 10 (cons 0 (cons 8 nil)))[n] === cons 10 (cons 8 nil)[n]#t:=
:%*,4,1,2#[t]Pl:List nat, sumList l[n]= sumList (del_0 l)
:%*,4,1,2,5$[=getD:200]
:%*,4,1,4,1$[=getD:200]
:%*,4,1,4#[t]Pl:List nat, [n]count_0 (del_0 l) = 0
:%*,4,1,5$[=getD:900]
:%,1#[[:=invList]][zh]请定义一个函数invList :[n]Pa:U,Pl:List a,List a[n]将列表顺序颠倒[n]如invList nat (cons 1 (cons 2 (cons 3 nil)))[n] === (cons 3 (cons 2 (cons 1 nil)))[n]#t:=[en]Please define a function invList :[n]Pa:U,Pl:List a,List a[n]which reverses the order of a list[n]For example,[n]invList nat (cons 1 (cons 2 (cons 3 nil)))[n] === (cons 3 (cons 2 (cons 1 nil)))[n]#t:=
:%*,3$[=getD:200]
:%*,5,5$[=getD:1e3]
:%*,5#[t]Pa:U,Pl:List a, lenList a l[n] = lenList a (invList a l)
:%*,4#[t]Pa:U,Pl:List a, firstList a l[n] = lastList a (invList a l)
:%*,4,3$[=getD:1e3]
:%,1#[[:=joinList]][zh]请定义一个函数joinList :[n]Pa:U,List a->List a->List a[n]连接两个列表生成新列表[n]如joinList nat (cons 1 nil) (cons 2 nil)[n] === cons 1 (cons 2 nil)[n]#t:=[en]Please define a function joinList :[n]Pa:U,List a->List a->List a[n]which concatenates two lists[n]into a new list[n]For example,[n]joinList nat (cons 1 nil) (cons 2 nil)[n] === cons 1 (cons 2 nil)[n]#t:=
:%*,3$[=getD:200]
:%,1#[t]Pl1:List nat,Pl2:List nat,[n]lenList nat (joinList nat l1 l2)[n]= add (lenList nat l1) (lenList nat l2)
:%*,5$[=getD:200]

:ttap2,3@[zh]提示：解锁证明策略eq后[n]可匹配填入一些[n]这附近解锁的相等证据[n]来自动化简证明目标[en]Hint: After unlocking the eq strategy[n]it can automatically match and apply[n]some equality proofs unlocked nearby[n]to simplify proof goals
:%,2#[t]Pa:U,Pb:a->U,Px:a,Py:a,Pz:a,[n]Pp:x=y,Pq:y=z,Pu:b x,[n]trans b (p*q) u = [n]trans b q (trans b p u)
:%,1#[t]Pa:U,Pb:U,Pc:b->U,[n]Pf:a->b,Px:a,Py:a,[n]Pp:x=y,Pu:c (f x),[n]trans (Lx:a.c (f x)) p u[n] = trans c (ap f p) u
:%,2#[t]Pa:U,Pc1:a->U,Pc2:a->U,[n]Pf:Px:a,(c1 x)->(c2 x),[n]Px:a,Py:a,Pp:x=y,Pu:c1 x,[n]trans c2 p (f x u) = [n]f y (trans c1 p u)
:%,1#[t]Pa:U,Pc1:a->U,Pc2:a->U,[n]Px:a,Py:a,Pp:x=y,[n]Pu:(c1 x)X(c2 x),[n]trans (Lx:a.(c1 x)X(c2 x)) p u[n] = [n](trans c1 p (pr0 u), trans c2 p (pr1 u))
:%,1#[t]Pa:U,Px0:a,Px1:a,Px2:a,[n]Pp:x1=x2,Pq:x0=x1,[n]trans (Lx:a,x0=x) p q = q*p
:%*,3$[[ttransright]][=unl:true][zh]证据transright[en]the evidence[n] transright
:%,1#[t]Pa:U,Px0:a,Px1:a,Px2:a,[n]Pp:x1=x2,Pq:x1=x0,[n]trans (Lx:a,x=x0) p q = (inveq p)*q
:%*,3$[[ttransleft]][=unl:true][zh]证据transleft[en]the evidence[n] transleft
:%,1#[t]Pa:U,Px0:a,Px1:a,Px2:a,[n]Pp:x1=x2,Pq:x1=x1,[n]trans (Lx:a,x=x) p q = (inveq p)*q*p
:%*,3$[[ttransleftright]][=unl:true][zh]证据transleftright[en]the evidence[n] transleftright
:%,1#[t]Pa:U,Pb:a->U,Pc:a->U,[n]Pm:a,Pn:a,Pp:m=n,[n]Pf:(b m)->(c m),[n](trans (Lx:a.(b x)->(c x)) p f) =[n]Lu:b n.trans (Lx:a.c x) p [n](f (trans (Lx:a.b x) (inveq p) u))
:%,3$[=getD:600]
:%,3@[zh]嫌钱给少了？[n]这可是证明排中律[n]不成立的关键步骤哦[en]Think the fee is too low?[n]This is a crucial step[n]in proving that[n]excluded middle does not hold!

:1neq2,3$[[ttZ]][=ac:"ttZ"][=unl:true][zh]整数类型[n]Z[en]the integer type[n]Z
:1neq2,4#[=payD:3e3]
:%,2@
:%,1$[[ttsuccZ]][=unl:true][zh]整数后继运算succZ[en]integer successor operation succZ
:%,2;1;1;1@..
:%,1#[=payD:2e3]
:ttZ,5#[t]Sf:nat->Z,Sg:Z->nat,[n]Pn:nat,g(f n) = n X [n] (f n) = nat2Z(succ n)
:ttZ,1#[t]Sf:nat->Z,Sg:Z->nat,[n]Pn:nat,g(f n) = n X [n](f 0 = 0Z) 
:ttZ,2#[=payD:3e3]
:%,1$[[ttnat2Z]][=unl:true][zh]自然数到整数[n]的转换函数nat2Z[en]the conversion function[n]from natural numbers to integers[n]nat2Z
:ttZ,4#[t]Sf:Z->Z,Px:Z,[n]f(succZ x) = predZ(f x)[n] X (f 0Z = 0Z)
:%,5$[[ttpredZ]][=unl:true][zh]整数前继运算predZ[en]integer predecessor operation predZ
:ttZ,3#[=payD:3e3]
:%,5$[[ttnegZ]][=unl:true][zh]整数相反数运算negZ[en]integer negation operation negZ
:ttindTrue,4#[t]Px:nat,Py:nat,eq (add x y) (add y x)
:%,1$[[ttmul]][=unl:true][zh]乘法函数[n]mul : nat->nat->nat[en]multiplication function[n]mul : nat->nat->nat
:%*,3#[t]Pn:nat,Px:nat,Py:nat,[n]pow n (add x y) = [n]mul (pow n x) (pow n y)
:%*,3,5$[=getD:660]
:%*,5#[t]Pn:nat,Px:nat,Py:nat,[n]pow n (mul x y) = [n]pow (pow n x) y
:%*,5,2$[=getD:660]
:%,2#[t]Pn:nat,eq (mul 0 n) 0
:%,1#[t]Pn:nat,eq (mul 1 n) n
:%*,4$[[ttList]][=ac:"ttList"][=unl:true][zh]列表类型List[en]the List type
:%,1#[t]Pn:nat,eq [n](mul n 2) (double n)
:%,1#[t]Px:nat,Py:nat,eq (mul x y) (mul y x)
:%*,3#[=payD:1e4]
:%*,3,1$[[del-ttAleph]][=dstrTarget:"ttpAleph"][=dstr:"#Aleph\\n提示：也可以选择不拆除它"]
:%*,4$[[ttpow]][=unl:true][zh]幂函数[n]pow : nat->nat->nat[en]exponentiation function[n]pow : nat->nat->nat
:%*,4,5#[t]Pm:nat,Pn:nat,Sx:nat,mul x [n](mul (factorial m) (factorial n))[n] = factorial (add m n)
:%*,4,5,2$[=getD:660]
:%*,4,4#[[:=Combin]][zh]定义组合函数[n]Combin:nat->nat->nat[n]使得Combin n k === [n] n!/k!/(n-k)![n]#t:=[en]Define a combination function[n]Combin:nat->nat->nat[n]such that Combin n k ===[n] n!/k!/(n-k)![n]#t:=
:%*,4,4,1$[=getD:6.6e3]
:%*,4,1#[[:=factorial2]][=ac:":=factorial2"][zh]定义双阶乘函数[n]factorial2:nat->nat[n]使得对奇数n有[n]factorial2 n = 1x3x5x..xn[n]对偶数n有[n]factorial2 n = 2x4x6x..xn[n]#t:=[en]Define the double factorial function[n]factorial2:nat->nat[n]such that for odd n[n]factorial2 n = 1x3x5x..xn[n]and for even n[n]factorial2 n = 2x4x6x..xn[n]#t:=
:%*,4,1,5$[=getD:6.6e3]
:%,1#[t]Px:nat,Py:nat,Pz:nat,[n]eq (mul x (add y z))[n](add (mul x y) (mul x z))
:%*,4$[[tt!]][=unl:true][zh]阶乘函数[n]factorial : nat->nat[en]factorial function[n]factorial : nat->nat
:%,1#[t]Px:nat,Py:nat,Pz:nat,[n]eq (mul x (mul y z))[n](mul (mul x y) z)
:%,1$[=getD:500]
:%,1#[[tt5R7]][=ac:"tt5R7"][t]Px:nat,not (eq (mul x 5) 7)
:%,2$[=getD:5.7e3]
:hint-tt-a3,3@[zh]这种函数嵌套类型[n]其实就是多元函数类型[en]This nested function type[n]is actually a multi-argument function type
:%,3@[zh]输入的自变量为[n]a:U、b:U、c:U、[n]x:a->b->c、y:a->b、[n]z:a这六个[en]Input arguments are[n]a:U, b:U, c:U,[n]x:a->b->c, y:a->b,[n]z:a (total 6 inputs)
:%,3@[zh]输出的变量类型为c[n]我们的目标就是要构造[n]有这样输入输出[n]类型的多元函数[en]Output variable type is c[n]Our goal is to construct[n]a multi-argument function[n]with such input and output types
:%,3@[zh]于是可以先写[n]La:U.Lb:U.Lc:U.[n]Lx:a->b->c.[n]Ly:a->b.Lz:a.???[n]其中???类型是c，值还不确定[en]Thus we can first write[n]La:U.Lb:U.Lc:U.[n]Lx:a->b->c.[n]Ly:a->b.Lz:a.???[n]Where ??? has type c, but with unknown value ???
:%,3@[zh]只要在给定的输入变量下[n]能凑出一个类型为c的值[n]将其填入???处即可[en]Under given input variables,[n]a value of type c need to be constructed[n]then fill it in the ??? place,[n]that's all
:%,3@[zh]类型c只出现过两次[n]第一次c:U，告诉我们它是个类型[n]第二次出现在x:a->b->c[en]Type c occurs only twice[n]First c:U, telling us it's a type[n]Second occurs in x:a->b->c
:%,3@[zh]即输入类型为a、b的两个值，[n]x函数就能得到[n]类型为c的值[en]That is, given two values of types a, b,[n]function x can output[n]a value of type c
:%,3@[zh]类型为a的值是有的，[n]它是z[n]因此要找类型为b的值[en]A value of type a is [n]already available: it is z[n]Thus now we need to find a value of type b
:%,3@[zh]注意到y:a->b[n]意味着输入a类型的变量[n]就能得到b类型的变量：[n](y z) : b[en]Notice that y:a->b[n]means inputting a variable of type a[n]can obtain a variable of type b:[n](y z) : b
:%,3@[zh]现在可以让函数x作用了：[n]因为z:a、(y z):b[n]所以x z (y z):c[n]这就是???处要填入的表达式[en]Now we can apply function x:[n]Because z:a, (y z):b[n]Thus x z (y z):c[n]This is the expression to fill in the ??? place
:%,3@[zh]能看到这里[n]的玩家也太辛苦了[n]给点奖励合不合适？[en]You can read up to here[n]You work really hard![n]Is it appropriate to give a reward?
:%,3@[zh]合适得不得了[en]Yes!
:%,3$[=getD:666]

// 序数附加

1,2,2,1,2,4,1$[[w^2]][zh]到达序数ω²[en]Reach ordinal ω²
1,2,1,4,3,1$[[aInf]][=unl:true][zh]ZFC集合论[n]无穷公理(aInf)[en]ZFC set theory[n]axiom of infinity (aInf)

// w^w+w
// 1,2,1,4,4,1,4,1$[[dSd0]]解锁自然数与[n]后继函数[n]的集合论定义
// w^w+w^2
1,2,1,4,4,1,4,4,2,5$[[dw]][=unl:true][zh]第一个无限集合[n]“ω”(omega)[n](即自然数集)[en]the first infinite set[n]“ω” (omega)[n](i.e. set of natural numbers)
:dw,0#[p]∃!o:∀n:(n∈o ↔ ∀x:(({}∈x ∧ ∀y:(y∈x→y∪{y}∈x)) → n∈x))
// w^(w2)+w^2
1,2,1,4,3,4,4,1,4,2$[[dRel]][=unl:true][zh]二元关系谓词(Rel)[n]定义[en]definition of binary relation predicate (Rel)
1,2,1,4,3,4,4,1,4,3,1@[zh]提示：证明不可数集合[n]的存在请前往序数[n]ω^ω^ω[n][n]证明良序定理[n]请前往序数[n]ω^(ω+2)+ω^(ω+1)+ω^ω[en]Hint: To prove the existence of uncountable sets[n]Go to ordinal[n]ω^ω^ω[n][n]To prove the well-ordering theorem[n]Go to ordinal[n]ω^(ω+2)+ω^(ω+1)+ω^ω
// ω^(ω+2)+ω^(ω+1)+ω^ω
1,2,1,4,4,1,2,2,4,4,1,2,4,3,2$[[dOrder]][=unl:true][zh]全序(Order)与[n]良序(WellOrder)[n]定义[en]definitions of Order and WellOrder
// w^w^w+1
1,2,1,4,3,3,1,3$[[dEquiv]][=unl:true][zh]双射(Equiv)谓词的定义[en]definition of bijection (Equiv) predicate
:%,5#[p]∀a:∀b:∃quiv({a},{b})
:%,5$[=getD:1.1e6]
:dEquiv,5,0,4,2$[[dPow]][=unl:true]幂集(Pow)函数的定义
// :%,1,2,3$[[mcf]]解锁自定义递归函数[n]的公理模式[n]m
// w^2*3+w4+7
1,2,2,1,2,3,1,2,3,1,2,3,1,3,1,3,1,3,1,3,2,2,2,2,2$[[ttord]][=unl:true][zh]类型层中的[n]序数类型Ord[en]ordinal type (Ord) in type layer
:ttord,1,3@[zh]提示：正常使用序数类型[n]需先解锁类型层[n]与自然数类型[en]Hint: To use ordinal types, you need to first[n]unlock type layer and natural number type
1,2,1,4,3,4,4,1,4,4,2$[[base3]][zh]将序数进位基底[n]降至3[en]Reduce ordinal base to 3
1,2,1,4,3,4,4,1,4,3,2$[[base2]][zh]将序数进位基底[n]降至2[en]Reduce ordinal base to 2
// w^3+w^23+w5+7
1,2,2,1,2,2,3,1,2,3,1,2,3,1,2,3,1,3,1,3,1,3,1,3,1,3,2,2,2,2,2,1,3@[zh]你终于找到这里来啦！[n]并集公理是说[n]每个集合x的元素（也是集合）[n]中的所有元素能放在一起[n]构成新集合[en]You finally found your way here![n]The Axiom of Union says[n]that all elements of the elements [n](which are also sets)[n]of every set x can be put together[n]to form a new set.
:%,3@[zh]我们还需要结合分离公理aSep[n]得到不包含其它元素[n]的集合Union(x)[en]We also need to combine this [n]with the Axiom of Separation (aSep)[n]to obtain the set Union(x)[n]which contains no other elements.
:%*,2@[zh]这听起来有点复杂[n]你可以花钱买这个引理[n]它还能构造幂集、[n]自然数集等集合哦[en]This sounds a bit complicated.[n]You can buy this lemma;[n]it can also construct the power set,[n] natural numbers, and other sets.
:%*,2,5#[d]∃x:∀z:(#nf($0,x) → z∈x)⊢∃!x:∀z:(z∈x ↔ #nf($0,x))
:%*,2,5,2$[[.filter]][=unl:true][zh]引理“.filter”[en]the lemma ".filter"
:%*,2,4#[=payD:3e3]

:%,3@[zh]我们这样构造aUb：[n]Union({a,b})[en]We can construct [n]"aUb" by: Union({a,b})
//w^(w^w+w)
1,2,1,4,3,2,4,3,1#[=payD:1.111e6]
:%,5$[[stepw]][=unl:true][zh]技能[n]将能前往的最大序数[n]的后继运算提升至指数[en]skill[n]Upgrade the successor operation of 、nthe maximum reachable ordinal to exponential
//w***4
1,2,1,4,3,2,1,3$[=getD:2.222e8]
:%,3Oε₀
:%,3Oε₁
:%,3Oφ(ω,0)
:%,3Oφ(1@ω)
:%,3Oφ(1@(1,0))
:%,3OΨ(Ω₂)
:%,3OΨ(Ω_ω)
:%,3OΨ(Ω_Ω)
:%,3OΨ(I)
:%,3OΨ(M)
:%,3OPTO(ZFC)
:%,3OΩ
:%,3#[[Aleph]][zh]门#א[en]Gate #א
:%,3#[[AlephW]][zh]门#א_ω[en]Gate #א_ω
:%,3$[=getD:9.99999e8]

1,2,2@[zh]欢迎来到序数的世界[n]序数是自然数的推广[en]Welcome to the world of ordinals[n]Ordinals are generalizations of natural numbers
1,2,2,2,1,3@[zh]序数不仅包含自然数[n]还包含很多种“无穷大”[en]Ordinals not only include natural numbers[n]but also many kinds of "infinities"
1,2,2,2,2,2@[zh]要想突破有限到达无穷[n]需要借助极限的力量[en]To beyond finiteness to reach infinity[n]We need the power of limit
1,2,2,2,2,2,2,2,1,3@[zh]进度层中的数据统计[n]记录了你能前往的最大序数[n]以及序数的“进位”机制[en]Game statistics in progress layers[n]record the maximum ordinal you can reach[n]and the "carry" mechanism of ordinal base
1,2,2,2,2,2,2,2,2,2,2,2@[zh]到达一个序数有两种方式[n]一是取“后继”[n]二是取“极限”[en]There are two ways to reach an ordinal[n]One is to take the "successor"[n]The other is to take the "limit"
1,2,2,2,2,2,2,2,2,2,2,2,2,2,1,3@[zh]后继就是下一个数[n]即加上1[en]Successor is the next number[n]that is, plus 1
1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2@[zh]取“极限”进位则是把[n]大于某个数的数字[n]视为无穷“ω”[n](提示：你可以第一次进位了)[en]Taking a "limit" carry is to regard[n]numbers greater than a certain number[n]as infinity "ω"[n](Hint: You can carry for the first time)
1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,3@[zh]进位与序数更精确的描述如下[n]每个序数都等同于先于它的[n]所有序数构成的集合[en]A more precise description of limit ordinals is:[n]Each ordinal is equal to the set of all ordinals[n]smaller than it
1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2@[zh]将序数0定义为空集{}[n]则1 = {0}[n]2 = {0,1}[n]3 = {0,1,2}[n].....[en]Define ordinal 0 as empty set {}[n]then 1 = {0}[n]2 = {0,1}[n]3 = {0,1,2}[n].....
1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,3@[zh]这样从序数n得到[n]的序数n U {n}[n]就叫后继序数[en]Thus the ordinal obtained from ordinal n as[n]n U {n}[n]is called a successor ordinal
1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2@[zh]不是后继序数的序数[n]叫极限序数[n]如 ω = {0,1,2,3,4...}[n]即自然数的集合[n]是第一个除0外的极限序数[en]Ordinals that are not successor ordinals[n]are called limit ordinals[n]Such as ω = {0,1,2,3,4...}[n]that is, the set of natural numbers[n]is the first limit ordinal except 0
1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,3@[zh]虽然极限序数无法[n]在有限步之内达到[n]进位机制可让你在[n]有限步之内完成“飞升”[en]Limit ordinals cannot be reached[n]within finite steps[n]But the carry mechanism allows you to make[n] an infinit giant jump within finite steps
1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2@[zh]提示：ω17+7处[n]有一些重要的线索[en]Hint: At ω17+7[n]there are some important clues
1,2,2,1,3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,2,2,2,2,2$[[w^3]][zh]到达序数ω³[en]Reach ordinal ω³
1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,3@[[an42]][zh]刚刚你路过了[n]宇宙的终极答案的后继[en]Just now you passed by[n]the successor of the ultimate answer of the universe
1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2@[zh]你或许发现了[n]这些数字[n]都是质数[en]You may have noticed[n]These numbers[n]are all prime numbers
1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,3@[zh]质数有无穷个[n]一直走下去也没什么意思[en]There are infinitely many prime numbers[n]It's not interesting to keep going
1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2@[zh]真的还要继续前进吗？[en]Do you really want to continue advancing?
1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,3@[zh]好了我的朋友[n]请回吧[en]Well my friend[n]Please go back
1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2@[zh]这个游戏最主要的[n]谜题是形式系统[n]难道不是吗？[en]The main puzzle of this game is the formal system[n]Isn't it?
1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,3@[zh]还有好多谜题等着[n]你来解开呢[n]别贪玩了[en]There are many puzzles waiting[n]for you to solve[n]Don't be too nauty
1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2@[zh]你知道吗？[n]为了你继续向前走[n]我在这里要多码[n]好几百字呢[en]Did you know?[n]For you to keep moving forward[n]I have to write [n]hundreds of words here
:%*,2,2,2,2,2,2,1,3@[zh]而且，再往下走[n]你的浏览器继续加载[n]地图，内存会溢出的[en]Moreover, going further down[n]Your browser continues to load[n] more map contents, memory will overflow
:%,2,2,2,2,2,2,2,2,2,2@[zh]别走了，速回！[n]请听我的话[n]我不会害你的[en]Don't go further, come back quickly![n]Please listen to me[n]I won't harm you
:%*,2,2,2,2,2,2,1,3@[zh]快回去！[n]你这个顽固的家伙！[en]Go back![n]You stubborn guy!
:%,2,2,2,2,2,2,2,2,2,2,2,2,2,2@[zh]你继续向前走吧[n]我不管你了！[en]Go forward![n]I don't care about you anymore!
:%*,2,2,2,2,1,3@
:%,2,2,2,2,2,2@[zh]别找我！[en]Don't look for me!
:%*,2,2,2,2,1,3@
:%,2,2,2,2,2,2@[zh]别烦我！[en]Leave me alone!
:%*,2,2,2,2,1,3@
:%,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2@[zh]你真的疯了[en]You are really crazy
:an42,3@[zh]为纪念你来到这里[n]现将终极答案[n]印发给你们[en]To commemorate your arrival here[n]Now print the ultimate answer[n]for you
:an42,3,3@[zh]向前追寻答案吧！[n](建议保存一下游戏进度[n]再去追寻哦)[en]Go forward in pursuit of the answer![n](Hint: Save your game progress[n] before you set off)


// 银行：道路货架旁的兑换奖励，可重复进入；不弹窗、不自动兑换。
:bank-lobby,1@
:bank-lobby,1,1$[[bank-r2t-1]][="exchange":{"bank":"builtin:lobby","from":"reasoning","to":"type","amount":1}][zh]推理素 → 类型币[n]兑换本金 1[n]手续费 0.01[n]到账 1[n]走入后兑换，可重复[en]Deductrium → Type[n]Principal 1[n]Fee 0.01[n]Credit 1[n]Enter to exchange; repeatable
:bank-lobby,1,2@
:bank-lobby,1,2,1$[[bank-r2t-10]][="exchange":{"bank":"builtin:lobby","from":"reasoning","to":"type","amount":10}][zh]推理素 → 类型币[n]兑换本金 10[n]手续费 0.1[n]到账 10[n]走入后兑换，可重复[en]Deductrium → Type[n]Principal 10[n]Fee 0.1[n]Credit 10[n]Enter to exchange; repeatable
:bank-lobby,1,2,2@
:bank-lobby,1,2,2,1$[[bank-r2t-100]][="exchange":{"bank":"builtin:lobby","from":"reasoning","to":"type","amount":100}][zh]推理素 → 类型币[n]兑换本金 100[n]手续费 1[n]到账 100[n]走入后兑换，可重复[en]Deductrium → Type[n]Principal 100[n]Fee 1[n]Credit 100[n]Enter to exchange; repeatable
:bank-lobby,1,2,2,2@
:bank-lobby,1,2,2,2,1$[[bank-r2t-1000]][="exchange":{"bank":"builtin:lobby","from":"reasoning","to":"type","amount":1000}][zh]推理素 → 类型币[n]兑换本金 1000[n]手续费 10[n]到账 1000[n]走入后兑换，可重复[en]Deductrium → Type[n]Principal 1000[n]Fee 10[n]Credit 1000[n]Enter to exchange; repeatable
:bank-lobby,1,2,2,2,2@
:bank-lobby,1,2,2,2,2,1$[[bank-r2t-1000000]][="exchange":{"bank":"builtin:lobby","from":"reasoning","to":"type","amount":1000000}][zh]推理素 → 类型币[n]兑换本金 1000000[n]手续费 10000[n]到账 1000000[n]走入后兑换，可重复[en]Deductrium → Type[n]Principal 1000000[n]Fee 10000[n]Credit 1000000[n]Enter to exchange; repeatable
:bank-lobby,1,2,2,2,2,2@
:bank-lobby,1,2,2,2,2,2,1$[[bank-r2t-1000000000]][="exchange":{"bank":"builtin:lobby","from":"reasoning","to":"type","amount":1000000000}][zh]推理素 → 类型币[n]兑换本金 1000000000[n]手续费 1e+07[n]到账 1000000000[n]走入后兑换，可重复[en]Deductrium → Type[n]Principal 1000000000[n]Fee 1e+07[n]Credit 1000000000[n]Enter to exchange; repeatable
:bank-lobby,3@
:bank-lobby,3,3$[[bank-t2r-1]][="exchange":{"bank":"builtin:lobby","from":"type","to":"reasoning","amount":1}][zh]类型币 → 推理素[n]兑换本金 1[n]手续费 0.01[n]到账 1[n]走入后兑换，可重复[en]Type → Deductrium[n]Principal 1[n]Fee 0.01[n]Credit 1[n]Enter to exchange; repeatable
:bank-lobby,3,2@
:bank-lobby,3,2,3$[[bank-t2r-10]][="exchange":{"bank":"builtin:lobby","from":"type","to":"reasoning","amount":10}][zh]类型币 → 推理素[n]兑换本金 10[n]手续费 0.1[n]到账 10[n]走入后兑换，可重复[en]Type → Deductrium[n]Principal 10[n]Fee 0.1[n]Credit 10[n]Enter to exchange; repeatable
:bank-lobby,3,2,2@
:bank-lobby,3,2,2,3$[[bank-t2r-100]][="exchange":{"bank":"builtin:lobby","from":"type","to":"reasoning","amount":100}][zh]类型币 → 推理素[n]兑换本金 100[n]手续费 1[n]到账 100[n]走入后兑换，可重复[en]Type → Deductrium[n]Principal 100[n]Fee 1[n]Credit 100[n]Enter to exchange; repeatable
:bank-lobby,3,2,2,2@
:bank-lobby,3,2,2,2,3$[[bank-t2r-1000]][="exchange":{"bank":"builtin:lobby","from":"type","to":"reasoning","amount":1000}][zh]类型币 → 推理素[n]兑换本金 1000[n]手续费 10[n]到账 1000[n]走入后兑换，可重复[en]Type → Deductrium[n]Principal 1000[n]Fee 10[n]Credit 1000[n]Enter to exchange; repeatable
:bank-lobby,3,2,2,2,2@
:bank-lobby,3,2,2,2,2,3$[[bank-t2r-1000000]][="exchange":{"bank":"builtin:lobby","from":"type","to":"reasoning","amount":1000000}][zh]类型币 → 推理素[n]兑换本金 1000000[n]手续费 10000[n]到账 1000000[n]走入后兑换，可重复[en]Type → Deductrium[n]Principal 1000000[n]Fee 10000[n]Credit 1000000[n]Enter to exchange; repeatable
:bank-lobby,3,2,2,2,2,2@
:bank-lobby,3,2,2,2,2,2,3$[[bank-t2r-1000000000]][="exchange":{"bank":"builtin:lobby","from":"type","to":"reasoning","amount":1000000000}][zh]类型币 → 推理素[n]兑换本金 1000000000[n]手续费 1e+07[n]到账 1000000000[n]走入后兑换，可重复[en]Type → Deductrium[n]Principal 1000000000[n]Fee 1e+07[n]Credit 1000000000[n]Enter to exchange; repeatable
`;
