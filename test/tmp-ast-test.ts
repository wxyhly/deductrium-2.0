type OrdNode = string | number | ["+" | "*" | "^", ...OrdNode[]];

function stringifyA(ast: OrdNode): string {
    if (typeof ast !== "object") {
        return ast.toString();
    }
    if (ast[0] === "+") {
        return stringifyA(ast.slice(1).map(e => stringifyA(e)).join("+"));
    }
    if (ast[0] === "*") {
        return stringifyA(ast.slice(1).map(e => stringifyA(e)).join("*"));
    }
    if (ast[0] === "^") {
        return stringifyA(ast[1]) + "^" + stringifyA(ast[2]);
    }
}

function stringifyB(ast: OrdNode): string {
    if (typeof ast !== "object") {
        return ast.toString();
    }
    if (ast[0] === "+") {
        return stringifyB(ast.slice(1).map(e => stringifyB(e)).join("+"));
    }
    if (ast[0] === "*") {
        return stringifyB(ast.slice(1).map(e => stringifyB(e)).join("*"));
    }
    return stringifyB(ast[1]) + "^" + stringifyB(ast[2]);
}
