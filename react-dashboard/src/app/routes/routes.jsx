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
 * Sin `nav`, la ruta existe pero no aparece en el sidebar.
 *
 * El orden de este array es el orden del sidebar. Las rutas con `group` se
 * agrupan bajo su cabecera, y el grupo aparece en la posición de su primer
 * hijo; ver `./index.js`.
 *
 * ── QUÉ ENTRA AQUÍ ─────────────────────────────────────────────────
 *
 * Este archivo define la superficie de la aplicación en planta, así que la
 * pregunta antes de añadir una ruta es si un operador debe poder abrirla en
 * un monitor sin teclado.
 *
 * Por ese criterio quedó fuera `features/data/`, que hace altas, escrituras y
 * BORRADOS de puntos sueltos. El backend bloquea hoy la escritura
 * (`ICONICS_READ_ONLY`), pero un botón «Eliminar» en un tablero de planta no
 * debe existir aunque no funcione. Su módulo sigue en el árbol sin que nadie
 * lo importe, así que no entra en el bundle; si vuelve, vuelve detrás de
 * autenticación y sin la pestaña de borrado.
 *
 * ── QUÉ SE FUE, Y POR QUÉ NO QUEDÓ OCULTO ──────────────────────────
 *
 * Hasta agosto de 2026 este registro tenía además el tablero de Resonac —la
 * planta, sus dos áreas, el detalle de máquina con el OEE y sus tres factores,
 * dos vistas 3D y doce propuestas de diseño— y una constante `SOLO_DEMO_EVA`
 * que se limitaba a quitarles el `nav`: la ruta seguía existiendo, seguía
 * navegable escribiendo su id en la barra de direcciones, y su código seguía
 * viajando en el bundle.
 *
 * Aquello era lo correcto MIENTRAS la transición estaba en duda, porque volver
 * costaba un carácter. Terminada la transición dejó de serlo: un interruptor
 * que nadie va a mover no documenta una decisión, sólo mantiene vivo el código
 * que la decisión retiró. Con las rutas fuera, `SOLO_DEMO_EVA`, `DEFAULT_ROUTE`
 * derivado y el filtro `esDemoEva` sobran, y la lista vuelve a ser lo que
 * aparenta ser: lo que la aplicación enseña.
 */
import { lazy } from "react";
import { Box, Boxes, Cog, Factory, LayoutDashboard } from "lucide-react";

/** Ruta que se muestra al arrancar la app. */
export const DEFAULT_ROUTE = "eva-planta";

/** Cabeceras de los grupos desplegables del sidebar. */
export const NAV_GROUPS = {
  "eva-3d": { label: "3D", icon: <Box size={17} /> },
};

/*
 * La demo de SISTEMAS DE AGUA INDUSTRIAL, sobre `ac:TDCON/DEMO/SENSORES/`.
 * Todo su código vive en `src/Demo-EVA/`. Ver docs/PLAN-8-DEMO-EVA.md.
 *
 * ── POR QUÉ TODAS VAN CON `lazy()` ─────────────────────────────────
 *
 * Por la pila 3D. `three` + r3f + drei pesan del orden del bundle entero, así
 * que las dos vistas 3D tienen que quedar fuera del arranque o la pantalla de
 * Planta las descargaría sin usarlas. El reparto que lo sostiene está en
 * `vite.config.js` (`PAQUETES_3D`) y la comprobación en
 * `scripts/verificar-bundle.mjs`, que hay que ejecutar tras cada build.
 *
 * Las dos vistas 2D van igual por coherencia y porque el trozo de arranque
 * tiene techo comprobado en ese mismo guion: cada una arrastra su dominio, sus
 * tiles y su fuente de datos, y quien abre Planta no las va a ver.
 *
 * Se importa el ARCHIVO de cada vista y no un barril del módulo: un `lazy()`
 * sobre un `index.js` hace que Rollup nombre el trozo según su módulo de
 * entrada y genere un segundo `index-*.js`, que es exactamente lo que dejó de
 * medir el presupuesto del arranque cuando pasó con el asistente.
 */
export const ROUTES = [
  {
    id: "eva-planta",
    component: lazy(() => import("@/Demo-EVA/views/PlantaEva.jsx")),
    title: "Planta",
    sub: "Sistema de agua industrial · las ocho señales de ac:TDCON/DEMO/SENSORES/",
    nav: { label: "Planta", icon: <LayoutDashboard size={17} /> },
  },

  {
    id: "eva-maquina-3d",
    component: lazy(() => import("@/Demo-EVA/views/EquipoEva3D.jsx")),
    title: "Máquina 3D",
    sub: "El grupo de bombeo se comporta según el estado derivado de sus señales",
    nav: { label: "Máquina 3D", icon: <Cog size={16} />, group: "eva-3d" },
  },

  {
    id: "eva-maqueta",
    component: lazy(() => import("@/Demo-EVA/views/MaquetaEva3D.jsx")),
    title: "Maqueta 3D",
    sub: "La instalación en miniatura · el nivel del tanque es el dato en vivo",
    nav: { label: "Maqueta 3D", icon: <Factory size={16} />, group: "eva-3d" },
  },

  {
    // Se queda en producción a propósito: es la herramienta con la que se
    // diagnostica un «falta un dato en el panel», navegando el árbol de
    // AssetWorX y leyendo la propiedad en vivo.
    id: "eva-assets",
    component: lazy(() => import("@/Demo-EVA/views/AssetsEva.jsx")),
    title: "Assets",
    sub: "Los ocho puntos de la demo, con su valor y su calidad en crudo",
    nav: { label: "Assets", icon: <Boxes size={17} /> },
  },
];
