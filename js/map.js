/* map.js
   Mapa de reportes + validación de distancia
   Depende de: Leaflet, REPORTES_CACHE (global), clasificar(r), formatearHora24(r.reportDateTime)
   Exponer: updateMapForClient(clienteId)
*/

let MAP = null;
let MAP_LAYER = null;
let MAP_MARKERS_GROUP = null;
let SITE_MARKER = null;

const MAP_COLORS = {
    preoperacional: "#6c757d",
    inicio: "#147D7D",
    llegada: "#28a745",
    empalme: "#f1c40f",
    desempalme: "#7e57c2",
    fin: "#555555",
    fuera: "#e74c3c"
};

function getCoordsFromReport(r) {
    const tryPaths = [
        () => ({ lat: r.position?.latitude, lng: r.position?.longitude }),
        () => ({ lat: r.position?.lat, lng: r.position?.lng }),
        () => ({ lat: r.geo?.latitude, lng: r.geo?.longitude }),
        () => ({ lat: r.siteLocation?.latitude, lng: r.siteLocation?.longitude }),
        () => ({ lat: r.siteLocation?.lat, lng: r.siteLocation?.lng }),
        () => ({ lat: r.siteLocation?.position?.latitude, lng: r.siteLocation?.position?.longitude }),
        () => ({ lat: r.reportLocation?.latitude, lng: r.reportLocation?.longitude })
    ];

    for (const fn of tryPaths) {
        try {
            const c = fn();
            if (!c) continue;
            const lat = parseFloat(c.lat);
            const lng = parseFloat(c.lng);
            if (isFinite(lat) && isFinite(lng)) return { lat, lng };
        } catch (e) {}
    }
    return null;
}

function getSiteCoordsFromReport(r) {
    const tryPaths = [
        () => ({ lat: r.siteLocation?.latitude, lng: r.siteLocation?.longitude }),
        () => ({ lat: r.siteLocation?.lat, lng: r.siteLocation?.lng }),
        () => ({ lat: r.account?.siteLocation?.latitude, lng: r.account?.siteLocation?.longitude }),
        () => ({ lat: r.account?.siteLocation?.lat, lng: r.account?.siteLocation?.lng }),
        () => ({ lat: r.account?.location?.latitude, lng: r.account?.location?.longitude })
    ];
    for (const fn of tryPaths) {
        try {
            const c = fn();
            if (!c) continue;
            const lat = parseFloat(c.lat);
            const lng = parseFloat(c.lng);
            if (isFinite(lat) && isFinite(lng)) return { lat, lng };
        } catch (e) {}
    }
    return null;
}

function distanceMeters(a, b) {
    if (!a || !b) return null;
    const R = 6371000;
    const toRad = x => x * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const sinDLat = Math.sin(dLat/2);
    const sinDLon = Math.sin(dLon/2);
    const aa = sinDLat*sinDLat + Math.cos(lat1)*Math.cos(lat2)*sinDLon*sinDLon;
    const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1-aa));
    return Math.round(R * c);
}

function initMap() {
    if (MAP) return;
    MAP = L.map('map', { zoomControl: true });
    MAP_LAYER = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(MAP);
    MAP_MARKERS_GROUP = L.layerGroup().addTo(MAP);
    MAP.setView([10.96854, -74.78132], 10);
}

function makeColoredMarkerHtml(color, small=false) {
    const size = small ? 12 : 16;
    return `<div style="
        width:${size}px;height:${size}px;border-radius:50%;
        background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.25);
    "></div>`;
}

function createMarker(latlng, color, popupHtml) {
    const icon = L.divIcon({
        html: makeColoredMarkerHtml(color),
        className: 'custom-div-icon',
        iconSize: [18,18],
        iconAnchor: [9,9]
    });
    const m = L.marker([latlng.lat, latlng.lng], { icon });
    if (popupHtml) m.bindPopup(popupHtml);
    return m;
}

function statusPorDistancia(metros, umbralOK=100, umbralWarn=300) {
    if (metros == null) return { status: 'sin-coords', color: '#999', label: 'Sin ubicación' };
    if (metros <= umbralOK) return { status: 'ok', color: MAP_COLORS.inicio, label: `OK (${metros} m)` };
    if (metros <= umbralWarn) return { status: 'warn', color: '#f1c40f', label: `Cercano (${metros} m)` };
    return { status: 'fuera', color: MAP_COLORS.fuera, label: `Fuera (${metros} m)` };
}

function updateMapForClient(clienteId, tipoFiltro = 'todos') {
    initMap();
    MAP_MARKERS_GROUP.clearLayers();

    const lista = (window.REPORTES_CACHE || []).filter(r => {
        if (!r.account || String(r.account.id) !== String(clienteId)) return false;
        const tipo = clasificar(r);
        if (!tipo) return false;
        if (tipoFiltro && tipoFiltro !== 'todos' && tipoFiltro !== tipo) return false;
        return true;
    });

    if (!lista.length) {
        const sample = (window.REPORTES_CACHE || []).find(r => r.account && String(r.account.id) === String(clienteId) && getSiteCoordsFromReport(r));
        if (sample) {
            const sc = getSiteCoordsFromReport(sample);
            if (sc) MAP.setView([sc.lat, sc.lng], 13);
        }
        return;
    }

    let siteCoords = null;
    for (const r of lista) {
        const sc = getSiteCoordsFromReport(r);
        if (sc) { siteCoords = sc; break; }
    }

    if (siteCoords) {
        if (SITE_MARKER) { try { MAP.removeLayer(SITE_MARKER); } catch(e){} }
        SITE_MARKER = L.circle([siteCoords.lat, siteCoords.lng], { radius: 20, color: '#0D4D4D', fillColor:'#0D4D4D', fillOpacity:0.15 }).addTo(MAP);
    }

    const markers = [];

    lista.forEach(r => {
        const coords = getCoordsFromReport(r);
        const tipo = clasificar(r);
        const hora = formatearHora24(r.reportDateTime);
        const empleado = `${r.createdBy?.firstName || ''} ${r.createdBy?.lastName || ''}`.trim() || '(sin nombre)';
        const clienteNombre = r.account?.name || '(sin cliente)';
        let popupHtml = `<strong>${tipo?.toUpperCase() || ''}</strong><br>${empleado}<br>${hora}<br><em>${clienteNombre}</em>`;

        let colorBase = MAP_COLORS[tipo] || '#999';
        let statusInfo = null;

        if (coords) {
            if (siteCoords) {
                const metros = distanceMeters(coords, siteCoords);
                statusInfo = statusPorDistancia(metros);
                colorBase = statusInfo.color;
                popupHtml += `<br><small>Dist: ${metros} m — ${statusInfo.label}</small>`;
            } else {
                popupHtml += `<br><small>Dist: N/A (sin site coords)</small>`;
            }
            const m = createMarker(coords, colorBase, popupHtml);
            m.addTo(MAP_MARKERS_GROUP);
            markers.push(m);
        }
    });

    if (markers.length) {
        const group = L.featureGroup(markers);
        MAP.fitBounds(group.getBounds().pad(0.2));
    } else if (siteCoords) {
        MAP.setView([siteCoords.lat, siteCoords.lng], 13);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const sel = document.getElementById('map-tipo-select');
    if (sel) {
        sel.addEventListener('change', () => {
            const tipo = sel.value;
            const clienteId = window.CLIENTE_SELECCIONADO || Object.values(CONFIG.clientes)[0];
            if (clienteId) updateMapForClient(clienteId, tipo);
        });
    }
});

window.updateMapForClient = updateMapForClient;
window.initMap = initMap;
