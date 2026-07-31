/**
 * Núcleo lógico del comparativo por fechas. Funciones puras, sin React y sin
 * tema, testeables sin montar un componente.
 *
 * El comparativo dibuja la misma diferencia en cuatro sitios (veredicto,
 * columnas espejo, dumbbell por métrica y banda por hora). Calculándola aquí
 * una vez y repartiéndola se evita que dos paneles discrepen por redondeos o
 * umbrales distintos.
 */
import { METAS } from "@/lib/shiftModel.js";

/* Fechas. */

/** Date → "YYYY-MM-DD" en hora local (en UTC se correría un día). */
export const isoDay = (d) => {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d - off).toISOString().slice(0, 10);
};

/** "YYYY-MM-DD" → Date local a medianoche. */
export const parseIso = (iso) => new Date(`${iso}T00:00:00`);

/** "2025-07-21" → "21 jul 2025" */
export const fmtDay = (iso) =>
  parseIso(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });

/** "2025-07-21" → "lunes" */
export const weekdayOf = (iso) => parseIso(iso).toLocaleDateString("es-MX", { weekday: "long" });

/** Suma (o resta) días a un ISO y devuelve otro ISO. */
export const addDays = (iso, n) => {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoDay(d);
};

/**
 * Mismo día del mes anterior. Si no existe (31 de marzo → 31 de febrero), cae
 * al último día del mes destino en lugar de desbordar al siguiente, que es lo
 * que haría `setMonth` por defecto.
 */
export const addMonths = (iso, n) => {
  const d = parseIso(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return isoDay(d);
};

/** Lunes de la semana a la que pertenece `iso` (semana que empieza en lunes). */
export const mondayOf = (iso) => {
  const d = parseIso(iso);
  const dow = (d.getDay() + 6) % 7; // 0 = lunes … 6 = domingo
  return addDays(iso, -dow);
};

/** Días naturales entre dos ISO (absoluto). */
export const daysBetween = (isoA, isoB) =>
  Math.abs(Math.round((parseIso(isoB) - parseIso(isoA)) / 86400000));

/**
 * Rótulo que explica la relación entre las dos fechas elegidas:
 *
 *   "7 días de diferencia · lunes vs. lunes"
 *   "3 días de diferencia · sábado vs. martes"
 *
 * Avisa cuando los días de la semana no coinciden, para que no se lea como un
 * problema de la máquina lo que es un problema de la comparación.
 */
export function relationLabel(isoA, isoB) {
  if (isoA === isoB) {
    return { text: "Misma fecha en ambos lados", warn: true, same: true, hint: "no hay nada que comparar" };
  }

  const dias = daysBetween(isoA, isoB);
  const wdA = weekdayOf(isoA);
  const wdB = weekdayOf(isoB);
  const sameWeekday = wdA === wdB;

  const cuando =
    dias === 1 ? "1 día de diferencia"
      : dias === 7 ? "1 semana de diferencia"
        : dias % 7 === 0 ? `${dias / 7} semanas de diferencia`
          : `${dias} días de diferencia`;

  // B es siempre el sujeto y A la línea base, así que conviene marcar cuándo
  // B es la fecha anterior: es lo que deja el botón de intercambio, y invierte
  // el signo de todos los deltas sin que nada en pantalla lo delate.
  const invertido = parseIso(isoB) < parseIso(isoA);

  return {
    text: `${cuando} · ${wdA} vs. ${wdB}`,
    warn: !sameWeekday,
    same: false,
    invertido,
    hint: !sameWeekday ? "días de la semana distintos" : null,
  };
}

/*
 * Presets de comparación: las cuatro preguntas que cubren la mayoría de los
 * casos. Cada uno es una función pura de "hoy" a un par [A, B], para que el
 * conjunto sea fácil de probar y de ampliar.
 */
export const PRESETS = [
  {
    id: "ayer",
    label: "Ayer vs. hoy",
    hint: "El turno anterior contra el actual",
    range: (hoy) => [addDays(hoy, -1), hoy],
  },
  {
    id: "semana",
    label: "Hoy vs. semana pasada",
    hint: "Mismo día de la semana, 7 días atrás",
    range: (hoy) => [addDays(hoy, -7), hoy],
  },
  {
    id: "mes",
    label: "Hoy vs. mes pasado",
    hint: "Mismo día del mes anterior",
    range: (hoy) => [addMonths(hoy, -1), hoy],
  },
  {
    id: "lunes",
    label: "Lunes vs. lunes",
    hint: "Arranque de semana contra el anterior",
    range: (hoy) => {
      const lunes = mondayOf(hoy);
      return [addDays(lunes, -7), lunes];
    },
  },
];

/** Devuelve el id del preset que produce exactamente este par, o null. */
export function matchPreset(isoA, isoB, hoy) {
  const found = PRESETS.find((p) => {
    const [a, b] = p.range(hoy);
    return a === isoA && b === isoB;
  });
  return found ? found.id : null;
}

/* Comparación. */

/**
 * Umbral de significancia, en puntos porcentuales. Por debajo de esto un delta
 * es ruido y la vista lo dice, en vez de pintar un +0.1 con el mismo verde que
 * un +12.
 *
 * 1.0 pt es un punto de partida razonable para OEE de planta; conviene
 * calibrarlo contra la variabilidad real cuando haya datos del PLC.
 */
export const DEAD_BAND = 1.0;

/**
 * Metas por métrica (%). La definición vive en `@/lib/shiftModel.js`, fuente
 * única compartida con las subvistas de factor y el dashboard. Se reexporta
 * aquí para no romper a quien ya la importaba desde este módulo.
 */
export { METAS };

/** Las cuatro métricas del comparativo, en orden de lectura. */
export const METRICS = [
  { key: "disponibilidad", label: "Disponibilidad", short: "Dispon." },
  { key: "rendimiento", label: "Rendimiento", short: "Rendim." },
  { key: "calidad", label: "Calidad", short: "Calidad" },
  { key: "oee", label: "OEE", short: "OEE", primary: true },
];

/**
 * Compara dos snapshots y devuelve una fila por métrica.
 *
 * En las cuatro métricas más es mejor, así que la dirección se deduce del
 * signo. Para una métrica invertida (scrap, tiempo muerto) bastaría añadir
 * `lowerIsBetter` al catálogo METRICS y aplicarlo aquí, sin que ningún
 * consumidor se entere.
 */
export function buildComparison(snapA, snapB) {
  return METRICS.map(({ key, label, short, primary }) => {
    const a = snapA?.[key] ?? null;
    const b = snapB?.[key] ?? null;
    const missing = a === null || b === null;
    const delta = missing ? 0 : +(b - a).toFixed(1);
    const significant = !missing && Math.abs(delta) >= DEAD_BAND;

    return {
      key, label, short, primary: !!primary,
      a, b, delta, missing, significant,
      // "flat" cubre el empate exacto y el cambio irrelevante: para quien
      // lee son la misma noticia.
      direction: !significant ? "flat" : delta > 0 ? "up" : "down",
      meta: METAS[key] ?? null,
    };
  });
}

/**
 * Reduce la comparación a una frase: qué pasó con el OEE y qué lo explica, de
 * modo que las gráficas queden como evidencia y no como el único camino para
 * responder «¿mejoramos?».
 *
 *   driver → la métrica que más empujó en el mismo sentido que el OEE
 *   drag   → la que más tiró en contra (puede no haber ninguna)
 */
export function verdict(comparison) {
  const oee = comparison.find((m) => m.key === "oee");
  const factores = comparison.filter((m) => m.key !== "oee" && !m.missing);

  if (!oee || oee.missing) {
    return { state: "missing", oee: null, driver: null, drag: null, headline: "Sin datos para comparar" };
  }

  if (!oee.significant) {
    const state = "flat";
    return {
      state, oee, driver: null, drag: null,
      headline: oee.delta === 0
        ? "Sin cambio en el OEE"
        : `Cambio no significativo en el OEE (${signed(oee.delta)} pts)`,
    };
  }

  const mejoro = oee.delta > 0;
  const aFavor = factores.filter((m) => (mejoro ? m.delta > 0 : m.delta < 0));
  const enContra = factores.filter((m) => (mejoro ? m.delta < 0 : m.delta > 0));

  const byMagnitude = (arr) =>
    arr.slice().sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))[0] ?? null;

  // Solo se nombra el freno si es significativo; mencionar un −0.2 metería
  // en el veredicto el mismo ruido que intenta filtrar.
  const drag = byMagnitude(enContra.filter((m) => m.significant));

  return {
    state: mejoro ? "up" : "down",
    oee,
    driver: byMagnitude(aFavor),
    drag,
    headline: `${mejoro ? "B superó a A" : "B quedó por debajo de A"} en ${signed(oee.delta)} pts de OEE`,
  };
}

/** 6.4 → "+6.4" · −1.2 → "−1.2" (con el menos tipográfico, no el guion ASCII). */
export function signed(n, digits = 1) {
  const v = +Number(n).toFixed(digits);
  if (v > 0) return `+${v}`;
  if (v < 0) return `−${Math.abs(v)}`;
  return "0";
}

/* Escalas. */

/**
 * Dominio de eje ajustado a los datos, redondeado a múltiplos de `step`.
 *
 * Un `domain={[0, 100]}` desperdicia buena parte del lienzo, porque el OEE
 * real vive entre 55 y 90 y una diferencia de 6 puntos queda reducida a unos
 * píxeles.
 *
 * A cambio, truncar el eje amplifica visualmente la diferencia: quien consuma
 * esto debe mantener visibles las etiquetas del eje y alguna referencia
 * absoluta (la línea de meta).
 */
export function niceDomain(values, { pad = 8, step = 5, min = 0, max = 100 } = {}) {
  const nums = (values ?? []).filter((v) => Number.isFinite(v));
  if (!nums.length) return [min, max];

  const lo = Math.max(min, Math.floor((Math.min(...nums) - pad) / step) * step);

  // El eje no se recorta por arriba a 100: el rendimiento real pasa de 100 %
  // siempre que el ciclo medido va más rápido que el teórico, y con el tope
  // esos picos quedarían pegados al borde, indistinguibles de un 100 clavado.
  // `max` solo actúa como dominio de reserva cuando no hay valores.
  const hi = Math.ceil((Math.max(...nums) + pad) / step) * step;

  // Serie plana: no dejar un dominio de altura cero.
  if (hi - lo < step) return [Math.max(min, lo - step), Math.min(max, lo + step)];
  return [lo, hi];
}
