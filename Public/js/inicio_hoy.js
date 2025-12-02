/* ============================================================
   Inicio_hoy.js
   Lee los valores de campos usando /reports/{id}?include=reportFields
============================================================ */

/* ------------------- CONFIG CAMPOS INICIO POR ID ----------- */
// Template 152004
const CAMPOS_INICIO = {
    sitioInicio:   152005, // SITIO DE INICIO
    ciudadOrigen:  152006, // Digite la Ciudad donde Inicia el servicio:
    ciudadDestino: 152007, // Digite la CIudad de Destino:
    tipoServicio:  152635, // Selecciona la opción que se ajusta a tu tipo de servicio actual
    fotoInicio:    152009  // Registro Fotográfico del Sitio de Inicio
};

/* ------------------- VARIABLES GLOBALES --------------------- */
let TOKEN_INICIO = null;
let REPORTES_META_HOY = [];  // solo metadata (lista)
let INICIOS_HOY = [];        // metadata + valores de campos

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

function mostrarLoaderInicio(mostrar) {
    const el = document.getElementById("loader");
    if (!el) return;
    if (mostrar) el.classList.remove("oculto");
    else el.classList.add("oculto");
}

/* ============================================================
   TOKEN – IGUAL QUE EN app.js
============================================================ */

async function getTokenInicio() {
    if (TOKEN_INICIO) return TOKEN_INICIO;

    const r = await fetch(CONFIG.apiUrl + "auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            username: CONFIG.username,
            password: CONFIG.password
        })
    });

    if (!r.ok) {
        console.error("Error obteniendo token (inicio_hoy)", r.status, await r.text());
        return null;
    }

    const json = await r.json();
    TOKEN_INICIO = json?.auth?.token || null;
    return TOKEN_INICIO;
}

/* ============================================================
   1) LISTA DE REPORTES DE HOY (SIN CAMPOS)
============================================================ */

async function getReportsPageInicio(token, offset, desde = null) {
    const ids = Object.values(CONFIG.templates).join(",");

    const filtros = {
        limit: 100,
        offset,
        "reportTemplate.id:in": ids,
        "reportDateTime:after": desde || fechaHoyTracktik(),
        include: "account,reportTemplate,createdBy" // 👈 sin reportFields aquí
    };

    const url = `${CONFIG.apiUrl}reports?${new URLSearchParams(filtros).toString()}`;

    const r = await fetch(url, {
        headers: { "Authorization": `Bearer ${token}` }
    });

    if (!r.ok) {
        console.error("Error trayendo página de reportes (inicio_hoy)", r.status, await r.text());
        return [];
    }

    const json = await r.json();
    return json?.data ?? [];
}

async function getAllReportsMetaHoy() {
    const token = await getTokenInicio();
    if (!token) return [];

    let offset = 0;
    let total = [];
    const desde = fechaHoyTracktik();

    while (true) {
        const page = await getReportsPageInicio(token, offset, desde);
        if (!page.length) break;
        total = total.concat(page);
        if (page.length < 100) break;
        offset += 100;
    }

    if (total.length) {
        console.log("Ejemplo de reporte (solo metadata, inicio_hoy):", total[0]);
    }

    return total;
}

/* ============================================================
   2) DETALLE /reports/{id}?include=reportFields
============================================================ */

/**
 * Dado un array de reportes (metadata) de INICIO,
 * pide uno por uno su versión detallada con reportFields.
 */
async function getIniciosConCampos(metaInicios) {
    const token = await getTokenInicio();
    if (!token) return [];

    const resultados = [];

    for (const meta of metaInicios) {
        const reportId = meta.id || meta.uuid;
        if (!reportId) continue;

        const url = `${CONFIG.apiUrl}reports/${reportId}?include=reportFields`;

        try {
            const r = await fetch(url, {
                headers: { "Authorization": `Bearer ${token}` }
            });

            if (!r.ok) {
                console.error("Error trayendo detalle de reporte", reportId, r.status, await r.text());
                continue;
            }

            const json = await r.json();
            const rep = json.data || json; // por si viene envuelto

            if (!rep.reportFields) {
                console.warn("Reporte sin reportFields:", reportId, rep);
            }

            resultados.push({
                meta,
                reportFields: rep.reportFields || []
            });

        } catch (e) {
            console.error("Excepción trayendo detalle de reporte", reportId, e);
        }
    }

    if (resultados.length) {
        console.log("Ejemplo detalle INICIO (con campos):", resultados[0]);
    }

    return resultados;
}

/* ============================================================
   3) LECTURA DE VALORES POR ID DE CAMPO
============================================================ */

/**
 * Formato típico según TrackTik:
 * {
 *   "templateField": 152006,
 *   "value": { "type": "text", "value": "BARRANQUILLA" }
 * }
 */
function getValorCampoPorId(fields, fieldId) {
    if (!Array.isArray(fields)) return null;
    const target = Number(fieldId);

    const f = fields.find(x => {
        if (!x) return false;

        // IDs posibles
        if (Number(x.field) === target) return true;
        if (Number(x.templateField) === target) return true;        // ⭐ principal
        if (Number(x.templateFieldId) === target) return true;
        if (Number(x.reportTemplateField) === target) return true;
        if (Number(x.reportTemplateFieldId) === target) return true;

        return false;
    });

    if (!f) return null;

    // ---- 1) valor estándar en f.value ----
    let v = f.value;

    // Si viene como objeto { type, value }
    if (v && typeof v === "object" && "value" in v) {
        v = v.value;
    }

    if (v !== undefined && v !== null && v !== "") {
        return v;
    }

    // ---- 2) fallback por f.response ----
    let r = f.response;
    if (r && typeof r === "object" && "value" in r) {
        r = r.value;
    }
    if (r !== undefined && r !== null && r !== "") {
        return r;
    }

    // ---- 3) súper fallback: cualquier propiedad que contenga "value" ----
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

function extraerDatosInicio(meta, fields) {
    const sitioInicio   = getValorCampoPorId(fields, CAMPOS_INICIO.sitioInicio);
    const ciudadOrigen  = getValorCampoPorId(fields, CAMPOS_INICIO.ciudadOrigen);
    const ciudadDestino = getValorCampoPorId(fields, CAMPOS_INICIO.ciudadDestino);
    const tipoServicio  = getValorCampoPorId(fields, CAMPOS_INICIO.tipoServicio);

    return {
        fechaHora: meta.reportDateTime,
        hora: formatearHora24(meta.reportDateTime),
        cliente: meta.account ? meta.account.name : "",
        empleado: meta.createdBy
            ? `${meta.createdBy.firstName} ${meta.createdBy.lastName}`.trim()
            : "",
        sitioInicio:   sitioInicio,
        ciudadOrigen:  ciudadOrigen,
        ciudadDestino: ciudadDestino,
        tipoServicio:  tipoServicio
    };
}

/* ============================================================
   PINTAR TABLA + KPIs
============================================================ */

function pintarTablaInicios(lista) {
    const tbody = document.querySelector("#tabla-inicios tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!lista.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 7;
        td.textContent = "No hay inicios registrados para hoy.";
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
                <td>${item.sitioInicio || "-"}</td>
                <td>${item.ciudadOrigen || "-"}</td>
                <td>${item.ciudadDestino || "-"}</td>
                <td>${item.tipoServicio || "-"}</td>
            `;
            tbody.appendChild(tr);
        });
}

function actualizarKPIsInicio(lista) {
    const spanTotal    = document.getElementById("kpi-total-inicios");
    const spanClientes = document.getElementById("kpi-clientes");
    const spanEsc      = document.getElementById("kpi-escoltas");

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

async function cargarIniciosHoy() {
    try {
        mostrarLoaderInicio(true);

        // 1) Traemos todos los reportes de hoy (metadata)
        REPORTES_META_HOY = await getAllReportsMetaHoy();

             const idInicio = CONFIG.templates.inicio;

        // 2) Filtramos solo los de INICIO y de clientes de config.js
        const metaInicios = REPORTES_META_HOY.filter(
            r =>
                r.reportTemplate && r.reportTemplate.id === idInicio &&
                esClienteDeConfig(r.account)
        );


        // 3) Para cada uno, pedimos detalle con reportFields
        const iniciosDetallados = await getIniciosConCampos(metaInicios);

        // 4) Convertimos a estructura para la tabla
        INICIOS_HOY = iniciosDetallados.map(x =>
            extraerDatosInicio(x.meta, x.reportFields)
        );

        console.log("Inicios de hoy (inicio_hoy.js):", INICIOS_HOY);

        pintarTablaInicios(INICIOS_HOY);
        actualizarKPIsInicio(INICIOS_HOY);
    } catch (e) {
        console.error("Error cargando inicios de hoy:", e);
        pintarTablaInicios([]);
        actualizarKPIsInicio([]);
    } finally {
        mostrarLoaderInicio(false);
    }
}

/* ============================================================
   INICIO PÁGINA
============================================================ */

document.addEventListener("DOMContentLoaded", () => {
    const sub = document.getElementById("subtitulo-dia");
    if (sub) {
        sub.textContent = "Reportes de INICIO del día de hoy – " + textoFechaBonitaHoy();
    }

    const btn = document.getElementById("btn-recargar");
    if (btn) {
        btn.addEventListener("click", () => {
            cargarIniciosHoy();
        });
    }

    cargarIniciosHoy();
});
