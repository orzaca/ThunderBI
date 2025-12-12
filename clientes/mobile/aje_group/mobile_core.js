// mobile_core.js
// Depende de: config.js
// Este archivo centraliza las llamadas a la API de Vision Mobile
// y entrega datos ya "limpios" para todos los dashboards.

// ============================================================
// TOKEN
// ============================================================

let TOKEN_MOBILE = null;

async function getTokenMobile() {
    if (TOKEN_MOBILE) return TOKEN_MOBILE;

    const r = await fetch(CONFIG.apiUrl + "auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            username: CONFIG.username,
            password: CONFIG.password
        })
    });

    if (!r.ok) {
        console.error("Error obteniendo token (mobile_core)", r.status, await r.text());
        return null;
    }

    const json = await r.json();
    TOKEN_MOBILE = json?.auth?.token || null;
    return TOKEN_MOBILE;
}

// ============================================================
// HELPERS DE FECHAS
// ============================================================

function hoyYYYYMMDD() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function fechaTrackTikDesde(fechaYMD) {
    // Inicio del día (zona -05 fija)
    return `${fechaYMD}T00:00:00-05:00`;
}

function fechaTrackTikHasta(fechaYMD) {
    // Fin del día (zona -05 fija)
    return `${fechaYMD}T23:59:59-05:00`;
}

// ============================================================
// CAMPOS POR TEMPLATE
// ============================================================

// INICIO – template 152004
const CAMPOS_INICIO = {
    sitioInicio:   152005, // SITIO DE INICIO
    ciudadOrigen:  152006, // Ciudad inicio
    ciudadDestino: 152007, // Ciudad destino
    tipoServicio:  152635, // Tipo de servicio
    fotoInicio:    152009  // Foto (no lo usamos acá, pero lo dejamos)
};

// LLEGADA ESCOLTA – template 89591
const CAMPOS_LLEGADA = {
    rutaAsignada:  143650, // Ruta Asignada:
    observaciones: 143063  // Observaciones:
};

// EMPALME – template 89596
const CAMPOS_EMPALME = {
    ruta:          143609, // RUTAS:
    placa:         143652, // PLACA DEL VEHICULO EMPALMADO
    numeroServicio:144545, // Numero de Servicio:
    precinto:      143661  // PRECINTO (Si Aplica)
};

// DESEMPALME – template 89603
const CAMPOS_DESEMPALME = {
    ruta:      89607,  // RUTA (Escribe la Ruta Asignada)
    placa:     89608,  // PLACA VEHICULO DE CARGA
    sitio:     89609,  // SITIO DE DESEMPALME
    precinto:  143662, // PRECINTO:
    conductor: 89611   // NOMBRE CONDUCTOR VEHÍCULO DE CARGA
};

// FIN – template 152079
const CAMPOS_FIN = {
    sitioFinal:  152080, // SITIO DE FINALIZACION
    ciudadFinal: 152081  // Ciudad donde finaliza el servicio
};

// ============================================================
// FORMATEO DE HORA
// ============================================================

function formatearHora24(fechaISO) {
    if (!fechaISO) return "-";
    const d = new Date(fechaISO);
    if (isNaN(d)) return "-";
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
}

// ============================================================
// LECTOR GENERICO DE CAMPOS (POR ID)
// ============================================================

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

    // 1) valor estándar
    let v = f.value;
    if (v && typeof v === "object" && "value" in v) v = v.value;
    if (v !== undefined && v !== null && v !== "") return v;

    // 2) response
    let r = f.response;
    if (r && typeof r === "object" && "value" in r) r = r.value;
    if (r !== undefined && r !== null && r !== "") return r;

    // 3) cualquier propiedad "value"
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

// ============================================================
// FETCH GENERAL DE REPORTES (METADATA)
// ============================================================

async function getReportsPageRango(token, offset, desdeISO, hastaISO) {
    // Solo estos templates
    const ids = [
        CONFIG.templates.inicio,
        CONFIG.templates.llegada,
        CONFIG.templates.empalme,
        CONFIG.templates.desempalme,
        CONFIG.templates.fin
    ].join(",");

    // 🔹 NUEVO: filtrar solo las cuentas que están en CONFIG.clientes
    let accountIds = "";
    if (CONFIG.clientes) {
        const valores = Object.values(CONFIG.clientes)
            .filter(x => x != null)
            .map(x => String(x));
        if (valores.length) {
            accountIds = valores.join(",");
        }
    }

    const filtros = {
        limit: 100,
        offset,
        "reportTemplate.id:in": ids,
        "reportDateTime:after":  desdeISO,
        "reportDateTime:before": hastaISO,
        include: "account,reportTemplate,createdBy" // sin reportFields aún
    };

    // 🔹 Agregamos account.id:in solo si hay IDs configurados
    if (accountIds) {
        filtros["account.id:in"] = accountIds;
    }

    const url = `${CONFIG.apiUrl}reports?${new URLSearchParams(filtros).toString()}`;

    const r = await fetch(url, {
        headers: { "Authorization": `Bearer ${token}` }
    });

    if (!r.ok) {
        console.error("Error trayendo página de reportes (mobile_core)", r.status, await r.text());
        return [];
    }

    const json = await r.json();
    return json?.data ?? [];
}

async function getAllReportsMetaRango(desdeISO, hastaISO) {
    const token = await getTokenMobile();
    if (!token) return [];

    let offset = 0;
    let total = [];

    while (true) {
        const page = await getReportsPageRango(token, offset, desdeISO, hastaISO);
        if (!page.length) break;
        total = total.concat(page);
        if (page.length < 100) break;
        offset += 100;
    }

    if (total.length) {
        console.log("Ejemplo de reporte (solo metadata, rango):", total[0]);
    }

    return total;
}

// ============================================================
// DETALLE /reports/{id}?include=reportFields
// ============================================================

async function getDetallesReportes(metaArray) {
    const token = await getTokenMobile();
    if (!token) return [];

    const resultados = [];
    const MAX_CONCURRENT = 8; // 🔹 número de peticiones simultáneas

    for (let i = 0; i < metaArray.length; i += MAX_CONCURRENT) {
        const slice = metaArray.slice(i, i + MAX_CONCURRENT);

        const promesas = slice.map(meta => (async () => {
            const reportId = meta.id || meta.uuid;
            if (!reportId) return null;

            const url = `${CONFIG.apiUrl}reports/${reportId}?include=reportFields`;

            try {
                const r = await fetch(url, {
                    headers: { "Authorization": `Bearer ${token}` }
                });

                if (!r.ok) {
                    console.error("Error detalle reporte", reportId, r.status, await r.text());
                    return null;
                }

                const json = await r.json();
                const rep = json.data || json;

                return {
                    meta,
                    reportFields: rep.reportFields || []
                };

            } catch (e) {
                console.error("Excepción detalle reporte", reportId, e);
                return null;
            }
        })());

        const batchResults = await Promise.all(promesas);
        batchResults
            .filter(x => x !== null)
            .forEach(x => resultados.push(x));
    }

    if (resultados.length) {
        console.log("Ejemplo detalle (rango, mobile_core):", resultados[0]);
    }

    return resultados;
}

// ============================================================
// EXTRACTORES POR TIPO DE REPORTE
// ============================================================

function extraerBase(meta) {
    return {
        fechaHora: meta.reportDateTime,
        hora: formatearHora24(meta.reportDateTime),
        clienteId: meta.account ? meta.account.id : null,
        cliente:   meta.account ? meta.account.name : "",
        empleado: meta.createdBy
            ? `${meta.createdBy.firstName} ${meta.createdBy.lastName}`.trim()
            : ""
    };
}

function extraerInicio(meta, fields) {
    const base = extraerBase(meta);
    const sitioInicio   = getValorCampoPorId(fields, CAMPOS_INICIO.sitioInicio);
    const ciudadOrigen  = getValorCampoPorId(fields, CAMPOS_INICIO.ciudadOrigen);
    const ciudadDestino = getValorCampoPorId(fields, CAMPOS_INICIO.ciudadDestino);
    const tipoServicio  = getValorCampoPorId(fields, CAMPOS_INICIO.tipoServicio);

    return {
        ...base,
        sitioInicio,
        ciudadOrigen,
        ciudadDestino,
        tipoServicio
    };
}

function extraerLlegada(meta, fields) {
    const base = extraerBase(meta);
    const rutaAsignada  = getValorCampoPorId(fields, CAMPOS_LLEGADA.rutaAsignada);
    const observaciones = getValorCampoPorId(fields, CAMPOS_LLEGADA.observaciones);

    return {
        ...base,
        rutaAsignada,
        observaciones
    };
}

function extraerEmpalme(meta, fields) {
    const base = extraerBase(meta);
    const ruta           = getValorCampoPorId(fields, CAMPOS_EMPALME.ruta);
    const placa          = getValorCampoPorId(fields, CAMPOS_EMPALME.placa);
    const numeroServicio = getValorCampoPorId(fields, CAMPOS_EMPALME.numeroServicio);
    const precinto       = getValorCampoPorId(fields, CAMPOS_EMPALME.precinto);

    return {
        ...base,
        ruta,
        placa,
        numeroServicio,
        precinto
    };
}

function extraerDesempalme(meta, fields) {
    const base = extraerBase(meta);
    const ruta      = getValorCampoPorId(fields, CAMPOS_DESEMPALME.ruta);
    const placa     = getValorCampoPorId(fields, CAMPOS_DESEMPALME.placa);
    const sitio     = getValorCampoPorId(fields, CAMPOS_DESEMPALME.sitio);
    const precinto  = getValorCampoPorId(fields, CAMPOS_DESEMPALME.precinto);
    const conductor = getValorCampoPorId(fields, CAMPOS_DESEMPALME.conductor);

    return {
        ...base,
        ruta,
        placa,
        sitio,
        precinto,
        conductor
    };
}

function extraerFin(meta, fields) {
    const base = extraerBase(meta);
    const sitioFinal  = getValorCampoPorId(fields, CAMPOS_FIN.sitioFinal);
    const ciudadFinal = getValorCampoPorId(fields, CAMPOS_FIN.ciudadFinal);

    return {
        ...base,
        sitioFinal,
        ciudadFinal
    };
}

// ============================================================
// FUNCIÓN PRINCIPAL: CARGAR DATOS POR RANGO
// fechaDesde / fechaHasta en formato "YYYY-MM-DD"
// ============================================================

async function cargarDatosMobileRango(fechaDesde, fechaHasta) {
    const desdeISO = fechaTrackTikDesde(fechaDesde);
    const hastaISO = fechaTrackTikHasta(fechaHasta);

    // 1) Traer metadata de todos los reportes de ese rango
    const metaTodos = await getAllReportsMetaRango(desdeISO, hastaISO);

    if (!metaTodos.length) {
        console.warn("No hay reportes en el rango seleccionado:", fechaDesde, fechaHasta);
        return {
            inicios: [],
            llegadas: [],
            empalmes: [],
            desempalmes: [],
            fines: []
        };
    }

    const idInicio     = CONFIG.templates.inicio;
    const idLlegada    = CONFIG.templates.llegada;
    const idEmpalme    = CONFIG.templates.empalme;
    const idDesempalme = CONFIG.templates.desempalme;
    const idFin        = CONFIG.templates.fin;

    // 2) Separar meta por tipo de template
    const metaInicios = metaTodos.filter(r => r.reportTemplate && r.reportTemplate.id === idInicio);
    const metaLlegadas = metaTodos.filter(r => r.reportTemplate && r.reportTemplate.id === idLlegada);
    const metaEmpalmes = metaTodos.filter(r => r.reportTemplate && r.reportTemplate.id === idEmpalme);
    const metaDesempalmes = metaTodos.filter(r => r.reportTemplate && r.reportTemplate.id === idDesempalme);
    const metaFines = metaTodos.filter(r => r.reportTemplate && r.reportTemplate.id === idFin);

    // 3) Traer DETALLE con reportFields para cada grupo
    const [detInicios, detLlegadas, detEmpalmes, detDesempalmes, detFines] = await Promise.all([
        getDetallesReportes(metaInicios),
        getDetallesReportes(metaLlegadas),
        getDetallesReportes(metaEmpalmes),
        getDetallesReportes(metaDesempalmes),
        getDetallesReportes(metaFines)
    ]);

    // 4) Convertir a estructuras uniformes
    const inicios = detInicios.map(x => extraerInicio(x.meta, x.reportFields));
    const llegadas = detLlegadas.map(x => extraerLlegada(x.meta, x.reportFields));
    const empalmes = detEmpalmes.map(x => extraerEmpalme(x.meta, x.reportFields));
    const desempalmes = detDesempalmes.map(x => extraerDesempalme(x.meta, x.reportFields));
    const fines = detFines.map(x => extraerFin(x.meta, x.reportFields));

    const resultado = {
        inicios,
        llegadas,
        empalmes,
        desempalmes,
        fines
    };

    console.log("DATOS_GLOBALES (rango):", resultado);
    return resultado;
}

// ============================================================
// COMPATIBILIDAD: VERSIÓN "HOY"
// ============================================================

async function cargarDatosMobileHoy() {
    const hoy = hoyYYYYMMDD();
    return cargarDatosMobileRango(hoy, hoy);
}
