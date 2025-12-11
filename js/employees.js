/* employees.js (con modal de reporte y lightbox)
   Reemplaza / pega en js/employees.js
   Usa js/config.js (ya existente)
*/

/* ---------- UTILIDADES ---------- */
function formatTimeFromISO(iso){
    if(!iso) return "-";
    const d = new Date(iso);
    if(isNaN(d)) return "-";
    return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function minutesSince(iso){
    if(!iso) return null;
    const d = new Date(iso);
    if(isNaN(d)) return null;
    const diff = Date.now() - d.getTime();
    return Math.floor(diff/60000);
}
function safeText(s){ return s==null ? "-" : String(s); }

/* ---------- GLOBALS ---------- */
let TOKEN = null;
let REPORTS_ALL = [];        // array crudo de reportes traídos
let REPORTS_BY_ID = {};      // map uuid/id -> report
let GLOBAL_MAP = null;       // empleado map (como antes)
let VIEWED_REPORTS = new Set(); // track local de reports marcados como vistos

/* ---------- HELPERS: clientes y templates ---------- */
function getClientIdsFromConfig(){
    if(!CONFIG || !CONFIG.clientes) return [];
    return Object.values(CONFIG.clientes).map(v => String(v));
}
function classifyByTemplateId(id){
    if(!id) return null;
    if(id === CONFIG.templates.preoperacional) return "preoperacional";
    if(id === CONFIG.templates.inicio) return "inicio";
    if(id === CONFIG.templates.llegada) return "llegada";
    if(id === CONFIG.templates.empalme) return "empalme";
    if(id === CONFIG.templates.desempalme) return "desempalme";
    if(id === CONFIG.templates.fin) return "fin";
    return null;
}

/* ---------- TOKEN y FETCH (igual que antes) ---------- */
async function getToken(){
    if(TOKEN) return TOKEN;
    try{
        const r = await fetch(CONFIG.apiUrl + "auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: CONFIG.username, password: CONFIG.password })
        });
        if(!r.ok) throw new Error("no token");
        const j = await r.json();
        TOKEN = j?.auth?.token || null;
        return TOKEN;
    }catch(e){
        console.error("token error", e);
        return null;
    }
}
async function getReportsPage(token, offset){
    const ids = Object.values(CONFIG.templates).join(",");
    const params = {
        limit: 100,
        offset,
        "reportTemplate.id:in": ids,
        "reportDateTime:after": (new Date()).toISOString().slice(0,10) + "T00:00:00-05:00",
        include: "account,reportTemplate,createdBy"
    };
    const url = `${CONFIG.apiUrl}reports?${new URLSearchParams(params).toString()}`;
    try {
        const r = await fetch(url, { headers: { "Authorization": `Bearer ${token}` }});
        if(!r.ok) return [];
        const j = await r.json();
        return j?.data || [];
    } catch(e){
        console.error("fetch page", e);
        return [];
    }
}
async function getAllReports(){
    const token = await getToken();
    if(!token) return [];
    let out = []; let offset = 0;
    while(true){
        const page = await getReportsPage(token, offset);
        if(!page.length) break;
        out = out.concat(page);
        offset += 100;
    }
    return out;
}

/* ---------- PROCESAR POR EMPLEADO ---------- */
function buildEmployeeMap(reports){
    const clientIds = getClientIdsFromConfig();
    const map = {};

    reports.forEach(r => {
        const accId = r.account?.id ?? null;
        if(!accId || !clientIds.includes(String(accId))) return;
        if(!r.createdBy || !r.createdBy.id) return;
        const empId = String(r.createdBy.id);
        if(!map[empId]) {
            map[empId] = {
                id: empId,
                nombre: `${r.createdBy.firstName||''} ${r.createdBy.lastName||''}`.trim() || `#${empId}`,
                steps: { preoperacional:null, inicio:null, llegada:null, empalme:null, desempalme:null, fin:null },
                lastReportISO: null,
                lastType: null,
                clientId: accId,
                clientName: r.account?.name || ''
            };
        }
        const tipo = classifyByTemplateId(r.reportTemplate?.id);
        if(tipo){
            const existing = map[empId].steps[tipo];
            if(!existing || (r.reportDateTime && r.reportDateTime > existing)){
                map[empId].steps[tipo] = r.reportDateTime;
            }
        }
        if(r.reportDateTime && (!map[empId].lastReportISO || r.reportDateTime > map[empId].lastReportISO)){
            map[empId].lastReportISO = r.reportDateTime;
            map[empId].lastType = tipo || map[empId].lastType;
        }
    });
    return map;
}

/* ---------- RENDER UI (cards + table) ---------- */
function renderCardsFromMap(map, clienteFilter){
    const container = document.getElementById("cards-row");
    container.innerHTML = "";
    const clientIds = getClientIdsFromConfig();

    Object.values(map).forEach(emp => {
        if(clienteFilter && clienteFilter !== "all" && String(emp.clientId) !== String(clienteFilter)) return;
        if(clienteFilter === "all" && !clientIds.includes(String(emp.clientId))) return;

        const minutes = minutesSince(emp.lastReportISO);
        const timeText = minutes==null? "-" : (minutes <= 59 ? `${minutes}m` : `${Math.floor(minutes/60)}h`);
        const el = document.createElement("div");
        el.className = "card";
        el.innerHTML = `
            <h3>${emp.nombre}</h3>
            <div class="meta">${safeText(emp.clientName)}</div>
            <div class="meta muted">Último: ${formatTimeFromISO(emp.lastReportISO)} — ${emp.lastType || '-'}</div>
            <div style="display:flex;gap:8px;margin-top:8px;align-items:center;">
                <div class="chip">${emp.steps.inicio ? 'Inicio ✓' : 'Inicio —'}</div>
                <div class="chip">${emp.steps.empalme ? 'Empalme ✓' : 'Empalme —'}</div>
                <div style="margin-left:auto"><span class="kpi-small">${timeText}</span></div>
            </div>
            <div style="margin-top:10px;display:flex;gap:8px;">
                <button class="btn-small" data-emp="${emp.id}" onclick="openLastReportForEmployee('${emp.id}')">Ver</button>
            </div>
        `;
        container.appendChild(el);
    });
}

function renderTableFromMap(map, clienteFilter, searchName){
    const tbody = document.querySelector("#employees-table tbody");
    tbody.innerHTML = "";
    let count = 0;
    const clientIds = getClientIdsFromConfig();

    Object.values(map).sort((a,b)=> (a.nombre > b.nombre?1:-1)).forEach(emp => {
        if(clienteFilter && clienteFilter !== "all" && String(emp.clientId) !== String(clienteFilter)) return;
        if(clienteFilter === "all" && !clientIds.includes(String(emp.clientId))) return;
        if(searchName && !emp.nombre.toLowerCase().includes(searchName.toLowerCase())) return;
        count++;
        const minutes = minutesSince(emp.lastReportISO);
        const timeText = minutes==null? "-" : (minutes <= 59 ? `${minutes}m` : `${Math.floor(minutes/60)}h`);
        const preop = emp.steps.preoperacional ? "✓" : "-";
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${emp.nombre}</td>
                        <td>${safeText(emp.clientName)}</td>
                        <td>${formatTimeFromISO(emp.lastReportISO)}</td>
                        <td>${emp.lastType || '-'}</td>
                        <td>${timeText}</td>
                        <td>${preop}</td>
                        <td><button class="btn-small" data-emp="${emp.id}" onclick="openLastReportForEmployee('${emp.id}')">Ver</button></td>`;
        tbody.appendChild(tr);
    });
    document.getElementById("table-info").innerText = `Mostrando ${count} empleados`;
}

/* ---------- UTIL: obtención de imágenes del reporte (varios posibles campos) ---------- */
function getReportImages(report){
    if(!report) return [];
    const urls = [];

    // Campos comunes que algunas APIs usan
    const posibleArrays = [
        report.attachments, report.files, report.images, report.photos,
        report.reportFiles, report.media, report.attachmentsData, report.filesData
    ];

    posibleArrays.forEach(arr=>{
        if(Array.isArray(arr)){
            arr.forEach(a=>{
                if(typeof a === 'string') urls.push(a);
                else if(a && (a.url || a.fileUrl || a.path)) urls.push(a.url || a.fileUrl || a.path);
            });
        }
    });

    // También revisar valores que puedan contener URLs
    if(report.values && typeof report.values === 'object'){
        Object.values(report.values).forEach(v=>{
            if(typeof v === 'string' && v.startsWith('http')) urls.push(v);
        });
    }

    // El reporte puede traer attachments dentro de report.data etc.
    if(report.data && typeof report.data === 'object'){
        Object.values(report.data).forEach(v=>{
            if(Array.isArray(v)){
                v.forEach(x => { if(typeof x === 'string' && x.startsWith('http')) urls.push(x); });
            }
        });
    }

    // asegurarse único y válidos
    return Array.from(new Set(urls)).filter(u => typeof u === 'string' && u.length > 5);
}

/* ---------- UTIL: campos legibles del reporte ---------- */
function getReportFields(report){
    const out = [];

    // Priorizar campos tipo values / fields
    const candidates = [report.values, report.fields, report.reportValues, report.data, report];
    candidates.forEach(obj=>{
        if(!obj || typeof obj !== 'object') return;
        Object.entries(obj).forEach(([k,v])=>{
            // evitar objetos grandes (los convertimos a JSON corto)
            if(typeof v === 'object') {
                try { out.push({k, v: JSON.stringify(v).slice(0,200)}); }
                catch(e){ out.push({k, v: String(v)}); }
            } else {
                out.push({k, v});
            }
        });
    });

    // dedupe by key keeping first occurrence
    const seen = new Set();
    const dedup = [];
    out.forEach(item=>{
        if(seen.has(item.k)) return;
        seen.add(item.k);
        dedup.push(item);
    });
    return dedup;
}

/* ---------- MODAL REPORTE ---------- */
function openReportModalById(reportId){
    const report = REPORTS_BY_ID[String(reportId)];
    if(!report) { alert("Reporte no encontrado"); return; }

    // Header
    const title = document.getElementById("report-title");
    const subtitle = document.getElementById("report-subtitle");
    const meta = document.getElementById("report-meta");
    const fieldsDiv = document.getElementById("report-fields");
    const gallery = document.getElementById("gallery");

    const tipo = classifyByTemplateId(report.reportTemplate?.id) || report.reportTemplate?.name || 'REPORTE';
    title.innerText = `${(tipo||'REPORTE').toUpperCase()} — ${formatTimeFromISO(report.reportDateTime)}`;
    subtitle.innerText = `${safeText(report.createdBy?.firstName || '')} ${safeText(report.createdBy?.lastName||'')} — ${safeText(report.account?.name||'')}`;

    // meta
    meta.innerHTML = `
        <div><strong>ID:</strong> ${safeText(report.uuid || report.id)}</div>
        <div class="muted">Fecha: ${safeText(report.reportDateTime)}</div>
        <div class="muted">Posición: ${safeText(report.position || report.siteLocation?.name || '')}</div>
        <div class="muted">Creado por: ${safeText(report.createdBy?.email || report.createdBy?.id || '')}</div>
    `;

    // fields
    const fields = getReportFields(report);
    fieldsDiv.innerHTML = '';
    if(fields.length === 0) fieldsDiv.innerHTML = `<div class="field">No hay campos detectables</div>`;
    else {
        fields.forEach(f=>{
            const node = document.createElement("div");
            node.className = "field";
            node.innerHTML = `<div class="label">${f.k}</div><div class="value">${String(f.v)}</div>`;
            fieldsDiv.appendChild(node);
        });
    }

    // gallery (lazy: ponemos thumbnails that load when inserted)
    gallery.innerHTML = '';
    const images = getReportImages(report);
    if(images.length === 0) {
        gallery.innerHTML = `<div class="muted">No hay imágenes</div>`;
    } else {
        images.forEach((u,i)=>{
            const div = document.createElement("div");
            div.className = "thumb";
            div.innerHTML = `<img data-src="${u}" loading="lazy" alt="imagen ${i+1}" />`;
            div.addEventListener("click", ()=> openLightbox(images, i));
            gallery.appendChild(div);
        });
    }

    // marcar si ya visto
    const btnSeen = document.getElementById("btn-mark-seen");
    const seen = VIEWED_REPORTS.has(String(report.uuid || report.id));
    btnSeen.innerText = seen ? "Visto ✔" : "Marcar visto";
    btnSeen.dataset.report = String(report.uuid || report.id);

    // mostrar modal
    document.getElementById("modal-report").classList.add("show");
}

function openLastReportForEmployee(empId){
    // buscar en REPORTS_ALL el último report de ese empleado (filtrado por cliente ids)
    const arr = REPORTS_ALL.filter(r => r.createdBy && String(r.createdBy.id) === String(empId));
    if(!arr.length) return alert("No hay reportes para este empleado hoy.");
    arr.sort((a,b) => (b.reportDateTime||'').localeCompare(a.reportDateTime||''));
    const last = arr[0];
    openReportModalById(last.uuid || last.id);
}

/* ---------- LIGHTBOX ---------- */
let LIGHT_IMAGES = [];
let LIGHT_INDEX = 0;
function openLightbox(imagesArray, index){
    LIGHT_IMAGES = imagesArray;
    LIGHT_INDEX = index || 0;
    const lb = document.getElementById("lightbox");
    const img = document.getElementById("lightbox-img");
    const caption = document.getElementById("lightbox-caption");
    img.src = imagesArray[LIGHT_INDEX];
    caption.innerText = `${LIGHT_INDEX+1} / ${imagesArray.length}`;
    lb.style.display = "flex";
}
function closeLightbox(){ document.getElementById("lightbox").style.display = "none"; }
function prevLightbox(){ if(LIGHT_INDEX>0) { LIGHT_INDEX--; document.getElementById("lightbox-img").src = LIGHT_IMAGES[LIGHT_INDEX]; document.getElementById("lightbox-caption").innerText = `${LIGHT_INDEX+1} / ${LIGHT_IMAGES.length}`; } }
function nextLightbox(){ if(LIGHT_INDEX < LIGHT_IMAGES.length-1) { LIGHT_INDEX++; document.getElementById("lightbox-img").src = LIGHT_IMAGES[LIGHT_INDEX]; document.getElementById("lightbox-caption").innerText = `${LIGHT_INDEX+1} / ${LIGHT_IMAGES.length}`; } }
function downloadCurrentLightboxImage(){
    const url = LIGHT_IMAGES[LIGHT_INDEX];
    if(!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `image_${LIGHT_INDEX+1}.jpg`;
    a.click();
}

/* ---------- EXPORT: reporte a CSV ---------- */
function exportReportToCSV(report){
    if(!report) return alert("Reporte inválido");
    const rows = [];
    rows.push(['clave','valor']);
    const fields = getReportFields(report);
    fields.forEach(f => rows.push([f.k, String(f.v).replace(/\n/g,' ')]));
    const images = getReportImages(report);
    if(images.length) rows.push(['imagenes', images.join(' | ')]);
    const csv = rows.map(r=> r.map(c=> `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const a = document.createElement('a');
    const name = `reporte_${(report.uuid||report.id||'').toString().slice(0,8)}.csv`;
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
}

/* ---------- MARCAR VISTO ---------- */
function toggleMarkSeen(reportId){
    const id = String(reportId);
    if(VIEWED_REPORTS.has(id)) VIEWED_REPORTS.delete(id);
    else VIEWED_REPORTS.add(id);
    // actualizar texto del boton
    const btn = document.getElementById("btn-mark-seen");
    if(btn && btn.dataset.report === id){
        btn.innerText = VIEWED_REPORTS.has(id) ? "Visto ✔" : "Marcar visto";
    }
}

/* ---------- EXPORT TABLA CSV (igual que antes) ---------- */
function tableToCSV(filename = 'empleados.csv'){
    const rows = [];
    const headers = ['Empleado','Cliente','Último reporte','Tipo','Tiempo desde','Preoperacional'];
    rows.push(headers.join(','));
    document.querySelectorAll("#employees-table tbody tr").forEach(tr=>{
        const cols = Array.from(tr.querySelectorAll('td')).slice(0,6).map(td => `"${td.innerText.replace(/"/g,'""')}"`);
        rows.push(cols.join(','));
    });
    const csv = rows.join('\n');
    const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

/* ---------- FLUJO PRINCIPAL ---------- */
async function loadAndRender(){
    try {
        document.getElementById("loader").style.display = "flex";
        const reports = await getAllReports();
        // keep global lists & maps
        REPORTS_ALL = reports || [];
        REPORTS_BY_ID = {};
        reports.forEach(r => {
            const id = String(r.uuid || r.id || Math.random());
            REPORTS_BY_ID[id] = r;
            // ensure uuid present
            if(!r.uuid) r.uuid = id;
        });

        // map empleados (solo clientes de CONFIG)
        const map = buildEmployeeMap(reports);
        GLOBAL_MAP = map;

        // llenar select clientes (solo clientes de CONFIG)
        const sel = document.getElementById("filter-cliente");
        sel.innerHTML = `<option value="all">— Todos los clientes —</option>`;
        Object.entries(CONFIG.clientes).forEach(([name,id])=>{
            const opt = document.createElement("option"); opt.value = id; opt.text = name; sel.appendChild(opt);
        });

        // render inicial
        renderCardsFromMap(map, sel.value);
        renderTableFromMap(map, sel.value, document.getElementById("search-name").value);

    } catch(e){
        console.error("error load", e);
        alert("Error cargando reportes, revisa la consola");
    } finally {
        document.getElementById("loader").style.display = "none";
    }
}

/* ---------- EVENTOS UI ---------- */
document.addEventListener("DOMContentLoaded", ()=>{
    // iniciar carga
    loadAndRender();

    // filtros
    document.getElementById("filter-cliente").addEventListener("change", (e)=>{
        const cliente = e.target.value;
        renderCardsFromMap(GLOBAL_MAP, cliente);
        renderTableFromMap(GLOBAL_MAP, cliente, document.getElementById("search-name").value);
    });
    document.getElementById("search-name").addEventListener("input", (e)=>{
        const q = e.target.value;
        const cliente = document.getElementById("filter-cliente").value;
        renderCardsFromMap(GLOBAL_MAP, cliente);
        renderTableFromMap(GLOBAL_MAP, cliente, q);
    });

    // export tabla
    document.getElementById("export-csv").addEventListener("click", ()=> tableToCSV());

    // modal close handlers
    document.getElementById("modal-report-close").addEventListener("click", ()=> document.getElementById("modal-report").classList.remove("show"));
    document.getElementById("modal-close-2").addEventListener("click", ()=> document.getElementById("modal-report").classList.remove("show"));

    // btn-mark-seen
    document.getElementById("btn-mark-seen").addEventListener("click", function(){
        const id = this.dataset.report;
        toggleMarkSeen(id);
    });

    // export report
    document.getElementById("btn-export-report").addEventListener("click", function(){
        // obtener report actual (por botón mark-seen dataset)
        const id = document.getElementById("btn-mark-seen").dataset.report;
        const report = REPORTS_BY_ID[id];
        exportReportToCSV(report);
    });

    // lightbox controls
    document.getElementById("lightbox-close").addEventListener("click", closeLightbox);
    document.getElementById("lightbox-prev").addEventListener("click", prevLightbox);
    document.getElementById("lightbox-next").addEventListener("click", nextLightbox);
    document.getElementById("lightbox-download").addEventListener("click", downloadCurrentLightboxImage);

    // click outside modal to close (report modal)
    document.getElementById("modal-report").addEventListener("click", function(e){
        if(e.target === this) this.classList.remove("show");
    });

    // close employee modal (existing)
    document.addEventListener("click", (e)=>{
        if(e.target.matches("#modal-close") || e.target.matches("#modal-close-2")){
            document.getElementById("modal-employee").classList.remove("show");
        }
    });
});
