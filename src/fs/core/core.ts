import { AST } from "./ast.js";
import { Assertion, Deduction, Proposition } from "./deduct.js";

export class HibertSystem {
    rules: Map<string, Deduction> = new Map;
    asserts: Assertion[] = [];
    hyps: Proposition[] = [];
    props: Proposition[] = [];
}