// config.js

const CONFIG = {

    apiUrl: "https://visionlatam.securitas.com/rest/v1/",

    username: "CO0819955",
    password: "Colombia.01",

    templates: {
        preoperacional: 32446,
        llegada: 89591,
        inicio: 152004,
        fin: 152079,
        empalme: 89596,
        desempalme: 89603
    },

    clientes: {
        "COMERCIAL NUTRESA BARRANQUILLA": 14047,
        "COMERCIAL NUTRESA VALLEDUPAR": 14050,
        "COMERCIAL NUTRESA CARTAGENA": 14049,
        "COMERCIAL NUTRESA SANTA MARTA": 17334,
        "OPERAR CARNICOS BARRANQUILLA": 14082,
        "OPERAR MEALS-CÁRNICOS CARTAGENA": 14081,
        "OPERAR MEALS BARRANQUILLA": 14080,
        "OPERAR CARNICOS VALLEDUPAR": 17857,
        "Nacional de Chocolates Valledupar-Barranquilla": 14086,
        "AJE GROUP COSTA NORTE": 17136,
        "BRINKS DE COLOMBIA (MERCANCÍAS)": 17420,
        "LATIN LOGYSTICS (DEPRISA) - COSTA NORTE": 17503,
        "TRANSPORTES CAMFRI S.A  - COSTA NORTE": 17195,
        "TL EFICAZ COSTA NORTE": 17198,
        "EQL - LOGISTICA COSTA NORTE": 17667,
        "PRODUCTOS DORIA - COSTA NORTE": 17825,
        "MILPA S A - COSTA NORTE": 17875,
        "Log&Tec S.A.S - COSTA NORTE": 17878
    }

};

// helpers
function obtenerIdsClientesConfig() {
    if (!CONFIG.clientes) return [];
    return Object.values(CONFIG.clientes)
        .filter(Boolean)
        .map(String);
}

function esClienteDeConfig(account) {
    const ids = obtenerIdsClientesConfig();
    if (!ids.length) return true;
    if (!account || account.id == null) return false;
    return ids.includes(String(account.id));
}
