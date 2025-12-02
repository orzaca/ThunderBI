/* ============================================================
   fin_hoy.js
   FIN – /reports/{id}?include=reportFields
============================================================ */

/* ------------------- CAMPOS FIN ---------------------------- */
/* Template 152079:
   152080 → SITIO DE FINALIZACION
   152081 → Digite la Ciudad donde Finaliza el servicio:
*/
const CAMPOS_FIN = {
    sitioFinal: 152080,
    ciudadFinal: 152081
};

let TOKEN_FIN = null;
let REPORTES_META_FIN_HOY = [];
let FINALIZACIONES_HOY = [];

/* ============================================================
   UTILIDADES FECHA / HORA
============================================================ */

function fechaHoyTracktik() {
    const h = new Date();
    const y = h.getFullYear();
    const m = String(h.getMonth() + 1).padStart(2, "0");
    const d = String(h.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}T00:00:00-05:00`;
}

function formatearHora24(fechaISO) {
    if (!fechaISO) return "-";
    const d = new Date(fechaISO);
    if (isNaN(d)) return "-";
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
}

function textoFechaBonitaHoy() {
    const now = new Date();
    const opciones = {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    };
    return now.toLocaleDateString("es-CO", opciones);
}

/* ============================================================
   LOADER
============================================================ */

function mostrarLoaderFin(mostrar) {
    const el = document.getElementById("loader");
    if (!el) return;
    if (mostrar) el.classList.remove("oculto");
    else el.classList.add("oculto");
}

/* ============================================================
   TOKEN
============================================================ */

async function getTokenFin() {
    if (TOKEN_FIN) return TOKEN_FIN;

    const r = await fetch(CONFIG.apiUrl + "auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            username: CONFIG.username,
            password: CONFIG.password
        })
    });

    if (!r.ok) {
        console.error("Error obteniendo token (fin_hoy)", r.status, await r.text());
        return null;
    }

    const json = await r.json();
    TOKEN_FIN = json?.auth?.token || null;
    return TOKEN_FIN;
}

/* ============================================================
   1) LISTA DE REPORTES DE HOY (SIN CAMPOS)
============================================================ */

async function getReportsPageFin(token, offset, desde = null) {
    const ids = Object.values(CONFIG.templates).join(",");

    const filtros = {
        limit: 100,
        offset,
        "reportTemplate.id:in": ids,
        "reportDateTime:after": desde || fechaHoyTracktik(),
        include: "account,reportTemplate,createdBy"
    };

    const url = `${CONFIG.apiUrl}reports?${new URLSearchParams(filtros).toString()}`;

    const r = await fetch(url, {
        headers: { "Authorization": `Bearer ${token}` }
    });

    if (!r.ok) {
        console.error("Error trayendo página de reportes (fin_hoy)", r.status, await r.text());
        return [];
    }

    const json = await r.json();
    return json?.data ?? [];
}

async function getAllReportsMetaFinHoy() {
    const token = await getTokenFin();
    if (!token) return [];

    let offset = 0;
    let total = [];
    const desde = fechaHoyTracktik();

    while (true) {
        const page = await getReportsPageFin(token, offset, desde);
        if (!page.length) break;
        total = total.concat(page);
        if (page.length < 100) break;
        offset += 100;
    }

    if (total.length) {
        console.log("Ejemplo reporte (meta, fin_hoy):", total[0]);
    }

    return total;
}

/* ============================================================
   2) DETALLE /reports/{id}?include=reportFields
============================================================ */

async function getFinalizacionesConCampos(metaFinalizaciones) {
    const token = await getTokenFin();
    if (!token) return [];

    const resultados = [];

    for (const meta of metaFinalizaciones) {
        const reportId = meta.id || meta.uuid;
        if (!reportId) continue;

        const url = `${CONFIG.apiUrl}reports/${reportId}?include=reportFields`;

        try {
            const r = await fetch(url, {
                headers: { "Authorization": `Bearer ${token}` }
            });

            if (!r.ok) {
                console.error("Error detalle reporte (fin)", reportId, r.status, await r.text());
                continue;
            }

            const json = await r.json();
            const rep = json.data || json;

            resultados.push({
                meta,
                reportFields: rep.reportFields || []
            });

        } catch (e) {
            console.error("Excepción detalle reporte (fin)", reportId, e);
        }
    }

    if (resultados.length) {
        console.log("Ejemplo detalle FIN:", resultados[0]);
    }

    return resultados;
}

/* ============================================================
   3) LECTURA DE VALORES POR ID
============================================================ */

function getValorCampoPorId(fields, fieldId) {
    if (!Array.isArray(fields)) return null;
    const target = Number(fieldId);

    const f = fields.find(x => {
        if (!x) return false;

        if (Number(x.field) === target) return true;
        if (Number(x.templateField) === target) return true;
        if (Number(x.templateFieldId) === target) return true;
        if (Number(x.reportTemplateField) === target) return true;
        if (Number(x.reportTemplateFieldId) === target) return true;

        return false;
    });

    if (!f) return null;

    let v = f.value;
    if (v && typeof v === "object" && "value" in v) {
        v = v.value;
    }
    if (v !== undefined && v !== null && v !== "") {
        return v;
    }

    let r = f.response;
    if (r && typeof r === "object" && "value" in r) {
        r = r.value;
    }
    if (r !== undefined && r !== null && r !== "") {
        return r;
    }

    for (const k in f) {
        if (!Object.prototype.hasOwnProperty.call(f, k)) continue;
        const lk = k.toLowerCase();
        if (lk.includes("value") && f[k] != null && f[k] !== "") {
            const val = f[k];
            if (typeof val === "object" && "value" in val) return val.value;
            return val;
        }
    }

    return null;
}

function extraerDatosFin(meta, fields) {
    const sitioFinal  = getValorCampoPorId(fields, CAMPOS_FIN.sitioFinal);
    const ciudadFinal = getValorCampoPorId(fields, CAMPOS_FIN.ciudadFinal);

    return {
        fechaHora: meta.reportDateTime,
        hora: formatearHora24(meta.reportDateTime),
        cliente: meta.account ? meta.account.name : "",
        empleado: meta.createdBy
            ? `${meta.createdBy.firstName} ${meta.createdBy.lastName}`.trim()
            : "",
        sitioFinal,
        ciudadFinal
    };
}

/* ============================================================
   PINTAR TABLA + KPIs
============================================================ */

function pintarTablaFin(lista) {
    const tbody = document.querySelector("#tabla-fin tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!lista.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 5; // 5 columnas
        td.textContent = "No hay finalizaciones registradas para hoy.";
        td.style.textAlign = "center";
        td.style.padding = "16px";
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }

    lista
        .sort((a, b) => a.fechaHora.localeCompare(b.fechaHora))
        .forEach(item => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${item.hora}</td>
                <td>${item.cliente || "-"}</td>
                <td>${item.empleado || "-"}</td>
                <td>${item.sitioFinal || "-"}</td>
                <td>${item.ciudadFinal || "-"}</td>
            `;
            tbody.appendChild(tr);
        });
}

function actualizarKPIsFin(lista) {
    const spanTotal    = document.getElementById("kpi-total-fin");
    const spanClientes = document.getElementById("kpi-clientes-fin");
    const spanEsc      = document.getElementById("kpi-escoltas-fin");

    if (!lista || !lista.length) {
        spanTotal.textContent    = "0";
        spanClientes.textContent = "0";
        spanEsc.textContent      = "0";
        return;
    }

    const total    = lista.length;
    const clientes = new Set(lista.map(x => x.cliente).filter(Boolean)).size;
    const escoltas = new Set(lista.map(x => x.empleado).filter(Boolean)).size;

    spanTotal.textContent    = total;
    spanClientes.textContent = clientes;
    spanEsc.textContent      = escoltas;
}

/* ============================================================
   FLUJO PRINCIPAL
============================================================ */

async function cargarFinalizacionesHoy() {
    try {
        mostrarLoaderFin(true);

        // 1) Todos los reportes de hoy
        REPORTES_META_FIN_HOY = await getAllReportsMetaFinHoy();

        const idFin = CONFIG.templates.fin;

// Solo FIN de clientes configurados
        const metaFinalizaciones = REPORTES_META_FIN_HOY.filter(
            r =>
                r.reportTemplate && r.reportTemplate.id === idFin &&
                esClienteDeConfig(r.account)
        );


        console.log("Total meta finalizaciones hoy:", metaFinalizaciones.length);

        // 3) Detalle con campos
        const finesDetallados = await getFinalizacionesConCampos(metaFinalizaciones);

        // 4) Estructura final
        FINALIZACIONES_HOY = finesDetallados.map(x =>
            extraerDatosFin(x.meta, x.reportFields)
        );

        console.log("Finalizaciones de hoy:", FINALIZACIONES_HOY);

        pintarTablaFin(FINALIZACIONES_HOY);
        actualizarKPIsFin(FINALIZACIONES_HOY);
    } catch (e) {
        console.error("Error cargando finalizaciones de hoy:", e);
        pintarTablaFin([]);
        actualizarKPIsFin([]);
    } finally {
        mostrarLoaderFin(false);
    }
}

/* ============================================================
   INICIO PÁGINA
============================================================ */

document.addEventListener("DOMContentLoaded", () => {
    const sub = document.getElementById("subtitulo-dia");
    if (sub) {
        sub.textContent = "Reportes de FIN del día de hoy – " + textoFechaBonitaHoy();
    }

    const btn = document.getElementById("btn-recargar");
    if (btn) {
        btn.addEventListener("click", () => {
            cargarFinalizacionesHoy();
        });
    }

    cargarFinalizacionesHoy();
});
