// js/auth.js  (module)
// Maneja Netlify Identity: abrir widget, login/logout, redirección y obtener JWT

// Asegúrate que el widget se cargó
if (!window.netlifyIdentity) {
  console.warn("Netlify Identity widget no cargó. Verifica la URL del script.");
}

const netlifyIdentity = window.netlifyIdentity || null;

// Elementos
const btnOpenWidget = document.getElementById("open-widget");
const btnGithub = document.getElementById("btn-github");
const btnGoogle = document.getElementById("btn-google");

// Redirigir después de login
function redirectAfterLogin() {
  // Cambia la ruta si tu dashboard se llama distinto
  window.location.href = "/dashboard_cliente.html";
}

// Open widget generic
if (btnOpenWidget) {
  btnOpenWidget.addEventListener("click", () => {
    if (!netlifyIdentity) return alert("Widget no disponible.");
    netlifyIdentity.open(); // abre la UI del widget
  });
}

// Providers direct (redirect)
if (btnGithub) {
  btnGithub.addEventListener("click", () => {
    // Redirecciona al endpoint de Netlify Identity para provider
    // Esto inicia el flujo OAuth del provider configurado en Netlify
    window.location.href = "/.netlify/identity?provider=github";
  });
}
if (btnGoogle) {
  btnGoogle.addEventListener("click", () => {
    window.location.href = "/.netlify/identity?provider=google";
  });
}

// Eventos del widget
if (netlifyIdentity) {
  netlifyIdentity.on("login", (user) => {
    console.log("Evento login -> user:", user);
    // user es un objeto que incluye token y metadata.
    // Redirigir al dashboard
    redirectAfterLogin();
  });

  netlifyIdentity.on("logout", () => {
    console.log("Evento logout");
    // si quisieras puedes redirigir al login
    // window.location.href = "/auth/login.html";
  });
}

// Helper: obtener JWT (para llamadas a Netlify Functions)
export async function obtenerJwtUsuario() {
  if (!netlifyIdentity) return null;
  const user = netlifyIdentity.currentUser();
  if (!user) return null;
  // retorna el JWT actual
  try {
    const token = await user.jwt();
    return token;
  } catch (e) {
    console.error("No se pudo obtener JWT del usuario:", e);
    return null;
  }
}

// Opción: si la página carga y ya está autenticado -> redirigir al dashboard
document.addEventListener("DOMContentLoaded", () => {
  if (!netlifyIdentity) return;
  const user = netlifyIdentity.currentUser();
  if (user) {
    // Si ya autenticado directamente enviarlo al dashboard
    redirectAfterLogin();
  }
});
