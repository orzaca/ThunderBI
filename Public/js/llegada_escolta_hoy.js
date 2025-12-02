/* ============================================================
   llegada_escolta_hoy.js
   LLEGADA ESCOLTA – /reports/{id}?include=reportFields
============================================================ */

/* ------------------- CAMPOS LLEGADA ESCOLTA ---------------- */
// Según tu tabla de campos del template 89591:
const CAMPOS_LLEGADA_ESCOLTA = {
    rutaAsignada: 143650,   // Ruta Asignada:
    observaciones: 143063   // Observaciones:
};

let TOKEN_LLEGADA = null;
let REPORTES_META_LLEGADA_HOY = [];
let LLEGADAS_HOY = [];

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

function mostrarLoaderLlegada(mostrar) {
    const el = document.getElementById("loader");
    if (!el) return;
    if (mostrar) el.classList.remove("oculto");
    else el.classList.add("oculto");
}

/* ============================================================
   TOKEN
============================================================ */

async function getTokenLlegada() {
    if (TOKEN_LLEGADA) return TOKEN_LLEGADA;

    const r = await fetch(CONFIG.apiUrl + "auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            username: CONFIG.username,
            password: CONFIG.password
        })
    });

    if (!r.ok) {
        console.error("Error obteniendo token (llegada_escolta_hoy)", r.status, await r.text());
        return null;
    }

    const json = await r.json();
    TOKEN_LLEGADA = json?.auth?.token || null;
    return TOKEN_LLEGADA;
}

/* ============================================================
   1) LISTA DE REPORTES DE HOY (SIN CAMPOS)
============================================================ */

async function getReportsPageLlegada(token, offset, desde = null) {
    // Igual que en inicio_hoy.js: usamos TODOS los templates configurados
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
        console.error("Error trayendo página de reportes (llegada_escolta_hoy)", r.status, await r.text());
        return [];
    }

    const json = await r.json();
    return json?.data ?? [];
}

async function getAllReportsMetaLlegadaHoy() {
    const token = await getTokenLlegada();
    if (!token) return [];

    let offset = 0;
    let total = [];
    const desde = fechaHoyTracktik();

    while (true) {
        const page = await getReportsPageLlegada(token, offset, desde);
        if (!page.length) break;
        total = total.concat(page);
        if (page.length < 100) break;
        offset += 100;
    }

    if (total.length) {
        console.log("Ejemplo de reporte (meta, llegada_escolta_hoy):", total[0]);
    }

    return total;
}

/* ============================================================
   2) DETALLE /reports/{id}?include=reportFields
============================================================ */

async function getLlegadasConCampos(metaLlegadas) {
    const token = await getTokenLlegada();
    if (!token) return [];

    const resultados = [];

    for (const meta of metaLlegadas) {
        const reportId = meta.id || meta.uuid;
        if (!reportId) continue;

        const url = `${CONFIG.apiUrl}reports/${reportId}?include=reportFields`;

        try {
            const r = await fetch(url, {
                headers: { "Authorization": `Bearer ${token}` }
            });

            if (!r.ok) {
                console.error("Error detalle reporte (llegada)", reportId, r.status, await r.text());
                continue;
            }

            const json = await r.json();
            const rep = json.data || json;

            resultados.push({
                meta,
                reportFields: rep.reportFields || []
            });

        } catch (e) {
            console.error("Excepción detalle reporte (llegada)", reportId, e);
        }
    }

    if (resultados.length) {
        console.log("Ejemplo detalle LLEGADA ESCOLTA:", resultados[0]);
    }

    return resultados;
}

/* ============================================================
   3) LECTURA DE VALORES POR ID (igual que INICIO)
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

function extraerDatosLlegada(meta, fields) {
    const rutaAsignada  = getValorCampoPorId(fields, CAMPOS_LLEGADA_ESCOLTA.rutaAsignada);
    const observaciones = getValorCampoPorId(fields, CAMPOS_LLEGADA_ESCOLTA.observaciones);

    return {
        fechaHora: meta.reportDateTime,
        hora: formatearHora24(meta.reportDateTime),
        cliente: meta.account ? meta.account.name : "",
        empleado: meta.createdBy
            ? `${meta.createdBy.firstName} ${meta.createdBy.lastName}`.trim()
            : "",
        rutaAsignada:  rutaAsignada,
        observaciones: observaciones
    };
}

/* ============================================================
   PINTAR TABLA + KPIs
============================================================ */

function pintarTablaLlegadas(lista) {
    const tbody = document.querySelector("#tabla-llegadas tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!lista.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 5; // 5 columnas en la tabla
        td.textContent = "No hay llegadas registradas para hoy.";
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
                <td>${item.rutaAsignada || "-"}</td>
                <td>${item.observaciones || "-"}</td>
            `;
            tbody.appendChild(tr);
        });
}

function actualizarKPIsLlegada(lista) {
    const spanTotal    = document.getElementById("kpi-total-llegadas");
    const spanClientes = document.getElementById("kpi-clientes-llegadas");
    const spanEsc      = document.getElementById("kpi-escoltas-llegadas");

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

async function cargarLlegadasHoy() {
    try {
        mostrarLoaderLlegada(true);

        // 1) Traemos TODOS los reportes de hoy (como en inicio)
        REPORTES_META_LLEGADA_HOY = await getAllReportsMetaLlegadaHoy();

        // 👇 AQUÍ ESTABA EL PROBLEMA: usamos CONFIG.templates.llegada
        const idLlegada = CONFIG.templates.llegada;

        const metaLlegadas = REPORTES_META_LLEGADA_HOY.filter(
            r =>
                r.reportTemplate && r.reportTemplate.id === idLlegada &&
                esClienteDeConfig(r.account)
        );


        console.log("Total meta llegadas hoy (template llegada):", metaLlegadas.length);

        // 2) Detalle con reportFields
        const llegadasDetalladas = await getLlegadasConCampos(metaLlegadas);

        // 3) Estructura final
        LLEGADAS_HOY = llegadasDetalladas.map(x =>
            extraerDatosLlegada(x.meta, x.reportFields)
        );

        console.log("Llegadas escolta de hoy:", LLEGADAS_HOY);

        pintarTablaLlegadas(LLEGADAS_HOY);
        actualizarKPIsLlegada(LLEGADAS_HOY);
    } catch (e) {
        console.error("Error cargando llegadas de hoy:", e);
        pintarTablaLlegadas([]);
        actualizarKPIsLlegada([]);
    } finally {
        mostrarLoaderLlegada(false);
    }
}

/* ============================================================
   INICIO PÁGINA
============================================================ */

document.addEventListener("DOMContentLoaded", () => {
    const sub = document.getElementById("subtitulo-dia");
    if (sub) {
        sub.textContent = "Reportes de LLEGADA ESCOLTA del día de hoy – " + textoFechaBonitaHoy();
    }

    const btn = document.getElementById("btn-recargar");
    if (btn) {
        btn.addEventListener("click", () => {
            cargarLlegadasHoy();
        });
    }

    cargarLlegadasHoy();
});
