"use strict";
// Loaded before the stylesheets so a saved dark theme also applies on first paint.
(() => {
    const key = "deductrium2_theme";
    const valid = (value) => value === "light" || value === "dark" ? value : "auto";
    const read = () => {
        try {
            return valid(localStorage.getItem(key));
        }
        catch {
            return "auto";
        }
    };
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    let preference = read();
    const apply = () => {
        const theme = preference === "auto" ? (system.matches ? "dark" : "light") : preference;
        const changed = document.documentElement.dataset.theme !== theme;
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.colorScheme = theme;
        const select = document.getElementById("theme-select");
        if (select)
            select.value = preference;
        if (changed)
            window.dispatchEvent(new CustomEvent("deductrium-theme-change", { detail: theme }));
    };
    apply();
    document.addEventListener("DOMContentLoaded", () => {
        const select = document.getElementById("theme-select");
        if (!select)
            return;
        select.value = preference;
        select.addEventListener("change", () => {
            preference = valid(select.value);
            try {
                localStorage.setItem(key, preference);
            }
            catch { /* Still usable without storage. */ }
            apply();
        });
    });
    system.addEventListener("change", () => { if (preference === "auto")
        apply(); });
    window.addEventListener("storage", event => {
        if (event.key !== key && event.key !== null)
            return;
        preference = read();
        apply();
    });
})();
//# sourceMappingURL=theme.js.map