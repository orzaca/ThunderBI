/* ============================================================
   empalme_hoy.js
   EMPALME – /reports/{id}?include=reportFields
============================================================ */

/* ------------------- CAMPOS EMPALME ------------------------ */
/* Template 89596 (EMPALME):
   143609 → RUTAS:
   143652 → PLACA DEL VEHICULO EMPALMADO
   144545 → Numero de Servicio:
   143661 → PRECINTO (Si Aplica)
   90346  → Registro fotografico vehiculo empalmado (no lo pintamos aún)
*/
const CAMPOS_EMP = {
    ruta: 143609,
    placa: 143652,
    numeroServicio: 144545,
    precinto: 143661,
    foto: 90346
};

let TOKEN_EMP = null;
let REPORTES_META_EMPALME_HOY = [];
let EMPALMES_HOY = [];

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

function mostrarLoaderEmpalme(mostrar) {
    const el = document.getElementById("loader");
    if (!el) return;
    if (mostrar) el.classList.remove("oculto");
    else el.classList.add("oculto");
}

/* ============================================================
   TOKEN
============================================================ */

async function getTokenEmpalme() {
    if (TOKEN_EMP) return TOKEN_EMP;

    const r = await fetch(CONFIG.apiUrl + "auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            username: CONFIG.username,
            password: CONFIG.password
        })
    });

    if (!r.ok) {
        console.error("Error obteniendo token (empalme_hoy)", r.status, await r.text());
        return null;
    }

    const json = await r.json();
    TOKEN_EMP = json?.auth?.token || null;
    return TOKEN_EMP;
}

/* ============================================================
   1) LISTA DE REPORTES DE HOY (SIN CAMPOS)
============================================================ */

async function getReportsPageEmpalme(token, offset, desde = null) {
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
        console.error("Error trayendo página de reportes (empalme_hoy)", r.status, await r.text());
        return [];
    }

    const json = await r.json();
    return json?.data ?? [];
}

async function getAllReportsMetaEmpalmeHoy() {
    const token = await getTokenEmpalme();
    if (!token) return [];

    let offset = 0;
    let total = [];
    const desde = fechaHoyTracktik();

    while (true) {
        const page = await getReportsPageEmpalme(token, offset, desde);
        if (!page.length) break;
        total = total.concat(page);
        if (page.length < 100) break;
        offset += 100;
    }

    if (total.length) {
        console.log("Ejemplo reporte (meta, empalme_hoy):", total[0]);
    }

    return total;
}

/* ============================================================
   2) DETALLE /reports/{id}?include=reportFields
============================================================ */

async function getEmpalmesConCampos(metaEmpalmes) {
    const token = await getTokenEmpalme();
    if (!token) return [];

    const resultados = [];

    for (const meta of metaEmpalmes) {
        const reportId = meta.id || meta.uuid;
        if (!reportId) continue;

        const url = `${CONFIG.apiUrl}reports/${reportId}?include=reportFields`;

        try {
            const r = await fetch(url, {
                headers: { "Authorization": `Bearer ${token}` }
            });

            if (!r.ok) {
                console.error("Error detalle reporte (empalme)", reportId, r.status, await r.text());
                continue;
            }

            const json = await r.json();
            const rep = json.data || json;

            resultados.push({
                meta,
                reportFields: rep.reportFields || []
            });

        } catch (e) {
            console.error("Excepción detalle reporte (empalme)", reportId, e);
        }
    }

    if (resultados.length) {
        console.log("Ejemplo detalle EMPALME:", resultados[0]);
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

function extraerDatosEmpalme(meta, fields) {
    const ruta           = getValorCampoPorId(fields, CAMPOS_EMP.ruta);
    const placa          = getValorCampoPorId(fields, CAMPOS_EMP.placa);
    const numeroServicio = getValorCampoPorId(fields, CAMPOS_EMP.numeroServicio);
    const precinto       = getValorCampoPorId(fields, CAMPOS_EMP.precinto);
    // La foto (CAMPOS_EMP.foto) la dejamos para uso futuro

    return {
        fechaHora: meta.reportDateTime,
        hora: formatearHora24(meta.reportDateTime),
        cliente: meta.account ? meta.account.name : "",
        empleado: meta.createdBy
            ? `${meta.createdBy.firstName} ${meta.createdBy.lastName}`.trim()
            : "",
        ruta,
        placa,
        numeroServicio,
        precinto
    };
}

/* ============================================================
   PINTAR TABLA + KPIs
============================================================ */

function pintarTablaEmpalmes(lista) {
    const tbody = document.querySelector("#tabla-empalmes tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!lista.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 7; // 7 columnas en la tabla
        td.textContent = "No hay empalmes registrados para hoy.";
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
                <td>${item.ruta || "-"}</td>
                <td>${item.placa || "-"}</td>
                <td>${item.numeroServicio || "-"}</td>
                <td>${item.precinto || "-"}</td>
            `;
            tbody.appendChild(tr);
        });
}

function actualizarKPIsEmpalme(lista) {
    const spanTotal    = document.getElementById("kpi-total-empalmes");
    const spanClientes = document.getElementById("kpi-clientes-empalmes");
    const spanEsc      = document.getElementById("kpi-escoltas-empalmes");

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

async function cargarEmpalmesHoy() {
    try {
        mostrarLoaderEmpalme(true);

        // 1) Todos los reportes de hoy
        REPORTES_META_EMPALME_HOY = await getAllReportsMetaEmpalmeHoy();

        const idEmpalme = CONFIG.templates.empalme;

// Solo EMPALME de clientes configurados
        const metaEmpalmes = REPORTES_META_EMPALME_HOY.filter(
            r =>
                r.reportTemplate && r.reportTemplate.id === idEmpalme &&
                esClienteDeConfig(r.account)
        );


        console.log("Total meta empalmes hoy:", metaEmpalmes.length);

        // 3) Detalle con campos
        const empalmesDetallados = await getEmpalmesConCampos(metaEmpalmes);

        // 4) Estructura final
        EMPALMES_HOY = empalmesDetallados.map(x =>
            extraerDatosEmpalme(x.meta, x.reportFields)
        );

        console.log("Empalmes de hoy:", EMPALMES_HOY);

        pintarTablaEmpalmes(EMPALMES_HOY);
        actualizarKPIsEmpalme(EMPALMES_HOY);
    } catch (e) {
        console.error("Error cargando empalmes de hoy:", e);
        pintarTablaEmpalmes([]);
        actualizarKPIsEmpalme([]);
    } finally {
        mostrarLoaderEmpalme(false);
    }
}

/* ============================================================
   INICIO PÁGINA
============================================================ */

document.addEventListener("DOMContentLoaded", () => {
    const sub = document.getElementById("subtitulo-dia");
    if (sub) {
        sub.textContent = "Reportes de EMPALME del día de hoy – " + textoFechaBonitaHoy();
    }

    const btn = document.getElementById("btn-recargar");
    if (btn) {
        btn.addEventListener("click", () => {
            cargarEmpalmesHoy();
        });
    }

    cargarEmpalmesHoy();
});
