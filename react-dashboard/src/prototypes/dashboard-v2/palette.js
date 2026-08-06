/**
 * prototypes/dashboard-v2/palette.js
 * ------------------------------------------------------------------
 * Paleta de ESTADO de la v2 — y la corrección de dos colisiones de color
 * que existen HOY en el dashboard de producción.
 *
 * La vista actual resuelve el color de estado con `ESTADO_TOKEN` de
 * `@/lib/machines.js`, que apunta a tokens de INTERFAZ. Eso arrastra dos
 * problemas medidos (no estimados a ojo — validador de la skill `dataviz`,
 * `scripts/validate_palette.js`, OKLab ΔE ×100):
 *
 *   1. «Limpieza» (violet #7C4FE0) vs «Mant. Preventivo» (accent #3654E0)
 *      → ΔE 0.9 con protanopía y 9.9 con visión normal. Por debajo de 15 en
 *        visión normal significa que NADIE los distingue, no solo un daltónico.
 *        Son las dos rebanadas contiguas de la dona de estados.
 *
 *   2. «Receso» apunta a `textSoft`, un token de TEXTO usado como color de
 *      dato. Es exactamente lo que advierte el comentario de `theme/themes.js`:
 *      «usar un token de TEXTO como color de dato es lo que hace que un
 *      diagrama se vea muerto».
 *
 * Corrección: Limpieza pasa a un cian que sí separa, Receso estrena un gris
 * cálido propio de DATOS, y el ámbar de «Correctivo» se re-escalona porque
 * chocaba con el coral de «Emergencia», su vecino en la barra apilada.
 *
 * Resultado del validador, en el orden real de la barra (ESTADOS_ORDEN) y
 * contra la superficie real de panel de cada modo:
 *
 *   claro  (#FFFFFF)  CVD PASS (peor par ΔE 8.6) · visión normal PASS (15.3)
 *   oscuro (#151B27)  CVD PASS (peor par ΔE 12.7) · visión normal PASS (15.6)
 *
 * Dos avisos se dejan CONSCIENTEMENTE, y conviene que quede escrito:
 *
 *   · «Chroma floor» falla en el gris de Receso. Es intencionado: Receso
 *     significa "no está pasando nada", el mismo papel que el punto neutro de
 *     una paleta divergente. Un gris que no es gris no comunicaría eso.
 *   · «Lightness band» falla en modo oscuro. Es el compromiso que
 *     `theme/themes.js` ya documenta y acepta para toda la app: pasteles por
 *     encima de la banda recomendada a cambio del acabado. No se relitiga aquí.
 *
 * En ambos casos el color NUNCA va solo: todo estado se pinta con punto de
 * color + etiqueta de texto, así que la identidad no depende del tono.
 */

/**
 * Estado → color de DATO, por modo. Validado; ver cabecera antes de tocar.
 *
 * Rekeyada al VOCABULARIO DEL DOMINIO (lib/domain/estado.js) durante la
 * migración a ICONICS. Cada clave canónica hereda el hex del estado viejo
 * que ocupaba su mismo papel semántico, así que la validación de la
 * cabecera sigue aplicando:
 *
 *   alarma   ← «Paro de Emergencia»          (coral, crítico)
 *   commfail ← «Mantenimiento Correctivo»    (ámbar, exige atención)
 *   setup    ← «Mantenimiento Preventivo»    (azul, intervención)
 *   standby  ← «Receso»                      (gris cálido de DATOS)
 *   running  ← «Operando»                    (verde)
 *
 * `unknown` es nuevo —no existía en el modelo anterior— y NO pasó por el
 * validador: es un gris más apagado que el de stand-by, porque significa
 * ausencia de dato y no un estado de la máquina. El riesgo de confundirlo
 * con su vecino es bajo porque el color nunca va solo (punto + etiqueta),
 * pero si esta paleta se promueve a producción hay que validarlo.
 */
const ESTADO_VIZ = {
  light: {
    alarma: "#D9573F",
    commfail: "#C29A12",
    setup: "#3654E0",
    standby: "#A39E96",
    running: "#1B9169",
    unknown: "#C6CBD6",
  },
  dark: {
    alarma: "#E37A63",
    commfail: "#E8C05A",
    setup: "#5C82F5",
    standby: "#7E8AA3",
    running: "#3ED9A5",
    unknown: "#4A5468",
  },
};

/** Color de dato de un estado, para el modo activo. Desconocido → sin dato. */
export const estadoColor = (dark, estado) =>
  ESTADO_VIZ[dark ? "dark" : "light"][estado] ?? ESTADO_VIZ[dark ? "dark" : "light"].unknown;

/**
 * Etiqueta corta de cada estado. La rejilla de máquinas tiene celdas de
 * ~140 px: «Sin comunicación» no cabe, y un texto recortado es peor que
 * uno abreviado. La forma larga vive en `estadoLabel` del dominio y en el
 * tooltip nativo.
 */
export const ESTADO_CORTO = {
  alarma: "Alarma",
  commfail: "Sin com.",
  setup: "Set-Up",
  standby: "Stand By",
  running: "Operando",
  unknown: "Sin dato",
};

/**
 * Fondo suave semántico, POR TEMA.
 *
 * Sustituye a los tintes hex-alfa del dashboard actual (`${color}12`,
 * `${color}44`, `${color}14`): un 7 % de coral sobre el panel oscuro #151B27
 * es invisible, así que en modo oscuro la celda de alerta hoy no se distingue
 * de una normal. Los tokens `*Soft` ya están afinados por tema y sí funcionan
 * en los dos.
 */
export const TONO = {
  critico: (t) => ({ fondo: t.coralSoft, borde: t.coral, texto: t.coral }),
  aviso: (t) => ({ fondo: t.amberSoft, borde: t.amber, texto: t.amber }),
  ok: (t) => ({ fondo: t.successSoft, borde: t.success, texto: t.success }),
  info: (t) => ({ fondo: t.accentSoft, borde: t.accent, texto: t.accent }),
};
