export var NodeType;
(function (NodeType) {
    // hs
    NodeType[NodeType["ATOM_ITEM"] = 0] = "ATOM_ITEM";
    NodeType[NodeType["ATOM_WFF"] = 1] = "ATOM_WFF";
    NodeType[NodeType["ATOM_VAR"] = 2] = "ATOM_VAR";
    NodeType[NodeType["ATOM_UKNOWN"] = 3] = "ATOM_UKNOWN";
    NodeType[NodeType["LOGIC"] = 4] = "LOGIC";
    NodeType[NodeType["QUANT"] = 5] = "QUANT";
    NodeType[NodeType["BOUNDED_QUANT"] = 6] = "BOUNDED_QUANT";
    NodeType[NodeType["FN"] = 7] = "FN";
    NodeType[NodeType["PRED"] = 8] = "PRED";
    NodeType[NodeType["SEP"] = 9] = "SEP";
    NodeType[NodeType["RPL"] = 10] = "RPL";
    NodeType[NodeType["CLASS"] = 11] = "CLASS";
    NodeType[NodeType["SB"] = 12] = "SB";
    NodeType[NodeType["ASSERT"] = 13] = "ASSERT";
    NodeType[NodeType["CMD"] = 14] = "CMD";
    NodeType[NodeType["RULE"] = 15] = "RULE";
    NodeType[NodeType["NODE_DNAME"] = 16] = "NODE_DNAME";
    NodeType[NodeType["ATOM_DNAME"] = 17] = "ATOM_DNAME";
    // tt
    NodeType[NodeType["ATOM"] = 18] = "ATOM";
    NodeType[NodeType["SYM"] = 19] = "SYM";
    NodeType[NodeType["BOUND"] = 20] = "BOUND";
    NodeType[NodeType["U"] = 21] = "U";
    NodeType[NodeType["APP"] = 22] = "APP";
    NodeType[NodeType["CHECK"] = 23] = "CHECK";
    NodeType[NodeType["UFN"] = 24] = "UFN";
})(NodeType || (NodeType = {}));
//# sourceMappingURL=asttype.js.map