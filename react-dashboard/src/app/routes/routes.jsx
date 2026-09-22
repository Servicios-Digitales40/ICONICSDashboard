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
 *     nav?:      { icon, group? }
 *     rol?:      string   — rol MÍNIMO para verla (Plan 35 F3)
 *   }
 *
 * Sin `nav`, la ruta existe pero no aparece en el sidebar.
 *
 * ── QUÉ HACE `rol`, Y QUÉ NO HACE ──────────────────────────────────
 *
 * Sin `rol`, la vista es para cualquiera con sesión. Con él, se pide ese rol
 * o superior —la jerarquía vive en `@shared/roles.js`, la misma que usa el
 * backend—, y entonces pasan dos cosas: **desaparece del menú** y, si alguien
 * llega por URL, la pantalla explica que no le corresponde en vez de cargar y
 * romperse.
 *
 * **Esto NO es la protección.** Las rutas de este registro siguen siendo
 * navegables escribiendo su id, y el código de la vista viaja igualmente al
 * navegador: cualquiera puede leerlo o llamar a la API con `curl`. Quien
 * protege es `exigirRol` en el backend (Plan 35 F2), que devuelve 403 aunque
 * la pantalla se salte entera.
 *
 * Lo que `rol` evita es ofrecer un camino que termina en un error: una
 * entrada de menú que lleva a una vista incapaz de cargar nada, o un botón
 * que devuelve 403 al pulsarlo. «Un botón que puede fallar es peor que su
 * ausencia» (`DESIGN.md`).
 *
 * ── DÓNDE ESTÁ EL TEXTO ────────────────────────────────────────────
 *
 * Aquí ya no. El encabezado, el subtítulo y la etiqueta del sidebar viven en
 * `i18n/locales/<idioma>/navigation.json`, indexados por ESTE `id`:
 *
 *   "eva-inicio": { "title": …, "nav": …, "sub": … }
 *
 * Así que añadir una ruta son dos ediciones y no una: la entrada aquí y su
 * bloque en los dos idiomas. Se eligió así en vez de dejar el español aquí
 * como respaldo porque tenerlo en dos sitios es una divergencia esperando a
 * pasar (CLAUDE.md §4.2) — y olvidar el bloque no pasa desapercibido:
 * `scripts/verificar-i18n.mjs` recorre este registro y falla nombrando la
 * ruta a la que le falta texto.
 *
 * El `id` es la clave y NO se traduce: lo usan la navegación, el estado de la
 * URL y `SECCION_DE_PAGINA`.
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
  Bell, Box, Boxes, BrainCircuit, ClipboardList, Cog, Database, Droplets, Factory, FileText, HeartPulse, Home, Inbox,
  LayoutDashboard, MessageSquareText, NotebookPen, Waves,
  /* `Power` se va con la estación de llenado (rama `Vibraciones1.0`): lo usaba
     `eva-controles`, y `vib-controles` sigue sin `nav`. Vuelve al reabrir.

     `ShieldAlert` se va con «Riesgos» (Plan 33 F10): esa vista salió del menú
     al unificarse con «Hallazgos». Vuelve si se restaura su `nav`. */
} from "lucide-react";

/**
 * Ruta que se muestra al arrancar la app.
 *
 * `eva-muro` desde el Plan 40 F2 (21-09-2026): todas las máquinas a la vez.
 * Fue `vib-inicio` —el Inicio de la máquina de vibraciones escrita a mano—
 * desde la rama `Vibraciones1.0` (17-09-2026), y antes `eva-inicio`, la
 * landing del tanque; con esa máquina cerrada por mantenimiento el arranque
 * caía en una pantalla fuera del menú. Las máquinas de vibraciones son ahora
 * configuradas y cada una tiene su sección; ninguna es «la» de entrada.
 *
 * Para reabrir la estación de llenado, esto puede volver a `eva-inicio`.
 */
export const DEFAULT_ROUTE = "eva-muro";

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
 * máquinas que no se tocan — el mismo error que `shared/eva/comun/sistemas.js`
 * existe para evitarle al asistente.
 *
 * «General» agrupa lo que es del SERVIDOR y no de una máquina: el historial
 * de alarmas y el navegador de puntos valen para las dos.
 */
/**
 * ── EL MÓDULO DE CADA SECCIÓN, DECLARADO (Plan 25 F5 · `NUE-07`) ───
 *
 * `modulo` no es una etiqueta de presentación: es la frontera de `CLAUDE.md`
 * §2.1 y §4.7 —qué FUENTE DE DATOS hay detrás— escrita en un campo en vez de
 * en un comentario.
 *
 * Hasta hoy esta separación existía sólo en la prosa de aquí abajo, y eso tiene
 * un modo de fallo concreto: una sección nueva no hereda un comentario. Quien
 * añada `sec-loquesea` sin pensar en su fuente la cuelga junto a las de
 * ICONICS, y el sidebar la presenta como una más — que es exactamente cómo
 * Predicción estuvo dentro de «General» hasta el 03-09-2026.
 *
 * Los ids salen de `shared/modulos.js`, que es el registro de verdad;
 * `verificar-modulos.mjs` ya vigila que nadie cruce fuentes, y ahora la
 * navegación habla su mismo vocabulario.
 */
export const NAV_GROUPS = {
  "sec-llenado": { icon: <Droplets size={17} />, modulo: "monitoreo" },
  /* «Planta» (Plan 40 F2): lo que no es de una máquina concreta —alarmas del
     servidor, bandeja y avisos de todas, casos y RAG—. Hasta el 21-09-2026 se
     llamaba «sec-vibraciones» y alojaba además la máquina escrita a mano; las
     máquinas van ahora cada una en su sección `maq:<id>`. */
  "sec-planta": { icon: <Factory size={17} />, modulo: "monitoreo" },
  "sec-general": { icon: <Boxes size={17} />, modulo: "monitoreo" },
  /*
   * ── PREDICCIÓN NO ES UNA SECCIÓN MÁS: ES OTRO MÓDULO ───────────────
   *
   * Las tres secciones de arriba son el módulo de Monitoreo y Diagnóstico:
   * dos máquinas de planta y lo que es del servidor que las sirve. Todo eso
   * entra por ICONICS.
   *
   * Ésta no. Es un compresor REAL cuyo histórico vive en otro backend
   * (Django), y la separación no es de presentación: es la frontera entre
   * módulos que `CLAUDE.md` §2.1 y §4.7 declaran, y que existe para que
   * nadie cruce dos fuentes de datos distintas. Colgarla de «General»
   * —donde estuvo hasta el 03-09-2026— la archivaba junto a Alarmas y
   * Assets, que sí son de este servidor.
   *
   * Ver `docs/completados/PLAN-19-MODULARIZACION.md` F1.
   */
  "sec-prediccion": { icon: <BrainCircuit size={17} />, modulo: "prediccion" },
  /*
   * El origen de conocimiento del asistente, no una máquina: qué manuales
   * alimentan su búsqueda documental. Sección aparte por el mismo motivo que
   * separa las otras dos — no es de ninguna instalación concreta, y menos
   * aún de las dos que ya tiene la planta.
   *
   * `modulo: "monitoreo"` porque es el conocimiento con el que se diagnostica
   * ESTA planta: sus manuales y sus casos son de estas máquinas. No es una
   * tercera fuente de datos, que es lo que este campo distingue.
   */
  "sec-rag": { icon: <Database size={17} />, modulo: "monitoreo" },
};

/*
 * La demo de SISTEMAS DE AGUA INDUSTRIAL, sobre `ac:TDCON/DEMO/SENSORES/`.
 * Todo su código vive en `src/Demo-EVA/`. Ver docs/completados/PLAN-8-DEMO-EVA.md.
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
  /*
   * ── LA ESTACIÓN DE LLENADO ESTÁ CERRADA POR MANTENIMIENTO ──────────
   *
   * Rama `Vibraciones1.0`, 17-09-2026. Las cinco vistas del tanque pierden su
   * `nav` y por tanto su sección entera del sidebar: `buildNav` deriva las
   * secciones de las rutas que traen `nav`, así que «Estación de llenado»
   * desaparece sola sin una lista paralela que mantener.
   *
   * ── POR QUÉ SIN `nav` Y NO BORRADAS ────────────────────────────────
   *
   * Es el patrón que este registro ya usa dos veces —`vib-controles` y
   * `eva-muro`—: la ruta sigue existiendo y sigue navegable escribiendo su id,
   * pero no se ofrece. Borrarlas obligaría a reescribirlas para volver, y lo
   * que se quiere es justo lo contrario: que volver cueste una línea.
   *
   * El código del tanque NO se toca en esta rama. Se consulta cuando hace
   * falta —es el módulo maduro y el espejo del que copiar— y no se modifica.
   *
   * **Para reabrir**: devolver el `nav` a estas cinco (los iconos siguen
   * importados a propósito, ver el bloque de `lucide-react`), poner
   * `DEFAULT_ROUTE` en `eva-inicio` y volver a montar `EvaProvider` sin acotar
   * en `App.jsx`. Ver `docs/completados/PLAN-32-VIBRACIONES.md` F1.
   */
  {
    id: "eva-inicio",
    component: lazy(() => import("@/Demo-EVA/views/tanque/InicioTanque.jsx")),
  },

  {
    id: "eva-planta",
    component: lazy(() => import("@/Demo-EVA/views/tanque/PlantaTanque.jsx")),
  },

  {
    // Va justo detrás de «Planta» a propósito: contesta la pregunta siguiente.
    // «Planta» dice qué está pasando; ésta, qué puede pasar si sigue así.
    id: "eva-riesgos",
    component: lazy(() => import("@/Demo-EVA/views/tanque/RiesgosTanque.jsx")),
  },

  {
    // Detrás de las dos de diagnóstico, pero ANTES de las 3D: es una acción
    // operativa de primer nivel (encender/apagar la bomba), no un diagnóstico.
    id: "eva-controles",
    component: lazy(() => import("@/Demo-EVA/views/tanque/ControlesTanque.jsx")),
  },

  {
    id: "eva-maqueta",
    component: lazy(() => import("@/Demo-EVA/views/tanque/MaquetaTanque3D.jsx")),
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
    // Reactivada el 10-09-2026 (Plan 27): dos pestañas, no una. «Historial»
    // sigue siendo lo de siempre —`GET /api/iconics/alarms`, eventos de
    // GENESIS64, nunca un semáforo—; «En vivo» es nueva, las ocho señales
    // `naturaleza: "alarma"` del PLC, que no tienen nada que ver con esa
    // fuente. Ver la cabecera de `AlarmasEva.jsx`.
    //
    // ── ESTUVO OCULTA DEL SIDEBAR (2026-08-31 a 2026-09-10) ─────────────
    //
    // El botón de campana del Topbar sondeaba el conteo de eventos cada 30s
    // en TODAS las pantallas, no sólo en ésta, así que ocultar sólo la
    // entrada del menú no bastaba para cortar las peticiones — se quitaron
    // los dos. El botón del Topbar SIGUE comentado a propósito: no se
    // reactiva sólo porque la página vuelve al menú, sigue sondeando la
    // fuente equivocada (el historial, no las ocho señales en vivo) y con el
    // mismo coste. Si se quiere un contador ahí, que cuente
    // `activo.alarmas.activas` del sistema en vivo, no `useAlarmCount()`.
    id: "eva-alarmas",
    component: lazy(() => import("@/Demo-EVA/views/comunes/AlarmasEva.jsx")),
    nav: { icon: <Bell size={17} />, group: "sec-planta", apartado: "visualizacion" },
  },
  {
    /*
     * ── POR QUÉ ES UNA VISTA NORMAL, NO «SÓLO MURO» ────────────────────
     *
     * `?muro=1` es una capa de presentación que le quita el cromo a
     * CUALQUIER ruta — no hay precedente de una vista que exista sólo para
     * ese modo, y ésta no rompe el patrón: sirve también fuera de muro, para
     * ver el resumen de las dos máquinas de un vistazo.
     *
     * Oculta del sidebar para esta demo (sin `nav`, ver la cabecera del
     * archivo) — la ruta sigue existiendo, sólo no aparece en el menú.
     * Restaurar: devolver `nav: { icon: <Power size={17} />, group: "sec-general" }`.
     */
    /* La pantalla de entrada desde el Plan 40 F2: todas las máquinas a la vez.
       Hasta entonces era una vista sin menú y la entrada era el Inicio de la
       máquina de vibraciones escrita a mano. */
    id: "eva-muro",
    component: lazy(() => import("@/Demo-EVA/views/comunes/MuroPlanta.jsx")),
    nav: { icon: <Factory size={17} />, group: "sec-planta", apartado: "visualizacion" },
  },


  /*
   * ── LAS VISTAS DE UNA MÁQUINA CONFIGURADA (Plan 37 F1) ─────────────
   *
   * Cuatro rutas GENÉRICAS, sin `nav` propio: no pertenecen a ninguna máquina
   * hasta que una las reclama. Cada máquina configurada en servicio produce en
   * el menú su propia sección con estas cuatro dentro (`buildNav`), y la
   * máquina viaja en `?maquina=<id>`, que es lo que `MaquinaProvider` lee
   * cuando la ruta no es de ninguna (Plan 33 F6).
   *
   * Son los MISMOS componentes que la máquina escrita a mano, parametrizados
   * por la máquina de la pantalla (Plan 37 F3). Una vista por TIPO, no una
   * copia por máquina: el día que se configure la segunda, no se añade nada
   * aquí.
   *
   * `porMaquina` es lo que las marca; el `icon` es el de la entrada, y
   * `iconoSeccion` el de la sección de la máquina.
   */
  {
    id: "maq-inicio",
    component: lazy(() => import("@/Demo-EVA/views/vibraciones/InicioVibraciones.jsx")),
    porMaquina: { icon: <Home size={17} />, iconoSeccion: <Waves size={17} />, apartado: "visualizacion" },
  },
  {
    id: "maq-graficas",
    component: lazy(() => import("@/Demo-EVA/views/vibraciones/Vibraciones.jsx")),
    porMaquina: { icon: <LayoutDashboard size={17} />, apartado: "visualizacion" },
  },
  {
    id: "maq-3d",
    component: lazy(() => import("@/Demo-EVA/views/vibraciones/Vibraciones3D.jsx")),
    porMaquina: { icon: <Box size={17} />, apartado: "visualizacion" },
  },
  {
    /*
     * Riesgos de la máquina configurada (Plan 40 F2). Sin entrada de menú:
     * está unificada en Hallazgos (Plan 33 F10), pero sigue siendo el destino
     * de la Bandeja, de los Avisos y del asistente cuando llama a
     * `riesgos_activos`. Hasta el 21-09-2026 era `eva-riesgos-vibracion`, de
     * la máquina escrita a mano.
     */
    id: "maq-riesgos",
    rol: "operador",
    component: lazy(() => import("@/Demo-EVA/views/vibraciones/RiesgosVibracion.jsx")),
    porMaquina: { oculta: true },
  },
  /*
   * Diagnóstico y Documentación de una máquina configurada (Plan 38 F2). Son
   * las mismas vistas que la máquina escrita a mano —leen la máquina de la
   * pantalla por `useMaquina()`/`useDominioVibracion()`— y valen porque desde
   * el Plan 38 F1 el backend registra las configuradas: los casos, el motor
   * de diagnóstico y los manuales las conocen.
   */
  {
    id: "maq-hallazgos",
    rol: "operador",
    component: lazy(() => import("@/Demo-EVA/views/comunes/BandejaEva.jsx")),
    porMaquina: { icon: <Inbox size={17} />, apartado: "diagnostico" },
  },
  {
    id: "maq-avisos",
    rol: "operador",
    component: lazy(() => import("@/Demo-EVA/views/comunes/AvisosEva.jsx")),
    porMaquina: { icon: <MessageSquareText size={17} />, apartado: "diagnostico" },
  },
  {
    id: "maq-casos",
    rol: "operador",
    component: lazy(() => import("@/Demo-EVA/views/comunes/CasosRag.jsx")),
    porMaquina: { icon: <NotebookPen size={17} />, apartado: "documentacion" },
  },
  {
    id: "maq-rag",
    rol: "operador",
    component: lazy(() => import("@/Demo-EVA/views/comunes/DocumentacionRag.jsx")),
    porMaquina: { icon: <FileText size={17} />, apartado: "documentacion" },
  },

  {
    // Se queda en producción a propósito: es la herramienta con la que se
    // diagnostica un «falta un dato en el panel», navegando el árbol de
    // AssetWorX y leyendo la propiedad en vivo.
    id: "eva-assets",
    component: lazy(() => import("@/Demo-EVA/views/comunes/AssetsEva.jsx")),
    nav: { icon: <Boxes size={17} />, group: "sec-general" },
  },

  {
    /*
     * ── «CONFIGURACIÓN» VA JUNTO A ASSETS, Y NO EN UNA MÁQUINA ─────────
     *
     * Porque no es de ninguna: es donde se declara QUÉ máquinas existen, y
     * ponerla dentro de una obligaría a entrar en la máquina A para dar de alta
     * la B. Mismo criterio que Assets, con el que además comparte materia
     * prima — el árbol de ICONICS.
     *
     * Desde el Plan 36 también se da de alta y se edita desde aquí, marcando
     * los tres árboles de ICONICS. Lo que sigue sin poderse decidir en esta
     * pantalla es qué variables son escribibles: todo entra como lectura, y
     * la pantalla lo dice — ver la cabecera de `ConfiguracionPlanta.jsx`.
     *
     * ── ES EL PANEL DE ADMINISTRACIÓN (Plan 35 F3) ─────────────────────
     *
     * `rol: "administrador"` — el criterio del usuario: «el operador tendrá
     * acceso a la mayoría de cosas menos al futuro panel de administración,
     * donde vivirá la configuración y el alta de las máquinas».
     *
     * El backend ya lo impone: desde F2, todo `/api/maquinas` pide
     * `administrador`. Esto es lo que hace que **la pantalla diga lo mismo**,
     * en vez de ofrecer una entrada de menú que lleva a una vista que no va a
     * poder cargar nada.
     */
    id: "eva-configuracion",
    rol: "administrador",
    component: lazy(() => import("@/Demo-EVA/views/comunes/ConfiguracionPlanta.jsx")),
    nav: { icon: <Cog size={17} />, group: "sec-general" },
  },

  {
    /*
     * ── POR QUÉ «TURNO» VA EN GENERAL Y NO EN UNA MÁQUINA ──────────────
     *
     * Porque un turno no es de una máquina: quien entra a las seis se hace
     * cargo de la instalación entera. Mismo criterio que Alarmas y Assets.
     *
     * Cruza tres fuentes —el diario de accionamientos, los eventos derivados
     * del historiador y los casos cerrados— que hasta ahora había que mirar en
     * tres sitios distintos, y una de ellas ni siquiera se podía ver sin entrar
     * al servidor.
     */
    id: "eva-turno",
    rol: "operador",
    component: lazy(() => import("@/Demo-EVA/views/comunes/TurnoEva.jsx")),
    nav: { icon: <ClipboardList size={17} />, group: "sec-general" },
  },

  {
    /*
     * ── POR QUÉ VA EN «GENERAL», IGUAL QUE «TURNO» ─────────────────────
     *
     * Un hallazgo puede ser de cualquiera de las dos máquinas, así que la
     * bandeja misma no es de ninguna — cuelga aquí por el mismo motivo que
     * Alarmas, Assets y Turno.
     */
    id: "eva-bandeja",
    rol: "operador",
    component: lazy(() => import("@/Demo-EVA/views/comunes/BandejaEva.jsx")),
    nav: { icon: <Inbox size={17} />, group: "sec-planta", apartado: "diagnostico" },
  },

  {
    /*
     * ── POR QUÉ NO ES UNA PESTAÑA DE «HALLAZGOS» (Plan 31 F2) ──────────
     *
     * Porque el tono es distinto y mezclarlos estropea los dos. «Hallazgos» es
     * un INVENTARIO —una lista que puede ser larga y que se repasa—; esto es un
     * AVISO —«oye, mira esto»—. Juntos, o la lista larga se lee con la urgencia
     * del aviso, o el aviso se pierde dentro de una lista.
     *
     * Va JUSTO DETRÁS de «Hallazgos» a propósito: son las dos caras de lo
     * mismo, y el orden dice cuál se mira primero cuando hay prisa.
     *
     * En «General» por el mismo motivo que su vecina: un aviso puede ser de
     * cualquiera de las dos máquinas, así que la vista no es de ninguna.
     *
     * Es la única pantalla del tablero que llama a un modelo de lenguaje sin
     * que nadie haya escrito una pregunta. Por eso su vista explica, en su
     * cabecera, por qué el diagnóstico se dispara al ABRIRLA y no al activarse
     * el riesgo.
     */
    id: "eva-avisos",
    rol: "operador",
    component: lazy(() => import("@/Demo-EVA/views/comunes/AvisosEva.jsx")),
    nav: { icon: <MessageSquareText size={17} />, group: "sec-planta", apartado: "diagnostico" },
  },

  {
    /*
     * ── POR QUÉ VA EN «GENERAL», IGUAL QUE «TURNO» Y «HALLAZGOS» ───────
     *
     * Una nota puede ser de cualquiera de las dos máquinas, o de ninguna en
     * concreto («se fue la luz media hora») — el cuaderno mismo no es de
     * ninguna instalación.
     */
    id: "eva-cuaderno",
    rol: "operador",
    component: lazy(() => import("@/Demo-EVA/views/comunes/CuadernoEva.jsx")),
    nav: { icon: <NotebookPen size={17} />, group: "sec-general" },
  },


  {
    /*
     * ── POR QUÉ VA EN «GENERAL» Y NO EN UNA MÁQUINA ────────────────────
     *
     * Porque no habla de ninguna: habla del PUENTE. Es el mismo criterio por
     * el que aquí están Assets y Alarmas — «del servidor, no de una máquina
     * concreta».
     *
     * ── Y POR QUÉ ES UNA VISTA Y NO UN ICONITO EN LA BARRA ─────────────
     *
     * Porque lo que hace falta cuando algo va raro no cabe en un semáforo:
     * qué servicios hay montados, cuál falta, con qué variable se enciende,
     * qué modelo tiene puesto el asistente, y —lo primero de todo— si este
     * puente está sirviendo datos SIMULADOS. Hasta ahora ese primer paso era
     * entrar por SSH a leer logs.
     */
    id: "salud-sistema",
    component: lazy(() => import("@/Demo-EVA/views/comunes/SaludSistema.jsx")),
    nav: { icon: <HeartPulse size={17} />, group: "sec-general" },
  },

  /*
   * ── RAG: EL CONOCIMIENTO DEL ASISTENTE, NO UNA MÁQUINA ─────────────
   *
   * Sección propia y no una pestaña más de «General»: lo que hay aquí no
   * describe ninguna instalación de la planta, describe de dónde saca el
   * asistente lo que sabe fuera de lo que mide ICONICS. Ver la cabecera de
   * `Demo-EVA/views/comunes/DocumentacionRag.jsx` para el porqué de cada decisión de
   * la vista.
   */
  {
    /*
     * Va ANTES de «Documentación» a propósito. Las dos son fuentes de
     * conocimiento del asistente, pero ésta es la única que se llena SOLA
     * —cada cierre de diagnóstico, cada reparación contada por voz— y por
     * tanto la única que puede degradarse sin que nadie haga nada. Un
     * manual malo lo subió alguien; un caso basura aparece solo.
     */
    id: "rag-casos",
    rol: "operador",
    component: lazy(() => import("@/Demo-EVA/views/comunes/CasosRag.jsx")),
    nav: { icon: <NotebookPen size={17} />, group: "sec-planta", apartado: "documentacion" },
  },

  {
    id: "rag-documentacion",
    rol: "operador",
    component: lazy(() => import("@/Demo-EVA/views/comunes/DocumentacionRag.jsx")),
    nav: { icon: <FileText size={17} />, group: "sec-planta", apartado: "documentacion" },
  },

  /*
   * ── EL ORDEN AQUÍ ES LA FRONTERA ENTRE MÓDULOS (Plan 25 F5) ────────
   *
   * RAG se movió ARRIBA de Predicción el 12-09-2026. No es preferencia de
   * orden: `buildNav` coloca cada sección en la posición de su primer hijo,
   * y el sidebar abre una cabecera de módulo cada vez que el módulo cambia.
   * Con RAG (monitoreo) declarado DESPUÉS de Predicción, el menú abría tres
   * cabeceras para dos módulos y dejaba a Predicción partiendo en dos el
   * bloque de ICONICS — justo lo contrario de lo que la separación dice.
   *
   * Las secciones de un mismo módulo van seguidas. Lo comprueba
   * `sidebar-modulos.test.jsx`.
   */

  /*
   * ── PREDICCIÓN, FUERA DEL MENÚ (22-09-2026) ────────────────────────
   *
   * Las seis vistas del compresor salen del sidebar para TODOS los roles, a
   * petición del usuario: no se van a usar en esta demo.
   *
   * Se ocultan como se ocultó la estación de llenado y como está `eva-muro`:
   * quitando `nav`, no borrando la ruta. Siguen registradas y se abren por
   * URL, así que nada se pierde y volver es devolver una línea a cada una.
   * Borrarlas habría dejado el módulo `prediccion` declarado en
   * `shared/modulos.js` apuntando a pantallas que ya no existen.
   *
   * Restaurar: devolver a cada ruta su `nav`, que está escrito debajo en su
   * comentario. El grupo `sec-prediccion` sigue declarado arriba y vuelve a
   * aparecer solo en cuanto una ruta lo reclame.
   */
  {
    /*
     * ── POR QUÉ ESTA VISTA TIENE SECCIÓN PROPIA ────────────────────────
     *
     * Porque no habla de ninguna de las dos máquinas de planta. Las otras
     * pantallas de este registro leen el servidor ICONICS de ESTA planta;
     * ésta consulta OTRO backend —Django, en el puerto 8000— que sirve el
     * histórico de un compresor real.
     *
     * Colgarla de «Estación de llenado» o de «Estación de vibraciones» diría
     * que sus curvas son de ese tanque o de ese motor, y no lo son. Ése es
     * justo el cruce que la partición del sidebar existe para impedir, y aquí
     * sería peor que entre las dos máquinas de la planta: al menos ésas
     * comparten servidor.
     *
     * Hasta el 03-09-2026 colgaba de «General», que era el sitio menos malo
     * cuando esto era una prueba suelta. Dejó de serlo en cuanto pasó a ser
     * un módulo con su propia fuente de datos: «General» significa «del
     * servidor ICONICS, no de una máquina concreta», y esto no es ni lo uno
     * ni lo otro. Ver `docs/completados/PLAN-19-MODULARIZACION.md`.
     *
     * ── POR QUÉ «BETA» VA EN EL RÓTULO ─────────────────────────────────
     *
     * Porque depende de un servicio que puede no estar levantado. Si el
     * backend predictivo no responde, la pantalla no puede enseñar nada; el
     * resto del tablero no tiene esa dependencia. El rótulo lo dice antes de
     * que alguien lo descubra con una pantalla vacía.
     *
     * Su dirección se configura con `VITE_PREDICTION_API_BASE`.
     */
    id: "pred-inicio",
    component: lazy(() => import("@/modulos/prediccion/views/InicioCompresor.jsx")),
    /* Oculta (22-09-2026). Restaurar: `nav: { icon: <Home size={17} />, group: "sec-prediccion" }` */
  },
  {
    id: "pred-eventos",
    component: lazy(() => import("@/modulos/prediccion/views/EventosCompresor.jsx")),
    /* Oculta (22-09-2026). Restaurar: `nav: { icon: <BrainCircuit size={17} />, group: "sec-prediccion" }` */
  },

  /*
   * ── LAS CUATRO PANTALLAS PENDIENTES ────────────────────────────────
   *
   * Existen, se abren y no enseñan ningún dato: dicen qué van a enseñar y qué
   * falta exactamente para poder construirlas. No es un hueco esperando a
   * rellenarse con datos de ejemplo — ver la cabecera de
   * `modulos/prediccion/components/PantallaPendiente.jsx` para por qué un
   * placeholder con curvas plausibles sería peor que ninguna pantalla.
   *
   * Están registradas desde ya, y no ocultas tras una bandera, porque la
   * estructura del módulo ES la entrega de esta fase: enseña el alcance
   * acordado y deja ver, de un vistazo, cuánto falta. Las cuatro se desbloquean
   * con el contrato de la API (docs/completados/PLAN-19-MODULARIZACION.md §9.1).
   */
  {
    id: "pred-variables",
    component: lazy(() => import("@/modulos/prediccion/views/VariablesCompresor.jsx")),
    /* Oculta (22-09-2026). Restaurar: `nav: { icon: <Boxes size={17} />, group: "sec-prediccion" }` */
  },
  {
    id: "pred-historico",
    component: lazy(() => import("@/modulos/prediccion/views/HistoricoCompresor.jsx")),
    /* Oculta (22-09-2026). Restaurar: `nav: { icon: <LayoutDashboard size={17} />, group: "sec-prediccion" }` */
  },
  {
    id: "pred-correlacion",
    component: lazy(() => import("@/modulos/prediccion/views/CorrelacionCompresor.jsx")),
    /* Oculta (22-09-2026). Restaurar: `nav: { icon: <Cog size={17} />, group: "sec-prediccion" }` */
  },
  {
    id: "pred-pronostico",
    component: lazy(() => import("@/modulos/prediccion/views/PronosticoCompresor.jsx")),
    /* Oculta (22-09-2026). Restaurar: `nav: { icon: <Factory size={17} />, group: "sec-prediccion" }` */
  },


  {
    // Sin `nav`: no es una pantalla a la que un operador llegue en frío desde
    // el sidebar —¿de qué activo?—, sino un destino de detalle. Se llega
    // desde la ficha de un activo en la Maqueta 3D («Ver detalle completo»),
    // con `?activo=` en la URL. Genérica para los cuatro activos: ver
    // `domain/activos.js`.
    id: "eva-detalle",
    component: lazy(() => import("@/Demo-EVA/views/tanque/DetalleActivo.jsx")),
  },

  {
    // Sin `nav`, mismo criterio que `eva-detalle`: se llega con el botón
    // «Cerrar diagnóstico» de una tarjeta de riesgo (Riesgos, del tanque o
    // de vibraciones), con `?sistema=&riesgoId=` ya puestos — nunca en frío
    // desde el sidebar, porque sin un riesgo concreto no hay nada que
    // cerrar. Plan 16 Fase 5, UI A.
    id: "cierre-diagnostico",
    component: lazy(() => import("@/Demo-EVA/views/comunes/CierreDiagnostico.jsx")),
  },
];
