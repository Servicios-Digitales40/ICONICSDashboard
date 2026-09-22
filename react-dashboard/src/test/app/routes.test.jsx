/**
 * routes.test.jsx
 * ------------------------------------------------------------------
 * Qué vistas existen.
 *
 * ── POR QUÉ ESTA PRUEBA ────────────────────────────────────────────
 *
 * El registro de rutas es lo que define la superficie de la aplicación en
 * planta: lo que un operador puede abrir en un monitor sin teclado. Sus modos
 * de fallo son silenciosos —el build pasa, la app arranca— y sólo se ven en la
 * pantalla equivocada, en la pared, cuando ya no hay nadie mirando.
 *
 * Hasta agosto de 2026 esta prueba cubría además dos mecanismos que ya no
 * existen: la bandera `VITE_ENABLE_PROTOTYPES`, que añadía doce propuestas de
 * diseño sobre las vistas de Resonac, y el modo `SOLO_DEMO_EVA`, que ocultaba
 * el resto del tablero sin borrarlo. Los dos se fueron con la sección que
 * gateaban. Lo que queda es la invariante que sobrevive a esa historia: el
 * registro tiene que ser coherente consigo mismo y con el sidebar que produce.
 */
import { describe, expect, it } from "vitest";

import { ROUTES, DEFAULT_ROUTE, NAV_GROUPS } from "@/app/routes/routes.jsx";
import { NAV, PAGES, ROUTE_IDS } from "@/app/routes/index.js";
import { buildNav } from "@/app/routes/buildNav.js";
import { SISTEMAS } from "@shared/eva/comun/sistemas.js";

const ids = ROUTES.map((r) => r.id);

/*
 * ── LAS MÁQUINAS DE VIBRACIONES SON CONFIGURADAS (Plan 40 F2) ──────
 *
 * Hasta el 21-09-2026 había una máquina de vibraciones escrita a mano con
 * cinco rutas propias (`vib-inicio`, `eva-vibraciones`, `vib-controles`,
 * `eva-riesgos-vibracion`, `vib-3d`) y una sección `sec-vibraciones` que
 * además alojaba lo común de planta. Las cinco se retiraron: una máquina de
 * vibraciones es ahora una CONFIGURADA, que reclama las rutas genéricas
 * `maq-*` en su propia sección `maq:<id>`. Lo común pasó a «Planta».
 *
 * Donde una comprobación necesita una máquina, se le da ésta — es la misma
 * forma que devuelve el provider y la que ya usan las demás pruebas.
 */
const MAQUINA = { id: "vib-motor-03", nombre: "Nuevo-Modor", tipo: "vibraciones", activa: true };
const navConMaquina = () => buildNav(ROUTES, NAV_GROUPS, () => true, [MAQUINA]);

describe("superficie de la aplicación", () => {
  it("son las treinta y dos vistas, agrupadas por MÓDULO y por SISTEMA", () => {
    // El array va en el MISMO orden que el sidebar, y eso no es cosmético:
    // `buildNav` coloca cada sección en la posición de su primer hijo, así
    // que un bloque declarado fuera de sitio saldría bien en el menú y
    // dejaría este archivo diciendo otra cosa que la pantalla.
    //
    // El corte por sistema (agosto de 2026) es lo que ordena todo lo demás:
    // la estación de llenado cuelga de PLC_1 y el sistema de vibraciones de
    // PLC_2, y no comparten nada. Antes iban en una sola lista y la
    // separación existía sólo en la cabeza de quien ya la sabía.
    //
    // `eva-detalle` cierra la lista sin `nav`: no es una pantalla a la que un
    // operador llegue en frío —¿de qué activo?—, pero sigue siendo superficie
    // navegable. Si alguien esconde una vista detrás de una bandera, aquí se
    // ve.
    expect(ids).toEqual([
      // Estación de llenado — el tanque y su grupo de bombeo.
      "eva-inicio",
      "eva-planta",
      "eva-riesgos",
      "eva-controles",
      "eva-maqueta",
      // Planta — lo que no es de una máquina concreta. Las cinco rutas de la
      // máquina de vibraciones escrita a mano iban aquí hasta el Plan 40 F2;
      // ver el bloque de arriba.
      //
      // `salud-sistema` es la más «del servidor» de todas: no habla de ninguna
      // instalación, habla del PUENTE (Plan 20 F10).
      "eva-alarmas",
      "eva-muro",
      // Las de una máquina CONFIGURADA (Plan 37 F1): genéricas, sin `nav`
      // propio. Cada máquina configurada en servicio las reclama en su propia
      // sección con `?maquina=<id>`; aquí sólo existen.
      "maq-inicio",
      "maq-graficas",
      "maq-3d",
      // `maq-riesgos` (Plan 40 F2) existe y se navega con `?maquina=`, pero es
      // `oculta`: contesta lo mismo que «Hallazgos» con otro nombre (Plan 33
      // F10), así que no tiene entrada de menú. El asistente la usa de destino.
      "maq-riesgos",
      // Y las cuatro de Diagnóstico y Documentación (Plan 38 F2), que valen
      // porque el backend ya registra las configuradas.
      "maq-hallazgos",
      "maq-avisos",
      "maq-casos",
      "maq-rag",
      "eva-assets",
      // `eva-configuracion` (Plan 33 F5) va junto a Assets y no dentro de una
      // máquina: es donde se declara QUÉ máquinas existen, y meterla en una
      // obligaría a entrar en la máquina A para dar de alta la B. Comparte
      // además materia prima con Assets — el árbol de ICONICS.
      "eva-configuracion",
      // `eva-turno` (Plan 25 F2) va en General por el mismo criterio que sus
      // vecinas: un turno no es de una máquina, quien entra se hace cargo de la
      // instalación entera.
      "eva-turno",
      // `eva-bandeja` (Plan 25 F6) — igual: un hallazgo puede ser de cualquiera
      // de las dos máquinas, así que la bandeja no es de ninguna.
      "eva-bandeja",
      // `eva-avisos` (Plan 31 F2) — la otra cara de la bandeja: aquélla es un
      // INVENTARIO y ésta un AVISO. Va justo detrás a propósito, y en General
      // por el mismo motivo: un aviso puede ser de cualquiera de las dos.
      "eva-avisos",
      // `eva-cuaderno` (Plan 25 F8) — igual: una nota puede ser de cualquiera
      // de las dos, o de ninguna en concreto.
      "eva-cuaderno",
      // `eva-muro` (Plan 25 F10) — las dos máquinas A LA VEZ, así que tampoco
      // es de ninguna sola.
      "salud-sistema",
      // RAG — de dónde saca el asistente lo que sabe fuera de ICONICS. No es
      // de ninguna máquina, por eso tiene su propia sección y no cuelga de
      // «General».
      // Son sus DOS fuentes. Los casos van primero porque son la única
      // que se llena sola: cada cierre de diagnóstico, cada reparación
      // contada por voz.
      //
      // Va ANTES de Predicción desde el 12-09-2026 (Plan 25 F5): pertenece al
      // módulo `monitoreo`, y las secciones de un mismo módulo van seguidas
      // para que el sidebar no abra su cabecera dos veces.
      "rag-casos",
      "rag-documentacion",
      // Predicción — OTRO MÓDULO, no una sección más: un compresor real cuyo
      // histórico sirve otro backend. No entra por ICONICS, así que no puede
      // colgar de ninguna de las dos estaciones ni de «General», que significa
      // «del servidor ICONICS, no de una máquina». Ver CLAUDE.md §4.7.
      //
      // Cierra la lista de lo navegable a propósito: es la frontera entre
      // fuentes de datos, y en el menú se ve como el último bloque.
      //
      // Las cuatro últimas son pantallas PENDIENTES: se abren y dicen qué
      // falta para construirlas, sin dibujar un solo dato de ejemplo. Están
      // registradas y no escondidas tras una bandera a propósito — la
      // estructura del módulo es lo que se entregó en el Plan 19 F2, y un
      // sidebar que la enseña dice de un vistazo cuánto falta.
      "pred-inicio",
      "pred-eventos",
      "pred-variables",
      "pred-historico",
      "pred-correlacion",
      "pred-pronostico",
      // Sin `nav`: destinos de detalle, no pantallas a las que se llegue en
      // frío desde el sidebar.
      "eva-detalle",
      "cierre-diagnostico",
    ]);
  });

  it("no queda ninguna ruta de Resonac", () => {
    // La transición al modelo de agua retiró el tablero de OEE entero. Un id
    // suyo aquí significa que alguien lo revivió a medias: su vista ya no
    // existe y la ruta reventaría al abrirse.
    const deResonac = ids.filter(
      (id) => /^(dashboard|area-|maquina-3d|maqueta-3d|machine-detail|assets|sandbox)/.test(id)
    );
    expect(deResonac).toEqual([]);
  });

  /*
   * ── LAS `rutas` DEL REGISTRO CONTRA LAS QUE EXISTEN (Plan 33 F6) ───
   *
   * Cada sistema declara en `shared/eva/comun/sistemas.js` qué pantallas son
   * suyas. Esa lista **se había quedado vieja** y nadie lo vio:
   *
   *   · el tanque declaraba `eva-3d`, que NO EXISTE —la vista se llama
   *     `eva-maqueta`— y le faltaban `eva-controles` y `eva-detalle`;
   *   · vibraciones declaraba UNA de sus cinco, incluida la que falta
   *     `vib-inicio`, que es la pantalla de arranque de esta rama.
   *
   * Nada daba error: una ruta que no existe simplemente nunca encaja. Pero el
   * dictado usa esa lista para elegir el vocabulario que Whisper tiene que oír
   * bien, así que preguntar por voz desde vibraciones se transcribía con las
   * palabras del agua — «lado acople» y «rodamiento» deformados, que es justo
   * lo que ese campo existe para impedir.
   *
   * Un desajuste así no se ve mirando ninguno de los dos archivos por
   * separado. Aquí se ven los dos.
   */
  it("toda ruta declarada por un sistema existe de verdad", () => {
    for (const s of SISTEMAS) {
      const fantasma = (s.rutas ?? []).filter((r) => !ids.includes(r));
      expect(fantasma, `«${s.id}» declara rutas que no existen`).toEqual([]);
    }
  });

  it("ninguna ruta pertenece a dos sistemas a la vez", () => {
    /* `sistemaDeRuta` devuelve la PRIMERA que encaja, así que una ruta en dos
       listas daría el vocabulario de una máquina en la pantalla de la otra,
       siempre igual y sin avisar. */
    const vistas = new Map();
    for (const s of SISTEMAS) {
      for (const r of s.rutas ?? []) {
        expect(vistas.has(r), `«${r}» la reclaman ${vistas.get(r)} y ${s.id}`).toBe(false);
        vistas.set(r, s.id);
      }
    }
  });

  it("ningún id se repite y toda ruta tiene componente", () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ROUTE_IDS) {
      expect(PAGES[id], `"${id}" se quedó sin componente`).toBeTruthy();
    }
  });
});

describe("el sidebar que sale del registro", () => {
  it("las cinco secciones salen del registro, con sus vistas dentro", () => {
    // `buildNav` LANZA si una ruta referencia un grupo que no está declarado en
    // NAV_GROUPS, y ese fallo sólo aparece al importar el registro. Comprobarlo
    // aquí lo convierte en un fallo de la suite y no en una pantalla en blanco.
    //
    // `sec-prediccion` es la quinta desde el 03-09-2026, y no es cosmética:
    // marca la frontera entre los dos MÓDULOS (CLAUDE.md §4.7). Las cuatro
    // primeras se sirven de ICONICS; esa quinta, no.
    /*
     * ── «sec-llenado» YA NO SALE (rama `Vibraciones1.0`, 17-09-2026) ──
     *
     * Y que desaparezca SOLA es justo lo que esta prueba defiende: `buildNav`
     * deriva las secciones de las rutas que traen `nav`, así que quitarlo de
     * las cinco vistas del tanque basta. No hubo que tocar ninguna lista de
     * secciones — si la hubiera, cerrar una máquina exigiría acordarse de dos
     * sitios.
     *
     * Al reabrir vuelve la primera, y con ella el bloque `llenado` de abajo.
     */
    /*
     * ── «sec-rag» TAMPOCO SALE YA (Plan 33 F10, 18-09-2026) ──────────
     *
     * Y por el mismo mecanismo que `sec-llenado`: sus dos vistas —Casos
     * previos y RAG documental— pasaron a la máquina, así que la sección se
     * quedó sin hijos y desapareció sola. No hubo que tocar `NAV_GROUPS`.
     *
     * El motivo del traslado es que un caso previo y un manual SON de una
     * máquina: los casos ya llevan `sistema` obligatorio y el RAG ya filtra
     * por él. Tenerlos en una sección aparte obligaba a salir de la máquina
     * para ver su propia documentación.
     *
     * Al reabrir la estación de llenado habrá DOS máquinas reclamando esas
     * vistas, y entonces hay que decidir: o una copia por máquina —que es lo
     * que F10 implanta— o volver a una sección común. Lo primero es lo
     * correcto mientras el contenido se filtre por máquina.
     */
    /*
     * ── «sec-vibraciones» ES AHORA «sec-planta» (Plan 40 F2, 21-09-2026) ─
     *
     * Alojaba dos cosas que no eran la misma: la máquina de vibraciones
     * escrita a mano y lo común de planta (alarmas, bandeja, avisos, casos,
     * RAG). La máquina se retiró —las de vibraciones son configuradas y cada
     * una trae su sección `maq:<id>`— y lo común se quedó, con su nombre
     * verdadero: «Planta». El muro entra en ella porque es la pantalla de
     * arranque y no tiene otra sección de la que colgar.
     */
    expect(NAV.map((n) => n.group ?? n.id)).toEqual([
      "sec-planta",
      "sec-general",
      "sec-prediccion",
    ]);

    /* Y con una máquina configurada, su sección va DELANTE de las de planta:
       es lo primero que se mira. */
    expect(navConMaquina().map((n) => n.group ?? n.id)).toEqual([
      `maq:${MAQUINA.id}`,
      "sec-planta",
      "sec-general",
      "sec-prediccion",
    ]);

    /*
     * La sección del tanque no existe mientras esté cerrada. Se comprueba su
     * AUSENCIA en vez de borrar el bloque: si alguien devolviera un `nav` a
     * una de sus vistas sin querer, la sección reaparecería a medias —una
     * pantalla suelta bajo una cabecera— y esto lo atrapa.
     *
     * Al reabrir, vuelve el `toEqual` con las cinco:
     *   "eva-inicio", "eva-planta", "eva-riesgos", "eva-controles", "eva-maqueta"
     */
    expect(NAV.find((n) => n.group === "sec-llenado")).toBeUndefined();

    /*
     * ── LO QUE CUELGA DE «PLANTA» (Plan 40 F2) ───────────────────────
     *
     * Lo que no es de una máquina concreta: las alarmas del servidor, la
     * bandeja y los avisos de TODAS las máquinas, los casos y el RAG con el
     * filtro abierto, y el muro. En el Plan 33 F10 estas vistas se habían
     * llevado a la máquina escrita a mano porque «un hallazgo o un manual SON
     * de una máquina»; eso sigue siendo cierto y lo cumplen las copias
     * `maq-*` de cada configurada. Éstas son las vistas de planta entera.
     *
     * Turno se queda en «General» a propósito: un turno sí es de la planta
     * entera, quien entra a las seis se hace cargo de todo.
     */
    const planta = NAV.find((n) => n.group === "sec-planta");
    expect(planta.children.map((c) => c.id)).toEqual([
      "eva-alarmas", "eva-muro",
      "eva-bandeja", "eva-avisos",
      "rag-casos", "rag-documentacion",
    ]);

    /*
     * ── LAS VISTAS DE UNA MÁQUINA CONFIGURADA ────────────────────────
     *
     * Siete en el menú, en tres apartados. El rótulo es un SEPARADOR, no un
     * nivel de menú: viaja en el hijo y el Sidebar lo pinta cuando cambia
     * respecto al anterior, así que el orden sale del orden de declaración y
     * no de una segunda lista que mantener.
     *
     * `maq-riesgos` NO SALE: contestaba la misma pregunta que «Hallazgos» con
     * otro nombre, y dos entradas que dicen lo mismo se leen como dos cosas
     * distintas. La ruta sigue navegable por id —el asistente la usa como
     * destino— sólo no tiene entrada de menú (`porMaquina.oculta`).
     */
    const maquina = navConMaquina().find((n) => n.group === `maq:${MAQUINA.id}`);
    expect(maquina.children.map((c) => c.id)).toEqual([
      "maq-inicio", "maq-graficas", "maq-3d",
      "maq-hallazgos", "maq-avisos",
      "maq-casos", "maq-rag",
    ]);
    expect(maquina.children.map((c) => c.apartado)).toEqual([
      "visualizacion", "visualizacion", "visualizacion",
      "diagnostico", "diagnostico",
      "documentacion", "documentacion",
    ]);
    /* Y cada hijo lleva la máquina: es lo que el Sidebar manda al navegar. */
    for (const hijo of maquina.children) expect(hijo.params).toEqual({ maquina: MAQUINA.id });

    // Assets y Configuración son del SERVIDOR, no de una máquina: si alguna
    // acabara dentro de un sistema, estaría diciendo que es sólo de ése.
    //
    // `eva-alarmas` volvió al sidebar el 10-09-2026 (Plan 27): dos
    // pestañas, Historial (lo de siempre) y En vivo (las alarmas del PLC).
    // Estuvo oculta del 2026-08-31 al 2026-09-10 para cortar el sondeo de
    // `/api/iconics/alarms` que el botón del Topbar hacía en toda la
    // aplicación — ese botón sigue sin volver, sólo la entrada del menú. Hoy
    // cuelga de «Planta», no de «General».
    const general = NAV.find((n) => n.group === "sec-general");
    expect(general.children.map((c) => c.id)).toEqual([
      "eva-assets", "eva-configuracion", "eva-turno",
      "eva-cuaderno", "salud-sistema",
    ]);

    /*
     * Predicción ya NO cuelga de «General». Esta comprobación es la que
     * impide que vuelva: si alguien devuelve una ruta `pred-*` a esa sección,
     * las dos expectativas de arriba y de abajo fallan a la vez.
     *
     * No es una preferencia de orden. «General» significa «del servidor
     * ICONICS, no de una máquina concreta», y este módulo no lee ese
     * servidor en absoluto — es un compresor real servido por otro backend.
     * Mezclarlo ahí es el mismo cruce de fuentes que CLAUDE.md §2.1 prohíbe.
     */
    const prediccion = NAV.find((n) => n.group === "sec-prediccion");
    expect(prediccion.children.map((c) => c.id)).toEqual([
      "pred-inicio",
      "pred-eventos",
      "pred-variables",
      "pred-historico",
      "pred-correlacion",
      "pred-pronostico",
    ]);

    /*
     * ── RAG DEJÓ DE SER SECCIÓN (Plan 33 F10, 18-09-2026) ────────────
     *
     * Era su propia sección porque «no describe una instalación, describe de
     * dónde saca el asistente lo que sabe». Eso sigue siendo cierto del RAG
     * como mecanismo — y falso de estas dos VISTAS: un caso previo y un manual
     * son de UNA máquina. Los casos llevan `sistema` obligatorio desde el Plan
     * 16 y el RAG documental ya filtra por él.
     *
     * Tenerlos aparte obligaba a salir de la máquina para ver su propia
     * documentación, y con N máquinas configuradas habría sido una sección con
     * todo mezclado y un filtro que recordar.
     *
     * Se comprueba la AUSENCIA, no se borra el bloque: si alguien devolviera
     * una vista a `sec-rag`, la sección reaparecería a medias y esto lo caza.
     */
    expect(NAV.find((n) => n.group === "sec-rag")).toBeUndefined();
  });

  /**
   * ── EL MÓDULO, AHORA DECLARADO Y NO EN UN COMENTARIO (Plan 25 F5) ─
   *
   * La frontera entre módulos es la frontera entre FUENTES DE DATOS
   * (`CLAUDE.md` §2.1 y §4.7), y hasta el 12-09-2026 vivía sólo en la prosa de
   * `NAV_GROUPS`. El problema de un comentario es que una sección nueva no lo
   * hereda: quien añada `sec-loquesea` sin pensar en su fuente la cuelga junto
   * a las de ICONICS y el sidebar la presenta como una más — que es cómo
   * Predicción estuvo dentro de «General» hasta el 03-09-2026.
   */
  it("cada sección declara a qué MÓDULO pertenece", () => {
    const porModulo = Object.fromEntries(NAV.map((n) => [n.group ?? n.id, n.modulo]));

    expect(porModulo).toEqual({
      /* `"sec-llenado": "monitoreo"` vuelve al reabrir la estación. */
      "sec-planta": "monitoreo",
      "sec-general": "monitoreo",
      // La única que NO es de ICONICS: un compresor real servido por otro
      // backend. Es la razón de ser de este campo.
      "sec-prediccion": "prediccion",
      /*
       * `"sec-rag": "monitoreo"` ya no sale: sus dos vistas pasaron a la
       * máquina en el Plan 33 F10 y la sección se quedó sin hijos. Vuelve si
       * alguien devuelve una vista a esa sección — que es lo que esta
       * comprobación atraparía.
       */
    });
  });

  it("una sección SIN módulo declarado no se construye: falla al montar el árbol", () => {
    /*
     * La guarda que convierte el campo en una regla. Sin ella, `modulo` sería
     * un adorno que la siguiente sección puede olvidar sin consecuencias, y el
     * sidebar la pintaría bajo la cabecera del módulo anterior — afirmando que
     * comparte fuente de datos con él.
     */
    const rutas = [{ id: "x", nav: { icon: null, group: "sec-huerfana" } }];
    const grupos = { "sec-huerfana": { icon: null } }; // sin `modulo`

    expect(() => buildNav(rutas, grupos)).toThrow(/modulo/);
  });

  it("cada sistema tiene su propio «Riesgos», y no se mezclan", () => {
    // Son dos motores de reglas distintos sobre dos máquinas distintas:
    // `riesgos.js` evalúa el tanque —nivel, presión, caudal— y
    // `riesgosVibracion.js` un motor con acelerómetros. Una sola pantalla con
    // las dos listas invitaría a buscar entre ellas una relación que no
    // existe, que es el error que `shared/eva/comun/sistemas.js` evita al asistente.
    const conRiesgos = NAV.flatMap((s) =>
      (s.children ?? []).filter((c) => /riesgos/.test(c.id)).map((c) => [s.group, c.id])
    );
    /*
     * ── HOY NO HAY NINGUNO EN EL MENÚ, Y LA REGLA SIGUE EN PIE ────────
     *
     * Dos cosas se acumularon: la estación de llenado está cerrada (su
     * «Riesgos» no trae `nav`), y el de vibraciones salió del menú en el Plan
     * 33 F10 porque contestaba lo mismo que «Hallazgos» con otro nombre.
     *
     * La afirmación que este caso defiende —NINGUNA sección tiene dos
     * «Riesgos» dentro, porque serían dos motores de reglas sobre dos máquinas
     * distintas— se cumple trivialmente con cero. Se conserva en vez de
     * borrarse porque es lo que atraparía a quien devuelva los dos a la misma
     * sección al reabrir: ahí volvería a decir algo.
     */
    expect(conRiesgos).toEqual([]);

    /* Tampoco con una máquina configurada: su «Riesgos» es `maq-riesgos`, y
       está `oculta` a propósito (unificada en «Hallazgos»). */
    const conRiesgosDeMaquina = navConMaquina().flatMap((s) =>
      (s.children ?? []).filter((c) => /riesgos/.test(c.id)).map((c) => [s.group, c.id])
    );
    expect(conRiesgosDeMaquina).toEqual([]);

    /* Y la ruta sigue existiendo, navegable por id con `?maquina=`: cerrado no
       es borrado, y el asistente la usa como destino en
       `navegacionDelAsistente.js`. Era `eva-riesgos-vibracion` hasta el Plan
       40 F2; hoy es la genérica de máquina configurada. */
    expect(ids).toContain("maq-riesgos");
    const riesgos = ROUTES.find((r) => r.id === "maq-riesgos");
    expect(riesgos.porMaquina?.oculta).toBe(true);
    expect(riesgos.nav).toBeUndefined();
  });

  it("la ruta por defecto está visible en el menú", () => {
    // Es el error clásico al reorganizar secciones: la app arranca en una vista
    // sin entrada de menú y ninguna queda resaltada, que se lee como que el
    // sidebar está roto.
    const visibles = NAV.flatMap((n) => (n.children ? n.children.map((c) => c.id) : [n.id]));
    expect(visibles).toContain(DEFAULT_ROUTE);
  });
});
