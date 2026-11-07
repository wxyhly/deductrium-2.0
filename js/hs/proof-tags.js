/** Shared IDs for proof-source policies, labels, and the map authoring language. */
export const PROOF_TAGS = [
    { id: 'propositional', zh: '命题逻辑', en: 'Propositional' },
    { id: 'classical', zh: '经典逻辑', en: 'Classical' },
    { id: 'intuitionistic', zh: '直觉逻辑', en: 'Intuitionistic' },
    { id: 'first-order', zh: '一阶逻辑', en: 'First order' },
    { id: 'zfc', zh: 'ZFC', en: 'ZFC' },
    { id: 'nbg', zh: 'NBG', en: 'NBG' },
    { id: 'peano', zh: '皮亚诺算术', en: 'Peano arithmetic' },
    { id: 'natural', zh: '自然数', en: 'Natural numbers' },
    { id: 'integer', zh: '整数', en: 'Integers' },
    { id: 'rational', zh: '有理数', en: 'Rationals' },
    { id: 'real', zh: '实数', en: 'Reals' },
    { id: 'custom', zh: '自定义公理', en: 'Custom axioms' },
];
export function validProofTags(tags) {
    return tags.length > 0 && tags.length <= PROOF_TAGS.length
        && new Set(tags).size === tags.length
        && tags.every(tag => PROOF_TAGS.some(value => value.id === tag));
}
//# sourceMappingURL=proof-tags.js.map