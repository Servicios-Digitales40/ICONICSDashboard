/**
 * La forma `Sistema`: el único vocabulario que conocen las vistas de Demo EVA.
 *
 * Es el equivalente de `createMachine` para este árbol, y respeta el mismo pacto
 * que ya rige en todo el proyecto:
 *
 *  - Todo valor es `number | boolean | null`, y `null` significa **no hay
 *    medición**. Las vistas pintan un hueco, nunca un cero.
 *  - El saneamiento vive aquí, en la frontera, y no en los componentes.
 *  - Nadie fuera de este archivo construye una señal a mano.
 *
 * Se reutilizan `toNumber` y `hasValue` del dominio compartido: son
 * saneadores genéricos —descartan `NaN`, `Infinity`, cadenas vacías y
 * objetos— y no tienen nada de OEE. Lo que NO se reutiliza es `createMachine`,
 * que impone campos (`oee`, `aprobadas`, `estado` por código) que aquí no
 * existen y que sólo se podrían rellenar inventándolos.
 *
 * ── EL ORDEN DE CONSTRUCCIÓN NO ES ARBITRARIO ──────────────────────
 *
 * Primero se sanean los ocho valores, LUEGO se decide si el sistema está en
 * reposo, y sólo entonces se evalúa cada señal. Tiene que ser en ese orden
 * porque el reposo se calcula con dos señales (caudal y carga) y condiciona la
 * evaluación de las otras: invertirlo dejaría media instalación evaluada contra
 * sus bandas de marcha mientras la bomba está parada.
 */
import { hasValue, toNumber } from "../../valores.js";

import { SENALES, SENAL_KEYS } from "./senales.js";
import { ACTIVO_IDS, ACTIVOS } from "./activos.js";
import { ESTADOS_ORDEN, enReposo, estadoDeSenal, peor } from "./estado.js";
import { bandaDe, margenConsumido } from "../comun/umbrales.js";

/**
 * Booleano utilizable o `null`.
 *
 * No vale `toNumber`: convertiría `false` en 0 y un 0 es un número perfectamente
 * válido, así que «modo automático» se volvería indistinguible de «modo sin
 * leer». ICONICS entrega este punto como booleano nativo, pero se aceptan
 * también las formas que llegan de un servidor OPC mal tipado.
 */
export function toBooleano(raw) {
  if (raw === true || raw === false) return raw;
  if (raw === 1 || raw === 0) return Boolean(raw);
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (s === "true" || s === "1") return true;
    if (s === "false" || s === "0") return false;
  }
  return null;
}

/** Sanea un valor crudo según el tipo declarado de su señal. */
function sanear(key, raw) {
  return SENALES[key]?.tipo === "booleano" ? toBooleano(raw) : toNumber(raw);
}

/**
 * Construye una señal ya evaluada.
 *
 * `texto` sólo lo llevan las booleanas, y sale de `etiquetas` del catálogo: es
 * la única forma de que «Manual»/«Automático» se escriba en un sitio y no en
 * cada tarjeta que lo pinte.
 */
export function createSenal({
  key,
  valor = null,
  receivedAt = null,
  stale = false,
  reposo = false,
  /*
   * Por qué NO hay valor, cuando no lo hay (Plan 21 F3). `null` significa dos
   * cosas distintas y las dos son legítimas: que la lectura es buena, o que el
   * punto no vino y por tanto no hay calidad que interpretar. Lo que ya no
   * puede pasar es que haya un hueco por mala calidad y nadie sepa cuál.
   */
  motivo = null,
}) {
  const meta = SENALES[key];
  if (!meta) return null;

  const v = sanear(key, valor);
  const estado = estadoDeSenal(key, v, { reposo });

  return {
    ...meta,
    valor: v,
    texto: meta.tipo === "booleano" && v !== null ? meta.etiquetas?.[String(v)] ?? null : null,
    estado,
    // La banda cruda se conserva junto al estado porque no son lo mismo: una
    // señal en `reposo` puede estar fuera de banda, y la tarjeta lo explica.
    banda: meta.tipo === "booleano" ? null : bandaDe(key, v),
    margen: meta.tipo === "booleano" ? null : margenConsumido(key, v),
    /* Sólo cuando de verdad falta el valor: un motivo junto a una medición
       buena sería ruido, y peor, invitaría a leerlo como una advertencia. */
    motivo: v === null ? motivo : null,
    receivedAt,
    stale,
  };
}

/** Agrupa las señales ya evaluadas en su activo y le asigna el peor estado. */
function createActivo(id, porClave) {
  const meta = ACTIVOS[id];
  const senales = meta.senales.map((k) => porClave[k]).filter(Boolean);

  return {
    ...meta,
    senales,
    estado: peor(senales.map((s) => s.estado)),
    sinDato: senales.filter((s) => s.estado === "sin_dato").length,
  };
}

/**
 * Reparto por estado, respetando `ESTADOS_ORDEN` y omitiendo los vacíos.
 * Alimenta la barra apilada y su leyenda, igual que `porEstado` en Resonac.
 */
const repartoPorEstado = (senales) =>
  ESTADOS_ORDEN.map((estado) => ({
    estado,
    valor: senales.filter((s) => s.estado === estado).length,
  })).filter((e) => e.valor > 0);

/**
 * Punto de entrada único.
 *
 * `lecturas` es `{ [clave]: { value, receivedAt, stale, motivo } }`, tal como lo
 * entrega el motor de polling: valor ya filtrado por calidad, o `null`, y —desde
 * el Plan 21 F3— POR QUÉ es `null` cuando lo es.
 */
export function createSistema(lecturas = {}) {
  const crudos = Object.fromEntries(
    SENAL_KEYS.map((k) => [k, sanear(k, lecturas[k]?.value ?? null)])
  );

  const reposo = enReposo(crudos);

  const porClave = {};
  for (const key of SENAL_KEYS) {
    porClave[key] = createSenal({
      key,
      valor: crudos[key],
      receivedAt: lecturas[key]?.receivedAt ?? null,
      stale: lecturas[key]?.stale ?? false,
      motivo: lecturas[key]?.motivo ?? null,
      reposo,
    });
  }

  const lista = SENAL_KEYS.map((k) => porClave[k]);
  const activos = ACTIVO_IDS.map((id) => createActivo(id, porClave));

  // La lectura más reciente de cualquier señal: es lo que fecha la pantalla.
  const receivedAt = lista.reduce(
    (max, s) => (s.receivedAt && (!max || s.receivedAt > max) ? s.receivedAt : max),
    null
  );

  return {
    senales: porClave,
    lista,
    activos,

    /** El peor estado de todo el sistema. Es el titular de la cabecera. */
    estado: peor(activos.map((a) => a.estado)),
    enReposo: reposo,

    receivedAt,
    stale: lista.some((s) => s.stale),

    resumen: {
      totalSenales: lista.length,
      medidas: lista.filter((s) => hasValue(s.valor)).length,
      sinDato: lista.filter((s) => s.estado === "sin_dato").length,
      enAviso: lista.filter((s) => s.estado === "atencion").length,
      fueraDeLimite: lista.filter((s) => s.estado === "critico").length,
      enBanda: lista.filter((s) => s.estado === "nominal").length,
      totalActivos: activos.length,
      activosEnBanda: activos.filter((a) => a.estado === "nominal").length,
      porEstado: repartoPorEstado(lista),
    },
  };
}

/**
 * Sistema sin ninguna lectura todavía. Evita que la primera pintada tenga que
 * tratar el caso «no hay objeto»: hay objeto, y todo dentro dice «sin dato».
 */
export const SISTEMA_VACIO = createSistema({});

