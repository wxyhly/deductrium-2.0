import { FSParser } from "./fs/core/parser.js";
import { SyntaxEditor } from "./ast.js";
import { AstType } from "./fs/core/ast.js";
const initialCode =
    `∀x:(x∈ℕ→x≥0)>12<16|-$1`;
const editor2 = new SyntaxEditor(document.getElementById('deduct-editor')!, new FSParser, initialCode, AstType.WFF);