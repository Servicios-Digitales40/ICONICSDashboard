/**
 * app/routes/routes.jsx
 * ------------------------------------------------------------------
 * REGISTRO ÚNICO de rutas: la sola fuente de verdad sobre qué páginas
 * existen, en qué orden salen en el sidebar y qué título muestra el Topbar.
 *
 * Antes esto vivía en tres sitios que había que mantener sincronizados a
 * mano (el mapa `PAGES` de App.jsx, y `NAV` + `PAGE_META` de navConfig.jsx).
 * Añadir una página eran 3 ediciones; ahora es 1.
 *
 * Forma de una ruta:
 *   {
 *     id:        string   — clave de navegación, única
 *     component: Comp     — el componente de página
 *     title:     string   — encabezado del Topbar
 *     sub:       string   — subtítulo del Topbar
 *     nav?:      { label, icon, group? }
 *   }
 *
 * Sin `nav` → la ruta existe pero NO aparece en el sidebar (p. ej.
 * `machine-detail`, al que se llega pulsando una tarjeta de máquina).
 *
 * ⚠ EL ORDEN DE ESTE ARRAY ES EL ORDEN DEL SIDEBAR. Las rutas con `group`
 * se agrupan bajo la cabecera correspondiente, y el grupo aparece en la
 * posición de su PRIMER hijo. Ver `./index.js`.
 */
import { FlaskConical, Gauge, Database, Palette, Waypoints, Boxes, LayoutPanelTop, Sparkles, Radar, LayoutDashboard } from "lucide-react";

import { Dashboard } from "@/features/dashboard";
import { Data } from "@/features/data";
import { Assets } from "@/features/assets";
import { Sankey } from "@/features/sankey";
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

// Vistas de PROTOTIPO. Este archivo es el ÚNICO sitio de la app que importa
// de `@/prototypes/`: esa carpeta es hoja del grafo. Para retirarlas basta
// con borrar estas importaciones y sus 11 rutas — receta completa en
// src/prototypes/README.md.
import Sandbox from "@/prototypes/SandboxPage.jsx";
import DashboardV2 from "@/prototypes/dashboard-v2/DashboardV2.jsx";
import Area1Editorial from "@/prototypes/area-views/Area1Editorial.jsx";
import Area1Aurora from "@/prototypes/area-views/Area1Aurora.jsx";
import Area1AuroraV from "@/prototypes/area-views/Area1AuroraV.jsx";
import Area1Neon from "@/prototypes/area-views/Area1Neon.jsx";
import Area1NeonV from "@/prototypes/area-views/Area1NeonV.jsx";
import Area2Editorial from "@/prototypes/area-views/Area2Editorial.jsx";
import Area2Aurora from "@/prototypes/area-views/Area2Aurora.jsx";
import Area2AuroraV from "@/prototypes/area-views/Area2AuroraV.jsx";
import Area2Neon from "@/prototypes/area-views/Area2Neon.jsx";
import Area2NeonV from "@/prototypes/area-views/Area2NeonV.jsx";

/** Ruta que se muestra al arrancar la app. */
export const DEFAULT_ROUTE = "dashboard";

/** Cabeceras de los grupos desplegables del sidebar. */
export const NAV_GROUPS = {
  "vistas-resonac": { label: "Vistas Resonac", icon: <FlaskConical size={17} /> },
};

export const ROUTES = [
  {
    id: "dashboard",
    component: Dashboard,
    title: "Planta",
    sub: "Resumen del turno · OEE, producción y estado de los equipos",
    nav: { label: "Planta", icon: <LayoutDashboard size={17} /> },
  },
  {
    // PROPUESTA EN EVALUACIÓN · va justo detrás de «Planta» para poder saltar
    // de una a otra y comparar. Se retira con el resto de `src/prototypes/`.
    id: "dashboard-v2",
    component: DashboardV2,
    title: "Planta · propuesta v2",
    sub: "Propuesta en evaluación · mismos datos, 10 mejoras de diseño",
    nav: { label: "Planta · v2", icon: <LayoutDashboard size={17} /> },
  },
  {
    id: "data",
    component: Data,
    title: "Data",
    sub: "Lectura en vivo de puntos ICONICS",
    nav: { label: "Data", icon: <Database size={17} /> },
  },
  {
    id: "assets",
    component: Assets,
    title: "Assets",
    sub: "Explorador de AssetWorX (ac:) y propiedades en vivo",
    nav: { label: "Assets", icon: <Boxes size={17} /> },
  },
  {
    id: "sandbox",
    component: Sandbox,
    title: "Sandbox",
    sub: "Banco de pruebas",
    nav: { label: "Sandbox", icon: <Palette size={17} /> },
  },
  {
    id: "sankey",
    component: Sankey,
    title: "Diagramas Sankey",
    sub: "Prueba de d3-sankey · flujos y balances",
    nav: { label: "Sankey", icon: <Waypoints size={17} /> },
  },

  /* ---- Grupo «Vistas Resonac» ------------------------------------
   * El prefijo "A1 ·" / "A2 ·" mantiene la lista legible en la barra;
   * el nombre completo va en el Topbar vía `title`. */
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
  {
    id: "area1-editorial",
    component: Area1Editorial,
    title: "Área 1 Panel Editorial",
    sub: "Propuesta en evaluación · tarjeta compacta editorial",
    nav: { label: "A1 · Panel Editorial", icon: <LayoutPanelTop size={15} />, group: "vistas-resonac" },
  },
  {
    id: "area1-aurora",
    component: Area1Aurora,
    title: "Área 1 Aurora Hero",
    sub: "Propuesta en evaluación · tarjeta ancha con degradado vivo",
    nav: { label: "A1 · Aurora Hero", icon: <Sparkles size={15} />, group: "vistas-resonac" },
  },
  {
    id: "area1-aurora-v",
    component: Area1AuroraV,
    title: "Área 1 Aurora Vertical",
    sub: "Propuesta en evaluación · Aurora en formato vertical",
    nav: { label: "A1 · Aurora Vertical", icon: <Sparkles size={15} />, group: "vistas-resonac" },
  },
  {
    id: "area1-neon",
    component: Area1Neon,
    title: "Área 1 Neon Cyber HUD",
    sub: "Propuesta en evaluación · panel ancho estilo HUD",
    nav: { label: "A1 · Neon Cyber HUD", icon: <Radar size={15} />, group: "vistas-resonac" },
  },
  {
    id: "area1-neon-v",
    component: Area1NeonV,
    title: "Área 1 Neon HUD Vertical",
    sub: "Propuesta en evaluación · HUD en formato vertical",
    nav: { label: "A1 · Neon HUD Vertical", icon: <Radar size={15} />, group: "vistas-resonac" },
  },

  {
    id: "area-REC",
    component: Rectificadoras,
    title: "Resonac · Rectificadoras",
    sub: "Monitor general de las multi-rectificadoras 10, 11 y 13",
    nav: { label: "Rectificadoras", icon: <Gauge size={16} />, group: "vistas-resonac" },
  },
  {
    id: "area2-editorial",
    component: Area2Editorial,
    title: "Área 2 Panel Editorial",
    sub: "Propuesta en evaluación · tarjeta compacta editorial",
    nav: { label: "A2 · Panel Editorial", icon: <LayoutPanelTop size={15} />, group: "vistas-resonac" },
  },
  {
    id: "area2-aurora",
    component: Area2Aurora,
    title: "Área 2 Aurora Hero",
    sub: "Propuesta en evaluación · tarjeta ancha con degradado vivo",
    nav: { label: "A2 · Aurora Hero", icon: <Sparkles size={15} />, group: "vistas-resonac" },
  },
  {
    id: "area2-aurora-v",
    component: Area2AuroraV,
    title: "Área 2 Aurora Vertical",
    sub: "Propuesta en evaluación · Aurora en formato vertical",
    nav: { label: "A2 · Aurora Vertical", icon: <Sparkles size={15} />, group: "vistas-resonac" },
  },
  {
    id: "area2-neon",
    component: Area2Neon,
    title: "Área 2 Neon Cyber HUD",
    sub: "Propuesta en evaluación · panel ancho estilo HUD",
    nav: { label: "A2 · Neon Cyber HUD", icon: <Radar size={15} />, group: "vistas-resonac" },
  },
  {
    id: "area2-neon-v",
    component: Area2NeonV,
    title: "Área 2 Neon HUD Vertical",
    sub: "Propuesta en evaluación · HUD en formato vertical",
    nav: { label: "A2 · Neon HUD Vertical", icon: <Radar size={15} />, group: "vistas-resonac" },
  },

  /* ---- Rutas ocultas (sin `nav`) --------------------------------- */
  {
    // No aparece en el sidebar: se llega navegando desde una tarjeta de
    // máquina, con params { machineId, from, cardVariant? }.
    id: "machine-detail",
    component: MachineDetail,
    title: "Detalle de máquina",
    sub: "Métricas y estado del equipo seleccionado",
  },
];
