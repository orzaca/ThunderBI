// dashboard_cliente_hoy.js
// Depende de: config.js, mobile_core.js y Chart.js
// Estructura esperada de DATOS_GLOBALES (ejemplo):
// {
//   inicios:      [ { fechaHora, hora, clienteId, empleado, sitioInicio, ciudadOrigen, ciudadDestino, tipoServicio, ... } ],
//   llegadas:     [ { fechaHora, hora, clienteId, empleado, rutaAsignada, observaciones, ... } ],
//   empalmes:     [ { fechaHora, hora, clienteId, empleado, ruta, placa, numeroServicio, precinto, ... } ],
//   desempalmes:  [ { fechaHora, hora, clienteId, empleado, ruta, placa, sitio, precinto, conductor, ... } ],
//   fines:        [ { fechaHora, hora, clienteId, empleado, sitioFinal, ciudadFinal, ... } ]
// }

let DATOS_GLOBALES = null;
let chartEmbudoCliente = null;
let chartRutasCliente = null;
let RESUMEN_EMPLEADOS_ACTUAL = [];

/* ============================================================
   HELPERS DE FECHA (ISO yyyy-mm-dd)
============================================================ */

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

function textoFechaBonitaHoyCliente() {
    const now = new Date();
    const opciones = {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    };
    return now.toLocaleDateString("es-CO", opciones);
}
function fechaCortaYYYYMMDD(fechaISO) {
    if (!fechaISO) return "";
    const s = String(fechaISO);
    if (s.length >= 10) return s.substring(0, 10);
    return s;
}


/* ============================================================
   LOADER
============================================================ */

function mostrarLoaderCliente(mostrar) {
    const el = document.getElementById("loader-global-cliente");
    if (!el) return;
    if (mostrar) el.classList.remove("oculto");
    else el.classList.add("oculto");
}

/* ============================================================
   SELECTOR CLIENTE
============================================================ */
function poblarSelectClientes() {
    const select = document.getElementById("select-cliente");
    if (!select || !CONFIG.clientes) return;

    // 🔹 Ahora tiene opción "TODOS"
    select.innerHTML = `
        <option value="">Seleccione un cliente…</option>
        <option value="ALL">TODOS</option>
    `;

    Object.entries(CONFIG.clientes)
        .sort((a, b) => a[0].localeCompare(b[0], "es"))
        .forEach(([nombre, id]) => {
            const opt = document.createElement("option");
            opt.value = String(id);
            opt.textContent = nombre;
            select.appendChild(opt);
        });
}


/* ============================================================
   FILTRAR DATOS POR CLIENTE
============================================================ */

function filtrarDatosPorCliente(datosGlobales, clienteId) {
    // 🔹 Si no hay cliente o es "ALL", retornamos TODO sin filtrar
    if (!clienteId || clienteId === "ALL") {
        return {
            inicios:      datosGlobales.inicios      || [],
            llegadas:     datosGlobales.llegadas     || [],
            empalmes:     datosGlobales.empalmes     || [],
            desempalmes:  datosGlobales.desempalmes  || [],
            fines:        datosGlobales.fines        || []
        };
    }

    const idStr = String(clienteId);

    function filtrar(lista) {
        return (lista || []).filter(x => x.clienteId != null && String(x.clienteId) === idStr);
    }

    return {
        inicios:      filtrar(datosGlobales.inicios),
        llegadas:     filtrar(datosGlobales.llegadas),
        empalmes:     filtrar(datosGlobales.empalmes),
        desempalmes:  filtrar(datosGlobales.desempalmes),
        fines:        filtrar(datosGlobales.fines)
    };
}


/* ============================================================
   CARGA DE DATOS POR RANGO DE FECHAS
   Usa cargarDatosMobileRango(fechaDesde, fechaHasta) si existe,
   si no, cae como fallback en cargarDatosMobileHoy()
============================================================ */

async function recargarDatosPorRangoFechas() {
    const inputDesde    = document.getElementById("fecha-desde");
    const inputHasta    = document.getElementById("fecha-hasta");
    const selectCliente = document.getElementById("select-cliente");

    if (!inputDesde || !inputHasta) return;

    let desde = inputDesde.value;
    let hasta = inputHasta.value;

    // Si faltan fechas, asumimos hoy
    if (!desde && !hasta) {
        desde = hoyYYYYMMDD();
        hasta = hoyYYYYMMDD();
        inputDesde.value = desde;
        inputHasta.value = hasta;
    } else if (!desde && hasta) {
        desde = hasta;
        inputDesde.value = desde;
    } else if (desde && !hasta) {
        hasta = desde;
        inputHasta.value = hasta;
    }

    try {
        mostrarLoaderCliente(true);

        // Si existe función por rango, la usamos
        if (typeof cargarDatosMobileRango === "function") {
            DATOS_GLOBALES = await cargarDatosMobileRango(desde, hasta);
        } else if (typeof cargarDatosMobileHoy === "function") {
            // Fallback: mantener compatibilidad con la versión actual
            console.warn("⚠ No existe cargarDatosMobileRango(fechaDesde, fechaHasta). Usando cargarDatosMobileHoy() como fallback.");
            DATOS_GLOBALES = await cargarDatosMobileHoy();
        } else {
            console.error("No se encontró función para cargar datos (mobile_core.js).");
            return;
        }

        const clienteIdActual = selectCliente ? selectCliente.value : "";

        if (clienteIdActual) {
            refrescarDashboardCliente(clienteIdActual);
        } else {
            refrescarDashboardCliente("");
        }

    } catch (e) {
        console.error("Error recargando datos por rango de fechas:", e);
    } finally {
        mostrarLoaderCliente(false);
    }
}

/* ============================================================
   KPIs
============================================================ */

function actualizarKPIsCliente(datos) {
    document.getElementById("kpi-inicios-cliente").textContent      = datos.inicios.length;
    document.getElementById("kpi-llegadas-cliente").textContent     = datos.llegadas.length;
    document.getElementById("kpi-empalmes-cliente").textContent     = datos.empalmes.length;
    document.getElementById("kpi-desempalmes-cliente").textContent  = datos.desempalmes.length;
    document.getElementById("kpi-fines-cliente").textContent        = datos.fines.length;
}

/* ============================================================
   TABLAS POR ETAPA
============================================================ */

function pintarTablaGenericaCliente(tbodyId, lista, columnas) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!lista.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = columnas.length;
        td.textContent = "No hay registros para este cliente hoy.";
        td.style.textAlign = "center";
        td.style.padding = "16px";
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }

    lista
        .slice()
        .sort((a, b) => a.fechaHora.localeCompare(b.fechaHora))
        .forEach(item => {
            const tr = document.createElement("tr");
            tr.innerHTML = columnas
                .map(campo => `<td>${(item[campo] ?? "-")}</td>`)
                .join("");
            tbody.appendChild(tr);
        });
}

function pintarTablasCliente(datos) {
    // INICIO
    pintarTablaGenericaCliente("tbody-inicio-cliente", datos.inicios, [
        "hora",
        "empleado",
        "sitioInicio",
        "ciudadOrigen",
        "ciudadDestino",
        "tipoServicio"
    ]);

    // LLEGADA
    pintarTablaGenericaCliente("tbody-llegada-cliente", datos.llegadas, [
        "hora",
        "empleado",
        "rutaAsignada",
        "observaciones"
    ]);

    // EMPALME
    pintarTablaGenericaCliente("tbody-empalme-cliente", datos.empalmes, [
        "hora",
        "empleado",
        "ruta",
        "placa",
        "numeroServicio",
        "precinto"
    ]);

    // DESEMPALME
    pintarTablaGenericaCliente("tbody-desempalme-cliente", datos.desempalmes, [
        "hora",
        "empleado",
        "ruta",
        "placa",
        "sitio",
        "precinto",
        "conductor"
    ]);

    // FIN
    pintarTablaGenericaCliente("tbody-fin-cliente", datos.fines, [
        "hora",
        "empleado",
        "sitioFinal",
        "ciudadFinal"
    ]);
}

/* ============================================================
   GRÁFICOS CLIENTE
============================================================ */

function crearGraficoEmbudoCliente(datos) {
    const ctx = document.getElementById("chartEmbudoCliente");
    if (!ctx) return;

    const labels = ["Inicio", "Llegada", "Empalme", "Desempalme", "Fin"];
    const valores = [
        datos.inicios.length,
        datos.llegadas.length,
        datos.empalmes.length,
        datos.desempalmes.length,
        datos.fines.length
    ];

    if (chartEmbudoCliente) chartEmbudoCliente.destroy();

    chartEmbudoCliente = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Cantidad de reportes",
                data: valores
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

function crearGraficoRutasCliente(datos) {
    const ctx = document.getElementById("chartRutasCliente");
    if (!ctx) return;

    const inicios = datos.inicios || [];
    const conteoRutas = {};

    // Construimos "RUTA = Origen → Destino"
    inicios.forEach(item => {
        let orig = item.ciudadOrigen || "";
        let dest = item.ciudadDestino || "";

        orig = String(orig).trim();
        dest = String(dest).trim();

        if (!orig || !dest) return;

        const ruta = `${orig} → ${dest}`;
        conteoRutas[ruta] = (conteoRutas[ruta] || 0) + 1;
    });

    // Ordenar de mayor a menor y tomar TOP 10
    const rutasOrdenadas = Object.entries(conteoRutas)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    const labels  = rutasOrdenadas.map(x => x[0]);
    const valores = rutasOrdenadas.map(x => x[1]);

    if (chartRutasCliente) {
        chartRutasCliente.destroy();
        chartRutasCliente = null;
    }
    if (!labels.length) {
        return;
    }

    const colores = [
        "#38bdf8", "#22c55e", "#f97316", "#eab308", "#a855f7",
        "#ec4899", "#0ea5e9", "#10b981", "#facc15", "#fb7185"
    ];

    chartRutasCliente = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels,
            datasets: [{
                label: "Cantidad de servicios",
                data: valores,
                backgroundColor: labels.map((_, i) => colores[i % colores.length]),
                borderWidth: 1,
                borderColor: "#020617"
            }]
        },
        options: {
            responsive: true,
            cutout: "60%",
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        boxWidth: 12,
                        font: { size: 11 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || "";
                            const value = context.raw || 0;
                            return `${label}: ${value} servicio${value === 1 ? "" : "s"}`;
                        }
                    }
                }
            }
        }
    });
}

/* ============================================================
   HEATMAP RUTAS CLIENTE (Ciudad inicio → Ciudad destino)
============================================================ */

function construirMapaCalorRutasCliente(datos) {
    const tabla = document.getElementById("tabla-heatmap-cliente");
    if (!tabla) return;

    const inicios = datos.inicios || [];
    const ciudadesSet = new Set();

    inicios.forEach(item => {
        let orig = item.ciudadOrigen || "";
        let dest = item.ciudadDestino || "";

        orig = String(orig).trim();
        dest = String(dest).trim();

        if (!orig || !dest) return;

        orig = orig.toUpperCase();
        dest = dest.toUpperCase();

        ciudadesSet.add(orig);
        ciudadesSet.add(dest);
    });

    const ciudades = Array.from(ciudadesSet).sort();

    if (ciudades.length === 0) {
        tabla.innerHTML = "<thead><tr><th>No hay datos para construir el mapa de calor de este cliente.</th></tr></thead>";
        return;
    }

    const matriz = {};
    ciudades.forEach(o => {
        matriz[o] = {};
        ciudades.forEach(d => {
            matriz[o][d] = 0;
        });
    });

    inicios.forEach(item => {
        let orig = item.ciudadOrigen || "";
        let dest = item.ciudadDestino || "";

        orig = String(orig).trim().toUpperCase();
        dest = String(dest).trim().toUpperCase();

        if (!orig || !dest) return;
        if (!matriz[orig] || matriz[orig][dest] === undefined) return;

        matriz[orig][dest]++;
    });

    let maxValor = 0;
    ciudades.forEach(o => {
        ciudades.forEach(d => {
            const v = matriz[o][d];
            if (v > maxValor) maxValor = v;
        });
    });

    tabla.innerHTML = "";

    const thead = document.createElement("thead");
    const trHeader = document.createElement("tr");

    const thCorner = document.createElement("th");
    thCorner.classList.add("heatmap-header-corner");
    thCorner.textContent = "ORIGEN \\ DESTINO";
    trHeader.appendChild(thCorner);

    ciudades.forEach(ciudad => {
        const th = document.createElement("th");
        th.textContent = ciudad;
        trHeader.appendChild(th);
    });

    thead.appendChild(trHeader);
    tabla.appendChild(thead);

    const tbody = document.createElement("tbody");

    ciudades.forEach(origen => {
        const tr = document.createElement("tr");

        const thOrigen = document.createElement("th");
        thOrigen.classList.add("heatmap-header-vertical");
        thOrigen.textContent = origen;
        tr.appendChild(thOrigen);

        ciudades.forEach(destino => {
            const td = document.createElement("td");
            td.classList.add("heatmap-cell");

            const valor = matriz[origen][destino] || 0;
            td.textContent = valor > 0 ? valor : "";

            let intensidad = 0;
            if (maxValor > 0) {
                intensidad = valor / maxValor;
            }

            const alphaBase = 0.12;
            const alphaMax  = 0.9;
            const alpha = valor === 0 ? 0 : alphaBase + (alphaMax - alphaBase) * intensidad;

            if (valor === 0) {
                td.style.backgroundColor = "rgba(15, 23, 42, 0.85)";
                td.style.color = "#6b7280";
            } else {
                td.style.backgroundColor = `rgba(56, 189, 248, ${alpha})`;
                td.style.color = "#0b1120";
            }

            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });

    tabla.appendChild(tbody);
}

/* ============================================================
   RESUMEN POR EMPLEADO (CLIENTE)
============================================================ */

function construirResumenEmpleadosCliente(datos) {
    const mapa = {};

    function asegurarEmpleado(nombre) {
        if (!nombre) return null;
        if (!mapa[nombre]) {
            mapa[nombre] = {
                fecha: null,
                empleado: nombre,
                cliente: null,
                horaInicio: null,
                horaLlegada: null,
                horaEmpalme: null,
                horaDesempalme: null,
                horaFin: null,
                ciudadInicio: null,
                ciudadDestino: null,
                ciudadFinal: null,
                rutaEmpalme: null,
                placaEmpalme: null,
                rutaDesempalme: null,
                placaDesempalme: null
            };
        }
        return mapa[nombre];
    }

    const inicios     = (datos.inicios || []).slice().sort((a, b) => a.fechaHora.localeCompare(b.fechaHora));
    const llegadas    = (datos.llegadas || []).slice().sort((a, b) => a.fechaHora.localeCompare(b.fechaHora));
    const empalmes    = (datos.empalmes || []).slice().sort((a, b) => a.fechaHora.localeCompare(b.fechaHora));
    const desempalmes = (datos.desempalmes || []).slice().sort((a, b) => a.fechaHora.localeCompare(b.fechaHora));
    const fines       = (datos.fines || []).slice().sort((a, b) => a.fechaHora.localeCompare(b.fechaHora));

    // INICIOS: hora + ciudades + cliente + fecha
    inicios.forEach(item => {
        const emp = item.empleado || "";
        const reg = asegurarEmpleado(emp);
        if (!reg) return;

        if (!reg.cliente && item.cliente) {
            reg.cliente = item.cliente;
        }
        if (!reg.fecha && item.fechaHora) {
            reg.fecha = fechaCortaYYYYMMDD(item.fechaHora);
        }

        if (!reg.horaInicio) {
            reg.horaInicio    = item.hora || null;
            reg.ciudadInicio  = item.ciudadOrigen || null;
            reg.ciudadDestino = item.ciudadDestino || null;
        }
    });

    // LLEGADAS: hora + cliente/fecha si falta
    llegadas.forEach(item => {
        const emp = item.empleado || "";
        const reg = asegurarEmpleado(emp);
        if (!reg) return;

        if (!reg.cliente && item.cliente) {
            reg.cliente = item.cliente;
        }
        if (!reg.fecha && item.fechaHora) {
            reg.fecha = fechaCortaYYYYMMDD(item.fechaHora);
        }

        if (!reg.horaLlegada) {
            reg.horaLlegada = item.hora || null;
        }
    });

    // EMPALMES: hora + ruta/placa + cliente/fecha si falta
    empalmes.forEach(item => {
        const emp = item.empleado || "";
        const reg = asegurarEmpleado(emp);
        if (!reg) return;

        if (!reg.cliente && item.cliente) {
            reg.cliente = item.cliente;
        }
        if (!reg.fecha && item.fechaHora) {
            reg.fecha = fechaCortaYYYYMMDD(item.fechaHora);
        }

        if (!reg.horaEmpalme) {
            reg.horaEmpalme  = item.hora || null;
            reg.rutaEmpalme  = item.ruta || null;
            reg.placaEmpalme = item.placa || null;
        }
    });

    // DESEMPALMES: hora + ruta/placa + cliente/fecha si falta
    desempalmes.forEach(item => {
        const emp = item.empleado || "";
        const reg = asegurarEmpleado(emp);
        if (!reg) return;

        if (!reg.cliente && item.cliente) {
            reg.cliente = item.cliente;
        }
        if (!reg.fecha && item.fechaHora) {
            reg.fecha = fechaCortaYYYYMMDD(item.fechaHora);
        }

        if (!reg.horaDesempalme) {
            reg.horaDesempalme   = item.hora || null;
            reg.rutaDesempalme   = item.ruta || null;
            reg.placaDesempalme  = item.placa || null;
        }
    });

    // FINALES: hora + ciudad final + cliente/fecha si falta
    fines.forEach(item => {
        const emp = item.empleado || "";
        const reg = asegurarEmpleado(emp);
        if (!reg) return;

        if (!reg.cliente && item.cliente) {
            reg.cliente = item.cliente;
        }
        if (!reg.fecha && item.fechaHora) {
            reg.fecha = fechaCortaYYYYMMDD(item.fechaHora);
        }

        if (!reg.horaFin) {
            reg.horaFin     = item.hora || null;
            reg.ciudadFinal = item.ciudadFinal || null;
        }
    });

    return Object.values(mapa).sort((a, b) =>
        (a.empleado || "").localeCompare(b.empleado || "", "es")
    );
}

function pintarTablaEmpleadosCliente(datos) {
    const tbody = document.getElementById("tbody-empleados-cliente");
    if (!tbody) return;

    const resumen = construirResumenEmpleadosCliente(datos);
    RESUMEN_EMPLEADOS_ACTUAL = resumen; // seguimos guardando para exportar

    tbody.innerHTML = "";

    if (!resumen.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 15; // 🔹 ahora hay 15 columnas
        td.textContent = "No hay empleados con reportes para este cliente en el rango seleccionado.";
        td.style.textAlign = "center";
        td.style.padding = "16px";
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }

    resumen.forEach(r => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${r.fecha || "-"}</td>
            <td>${r.empleado || "-"}</td>
            <td>${r.cliente || "-"}</td>
            <td>${r.horaInicio || "-"}</td>
            <td>${r.horaLlegada || "-"}</td>
            <td>${r.horaEmpalme || "-"}</td>
            <td>${r.horaDesempalme || "-"}</td>
            <td>${r.horaFin || "-"}</td>
            <td>${r.ciudadInicio || "-"}</td>
            <td>${r.ciudadDestino || "-"}</td>
            <td>${r.ciudadFinal || "-"}</td>
            <td>${r.rutaEmpalme || "-"}</td>
            <td>${r.placaEmpalme || "-"}</td>
            <td>${r.rutaDesempalme || "-"}</td>
            <td>${r.placaDesempalme || "-"}</td>
        `;
        tbody.appendChild(tr);
    });
}



/* ============================================================
   EXPORTAR RESUMEN EMPLEADOS – EXCEL (CSV)
============================================================ */

function exportarResumenEmpleadosExcel() {
    if (!RESUMEN_EMPLEADOS_ACTUAL || !RESUMEN_EMPLEADOS_ACTUAL.length) {
        alert("No hay datos de empleados para exportar.");
        return;
    }

    const encabezados = [
        "Fecha",
        "Empleado",
        "Cliente",
        "Hora inicio",
        "Hora llegada",
        "Hora empalme",
        "Hora desempalme",
        "Hora fin",
        "Ciudad inicio",
        "Ciudad destino",
        "Ciudad final",
        "Ruta empalme",
        "Placa empalme",
        "Ruta desempalme",
        "Placa desempalme"
    ];

    const filas = RESUMEN_EMPLEADOS_ACTUAL.map(r => ([
        r.fecha || "",
        r.empleado || "",
        r.cliente || "",
        r.horaInicio || "",
        r.horaLlegada || "",
        r.horaEmpalme || "",
        r.horaDesempalme || "",
        r.horaFin || "",
        r.ciudadInicio || "",
        r.ciudadDestino || "",
        r.ciudadFinal || "",
        r.rutaEmpalme || "",
        r.placaEmpalme || "",
        r.rutaDesempalme || "",
        r.placaDesempalme || ""
    ]));

    // Usamos ; para que Excel en español lo abra mejor
    const todas = [encabezados, ...filas];
    const lineas = todas.map(row => {
        return row.map(val => {
            const v = (val ?? "").toString().replace(/"/g, '""');
            return `"${v}"`;
        }).join(";");
    });

    const csv = lineas.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const fecha = hoyYYYYMMDD();
    a.href = url;
    a.download = `resumen_escoltas_${fecha}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}


/* ============================================================
   EXPORTAR RESUMEN EMPLEADOS – PDF (usando ventana de impresión)
============================================================ */

function exportarResumenEmpleadosPDF() {
    if (!RESUMEN_EMPLEADOS_ACTUAL || !RESUMEN_EMPLEADOS_ACTUAL.length) {
        alert("No hay datos de empleados para exportar.");
        return;
    }

    const encabezados = [
        "Fecha",
        "Empleado",
        "Cliente",
        "Hora inicio",
        "Hora llegada",
        "Hora empalme",
        "Hora desempalme",
        "Hora fin",
        "Ciudad inicio",
        "Ciudad destino",
        "Ciudad final",
        "Ruta empalme",
        "Placa empalme",
        "Ruta desempalme",
        "Placa desempalme"
    ];

    const filasHTML = RESUMEN_EMPLEADOS_ACTUAL.map(r => `
        <tr>
            <td>${r.fecha || ""}</td>
            <td>${r.empleado || ""}</td>
            <td>${r.cliente || ""}</td>
            <td>${r.horaInicio || ""}</td>
            <td>${r.horaLlegada || ""}</td>
            <td>${r.horaEmpalme || ""}</td>
            <td>${r.horaDesempalme || ""}</td>
            <td>${r.horaFin || ""}</td>
            <td>${r.ciudadInicio || ""}</td>
            <td>${r.ciudadDestino || ""}</td>
            <td>${r.ciudadFinal || ""}</td>
            <td>${r.rutaEmpalme || ""}</td>
            <td>${r.placaEmpalme || ""}</td>
            <td>${r.rutaDesempalme || ""}</td>
            <td>${r.placaDesempalme || ""}</td>
        </tr>
    `).join("");



    const win = window.open("", "_blank");
    const fecha = new Date().toLocaleString("es-CO");

    win.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Resumen por escolta</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    font-size: 11px;
                    color: #111827;
                    margin: 16px;
                }
                h3 {
                    margin: 0 0 4px 0;
                }
                p {
                    margin: 0 0 8px 0;
                }
                table {
                    border-collapse: collapse;
                    width: 100%;
                }
                th, td {
                    border: 1px solid #555;
                    padding: 4px 6px;
                    text-align: left;
                    white-space: nowrap;
                }
                th {
                    background: #e5e7eb;
                    font-weight: 600;
                }
            </style>
        </head>
        <body>
            <h3>Resumen por escolta</h3>
            <p>Generado: ${fecha}</p>
            <table>
                <thead>
                    <tr>
                        ${encabezados.map(h => `<th>${h}</th>`).join("")}
                    </tr>
                </thead>
                <tbody>
                    ${filasHTML}
                </tbody>
            </table>
            <script>
                window.onload = function () {
                    window.print();
                };
            </script>
        </body>
        </html>
    `);

    win.document.close();
    win.focus();
}

/* ============================================================
   TABS
============================================================ */

function inicializarTabsCliente() {
    const botones = document.querySelectorAll(".tab-btn");
    const panels = document.querySelectorAll(".tab-panel");

    botones.forEach(btn => {
        btn.addEventListener("click", () => {
            const tab = btn.getAttribute("data-tab");

            botones.forEach(b => b.classList.remove("active"));
            panels.forEach(p => p.classList.remove("active"));

            btn.classList.add("active");
            const panel = document.getElementById(`tab-${tab}`);
            if (panel) panel.classList.add("active");
        });
    });
}

/* ============================================================
   REFRESCAR DASHBOARD PARA UN CLIENTE
============================================================ */

function refrescarDashboardCliente(clienteId) {
    if (!DATOS_GLOBALES) return;

    const datosCliente = filtrarDatosPorCliente(DATOS_GLOBALES, clienteId);

    actualizarKPIsCliente(datosCliente);
    pintarTablasCliente(datosCliente);
    crearGraficoEmbudoCliente(datosCliente);
    crearGraficoRutasCliente(datosCliente);
    construirMapaCalorRutasCliente(datosCliente);
    pintarTablaEmpleadosCliente(datosCliente);
}

/* ============================================================
   INICIO
============================================================ */

document.addEventListener("DOMContentLoaded", async () => {
    const sub = document.getElementById("subtitulo-dia-cliente");
    if (sub) {
        sub.textContent = "Datos – " + textoFechaBonitaHoyCliente();
    }

    inicializarTabsCliente();
    poblarSelectClientes();

    const selectCliente = document.getElementById("select-cliente");
    const inputDesde    = document.getElementById("fecha-desde");
    const inputHasta    = document.getElementById("fecha-hasta");
    const btnAplicar    = document.getElementById("btn-aplicar-fecha");
    const btnRapidos    = document.querySelectorAll(".btn-fecha-simple");
    const btnExportExcel = document.getElementById("btn-exportar-empleados-excel");
    const btnExportPDF   = document.getElementById("btn-exportar-empleados-pdf");


        // Botón Aplicar rango fechas
    if (btnAplicar) {
        btnAplicar.addEventListener("click", () => {
            recargarDatosPorRangoFechas();
        });
    }

    // 🔹 Exportar Excel / PDF
    if (btnExportExcel) {
        btnExportExcel.addEventListener("click", exportarResumenEmpleadosExcel);
    }
    if (btnExportPDF) {
        btnExportPDF.addEventListener("click", exportarResumenEmpleadosPDF);
    }

    // Inicializar fechas a "hoy"
    const hoy = hoyYYYYMMDD();
    if (inputDesde) inputDesde.value = hoy;
    if (inputHasta) inputHasta.value = hoy;

    // Filtros rápidos
    btnRapidos.forEach(btn => {
        btn.addEventListener("click", () => {
            const tipo = btn.getAttribute("data-rango");
            let desde = hoyYYYYMMDD();
            let hasta = hoyYYYYMMDD();

            if (tipo === "hoy") {
                desde = hoy;
                hasta = hoy;
            } else if (tipo === "ayer") {
                desde = ayerYYYYMMDD();
                hasta = ayerYYYYMMDD();
            } else if (tipo === "ult7") {
                hasta = hoy;
                desde = sumarDias(hoy, -6); // hoy + 6 días atrás = 7 días
            }

            if (inputDesde) inputDesde.value = desde;
            if (inputHasta) inputHasta.value = hasta;

            recargarDatosPorRangoFechas();
        });
    });

    // Botón Aplicar
    if (btnAplicar) {
        btnAplicar.addEventListener("click", () => {
            recargarDatosPorRangoFechas();
        });
    }

    // Cambio de cliente
    if (selectCliente) {
        selectCliente.addEventListener("change", () => {
            const val = selectCliente.value || "";
            refrescarDashboardCliente(val);
        });
    }

    // Primera carga: rango por defecto (hoy)
    // Primera carga: rango por defecto (hoy)
try {
    await recargarDatosPorRangoFechas();

    // Si quieres seleccionar por defecto el primer cliente de la lista:
    if (selectCliente && selectCliente.options.length > 1) {
        const firstOption = selectCliente.options[1].value;
        selectCliente.value = firstOption;
        refrescarDashboardCliente(firstOption);
    }

} catch (e) {
    console.error("Error cargando dashboard cliente hoy:", e);
}

});
