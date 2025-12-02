/* ============================================================
   ZIRIUS – Lectura de Programación XLSX (sin PHP)
   Lee Excel en el navegador usando SheetJS
   Convierte horas a formato militar HH:MM
============================================================ */


/* ============================================
   FORMATO MILITAR
   Acepta:
   - números Excel (0.25, 0.75…)
   - "7:00 AM", "6 PM"
   - "13:45", "8:5"
   - fechas completas con hora
============================================ */
function convertirHoraMilitar(valor) {
    if (!valor) return "";

    // Si es número Excel (0.5 = 12:00)
    if (typeof valor === "number") {
        let totalSeg = Math.round(valor * 24 * 3600);
        let hh = Math.floor(totalSeg / 3600);
        let mm = Math.floor((totalSeg % 3600) / 60);
        return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }

    // Si viene como "7:00 AM", "6 PM", etc.
    let d = new Date(`1970-01-01 ${valor}`);
    if (!isNaN(d.getTime())) {
        let hh = String(d.getHours()).padStart(2, "0");
        let mm = String(d.getMinutes()).padStart(2, "0");
        return `${hh}:${mm}`;
    }

    // Si viene como "8:5", "9:00", etc.
    const partes = valor.split(":");
    if (partes.length >= 2) {
        let hh = partes[0].padStart(2, "0");
        let mm = partes[1].padStart(2, "0");
        return `${hh}:${mm}`;
    }

    return valor;
}


/* ============================================
   LEER EXCEL
============================================ */
document.getElementById("btn-cargar-programacion").addEventListener("click", () => {

    const fileInput = document.getElementById("file-programacion");
    const archivo = fileInput.files[0];

    if (!archivo) {
        alert("Seleccione un archivo Excel.");
        return;
    }

    leerExcel(archivo);
});


function leerExcel(archivo) {

    const reader = new FileReader();

    reader.onload = (event) => {
        const data = new Uint8Array(event.target.result);

        // Parsear Excel con SheetJS
        const workbook = XLSX.read(data, { type: "array" });

        const primeraHoja = workbook.SheetNames[0];
        const hoja = workbook.Sheets[primeraHoja];

        // Convertir a JSON
        const json = XLSX.utils.sheet_to_json(hoja, { defval: "" });

        mostrarProgramacion(json);
    };

    reader.readAsArrayBuffer(archivo);
}



/* ============================================
   MOSTRAR TABLA EN PANTALLA
============================================ */
function mostrarProgramacion(lista) {
    const tbody = document.querySelector("#tabla-programacion tbody");
    tbody.innerHTML = "";

    lista.forEach((p) => {

        // Detectar columnas posibles
        const id     = p.id || p.ID || p.Id || p.Num_id || p.num_id || "";
        const nombre = p.nombre_escolta || p.Nombre || p.ES || p.Escolta || "";
        const cliente = p.cliente || p.Cliente || "";
        const ciudad  = p.ciudad || p.Ciudad || "";
        
        const inicioOriginal = p.hora_inicio || p.Inicio || p.INICIO || p.HORA_INICIO || "";
        const finOriginal    = p.hora_fin || p.Fin || p.FIN || p.HORA_FIN || "";
        
        const inicio = convertirHoraMilitar(inicioOriginal);
        const fin    = convertirHoraMilitar(finOriginal);

        const ruta = p.ruta || p.Ruta || "";
        const obs  = p.observacion || p.Obs || p.OBS || "";

        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${id}</td>
            <td>${nombre}</td>
            <td>${cliente}</td>
            <td>${ciudad}</td>
            <td>${inicio}</td>
            <td>${fin}</td>
            <td>${ruta}</td>
            <td>${obs}</td>
        `;

        tbody.appendChild(tr);
    });
}

