const light = {
    tiles: ["rgb(255,255,255)", "rgb(220,220,220)", "rgb(250,160,20)", "rgb(200,255,20)", "rgb(180,255,240)"],
    text: ["rgb(0,80,0)", "rgb(60,60,255)", "rgb(33,38,255)", "rgb(255,0,0)", "rgb(30,20,100)"],
    highlight: "rgb(255,255,0)", border: "rgb(220,220,220)", outline: "rgb(100,100,100)",
    debug: "rgb(0,0,0)", player: "rgba(0,0,0,0.2)",
    edges: ["rgba(255,70,50,0.5)", "rgba(0,0,255,1)", "rgba(0,180,0,0.3)", "rgba(0,170,0,0.4)", "rgba(120,100,80,0.8)"],
};
const dark = {
    tiles: ["#202d3c", "#101925", "#78501e", "#344b25", "#193f49"],
    text: ["#c6dfcd", "#93b8ff", "#fff0cb", "#e0f6a5", "#b4efef"],
    highlight: "#706018", border: "#101925", outline: "#61768d",
    debug: "#e1e9f4", player: "rgba(212,230,255,0.22)",
    edges: ["#ff9c85", "#8cb8ff", "#98dfa9", "#8ad2a0", "#e7c49e"],
};
export function getMapPalette() {
    return typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? dark : light;
}
//# sourceMappingURL=palette.js.map