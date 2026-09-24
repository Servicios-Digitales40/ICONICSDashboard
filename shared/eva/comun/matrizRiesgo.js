/**
 * La matriz probabilidad × impacto de un riesgo, con su criterio declarado.
 *
 * ── POR QUÉ EXISTE / POR QUÉ ASÍ ────────────────────────────────────
 *
 * Las maquetas de reporte que entregó el usuario (Plan 44) piden una matriz
 * 5×5 con cada riesgo en su celda. El motor de diagnóstico NO produce eso:
 * una regla trae `nivel` (crítico/atención/informativo) y una `evidencia`.
 * Para poner un riesgo en una celda hacen falta dos números, y la única
 * forma honesta de tenerlos es que alguien los declare o que se midan.
 *
 * El criterio es la decisión D15 del Plan 44, confirmada por el usuario el
 * 23-09-2026, y es deliberadamente asimétrico:
 *
 *   IMPACTO (1–5)       lo DECLARA la regla del tipo, como criterio de
 *                       ingeniería. Es una opinión informada, y el PDF la
 *                       rotula como tal. Una regla que no lo declare lo
 *                       hereda de su nivel por `IMPACTO_POR_NIVEL`, y esa
 *                       herencia se cita al pie de la matriz para que no
 *                       se lea como si alguien la hubiera pensado.
 *
 *   PROBABILIDAD (1–5)  se OBSERVA: es la fracción del período en que la
 *                       condición estuvo activa, medida sobre las series
 *                       del historiador. No es una estimación, es una
 *                       frecuencia contada, y por eso se rotula «observada
 *                       en el período» con su cobertura al lado.
 *
 * ── LO QUE ESTE MÓDULO SE NIEGA A HACER ────────────────────────────
 *
 * Una regla cuyas señales no están historizadas NO entra en la matriz: sin
 * serie no hay frecuencia que contar, y rellenar su probabilidad con el
 * nivel sería presentar una opinión con cara de medida. Sale aparte, en una
 * lista con su motivo (§2.4 de `CLAUDE.md`: la ausencia no se disfraza).
 *
 * Tampoco se le pide P ni I al modelo. El código puntúa, el modelo redacta
 * (§2.3 de `CLAUDE.md`).
 */

/**
 * Impacto heredado del nivel, para la regla que no declara el suyo.
 *
 * Es un mapa de conveniencia, no una equivalencia real: «crítico» describe
 * lo urgente que es mirarlo, e «impacto» lo caro que sale si ocurre, y no
 * son la misma pregunta. Se usa para no dejar la celda vacía, y siempre
 * acompañado de `impactoDeclarado: false` para que el reporte lo diga.
 */
export const IMPACTO_POR_NIVEL = { critico: 5, atencion: 3, informativo: 1 };

/**
 * Los cortes de probabilidad, de fracción de tiempo activa a 1–5.
 *
 * Los umbrales son geométricos y no lineales (1 %, 5 %, 20 %, 50 %) porque
 * lo que distingue a un riesgo raro de uno frecuente está en los órdenes de
 * magnitud bajos: entre estar activo el 1 % del tiempo y el 5 % hay una
 * diferencia operativa enorme, y entre el 60 % y el 65 % no hay ninguna.
 */
export const CORTES_PROBABILIDAD = [
  { hasta: 0.01, valor: 1 },
  { hasta: 0.05, valor: 2 },
  { hasta: 0.2, valor: 3 },
  { hasta: 0.5, valor: 4 },
  { hasta: Infinity, valor: 5 },
];

/** El lado de la matriz. Cinco por cinco, como la maqueta. */
export const LADO_MATRIZ = 5;

/**
 * Probabilidad 1–5 a partir de la fracción de tiempo activa (0–1).
 *
 * Devuelve `null` si la fracción no es un número utilizable: sin medida no
 * hay probabilidad, y el llamador tiene que tratar ese caso aparte en vez
 * de recibir un 1 que parecería «es raro».
 */
export function probabilidadDeFraccion(fraccion) {
  if (typeof fraccion !== "number" || !Number.isFinite(fraccion) || fraccion < 0) {
    return null;
  }
  return CORTES_PROBABILIDAD.find((c) => fraccion < c.hasta || c.hasta === Infinity).valor;
}

/**
 * El impacto de una regla: el suyo si lo declara, el de su nivel si no.
 *
 * Se valida que lo declarado sea un entero de 1 a 5 y no cualquier número:
 * una regla con `impacto: 7` es un error de quien la escribió, y heredar
 * del nivel es mejor que pintar una fila fuera de la matriz.
 */
export function impactoDeRegla(regla) {
  const declarado = regla?.impacto;
  if (Number.isInteger(declarado) && declarado >= 1 && declarado <= LADO_MATRIZ) {
    return { impacto: declarado, declarado: true };
  }
  return {
    impacto: IMPACTO_POR_NIVEL[regla?.nivel] ?? IMPACTO_POR_NIVEL.informativo,
    declarado: false,
  };
}

/**
 * La severidad de una celda, para pintarla: P × I sobre 25.
 *
 * Los cortes (> 12 grave, > 6 medio) salen de la propia matriz: con impacto
 * 5 basta una probabilidad 3 para ser grave, y con impacto 1 no se llega
 * nunca por mucho que ocurra. Es la forma de la diagonal, no un umbral
 * calibrado con datos.
 */
export function severidadDeCelda(probabilidad, impacto) {
  const producto = probabilidad * impacto;
  if (producto > 12) return "critico";
  if (producto > 6) return "atencion";
  return "informativo";
}

/**
 * Observa cuánto tiempo del período estuvo activa la condición de una regla.
 *
 * ── POR QUÉ SE REEVALÚA LA REGLA Y NO SE CUENTA OTRA COSA ──────────
 *
 * La tentación era contar cuántas veces una señal cruzó su banda. No sirve:
 * la banda del dominio y la condición de la regla no son lo mismo —una regla
 * de zona C exige estar por encima del aviso Y por debajo de la alarma—, y
 * contar cruces de banda daría una frecuencia que no es la de este riesgo.
 * Se reevalúa `cuando` con los valores de cada instante, que es exactamente
 * lo que el motor hace en vivo, sólo que sobre muestras del historiador.
 *
 * `series` es un Map de nombre de señal (los de `necesita`) a sus muestras
 * `{t, valor}`. Los instantes se toman de la PRIMERA señal que la regla
 * necesita y las demás se emparejan por cercanía, descartando la muestra que
 * no encuentre pareja dentro de la tolerancia: un instante incompleto no se
 * evalúa a medias, se descarta, y eso baja la cobertura, que es visible.
 *
 * Devuelve `{fraccion, cobertura, evaluados}`, o `{motivo}` cuando no se ha
 * podido observar. Nunca devuelve una fracción inventada.
 */
export function observarFrecuencia(regla, series, { toleranciaMs = 60_000, datosFijos = {} } = {}) {
  const necesita = regla?.necesita ?? [];
  if (!necesita.length) {
    return { motivo: "esta regla no mira ninguna señal historizable: depende de la configuración del módulo o de sus vigilancias" };
  }

  const pistas = necesita.map((nombre) => ({
    nombre,
    muestras: (series?.get?.(nombre) ?? [])
      .filter((p) => p && p.t && typeof p.valor === "number" && Number.isFinite(p.valor))
      .map((p) => ({ t: p.t instanceof Date ? p.t.getTime() : new Date(p.t).getTime(), v: p.valor }))
      .sort((x, y) => x.t - y.t),
  }));

  const sinSerie = pistas.filter((p) => !p.muestras.length).map((p) => p.nombre);
  if (sinSerie.length) {
    return { motivo: `sin serie para observar su frecuencia (falta ${sinSerie.join(", ")})` };
  }

  const [guia, ...resto] = pistas;
  const cursores = resto.map(() => 0);
  let evaluados = 0;
  let activos = 0;

  for (const punto of guia.muestras) {
    const datos = { ...datosFijos, [guia.nombre]: punto.v };
    let completo = true;

    resto.forEach((pista, i) => {
      const m = pista.muestras;
      while (cursores[i] + 1 < m.length && Math.abs(m[cursores[i] + 1].t - punto.t) <= Math.abs(m[cursores[i]].t - punto.t)) {
        cursores[i] += 1;
      }
      if (Math.abs(m[cursores[i]].t - punto.t) <= toleranciaMs) datos[pista.nombre] = m[cursores[i]].v;
      else completo = false;
    });

    if (!completo) continue;
    evaluados += 1;

    /* Una regla puede reventar con datos parciales del historiador (una
       derivada que no se puede calcular, un campo que en vivo siempre está).
       Ese instante no cuenta ni a favor ni en contra: se descarta y la
       cobertura lo refleja. */
    try {
      if (regla.cuando(datos)) activos += 1;
    } catch {
      evaluados -= 1;
    }
  }

  if (!evaluados) {
    return { motivo: "las series de esta regla no coinciden en ningún instante del período" };
  }

  return {
    fraccion: activos / evaluados,
    cobertura: { evaluados, disponibles: guia.muestras.length },
    evaluados,
  };
}

/**
 * Arma la matriz a partir de los riesgos y de sus frecuencias observadas.
 *
 * `frecuencias` es un Map de `idRegla` a `{fraccion, cobertura}` — lo que
 * mide el recolector sobre las series del período. Un riesgo sin entrada en
 * ese mapa, o con fracción no utilizable, cae en `sinObservar` con su
 * motivo; no se le inventa una probabilidad.
 *
 * Devuelve las celdas ya con su severidad, más los dos recuentos que el
 * reporte necesita para no tener que volver a recorrer nada.
 */
export function armarMatriz(riesgos, frecuencias) {
  const celdas = [];
  const sinObservar = [];
  let algunoHeredado = false;

  for (const riesgo of riesgos ?? []) {
    const { impacto, declarado } = impactoDeRegla(riesgo);
    if (!declarado) algunoHeredado = true;

    const medida = frecuencias?.get?.(riesgo.id);
    const probabilidad = probabilidadDeFraccion(medida?.fraccion);

    if (probabilidad === null) {
      sinObservar.push({
        id: riesgo.id,
        titulo: riesgo.titulo,
        nivel: riesgo.nivel,
        impacto,
        impactoDeclarado: declarado,
        motivo: medida?.motivo ?? "sin serie para observar su frecuencia",
      });
      continue;
    }

    celdas.push({
      id: riesgo.id,
      titulo: riesgo.titulo,
      nivel: riesgo.nivel,
      impacto,
      impactoDeclarado: declarado,
      probabilidad,
      fraccion: medida.fraccion,
      cobertura: medida.cobertura ?? null,
      severidad: severidadDeCelda(probabilidad, impacto),
    });
  }

  return { celdas, sinObservar, algunoHeredado };
}
