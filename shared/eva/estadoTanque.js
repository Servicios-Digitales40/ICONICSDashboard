/**
 * El tanque en la forma común: proyección de `createSistema()`.
 *
 * No sustituye a nada. `sistema.js` sigue siendo el dominio de esta
 * instalación —el objeto que pintan las vistas y que evalúan `riesgos.js` y
 * `pronostico.js`— y esto es lo que se sirve hacia afuera para que el
 * asistente, los informes y las gráficas genéricas no tengan que aprender su
 * forma particular. Ver la cabecera de `estadoMaquina.js`.
 *
 * ── LO QUE ESTA PROYECCIÓN CONSERVA A PROPÓSITO ────────────────────
 *
 * El REPOSO. Es lo más fácil de perder al normalizar, porque no encaja en
 * «bien / aviso / mal»: cuatro de las ocho señales sólo significan algo con la
 * bomba impulsando, y con la instalación parada aparecen como «En reposo» y no
 * como fuera de límite. Aplanarlo a `critico` haría que el asistente avisara de
 * una avería cada vez que la instalación descansa, que es su situación
 * habitual; aplanarlo a `nominal` diría que todo va bien de señales que nadie
 * está midiendo.
 *
 * Por eso `enReposo` es un campo de primer nivel de la forma común y `reposo`
 * es uno de sus estados, aunque hoy sólo esta máquina lo use.
 */
import { ACTIVOS, ACTIVO_IDS } from "./activos.js";
import { DERIVADO, estadoInfo } from "./estado.js";
import { estadoComun, senalComun } from "./estadoMaquina.js";
import { RAIZ, SENALES, TODOS_LOS_PUNTOS, pointName } from "./senales.js";
import { createSistema } from "./sistema.js";
import { PROVISIONALES, UMBRALES } from "./umbrales.js";

/** A qué activo pertenece cada señal, para el campo `grupo`. */
const grupoDe = (clave) => SENALES[clave]?.activo ?? null;

/**
 * @param {(punto: string) => any} valorDe  valor ya saneado, o `null`
 * @param {object} sistemaRegistro          su entrada en `sistemas.js`
 * @param {string} [leidoA]
 */
export function estadoDelTanque(valorDe, sistemaRegistro, leidoA = null) {
  const lecturas = {};
  const sinLectura = [];

  for (const clave of Object.keys(SENALES)) {
    const punto = pointName(clave);
    const v = valorDe(punto);
    if (v === null || v === undefined) sinLectura.push(punto);
    lecturas[clave] = { value: v ?? null, receivedAt: leidoA };
  }

  const s = createSistema(lecturas);

  const senales = s.lista.map((x) => {
    const punto = pointName(x.key);
    return senalComun({
      clave: x.key,
      label: x.label,
      valor: x.valor,
      unidad: x.unidad ?? "",
      estado: x.estado,
      /* «Manual»/«Automático» sale del catálogo, no de quien pinta: es la
         única forma de que esa palabra se escriba en un sitio. */
      texto: x.texto,
      grupo: grupoDe(x.key),
      /* El punto COMPLETO, no el tag suelto: es lo que hace falta para
         rastrearlo en el servidor, y es lo que da la otra máquina. Dos formas
         del mismo campo obligarían a quien lo consuma a saber de cuál viene. */
      tag: punto,
      /* La banda viaja como el par de límites, no como una etiqueta: quien la
         reciba tiene que poder decir CONTRA QUÉ se está evaluando, que es lo
         que separa un umbral medido de una estimación nuestra. */
      banda: UMBRALES[x.key] ?? null,
      nota: SENALES[x.key]?.nota ?? null,
      decimales: x.decimales,
      historia: x.historizado,
    });
  });

  return estadoComun({
    sistema: sistemaRegistro,
    senales,
    grupos: ACTIVO_IDS.map((id) => ({
      id,
      label: ACTIVOS[id].label,
      responde: ACTIVOS[id].pregunta,
    })),
    estadoGeneral: s.estado,
    enReposo: s.enReposo,
    sinLectura,
    puntosPedidos: TODOS_LOS_PUNTOS.length,
    leidoA,
    /* El objeto de dominio viaja entero para quien lo necesite: `riesgos.js` y
       `pronostico.js` lo esperan tal cual, y volver a construirlo desde la
       forma común sería reconstruir con menos información de la que había. */
    extra: { dominio: s },
  });
}

/* ── Cómo se cuenta esta máquina al asistente ───────────────────── */

/**
 * ── POR QUÉ EL NARRADOR ES DE CADA MÁQUINA Y NO DEL ASISTENTE ──────
 *
 * Porque lo que un modelo de lenguaje necesita para no equivocarse depende de
 * la máquina. Aquí bastan los campos sueltos: ocho señales con nombres que no
 * se parecen entre sí. En vibraciones NO basta —hay cuatro magnitudes por
 * apoyo, tres apoyos, y con los campos delante el modelo cogía el que no era—,
 * así que su narrador redacta la frase desde el código.
 *
 * Antes eso eran dos HERRAMIENTAS distintas, y por eso el tanque tenía ocho y
 * vibraciones una. Ahora es una herramienta y dos narradores: el modelo ve un
 * `estado_del_sistema(sistema)`, y cada máquina decide cómo se describe.
 */

/** Redondeo a los decimales del catálogo. Ver `decimales` en `estadoMaquina.js`. */
const redondear = (valor, decimales) =>
  typeof valor === "number" && Number.isFinite(valor) ? +valor.toFixed(decimales ?? 1) : valor;

/**
 * La banda en palabras que el modelo pueda copiar sin restar nada.
 *
 * `null` en un extremo significa **sin límite por ese lado**, no cero: una
 * eficiencia energética no es peor por ser alta. Escribirlo como «sin límite» y
 * no omitirlo evita que el modelo rellene el hueco con un 0 inventado.
 */
function bandaLegible(u) {
  const lado = (v) => (v === null || v === undefined ? "sin límite" : v);
  return {
    limiteInferior: lado(u.min),
    avisoInferior: lado(u.avisoMin),
    avisoSuperior: lado(u.avisoMax),
    limiteSuperior: lado(u.max),
  };
}

/**
 * El aviso de procedencia de los umbrales.
 *
 * Va en el RESULTADO y no en el prompt del sistema: una advertencia que sólo
 * vive en las instrucciones se diluye a los tres turnos de conversación, y ésta
 * tiene que acompañar a cada cifra que se compare contra una banda.
 *
 * La clave es `aviso` y no `avisoUmbrales`, y no es cosmético: es el campo que
 * `chat.mjs` vigila para añadir la advertencia detrás cuando el modelo no la
 * cuenta.
 */
export const avisoDeUmbralesTanque = () =>
  PROVISIONALES
    ? {
      aviso:
          "Los límites con los que se evalúa cada señal son ESTIMACIONES NUESTRAS para un " +
          "sistema de agua genérico, no rangos confirmados por quien opera la instalación. " +
          "Dilo al dar un veredicto.",
    }
    : {};

/** Una señal en la forma que el modelo lee mejor. */
function describir(s) {
  return {
    senal: s.label,
    clave: s.clave,
    tag: s.tag,
    valor: redondear(s.valor, s.decimales),
    ...(s.texto ? { texto: s.texto } : {}),
    unidad: s.unidad || null,
    estado: estadoInfo(s.estado).label,
    ...(s.estado === "reposo"
      ? { porQueReposo: "El sistema no está impulsando, así que esta señal no significa nada ahora." }
      : {}),
    ...(s.banda ? { banda: bandaLegible(s.banda) } : {}),
    historia: s.historia,
    ...(s.nota ? { nota: s.nota } : {}),
  };
}

/**
 * El estado del tanque, para el asistente.
 *
 * Firma común a todos los narradores: `(estado, ctx)`. `ctx` trae lo que el
 * backend sabe y el dominio no —la hora en la zona del servidor, los riesgos ya
 * evaluados, el agrupador—, y cada máquina usa lo que necesita. El tanque no
 * usa `riesgos` aquí porque tiene su propia herramienta para eso; vibraciones
 * sí, porque es donde vive la mitad de su respuesta.
 *
 * @param {object} estado la forma común de `estadoDelTanque`
 * @param {object} [ctx]  `{ horaLocal, riesgos, agrupar }`
 */
export function resumenTanqueParaAsistente(estado, ctx = {}) {
  const { horaLocal = null } = ctx;
  const r = estado.recuento;

  return {
    instalacion: "Sistema de agua industrial",
    sistema: estado.sistema,
    raiz: RAIZ,
    fuente: "tiempo real",
    leidoA: horaLocal ?? estado.leidoA,

    estadoGeneral: estadoInfo(estado.estadoGeneral).label,
    enReposo: estado.enReposo,
    ...(estado.enReposo
      ? {
        queSignificaReposo:
            "La instalación no está impulsando agua: el motor está a cero y no circula caudal. " +
            "Es su situación habitual. Las señales que sólo tienen sentido en marcha (caudal, " +
            "presión, carga del motor y eficiencia) no se evalúan contra su banda mientras dure, " +
            "y aparecen como «En reposo» en vez de fuera de límite.",
      }
      : {}),

    recuento: {
      senales: r.senales,
      conMedicion: r.conMedicion,
      enBanda: r.enBanda,
      enAviso: r.enAviso,
      fueraDeLimite: r.fueraDeLimite,
      sinDato: r.sinDato,
    },

    // Agrupadas como en la pantalla: cada activo responde una pregunta
    // («¿hay agua?», «¿se está impulsando?»), y esa agrupación es NUESTRA
    // porque el servidor no publica equipos bajo esta raíz.
    activos: estado.grupos.map((g) => ({
      activo: g.label,
      responde: g.responde,
      estado: estadoInfo(
        estado.senales.filter((s) => s.grupo === g.id).map((s) => s.estado).reduce(
          (peor, e) => (estadoInfo(e).orden < estadoInfo(peor).orden ? e : peor),
          "nominal",
        ),
      ).label,
      senales: estado.senales.filter((s) => s.grupo === g.id).map(describir),
    })),

    conHistoria: estado.senales.filter((s) => s.historia).map((s) => s.label),
    ...(DERIVADO ? avisoDeUmbralesTanque() : {}),
  };
}
