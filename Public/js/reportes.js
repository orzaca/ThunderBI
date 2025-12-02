/* ============================================================
   ZIRIUS MOBILE – LISTADO GENERAL DE REPORTES
   FECHA – CLIENTE – EMPLEADO – INICIO – LLEGADA – EMPALME – DESEMPALME – FIN
============================================================ */

/* CACHE GLOBAL */
let REPORTES_CACHE = [];
let REPORTES_IDS = new Set();
let TOKEN_GLOBAL = null;
let FECHA_FILTRO = null;  // "YYYY-MM-DD"

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
   FECHAS
============================================================ */
function fechaHoyLocalYYYYMMDD() {
    const h = new Date();
    const yyyy = h.getFullYear();
    const mm = String(h.getMonth()+1).padStart(2,"0");
    const dd = String(h.getDate()).padStart(2,"0");
    return `${yyyy}-${mm}-${dd}`;
}

function inicioDiaTracktik(fechaStr) {
    // fechaStr viene "YYYY-MM-DD"
    if (!fechaStr) fechaStr = fechaHoyLocalYYYYMMDD();
    return `${fechaStr}T00:00:00-05:00`;
}

/* ============================================================
   CLASIFICAR REPORTE
============================================================ */
function clasificar(r) {
    const id = r.reportTemplate.id;

    if (id === CONFIG.templates.inicio)      return "inicio";
    if (id === CONFIG.templates.llegada)    return "llegada";
    if (id === CONFIG.templates.empalme)    return "empalme";
    if (id === CONFIG.templates.desempalme) return "desempalme";
    if (id === CONFIG.templates.fin)        return "fin";

    return null;
}

/* ============================================================
   TRAER UNA PÁGINA DE REPORTES
   Usamos reportDateTime:after con el inicio del día elegido
============================================================ */
async function getReportsPage(token, offset, fechaStr = null) {
    const ids = Object.values(CONFIG.templates).join(",");

    const filtros = {
        limit: 100,
        offset,
        "reportTemplate.id:in": ids,
        include: "account,reportTemplate,createdBy"
    };

    const desde = inicioDiaTracktik(fechaStr);
    filtros["reportDateTime:after"] = desde;

    const url = `${CONFIG.apiUrl}reports?${new URLSearchParams(filtros).toString()}`;

    const r = await fetch(url, {
        headers: { "Authorization": `Bearer ${token}` }
    });

    if (!r.ok) {
        console.error("Error solicitando reports:", r.status);
        return [];
    }

    const json = await r.json();
    return json?.data ?? [];
}

/* ============================================================
   TRAER TODAS LAS PÁGINAS PARA LA FECHA
   (si vienen días posteriores, luego filtramos por FECHA_FILTRO)
============================================================ */
async function getAllReports(fechaStr) {
    const token = await getToken();
    if (!token) return [];

    let offset = 0;
    let total = [];

    while (true) {
        const page = await getReportsPage(token, offset, fechaStr);
        if (!page.length) break;
        total = total.concat(page);
        offset += 100;
    }

    return total;
}

/* ============================================================
   FORMATO FECHA Y HORA
============================================================ */
function formatearHora24(f) {
    if (!f) return "-";
    const d = new Date(f);
    if (isNaN(d)) return "-";
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatearFechaLocal(f) {
    if (!f) return "-";
    const d = new Date(f);
    if (isNaN(d)) return "-";
    const anio = d.getFullYear();
    const mes  = String(d.getMonth()+1).padStart(2,"0");
    const dia  = String(d.getDate()).padStart(2,"0");
    return `${anio}-${mes}-${dia}`;
}

/* ============================================================
   CARGAR SELECT DE CLIENTES (filtro simple)
============================================================ */
function cargarClientesSelect() {
    const sel = document.getElementById("cliente-select");
    if (!sel) return;

    sel.innerHTML = "";
    const optTodos = document.createElement("option");
    optTodos.value = "todos";
    optTodos.textContent = "Todos";
    sel.appendChild(optTodos);

    Object.entries(CONFIG.clientes).forEach(([nombre, id]) => {
        const opt = document.createElement("option");
        opt.value = String(id);
        opt.textContent = nombre;
        sel.appendChild(opt);
    });

    sel.addEventListener("change", () => construirTablaListado());
}

/* ============================================================
   ACTUALIZAR SUBTÍTULO CON FECHA
============================================================ */
function actualizarSubtituloFecha(fechaStr) {
    const sub = document.getElementById("subtitulo-listado");
    if (!sub) return;

    if (!fechaStr) {
        sub.textContent = `FECHA – CLIENTE – EMPLEADO – INICIO – LLEGADA – EMPALME – DESEMPALME – FIN`;
        return;
    }

    sub.textContent = `FECHA ${fechaStr} – CLIENTE – EMPLEADO – INICIO – LLEGADA – EMPALME – DESEMPALME – FIN`;
}

/* ============================================================
   CONSTRUIR TABLA LISTADO GENERAL
   (aquí sí filtramos estrictamente por FECHA_FILTRO)
============================================================ */
function construirTablaListado() {
    const tbody = document.querySelector("#tabla-listado tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const CLIENTES_VALIDOS = Object.values(CONFIG.clientes);
    const selectCliente = document.getElementById("cliente-select");
    const filtroClienteId = selectCliente && selectCliente.value !== "todos"
        ? Number(selectCliente.value)
        : null;

    const grupos = {};

    REPORTES_CACHE.forEach(r => {
        if (!r.account || !CLIENTES_VALIDOS.includes(r.account.id)) return;

        // Filtrar por cliente si aplica
        if (filtroClienteId && r.account.id !== filtroClienteId) return;

        const tipo = clasificar(r);
        if (!tipo) return;

        const empId = r.createdBy?.id;
        if (!empId) return;

        const fecha = formatearFechaLocal(r.reportDateTime);

        // 🔍 Filtrar por fecha elegida (aunque la API traiga más días)
        if (FECHA_FILTRO && fecha !== FECHA_FILTRO) return;

        const clave = `${fecha}__${r.account.id}__${empId}`;

        if (!grupos[clave]) {
            grupos[clave] = {
                fecha,
                cliente: r.account.name,
                empleado: `${r.createdBy.firstName} ${r.createdBy.lastName}`.trim(),
                inicio: null,
                llegada: null,
                empalme: null,
                desempalme: null,
                fin: null
            };
        }

        if (tipo === "inicio")      grupos[clave].inicio      = r.reportDateTime;
        if (tipo === "llegada")    grupos[clave].llegada     = r.reportDateTime;
        if (tipo === "empalme")    grupos[clave].empalme     = r.reportDateTime;
        if (tipo === "desempalme") grupos[clave].desempalme  = r.reportDateTime;
        if (tipo === "fin")        grupos[clave].fin         = r.reportDateTime;
    });

    const filas = Object.values(grupos);

    filas.sort((a, b) => {
        if (a.fecha < b.fecha) return -1;
        if (a.fecha > b.fecha) return 1;
        if (a.cliente < b.cliente) return -1;
        if (a.cliente > b.cliente) return 1;
        if (a.empleado < b.empleado) return -1;
        if (a.empleado > b.empleado) return 1;
        return 0;
    });

    if (!filas.length) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="8" style="text-align:center; padding:8px;">No hay reportes para mostrar en este momento.</td>`;
        tbody.appendChild(tr);
        return;
    }

    filas.forEach(reg => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${reg.fecha}</td>
            <td>${reg.cliente}</td>
            <td>${reg.empleado}</td>
            <td>${reg.inicio      ? formatearHora24(reg.inicio)      : "-"}</td>
            <td>${reg.llegada     ? formatearHora24(reg.llegada)     : "-"}</td>
            <td>${reg.empalme     ? formatearHora24(reg.empalme)     : "-"}</td>
            <td>${reg.desempalme  ? formatearHora24(reg.desempalme)  : "-"}</td>
            <td>${reg.fin         ? formatearHora24(reg.fin)         : "-"}</td>
        `;

        tbody.appendChild(tr);
    });
}

/* ============================================================
   EXPORTAR TABLA A EXCEL
============================================================ */
function exportarTablaExcel() {
    const tabla = document.getElementById("tabla-listado");
    if (!tabla) return;

    const tablaClon = tabla.cloneNode(true);

    const html = `
        <html>
        <head>
            <meta charset="UTF-8" />
        </head>
        <body>
            ${tablaClon.outerHTML}
        </body>
        </html>
    `;

    const blob = new Blob(['\ufeff', html], {
        type: 'application/vnd.ms-excel;charset=utf-8;'
    });

    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth()+1).padStart(2,"0");
    const dd = String(hoy.getDate()).padStart(2,"0");

    const sufijoFecha = FECHA_FILTRO ? FECHA_FILTRO.replace(/-/g,"") : `${yyyy}${mm}${dd}`;
    const nombreArchivo = `Listado_Reportes_${sufijoFecha}.xls`;

    if (window.navigator && window.navigator.msSaveOrOpenBlob) {
        window.navigator.msSaveOrOpenBlob(blob, nombreArchivo);
    } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = nombreArchivo;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

/* ============================================================
   LOADER – MOSTRAR / OCULTAR
============================================================ */
function mostrarLoader(mostrar) {
    const loader = document.getElementById("loader-reportes");
    if (!loader) return;
    loader.style.display = mostrar ? "flex" : "none";
}

/* ============================================================
   CARGAR DATOS PARA UNA FECHA
============================================================ */
async function cargarDatosParaFecha(fechaStr) {
    FECHA_FILTRO = fechaStr || fechaHoyLocalYYYYMMDD();

    actualizarSubtituloFecha(FECHA_FILTRO);

    // 🔵 Mostrar loader mientras se consulta al API y se arma la tabla
    mostrarLoader(true);
    try {
        REPORTES_CACHE = await getAllReports(FECHA_FILTRO);
        REPORTES_IDS.clear();
        REPORTES_CACHE.forEach(r => REPORTES_IDS.add(r.uuid || r.id));

        construirTablaListado();

        const helper = document.getElementById("date-helper-text");
        if (helper) {
            helper.textContent = `Mostrando reportes de ${FECHA_FILTRO}`;
        }
    } catch (err) {
        console.error("Error cargando datos:", err);
        const tbody = document.querySelector("#tabla-listado tbody");
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:8px;">Ocurrió un error al cargar los reportes.</td></tr>`;
        }
    } finally {
        // 🔵 Siempre ocultar loader al terminar
        mostrarLoader(false);
    }
}

/* ============================================================
   INICIO DE LA PÁGINA
============================================================ */
async function iniciarListado() {
    cargarClientesSelect();

    const inputFecha = document.getElementById("fecha-select");
    const btnHoy = document.getElementById("btn-hoy");
    const btnExport = document.getElementById("btn-export");

    // valor inicial = hoy
    const hoyStr = fechaHoyLocalYYYYMMDD();
    if (inputFecha) inputFecha.value = hoyStr;

    // Cargar datos iniciales (hoy)
    await cargarDatosParaFecha(hoyStr);

    // Cambio de fecha
    if (inputFecha) {
        inputFecha.addEventListener("change", async (e) => {
            const val = e.target.value || fechaHoyLocalYYYYMMDD();
            await cargarDatosParaFecha(val);
        });
    }

    // Botón Hoy (reset a hoy)
    if (btnHoy && inputFecha) {
        btnHoy.addEventListener("click", async () => {
            const hoy = fechaHoyLocalYYYYMMDD();
            inputFecha.value = hoy;
            await cargarDatosParaFecha(hoy);
        });
    }

    // botón de exportar
    if (btnExport) {
        btnExport.addEventListener("click", exportarTablaExcel);
    }
}

iniciarListado();
