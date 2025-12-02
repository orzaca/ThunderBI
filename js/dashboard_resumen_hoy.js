// js/dashboard_resumen_hoy.js

let chartEmbudo = null;
let chartClientes = null;

/* ============================================================
   UTIL – FECHA BONITA
============================================================ */

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

function mostrarLoaderGlobal(mostrar) {
    const el = document.getElementById("loader-global");
    if (!el) return;
    if (mostrar) el.classList.remove("oculto");
    else el.classList.add("oculto");
}

/* ============================================================
   KPIs
============================================================ */

function actualizarKPIs(datos) {
    document.getElementById("kpi-inicios").textContent      = datos.inicios.length;
    document.getElementById("kpi-llegadas").textContent     = datos.llegadas.length;
    document.getElementById("kpi-empalmes").textContent     = datos.empalmes.length;
    document.getElementById("kpi-desempalmes").textContent  = datos.desempalmes.length;
    document.getElementById("kpi-fines").textContent        = datos.fines.length;
}

/* ============================================================
   TABLAS
============================================================ */

function pintarTablaGenerica(tbodyId, lista, columnas) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!lista.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = columnas.length;
        td.textContent = "No hay registros para hoy.";
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

function pintarTablas(datos) {
    pintarTablaGenerica("tbody-inicio", datos.inicios, [
        "hora",
        "cliente",
        "empleado",
        "sitioInicio",
        "ciudadOrigen",
        "ciudadDestino",
        "tipoServicio"
    ]);

    pintarTablaGenerica("tbody-llegada", datos.llegadas, [
        "hora",
        "cliente",
        "empleado",
        "rutaAsignada",
        "observaciones"
    ]);

    pintarTablaGenerica("tbody-empalme", datos.empalmes, [
        "hora",
        "cliente",
        "empleado",
        "ruta",
        "placa",
        "numeroServicio",
        "precinto"
    ]);

    pintarTablaGenerica("tbody-desempalme", datos.desempalmes, [
        "hora",
        "cliente",
        "empleado",
        "ruta",
        "placa",
        "sitio",
        "precinto",
        "conductor"
    ]);

    pintarTablaGenerica("tbody-fin", datos.fines, [
        "hora",
        "cliente",
        "empleado",
        "sitioFinal",
        "ciudadFinal"
    ]);
}

/* ============================================================
   GRÁFICOS
============================================================ */

function crearGraficoEmbudo(datos) {
    const ctx = document.getElementById("chartEmbudo");
    if (!ctx) return;

    const labels = ["Inicio", "Llegada", "Empalme", "Desempalme", "Fin"];
    const valores = [
        datos.inicios.length,
        datos.llegadas.length,
        datos.empalmes.length,
        datos.desempalmes.length,
        datos.fines.length
    ];

    if (chartEmbudo) chartEmbudo.destroy();

    chartEmbudo = new Chart(ctx, {
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

function crearGraficoClientes(datos) {
    const ctx = document.getElementById("chartClientes");
    if (!ctx) return;

    // Mapa cliente -> { inicio, llegada, empalme, desempalme, fin }
    const mapa = {};

    function acumular(lista, campo) {
        lista.forEach(item => {
            const cliente = item.cliente || "SIN CLIENTE";
            if (!mapa[cliente]) {
                mapa[cliente] = {
                    inicio: 0,
                    llegada: 0,
                    empalme: 0,
                    desempalme: 0,
                    fin: 0
                };
            }
            mapa[cliente][campo]++;
        });
    }

    acumular(datos.inicios,      "inicio");
    acumular(datos.llegadas,     "llegada");
    acumular(datos.empalmes,     "empalme");
    acumular(datos.desempalmes,  "desempalme");
    acumular(datos.fines,        "fin");

    const labels = Object.keys(mapa).sort();

    if (!labels.length) {
        if (chartClientes) chartClientes.destroy();
        return;
    }

    const dataInicio     = labels.map(c => mapa[c].inicio);
    const dataLlegada    = labels.map(c => mapa[c].llegada);
    const dataEmpalme    = labels.map(c => mapa[c].empalme);
    const dataDesempalme = labels.map(c => mapa[c].desempalme);
    const dataFin        = labels.map(c => mapa[c].fin);

    if (chartClientes) chartClientes.destroy();

    chartClientes = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [
                { label: "Inicio",       data: dataInicio },
                { label: "Llegada",      data: dataLlegada },
                { label: "Empalme",      data: dataEmpalme },
                { label: "Desempalme",   data: dataDesempalme },
                { label: "Fin",          data: dataFin }
            ]
        },
        options: {
            responsive: true,
            interaction: {
                mode: "index",
                intersect: false
            },
            scales: {
                x: {
                    stacked: true
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                }
            }
        }
    });
}

/* ============================================================
   HEATMAP RUTAS (Ciudad inicio → Ciudad destino)
============================================================ */

function construirMapaCalorRutas(datos) {
    const tabla = document.getElementById("tabla-heatmap-rutas");
    if (!tabla) return;

    const inicios = datos.inicios || [];

    // 1) Sacar ciudades origen/destino válidas
    const ciudadesSet = new Set();

    inicios.forEach(item => {
        let orig = item.ciudadOrigen || "";
        let dest = item.ciudadDestino || "";

        orig = String(orig).trim();
        dest = String(dest).trim();

        if (!orig || !dest) return;

        // Normalizamos un poco (mayúsculas)
        orig = orig.toUpperCase();
        dest = dest.toUpperCase();

        ciudadesSet.add(orig);
        ciudadesSet.add(dest);
    });

    const ciudades = Array.from(ciudadesSet).sort();

    // Si no hay ciudades suficientes, limpiamos tabla y salimos
    if (ciudades.length === 0) {
        tabla.innerHTML = "<thead><tr><th>No hay datos para construir el mapa de calor.</th></tr></thead>";
        return;
    }

    // 2) Construir matriz origen-destino
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

    // 3) Obtener máximo para escalar color
    let maxValor = 0;
    ciudades.forEach(o => {
        ciudades.forEach(d => {
            const v = matriz[o][d];
            if (v > maxValor) maxValor = v;
        });
    });

    // 4) Construir tabla HTML
    tabla.innerHTML = "";

    const thead = document.createElement("thead");
    const trHeader = document.createElement("tr");

    // Celda esquina superior izquierda
    const thCorner = document.createElement("th");
    thCorner.classList.add("heatmap-header-corner");
    thCorner.textContent = "ORIGEN \\ DESTINO";
    trHeader.appendChild(thCorner);

    // Encabezados de columnas (destinos)
    ciudades.forEach(ciudad => {
        const th = document.createElement("th");
        th.textContent = ciudad;
        trHeader.appendChild(th);
    });

    thead.appendChild(trHeader);
    tabla.appendChild(thead);

    const tbody = document.createElement("tbody");

    // Filas por cada ciudad de origen
    ciudades.forEach(origen => {
        const tr = document.createElement("tr");

        // Encabezado de fila (origen)
        const thOrigen = document.createElement("th");
        thOrigen.classList.add("heatmap-header-vertical");
        thOrigen.textContent = origen;
        tr.appendChild(thOrigen);

        // Celdas para cada destino
        ciudades.forEach(destino => {
            const td = document.createElement("td");
            td.classList.add("heatmap-cell");

            const valor = matriz[origen][destino] || 0;
            td.textContent = valor > 0 ? valor : "";

            // Cálculo de intensidad 0..1
            let intensidad = 0;
            if (maxValor > 0) {
                intensidad = valor / maxValor; // 0 a 1
            }

            // Color base: turquesa azulado con alpha variable
            const alphaBase = 0.12;
            const alphaMax  = 0.9;
            const alpha = valor === 0 ? 0 : alphaBase + (alphaMax - alphaBase) * intensidad;

            if (valor === 0) {
                // fondo casi neutro para celdas sin tráfico
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
   TABS
============================================================ */

function inicializarTabs() {
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
   INICIO
============================================================ */

document.addEventListener("DOMContentLoaded", async () => {
    const sub = document.getElementById("subtitulo-dia");
    if (sub) {
        sub.textContent = "Datos de hoy – " + textoFechaBonitaHoy();
    }

    inicializarTabs();

    try {
        mostrarLoaderGlobal(true);

        const datos = await cargarDatosMobileHoy(); // viene de mobile_core.js

        actualizarKPIs(datos);
        pintarTablas(datos);
        crearGraficoEmbudo(datos);
        crearGraficoClientes(datos);
        construirMapaCalorRutas(datos);   // 👈 Heatmap de ciudades

    } catch (e) {
        console.error("Error cargando dashboard resumen hoy:", e);
    } finally {
        mostrarLoaderGlobal(false);
    }
});
