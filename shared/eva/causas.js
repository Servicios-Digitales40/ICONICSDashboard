/**
 * Causas candidatas por riesgo — Plan 16 Fase 3.
 *
 * ── ESTO NO ES AUTORÍA, ES TRANSCRIPCIÓN ────────────────────────────
 *
 * Cada entrada de aquí sale de un campo que YA EXISTÍA antes de este archivo:
 * el `accion` o la `consecuencia` de una regla de `riesgos.js` /
 * `riesgosVibracion.js`. Quien escribió esa regla ya había pensado «si esto
 * pasa, qué se mira primero» — este archivo sólo lo saca de una frase en
 * prosa y lo pone en una forma que `diagnostico.mjs` (Fase 4) pueda puntuar y
 * ordenar, sin haber entrevistado a nadie ni inventado nada que no estuviera
 * ya escrito. Ver docs/PLAN-16-DIAGNOSTICO-RAG.md §3 para la decisión
 * completa.
 *
 * ── POR QUÉ NO TODOS LOS RIESGOS ESTÁN AQUÍ ─────────────────────────
 *
 * Un riesgo entra si su `accion`/`consecuencia` NOMBRA algo que pueda fallar
 * — «revisar la válvula de alivio» es una causa candidata; «atender el fallo
 * del variador» no lo es, porque el fallo YA ESTÁ identificado por el propio
 * riesgo y no hay nada más que diagnosticar debajo. Quedan fuera a propósito
 * los riesgos puramente informativos (`variador-en-manual`) y los que son
 * sobre el estado de la instrumentación, no de la máquina
 * (`variador-en-fallo`, `sensor-con-desviacion`, `confianza-de-medida-baja`,
 * `alarmas-activas`, `alarmas-sin-reconocer`, `dkw-sin-referencia`,
 * `rodamientos-sin-vigilar`, `medida-sin-vigilar`, `vigilancia-en-aviso` —
 * ésta última ya dice QUÉ vigilancia concreta se disparó en su propia
 * `evidencia`, con el nombre del defecto que trae declarado
 * `VIGILANCIAS` en `vibraciones.js`, así que no necesita una lista aparte—,
 * y las de rango de medida (`velocidad-fuera-de-norma`,
 * `velocidad-en-el-borde-de-la-banda`, `por-debajo-del-minimo-del-modulo`,
 * `medida-en-vacio`).
 *
 * `diagnostico.mjs` no falla ante un riesgo sin entrada aquí: lo dice, en vez
 * de callarse. Ver `causasDe()` al final del archivo.
 *
 * ── DOS CLASES DE «PROVISIONAL», Y NO SE CONFUNDEN ──────────────────
 *
 * Las causas del TANQUE heredan `PROVISIONALES` de `umbrales.js` en vivo:
 * son provisionales porque el UMBRAL que dispara el riesgo es una estimación
 * nuestra, y cuando alguien confirme los rangos reales dejan de serlo solas,
 * sin tocar este archivo.
 *
 * Las de VIBRACIÓN por vibración alta (`vibracion-en-alarma`,
 * `vibracion-en-aviso`) NO son provisionales por esa razón: están detrás de
 * ISO 10816-1, una norma de verdad, no una estimación nuestra. La de
 * `asimetria-entre-apoyos` sí es provisional, pero por un motivo DISTINTO e
 * independiente de `PROVISIONALES`: no hay norma detrás, es una convención
 * de mantenimiento —lo dice la propia regla en `riesgosVibracion.js`— y eso
 * no cambia el día que se confirmen los umbrales del tanque.
 */
import { PROVISIONALES } from "./umbrales.js";

/**
 * Azúcar para no repetir `provisional`/`origen` en cada causa del tanque.
 *
 * `firmaTemporal` es OPCIONAL (Plan 17 Fase 6, G5): una causa sin ella saca
 * `temporal: 0` y no se penaliza —ver `backend/ia/motor/temporal.mjs`—. Cuando se
 * declara, es la MISMA regla de transcripción del resto del archivo: sale
 * de una frase que YA ESTABA escrita en `riesgos.js`, no de una relación
 * física inventada aquí.
 */
function causaTanque({ id, titulo, componente, terminosManual, riesgoId, firmaTemporal }) {
  return {
    id,
    titulo,
    componente,
    terminosManual,
    origen: `riesgos.js · accion (${riesgoId})`,
    provisional: PROVISIONALES,
    ...(firmaTemporal ? { firmaTemporal } : {}),
  };
}

/** Las tres causas habituales de vibración alta según ISO 10816-1 —mismo
 *  fenómeno físico, dos zonas de severidad distinta (`vibracion-en-alarma` es
 *  zona D, `vibracion-en-aviso` es zona C)—, así que las dos reglas comparten
 *  exactamente estas tres candidatas. */
function causasVibracionAlta(riesgoId) {
  return [
    {
      id: "desequilibrio",
      titulo: "Desequilibrio del rotor",
      componente: "Rotor / acoplamiento",
      terminosManual: ["desequilibrio", "balanceo", "rotor"],
      origen: `riesgosVibracion.js · consecuencia (${riesgoId})`,
      provisional: false, // ISO 10816-1, no una estimación nuestra
    },
    {
      id: "desalineacion",
      titulo: "Desalineación del acoplamiento",
      componente: "Acoplamiento motor-bomba",
      terminosManual: ["desalineacion", "alineacion", "acoplamiento"],
      origen: `riesgosVibracion.js · consecuencia (${riesgoId})`,
      provisional: false,
    },
    {
      id: "aflojamiento-anclaje",
      titulo: "Aflojamiento del anclaje o la bancada",
      componente: "Bancada / pernos de anclaje",
      terminosManual: ["aflojamiento", "anclaje", "bancada", "fijacion"],
      origen: `riesgosVibracion.js · consecuencia (${riesgoId})`,
      provisional: false,
    },
  ];
}

/**
 * Causas candidatas, por id de riesgo. Un riesgo que no aparece aquí no
 * tiene causas declaradas — `causasDe()` lo dice explícitamente, nunca lo
 * calla ni lo confunde con una lista vacía por descuido.
 */
export const CAUSAS_POR_RIESGO = {
  /* ── Tanque ───────────────────────────────────────────────────────── */

  derrame: [
    causaTanque({
      id: "corte-nivel-alto-no-actua",
      titulo: "El corte automático por nivel alto no está actuando",
      componente: "Lazo de control de nivel alto",
      terminosManual: ["nivel alto", "corte", "enclavamiento", "lazo de control"],
      riesgoId: "derrame",
    }),
  ],

  "marcha-en-seco": [
    causaTanque({
      id: "nivel-real-insuficiente",
      titulo: "El nivel real del tanque es insuficiente",
      componente: "Suministro de agua al tanque",
      terminosManual: ["nivel", "suministro", "llenado", "aporte de agua"],
      riesgoId: "marcha-en-seco",
    }),
    causaTanque({
      id: "proteccion-nivel-bajo-no-actua",
      titulo: "La protección por nivel bajo no está actuando",
      componente: "Lazo de control de nivel bajo",
      terminosManual: ["nivel bajo", "proteccion", "enclavamiento", "corte"],
      riesgoId: "marcha-en-seco",
    }),
  ],

  sobrepresion: [
    causaTanque({
      id: "consigna-variador-alta",
      titulo: "La consigna del variador está por encima de lo debido",
      componente: "Variador de frecuencia",
      terminosManual: ["consigna", "variador", "frecuencia", "velocidad"],
      riesgoId: "sobrepresion",
    }),
    causaTanque({
      id: "valvula-alivio-no-actua",
      titulo: "La válvula de alivio no está actuando",
      componente: "Válvula de alivio",
      terminosManual: ["valvula de alivio", "seguridad", "tarado"],
      riesgoId: "sobrepresion",
    }),
  ],

  obstruccion: [
    causaTanque({
      id: "valvula-impulsion-parcialmente-cerrada",
      titulo: "Válvula de la línea de impulsión parcialmente cerrada",
      componente: "Válvula de impulsión",
      terminosManual: ["valvula", "impulsion", "cierre"],
      riesgoId: "obstruccion",
    }),
    causaTanque({
      id: "filtro-colmatado",
      titulo: "Filtro de línea colmatado",
      componente: "Filtro de línea",
      terminosManual: ["filtro", "colmatado", "obstruccion"],
      riesgoId: "obstruccion",
    }),
  ],

  "bomba-sin-salida": [
    causaTanque({
      id: "valvula-impulsion-cerrada",
      titulo: "Válvula de impulsión cerrada o agarrotada",
      componente: "Válvula de impulsión",
      terminosManual: ["valvula", "impulsion", "cierre", "agarrotada"],
      riesgoId: "bomba-sin-salida",
    }),
    causaTanque({
      id: "sin-recirculacion-minima",
      titulo: "Sin línea de recirculación mínima",
      componente: "Línea de recirculación",
      terminosManual: ["recirculacion", "caudal minimo", "by-pass"],
      riesgoId: "bomba-sin-salida",
      /*
       * Transcrita, no inventada: la propia `consecuencia` de la regla
       * `bomba-sin-salida` en `riesgos.js` dice «la temperatura del líquido
       * atrapado en la bomba puede subir rápidamente» — es el mecanismo
       * PROPIO de esta causa (sin salida de calor, el líquido se calienta
       * con el tiempo), y no el de `valvula-impulsion-cerrada` (una válvula
       * cerrada es un cambio de estado, no una tendencia). Es exactamente
       * la fuente que discrimina entre las dos causas del mismo riesgo que
       * `datos` —misma evidencia física para las dos— no puede dar.
       */
      firmaTemporal: [{ senal: "temperaturaTanque", direccion: "sube", ventanaH: 1 }],
    }),
  ],

  "posible-fuga": [
    causaTanque({
      id: "fuga-o-rotura-en-la-red",
      titulo: "Fuga, rotura o salida abierta en la red",
      componente: "Red de distribución",
      terminosManual: ["fuga", "rotura", "descarga anomala"],
      riesgoId: "posible-fuga",
    }),
  ],

  "esfuerzo-sin-resultado": [
    {
      // Mismo `id` de riesgo en riesgos.js y de mecanismo en pronostico.js —
      // la única correspondencia literal entre los dos catálogos—, así que
      // el componente se toma de `MECANISMOS` (más preciso: nombra también
      // los rodamientos) en vez de repetir sólo lo que dice `consecuencia`.
      id: "impulsor-desgastado",
      titulo: "Impulsor desgastado",
      componente: "Impulsor y rodamientos de la bomba",
      terminosManual: ["impulsor", "desgaste", "rodete", "rodamientos"],
      origen: "riesgos.js · consecuencia + pronostico.js · MECANISMOS (esfuerzo-sin-resultado)",
      provisional: PROVISIONALES,
    },
    causaTanque({
      id: "obstruccion-interna-bomba",
      titulo: "Obstrucción interna en la bomba o la línea",
      componente: "Bomba / línea de impulsión",
      terminosManual: ["obstruccion", "atasco"],
      riesgoId: "esfuerzo-sin-resultado",
    }),
  ],

  "tension-fuera-con-motor": [
    causaTanque({
      id: "problema-en-el-suministro",
      titulo: "Problema en el suministro eléctrico",
      componente: "Acometida / suministro eléctrico",
      terminosManual: ["suministro", "acometida", "tension de linea"],
      riesgoId: "tension-fuera-con-motor",
    }),
    causaTanque({
      id: "protecciones-variador-mal-ajustadas",
      titulo: "Protecciones del variador mal ajustadas",
      componente: "Variador de frecuencia",
      terminosManual: ["protecciones", "variador", "ajuste"],
      riesgoId: "tension-fuera-con-motor",
    }),
  ],

  "agua-caliente": [
    causaTanque({
      id: "aporte-termico-externo",
      titulo: "Aporte térmico externo al tanque",
      componente: "Entorno / proceso aguas arriba",
      terminosManual: ["aporte termico", "calor", "temperatura ambiente"],
      riesgoId: "agua-caliente",
    }),
    causaTanque({
      id: "falta-renovacion-de-agua",
      titulo: "Falta de renovación de agua en el tanque",
      componente: "Circuito de llenado",
      terminosManual: ["renovacion", "recambio", "llenado"],
      riesgoId: "agua-caliente",
    }),
  ],

  /* ── Vibraciones ──────────────────────────────────────────────────── */

  "vibracion-en-alarma": causasVibracionAlta("vibracion-en-alarma"),
  "vibracion-en-aviso": causasVibracionAlta("vibracion-en-aviso"),

  "asimetria-entre-apoyos": [
    {
      id: "rodamiento-en-mal-estado",
      titulo: "Rodamiento en mal estado en ese apoyo",
      componente: "Rodamiento del apoyo señalado",
      terminosManual: ["rodamiento", "picado", "desgaste"],
      origen: "riesgosVibracion.js · consecuencia (asimetria-entre-apoyos)",
      // Convención de mantenimiento, no norma — ver la cabecera del archivo.
      provisional: true,
    },
    {
      id: "fijacion-floja-en-el-apoyo",
      titulo: "Fijación floja en ese apoyo",
      componente: "Pernos de fijación del apoyo señalado",
      terminosManual: ["fijacion", "apriete", "base floja"],
      origen: "riesgosVibracion.js · consecuencia (asimetria-entre-apoyos)",
      provisional: true,
    },
    {
      id: "desalineacion-localizada",
      titulo: "Desalineación del acoplamiento tirando de ese lado",
      componente: "Acoplamiento, lado del apoyo señalado",
      terminosManual: ["desalineacion", "acoplamiento"],
      origen: "riesgosVibracion.js · consecuencia (asimetria-entre-apoyos)",
      provisional: true,
    },
  ],
};

/**
 * Las causas candidatas de un riesgo, o `null` si no hay ninguna declarada.
 *
 * `null` y no `[]`: un array vacío se confunde con «se buscaron y no hay
 * ninguna», y aquí el caso real es «este riesgo no tiene causas transcritas
 * todavía» — la propia cabecera del archivo explica cuáles se dejaron fuera y
 * por qué. `diagnostico.mjs` decide qué decir con cada uno de los dos casos;
 * este archivo sólo distingue si el riesgo aparece en el mapa.
 */
export function causasDe(riesgoId) {
  return CAUSAS_POR_RIESGO[riesgoId] ?? null;
}
