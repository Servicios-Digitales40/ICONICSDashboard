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
import { lazy, Suspense, useState } from "react";
import { ThemeProvider, useTheme } from "@/theme";
import { DataSourceProvider } from "@/lib/datasource";
import { ToastProvider, ModalProvider, Modal } from "./providers/index.js";
import { Sidebar, Topbar, DataSourceBanner } from "./layout/index.js";
import { PAGES, PAGE_META, ROUTE_IDS, DEFAULT_ROUTE, useNavegacion } from "./routes/index.js";
import { ErrorBoundary } from "./ErrorBoundary.jsx";
import { leerModoMuro, useRotacionMuro } from "./modoMuro.js";

/**
 * El asistente va en su propio trozo, como la pila 3D y las propuestas.
 *
 * No hace falta en el primer pintado —el operador tiene que pulsar el botón
 * para usarlo, y en un wallboard no lo pulsa nadie—, así que el arranque de
 * la pantalla de Planta no debe pagarlo. Sin `lazy()` sumaba 7,5 KB al trozo
 * `index`, que tiene techo comprobado en `scripts/verificar-bundle.mjs`.
 *
 * ⚠️ Se importa el COMPONENTE y no el barril `@/features/asistente`. Con el
 * barril, Rollup nombra el trozo según su módulo de entrada —`index.js`— y
 * genera un segundo `index-*.js` en `assets/`. `verificar-bundle.mjs` busca
 * el trozo de arranque por ese prefijo y medía el que encontrara primero:
 * daba 7 KB por bueno y el techo de 170 KB dejaba de comprobar nada.
 */
const Asistente = lazy(() =>
  import("@/features/asistente/components/Asistente.jsx").then((m) => ({ default: m.Asistente }))
);

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

/**
 * Respaldo mientras se descarga una vista partida en su propio trozo.
 *
 * Deliberadamente sobrio y sin cifras: un esqueleto con números de mentira
 * en un tablero de planta se lee como un dato durante el instante que dura.
 */
function CargandoVista({ t }) {
  return (
    <div style={{ padding: 40, textAlign: "center", color: t.textFaint, fontSize: 13 }}>
      Cargando vista…
    </div>
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

  // El cajón de navegación (Sidebar por debajo de 900px) es del Shell y no del
  // Sidebar: el botón que lo abre vive en el Topbar, así que el estado tiene
  // que vivir por encima de los dos.
  const [cajonAbierto, setCajonAbierto] = useState(false);

  // Modo muro (Plan 13, F8): `?muro=1`, opcionalmente con `vistas=a,b,c`,
  // `rotarCada` (segundos) y `escala`. Ver la cabecera de `modoMuro.js` para
  // por qué esto es `zoom` y no `rem`.
  const muro = leerModoMuro(nav.params);
  useRotacionMuro({
    activo: muro.activo, vistas: muro.vistas, intervaloS: muro.intervaloS,
    paginaActual: nav.page, navigate,
  });

  return (
    <div
      style={{
        minHeight: "100vh", background: t.page, display: "flex",
        // `String(...)`, no el número tal cual: React le añade "px" a un
        // valor numérico de `zoom` porque no está en su lista de propiedades
        // sin unidad — y "zoom: 1.6px" es un valor inválido que el
        // navegador (y jsdom, medido antes de este fix) descarta en
        // silencio. Como cadena, viaja sin unidad y el estilo se aplica.
        zoom: muro.activo ? String(muro.escala) : undefined,
      }}
    >
      {!muro.activo && (
        <Sidebar
          page={nav.page}
          onNavigate={(p) => navigate(p)}
          abiertaCajon={cajonAbierto}
          onCerrarCajon={() => setCajonAbierto(false)}
        />
      )}

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
        <Topbar page={nav.page} onAbrirMenu={() => setCajonAbierto(true)} muro={muro.activo} />

        {/* `<main>` y no `<div>`: es el único landmark de contenido que le
            faltaba a la aplicación entera (Sidebar ya es `<aside>`+`<nav>`,
            Topbar ya es `<header>`). Sin él, un lector de pantalla no tiene
            forma de saltar directo al tablero sin recorrer primero la barra
            lateral completa en cada visita. */}
        <main key={nav.page} className="page-fade eva-page-shell" style={{ position: "relative" }}>
          {/* `resetKey` rearma la barrera al cambiar de ruta: sin él, una
              vista que falló una vez dejaría el error clavado y navegar a
              otra página mostraría el mismo panel. */}
          <ErrorBoundary resetKey={nav.page} etiqueta={PAGE_META[nav.page]?.title}>
            {/* Las vistas de PROPUESTA del build de demo se cargan con
                `lazy()`, así que suspenden en su primer render. Las de planta
                son imports normales y nunca llegan a mostrar este respaldo:
                si algún día se parte alguna por ruta, aquí ya está el hueco. */}
            <Suspense fallback={<CargandoVista t={t} />}>
              <PageComponent params={nav.params} onNavigate={navigate} />
            </Suspense>
          </ErrorBoundary>
        </main>

        {/* El asistente es estrictamente ADITIVO: se pinta solo si el servidor
            tiene un modelo configurado, y va en su propia barrera de errores
            para que un fallo suyo no se lleve por delante el tablero. Un
            wallboard de planta tiene que seguir mostrando sus señales aunque el
            chat reviente. */}
        <ErrorBoundary etiqueta="Tdconcito">
          {/* Sin respaldo visible: mientras se descarga su trozo no debe
              aparecer ni un hueco ni un esqueleto encima del tablero. */}
          <Suspense fallback={null}>
            <Asistente />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}
