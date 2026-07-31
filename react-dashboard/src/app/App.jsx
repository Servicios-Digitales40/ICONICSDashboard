/**
 * app/App.jsx
 * ------------------------------------------------------------------
 * Punto de composición de la app:
 *   1) Envuelve todo con los providers de contexto (tema, toasts, modal).
 *      El anidamiento se deja visible aquí a propósito, y no escondido tras
 *      un <AppProviders>, porque el orden es funcional: un provider que
 *      consuma el hook de otro tiene que ir por dentro.
 *   2) Dentro, <Shell> arma el layout (sidebar + topbar + contenido)
 *      y decide qué página mostrar según el estado `page`.
 *
 * Este archivo NO conoce las páginas: `PAGES` sale del registro único de
 * `app/routes/`, que es también de donde el Sidebar saca `NAV` y el Topbar
 * `PAGE_META`. Añadir una página es una sola edición, en `routes.jsx`.
 */
import { useState } from "react";
import { ThemeProvider, useTheme } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import { ToastProvider, ModalProvider, Modal } from "./providers/index.js";
import { Sidebar, Topbar, DataSourceBanner } from "./layout/index.js";
import { PAGES, DEFAULT_ROUTE } from "./routes/index.js";

export default function App() {
  return (
    <ThemeProvider>
      {/* DataSourceProvider es el ÚNICO sitio de la app que sabe si los
          datos vienen de ICONICS o del modo demo. Va por dentro del tema
          —no lo necesita, pero el banner de demo sí— y por fuera del
          Shell, para que el cambio de modo remonte todas las vistas. */}
      <DataSourceProvider>
        <ToastProvider>
          <ModalProvider>
            <Shell />
          </ModalProvider>
        </ToastProvider>
      </DataSourceProvider>
    </ThemeProvider>
  );
}

function Shell() {
  const { theme: t } = useTheme();
  // Estado de navegación: qué página y con qué parámetros. `navigate`
  // se pasa a las páginas (como onNavigate) para moverse entre vistas,
  // p. ej. de un monitor de área a la vista de detalle de una máquina.
  const [nav, setNav] = useState({ page: DEFAULT_ROUTE, params: {} });
  const navigate = (page, params = {}) => setNav({ page, params });

  // Un id de página desconocido cae a la ruta por defecto en vez de
  // renderizar `undefined`, que tumbaría la aplicación entera. No es
  // hipotético: al renombrar las rutas de área ("area1" → "area-LIN"),
  // los prototipos siguieron navegando a los ids viejos durante un
  // tiempo, y cada clic era una pantalla en blanco sin mensaje.
  const PageComponent = PAGES[nav.page] ?? PAGES[DEFAULT_ROUTE];

  return (
    <div style={{ minHeight: "100vh", background: t.page, display: "flex" }}>
      <Sidebar page={nav.page} onNavigate={(p) => navigate(p)} />

      {/* overflowX: "clip" recorta las manchas decorativas que se salen por la
          derecha (blob2 está en right: -140) sin generar scroll horizontal.
          Se usa "clip" y no "hidden" a propósito: "hidden" convertiría este
          div en contenedor de scroll y rompería el position: sticky del Topbar. */}
      <div style={{ flex: 1, minWidth: 0, position: "relative", overflowX: "clip" }}>
        {/* Manchas decorativas de fondo, puramente visuales */}
        <div className="blob" style={{ width: 380, height: 380, background: t.blob1, top: -140, right: 60 }} />
        <div className="blob" style={{ width: 300, height: 300, background: t.blob2, top: 300, right: -140, animationDelay: "-8s" }} />

        <Modal />
        <DataSourceBanner />
        <Topbar page={nav.page} />

        <div key={nav.page} className="page-fade" style={{ padding: "26px 32px 50px", position: "relative" }}>
          <PageComponent params={nav.params} onNavigate={navigate} />
        </div>
      </div>
    </div>
  );
}
