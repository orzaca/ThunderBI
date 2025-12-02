/* ============================================================
   Zirius Mobile – Dashboard de INICIO (Demo gráficos)
   Mezclando INICIO + LLEGADA + EMPALME + FIN
============================================================ */

/* ------------------- CONFIG CAMPOS INICIO POR ID ----------- */
// Template 152004
const CAMPOS_INICIO = {
    sitioInicio:   152005,
    ciudadOrigen:  152006,
    ciudadDestino: 152007,
    tipoServicio:  152635
};

/* ------------------- VARIABLES GLOBALES --------------------- */
let TOKEN_INICIO = null;
let REPORTES_META_HOY = [];   // todos los reportes del día (meta)

let META_INICIOS   = [];
let META_LLEGADAS  = [];
let META_EMPALMES  = [];
let META_FINES     = [];

let INICIOS_HOY = []; // inicios enriquecidos con campos

// Para guardar instancias de Chart y poder destruirlas
const CHARTS = {
    clientes: null,
    ciudades: null,
    horas: null,
    tipos: null,
    tiposPie: null,
    clientesPolar: null,
    ciudadesRadar: null,
    scatterHoras: null,
    horasMix: null,
    funnelEtapas: null,
    clientesEtapas: null,
    horasMulti: null,
    escoltas: null
};

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
        console.error("Error obteniendo token (inicio_dashboard)", r.status, await r.text());
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
        include: "account,reportTemplate,createdBy"
    };

    const url = `${CONFIG.apiUrl}reports?${new URLSearchParams(filtros).toString()}`;

    const r = await fetch(url, {
        headers: { "Authorization": `Bearer ${token}` }
    });

    if (!r.ok) {
        console.error("Error trayendo página de reportes (inicio_dashboard)", r.status, await r.text());
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
        console.log("Ejemplo de reporte (metadata, dashboard inicio):", total[0]);
    }

    return total;
}

/* ============================================================
   2) DETALLE /reports/{id}?include=reportFields (SOLO INICIOS)
============================================================ */

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
                console.error("Error detalle reporte", reportId, r.status, await r.text());
                continue;
            }

            const json = await r.json();
            const rep = json.data || json;

            resultados.push({
                meta,
                reportFields: rep.reportFields || []
            });

        } catch (e) {
            console.error("Excepción detalle reporte", reportId, e);
        }
    }

    if (resultados.length) {
        console.log("Ejemplo detalle INICIO (dashboard):", resultados[0]);
    }

    return resultados;
}

/* ============================================================
   3) LECTURA DE VALORES POR ID DE CAMPO (INICIO)
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
   KPIs
============================================================ */

function actualizarKPIsInicio(lista) {
    const spanTotal    = document.getElementById("kpi-total-inicios");
    const spanClientes = document.getElementById("kpi-clientes");
    const spanEsc      = document.getElementById("kpi-escoltas");
    const spanCiud     = document.getElementById("kpi-ciudades-origen");

    if (!lista || !lista.length) {
        spanTotal.textContent    = "0";
        spanClientes.textContent = "0";
        spanEsc.textContent      = "0";
        spanCiud.textContent     = "0";
        return;
    }

    const total    = lista.length;
    const clientes = new Set(lista.map(x => x.cliente).filter(Boolean)).size;
    const escoltas = new Set(lista.map(x => x.empleado).filter(Boolean)).size;
    const ciudades = new Set(lista.map(x => x.ciudadOrigen).filter(Boolean)).size;

    spanTotal.textContent    = total;
    spanClientes.textContent = clientes;
    spanEsc.textContent      = escoltas;
    spanCiud.textContent     = ciudades;
}

/* ============================================================
   GRAFICOS – INICIOS
============================================================ */

function buildChartClientes() {
    const dataMap = {};
    INICIOS_HOY.forEach(r => {
        if (!r.cliente) return;
        dataMap[r.cliente] = (dataMap[r.cliente] || 0) + 1;
    });

    const labels = Object.keys(dataMap);
    const data = Object.values(dataMap);

    const ctx = document.getElementById("chartClientes");
    if (!ctx) return;

    if (CHARTS.clientes) CHARTS.clientes.destroy();

    CHARTS.clientes = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Inicios",
                data
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: true }
            },
            scales: {
                x: {
                    ticks: { autoSkip: false, maxRotation: 45, minRotation: 0 }
                },
                y: {
                    beginAtZero: true,
                    ticks: { precision: 0 }
                }
            }
        }
    });
}

function buildChartCiudades() {
    const dataMap = {};
    INICIOS_HOY.forEach(r => {
        if (!r.ciudadOrigen) return;
        dataMap[r.ciudadOrigen] = (dataMap[r.ciudadOrigen] || 0) + 1;
    });

    const labels = Object.keys(dataMap);
    const data = Object.values(dataMap);

    const ctx = document.getElementById("chartCiudades");
    if (!ctx) return;

    if (CHARTS.ciudades) CHARTS.ciudades.destroy();

    CHARTS.ciudades = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Inicios",
                data
            }]
        },
        options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: true }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { precision: 0 }
                },
                y: {
                    ticks: { autoSkip: false }
                }
            }
        }
    });
}

function buildChartHoras() {
    const horasMap = {};
    for (let h = 0; h < 24; h++) {
        const hh = String(h).padStart(2, "0");
        horasMap[hh] = 0;
    }

    INICIOS_HOY.forEach(r => {
        if (!r.hora || r.hora === "-") return;
        const hh = r.hora.substring(0, 2);
        if (horasMap.hasOwnProperty(hh)) {
            horasMap[hh]++;
        }
    });

    const labels = Object.keys(horasMap);
    const data = Object.values(horasMap);

    const ctx = document.getElementById("chartHoras");
    if (!ctx) return;

    if (CHARTS.horas) CHARTS.horas.destroy();

    CHARTS.horas = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [{
                label: "Inicios por hora",
                data,
                tension: 0.3,
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    ticks: { autoSkip: true, maxTicksLimit: 12 }
                },
                y: {
                    beginAtZero: true,
                    ticks: { precision: 0 }
                }
            }
        }
    });
}

function buildChartTipos() {
    const dataMap = {};
    INICIOS_HOY.forEach(r => {
        const t = r.tipoServicio || "Sin tipo definido";
        dataMap[t] = (dataMap[t] || 0) + 1;
    });

    const labels = Object.keys(dataMap);
    const data = Object.values(dataMap);

    const ctx = document.getElementById("chartTipos");
    if (!ctx) return;

    if (CHARTS.tipos) CHARTS.tipos.destroy();

    CHARTS.tipos = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels,
            datasets: [{
                label: "Inicios",
                data
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "right"
                }
            }
        }
    });
}

/* ------------------ PIE TIPOS ------------------------ */

function buildChartTiposPie() {
    const dataMap = {};
    INICIOS_HOY.forEach(r => {
        const t = r.tipoServicio || "Sin tipo definido";
        dataMap[t] = (dataMap[t] || 0) + 1;
    });

    const labels = Object.keys(dataMap);
    const data = Object.values(dataMap);

    const ctx = document.getElementById("chartTiposPie");
    if (!ctx) return;

    if (CHARTS.tiposPie) CHARTS.tiposPie.destroy();

    CHARTS.tiposPie = new Chart(ctx, {
        type: "pie",
        data: {
            labels,
            datasets: [{
                label: "Inicios",
                data
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

/* ------------------ POLAR AREA CLIENTES ------------- */

function buildChartClientesPolar() {
    const dataMap = {};
    INICIOS_HOY.forEach(r => {
        if (!r.cliente) return;
        dataMap[r.cliente] = (dataMap[r.cliente] || 0) + 1;
    });

    const labels = Object.keys(dataMap);
    const data = Object.values(dataMap);

    const ctx = document.getElementById("chartClientesPolar");
    if (!ctx) return;

    if (CHARTS.clientesPolar) CHARTS.clientesPolar.destroy();

    CHARTS.clientesPolar = new Chart(ctx, {
        type: "polarArea",
        data: {
            labels,
            datasets: [{
                label: "Inicios",
                data
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

/* ------------------ RADAR CIUDADES ------------------ */

function buildChartCiudadesRadar() {
    const dataMap = {};
    INICIOS_HOY.forEach(r => {
        if (!r.ciudadOrigen) return;
        dataMap[r.ciudadOrigen] = (dataMap[r.ciudadOrigen] || 0) + 1;
    });

    const labels = Object.keys(dataMap);
    const data = Object.values(dataMap);

    const ctx = document.getElementById("chartCiudadesRadar");
    if (!ctx) return;

    if (CHARTS.ciudadesRadar) CHARTS.ciudadesRadar.destroy();

    CHARTS.ciudadesRadar = new Chart(ctx, {
        type: "radar",
        data: {
            labels,
            datasets: [{
                label: "Inicios",
                data
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    beginAtZero: true,
                    ticks: { precision: 0 }
                }
            }
        }
    });
}

/* ------------------ SCATTER HORA VS ÍNDICE ---------- */

function buildChartScatterHoras() {
    const puntos = [];
    let idx = 0;

    INICIOS_HOY.forEach(r => {
        if (!r.hora || r.hora === "-") return;
        const hh = parseInt(r.hora.substring(0, 2), 10);
        if (isNaN(hh)) return;
        puntos.push({ x: hh, y: idx });
        idx++;
    });

    const ctx = document.getElementById("chartScatterHoras");
    if (!ctx) return;

    if (CHARTS.scatterHoras) CHARTS.scatterHoras.destroy();

    CHARTS.scatterHoras = new Chart(ctx, {
        type: "scatter",
        data: {
            datasets: [{
                label: "Hora vs índice",
                data: puntos
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: "linear",
                    position: "bottom",
                    title: { display: true, text: "Hora (0–23)" },
                    ticks: { stepSize: 1 }
                },
                y: {
                    title: { display: true, text: "Índice (orden de carga)" }
                }
            }
        }
    });
}

/* ------------------ MIXTO BARRAS + LÍNEA HORAS ------ */

function buildChartHorasMix() {
    const horasMap = {};
    for (let h = 0; h < 24; h++) {
        const hh = String(h).padStart(2, "0");
        horasMap[hh] = 0;
    }

    INICIOS_HOY.forEach(r => {
        if (!r.hora || r.hora === "-") return;
        const hh = r.hora.substring(0, 2);
        if (horasMap.hasOwnProperty(hh)) {
            horasMap[hh]++;
        }
    });

    const labels = Object.keys(horasMap);
    const data = Object.values(horasMap);

    const ctx = document.getElementById("chartHorasMix");
    if (!ctx) return;

    if (CHARTS.horasMix) CHARTS.horasMix.destroy();

    CHARTS.horasMix = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [
                {
                    type: "bar",
                    label: "Inicios (Bar)",
                    data
                },
                {
                    type: "line",
                    label: "Inicios (Line)",
                    data,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    ticks: { autoSkip: true, maxTicksLimit: 12 }
                },
                y: {
                    beginAtZero: true,
                    ticks: { precision: 0 }
                }
            }
        }
    });
}

/* ------------------ TOP 5 ESCOLTAS ------------------------- */

function buildChartEscoltas() {
    const dataMap = {};
    INICIOS_HOY.forEach(r => {
        if (!r.empleado) return;
        dataMap[r.empleado] = (dataMap[r.empleado] || 0) + 1;
    });

    const entries = Object.entries(dataMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const labels = entries.map(e => e[0]);
    const data = entries.map(e => e[1]);

    const ctx = document.getElementById("chartEscoltas");
    if (!ctx) return;

    if (CHARTS.escoltas) CHARTS.escoltas.destroy();

    CHARTS.escoltas = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Inicios",
                data
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: true }
            },
            scales: {
                x: { ticks: { autoSkip: false } },
                y: {
                    beginAtZero: true,
                    ticks: { precision: 0 }
                }
            }
        }
    });
}

/* =========================
   MATRIZ ORIGEN–DESTINO
========================= */

function buildMatrixOrigenDestino() {
    const container = document.getElementById("matrixOrigenDestino");
    if (!container) return;

    container.innerHTML = "";

    const matrix = {};
    const origenesSet = new Set();
    const destinosSet = new Set();

    INICIOS_HOY.forEach(r => {
        const o = r.ciudadOrigen || "SIN ORIGEN";
        const d = r.ciudadDestino || "SIN DESTINO";
        origenesSet.add(o);
        destinosSet.add(d);
        matrix[o] = matrix[o] || {};
        matrix[o][d] = (matrix[o][d] || 0) + 1;
    });

    const origenes = Array.from(origenesSet);
    const destinos = Array.from(destinosSet);

    if (!origenes.length || !destinos.length) {
        container.textContent = "No hay datos suficientes para construir la matriz.";
        return;
    }

    let maxVal = 0;
    origenes.forEach(o => {
        destinos.forEach(d => {
            const v = (matrix[o] && matrix[o][d]) || 0;
            if (v > maxVal) maxVal = v;
        });
    });

    const table = document.createElement("table");

    const thead = document.createElement("thead");
    const trHead = document.createElement("tr");

    const thCorner = document.createElement("th");
    thCorner.textContent = "Origen \\ Destino";
    trHead.appendChild(thCorner);

    destinos.forEach(d => {
        const th = document.createElement("th");
        th.textContent = d;
        trHead.appendChild(th);
    });

    thead.appendChild(trHead);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    origenes.forEach(o => {
        const tr = document.createElement("tr");

        const thO = document.createElement("th");
        thO.textContent = o;
        tr.appendChild(thO);

        destinos.forEach(d => {
            const td = document.createElement("td");
            const v = (matrix[o] && matrix[o][d]) || 0;
            td.textContent = v || "";
            td.classList.add("matrix-cell");

            if (maxVal > 0 && v > 0) {
                const intensity = v / maxVal;
                const base = 220;
                const colorVal = Math.round(base - intensity * 120);
                td.style.backgroundColor = `rgb(${colorVal}, ${240}, ${colorVal})`;
            }

            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.appendChild(table);
}

/* ============================================================
   NUEVO – MEZCLA INICIO / LLEGADA / EMPALME / FIN (META)
============================================================ */

/* Embudo simple (conteos por etapa) */
function buildChartFunnelEtapas() {
    const nInicio   = META_INICIOS.length;
    const nLlegada  = META_LLEGADAS.length;
    const nEmpalme  = META_EMPALMES.length;
    const nFin      = META_FINES.length;

    const labels = ["Inicio", "Llegada", "Empalme", "Fin"];
    const data   = [nInicio, nLlegada, nEmpalme, nFin];

    const ctx = document.getElementById("chartFunnelEtapas");
    if (!ctx) return;

    if (CHARTS.funnelEtapas) CHARTS.funnelEtapas.destroy();

    CHARTS.funnelEtapas = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Cantidad de reportes",
                data
            }]
        },
        options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: { precision: 0 }
                }
            }
        }
    });
}

/* Comparativo por cliente (Inicio, Llegada, Empalme, Fin) */
function buildChartClientesEtapas() {
    const map = {};

    function acum(metaArray, keyName) {
        metaArray.forEach(r => {
            const cli = r.account?.name || "SIN CLIENTE";
            if (!map[cli]) {
                map[cli] = { inicio: 0, llegada: 0, empalme: 0, fin: 0 };
            }
            map[cli][keyName]++;
        });
    }

    acum(META_INICIOS,  "inicio");
    acum(META_LLEGADAS, "llegada");
    acum(META_EMPALMES, "empalme");
    acum(META_FINES,    "fin");

    let entries = Object.entries(map).map(([cliente, vals]) => {
        const total = vals.inicio + vals.llegada + vals.empalme + vals.fin;
        return { cliente, ...vals, total };
    });

    entries.sort((a, b) => b.total - a.total);

    // Para que no se vuelva una romería, dejamos top 10
    entries = entries.slice(0, 10);

    const labels    = entries.map(e => e.cliente);
    const dataIni   = entries.map(e => e.inicio);
    const dataLle   = entries.map(e => e.llegada);
    const dataEmp   = entries.map(e => e.empalme);
    const dataFin   = entries.map(e => e.fin);

    const ctx = document.getElementById("chartClientesEtapas");
    if (!ctx) return;

    if (CHARTS.clientesEtapas) CHARTS.clientesEtapas.destroy();

    CHARTS.clientesEtapas = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [
                { label: "Inicio",    data: dataIni },
                { label: "Llegada",   data: dataLle },
                { label: "Empalme",   data: dataEmp },
                { label: "Fin",       data: dataFin }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    ticks: { autoSkip: false, maxRotation: 45, minRotation: 0 }
                },
                y: {
                    beginAtZero: true,
                    ticks: { precision: 0 }
                }
            }
        }
    });
}

/* Distribución horaria por etapa (multi-line) */
function buildChartHorasMulti() {
    function contarPorHora(metaArray) {
        const arr = Array(24).fill(0);
        metaArray.forEach(r => {
            const d = new Date(r.reportDateTime);
            if (isNaN(d)) return;
            const h = d.getHours();
            if (h >= 0 && h < 24) arr[h]++;
        });
        return arr;
    }

    const arrIni = contarPorHora(META_INICIOS);
    const arrLle = contarPorHora(META_LLEGADAS);
    const arrEmp = contarPorHora(META_EMPALMES);
    const arrFin = contarPorHora(META_FINES);

    const labels = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));

    const ctx = document.getElementById("chartHorasMulti");
    if (!ctx) return;

    if (CHARTS.horasMulti) CHARTS.horasMulti.destroy();

    CHARTS.horasMulti = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [
                { label: "Inicio",  data: arrIni, tension: 0.25 },
                { label: "Llegada", data: arrLle, tension: 0.25 },
                { label: "Empalme", data: arrEmp, tension: 0.25 },
                { label: "Fin",     data: arrFin, tension: 0.25 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    ticks: { autoSkip: true, maxTicksLimit: 12 }
                },
                y: {
                    beginAtZero: true,
                    ticks: { precision: 0 }
                }
            }
        }
    });
}

/* ============================================================
   FLUJO PRINCIPAL
============================================================ */

async function cargarDashboardInicio() {
    try {
        mostrarLoaderInicio(true);

        // 1) Traemos todos los reportes del día (meta)
        REPORTES_META_HOY = await getAllReportsMetaHoy();

        // 2) Separar por tipo de template
        const idInicio   = CONFIG.templates.inicio;
        const idLlegada  = CONFIG.templates.llegada;
        const idEmpalme  = CONFIG.templates.empalme;
        const idFin      = CONFIG.templates.fin;

        META_INICIOS  = REPORTES_META_HOY.filter(
            r => r.reportTemplate && r.reportTemplate.id === idInicio
        );
        META_LLEGADAS = REPORTES_META_HOY.filter(
            r => r.reportTemplate && r.reportTemplate.id === idLlegada
        );
        META_EMPALMES = REPORTES_META_HOY.filter(
            r => r.reportTemplate && r.reportTemplate.id === idEmpalme
        );
        META_FINES    = REPORTES_META_HOY.filter(
            r => r.reportTemplate && r.reportTemplate.id === idFin
        );

        // 3) Detalle solo para INICIOS (campos)
        const iniciosDetallados = await getIniciosConCampos(META_INICIOS);
        INICIOS_HOY = iniciosDetallados.map(x =>
            extraerDatosInicio(x.meta, x.reportFields)
        );

        console.log("INICIOS_HOY (dashboard):", INICIOS_HOY);
        console.log("META_INICIOS / LLEGADAS / EMPALMES / FINES:", {
            inicios: META_INICIOS.length,
            llegadas: META_LLEGADAS.length,
            empalmes: META_EMPALMES.length,
            fines: META_FINES.length
        });

        // 4) KPIs de inicio
        actualizarKPIsInicio(INICIOS_HOY);

        // 5) Gráficos de INICIO (galería)
        buildChartClientes();
        buildChartCiudades();
        buildChartHoras();
        buildChartTipos();
        buildChartTiposPie();
        buildChartClientesPolar();
        buildChartCiudadesRadar();
        buildChartScatterHoras();
        buildChartHorasMix();
        buildChartEscoltas();
        buildMatrixOrigenDestino();

        // 6) Gráficos de mezcla entre etapas
        buildChartFunnelEtapas();
        buildChartClientesEtapas();
        buildChartHorasMulti();

    } catch (e) {
        console.error("Error en cargarDashboardInicio:", e);
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

    cargarDashboardInicio();
});
