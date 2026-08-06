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
 *  - Las 13 rutas de `src/prototypes/` (Sandbox, Planta v2 y las diez
 *    variantes de área), que eran propuestas de diseño en evaluación. La
 *    carpeta entera se borró siguiendo su propia receta de retirada.
 *  - `Sankey`, que era una prueba de d3-sankey sin uso operativo.
 *  - `Data`, que hace altas, escrituras y BORRADOS contra `db:Northwind`, la
 *    base de ejemplo de ICONICS. El backend bloquea hoy la escritura
 *    (`ICONICS_READ_ONLY`), pero un botón «Eliminar» en un tablero de planta
 *    no debe existir aunque no funcione.
 *
 * Sus módulos siguen en el árbol —`features/data/`, `features/sankey/`— sin
 * que nadie los importe, así que no entran en el bundle. Si Data vuelve,
 * vuelve detrás de autenticación y sin la pestaña de borrado.
 */
import { FlaskConical, Gauge, Boxes, LayoutDashboard } from "lucide-react";

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
  {
    id: "area-REC",
    component: Rectificadoras,
    title: "Resonac · Rectificadoras",
    sub: "Monitor general de las multi-rectificadoras 10, 11 y 13",
    nav: { label: "Rectificadoras", icon: <Gauge size={16} />, group: "vistas-resonac" },
  },

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
