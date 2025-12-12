/* Carnicos.js - VERSIÓN FINAL*/

/* --- 1. UTILIDADES DE FECHA --- */
function hoyYYYYMMDD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sumarDias(fechaStr, dias) {
  const [y, m, d] = fechaStr.split("-").map(Number);
  const base = new Date(y, m - 1, d);
  base.setDate(base.getDate() + dias);
  const yy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function ayerYYYYMMDD() {
  return sumarDias(hoyYYYYMMDD(), -1);
}

// ** FUNCIONES PARA EL GRÁFICO DE LÍNEA (Rango fijo 7 días) **
function getSevenDaysRange() {
  const hasta = hoyYYYYMMDD();
  // 6 días antes de hoy = un total de 7 días (la semana)
  const desde = sumarDias(hoyYYYYMMDD(), -6);

  return {
    desde: desde,
    hasta: hasta
  };
}
// ---------------------------------------------


/* --- 2. ELEMENTOS UI --- */
const elClienteTitle = document.getElementById("cliente-title");
const elSubtitulo = document.getElementById("subtitulo-dia-cliente");
const inputDesde = document.getElementById("fecha-desde");
const inputHasta = document.getElementById("fecha-hasta");
const btnAplicar = document.getElementById("btn-aplicar-fecha");
const btnRefrescar = document.querySelectorAll('.btn-fecha-primario i.fa-rotate-right').length > 0
  ? document.querySelector('.btn-fecha-primario i.fa-rotate-right').closest('button')
  : null;
const btnRapidos = document.querySelectorAll(".btn-fecha-rapido");
const tbodyEmpleados = document.getElementById("tbody-empleados");
const kpiTotal = document.getElementById("kpi-total");
const kpiEmpleados = document.getElementById("kpi-empleados");
const kpiConFoto = document.getElementById("kpi-con-foto");
const kpiSinFoto = document.getElementById("kpi-sin-foto");
const loader = document.getElementById("loader-global-cliente");
const sidebarList = document.getElementById("sidebar-list");
const pillsContainer = document.getElementById("pills-container");
const btnAllTemplates = document.getElementById("btn-all-templates");
const btnClearTemplates = document.getElementById("btn-clear-templates");
const modal = document.getElementById("modal-detalle");
const modalClose = document.getElementById("modal-close");

const TEMPLATE_CATEGORIES = {};


/* --- 3. DICCIONARIO GLOBAL --- */
window.__FIELD_MAP__ = {};
window.__IMG_CACHE__ = {};
window.__LINE_CHART_CACHE__ = [];
window.__BAR_CHART_CACHE__ = [];
window.__ACTIVE_CHART_DAY__ = null;
window.__DAILY_DATE_MAP__ = {};
let TOKEN_LOCAL = null;

/* --- 4. TOKEN Y CONCURRENCIA --- */
async function getTokenLocal() {
  if (TOKEN_LOCAL && window.__MEDIA_TOKEN__) return TOKEN_LOCAL;
  if (!CONFIG_CLIENTE || !CONFIG_CLIENTE.username) return null;
  try {
    const r = await fetch(CONFIG_CLIENTE.apiUrl + "auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: CONFIG_CLIENTE.username, password: CONFIG_CLIENTE.password })
    });
    if (!r.ok) return null;
    const json = await r.json();
    TOKEN_LOCAL = json?.auth?.token || null;
    window.__MEDIA_MEDIA__ = json?.auth?.mediaToken || null;
    return TOKEN_LOCAL;
  } catch (e) {
    return null;
  }
}

async function mapWithConcurrency(items, workerFn, concurrency = 6) {
  const results = [];
  let idx = 0;
  const runners = new Array(concurrency).fill(0).map(async () => {
    while (idx < items.length) {
      const i = idx++;
      try {
        results[i] = await workerFn(items[i], i);
      } catch (e) {
        results[i] = null;
      }
    }
  });
  await Promise.all(runners);
  return results;
}

/* --- 5. API CALLS --- */
function toTracktikDesde(fechaYYYYMMDD) {
  return `${fechaYYYYMMDD}T00:00:00-05:00`;
}
function toTracktikHasta(fechaYYYYMMDD) {
  return `${fechaYYYYMMDD}T23:59:59-05:00`;
}

async function fetchReportsMetaByClient(token, clientId, desdeYYYY, hastaYYYY) {
  const limit = 100;
  let offset = 0;
  const all = [];
  const desde = toTracktikDesde(desdeYYYY);
  const hasta = toTracktikHasta(hastaYYYY);
  while (true) {
    const filtros = {
      limit,
      offset,
      "account.id:in": clientId,
      "reportDateTime:after": desde,
      "reportDateTime:before": hasta,
      include: "account,reportTemplate,createdBy"
    };
    const url = `${CONFIG_CLIENTE.apiUrl}reports?${new URLSearchParams(filtros).toString()}`;
    const r = await fetch(url, { headers: token ? { "Authorization": `Bearer ${token}` } : {} });
    if (!r.ok) break;
    const json = await r.json();
    const data = json?.data ?? [];
    all.push(...data);
    if (data.length < limit) break;
    offset += limit;
  }
  return all;
}

async function cargarDiccionarioDeCampos(templateIds, token) {
  const uniqueIds = [...new Set(templateIds)].filter(id => id);
  const worker = async (tplId) => {
    if (window.__FIELD_MAP__[`LOADED_${tplId}`]) return;
    try {
      const url = `${CONFIG_CLIENTE.apiUrl}report-template-fields?reportTemplate=${tplId}&limit=500`;
      const r = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
      if (r.ok) {
        const json = await r.json();
        const data = json.data || json;
        data.forEach(fieldDef => {
          if (fieldDef.id) {
            const key = String(fieldDef.id);
            const val = fieldDef.label || fieldDef.name || "Campo sin nombre";
            window.__FIELD_MAP__[key] = val;
          }
        });
        window.__FIELD_MAP__[`LOADED_${tplId}`] = true;
      }
    } catch (e) {}
  };
  await mapWithConcurrency(uniqueIds, worker, 3);
}

async function fetchReportDetailsForList(metaList, token, concurrency = 6) {
  const worker = async (meta) => {
    const reportId = meta.id || meta.uuid;
    if (!reportId) return null;
    const url = `${CONFIG_CLIENTE.apiUrl}reports/${reportId}?include=reportFields`;
    const r = await fetch(url, { headers: token ? { "Authorization": `Bearer ${token}` } : {} });
    if (!r.ok) return null;
    const json = await r.json();
    const rep = json.data || json;
    return { meta, reportFields: rep.reportFields || [] };
  };
  const results = await mapWithConcurrency(metaList, worker, concurrency);
  return results.filter(Boolean);
}

/* --- FUNCIÓN AGRESIVA PARA EXTRAER VALORES (MODIFICADA: S/D FIX) --- */
function getFieldValue(f) {
  let val = f.value ?? f.response;

  if (val === null || val === undefined || val === "") return "S/D";

  if (typeof val === "object") {

    if (val.value !== undefined && val.value === "") return "S/D";

    if (val.value) return String(val.value).trim();
    if (val.label) return String(val.label).trim();
    if (val.address) return String(val.address).trim();
    if (val.id) return String(val.id).trim();

    try {
      const jsonString = JSON.stringify(val);
      return jsonString.length > 100 ? "[Objeto Grande]" : jsonString;
    } catch (e) {
      return "[Objeto Ilegible]";
    }
  }

  return String(val).trim();
}

/* --- 6. NORMALIZACIÓN --- */
function normalizeReportDetalle(det) {
  const meta = det.meta || {};
  const fields = det.reportFields || [];
  const empleado = meta.createdBy ? `${meta.createdBy.firstName || ""} ${meta.createdBy.lastName || ""}`.trim() : "SIN NOMBRE";

  let obs = "";
  const campoObs = fields.find(f => {
    const key = String(f.field || f.templateField || "");
    const nombreReal = window.__FIELD_MAP__[key] || "";

    if (nombreReal.toLowerCase().includes("observac") || nombreReal.toLowerCase().includes("comentario")) return true;

    const lbl = (f.label || f.templateFieldName || "").toLowerCase();
    return lbl.includes("observación") || lbl.includes("observacion") || lbl.includes("comentario");
  });

  if (campoObs) {
    let v = campoObs.value ?? campoObs.response;
    if (v && typeof v === 'object' && v.value) v = v.value;
    obs = v;
  }

  return {
    reportId: meta.id || meta.uuid,
    fechaHora: meta.reportDateTime || null,
    fecha: meta.reportDateTime ? String(meta.reportDateTime).substring(0, 10) : null,
    hora: meta.reportDateTime ? (new Date(meta.reportDateTime)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
    reportTemplateId: meta.reportTemplate ? meta.reportTemplate.id : null,
    reportTemplateName: meta.reportTemplate ? meta.reportTemplate.name : null,
    clienteId: meta.account ? meta.account.id : null,
    clienteName: meta.account ? meta.account.name : null,
    empleado,
    observaciones: obs || "",
    hasPhoto: findPictureRefsInFields(fields).length > 0,
    rawFields: fields
  };
}

function buildEmpleadoResumenFromReportes(reportesNormalized) {
  const map = {};
  reportesNormalized.forEach(r => {
    const name = r.empleado || "SIN NOMBRE";
    if (!map[name]) map[name] = { empleado: name, cliente: r.clienteName || "", count: 0, first: r.fechaHora, last: r.fechaHora };
    map[name].count += 1;
    if (r.fechaHora && (!map[name].first || r.fechaHora < map[name].first)) map[name].first = r.fechaHora;
    if (r.fechaHora && (!map[name].last || r.fechaHora > map[name].last)) map[name].last = r.fechaHora;
  });
  return Object.values(map).sort((a, b) => b.count - a.count);
}

/* --- LÓGICA DE FOTOS Y MODAL (SÓLO DETECCIÓN) --- */
function findPictureRefsInFields(fields) {
  if (!Array.isArray(fields)) return [];
  const pics = [];
  fields.forEach(f => {
    if (!f) return;
    const fieldId = String(f.field || "");

    let fileId = null;

    const valStr = String(f.value || f.response || '');
    if (
      valStr.startsWith(CONFIG_CLIENTE.apiUrl.replace('/rest/v1', '').replace(/\/$/, '') + "/rest/v1/files") ||
      valStr.startsWith(CONFIG_CLIENTE.apiUrl.replace('/rest/v1', '').replace(/\/$/, '') + "/rest/v1/media") ||
      f.type === "picture" ||
      f.type === "camera"
    ) {
      fileId = f.value?.fileId || f.value?.id || f.value?.fileIdValue || f.response;
    }

    if (!fileId && f.value && typeof f.value === "object") {
      fileId = f.value.fileId || f.value.id || f.value.fileIdValue;
    }
    if (!fileId && f.value && /^[0-9]+$/.test(String(f.value))) fileId = f.value;
    if (!fileId && f.response && /^[0-9]+$/.test(String(f.response))) fileId = f.response;
    if (!fileId && f.fileId) fileId = f.fileId;

    if (fileId) {
      pics.push({ fieldName: window.__FIELD_MAP__[fieldId] || "Foto", fileId: String(fileId), raw: f });
    }
  });
  return pics;
}


/* --- 14. VISTAS PERSONALIZADAS: GESTIÓN OPERATIVA --- */

// ** FUNCIÓN DE CÁLCULO DIARIO (FINAL FIXED TIMEZONE) **
function calculateDailyReports() {
  const reports = window.__LINE_CHART_CACHE__ || [];
  const dailyCounts = {};

  window.__DAILY_DATE_MAP__ = {};

  const range = getSevenDaysRange();
  // La cadena YYYY-MM-DD se interpreta como UTC midnight
  let dateIterator = new Date(range.desde);

  reports.forEach(r => {
    if (r.fecha) {
      const key = r.fecha; // YYYY-MM-DD from API data
      dailyCounts[key] = (dailyCounts[key] || 0) + 1;
    }
  });

  const finalData = [];

  // Formateador para obtener el nombre del mes corto en español y UTC
  const shortMonthFormatter = new Intl.DateTimeFormat('es-ES', { month: 'short', timeZone: 'UTC' });

  for (let i = 0; i < 7; i++) {
    const year = dateIterator.getUTCFullYear();
    const month = String(dateIterator.getUTCMonth() + 1).padStart(2, '0');
    const dayOfMonth = dateIterator.getUTCDate();
    const day = String(dayOfMonth).padStart(2, '0');

    const key = `${year}-${month}-${day}`; // Clave YYYY-MM-DD (e.g., 2025-12-03)

    // Generamos la etiqueta visual de forma manual y limpia para evitar problemas de sincronización
    let monthNameShort = shortMonthFormatter.format(dateIterator);
    monthNameShort = monthNameShort.replace('.', ''); // Eliminar punto final si existe
    const label = `${dayOfMonth} ${monthNameShort.charAt(0).toUpperCase() + monthNameShort.slice(1)}`; // e.g., "3 Dic"

    window.__DAILY_DATE_MAP__[label] = key; // Mapeo: "3 Dic" -> "2025-12-03"

    finalData.push({
      day: label,
      key: key,
      count: dailyCounts[key] || 0
    });

    // Avanzar al siguiente día
    dateIterator.setUTCDate(dateIterator.getUTCDate() + 1);
  }

  return finalData;
}


function renderGestionOperativaView() {
  const container = document.getElementById("gestion-operativa-container");
  if (!container) return;

  // La caché principal (Feed) se usa sólo para mostrar el total en el encabezado
  const allReportsFeed = window.__REPORTES_CACHE__ || [];

  // ** LA FUENTE DEL GRÁFICO DE BARRAS ES LA CACHÉ FIJA DE 7 DÍAS **
  let barChartReports = window.__BAR_CHART_CACHE__ || [];

  // Aplicar filtro de plantilla/empleado del sidebar
  if (window.__ACTIVE_TEMPLATES__ && window.__ACTIVE_TEMPLATES__.size > 0) {
    barChartReports = barChartReports.filter(r => r.reportTemplateId != null && window.__ACTIVE_TEMPLATES__.has(String(r.reportTemplateId)));
  }
  if (window.__ACTIVE_EMPLEADO__) {
    barChartReports = barChartReports.filter(r => r.empleado === window.__ACTIVE_EMPLEADO__);
  }

  // ** APLICAR FILTRO DE DÍA SELECCIONADO DEL GRÁFICO DE LÍNEAS **
  if (window.__ACTIVE_CHART_DAY__) {
    console.log(`[DEBUG] Filtro de día ACTIVO: Filtrando reportes para la fecha YYYY-MM-DD: ${window.__ACTIVE_CHART_DAY__}`);
    barChartReports = barChartReports.filter(r => r.fecha === window.__ACTIVE_CHART_DAY__);
  } else {
    console.log("[DEBUG] Filtro de día INACTIVO: Mostrando datos filtrados sólo por Sidebar.");
  }

  const reportCounts = {};
  barChartReports.forEach(r => {
    const name = r.reportTemplateName || "Sin Plantilla";
    reportCounts[name] = (reportCounts[name] || 0) + 1;
  });
  let barChartData = Object.keys(reportCounts).map(name => ({ name, count: reportCounts[name] }));
  barChartData.sort((a, b) => b.count - a.count);

  // --- CÁLCULO DEL GRÁFICO DE LÍNEAS (Independiente) ---
  const lineChartData = calculateDailyReports();

  // Título dinámico y badge para el gráfico de barras
  let barChartTitle = 'Frecuencia de Reportes por Plantilla (Últimos 7 Días)';
  let badgeHtml = '';

  if (window.__ACTIVE_CHART_DAY__) {
    // Al generar el título, usamos 'Z' y forzamos UTC para evitar desfase de 1 día en la visualización del título
    const displayDate = new Date(window.__ACTIVE_CHART_DAY__ + 'T00:00:00Z').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    barChartTitle = `Reportes del Día: ${displayDate}`;
    badgeHtml = `<span class="badge-filter" style="margin-left: 10px; background-color: #dc3545; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;" onclick="window.__ACTIVE_CHART_DAY__ = null; renderGestionOperativaView();">FILTRO DÍA ACTIVO: ${displayDate} <i class="fas fa-times"></i></span>`;
  }

  // Contenido del header
  const headerHtml = `
    <div style="padding: 20px 20px 10px; background-color: #f8f9fa; border-bottom: 2px solid #e9ecef; margin-bottom: 15px;">
      <h2 style="margin: 0; font-size: 1.5rem; color: #343a40;">GESTIÓN OPERATIVA: Resumen Analítico</h2>
      <span style="color: #6c757d; font-size: 0.9rem;">Visualización de la frecuencia de reportes. (Total en rango de fecha: ${allReportsFeed.length}).</span>
    </div>
  `;

  container.innerHTML = headerHtml;

  const contentDiv = document.createElement('div');
  contentDiv.id = 'gestion-operativa-content-wrapper';
  contentDiv.style.padding = '0 20px';

  contentDiv.innerHTML += `
    <div class="chart-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(450px, 1fr)); gap: 20px; margin-bottom: 30px;">
        <div style="height: 400px; position: relative; padding: 10px; background: #fff; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <h3 id="bar-chart-title" style="margin-top:0; font-size: 1.1rem; text-align: center;">
              ${barChartTitle}
              ${badgeHtml}
            </h3>
            <canvas id="reporteChartHorizontal"></canvas>
        </div>
        
        <div style="height: 400px; position: relative; padding: 10px; background: #fff; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <h3 style="margin-top:0; font-size: 1.1rem; text-align: center;">Tendencia Diaria de Reportes (Última Semana)</h3>
            <canvas id="reporteChartLine"></canvas>
        </div>
    </div>
  `;

  // Renderizar la tabla de datos
  let dataTable = '<h3 style="margin-top:20px; font-size: 1.2rem;">Detalle de Reportes por Plantilla</h3><div class="tabla-contenedor"><table class="tabla-datos styled-table" id="tabla-reporte-resumen"><thead><tr><th>Plantilla</th><th style="text-align: right;">Reportes</th></tr></thead><tbody>';

  barChartData.forEach(item => {
    dataTable += `<tr><td>${item.name}</td><td style="text-align: right;">${item.count}</td></tr>`;
  });

  if (barChartData.length === 0) {
    dataTable += `<tr><td colspan="2" style="text-align: center; color: #999; padding: 15px;">No hay reportes para la combinación de filtros y el día seleccionado.</td></tr>`;
  }

  dataTable += '</tbody></table></div>';
  contentDiv.innerHTML += dataTable;

  container.appendChild(contentDiv);

  // 4. Llamada a la función de dibujo del gráfico
  setTimeout(() => {
    if (typeof drawReportHorizontalBarChart !== 'undefined') {
      drawReportHorizontalBarChart(barChartData);
    }
    if (typeof drawDailyLineChart !== 'undefined') {
      drawDailyLineChart(lineChartData);
    } else {
      console.error("[GESTIÓN OPERATIVA] ERROR: Las funciones de gráfico no están definidas. Asegúrate de incluir la función y la librería Chart.js.");
    }
  }, 100);
}


/* --- 8. RENDERIZADO DEL FEED (ENLACE AL REPORTE ORIGINAL) --- */
async function pintarTablaReportes(reportes) {
  const container = document.getElementById("report-feed-container");
  if (!container) return;
  container.innerHTML = "";

  if (!reportes.length) {
    container.innerHTML = `<div style="text-align:center; padding:40px; color:#6b7280;">No hay reportes para mostrar con estos filtros.</div>`;
    return;
  }

  const listaOrdenada = reportes.slice().sort((a, b) => (b.fechaHora || "").localeCompare(a.fechaHora || ""));
  const apiUrlBase = CONFIG_CLIENTE.apiUrl.replace('/rest/v1', '').replace(/\/$/, '');

  for (const r of listaOrdenada) {
    const card = document.createElement("div");
    card.className = "report-card anim-stagger";

    const urlReporteOriginal = `${apiUrlBase}/patrol/default/viewreportprintable/idreport/${r.reportId}/[TU_HASH_TEMPORAL]?forceRegenerate=1`;

    const headerHtml = `
      <div class="report-card-header">
        <div class="rc-meta">
          <h3>${r.empleado || "Sin Nombre"}</h3>
          <span>${r.fecha || "-"} • ${r.hora || "-"}</span>
        </div>
        <div class="header-actions">
          <div class="rc-badge">${r.reportTemplateName || "Reporte"}</div>
          
          <a href="${urlReporteOriginal}" target="_blank" class="btn-fecha-simple btn-ver-reporte" title="Ver reporte original HTML/PDF">
            <i class="fas fa-file-pdf"></i> Ver Reporte
          </a>
        </div>
      </div>
    `;
    card.innerHTML = headerHtml;

    const body = document.createElement("div");
    body.className = "report-card-body";

    if (r.observaciones) {
      body.innerHTML += `<div class="rc-obs">"${r.observaciones}"</div>`;
    }

    const fieldsGrid = document.createElement("div");
    fieldsGrid.className = "rc-fields-grid";

    const fields = r.rawFields || [];
    let camposMostrados = 0;

    fields.forEach(f => {
      const fieldId = String(f.field || f.templateField || f.reportTemplateField || "");
      let label = window.__FIELD_MAP__[fieldId];

      if (!label) label = f.label || f.templateFieldName || f.name;
      if (!label) label = "Dato (ID: " + (fieldId || 'N/A') + ")";

      let val = getFieldValue(f);
      let valStr = String(val);

      const type = String(f.type || "").toLowerCase();
      if (
        valStr.startsWith(CONFIG_CLIENTE.apiUrl.replace('/rest/v1', '').replace(/\/$/, '') + "/rest/v1/files") ||
        valStr.startsWith(CONFIG_CLIENTE.apiUrl.replace('/rest/v1', '').replace(/\/$/, '') + "/rest/v1/media") ||
        type === "picture" ||
        type === "camera" ||
        label.includes("GPS Location") ||
        label.includes("Ubicación GPS")
      ) {
        return;
      }

      const div = document.createElement("div");
      div.className = "rc-field-item";
      div.innerHTML = `<strong>${label}</strong><span>${val}</span>`;
      fieldsGrid.appendChild(div);
      camposMostrados++;
    });

    if (camposMostrados === 0 && !r.observaciones) {
      fieldsGrid.innerHTML = `<div style="color:#9ca3af; font-size:12px; font-style:italic; grid-column: 1/-1;">(Solo datos técnicos/GPS/Fotos en el reporte)</div>`;
    }
    body.appendChild(fieldsGrid);
    card.appendChild(body);
    container.appendChild(card);
  }
}

/* --- 9. FOTOS, EMPLEADOS, KPI, ETC. (Lógica de soporte) --- */
function pintarTablaEmpleados(empleados) {
  const tbodyEmpleados = document.getElementById("tbody-empleados");
  tbodyEmpleados.innerHTML = "";
  if (!empleados.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4;
    td.textContent = "No hay empleados.";
    td.style.textAlign = "center";
    td.style.padding = "16px";
    tr.appendChild(td);
    tbodyEmpleados.appendChild(tr);
    return;
  }
  empleados.forEach(e => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><button class="btn-fecha-simple filtro-empleado" data-emp="${e.empleado}">${e.empleado}</button></td>
      <td>${e.count}</td>
      <td>${e.first ? (new Date(e.first)).toLocaleString() : "-"}</td>
      <td>${e.last ? (new Date(e.last)).toLocaleString() : "-"}</td>
    `;
    tbodyEmpleados.appendChild(tr);
  });
  tbodyEmpleados.querySelectorAll(".filtro-empleado").forEach(b => {
    b.addEventListener("click", () => {
      const emp = b.getAttribute("data-emp");
      window.__ACTIVE_EMPLEADO__ = emp;
      activateTab('report-feed');
      applyFiltersAndRender();
    });
  });
}

function actualizarKPIs(reportes, empleados) {
  const kpiTotal = document.getElementById("kpi-total");
  const kpiEmpleados = document.getElementById("kpi-empleados");
  const kpiConFoto = document.getElementById("kpi-con-foto");
  const kpiSinFoto = document.getElementById("kpi-sin-foto");
  kpiTotal.textContent = reportes.length;
  kpiEmpleados.textContent = empleados.length;
  const conFoto = reportes.filter(r => r.hasPhoto).length;
  kpiConFoto.textContent = conFoto;
  kpiSinFoto.textContent = reportes.length - conFoto;
}

/* --- 12. LOGICA MENU (FILTROS) --- */
window.__ACTIVE_TEMPLATES__ = new Set();
window.__ACTIVE_EMPLEADO__ = null;

function renderSidebarAndPillsFromMetas(metas) {
  const counts = {};

  metas.forEach(m => {
    const tpl = m.reportTemplate || {};
    const id = String(tpl.id || "unknown");
    const name = tpl.name || `Tpl ${id}`;

    if (!counts[id]) counts[id] = { id, name, count: 0 };
    counts[id].count += 1;
  });

  const templates = Object.values(counts).sort((a, b) => a.name.localeCompare(b.name));
  const sidebarList = document.getElementById("sidebar-list");
  sidebarList.innerHTML = "";

  const generalDiv = document.createElement("div");
  generalDiv.className = "sidebar-item";
  generalDiv.dataset.tid = "GENERAL";
  generalDiv.innerHTML = `<div class="left"><span class="name">TODOS</span></div><div class="sidebar-badge">${metas.length}</div>`;
  generalDiv.addEventListener("click", () => {
    window.__ACTIVE_TEMPLATES__.clear();
    window.__ACTIVE_EMPLEADO__ = null;
    activateTab('report-feed');
    updateMenuSelectionVisuals();
    applyFiltersAndRender();
  });
  sidebarList.appendChild(generalDiv);

  sidebarList.innerHTML += `<hr>`;

  sidebarList.innerHTML += `<div style="padding: 5px 15px; font-size: 11px; color: #6b7280; font-weight: 600;">PLANTILLAS DE REPORTE</div>`;

  templates.forEach(t => {
    const div = document.createElement("div");
    div.className = "sidebar-item";
    div.dataset.tid = String(t.id);
    div.innerHTML = `<div class="left"><span class="name">${t.name}</span></div><div class="sidebar-badge">${t.count}</div>`;

    div.addEventListener("click", (ev) => {
      activateTab('report-feed');
      if (ev.ctrlKey || ev.metaKey) toggleTemplateSelection(String(t.id), true);
      else {
        window.__ACTIVE_TEMPLATES__.clear();
        window.__ACTIVE_TEMPLATES__.add(String(t.id));
        updateMenuSelectionVisuals();
        applyFiltersAndRender();
      }
    });
    sidebarList.appendChild(div);
  });

  updateMenuSelectionVisuals();
}

function updateMenuSelectionVisuals() {
  const sidebarList = document.getElementById("sidebar-list");
  Array.from(sidebarList.querySelectorAll(".sidebar-item")).forEach(it => {
    const tid = it.dataset.tid;

    let isSelected = false;

    if (tid === "GENERAL") {
      isSelected = window.__ACTIVE_TEMPLATES__.size === 0;
    } else {
      isSelected = window.__ACTIVE_TEMPLATES__.has(tid);
    }

    it.classList.toggle("selected", isSelected);
  });
}


function toggleTemplateSelection(tid, multi) {
  if (!multi) { window.__ACTIVE_TEMPLATES__.clear(); window.__ACTIVE_TEMPLATES__.add(tid); }
  else {
    if (window.__ACTIVE_TEMPLATES__.has(tid)) window.__ACTIVE_TEMPLATES__.delete(tid);
    else window.__ACTIVE_TEMPLATES__.add(tid);
  }
  updateMenuSelectionVisuals();
  applyFiltersAndRender();
}

function applyFiltersAndRender() {
  if (document.querySelector('.tab-btn[data-tab="gestion-operativa"]')?.classList.contains('active')) {
    renderGestionOperativaView();
    return;
  }

  // Si no estamos en la pestaña operativa, siempre limpiamos el filtro de día del gráfico
  window.__ACTIVE_CHART_DAY__ = null;

  // La fuente del Feed siempre es la caché principal, que respeta el filtro de fecha superior
  const all = window.__REPORTES_CACHE__ || [];
  let filtered = all.slice();
  if (window.__ACTIVE_TEMPLATES__ && window.__ACTIVE_TEMPLATES__.size > 0) {
    filtered = filtered.filter(r => r.reportTemplateId != null && window.__ACTIVE_TEMPLATES__.has(String(r.reportTemplateId)));
  }
  if (window.__ACTIVE_EMPLEADO__) {
    filtered = filtered.filter(r => r.empleado === window.__ACTIVE_EMPLEADO__);
  }

  pintarTablaReportes(filtered);
  const empleadosSummary = buildEmpleadoResumenFromReportes(filtered);
  window.__EMPLEADOS_CACHE__ = empleadosSummary;
  pintarTablaEmpleados(empleadosSummary);
  actualizarKPIs(filtered, empleadosSummary);
}

/* --- LÓGICA DE TABS --- */
function activateTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));

  const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  const activePanel = document.getElementById(`tab-${tabName}`);

  if (activeBtn) activeBtn.classList.add('active');
  if (activePanel) activePanel.classList.add('active');

  if (tabName === 'gestion-operativa') {
    renderGestionOperativaView();
  }

  if (tabName === 'report-feed' || tabName === 'empleados') {
    applyFiltersAndRender();
  }
}

/* --- 13. FLUJO PRINCIPAL OPTIMIZADO (DOBLE LLAMADA EN PARALELO) --- */
async function cargarReportesYEmpleadosPorRango(desdeYYYY, hastaYYYY) {
  try {
    const loader = document.getElementById("loader-global-cliente");
    loader.classList.remove("oculto");
    const token = await getTokenLocal();
    if (!token) throw new Error("No se pudo obtener el token de autenticación.");

    window.__ACTIVE_CHART_DAY__ = null;

    // ======================================================================================
    // === 1. PARALELIZAR LLAMADAS DE METADATA ===
    // ======================================================================================
    const sevenDayRange = getSevenDaysRange();

    const [metasPrincipal, metasLinea] = await Promise.all([
      // Llamada 1: Metadata principal (rango de fecha del usuario)
      fetchReportsMetaByClient(token, CONFIG_CLIENTE.clienteId, desdeYYYY, hastaYYYY),
      // Llamada 2: Metadata de línea (rango fijo de 7 días)
      fetchReportsMetaByClient(token, CONFIG_CLIENTE.clienteId, sevenDayRange.desde, sevenDayRange.hasta)
    ]);

    const templateIds = metasPrincipal.map(m => m.reportTemplate ? m.reportTemplate.id : null).filter(Boolean);
    const templateIdsLinea = metasLinea.map(m => m.reportTemplate ? m.reportTemplate.id : null).filter(Boolean);

    // Aseguramos que el diccionario de campos cubra los IDs de ambos rangos
    const allTemplateIds = [...new Set([...templateIds, ...templateIdsLinea])];

    // ======================================================================================
    // === 2. PARALELIZAR DETALLES Y DICCIONARIO (Carga costosa) ===
    // ======================================================================================

    const cargarCamposPromise = cargarDiccionarioDeCampos(allTemplateIds, token);

    // Fetch de detalles para el rango principal (Feed, Sidebar, KPI)
    const detallesPrincipalPromise = fetchReportDetailsForList(metasPrincipal, token, 6);

    // Fetch de detalles para el rango fijo de 7 días (Gráfico de Barras)
    const detallesLineaPromise = fetchReportDetailsForList(metasLinea, token, 6);

    // Esperamos a que los tres grandes procesos terminen
    const [detallesPrincipal, detallesLinea] = await Promise.all([detallesPrincipalPromise, detallesLineaPromise]);
    await cargarCamposPromise; // Asegurar que el mapeo de campos está listo

    // ======================================================================================
    // === 3. PROCESAMIENTO Y CACHE ===
    // ======================================================================================

    // A. Procesar datos principales (Feed, Sidebar, KPI)
    const normalizadosPrincipal = detallesPrincipal.map(d => normalizeReportDetalle(d));
    window.__REPORTES_CACHE__ = normalizadosPrincipal;
    renderSidebarAndPillsFromMetas(metasPrincipal);

    // B. Procesar datos de línea (sólo metadata) -> CACHÉ RÁPIDA
    const normalizadosLineaMeta = metasLinea.map(m => normalizeReportDetalle({ meta: m, reportFields: [] }));
    window.__LINE_CHART_CACHE__ = normalizadosLineaMeta;

    // C. Procesar datos de barra (Full Details 7 días) -> CACHÉ DESACOPLADA
    const normalizadosLineaDetails = detallesLinea.map(d => normalizeReportDetalle(d));
    window.__BAR_CHART_CACHE__ = normalizadosLineaDetails;

    applyFiltersAndRender();

    document.querySelectorAll(".anim-stagger").forEach((n, i) => setTimeout(() => n.classList.add("show"), i * 80));
  } catch (e) {
    console.error("Error en la carga principal:", e);
  } finally {
    document.getElementById("loader-global-cliente").classList.add("oculto");
  }
}

/* --- FUNCIÓN PARA DIBUJAR EL GRÁFICO HORIZONTAL (BARRAS) --- */
function drawReportHorizontalBarChart(chartData) {
  const ctx = document.getElementById('reporteChartHorizontal');

  // ** IMPORTANTE: Registramos el plugin DataLabels si Chart.js está disponible **
  if (typeof Chart !== 'undefined' && typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
  }

  if (!ctx || typeof Chart === 'undefined') return;

  if (window.reporteBarChartInstance) {
    window.reporteBarChartInstance.destroy();
  }

  const labels = chartData.map(d => d.name);
  const data = chartData.map(d => d.count);

  labels.reverse();
  data.reverse();

  const primaryColor = '#3b82f6';

  window.reporteBarChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '# de Reportes',
        data: data,
        backgroundColor: primaryColor,
        borderColor: primaryColor,
        borderWidth: 1
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Cantidad de Reportes'
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        // ** CONFIGURACIÓN DE DATA LABELS AÑADIDA **
        datalabels: {
          anchor: 'end',
          align: 'right',
          color: '#343a40', // Color del texto
          font: {
            weight: 'bold',
            size: 10
          },
          formatter: (value) => {
            return value > 0 ? value : ''; // Muestra el valor si es > 0
          }
        }
      }
    }
  });
}

/* --- FUNCIÓN PARA DIBUJAR EL GRÁFICO DE LÍNEAS POR DÍA (ACTUALIZADA con onClick) --- */
function drawDailyLineChart(chartData) {
  const ctx = document.getElementById('reporteChartLine');

  if (!ctx || typeof Chart === 'undefined') return;

  if (window.reporteLineChartInstance) {
    window.reporteLineChartInstance.destroy();
  }

  if (chartData.length === 0) {
    ctx.style.display = 'none';
    return;
  }
  ctx.style.display = 'block';

  const labels = chartData.map(d => d.day);
  const data = chartData.map(d => d.count);

  const primaryColor = '#10b981';

  window.reporteLineChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Reportes',
        data: data,
        fill: true,
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        borderColor: primaryColor,
        tension: 0.3,
        borderWidth: 2,
        // Resaltar el punto seleccionado
        pointBackgroundColor: chartData.map(d => d.key === window.__ACTIVE_CHART_DAY__ ? '#dc3545' : primaryColor),
        pointRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      // ** MANEJADOR ON CLICK **
      onClick: (e, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index;
          const clickedLabel = labels[index];
          const selectedDate = window.__DAILY_DATE_MAP__[clickedLabel];

          if (window.__ACTIVE_CHART_DAY__ === selectedDate) {
            // Limpiar filtro si se hace clic dos veces en el mismo día
            window.__ACTIVE_CHART_DAY__ = null;
          } else {
            // Aplicar nuevo filtro
            window.__ACTIVE_CHART_DAY__ = selectedDate;
          }

          // Forzar el re-renderizado del área operativa para aplicar el filtro al gráfico de barras
          renderGestionOperativaView();
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: data.length > 0 ? Math.max(...data) * 1.1 : 10,
          title: {
            display: true,
            text: 'Reportes Totales'
          }
        },
        x: {
          grid: {
            display: false
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        title: {
          display: true,
          text: 'Tendencia Diaria de Reportes (Última Semana)'
        }
      }
    }
  });
}


// --- Export CSV y DOMContentLoaded ---

function exportToCSV(filename, headers, rows) {
  const lineas = [headers, ...rows].map(r => r.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"));
  const blob = new Blob([lineas.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const btnExportReportes = document.getElementById("btn-export-reportes");
if (btnExportReportes) {
  btnExportReportes.addEventListener("click", () => {
    const data = window.__REPORTES_CACHE__ || [];
    exportToCSV(`reportes_${CONFIG_CLIENTE.clienteId}.csv`, ["ID", "Fecha", "Hora", "Plantilla", "Empleado", "Observaciones"], data.map(r => [r.reportId, r.fecha, r.hora, r.reportTemplateName, r.empleado, r.observaciones]));
  });
}

const btnExportEmpleados = document.getElementById("btn-export-empleados");
if (btnExportEmpleados) {
  btnExportEmpleados.addEventListener("click", () => {
    const empleados = window.__EMPLEADOS_CACHE__ || [];
    exportToCSV(`empleados.csv`, ["Empleado", "#Reportes"], empleados.map(e => [e.empleado, e.count]));
  });
}


document.addEventListener("DOMContentLoaded", () => {
  const elClienteTitle = document.getElementById("cliente-title");
  const inputDesde = document.getElementById("fecha-desde");
  const inputHasta = document.getElementById("fecha-hasta");
  const btnAplicar = document.getElementById("btn-aplicar-fecha");
  const btnRefrescar = document.querySelector('.btn-fecha-primario i.fa-rotate-right')?.closest('button');
  const btnRapidos = document.querySelectorAll(".btn-fecha-rapido");

  elClienteTitle.textContent = CONFIG_CLIENTE.clienteName || CONFIG_CLIENTE.clienteId;
  const hoy = hoyYYYYMMDD();
  if (inputDesde) inputDesde.value = hoy;
  if (inputHasta) inputHasta.value = hoy;

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const tabName = btn.getAttribute("data-tab");
      activateTab(tabName);
    });
  });

  if (btnAplicar) btnAplicar.addEventListener("click", () => cargarReportesYEmpleadosPorRango(inputDesde.value, inputHasta.value));
  if (btnRefrescar) btnRefrescar.addEventListener("click", () => cargarReportesYEmpleadosPorRango(inputDesde.value, inputHasta.value));

  btnRapidos.forEach(b => b.addEventListener("click", () => {
    const tipo = b.getAttribute("data-rango");
    let desde = hoy,
      hasta = hoy;
    if (tipo === "hoy") { desde = hoy; hasta = hoy; }
    if (tipo === "ayer") { desde = ayerYYYYMMDD(); hasta = ayerYYYYMMDD(); }
    if (tipo === "ult7") { hasta = hoy; desde = sumarDias(hoy, -6); }
    inputDesde.value = desde;
    inputHasta.value = hasta;
    cargarReportesYEmpleadosPorRango(desde, hasta);
  }));

  cargarReportesYEmpleadosPorRango(hoy, hoy);
  activateTab('report-feed');
});
