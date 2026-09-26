/**
 * Deriva el árbol del sidebar a partir del registro de rutas.
 *
 * Vive en su propio archivo, sin JSX ni imports con alias, para que sea JS
 * puro ejecutable en node y por tanto verificable: su modo de fallo es
 * silencioso, porque si el orden se altera el build pasa y la app funciona,
 * y lo único que cambia es cómo sale el sidebar.
 */

/**
 * @param routes  el array ROUTES (solo se leen `id`, `nav` y `rol`)
 * @param groups  mapa id de grupo → { icon }
 * @param puede   `(rolMinimo) => boolean`; por defecto, todo permitido
 * @returns array de items: `{ id, icon }` o `{ group, icon, children: [...] }`
 *
 * Reglas:
 *   1. Los items de primer nivel salen en orden de declaración.
 *   2. Un grupo se inserta en la posición de su primer hijo, y desde ahí
 *      absorbe al resto, estén donde estén en el array.
 *   3. Las rutas sin `nav` se omiten: existen y son navegables por id, pero
 *      no tienen entrada de menú.
 *   4. Las rutas con `rol` que `puede()` rechaza se omiten, y un grupo que se
 *      queda sin hijos no se pinta (Plan 35 F3).
 *
 * ── POR QUÉ `puede` ENTRA POR LA PUERTA Y NO SE IMPORTA ────────────
 *
 * Porque este archivo es JS puro que `verificar-navegacion` ejecuta en Node,
 * sin React ni contexto de sesión. Importar el hook lo ataría al navegador y
 * dejaría de poder comprobarse en la tanda — que es justo lo que su cabecera
 * dice que hay que conservar.
 *
 * El valor por defecto es «todo permitido», y no es pereza: es el mismo
 * criterio que el backend con `AUTH_HABILITADA=false`. Un menú que escondiera
 * entradas que el servidor sí acepta mentiría en la dirección contraria.
 *
 * Y conviene repetirlo aquí: **esto no protege nada**. La ruta omitida sigue
 * existiendo y sigue siendo navegable por id. Quien niega es `exigirRol` en
 * el backend; esto sólo evita ofrecer un camino que no lleva a ninguna parte.
 *
 * ── AQUÍ NO HAY TEXTO, Y ES DELIBERADO ─────────────────────────────
 *
 * Este árbol llevaba un `label` con el nombre en español de cada entrada. Ya
 * no: el Sidebar lo resuelve al pintar, con el `id` de la ruta o el del grupo
 * (`navigation:routes.<id>.nav` y `navigation:sections.<group>`).
 *
 * El motivo es que este árbol se construye UNA vez, al evaluar el módulo. Un
 * texto metido aquí se congelaría en el idioma que hubiera al arrancar, y
 * cambiar de idioma repintaría toda la aplicación menos el menú — que es
 * justo el sitio donde más se nota.
 */
export function buildNav(routes, groups, puede = () => true, maquinas = []) {
  const items = [];
  const vistos = new Map(); // id de grupo → objeto ya insertado en `items`

  /*
   * ── UNA SECCIÓN POR MÁQUINA CONFIGURADA (Plan 37 F1) ──────────────
   *
   * Las rutas marcadas `porMaquina` no tienen `nav` propio: no son de
   * ninguna máquina hasta que una las reclama. Cada máquina configurada en
   * servicio produce un grupo `maq:<id>` con esas rutas como hijos, y el
   * parámetro `maquina` viaja en el hijo para que el Sidebar navegue con él.
   *
   * El grupo lleva `label` —el nombre de la máquina— y no un id de sección
   * que traducir: el nombre lo puso una persona al configurarla y no está en
   * ningún diccionario. Es la única excepción a «aquí no hay texto» de la
   * cabecera, y por eso viaja como dato de la máquina, no como texto del menú.
   *
   * Las secciones de máquina van DELANTE de las rutas estáticas: son
   * máquinas, como la escrita a mano, y van juntas al principio del menú.
   */
  /* `oculta`: existe por máquina y se navega por id con `?maquina=`, pero no
     sale en el menú (Riesgos, unificada en Hallazgos — Plan 33 F10, Plan 40 F2). */
  const porMaquina = routes.filter((r) => r.porMaquina && !r.porMaquina.oculta && (!r.rol || puede(r.rol)));

  /*
   * ── NO TODA MÁQUINA TIENE TODAS LAS VISTAS (Plan 46 F4) ───────────
   *
   * Hasta el 26-09-2026 cada máquina configurada recibía las MISMAS rutas,
   * porque todas eran del mismo tipo y la pregunta no se había planteado. Con
   * `sensado` sí se plantea: un conjunto de sensores sueltos no tiene maqueta
   * 3D que enseñar ni «estado mecánico» que juzgar, y ofrecer esas entradas
   * llevaría a una pantalla que no puede pintar nada.
   *
   * La ruta declara qué capacidad NECESITA (`porMaquina.requiere`) y se
   * compara contra lo que el TIPO de esa máquina dice saber servir
   * (`capacidadesPosibles`). Sin `requiere`, la ruta vale para cualquier
   * máquina — que es el caso de casi todas, y por eso el filtro no se nota en
   * vibraciones.
   *
   * ── POR QUÉ `capacidadesPosibles` Y NO LAS DERIVADAS ──────────────
   *
   * Porque son preguntas distintas, y usar las derivadas rompería vibraciones.
   * `capacidadesDe()` deriva sólo cuatro —`CURRENT_DATA`, `HISTORICAL_DATA`,
   * `DIAGNOSTICS`, `WRITABLE_VARIABLES`— a partir de lo CONFIGURADO. `VIEW_3D`
   * y `ALARMS` no se derivan de nada, así que ninguna máquina las lleva nunca
   * en su lista derivada: filtrar por ahí le quitaría la Vista 3D al motor,
   * que sí la tiene.
   *
   * Lo que esta pregunta necesita es «¿este TIPO de máquina tiene esta vista?»,
   * y eso es exactamente lo que `capacidadesPosibles` declara desde el Plan 33.
   * Una entrada de menú es una puerta, no una promesa de contenido: que la
   * vista tenga datos hoy es cosa suya y ya lo dice cuando no los hay.
   *
   * Se decide con la capacidad y NO con el id del tipo a propósito: un `if
   * (tipo === "sensado")` en el menú es el condicional por máquina que el Plan
   * 42.5 D1 sacó de las vistas, y volvería a entrar por la puerta de atrás.
   *
   * ── QUIÉN RESUELVE EL TIPO ────────────────────────────────────────
   *
   * Este archivo no lo importa: su cabecera dice que vive sin imports con
   * alias para ser JS puro ejecutable en node, y eso es lo que permite
   * verificarlo. Así que la máquina llega con sus `capacidadesPosibles` ya
   * resueltas por quien sí conoce el registro de tipos (`navParaRol`).
   */
  const sirveA = (ruta, maquina) => {
    const requiere = ruta.porMaquina?.requiere;
    if (!requiere) return true;
    const posibles = maquina?.capacidadesPosibles ?? null;
    /* Sin tipo reconocible no se esconde nada: una máquina cuyo tipo ya no
       existe es un problema de configuración que se ve en su ficha, y dejarla
       además sin menú lo haría más difícil de encontrar, no más seguro. */
    return !posibles || posibles.includes(requiere);
  };

  for (const m of maquinas ?? []) {
    if (!m?.id) continue;
    const suyas = porMaquina.filter((r) => sirveA(r, m));
    if (!suyas.length) continue;
    items.push({
      group: `maq:${m.id}`,
      label: m.nombre ?? m.id,
      icon: suyas[0].porMaquina.iconoSeccion ?? suyas[0].porMaquina.icon,
      modulo: "monitoreo",
      children: suyas.map((r) => ({
        id: r.id,
        icon: r.porMaquina.icon,
        apartado: r.porMaquina.apartado ?? null,
        params: { maquina: m.id },
      })),
    });
  }

  for (const r of routes) {
    if (!r.nav) continue;
    /* Una ruta que declara rol y no se alcanza no entra en el menú. Sigue
       existiendo y sigue siendo navegable: ver la cabecera. */
    if (r.rol && !puede(r.rol)) continue;
    const { icon, group } = r.nav;

    if (!group) {
      items.push({ id: r.id, icon });
      continue;
    }

    if (!vistos.has(group)) {
      const meta = groups[group];
      if (!meta) {
        throw new Error(
          `routes: la ruta "${r.id}" referencia el grupo "${group}", que no está declarado en NAV_GROUPS.`
        );
      }
      /*
       * `modulo` se EXIGE (Plan 25 F5): una sección sin módulo declarado es una
       * sección cuya fuente de datos nadie decidió, y el sidebar la pintaría
       * junto a las de ICONICS como si lo fuera. Es cómo Predicción estuvo
       * dentro de «General» hasta el 03-09-2026 — ver `NAV_GROUPS`.
       *
       * Falla aquí, al construir el árbol, y no al pintarlo: este archivo es JS
       * puro y `verificar-navegacion` lo ejecuta en Node, así que el olvido se
       * ve en la tanda de verificadores y no en una pantalla.
       */
      if (!meta.modulo) {
        throw new Error(
          `routes: el grupo "${group}" no declara \`modulo\`. Cada sección pertenece a un ` +
            `módulo de \`shared/modulos.js\` ("monitoreo", "prediccion"…), porque es lo que ` +
            `dice qué fuente de datos hay detrás (CLAUDE.md §4.7).`
        );
      }
      const nuevo = { group, icon: meta.icon, modulo: meta.modulo, children: [] };
      vistos.set(group, nuevo);
      items.push(nuevo);
    }
    /*
     * ── `apartado`: UN RÓTULO, NO UN NIVEL DE MENÚ (Plan 33 F10) ──────
     *
     * Una máquina llega a tener nueve vistas, y nueve seguidas se leen como
     * una lista. Se agrupan en tres bloques —Visualización, Diagnóstico,
     * Documentación— con un rótulo fino delante del primero de cada uno.
     *
     * Es un SEPARADOR, no un segundo nivel: no se pliega, no se navega y no
     * cambia la forma del árbol. Hacerlo anidable habría exigido que este
     * archivo y `NavGroup` fueran recursivos, y con ello decidir qué pasa al
     * colapsar el sidebar, qué se recuerda plegado y cómo cuenta el badge de
     * un subgrupo. Tres decisiones de chrome para conseguir lo mismo que un
     * rótulo.
     *
     * Viaja en el hijo y lo pinta el Sidebar comparando con el anterior: así
     * el orden del apartado sale del orden de declaración de las rutas, que ya
     * es el orden del menú, y no hay una segunda lista que mantener.
     */
    vistos.get(group).children.push({ id: r.id, icon, apartado: r.nav.apartado ?? null });
  }

  /*
   * Un grupo cuyos hijos se han filtrado todos se cae con ellos. Sin esto, un
   * visualizador vería la sección «General» abierta y vacía — peor que no
   * verla, porque parece que algo se rompió al cargar.
   *
   * No puede decidirse al crear el grupo: el primer hijo lo crea y los
   * siguientes pueden filtrarse, así que sólo se sabe al final.
   */
  return items.filter((item) => !item.children || item.children.length > 0);
}
