/**
 * El sistema de vibraciones en la forma común: proyección de
 * `createSistemaVibraciones()`.
 *
 * Gemelo de `estadoTanque.js`, y con la misma regla: no sustituye al dominio.
 * `evaluarRiesgosVibracion` sigue recibiendo `{ canales, variador, alarmas }`
 * tal cual, y eso viaja íntegro en `extra.dominio`.
 *
 * ── LA DECISIÓN DIFÍCIL DE ESTA PROYECCIÓN ─────────────────────────
 *
 * Qué `estado` ponerle a una medida que **nadie acota**.
 *
 * De las cuatro medidas por apoyo, sólo la velocidad eficaz tiene norma detrás
 * —ISO 10816-1 Clase I, y sólo cuando la máquina gira lo bastante rápido—. La
 * aceleración eficaz, el pico y el valor de daño no tienen umbral: el módulo
 * los vigila contra referencias suyas que este catálogo no conoce.
 *
 * Aquí salen con `estado: null`, que en la forma común significa «no hay
 * criterio», y **no** `nominal`. Marcarlas «en banda» habría sido cómodo —el
 * recuento saldría redondo y la pantalla, verde— y sería exactamente la clase
 * de autoridad inventada que este proyecto evita en todas partes: un aRMS de
 * 5,4 m/s² no está «en banda», está sin juzgar.
 *
 * ── Y LA QUE NO LO ES ──────────────────────────────────────────────
 *
 * `enReposo` sale `null`, no `false`. Esta máquina no tiene el concepto: no hay
 * dos señales que digan si está trabajando o descansando, como el caudal y la
 * carga del motor en el tanque. `false` afirmaría que está en marcha, y eso no
 * se sabe.
 */
import { estadoComun, senalComun } from "../comun/estadoMaquina.js";
import { createSistemaVibraciones } from "./sistemaVibraciones.js";
import {
  CANAL,
  CANALES,
  VIGILANCIAS,
  CONTADORES_ALARMA,
  LIMITES_ISO,
  MEDIDAS,
  RPM_MINIMA_ISO,
  VARIADOR,
  bandaISO,
  puntoAlarma,
  puntoMedida,
  puntoVariador,
} from "./vibraciones.js";

/** Zona de ISO 10816 → estado de la forma común. */
const ESTADO_POR_ZONA = { A: "nominal", B: "nominal", C: "atencion", D: "critico" };

/** El peor de una lista de estados, ignorando los que no tienen criterio. */
const PEOR = ["nominal", "atencion", "critico"];
function peorEstado(estados) {
  let peor = null;
  for (const e of estados) {
    if (!PEOR.includes(e)) continue;
    if (peor === null || PEOR.indexOf(e) > PEOR.indexOf(peor)) peor = e;
  }
  return peor;
}

/**
 * ── LA MISMA FUNCIÓN PARA UNA MÁQUINA CONFIGURADA (Plan 39 F1) ─────
 *
 * Hasta el 21-09-2026 esto sabía componer UNA máquina: la escrita a mano,
 * con sus tres apoyos de `CANALES` y sus tags fijos. Una configurada de este
 * mismo tipo llegaba al asistente con una lista plana de 73 variables sin
 * banda, y su resumen eran cuatro recuentos: el modelo decía «no tiene
 * lecturas» con 64 de 94 puntos leyendo. Medido en el Plan 38 F3.
 *
 * Lo que cambia es de dónde salen tres cosas, y las tres vienen por
 * `opciones`: el DOMINIO (una configurada lo reconstruye `dominioDesdeRoles`
 * desde sus roles; sin él se fabrica el de la escrita a mano, como siempre),
 * los APOYOS (los de esa máquina, con el nombre que les puso quien la
 * configuró) y cómo se llama cada señal EN ESA MÁQUINA (`resolver`: su id y
 * su tag literales, porque en el servidor `frecuencia` puede llamarse
 * `FREQ OUTPUT_BMS`). Sin opciones, la escrita a mano sale byte a byte igual.
 *
 * @param {(punto: string) => any} valorDe  valor ya saneado, o `null`
 * @param {object} sistemaRegistro          su entrada en `sistemas.js`
 * @param {string} [leidoA]
 * @param {object} [opciones]
 * @param {object} [opciones.dominio]   el dominio ya reconstruido; sin él, el de la escrita a mano
 * @param {{id: string, label: string, equipo?: string, rodamiento?: string|null}[]} [opciones.apoyos]
 *   los apoyos de ESA máquina; sin ellos, `CANALES`
 * @param {(clave: string) => ({clave?: string, tag?: string|null, label?: string|null, historia?: boolean}|null)} [opciones.resolver]
 *   cómo se llama en esa máquina lo que el tipo nombra `vRMS_S1`, `frecuencia` o `activasSinReconocer`
 * @param {string[]} [opciones.sinLectura]  los puntos sin lectura, si quien llama ya los contó sobre TODAS sus variables
 * @param {number} [opciones.puntosPedidos]
 */
export function estadoDeVibraciones(valorDe, sistemaRegistro, leidoA = null, opciones = {}) {
  const apoyos = opciones.apoyos ?? CANALES;
  const resolver = opciones.resolver ?? (() => null);
  const dominio = opciones.dominio ?? createSistemaVibraciones(valorDe);
  const { canales, variador, alarmas, sinDato, puntosPedidos } = dominio;

  /**
   * La señal con el nombre de ESTA máquina; sin resolvedor, el canónico del tipo.
   *
   * Con resolvedor, una clave que la máquina NO declara devuelve `null` y no
   * se emite: una configurada con un solo apoyo no puede salir con doce
   * señales «sin dato» de apoyos que no tiene. Eso no sería un hueco, sería
   * inventar la ausencia de algo que nadie declaró. La escrita a mano emite
   * su catálogo entero, como siempre.
   */
  const configurada = Boolean(opciones.resolver);
  const propia = (clave, tagPorDefecto, labelPorDefecto) => {
    const r = resolver(clave);
    if (configurada && !r) return null;
    const s = r ?? {};
    return {
      clave: s.clave ?? clave,
      tag: s.tag !== undefined ? s.tag : tagPorDefecto(),
      label: s.label ?? labelPorDefecto,
      ...(s.historia !== undefined ? { historia: s.historia } : {}),
      /* El motivo del hueco, como en el camino genérico de `construirSistema`;
         `senalComun` lo anula cuando hay valor. La escrita a mano no lo
         llevaba y no se le añade: no cambia ni un campo suyo. */
      ...(configurada ? { motivo: "El punto no entregó valor en esta lectura." } : {}),
    };
  };

  /*
   * ¿Aplica la norma? `null` —y no `false`— cuando no se sabe la velocidad.
   * «No se sabe si la norma aplica» y «la norma no aplica» son cosas distintas,
   * y la segunda apagaría el criterio de ISO en silencio. Mismo razonamiento
   * que `evaluarRiesgosVibracion`, y sale del mismo dato.
   */
  const velocidad = variador.velocidad;
  const normaAplicable =
    velocidad === null || velocidad === undefined ? null : velocidad >= RPM_MINIMA_ISO;

  const senales = [];

  for (const c of apoyos) {
    const d = canales[c.id] ?? {};
    for (const m of MEDIDAS) {
      const valor = d[m.key] ?? null;
      const banda = m.key === "vRMS" ? bandaISO(valor, normaAplicable) : null;
      // `vRMS_S1`: única dentro de la máquina, y es como la nombra el
      // servidor. `canal` va aparte para quien quiera agrupar por apoyo.
      const s = propia(`${m.key}_${c.id}`, () => puntoMedida(m.key, c.id), `${m.label} · ${c.label}`);
      if (!s) continue;

      senales.push(
        senalComun({
          ...s,
          valor,
          unidad: m.unidad,
          estado: valor === null ? "sin_dato" : banda ? ESTADO_POR_ZONA[banda.zona] ?? null : null,
          canal: c.id,
          grupo: c.id,
          banda: m.key === "vRMS" ? LIMITES_ISO : null,
          nota: m.norma ?? null,
          decimales: m.decimales,
        }),
      );
    }
  }

  for (const v of VARIADOR) {
    const valor = variador[v.key] ?? null;
    const s = propia(v.key, () => puntoVariador(v.key), v.label);
    if (!s) continue;
    senales.push(
      senalComun({
        ...s,
        valor,
        unidad: v.unidad,
        // El variador no tiene bandas declaradas en este catálogo.
        estado: valor === null ? "sin_dato" : null,
        grupo: "variador",
        decimales: v.decimales,
      }),
    );
  }

  for (const a of CONTADORES_ALARMA) {
    const valor = alarmas?.[a.key] ?? null;
    const s = propia(a.key, () => puntoAlarma(a.key), a.label);
    if (!s) continue;
    senales.push(
      senalComun({
        ...s,
        valor,
        unidad: "",
        estado: valor === null ? "sin_dato" : null,
        grupo: "alarmas",
        decimales: 0,
      }),
    );
  }

  return estadoComun({
    sistema: sistemaRegistro,
    senales,
    grupos: [
      ...apoyos.map((c) => ({
        id: c.id,
        label: c.label,
        responde: `¿Cómo vibra el ${c.label.toLowerCase()}?${c.equipo ? ` (${c.equipo})` : ""}`,
      })),
      { id: "variador", label: "Variador", responde: "¿A qué régimen y con qué carga gira?" },
      {
        id: "alarmas",
        label: "Servidor de alarmas",
        responde: "¿Cuántas alarmas tiene ICONICS activas en esta área?",
      },
    ],
    /* El titular sale sólo de lo que TIENE criterio: las velocidades eficaces
       contra ISO. Si ninguna se puede juzgar, no hay titular — y `null` dice
       eso mejor que un «nominal» que nadie ha comprobado. */
    estadoGeneral: peorEstado(senales.map((s) => s.estado)),
    enReposo: null,
    /* Una configurada cuenta sus huecos sobre TODAS sus variables (también las
       que el tipo no nombra); el dominio sólo sabe de las que tienen rol. */
    sinLectura: opciones.sinLectura ?? sinDato,
    puntosPedidos: opciones.puntosPedidos ?? puntosPedidos,
    leidoA,
    /* `apoyos` viaja en el estado para que el resumen y el narrador inglés
       hablen de los apoyos de ESTA máquina, no de los del catálogo. */
    extra: { dominio, normaAplicable, canal: CANAL, apoyos },
  });
}

/* ── Cómo se cuenta esta máquina al asistente ───────────────────── */

/**
 * ── POR QUÉ AQUÍ LA FRASE VIENE HECHA Y EN EL TANQUE NO ────────────
 *
 * Porque está MEDIDO que con los campos sueltos el modelo local lee mal esta
 * máquina. Tres veces seguidas dijo «velocidad eficaz 1,13 mm/s» cuando el 1,13
 * era la ACELERACIÓN —otra magnitud y otras unidades—, y convirtió un «no se
 * pudo leer» en «tiene aviso activo». No es un fallo del modelo: son cuatro
 * magnitudes parecidas repetidas en tres apoyos, y los nombres se solapan.
 *
 * Reforzar las instrucciones no bastó. Lo que sí funciona es no pedirle que
 * arme la frase: cada apoyo llega ya redactado desde el código, donde quien
 * junta el número con su nombre y su unidad no es un modelo de lenguaje.
 *
 * El tanque no lo necesita: ocho señales con nombres que no se confunden. Por
 * eso el narrador es de cada máquina y no del asistente — y por eso mismo la
 * máquina #3 tiene que decidir cuál de las dos formas le conviene, mirando cómo
 * falla con su propio catálogo y no copiando la de al lado.
 */

const cifra = (x, u, n) => (Number.isFinite(x) ? `${x.toFixed(n)} ${u}` : "no se pudo leer");

/**
 * El estado de vibraciones, para el asistente.
 *
 * Firma común a todos los narradores: `(estado, ctx)`. Ver `estadoTanque.js`.
 *
 * @param {object} estado la forma común de `estadoDeVibraciones`
 * @param {object} ctx    `{ riesgos, agrupar, horaLocal }`
 */
export function resumenVibracionesParaAsistente(estado, ctx = {}) {
  const { riesgos, agrupar } = ctx;
  const { canales, variador, alarmas } = estado.dominio;
  const sinLectura = estado.sinLectura.length;
  /* Los apoyos de la máquina que se está contando (Plan 39 F1); la escrita a
     mano los trae de `CANALES` y sale igual que siempre. */
  const apoyos = estado.apoyos ?? CANALES;

  return {
    sistema: "Sistema de vibraciones — OTRA MÁQUINA, no el tanque",
    maquina: estado.maquina,
    fuente: "tiempo real",

    apoyos: apoyos.map((c) => {
      const d = canales[c.id] ?? {};
      const apagadas = VIGILANCIAS.filter(
        (v) => v.grupo === "rodamiento" && d.vigilancias?.[v.key]?.id === "apagado",
      ).map((v) => v.key.toUpperCase());
      const veredicto = bandaISO(d.vRMS, estado.normaAplicable);

      /* Las banderas se cuentan en UNA frase, y nunca como «¿Aviso? no se pudo
         leer»: con esa forma el modelo se quedaba con las palabras «aviso» y
         «módulo» juntas y escribía «tiene aviso activo». La ausencia se dice
         sin nombrar lo que estaría activo. */
      const banderas =
        d.alarma === null || d.aviso === null
          ? "El módulo no está entregando el estado de este apoyo, así que no consta ni una cosa ni la otra."
          : d.alarma === true
            ? "El módulo tiene la ALARMA encendida en este apoyo."
            : d.aviso === true
              ? "El módulo tiene el AVISO encendido en este apoyo."
              : "El módulo lo da por correcto: ni alarma ni aviso encendidos.";

      return (
        `${c.label} (${c.id}, rodamiento ${c.rodamiento ?? "sin identificar"}): ` +
        `velocidad eficaz ${cifra(d.vRMS, "mm/s", 3)}` +
        (veredicto ? `, que es ${veredicto.label} de ISO 10816-1 Clase I` : "") +
        `. Aceleración eficaz ${cifra(d.aRMS, "m/s²", 3)}. ` +
        `Valor de daño: ${Number.isFinite(d.DKW) ? d.DKW.toFixed(3) : "sin referencia aprendida"}. ` +
        banderas +
        (apagadas.length
          ? ` El diagnóstico de rodamiento está APAGADO aquí (${apagadas.join(", ")}): nadie lo vigila.`
          : "")
      );
    }),

    variador: {
      velocidad_rpm: variador.velocidad ?? "NO SE PUDO LEER",
      frecuencia_hz: variador.frecuencia ?? "NO SE PUDO LEER",
      par_pct: variador.par ?? "NO SE PUDO LEER",
      fallo: variador.fallo ?? "NO SE PUDO LEER",
    },

    servidor_de_alarmas: {
      activas_sin_reconocer: alarmas.activasSinReconocer ?? "NO SE PUDO LEER",
      activas_reconocidas: alarmas.activasReconocidas ?? "NO SE PUDO LEER",
      volvieron_a_normal_sin_reconocer: alarmas.normalSinReconocer ?? "NO SE PUDO LEER",
      detalle: "Sólo hay contadores del área: CUÁL alarma se disparó no se puede saber desde aquí.",
    },

    norma: `ISO 10816-1 Clase I: aviso ${LIMITES_ISO.aviso} mm/s, alarma ${LIMITES_ISO.alarma} mm/s`,
    norma_aplicable: estado.normaAplicable,

    /* Una entrada por REGLA y no por apoyo: las de canal se evalúan tres veces
       y cuando la causa es común salen tres entradas casi idénticas. «Está
       apagado en los tres apoyos» es además una frase mejor que la misma
       repetida tres veces. La pantalla las sigue recibiendo por separado. */
    riesgos: agrupar(riesgos.activos),

    /* Se cuentan, no se listan una a una: nueve entradas de texto costaban mil
       caracteres para decir algo que cabe en una frase, y lo que el modelo
       tiene que saber es que NO se miraron. */
    sin_comprobar:
      riesgos.noEvaluables.length === 0
        ? "ninguna: se pudieron evaluar todas las reglas"
        : `${riesgos.noEvaluables.length} reglas no se pudieron evaluar por falta de lecturas: ` +
          [...new Set(riesgos.noEvaluables.map((x) => x.titulo))].slice(0, 4).join("; "),

    puntos_sin_lectura: sinLectura,
    /*
     * ── ESTE AVISO DECÍA «SIN HISTÓRICO UTILIZABLE» ────────────────
     *
     * Y dejó de ser verdad el 28-08-2026, cuando el grupo DEMO 3 empezó a
     * registrar. La frase se quedó, y el efecto fue peor que el de un dato
     * viejo: el modelo la leía DENTRO del resultado de la herramienta —donde
     * los avisos pesan más que las instrucciones— y se negaba a dar una
     * media que el historiador tenía. Preguntado por el promedio de la
     * velocidad eficaz de ayer, contestó que no podía.
     *
     * Lo que sí sigue siendo cierto es lo otro: sin mecanismos de desgaste
     * declarados no hay pronóstico. Se puede contar cómo ha evolucionado una
     * medida; no se puede poner plazo a una avería. Esa mitad se conserva,
     * porque es la que evita la respuesta que más convence y más daño hace.
     */
    aviso:
      "OTRA MÁQUINA, no el tanque: no relaciones estas vibraciones con su caudal, presión " +
      "ni nivel. SÍ hay histórico de sus medidas, banderas y variador: se puede consultar con " +
      `historia_de_senal(sistema="${estado.sistema ?? "vibraciones"}"). Lo que NO se puede es poner plazo a una ` +
      "avería: esta máquina no tiene mecanismos de desgaste declarados." +
      (sinLectura > 0
        ? ` Ahora mismo ${sinLectura} de ${estado.puntosPedidos} puntos no entregan lectura: eso no ` +
          "es una máquina tranquila, es una máquina callada."
        : ""),
  };
}
