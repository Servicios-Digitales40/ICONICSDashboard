/**
 * Registro único de rutas: qué páginas existen, en qué orden salen en el
 * sidebar y qué título muestra el Topbar. Añadir una página es una sola
 * edición aquí.
 *
 * Forma de una ruta:
 *
 *   {
 *     id:        string   — clave de navegación, única
 *     component: Comp     — el componente de página
 *     title:     string   — encabezado del Topbar
 *     sub:       string   — subtítulo del Topbar
 *     nav?:      { label, icon, group? }
 *   }
 *
 * Sin `nav`, la ruta existe pero no aparece en el sidebar; es el caso de
 * `machine-detail`, al que se llega pulsando una tarjeta de máquina.
 *
 * El orden de este array es el orden del sidebar. Las rutas con `group` se
 * agrupan bajo su cabecera, y el grupo aparece en la posición de su primer
 * hijo; ver `./index.js`.
 *
 * ── QUÉ ENTRA AQUÍ ─────────────────────────────────────────────────
 *
 * Este archivo define la superficie de la aplicación en planta, así que la
 * pregunta antes de añadir una ruta es si un operador debe poder abrirla en
 * un monitor sin teclado. En la Fase C del Plan 3 se retiraron por ese
 * criterio:
 *
 *  - `Sankey`, que era una prueba de d3-sankey sin uso operativo.
 *  - `Data`, que hace altas, escrituras y BORRADOS contra `db:Northwind`, la
 *    base de ejemplo de ICONICS. El backend bloquea hoy la escritura
 *    (`ICONICS_READ_ONLY`), pero un botón «Eliminar» en un tablero de planta
 *    no debe existir aunque no funcione.
 *
 * Sus módulos siguen en el árbol —`features/data/`, `features/sankey/`— sin
 * que nadie los importe, así que no entran en el bundle. Si Data vuelve,
 * vuelve detrás de autenticación y sin la pestaña de borrado.
 *
 * ── LAS RUTAS DE PROTOTIPO ─────────────────────────────────────────
 *
 * Las 12 propuestas de diseño de `src/prototypes/` existen SÓLO en el build
 * de demo (`VITE_ENABLE_DEMO=true`). El bloque de comentario que precede a
 * `propuesta()` explica el mecanismo, y por qué tanto el `lazy()` como la
 * forma exacta del ternario son necesarios para que no viajen a planta.
 */
import { lazy } from "react";
import { Box, Cog, Factory, FlaskConical, Gauge, Boxes, LayoutDashboard, Palette, Sparkles, LayoutPanelTop, Radar } from "lucide-react";

import { DEMO_HABILITADO } from "@/lib/datasource";
import { Dashboard } from "@/features/dashboard";
import { Assets } from "@/features/assets";
import { AreaView, MachineDetail } from "@/features/machines";

/**
 * Las dos áreas comparten componente y solo cambia el `areaId`.
 *
 * Se declaran en el ámbito del módulo, y no como una lambda dentro del
 * array, para que su identidad sea ESTABLE: una función nueva en cada
 * render sería un tipo de componente distinto para React y remontaría la
 * vista entera —perdiendo el estado y, con él, las suscripciones al
 * motor de polling— en cada repintado del Shell.
 */
const Lineales = (props) => <AreaView {...props} areaId="LIN" />;
const Rectificadoras = (props) => <AreaView {...props} areaId="REC" />;

/**
 * Rutas que sólo existen en el build de demo.
 *
 * Se escriben como `...(DEMO_HABILITADO ? [ … ] : [])` y con *spread*, para
 * que las propuestas queden **intercaladas** donde importan: «Planta · v2»
 * justo detrás de «Planta», y las variantes de cada área detrás de su área,
 * que es lo que permite saltar de una a otra y compararlas.
 *
 * ── POR QUÉ `lazy()` Y NO UN IMPORT NORMAL ─────────────────────────
 *
 * Con `import Sandbox from "@/prototypes/SandboxPage.jsx"` en la cabecera, el
 * módulo entra en el bundle **aunque su ruta no se registre**: un import
 * estático es incondicional y el empaquetador no puede saber que nadie lo va
 * a usar. Volveríamos a meter las 12 propuestas en el tablero de planta, que
 * es justo lo que se quitó.
 *
 * ── POR QUÉ UN TERNARIO Y NO UNA FUNCIÓN AUXILIAR ──────────────────
 *
 * Esto empezó siendo un `soloEnDemo(rutas)` que leía mejor, y **no
 * funcionaba**: al pasar la lista como argumento de una llamada, el
 * empaquetador ya no puede probar que la rama está muerta, y emitía los doce
 * `import()` como trozos igualmente. Se veía en el `dist` del build de planta:
 * `SandboxPage-*.js`, `DashboardV2-*.js`, `variants-*.js`…
 *
 * Con el ternario sobre una constante que el empaquetador pliega, la rama
 * desaparece entera y con ella los trozos. Es la diferencia entre «no se puede
 * abrir» y «no está»; para la superficie de un tablero de planta, la segunda.
 * De ahí también que `DEMO_HABILITADO` se escriba sin `?.` — ver su cabecera.
 */

/** Azúcar para no repetir el `lazy(() => import(...))` doce veces. */
const propuesta = (importar) => lazy(importar);

/** Ruta que se muestra al arrancar la app. */
export const DEFAULT_ROUTE = "dashboard";

/** Cabeceras de los grupos desplegables del sidebar. */
export const NAV_GROUPS = {
  "vistas-resonac": { label: "Vistas Resonac", icon: <FlaskConical size={17} /> },
  "3d": { label: "3D", icon: <Box size={17} /> },
};

export const ROUTES = [
  {
    id: "dashboard",
    component: Dashboard,
    title: "Planta",
    sub: "Resumen del turno · OEE, producción y estado de los equipos",
    nav: { label: "Planta", icon: <LayoutDashboard size={17} /> },
  },

  // PROPUESTA · va justo detrás de «Planta» para poder saltar de una a otra
  // y comparar. Compite contra la vista de producción, no contra variantes.
  ...(DEMO_HABILITADO ? [
    {
      id: "dashboard-v2",
      component: propuesta(() => import("@/prototypes/dashboard-v2/DashboardV2.jsx")),
      title: "Planta · propuesta v2",
      sub: "Propuesta en evaluación · mismos datos, 10 mejoras de diseño",
      nav: { label: "Planta · v2", icon: <LayoutDashboard size={17} /> },
    },
  ] : []),

  /* ---- Grupo «Vistas Resonac» ------------------------------------ */
  {
    // Las áreas son las de ICONICS: LIN (Lineales 1-7) y REC
    // (Rectificadoras 10, 11 y 13). Antes eran "area1"/"area2", nombres
    // que no existían en planta ni en el servidor.
    id: "area-LIN",
    component: Lineales,
    title: "Resonac · Lineales",
    sub: "Monitor general de las 7 líneas de producción",
    nav: { label: "Lineales", icon: <Gauge size={16} />, group: "vistas-resonac" },
  },

  // Las cinco variantes de tarjeta, sobre el área 1. El prefijo «A1 ·»
  // mantiene la lista legible en la barra; el nombre completo va en el Topbar.
  ...(DEMO_HABILITADO ? [
    {
      id: "area1-editorial",
      component: propuesta(() => import("@/prototypes/area-views/Area1Editorial.jsx")),
      title: "Área 1 Panel Editorial",
      sub: "Propuesta en evaluación · tarjeta compacta editorial",
      nav: { label: "A1 · Panel Editorial", icon: <LayoutPanelTop size={15} />, group: "vistas-resonac" },
    },
    {
      id: "area1-aurora",
      component: propuesta(() => import("@/prototypes/area-views/Area1Aurora.jsx")),
      title: "Área 1 Aurora Hero",
      sub: "Propuesta en evaluación · tarjeta ancha con degradado vivo",
      nav: { label: "A1 · Aurora Hero", icon: <Sparkles size={15} />, group: "vistas-resonac" },
    },
    {
      id: "area1-aurora-v",
      component: propuesta(() => import("@/prototypes/area-views/Area1AuroraV.jsx")),
      title: "Área 1 Aurora Vertical",
      sub: "Propuesta en evaluación · Aurora en formato vertical",
      nav: { label: "A1 · Aurora Vertical", icon: <Sparkles size={15} />, group: "vistas-resonac" },
    },
    {
      id: "area1-neon",
      component: propuesta(() => import("@/prototypes/area-views/Area1Neon.jsx")),
      title: "Área 1 Neon Cyber HUD",
      sub: "Propuesta en evaluación · panel ancho estilo HUD",
      nav: { label: "A1 · Neon Cyber HUD", icon: <Radar size={15} />, group: "vistas-resonac" },
    },
    {
      id: "area1-neon-v",
      component: propuesta(() => import("@/prototypes/area-views/Area1NeonV.jsx")),
      title: "Área 1 Neon HUD Vertical",
      sub: "Propuesta en evaluación · HUD en formato vertical",
      nav: { label: "A1 · Neon HUD Vertical", icon: <Radar size={15} />, group: "vistas-resonac" },
    },
  ] : []),

  {
    id: "area-REC",
    component: Rectificadoras,
    title: "Resonac · Rectificadoras",
    sub: "Monitor general de las multi-rectificadoras 10, 11 y 13",
    nav: { label: "Rectificadoras", icon: <Gauge size={16} />, group: "vistas-resonac" },
  },

  // Las mismas cinco, sobre el área 2.
  ...(DEMO_HABILITADO ? [
    {
      id: "area2-editorial",
      component: propuesta(() => import("@/prototypes/area-views/Area2Editorial.jsx")),
      title: "Área 2 Panel Editorial",
      sub: "Propuesta en evaluación · tarjeta compacta editorial",
      nav: { label: "A2 · Panel Editorial", icon: <LayoutPanelTop size={15} />, group: "vistas-resonac" },
    },
    {
      id: "area2-aurora",
      component: propuesta(() => import("@/prototypes/area-views/Area2Aurora.jsx")),
      title: "Área 2 Aurora Hero",
      sub: "Propuesta en evaluación · tarjeta ancha con degradado vivo",
      nav: { label: "A2 · Aurora Hero", icon: <Sparkles size={15} />, group: "vistas-resonac" },
    },
    {
      id: "area2-aurora-v",
      component: propuesta(() => import("@/prototypes/area-views/Area2AuroraV.jsx")),
      title: "Área 2 Aurora Vertical",
      sub: "Propuesta en evaluación · Aurora en formato vertical",
      nav: { label: "A2 · Aurora Vertical", icon: <Sparkles size={15} />, group: "vistas-resonac" },
    },
    {
      id: "area2-neon",
      component: propuesta(() => import("@/prototypes/area-views/Area2Neon.jsx")),
      title: "Área 2 Neon Cyber HUD",
      sub: "Propuesta en evaluación · panel ancho estilo HUD",
      nav: { label: "A2 · Neon Cyber HUD", icon: <Radar size={15} />, group: "vistas-resonac" },
    },
    {
      id: "area2-neon-v",
      component: propuesta(() => import("@/prototypes/area-views/Area2NeonV.jsx")),
      title: "Área 2 Neon HUD Vertical",
      sub: "Propuesta en evaluación · HUD en formato vertical",
      nav: { label: "A2 · Neon HUD Vertical", icon: <Radar size={15} />, group: "vistas-resonac" },
    },
  ] : []),

  /* ---- Grupo «3D» ------------------------------------------------ */
  /*
   * Las dos vistas 3D. Ver docs/PLAN-4-VISTAS-3D.md.
   *
   * ── POR QUÉ SÓLO EN EL BUILD DE DEMO, DE MOMENTO ───────────────────
   *
   * Por el mismo criterio que encabeza este archivo: una vista que se orbita
   * con el ratón todavía no pasa el listón de «un operador debe poder abrirla
   * en un monitor sin teclado». «Maqueta 3D» se promueve a planta cuando esté
   * medida en el equipo real y sea usable sin teclado (Fase 5 del plan);
   * mover una ruta de un lado al otro es esta línea.
   *
   * ── POR QUÉ `lazy()` IMPORTA AQUÍ MÁS QUE EN NINGÚN SITIO ──────────
   *
   * La pila 3D (three + r3f + drei) pesa del orden del bundle entero de
   * planta. Con `lazy()`, quien no abra estas vistas no la descarga. El
   * reparto que la mantiene fuera del arranque está en `vite.config.js`
   * (`PAQUETES_3D`), y la comprobación en `scripts/verificar-bundle.mjs`.
   *
   * Se importa el ARCHIVO de cada vista y no un barril del módulo: un barril
   * que reexportara las dos las metería en el mismo trozo y, sobre todo,
   * cualquier import estático de ese barril desde otro sitio arrastraría
   * three.js al arranque sin que nadie lo notara.
   */
  ...(DEMO_HABILITADO ? [
    {
      id: "maquina-3d",
      component: lazy(() => import("@/features/three-d/views/Maquina3D.jsx")),
      title: "Máquina 3D",
      sub: "El modelo se comporta según el estado del equipo",
      nav: { label: "Máquina 3D", icon: <Cog size={16} />, group: "3d" },
    },
    {
      id: "maqueta-3d",
      component: lazy(() => import("@/features/three-d/views/Maqueta3D.jsx")),
      title: "Maqueta 3D",
      sub: "La planta en miniatura · pulsa una máquina para ver sus indicadores",
      nav: { label: "Maqueta 3D", icon: <Factory size={16} />, group: "3d" },
    },
  ] : []),

  // Banco de pruebas: todas las variantes juntas, para compararlas de un
  // vistazo en vez de saltando entre rutas.
  ...(DEMO_HABILITADO ? [
    {
      id: "sandbox",
      component: propuesta(() => import("@/prototypes/SandboxPage.jsx")),
      title: "Sandbox",
      sub: "Banco de pruebas",
      nav: { label: "Sandbox", icon: <Palette size={17} /> },
    },
  ] : []),

  {
    // Se queda en producción a propósito: es la herramienta con la que se
    // diagnostica un «falta un dato en el panel», navegando el árbol de
    // AssetWorX y leyendo la propiedad en vivo.
    id: "assets",
    component: Assets,
    title: "Assets",
    sub: "Explorador de AssetWorX (ac:) y propiedades en vivo",
    nav: { label: "Assets", icon: <Boxes size={17} /> },
  },

  /* ---- Rutas ocultas (sin `nav`) --------------------------------- */
  {
    // No aparece en el sidebar: se llega navegando desde una tarjeta de
    // máquina, con params { machineId, from }.
    id: "machine-detail",
    component: MachineDetail,
    title: "Detalle de máquina",
    sub: "Métricas y estado del equipo seleccionado",
  },
];
