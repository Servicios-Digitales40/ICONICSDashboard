/**
 * Lo que una VISTA necesita saber de una máquina configurada y que su
 * configuración no dice con esas palabras: qué apoyos tiene, y qué contador
 * del área de alarmas es cada variable. Plan 37 F2.
 *
 * ── POR QUÉ EXISTE ────────────────────────────────────────────────
 *
 * Las vistas de vibraciones están escritas contra `CANALES`, la lista de
 * apoyos de la máquina escrita a mano, con su id y su rótulo. Una máquina
 * configurada no trae esa lista: trae assets y variables con `assetId`. Lo
 * que sí sabe el TIPO es qué apoyos puede tener una máquina como ésta
 * (`tipo.canales`, por sufijo), y cruzando las dos cosas sale la lista que
 * la vista espera, con la misma forma.
 *
 * Es dominio: decide qué apoyo existe en esta máquina. Una vista que lo
 * dedujera con su propio `filter` estaría decidiendo una regla de negocio
 * (`CLAUDE.md` §4.3), y no se podría probar sin montar React.
 *
 * ── LO QUE NO INVENTA ─────────────────────────────────────────────
 *
 * El rótulo de un apoyo es su id (`S1`), no «Lado acople»: dónde está montado
 * cada acelerómetro lo sabe quien lo montó, y la configuración no lo pregunta
 * todavía. La sensibilidad y el rodamiento van a `null` por lo mismo. Una
 * vista que los necesite tiene que enseñar el hueco, no un valor de otro
 * motor.
 */

/**
 * Los apoyos de una máquina configurada, en el orden del tipo.
 *
 * Un apoyo del tipo está en la máquina si alguna variable cuelga de él
 * (`assetId`) o si hay un asset con su id. Los que no aparecen no se listan:
 * un motor con dos acelerómetros no tiene tres apoyos con uno vacío, tiene
 * dos.
 *
 * @param {object} maquina  la configuración
 * @param {object|null} tipo  su tipo (`tipoDe(maquina.tipo)`)
 * @returns {Array<{id: string, sufijo: string, label: string, sensibilidad: null, rodamiento: null}>}
 */
export function canalesDeMaquina(maquina, tipo) {
  const canalesDelTipo = tipo?.canales ?? [];
  if (!canalesDelTipo.length) return [];

  const presentes = new Set();
  for (const v of maquina?.variables ?? []) if (v?.assetId) presentes.add(v.assetId);
  for (const a of maquina?.assets ?? []) if (a?.id) presentes.add(a.id);

  const nombreDeAsset = new Map((maquina?.assets ?? []).map((a) => [a?.id, a?.nombre ?? null]));

  return canalesDelTipo
    .filter((c) => presentes.has(c.id))
    .map((c) => ({
      id: c.id,
      sufijo: c.sufijo ?? c.id,
      label: nombreDeAsset.get(c.id) || c.id,
      sensibilidad: null,
      rodamiento: null,
    }));
}

/**
 * Qué variable de la máquina es cada CONTADOR del área de alarmas.
 *
 * Los contadores no son roles del tipo (Plan 34 F3): la pantalla de
 * configuración los guarda como variables sin rol colgadas del área, con el
 * nombre que el servidor les da (`ae:/AREA=ActiveUnackedCount`). Aquí se
 * emparejan por ese sufijo con las claves que las reglas esperan
 * (`activasSinReconocer`…), para que `alarmas` deje de ir vacío en una
 * máquina que sí los marcó.
 *
 * @param {object} maquina
 * @param {Array<{key: string, sufijo: string}>} contadores  el catálogo del tipo
 * @returns {Record<string, string>}  clave → pointName
 */
export function contadoresDeMaquina(maquina, contadores) {
  /** @type {Record<string, string>} */
  const salida = {};
  for (const c of contadores ?? []) {
    if (!c?.key || !c?.sufijo) continue;
    const v = (maquina?.variables ?? []).find(
      (x) => typeof x?.pointName === "string" && x.pointName.endsWith(c.sufijo),
    );
    if (v) salida[c.key] = v.pointName;
  }
  return salida;
}

/**
 * Qué claves de una máquina configurada llevan TENDENCIA en su Planta, y en
 * qué orden (Plan 42.5 F1, la respuesta al «[?]» de D5).
 *
 * Son las series **verificadas** por el sondeo (`sistema.series.historizadas()`)
 * que además son una medida (`metaDe(clave).naturaleza === "medida"`): una
 * bandera o un contador de alarma tienen serie, pero su «tendencia» es un
 * flanco, no una curva, y va en otra pantalla.
 *
 * El orden lo declara el TIPO, no la vista ni un campo nuevo de la
 * configuración: primero por apoyo, en el orden de `tipo.canales`; dentro del
 * apoyo, en el orden en que el tipo declara sus `roles`; lo que no cuelga de
 * ningún apoyo (variador, calidades sueltas) va al final, en el orden de la
 * configuración. Un tipo sin `canales` deja el orden de la configuración tal
 * cual. Es dominio: dos vistas que lo dedujeran por su cuenta acabarían con
 * dos órdenes.
 *
 * @param {object} sistema  el que devuelve `construirSistema`
 * @param {object} maquina  la configuración cruda (`variables` con `assetId` y `rol`)
 * @param {object|null} tipo
 * @returns {string[]}  claves, ordenadas
 */
export function clavesConTendencia(sistema, maquina, tipo) {
  if (!sistema?.series?.historizadas || !sistema.metaDe) return [];

  const variables = maquina?.variables ?? [];
  const porClave = new Map(variables.map((v) => [v.id ?? v.pointName, v]));
  const posicionConfig = new Map(variables.map((v, i) => [v.id ?? v.pointName, i]));
  const posicionApoyo = new Map((tipo?.canales ?? []).map((c, i) => [c.id, i]));
  const posicionRol = new Map(Object.keys(tipo?.roles ?? {}).map((r, i) => [r, i]));

  const orden = (clave) => {
    const v = porClave.get(clave);
    const apoyo = v?.assetId != null && posicionApoyo.has(v.assetId) ? posicionApoyo.get(v.assetId) : Infinity;
    const rol = v?.rol != null && posicionRol.has(v.rol) ? posicionRol.get(v.rol) : Infinity;
    return [apoyo, rol, posicionConfig.get(clave) ?? Infinity];
  };

  return sistema.series
    .historizadas()
    .filter((clave) => sistema.metaDe(clave)?.naturaleza === "medida")
    .sort((a, b) => {
      const [aa, ra, ca] = orden(a);
      const [ab, rb, cb] = orden(b);
      return aa - ab || ra - rb || ca - cb;
    });
}

/** Id de la pestaña que agrupa las variables sin `assetId` en el Detalle. */
export const SIN_ACTIVO = "__sin-activo__";

/**
 * Los activos de una máquina configurada que tienen al menos una variable,
 * en el orden de la configuración, más «Sin activo» al final sólo si alguna
 * variable no cuelga de ninguno (Plan 42.5 D3). Un asset sin variables no es
 * pestaña: no habría nada que enseñar en ella.
 *
 * @returns {Array<{id: string, nombre: string, variables: number}>}
 */
export function activosConVariables(maquina) {
  const variables = (maquina?.variables ?? []).filter((v) => v?.pointName);
  const cuenta = new Map();
  for (const v of variables) {
    const id = v.assetId ?? SIN_ACTIVO;
    cuenta.set(id, (cuenta.get(id) ?? 0) + 1);
  }

  const salida = (maquina?.assets ?? [])
    .filter((a) => a?.id && cuenta.has(a.id))
    .map((a) => ({ id: a.id, nombre: a.nombre || a.id, variables: cuenta.get(a.id) }));

  /* Variables colgadas de un `assetId` que no está declarado en `assets`: se
     agrupan igual, con su id como rótulo. No se pierden en silencio. */
  const declarados = new Set(salida.map((a) => a.id));
  for (const [id, n] of cuenta) {
    if (id === SIN_ACTIVO || declarados.has(id)) continue;
    salida.push({ id, nombre: id, variables: n });
    declarados.add(id);
  }

  if (cuenta.has(SIN_ACTIVO)) salida.push({ id: SIN_ACTIVO, nombre: null, variables: cuenta.get(SIN_ACTIVO) });
  return salida;
}

/**
 * Las variables de UN activo de una máquina configurada, en la forma que la
 * tarjeta del Detalle (`components/detalle/DetalleGrid.jsx`) espera (Plan
 * 42.5 D9). La tarjeta se escribió contra la señal del tanque —`key`, `tag`,
 * `historizado`, `escala`, `tipo: "booleano"`, `banda` como clave de
 * estado—; la forma común trae `clave`, `label`, `estado`, `historia`. Aquí
 * se traduce una vez, en dominio y sin React, en vez de meterle un `if` a
 * la tarjeta o escribir otra.
 *
 * Lo que NO se inventa:
 * - `escala` sólo existe si el TIPO declara banda para el rol
 *   (`tipo.bandaDe(rol)` con `max` finito); sin ella no hay barra.
 * - `historizado` es `esHistorizada(clave)`: la serie VERIFICADA por el
 *   sondeo, no la declarada. Junto va `historiaCausa`, la que dejó el
 *   sondeo (`historyCausa`), para que la tarjeta diga por qué no hay gráfica.
 * - `subirEsBueno` no se declara: nadie lo sabe de una configurada, y la
 *   tarjeta lo trata como opcional.
 * - Las de naturaleza «alarma» (banderas booleanas) se excluyen: viven en
 *   su propia sección, como en el tanque.
 *
 * @param {object} sistema  el de `construirSistema`
 * @param {object} maquina  la configuración cruda
 * @param {object|null} estado  la forma común (`estado.senales`) de la última lectura
 * @param {string} assetId  el activo, o `SIN_ACTIVO`
 * @param {object|null} tipo  para `bandaDe(rol)`
 */
export function variablesDeActivo(sistema, maquina, estado, assetId, tipo = null) {
  if (!sistema?.metaDe || !maquina?.variables) return [];
  const porClave = new Map((estado?.senales ?? []).map((s) => [s.clave, s]));

  return maquina.variables
    .filter((v) => v?.pointName && (v.assetId ?? SIN_ACTIVO) === assetId)
    .map((v) => {
      const clave = v.id ?? v.pointName;
      const meta = sistema.metaDe(clave);
      if (!meta || meta.naturaleza === "alarma") return null;
      const senal = porClave.get(clave) ?? null;
      const banda = v.rol && tipo?.bandaDe ? tipo.bandaDe(v.rol) : null;
      const escala =
        banda && Number.isFinite(banda.max)
          ? { min: Number.isFinite(banda.min) ? banda.min : 0, max: banda.max }
          : null;
      const historizado = Boolean(sistema.esHistorizada(clave));

      return {
        key: clave,
        label: meta.label,
        corto: meta.label,
        tag: v.pointName,
        punto: v.pointName,
        unidad: meta.unidad ?? "",
        decimales: meta.decimales ?? 1,
        tipo: "numero",
        naturaleza: meta.naturaleza,
        rol: v.rol ?? null,
        valor: senal?.valor ?? null,
        texto: senal?.texto ?? null,
        /* En la tarjeta `banda` es la clave de ESTADO que colorea; en la forma
           común eso se llama `estado`. Sin lectura no hay banda. */
        banda: senal && senal.valor !== null && senal.valor !== undefined ? (senal.estado ?? null) : null,
        estado: senal?.estado ?? null,
        escala,
        nota: senal?.nota ?? null,
        motivo: senal?.motivo ?? null,
        historizado,
        historiaCausa: v.historyCausa ?? null,
        historiaCompartidaCon: v.historyCompartidaCon ?? [],
        historiaComo: v.historyVerifiedComo ?? null,
      };
    })
    .filter(Boolean);
}
