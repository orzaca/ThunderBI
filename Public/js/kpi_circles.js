/* ===============================================
   GRAFICOS CIRCULARES – PANEL CLIENTE
   BASE = INICIO SERVICIO (c-inicio)
=============================================== */

/**
 * Devuelve un color según el porcentaje:
 *  0–33%  => rojo
 * 34–66%  => amarillo
 * 67–100% => verde
 */
function getColorPorcentajeCirculo(pct) {
    if (pct <= 33) return "#E74C3C";  // rojo
    if (pct <= 66) return "#F1C40F";  // amarillo
    return "#2ECC71";                 // verde
}

function refrescarKPICircularesDesdeDOM() {
    const inicio     = Number(document.getElementById("c-inicio")?.innerText) || 0;
    const llegada    = Number(document.getElementById("c-llegada")?.innerText) || 0;
    const empalme    = Number(document.getElementById("c-empalme")?.innerText) || 0;
    const desempalme = Number(document.getElementById("c-desempalme")?.innerText) || 0;
    const fin        = Number(document.getElementById("c-fin")?.innerText) || 0;

    const base = inicio > 0 ? inicio : 1;

    const lista = [
        { id: "circle-empalme",     pctId: "pct-empalme",     val: empalme },
        { id: "circle-desempalme",  pctId: "pct-desempalme",  val: desempalme },
        { id: "circle-fin",         pctId: "pct-fin",         val: fin }
    ];

    lista.forEach(k => {
        const pctRaw = base === 0 ? 0 : (k.val / base) * 100;
        const pct = Math.round(Math.max(0, Math.min(100, pctRaw)));
        const color = getColorPorcentajeCirculo(pct);

        const circle = document.querySelector(`#${k.id} .progress`);
        if (circle) {
            const offset = 188 - (188 * pct / 100);
            circle.style.strokeDashoffset = offset;
            circle.style.stroke = color;
        }

        const pv = document.getElementById(k.pctId);
        if (pv) pv.innerText = pct + "%";
    });
}
