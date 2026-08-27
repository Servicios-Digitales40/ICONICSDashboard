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
import {
  Bell, Box, Boxes, Cog, Droplets, Factory, Home, LayoutDashboard, Power, ShieldAlert, Waves,
} from "lucide-react";

/**
 * Ruta que se muestra al arrancar la app. `eva-inicio` es la landing de la
 * demo: prueba con una lectura en vivo que el dato es real y ofrece las
 * cuatro vistas como entradas propias, antes de que el prospecto elija.
 */
export const DEFAULT_ROUTE = "eva-inicio";

/** Cabeceras de los grupos desplegables del sidebar. */
/**
 * Las secciones del sidebar.
 *
 * ── POR QUÉ LA PLANTA SE PARTE EN DOS ──────────────────────────────
 *
 * Porque son DOS MÁQUINAS que no comparten nada: la estación de llenado
 * —tanque, bomba, red— cuelga de PLC_1, y el sistema de vibraciones —otro
 * motor, otro variador— de PLC_2. Están en la misma planta y en el mismo
 * servidor, y ahí se acaba el parecido.
 *
 * Con las nueve vistas en una sola lista, la separación existía sólo en la
 * cabeza de quien ya la sabía: «Riesgos» y «Vibraciones» salían seguidas y
 * nada decía que hablaban de instalaciones distintas. La primera persona que
 * cruzara el caudal de una con la vibración de la otra estaría uniendo dos
 * máquinas que no se tocan — el mismo error que `shared/eva/sistemas.js`
 * existe para evitarle al asistente.
 *
 * «General» agrupa lo que es del SERVIDOR y no de una máquina: el historial
 * de alarmas y el navegador de puntos valen para las dos.
 */
export const NAV_GROUPS = {
  "sec-llenado": { label: "Estación de llenado", icon: <Droplets size={17} /> },
  "sec-vibraciones": { label: "Estación de vibraciones", icon: <Waves size={17} /> },
  "sec-general": { label: "General", icon: <Boxes size={17} /> },
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
    id: "eva-inicio",
    component: lazy(() => import("@/Demo-EVA/views/InicioEva.jsx")),
    title: "Inicio",
    sub: "Sistema de agua industrial · datos en vivo de ac:TDCON/DEMO/SENSORES/",
    nav: { label: "Inicio", icon: <Home size={17} />, group: "sec-llenado" },
  },

  {
    id: "eva-planta",
    component: lazy(() => import("@/Demo-EVA/views/PlantaEva.jsx")),
    title: "Gráficas",
    sub: "Sistema de agua industrial · las ocho señales de ac:TDCON/DEMO/SENSORES/",
    nav: { label: "Gráficas", icon: <LayoutDashboard size={17} />, group: "sec-llenado" },
  },

  {
    // Va justo detrás de «Planta» a propósito: contesta la pregunta siguiente.
    // «Planta» dice qué está pasando; ésta, qué puede pasar si sigue así.
    id: "eva-riesgos",
    component: lazy(() => import("@/Demo-EVA/views/RiesgosEva.jsx")),
    title: "Riesgos",
    sub: "Qué puede pasar según cómo está la instalación ahora · límites estimados por nosotros",
    nav: { label: "Riesgos", icon: <ShieldAlert size={17} />, group: "sec-llenado" },
  },

  {
    // Detrás de las dos de diagnóstico, pero ANTES de las 3D: es una acción
    // operativa de primer nivel (encender/apagar la bomba), no un diagnóstico.
    id: "eva-controles",
    component: lazy(() => import("@/Demo-EVA/views/ControlesEva.jsx")),
    title: "Controles",
    sub: "Encendido y apagado directo de la bomba de la instalación",
    nav: { label: "Controles", icon: <Power size={17} />, group: "sec-llenado" },
  },

  {
    id: "eva-maqueta",
    component: lazy(() => import("@/Demo-EVA/views/MaquetaEva3D.jsx")),
    title: "Vista 3D",
    sub: "La instalación en miniatura · el nivel del tanque es el dato en vivo",
    nav: { label: "Vista 3D", icon: <Box size={17} />, group: "sec-llenado" },
  },

  /*
   * ── EL SEGUNDO SISTEMA ──────────────────────────────────────────
   *
   * Sección APARTE, y no unas pantallas más de la estación de llenado, porque
   * es OTRA MÁQUINA: otro motor, otro variador, otro PLC. Mezclarlas
   * invitaría a leerlas juntas, y la primera correlación que alguien sacara
   * entre el caudal del tanque y la vibración de aquí uniría dos
   * instalaciones que no se tocan.
   */
  {
    id: "vib-inicio",
    component: lazy(() => import("@/Demo-EVA/views/InicioVibraciones.jsx")),
    title: "Inicio · Vibraciones",
    sub: "Sistema de vibraciones · qué contesta la máquina ahora mismo",
    nav: { label: "Inicio", icon: <Home size={17} />, group: "sec-vibraciones" },
  },

  {
    // Se llama «Gráficas» —no «Vibraciones»— por el mismo criterio que en la
    // estación de llenado: la entrada nombra lo que la pantalla ENSEÑA, no la
    // máquina, que ya la nombra la sección. Aquí no hay curvas todavía porque
    // de este sistema no se usa el histórico (ver `sistemas.js`): lo que se ve
    // son las medidas del instante, con su escala y su banda de norma.
    id: "eva-vibraciones",
    component: lazy(() => import("@/Demo-EVA/views/VibracionesEva.jsx")),
    title: "Gráficas · Vibraciones",
    sub: "Estado mecánico del sistema de vibraciones · sólo el instante, sin histórico",
    nav: { label: "Gráficas", icon: <LayoutDashboard size={17} />, group: "sec-vibraciones" },
  },

  {
    // Todavía sin construir, y es el placeholder con más cuidado de los dos:
    // esta pantalla ESCRIBIRÁ en el PLC. Un botón que parezca operativo y no
    // lo sea es peor que no tener pantalla, así que no hay ninguno.
    id: "vib-controles",
    component: lazy(() => import("@/Demo-EVA/views/ControlesVibraciones.jsx")),
    title: "Controles · Vibraciones",
    sub: "Encendido y apagado del sistema de vibraciones · todavía sin construir",
    nav: { label: "Controles", icon: <Power size={17} />, group: "sec-vibraciones" },
  },

  {
    // Su propio «Riesgos», separado del de la estación de llenado: aquél
    // evalúa el tanque —nivel, presión, caudal— y éste un motor con
    // acelerómetros. Las dos listas juntas serían la invitación a buscar una
    // relación entre ellas que no existe.
    id: "eva-riesgos-vibracion",
    component: lazy(() => import("@/Demo-EVA/views/RiesgosVibracionEva.jsx")),
    title: "Riesgos · Vibraciones",
    sub: "Qué se deduce del estado mecánico · evidencia separada de la hipótesis",
    nav: { label: "Riesgos", icon: <ShieldAlert size={17} />, group: "sec-vibraciones" },
  },

  {
    // Todavía sin construir, y en el sidebar a propósito: el sitio está
    // decidido y el contenido no. Ver la cabecera de la vista para por qué no
    // hay una escena provisional mientras tanto.
    id: "vib-3d",
    component: lazy(() => import("@/Demo-EVA/views/VibracionesEva3D.jsx")),
    title: "Vista 3D · Vibraciones",
    sub: "Gemelo digital del sistema de vibraciones · todavía sin construir",
    nav: { label: "Vista 3D", icon: <Box size={17} />, group: "sec-vibraciones" },
  },

  {
    // Historial, no un semáforo de alarmas activas — ver la cabecera de
    // `data/alarmas.js`. `GET /api/iconics/alarms` es lo único que hay hoy:
    // el evento "activo ahora" necesitaría otra llamada al servidor.
    id: "eva-alarmas",
    component: lazy(() => import("@/Demo-EVA/views/AlarmasEva.jsx")),
    title: "Alarmas",
    sub: "Historial de eventos de la instalación",
    nav: { label: "Alarmas", icon: <Bell size={17} />, group: "sec-general" },
  },

  {
    // Se queda en producción a propósito: es la herramienta con la que se
    // diagnostica un «falta un dato en el panel», navegando el árbol de
    // AssetWorX y leyendo la propiedad en vivo.
    id: "eva-assets",
    component: lazy(() => import("@/Demo-EVA/views/AssetsEva.jsx")),
    title: "Assets",
    sub: "Los ocho puntos de la demo, con su valor y su calidad en crudo",
    nav: { label: "Assets", icon: <Boxes size={17} />, group: "sec-general" },
  },

  {
    // Sin `nav`: no es una pantalla a la que un operador llegue en frío desde
    // el sidebar —¿de qué activo?—, sino un destino de detalle. Se llega
    // desde la ficha de un activo en la Maqueta 3D («Ver detalle completo»),
    // con `?activo=` en la URL. Genérica para los cuatro activos: ver
    // `domain/activos.js`.
    id: "eva-detalle",
    component: lazy(() => import("@/Demo-EVA/views/DetalleActivo.jsx")),
    title: "Detalle de activo",
    sub: "Cada variable, con su valor y su histórico completo",
  },
];
