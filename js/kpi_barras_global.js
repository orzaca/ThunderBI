/* ===============================================
   BARRAS HORIZONTALES – PANEL GLOBAL
   BASE = TOTAL INICIOS (total-inicio)
=============================================== */

/**
 * Devuelve un color según el porcentaje:
 *  0–33%  => rojo
 * 34–66%  => amarillo
 * 67–100% => verde
 */
function getColorPorcentajeBarra(pct) {
    if (pct <= 33) return "#E74C3C";  // rojo
    if (pct <= 66) return "#F1C40F";  // amarillo
    return "#2ECC71";                 // verde
}

/**
 * Lee los totales globales del DOM y dibuja las barras.
 */
function refrescarBarrasGlobalDesdeDOM() {
    const inicio     = Number(document.getElementById("total-inicio")?.innerText) || 0;
    const empalme    = Number(document.getElementById("total-empalme")?.innerText) || 0;
    const desempalme = Number(document.getElementById("total-desempalme")?.innerText) || 0;
    const fin        = Number(document.getElementById("total-fin")?.innerText) || 0;

    const base = inicio > 0 ? inicio : 1;

    const barras = [
        { id: "bar-empalme",     pctId: "bar-empalme-pct",     val: empalme },
        { id: "bar-desempalme",  pctId: "bar-desempalme-pct",  val: desempalme },
        { id: "bar-fin",         pctId: "bar-fin-pct",         val: fin }
    ];

    barras.forEach(b => {
        const pctRaw = base === 0 ? 0 : (b.val / base) * 100;
        const pct = Math.round(Math.max(0, Math.min(100, pctRaw)));
        const color = getColorPorcentajeBarra(pct);

        const fill = document.querySelector(`#${b.id} .kpi-progress-fill`);
        if (fill) {
            fill.style.width = pct + "%";
            fill.style.backgroundColor = color;
        }

        const pv = document.getElementById(b.pctId);
        if (pv) pv.innerText = pct + "%";
    });
}
