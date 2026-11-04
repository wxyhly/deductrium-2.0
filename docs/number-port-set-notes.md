# Set bridges and integer proofs

`src/hs/core/number-set-proofs.ts` exports three strings for `HSLayer.addRules`:

- `naturalSetBridgeTheorems`: 16 rules before `.setZIntro`, including existential helpers, natural/omega conversion, pair injectivity, `.Pr1`/`.Pr2`, `.N@t`, `.Xi`, and `.Xe`.
- `integerSetTheorems`: eight rules from `.setZIntro` onward, including `.@Z`, `.Zr`, and `.Z+s` plus their helpers.
- `numberSetTheorems`: both strings joined, for standalone testing.

Load the natural bridges after the primitives and Peano theorems, before the additional natural-set collection in 自然数. Load the integer collection in 整数. Every entry contains actual HS commands checked by the kernel.

`.N@t` preserves its legacy closed interface `⊢$x∈ℕ→$y∈$x→$y∈ℕ`, directly aliasing `.setNt`. `.@Z` and `.Zr` retain their genuine condition lists.

`.N@t` uses `apn5`, `d0`, `dS`, and the set membership definitions. `.Zr` uses `dfZ`, separation, extensionality, product elimination, and natural addition associativity, commutativity, and cancellation. `.Z+s` obtains natural-pair representatives from `dZ` with existential elimination, applies `dZ+`, and commutes their natural coordinates. Its legacy statement remains `⊢$x∈ℤ→$y∈ℤ→$x+$y=$y+$x`.

These proofs depend on the disambiguated `drepl` image syntax `{($B)|$x∈$C}` and capture-safe RPL/SEP substitution support. Representative extraction uses the literal `x` binder from `dZ`, then proves existential renaming by introduction and elimination.

## Integer generator

`src/hs/core/integer-proofs.ts` exports `generateIntegerProof(system: HilbertSystem, name: string): Deduction | undefined`. The `HilbertSystem.getD` fallback calls `generateNumberProof(...) ?? generateIntegerProof(...)`.

| Name | Checked conclusion |
| --- | --- |
| `.1@Z` | `+1∈ℤ` |
| `.-0@Z` | `-0∈ℤ` |
| `.+2+-3` | `+2+-3=-1` |
| `.2-3` | `+2-+3=-1` |
| `.-2--3` | `-2--3=+1` |
| `.-2*-3` | `-2*-3=+6` |

Unsigned addition/multiplication names remain with the natural-number generator. Integer operation operands retain explicit signs, including `-0`; results use canonical `+0`. Natural pair membership, literal definitions, coordinate projections, natural arithmetic, and `.Zr` produce the proof. BigInt arithmetic selects the exact target; every inference is checked.

Leading zeroes, surrounding whitespace, and unsupported names return `undefined`. Missing or failed proof bridges also return `undefined`. Inputs or pair-coordinate results exceeding 1000 throw an explicit successor budget error. The returned deduction has proof steps, no hypotheses, and no unproved assertions. The caller's propositions, active folder, and local names are restored in `finally`, including when a dependency throws.

Operand rewrites target the individual left/right operand so `+0` and `-0` retain their spelling even though both denote `Z((0,0))`. Command serialization parenthesizes replacement parameters beginning with a sign, preserving their boundary after condition IDs and other arguments during replay.

## Verification

Compile the current checkout, then run:

```text
node test/test-number-set-proofs.mjs
```

The test imports only `../js` compiled modules and replays all 24 rules through the real loader. It checks the split exports, signed membership, 20 explicit legacy examples, and all 192 addition/subtraction/multiplication combinations of `-3,-2,-1,-0,+0,+1,+2,+3`. Every generated case is serialized with `genCmd` and independently replayed. It also checks malformed names, missing bridges, successor budgets, open-folder preservation, and an injected dependency error.

All of these checks passed against a fresh TypeScript compile of the repository. Run this focused compiled-JS regression test directly with the command above.
