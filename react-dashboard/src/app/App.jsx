/**
 * Punto de composición de la app:
 *
 *   1. Envuelve todo con los providers de contexto (tema, toasts, modal). El
 *      anidamiento se deja visible aquí y no escondido tras un
 *      <AppProviders>, porque el orden es funcional: un provider que consuma
 *      el hook de otro tiene que ir por dentro.
 *   2. Dentro, <Shell> arma el layout (sidebar, topbar y contenido) y decide
 *      qué página mostrar según el estado `page`.
 *
 * Este archivo no conoce las páginas: `PAGES` sale del registro único de
 * `app/routes/`, de donde también salen `NAV` para el Sidebar y `PAGE_META`
 * para el Topbar. Añadir una página es una sola edición, en `routes.jsx`.
 */
import { ThemeProvider, useTheme } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import { ToastProvider, ModalProvider, Modal } from "./providers/index.js";
import { Sidebar, Topbar, DataSourceBanner } from "./layout/index.js";
import { PAGES, PAGE_META, ROUTE_IDS, DEFAULT_ROUTE, useNavegacion } from "./routes/index.js";
import { ErrorBoundary } from "./ErrorBoundary.jsx";

export default function App() {
  return (
    /* La barrera exterior es el último recurso: cubre lo que falle FUERA de
       una página —un provider, el propio Shell— y es lo único que queda entre
       una excepción ahí y una pantalla en blanco en la pared de la planta.
       La de dentro, por página, es la que se usa a diario. */
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}

function Shell() {
  const { theme: t } = useTheme();
  // Estado de navegación: qué página y con qué parámetros, sincronizado con la
  // barra de direcciones. `navigate` se pasa a las páginas como `onNavigate`
  // para moverse entre vistas, por ejemplo de un monitor de área al detalle de
  // una máquina.
  const [nav, navigate] = useNavegacion(ROUTE_IDS, DEFAULT_ROUTE);

  // Un id de página desconocido cae a la ruta por defecto en vez de renderizar
  // `undefined`, que tumbaría la aplicación entera. Pasa al renombrar rutas,
  // cuando algo sigue navegando al id viejo.
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
          {/* `resetKey` rearma la barrera al cambiar de ruta: sin él, una
              vista que falló una vez dejaría el error clavado y navegar a
              otra página mostraría el mismo panel. */}
          <ErrorBoundary resetKey={nav.page} etiqueta={PAGE_META[nav.page]?.title}>
            <PageComponent params={nav.params} onNavigate={navigate} />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
