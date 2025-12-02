/* ============================================================
   ZIRIUS MOBILE – DASHBOARD HOY
   Versión limpia – Sin Preoperacional
   Porcentajes basados siempre en INICIO
============================================================ */

/* CACHE GLOBAL */
let REPORTES_CACHE = [];
let REPORTES_IDS = new Set();
let TOKEN_GLOBAL = null;
let ULTIMA_FECHA_REPORTE = null;
let CLIENTE_SELECCIONADO = null;
let LIVE_EN_EJECUCION = false;

/* ============================================================
   TOKEN – REUTILIZABLE
============================================================ */
async function getToken() {
    if (TOKEN_GLOBAL) return TOKEN_GLOBAL;

    const r = await fetch(CONFIG.apiUrl + "auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            username: CONFIG.username,
            password: CONFIG.password
        })
    });

    if (!r.ok) {
        console.error("Error obteniendo token");
        return null;
    }

    const json = await r.json();
    TOKEN_GLOBAL = json?.auth?.token || null;
    return TOKEN_GLOBAL;
}

/* ============================================================
   FECHA HOY (00:00 –05:00)
============================================================ */
function fechaHoyTracktik() {
    const h = new Date();
    return `${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,"0")}-${String(h.getDate()).padStart(2,"0")}T00:00:00-05:00`;
}

/* ============================================================
   CLASIFICAR REPORTE (Solo 5 tipos)
============================================================ */
/* ============================================================
   CLASIFICAR REPORTE (Solo 6 tipos)
============================================================ */
function clasificar(r) {
    const id = r.reportTemplate.id;

    if (id === CONFIG.templates.preoperacional) return "preoperacional";
    if (id === CONFIG.templates.inicio)         return "inicio";
    if (id === CONFIG.templates.llegada)       return "llegada";
    if (id === CONFIG.templates.empalme)       return "empalme";
    if (id === CONFIG.templates.desempalme)    return "desempalme";
    if (id === CONFIG.templates.fin)           return "fin";

    return null;
}


/* ============================================================
   TRAER UNA PÁGINA DE REPORTES
============================================================ */
async function getReportsPage(token, offset, desde = null) {
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

    if (!r.ok) return [];

    const json = await r.json();
    return json?.data ?? [];
}

/* ============================================================
   TRAER TODAS LAS PÁGINAS DEL DÍA
============================================================ */
async function getAllReports() {
    const token = await getToken();
    if (!token) return [];

    let offset = 0;
    let total = [];

    while (true) {
        const page = await getReportsPage(token, offset);
        if (!page.length) break;
        total = total.concat(page);
        offset += 100;
    }

    return total;
}

/* ============================================================
   ACTUALIZAR FECHA MÁXIMA DEL CACHE
============================================================ */
function actualizarUltimaFechaDesdeCache() {
    ULTIMA_FECHA_REPORTE = REPORTES_CACHE.reduce((max, r) =>
        (!max || r.reportDateTime > max ? r.reportDateTime : max), null
    );

    if (!ULTIMA_FECHA_REPORTE) {
        ULTIMA_FECHA_REPORTE = fechaHoyTracktik();
    }
}

/* ============================================================
   FORMATEO HORA MILITAR
============================================================ */
function formatearHora24(f) {
    if (!f) return "-";
    const d = new Date(f);
    if (isNaN(d)) return "-";
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/* ============================================================
   DURACIÓN DESDE UNA FECHA
============================================================ */
function calcularDiferenciaMinutos(desdeISO) {
    const ahora = new Date();
    const d = new Date(desdeISO);
    if (isNaN(d)) return 0;
    const diffMs = ahora - d;
    if (diffMs <= 0) return 0;
    return Math.floor(diffMs / 60000);
}

function formatearDuracionDesde(fechaISO) {
    const d = new Date(fechaISO);
    if (isNaN(d)) return "-";
    const ms = Math.max(0, new Date() - d);
    const totalSeg = Math.floor(ms / 1000);
    const h = Math.floor(totalSeg / 3600);
    const m = Math.floor((totalSeg % 3600) / 60);
    const s = totalSeg % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

/* ============================================================
   SELECTOR CLIENTES (HEADER)
============================================================ */
function cargarClientesSelect() {
    const sel = document.getElementById("cliente-select");
    sel.innerHTML = "";

    Object.entries(CONFIG.clientes).forEach(([nombre, id]) => {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = nombre;
        sel.appendChild(opt);
    });

    sel.addEventListener("change", e => filtrarCliente(Number(e.target.value)));
}

/* ============================================================
   KPI GLOBAL DEL DÍA (TOTALES)
============================================================ */
/* ============================================================
   KPI GLOBAL DEL DÍA (TOTALES)
============================================================ */
function actualizarHeaderDesdeCache() {
    const CLIENTES = Object.values(CONFIG.clientes);

    const t = {
        preoperacional: 0,
        inicio: 0,
        llegada: 0,
        empalme: 0,
        desempalme: 0,
        fin: 0
    };

    REPORTES_CACHE.forEach(r => {
        if (!r.account || !CLIENTES.includes(r.account.id)) return;
        const tipo = clasificar(r);
        if (tipo && t.hasOwnProperty(tipo)) {
            t[tipo]++;
        }
    });

    // Totales globales
    document.getElementById("total-preoperacional").innerText = t.preoperacional;
    document.getElementById("total-inicio").innerText         = t.inicio;
    document.getElementById("total-llegada").innerText        = t.llegada;
    document.getElementById("total-empalme").innerText        = t.empalme;
    document.getElementById("total-desempalme").innerText     = t.desempalme;
    document.getElementById("total-fin").innerText            = t.fin;

    // 🔥 REFRESCAR GRÁFICAS DE BARRA (empalme, desempalme, fin)
    refrescarBarrasGlobalDesdeDOM();
}


/* ============================================================
   KPI DEL CLIENTE (MINICARDS)
============================================================ */
function actualizarMiniCards(clienteId, reportes) {
    const t = {
        preoperacional: 0,
        inicio: 0,
        llegada: 0,
        empalme: 0,
        desempalme: 0,
        fin: 0
    };

    reportes.forEach(r => {
        if (r.account?.id !== clienteId) return;
        const tipo = clasificar(r);
        if (tipo && t.hasOwnProperty(tipo)) {
            t[tipo]++;
        }
    });

    document.getElementById("c-preoperacional").innerText = t.preoperacional;
    document.getElementById("c-inicio").innerText         = t.inicio;
    document.getElementById("c-llegada").innerText        = t.llegada;
    document.getElementById("c-empalme").innerText        = t.empalme;
    document.getElementById("c-desempalme").innerText     = t.desempalme;
    document.getElementById("c-fin").innerText            = t.fin;

    // 🔥 REFRESCAR GRÁFICOS CIRCULARES (empalme, desempalme, fin)
    refrescarKPICircularesDesdeDOM();
}


/* ============================================================
   OBTENER NOMBRE DE CLIENTE POR ID
============================================================ */
function obtenerNombreClientePorId(id) {
    const entrada = Object.entries(CONFIG.clientes).find(([nombre, cid]) => cid === id);
    return entrada ? entrada[0] : "";
}

/* ============================================================
   FILTRAR CLIENTE
============================================================ */
function filtrarCliente(id) {
    CLIENTE_SELECCIONADO = id;

    actualizarMiniCards(id, REPORTES_CACHE);
    mostrarEmpleadosCliente(id, REPORTES_CACHE);

    const span = document.getElementById("cliente-actual");
    if (span) {
        const nombre = obtenerNombreClientePorId(id);
        span.textContent = nombre ? ` - "${nombre}"` : "";
    }
}

/* ============================================================
   TABLA DE EMPLEADOS
============================================================ */
/* ============================================================
   TABLA DE EMPLEADOS
============================================================ */
function mostrarEmpleadosCliente(id, reportes) {
    const tbody = document.querySelector("#tabla-empleados tbody");
    tbody.innerHTML = "";

    const map = {};

    reportes.forEach(r => {
        if (r.account?.id !== id) return;
        const tipo = clasificar(r);
        if (!tipo) return;

        const empId = r.createdBy?.id;
        if (!empId) return;

        if (!map[empId]) {
            map[empId] = {
                nombre: `${r.createdBy.firstName} ${r.createdBy.lastName}`.trim(),
                preoperacional: false,
                inicio: "-",
                llegada: "-",
                empalme: "-",
                desempalme: "-",
                fin: "-"
            };
        }

        if (tipo === "preoperacional") {
            // 🔵 Solo marcamos que SÍ hizo preoperacional
            map[empId].preoperacional = true;
        } else {
            // Para los demás, guardamos la hora formateada
            map[empId][tipo] = formatearHora24(r.reportDateTime);
        }
    });

    Object.values(map).forEach(emp => {
        const tr = document.createElement("tr");

        // Si tiene preoperacional, mostramos un icono, si no dejamos vacío
        const preoperHtml = emp.preoperacional
            ? `<i class="fas fa-check-circle icon-preoper"></i>`
            : ``;

        tr.innerHTML = `
            <td>${emp.nombre}</td>
            <td>${preoperHtml}</td>
            <td>${emp.inicio}</td>
            <td>${emp.llegada}</td>
            <td>${emp.empalme}</td>
            <td>${emp.desempalme}</td>
            <td>${emp.fin}</td>
        `;
        tbody.appendChild(tr);
    });
}


/* ============================================================
   ARMAS POR DEVOLVER (DESDE DESEMPALME HASTA FIN)
   - Tiempo transcurrido en vivo
   - Estado se recalcula en cada llamada
   - Si está "Fuera de tiempo" => fila parpadea en rojo
============================================================ */
function actualizarArmasPendientes() {
    const tbody = document.querySelector("#tabla-armas tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const CLIENTES_VALIDOS = Object.values(CONFIG.clientes);

    // Agrupar por empleado + cliente
    const porClave = {};

    REPORTES_CACHE.forEach(r => {
        if (!r.account || !CLIENTES_VALIDOS.includes(r.account.id)) return;

        const tipo = clasificar(r);
        if (tipo !== "desempalme" && tipo !== "fin") return;

        const empId = r.createdBy?.id;
        if (!empId) return;

        const clave = `${empId}__${r.account.id}`;

        if (!porClave[clave]) {
            porClave[clave] = {
                empleado: `${r.createdBy.firstName} ${r.createdBy.lastName}`.trim(),
                cliente: r.account.name,
                ultimoDesempalme: null,
                ultimoFin: null
            };
        }

        if (tipo === "desempalme") {
            if (!porClave[clave].ultimoDesempalme || r.reportDateTime > porClave[clave].ultimoDesempalme) {
                porClave[clave].ultimoDesempalme = r.reportDateTime;
            }
        } else if (tipo === "fin") {
            if (!porClave[clave].ultimoFin || r.reportDateTime > porClave[clave].ultimoFin) {
                porClave[clave].ultimoFin = r.reportDateTime;
            }
        }
    });

    const pendientes = [];

    Object.values(porClave).forEach(reg => {
        if (!reg.ultimoDesempalme) return;

        // Si hay FIN igual o posterior al último DESEMPALME => arma entregada (no se muestra)
        if (reg.ultimoFin && reg.ultimoFin >= reg.ultimoDesempalme) return;

        const minutos = calcularDiferenciaMinutos(reg.ultimoDesempalme);

        let estado = "verde";
        if (minutos >= 60) estado = "rojo";
        else if (minutos >= 30) estado = "amarillo";

        pendientes.push({
            empleado: reg.empleado,
            cliente: reg.cliente,
            desempalme: reg.ultimoDesempalme,
            minutos,
            estado
        });
    });

    // Orden: primero rojos, luego amarillos, luego verdes, y dentro por más minutos
    const ordenEstado = { rojo:0, amarillo:1, verde:2 };
    pendientes.sort((a, b) => {
        const e = ordenEstado[a.estado] - ordenEstado[b.estado];
        if (e !== 0) return e;
        return b.minutos - a.minutos;
    });

    if (!pendientes.length) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="5" style="text-align:center; padding:8px;">No hay armas pendientes por devolver en este momento.</td>`;
        tbody.appendChild(tr);
        return;
    }

    pendientes.forEach(item => {
        const tr = document.createElement("tr");

        let claseEstado;
        let textoEstado;
        if (item.estado === "verde") {
            claseEstado = "estado-verde";
            textoEstado = "Dentro de tiempo";
        } else if (item.estado === "amarillo") {
            claseEstado = "estado-amarillo";
            textoEstado = "Próximo a vencer";
        } else {
            claseEstado = "estado-rojo";
            textoEstado = "Fuera de tiempo";
            // 🔴 Fila parpadeando mientras esté fuera de tiempo
            tr.classList.add("arma-roja-parpadeo");
        }

        tr.innerHTML = `
            <td>${item.empleado}</td>
            <td>${item.cliente}</td>
            <td>${formatearHora24(item.desempalme)}</td>
            <td>${formatearDuracionDesde(item.desempalme)}</td>
            <td><span class="estado-arma ${claseEstado}">${textoEstado}</span></td>
        `;

        tbody.appendChild(tr);
    });
}

/* ============================================================
   NOTIFICACIONES EN VIVO
============================================================ */
const TIPOS_TOAST = {
    preoperacional:{color:"#274C77",label:"PREOPERACIONAL",icon:"🛠️"},
    inicio:{color:"#147D7D",label:"INICIO SERVICIO",icon:"🚀"},
    llegada:{color:"#28a745",label:"LLEGADA",icon:"📍"},
    empalme:{color:"#f7c325",label:"EMPALME",icon:"🔗"},
    desempalme:{color:"#7e57c2",label:"DESEMPALME",icon:"🔄"},
    fin:{color:"#555",label:"FIN SERVICIO",icon:"🏁"}
};


function showToast(r, tipo) {
    const cont = document.getElementById("toast-container");
    cont.innerHTML = "";

    const def = TIPOS_TOAST[tipo];
    if (!def) return;

    const empleado = `${r.createdBy.firstName} ${r.createdBy.lastName}`.trim();
    const hora = formatearHora24(r.reportDateTime);

    const div = document.createElement("div");
    div.classList.add("toast");
    div.style.borderLeftColor = def.color;

    div.innerHTML = `
        <div class="toast-header">
            <span class="toast-icon">${def.icon}</span>
            <span class="toast-title">${def.label}</span>
        </div>
        <div class="toast-body">
            <strong>${empleado}</strong> — ${hora}<br>
            Cliente: ${r.account.name}
        </div>
    `;

    cont.appendChild(div);

    setTimeout(() => {
        div.classList.add("toast-hide");
        setTimeout(() => div.remove(), 300);
    }, 5000);
}

/* ============================================================
   RESALTAR KPI GLOBAL CUANDO LLEGA UN REPORTE NUEVO
============================================================ */
function resaltarKpiGlobal(tipo) {
    if (!tipo) return;
    const card = document.querySelector(`.kpi-global-${tipo}`);
    if (!card) return;

    card.classList.add("kpi-alert");
    setTimeout(() => {
        card.classList.remove("kpi-alert");
    }, 10000);
}

/* ============================================================
   MODAL DETALLE KPI GLOBAL
============================================================ */
function abrirModalKpi(tipo) {
    const modal  = document.getElementById("modal-kpi");
    const titulo = document.getElementById("modal-kpi-title");
    const tbody  = document.querySelector("#modal-kpi-table tbody");
    if (!modal || !titulo || !tbody) return;

    const def = TIPOS_TOAST[tipo];
    titulo.textContent = def ? `Detalle – ${def.label}` : "Detalle";

    tbody.innerHTML = "";

    const CLIENTES_VALIDOS = Object.values(CONFIG.clientes);

    const lista = REPORTES_CACHE
        .filter(r => {
            if (!r.account || !CLIENTES_VALIDOS.includes(r.account.id)) return false;
            return clasificar(r) === tipo;
        })
        .sort((a, b) => a.reportDateTime.localeCompare(b.reportDateTime));

    lista.forEach(r => {
        const tr = document.createElement("tr");
        const empleado = `${r.createdBy.firstName} ${r.createdBy.lastName}`.trim();
        const cliente  = r.account?.name || "-";
        const hora     = formatearHora24(r.reportDateTime);

        tr.innerHTML = `
            <td>${empleado}</td>
            <td>${cliente}</td>
            <td>${hora}</td>
        `;
        tbody.appendChild(tr);
    });

    modal.classList.add("show");
}

function configurarClicksKpiGlobal() {
    const mapa = [
        { selector: ".kpi-global-inicio",      tipo: "inicio" },
        { selector: ".kpi-global-llegada",     tipo: "llegada" },
        { selector: ".kpi-global-empalme",     tipo: "empalme" },
        { selector: ".kpi-global-desempalme",  tipo: "desempalme" },
        { selector: ".kpi-global-fin",         tipo: "fin" }
    ];

    mapa.forEach(m => {
        const el = document.querySelector(m.selector);
        if (el) {
            el.style.cursor = "pointer";
            el.addEventListener("click", () => abrirModalKpi(m.tipo));
        }
    });

    const modal   = document.getElementById("modal-kpi");
    const btnClose = document.getElementById("modal-kpi-close");

    if (btnClose) {
        btnClose.addEventListener("click", () => {
            modal.classList.remove("show");
        });
    }

    if (modal) {
        modal.addEventListener("click", e => {
            if (e.target === modal) modal.classList.remove("show");
        });
    }
}

/* ============================================================
   TIEMPO REAL
============================================================ */
async function traerReportesNuevos() {
    if (LIVE_EN_EJECUCION) return;
    LIVE_EN_EJECUCION = true;

    try {
        const token = await getToken();
        if (!token) return;

        let offset = 0;
        let nuevos = [];
        const CLIENTE_IDS = Object.values(CONFIG.clientes);

        while (true) {
            const page = await getReportsPage(token, offset, ULTIMA_FECHA_REPORTE);
            if (!page.length) break;

            page.forEach(r => {
                const uuid = r.uuid || r.id;
                if (REPORTES_IDS.has(uuid)) return;

                REPORTES_IDS.add(uuid);
                REPORTES_CACHE.push(r);

                if (r.reportDateTime > ULTIMA_FECHA_REPORTE)
                    ULTIMA_FECHA_REPORTE = r.reportDateTime;

                if (CLIENTE_IDS.includes(r.account.id))
                    nuevos.push(r);
            });

            if (page.length < 100) break;
            offset += 100;
        }

        if (nuevos.length) {
            actualizarHeaderDesdeCache();

            if (CLIENTE_SELECCIONADO) {
                actualizarMiniCards(CLIENTE_SELECCIONADO, REPORTES_CACHE);
                mostrarEmpleadosCliente(CLIENTE_SELECCIONADO, REPORTES_CACHE);
            }

            // recalcular armas pendientes cuando llegan nuevos reportes
            actualizarArmasPendientes();

            nuevos.sort((a,b)=>a.reportDateTime.localeCompare(b.reportDateTime));

            nuevos.forEach(r => {
                const tipo = clasificar(r);
                showToast(r, tipo);
                resaltarKpiGlobal(tipo);
            });
        }

    } catch (e) {
        console.error("Error LIVE:", e);
    }

    LIVE_EN_EJECUCION = false;
}

/* ============================================================
   LOADER DASHBOARD – MOSTRAR / OCULTAR
============================================================ */
function mostrarLoaderDashboard(mostrar) {
    const loader = document.getElementById("loader-dashboard");
    if (!loader) return;
    loader.style.display = mostrar ? "flex" : "none";
}

/* ============================================================
   INICIO DEL DASHBOARD
============================================================ */
async function iniciarDashboard() {
    // 🔵 Mostrar loader mientras se hace la primera carga
    mostrarLoaderDashboard(true);

    try {
        // Cargar clientes en el select
        cargarClientesSelect();

        // Traer todos los reportes del día
        REPORTES_CACHE = await getAllReports();
        REPORTES_CACHE.forEach(r => REPORTES_IDS.add(r.uuid || r.id));

        // Actualizar info global
        actualizarHeaderDesdeCache();
        actualizarUltimaFechaDesdeCache();

        // Seleccionar primer cliente y mostrar detalle
        const primerCliente = Object.values(CONFIG.clientes)[0];
        if (primerCliente) {
            filtrarCliente(primerCliente);
        }

        // Configurar clics en las minicards globales (modal)
        configurarClicksKpiGlobal();

        // Calcular armas pendientes al inicio
        actualizarArmasPendientes();

        // ⏱️ Actualizar armas pendientes en vivo (conteo y estado)
        setInterval(actualizarArmasPendientes, 1000);

        // Traer nuevos reportes cada 9 segundos
        setInterval(traerReportesNuevos, 9000);

    } catch (err) {
        console.error("Error iniciando dashboard:", err);
        // Si quieres, aquí puedes pintar un mensaje en algún panel
    } finally {
        // 🔵 Siempre ocultar loader al terminar
        mostrarLoaderDashboard(false);
    }
}

iniciarDashboard();
