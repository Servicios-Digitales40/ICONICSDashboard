/**
 * Vista «Inicio» — la landing de Demo EVA. Arranque de la app (`DEFAULT_ROUTE`)
 * y única pantalla Persuade de un tablero que en todo lo demás es Operate.
 *
 * ── CONTRATO DE DIRECCIÓN (shape → new-work, surface scope) ────────
 *
 * THESIS: una sola vitrina — la lectura en vivo es la prueba, no un adorno,
 *   y las cuatro vistas son entradas co-iguales, no un menú secundario.
 * OWN-WORLD: mismo DESIGN.md —mismo azul, misma tipografía— con estrategia
 *   de color Committed: el acento carga toda la sección hero, y la cifra
 *   rompe el techo de 16px que DESIGN.md reserva al texto de interfaz.
 * STORY: el prospecto llega, ve un número que cambia solo, entiende que es
 *   real, y elige por dónde entrar.
 * FIRST VIEWPORT: cifra en vivo + frase + CTA llenan la pantalla; la rejilla
 *   de 4 tarjetas asoma debajo como invitación a bajar.
 * FORM: Hero + rejilla debajo — de tres estructuras repartidas (editorial +
 *   franja, hero + rejilla, riel + vitrina) ordenadas por resonancia propia
 *   en posiciones 6/2/4, se confirmó la 2. seed 4bb7eb55.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with
 *   the finish review, the verdict, DESIGN.md, and every shipping raster
 *   carrying its provenance.
 *
 * ── RONDA 2 (Plan Moises3 UI/UX, punto 3) — EXTENSIÓN, NO REDISEÑO ──
 *
 * El contrato de arriba sigue en pie: Hero + rejilla, mismo DESIGN.md. Lo que
 * cambia es que el North Star del sistema —"el 3D y los números son la misma
 * verdad"— ahora se demuestra en la propia primera pantalla, con la misma
 * geometría que ya usan las otras vistas, en vez de quedarse en un gradiente
 * sin ninguna referencia al Gemelo Digital. Ronda 2a (1, 3, 6 de las 10
 * propuestas del plan) más Ronda 2b (2, 4, 5, 7, 8, 9 — este bloque):
 *
 *  - La Maqueta 3D real, en vivo, gira sola detrás del texto del hero
 *    (`MaquetaHero`) — mismos activos, mismo `SNIVEL_TANQUE`.
 *  - Cada tarjeta de la rejilla lleva un dato real de su vista, no un icono
 *    solo: un mini-tablero, no un segundo Canvas (propuesta 3 reinterpretada
 *    — ver `VISTAS[].dato` para por qué NO son 4 escenas 3D adicionales).
 *  - El badge "En vivo" ya existía (`UltimaLectura`, con su pulso de una sola
 *    vez por lectura fresca); aquí gana más presencia y un sparkline de
 *    fondo detrás de la cifra (propuestas 6 y 2 — ver `CifraEnVivo`).
 *  - `TrazoFlujo` y `ComoFunciona` traducen "partículas fluyendo" y "paquete
 *    viajando" (propuestas 5 y 7) a disparos de una sola vez, no a bucles:
 *    la única animación en bucle permitida en este sistema es la de una
 *    señal en alarma (`lib/motion.js`), y un flujo continuo la violaría
 *    igual que un heartbeat en `infinite` — ver la cabecera de cada uno.
 *  - CTA dual (propuesta 9): "Entrar a Planta" (operativo) + "Ver la
 *    Maqueta en vivo" (espectáculo), dos preguntas distintas.
 *  - `ComoFunciona` es la única sección que entra por scroll y no al
 *    montar (propuesta 4, `useEnVista()` en `lib/motion.js`) — el resto ya
 *    vive en o cerca del primer viewport, así que un reveal ahí sería el
 *    mismo `fadeInUp` disparado por otra API sin ganar nada.
 *
 * Paleta: sigue Restrained/Committed de DESIGN.md. La única ampliación es
 * `heroAgua` (themes.js) — un tono cian-verde de agua EXCLUSIVO de este
 * hero, no un semántico ni parte de `viz`, permitido expresamente por la
 * propuesta 8 ("paleta ampliada... sólo en esta sección Persuade, sin tocar
 * los tokens semánticos del resto"). El resto del gradiente sigue en
 * `accent`/`accentSoft`, los tokens de marca de siempre.
 */
import { ArrowRight, Boxes, Cog, Cpu, Factory, Gauge, LayoutDashboard, Monitor, Radio, Server, WifiOff } from "lucide-react";

import { Button, SectionLabel } from "@/components/ui/index.js";
import { useTheme } from "@/theme";

import { useSistemaAgua } from "../data/hooks.js";
import { useEnVista } from "@/lib/motion.js";
import { Cifra, MONO, SANS, Spark, UltimaLectura } from "../components/base.jsx";
import { estadoColor } from "../components/paleta.js";
import { fmtSenal } from "../lib/formato.js";
import MaquetaHero from "../three-d/components/MaquetaHero.jsx";

const REJILLA = `
.eva-inicio { display: flex; flex-direction: column; gap: 32px; }

.eva-inicio-hero {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  padding: 64px 40px 56px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* Desde 900px la maqueta tiene sitio de sobra a su izquierda (ver
   .eva-inicio-hero__maqueta, que arranca en el 34% del ancho): el bloque
   de texto se desplaza a esa mitad izquierda en vez de quedar centrado en
   la caja completa, que es lo que lo mandaría a solaparse con la escena 3D.
   Por debajo de 900px el hero vuelve a su centrado de siempre porque la
   maqueta ya se retiró (ver el @media de abajo) y no hay nada de qué
   apartarse. */
@media (min-width: 900px) {
  .eva-inicio-hero { align-items: flex-start; text-align: left; }
  .eva-inicio-hero__frase { margin-left: 0; margin-right: 0; }
  .eva-inicio-hero__badge { justify-content: flex-start; }
}

/* La maqueta gira detrás de TODO, incluidos los blobs: son dos capas del
   mismo fondo, no una encima de la otra compitiendo. Ocupa sólo el tercio
   derecho del hero —no el ancho completo— para que el texto tenga SIEMPRE
   una franja limpia a la izquierda, en cualquier ángulo de la rotación: un
   Canvas a ancho completo detrás de texto centrado competía con la cifra y
   la frase en cualquier fotograma. El mask-image lineal desvanece su propio
   borde izquierdo para que el corte contra el texto no se note como un
   rectángulo. Opacidad al 60%: sigue siendo la maqueta real, pero cede la
   jerarquía al texto — esta franja sigue siendo Persuade, no una demo del
   Canvas. En pantallas estrechas (ver @media abajo) se retira: no hay
   tercio derecho que darle sin que tape la única columna de texto. */
.eva-inicio-hero__maqueta {
  position: absolute;
  inset: 0 0 0 34%;
  z-index: 0;
  opacity: 0.6;
  mask-image: linear-gradient(90deg, transparent 0%, #000 30%);
  -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 30%);
}

.eva-inicio-hero__cifra-num { font-size: 104px; }
.eva-inicio-hero__badge { justify-content: center; }

/* El trazo de flujo vive por debajo del texto —z-index 0, igual que la
   maqueta— y ocupa el ancho del hero completo pero acotado a la mitad
   inferior, para no cruzar por encima de la cifra ni del badge. En el
   centrado de <900px se difumina más (ver @media) porque ahí comparte
   espacio con el texto centrado y no con una mitad libre. */
.eva-inicio-hero__flujo {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  width: 100%; height: 45%;
  z-index: 0;
  pointer-events: none;
}

/* El sparkline vive DETRÁS de la cifra, no al lado: es textura de fondo que
   dice "esto se mueve", no un segundo dato que compita por atención con el
   número. Centrado sobre la caja de la cifra y bajado un poco para que el
   trazo pase por la base de los dígitos en vez de cruzarles la mitad. */
.eva-inicio-hero__spark {
  position: absolute;
  left: 50%;
  top: 62%;
  transform: translate(-50%, -50%);
  opacity: 0.22;
  pointer-events: none;
  z-index: 0;
}

.eva-inicio-hero__frase {
  max-width: 480px;
  margin: 18px 0 26px;
  font-size: 14.5px;
  line-height: 1.6;
}

.eva-inicio-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 16px;
}

/* El botón flotante del Asistente (position: fixed, right/bottom: 24px,
   54px de alto — Asistente.jsx) ignora el flujo del documento: un padding
   al final de la rejilla no lo aparta si la página cabe entera en el
   viewport sin scroll, que es el caso normal aquí. La única forma de
   garantizar que ninguna tarjeta —Assets en escritorio, o la que caiga en
   esa esquina según reordene auto-fit en otros anchos— quede bajo el
   círculo es reservarle su hueco real en la propia tarjeta: padding extra
   a la derecha, sólo en la última columna de la fila final, del ancho de
   su huella (54px + margen). En pantallas de una sola columna no hay
   "última columna de la fila final" que distinguir — el bloque entero de
   abajo (last-child) lleva el margen en su lugar. */
.eva-inicio-grid > *:last-child {
  padding-right: calc(22px + 62px);
}
@media (max-width: 720px) {
  .eva-inicio-grid > *:last-child {
    padding-right: 22px;
    margin-bottom: 78px;
  }
}

/* border y sombra viven aquí, parametrizados por variables por instancia, y
   no en el estilo inline: un color inline nunca cede ante un :hover de hoja
   de estilos, así que el tinte de acento al pasar el cursor sólo puede
   ocurrir si la propiedad real la declara la hoja, no el componente. */
.eva-tarjeta-vista {
  border: 1px solid var(--tv-border);
  box-shadow: var(--tv-shadow);
  transition: border-color 0.2s ease, background 0.2s ease;
}
.eva-tarjeta-vista:hover {
  border-color: var(--color-accent);
}
/* Sin esto, tabular hasta las cuatro tarjetas no dejaba ningún indicador de
   foco visible (sólo llevaban :hover) — la navegación "cuatro formas de
   verlo" completa quedaba invisible por teclado. Mismo tratamiento que ya
   usa .app-btn (index.css) para los dos CTA del hero: anillo de acento,
   no sólo el borde del navegador. */
.eva-tarjeta-vista:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.eva-tarjeta-flecha { transition: transform 0.18s ease; }
.eva-tarjeta-vista:hover .eva-tarjeta-flecha { transform: translateX(3px); color: var(--color-accent); }

/* El mini-dato vive en su propia franja, separado de la frase por un borde
   de 1px: mismo patrón que ya usa EstadoSenales en Planta para separar
   "de qué habla la tarjeta" de "qué dice ahora mismo". */
.eva-tarjeta-dato {
  display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  margin-top: auto; padding-top: 12px; border-top: 1px solid var(--tv-border);
}

/* Pipeline "Cómo funciona": cinco nodos en fila con cuatro enlaces entre
   ellos, cada enlace flexible (crece con el espacio) para que el ancho lo
   reparta el propio contenedor y no una cuenta a mano de anchos fijos.

   Reveal por scroll: sin la clase --visible (que pone useEnVista()) los
   pasos quedan invisibles y desplazados, listos para el mismo fadeInUp que
   usa el resto de la vista al montar — aquí se dispara al entrar en
   viewport en vez de al montar el componente. */
.eva-inicio-pipeline { display: flex; align-items: center; margin-top: 20px; }
/* min-width: 0 aquí, no sólo en .eva-inicio-pipeline__nodo más abajo: un
   flex item que además ES flex container (.paso lo es) hereda su propio
   min-width: auto por defecto, que se resuelve contra el min-content de SU
   hijo — el .nodo — sin importar que el .nodo ya sepa encogerse. Sin este
   min-width: 0 el .paso se negaba a bajar de ese suelo y el navegador lo
   dejaba desbordar la fila entera en vez de encogerlo, con el mismo
   resultado de antes (un nodo empujado fuera del overflow-x: clip del
   Shell) pero ahora en CUALQUIER paso, no sólo en el último. Cada nivel de
   una cadena flex anidada necesita su propio min-width: 0; el de un nivel
   no se hereda al de abajo. */
.eva-inicio-pipeline__paso {
  display: flex; align-items: center; flex: 1 1 0; min-width: 0;
  opacity: 0; transform: translateY(14px);
}
.eva-inicio-pipeline--visible .eva-inicio-pipeline__paso {
  animation: fadeInUp 0.5s ease both;
}
/* Antes el último paso llevaba flex: 0 0 auto porque, sin enlace de salida,
   "no tenía por qué encogerse". Con tres nodos daba igual: siempre sobraba
   ancho. Con cinco, ese mismo flex-shrink: 0 implícito es la causa de un
   bug real, más grave que un simple solape: el <main> del Shell recorta con
   overflow-x: clip, así que un último paso que no puede encogerse termina
   empujado fuera del viewport —invisible, no sólo tapado— entre 1000px y
   1280px (confirmado en pantalla: "Este tablero" desaparecía del todo).
   Encogiendo igual que sus hermanos (mismo flex: 1 1 0 de arriba, sin
   excepción) el nodo vuelve a caber siempre; min-width: 0 en .nodo ya se
   encarga de que el contenido ceda envolviendo texto en vez de desbordar. */
/* flex-shrink: 0 funcionaba con tres nodos porque siempre sobraba ancho:
   cada .paso tenía sitio de sobra para el contenido intrínseco del nodo.
   Con cinco nodos en la misma fila el .paso (que sí se encoge, flex: 1 1 0
   arriba) puede terminar más angosto que el ancho natural del nodo — icono
   + título + detalle en una línea— y un nodo que no puede encogerse se
   desborda sobre el siguiente en vez de respetar su slot. Ahora el nodo
   encoge con su .paso, y es el texto (min-width: 0 más abajo) el que cede
   envolviendo a dos líneas en vez de la tarjeta entera invadiendo a la de al
   lado. */
.eva-inicio-pipeline__nodo {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px; border-radius: 14px; min-width: 0;
}
/* min-width: 0 es lo que deja al bloque de texto ceder por debajo de su
   ancho de contenido —el comportamiento por defecto de un hijo flex— en
   vez de empujar al nodo entero contra su vecino. Pero sin un PISO ese
   "puede encogerse" no tiene límite: con cinco nodos en la misma fila el
   texto llegó a comprimirse a 1-2 caracteres por línea ("sensore/s",
   "AssetW/orX"), técnicamente sin desbordar pero ilegible — el mismo tipo
   de sobre-corrección que ya rompió el ancho del nodo en rondas
   anteriores, aquí a nivel de texto. 92px es el mínimo que sigue
   mostrando 2-3 palabras españolas cortas por línea a 11.5px sin obligar
   a una sola letra por renglón; por debajo de eso el texto para de ceder
   y es el propio nodo/paso (que sí puede seguir encogiendo) el que absorbe
   el resto de la compresión. */
.eva-inicio-pipeline__nodo > div:last-child { min-width: 92px; flex: 1 1 auto; }
/* overflow-wrap: break-word ya es "última instancia" por spec —sólo rompe
   una palabra si no cabe entera en un renglón—, pero "ac:TDCON/DEMO/
   SENSORES/" (el detalle de Sensores) es una cadena sin espacios de 23
   caracteres: incluso con el piso de 92px de arriba, esa cadena en
   particular nunca cabe entera y break-word la corte letra a letra, sin
   mejor alternativa. hyphens: auto además guionaliza las palabras
   españolas normales en un punto silábico cuando SÍ hace falta romperlas,
   en vez de a la mitad arbitraria. */
.eva-inicio-pipeline__nodo p { overflow-wrap: break-word; hyphens: auto; }
.eva-inicio-pipeline__enlace { flex: 1 1 40px; min-width: 24px; margin: 0 4px; }

/* El paquete recorre el enlace en transform, no en cx: cx no se anima con
   fluidez homogénea entre navegadores para SVG, transform sí. Un solo
   recorrido por lectura fresca, sin infinite — ver la cabecera de
   ComoFunciona para por qué. */
@keyframes paqueteViaja {
  from { transform: translateX(0); opacity: 0; }
  15% { opacity: 1; }
  85% { opacity: 1; }
  to { transform: translateX(100px); opacity: 0; }
}
.eva-inicio-pipeline__paquete {
  animation: paqueteViaja 1.1s cubic-bezier(0.4, 0, 0.2, 1) both;
}

/* Con tres nodos la fila cabía apretando el texto hasta 720px (mismo umbral
   que Planta). Con cinco, cinco chasises de icono+padding más cuatro
   enlaces empiezan a apretar el texto mucho antes — 1040px es donde el
   título más largo ("Servidor de la demo") y su detalle en dos líneas
   dejan de tener aire cómodo en escritorio real, no un punto arbitrario.
   Reducir el padding y el gap del nodo, y acortar el enlace, gana margen
   antes de tener que colapsar del todo. */
@media (max-width: 1040px) {
  .eva-inicio-pipeline__nodo { padding: 12px 12px; gap: 9px; }
  .eva-inicio-pipeline__enlace { flex-basis: 20px; min-width: 14px; margin: 0 2px; }
}

/* Mismo botón flotante del Asistente que ya cubre la Regla del Hueco
   Reservado en .eva-inicio-grid (ver ese comentario más arriba) — TRES
   intentos de reservarle hueco al último nodo aquí mismo fallaron, cada
   uno por una razón distinta:
     1) padding-right fijo en .nodo, siempre activo: competía con el texto
        en cualquier ancho donde el slot ya fuera angosto.
     2) el mismo padding, sólo por encima de 1040px: el colapso simplemente
        se desplazó a 1041-1300px, la frontera nueva del breakpoint.
     3) margin-right en el .paso exterior en vez de padding en el .nodo:
        parecía correcto (reduce el slot ANTES del reparto), pero los cinco
        .paso comparten flex: 1 1 0 — un margen en un hermano no le resta
        SÓLO a su propio slot, reduce el POOL de espacio libre que el
        algoritmo de flex reparte por igual entre los cinco. El hueco
        terminó pagado a medias por los otros cuatro nodos, que ya tenían
        menos margen que el último (compiten también con los enlaces) y
        colapsaron peor que el bug original.

   La lección real: en una fila de cinco slots ya ajustados, CUALQUIER
   reserva geométrica fija para el botón compite con algo que necesita ese
   mismo pixel — no hay combinación de padding/margin/breakpoint que lo
   resuelva sin sacrificar otro nodo. La rejilla de 4 tarjetas de arriba
   puede permitirse el hueco porque ahí sí sobra ancho de sobra en todo su
   rango soportado; este pipeline, con cinco nodos en la misma fila, no.
   Se renuncia a la reserva geométrica: por debajo de ~1400px la fila ya
   está lo bastante ocupada como para que el botón —pequeño, 54px, esquina
   inferior— tenga poca superficie de la sección bajo la que caer, y toda
   la sección ya vive dentro de .eva-page-shell con el padding inferior
   de 50/36px que cada vista comparte; un roce ocasional con el borde del
   botón en el ancho más apretado es un costo menor que perder el título
   por completo, que es lo que las tres reservas anteriores causaban. */

@media (max-width: 720px) {
  .eva-inicio-pipeline { flex-direction: column; align-items: stretch; gap: 10px; }
  .eva-inicio-pipeline__paso { flex-direction: column; align-items: stretch; }
  .eva-inicio-pipeline__enlace { display: none; }
  /* Sin margen extra aquí: el padding-bottom de la <section> (ComoFunciona,
     InicioEva.jsx) ya reserva el hueco del botón en TODOS los anchos, este
     incluido — duplicarlo en el último .paso sólo alejaría "Este tablero"
     del botón el doble de lo necesario. */
}

/* Por debajo de 900px el hero vuelve a estar centrado (ver el @media de
   arriba) y ya no hay mitad izquierda que reservarle al texto, así que la
   maqueta de fondo se retira entera: mostrarla centrada detrás de un texto
   también centrado es exactamente el solape que el layout de escritorio
   evita. Por debajo de 560px además el número deja de caber en una línea
   junto al denominador y se recorta, para que la primera pantalla siga sin
   scroll. */
@media (max-width: 899px) {
  .eva-inicio-hero__maqueta { display: none; }
  .eva-inicio-hero__flujo { opacity: 0.5; }
}
@media (max-width: 560px) {
  .eva-inicio-hero { padding: 44px 22px 36px; }
  .eva-inicio-hero__cifra-num { font-size: 60px; }
}
`;

/**
 * `dato(sistema)` — el número que respalda cada tarjeta con la vista que
 * promete, no un icono solo. Cada uno es LITERALMENTE lo que esa vista
 * enseña primero, no una señal cualquiera del catálogo elegida por rellenar:
 *
 *   Planta      → el reparto de estados que abre esa vista (franja de
 *                 atención / estado de señales).
 *   Máquina 3D  → la carga del motor, la señal cuyo giro anima ese modelo.
 *   Maqueta 3D  → el nivel del tanque — la misma cifra que ya se ve detrás,
 *                 en la maqueta que gira en el fondo del hero.
 *   Assets      → cuántas de las ocho señales tienen lectura ahora mismo,
 *                 que es la pregunta que esa vista responde en crudo.
 *
 * Devuelve `null` mientras no hay lectura: sin dato no se rellena con un
 * placeholder, la franja simplemente no aparece (mismo criterio que
 * `FranjaAtencion` en Planta).
 */
const VISTAS = [
  {
    id: "eva-planta",
    label: "Planta",
    frase: "El estado de las ocho señales, con su histórico.",
    Icono: LayoutDashboard,
    dato: (sistema) => {
      const { fueraDeLimite, enAviso, enBanda } = sistema.resumen;
      if (!sistema.resumen.medidas) return null;
      if (fueraDeLimite > 0) return { texto: `${fueraDeLimite} fuera de límite`, estado: "critico" };
      if (enAviso > 0) return { texto: `${enAviso} en aviso`, estado: "atencion" };
      return { texto: `${enBanda} en banda`, estado: "nominal" };
    },
  },
  {
    id: "eva-maquina-3d",
    label: "Máquina 3D",
    frase: "El grupo de bombeo se comporta según el estado derivado de sus señales.",
    Icono: Cog,
    dato: (sistema) => {
      const s = sistema.senales.cargaMotor;
      if (!s || s.estado === "sin_dato") return null;
      return { texto: `Carga motor ${fmtSenal(s)}`, estado: s.estado };
    },
  },
  {
    id: "eva-maqueta",
    label: "Maqueta 3D",
    frase: "La instalación en miniatura — el nivel del tanque es el dato en vivo.",
    Icono: Factory,
    dato: (sistema) => {
      const s = sistema.senales.nivelTanque;
      if (!s || s.estado === "sin_dato") return null;
      return { texto: `Nivel ${fmtSenal(s)}`, estado: s.estado };
    },
  },
  {
    id: "eva-assets",
    label: "Assets",
    frase: "Los ocho puntos de la demo, con su valor y su calidad en crudo.",
    Icono: Boxes,
    dato: (sistema) => {
      const { medidas, totalSenales } = sistema.resumen;
      if (!medidas) return null;
      return { texto: `${medidas} / ${totalSenales} con lectura`, estado: medidas === totalSenales ? "nominal" : "atencion" };
    },
  },
];

/**
 * La cifra del hero. Tres estados, nunca un cero de mentira: leyendo (guion
 * discreto), error (frase honesta, sin alarmar) o la cuenta real.
 *
 * ── EL SPARKLINE DE FONDO NO ES LA SERIE DE LA CIFRA ───────────────
 *
 * "8/8" es un conteo de calidad —cuántas señales tienen lectura AHORA— y no
 * tiene historia propia: no hubo un "7/8" hace un minuto que valga la pena
 * dibujar como tendencia. El trazo que va detrás es la serie del NIVEL DEL
 * TANQUE (`series.nivelTanque`, el búfer de sesión que ya trae
 * `useSistemaAgua()`), la misma magnitud que ya nombra la frase del hero y
 * que gira en la maqueta de fondo — así el sparkline sigue siendo dato real
 * y no un adorno abstracto, sin fingir que es la serie de "8/8" que no
 * existe. `serie.length < 2` lo cubre `Spark` solo: sin dos puntos no dibuja
 * nada, así que en el primer segundo de sesión la cifra se ve exactamente
 * igual que antes.
 */
function CifraEnVivo({ sistema, loading, error, t, serieNivel }) {
  const { medidas, totalSenales } = sistema.resumen;
  const listo = !loading || medidas > 0;

  if (error) {
    // Coral porque esto ES el caso que DESIGN.md reserva para ese color —
    // "error de lectura" — y no un gris neutro que subestime lo que pasó.
    // Sin latido: `alertaLatido` (index.css) es el vocabulario que `tiles.jsx`
    // reserva para una SEÑAL fuera de banda; prestárselo a un corte de red
    // confundiría dos alarmas de gravedad distinta. La reafirmación es una
    // frase, no un bucle — el motor de sondeo ya reintenta solo cada pocos
    // segundos (`evaSource.js`), así que decirlo es honesto y no un adorno.
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "18px 0" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 600, color: t.coral }}>
          <WifiOff size={17} />
          Sin conexión con el servidor por ahora
        </span>
        <span style={{ fontSize: 12, color: t.textFaint }}>
          Vuelve a intentarlo solo, cada pocos segundos
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, position: "relative" }}>
      {listo && serieNivel?.length >= 2 && (
        <div
          className="eva-inicio-hero__spark"
          aria-hidden="true"
          title="Nivel del tanque, últimos minutos — la cifra en sí no tiene serie propia"
        >
          <Spark serie={serieNivel} color={t.accent} t={t} w={200} h={64} />
        </div>
      )}

      <span className="eva-inicio-hero__cifra-num" style={{ display: "inline-flex" }}>
        {listo ? (
          <Cifra
            valor={medidas}
            fmt={(v) => Math.round(v)}
            duracion={1200}
            style={{ fontFamily: SANS, fontWeight: 800, lineHeight: 1, letterSpacing: -2, color: t.accent }}
          />
        ) : (
          <span style={{ fontFamily: SANS, fontWeight: 800, color: t.textFaint, opacity: 0.5 }}>···</span>
        )}
      </span>
      <span style={{ fontSize: 28, fontWeight: 700, color: t.textFaint }}>/ {totalSenales}</span>
    </div>
  );
}

/**
 * El trazo tanque→bomba→válvula como elemento gráfico de fondo del hero.
 *
 * ── POR QUÉ NO LLEVA PARTÍCULAS EN MOVIMIENTO ──────────────────────
 *
 * La propuesta original pedía partículas fluyendo en bucle mientras hay
 * caudal. `lib/motion.js` reserva la ÚNICA animación en bucle del sistema
 * para una señal en alarma — "si parpadean varias cosas a la vez, el ojo
 * aprende a ignorarlas todas, incluida la que importa" — y un flujo continuo
 * de partículas sería un segundo bucle compitiendo con ese vocabulario.
 * Confirmado con el usuario: en vez de partículas, el trazo se dibuja UNA
 * vez al entrar (`.trazo-dibujo`, el mismo keyframe que ya usa `Spark`) y lo
 * que cambia con el caudal es el color y el brillo del trazo ya dibujado —
 * mismo criterio binario que `Tuberias.jsx` en la maqueta 3D: verde con
 * caudal medido, apagado sin él.
 *
 * `hayCaudal = !sistema.enReposo` y no un umbral sobre el valor crudo,
 * porque el flujo residual en reposo (~0.12) no es cero limpio — mismo
 * criterio que ya usan `Tuberias`/`MaquetaEva3D` para esta misma pregunta.
 */
function TrazoFlujo({ hayCaudal, t }) {
  const color = hayCaudal ? t.success : t.textFaint;

  return (
    <svg
      className="eva-inicio-hero__flujo"
      viewBox="0 0 420 140"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Tanque (izquierda) → Bombeo (centro) → Válvula/Distribución (derecha),
          la misma topología que RecorridoSistema en Planta, simplificada a un
          único trazo porque aquí es textura, no un diagrama a interpretar. */}
      <path
        className="trazo-dibujo"
        pathLength={100}
        d="M 20 40 C 90 40, 90 100, 160 100 S 230 40, 300 40 S 370 100, 400 100"
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        opacity={hayCaudal ? 0.5 : 0.28}
      />
      {[20, 160, 300].map((cx, i) => (
        <circle
          key={cx}
          cx={cx}
          cy={i % 2 === 0 ? 40 : 100}
          r={4}
          fill={color}
          opacity={hayCaudal ? 0.7 : 0.35}
          style={{ animation: `fadeIn 300ms ease ${0.9 + i * 0.15}s both` }}
        />
      ))}
    </svg>
  );
}

function TarjetaVista({ vista, sistema, dark, onNavigate, t, delay }) {
  const { Icono } = vista;
  const dato = vista.dato(sistema);
  return (
    <button
      type="button"
      onClick={() => onNavigate?.(vista.id)}
      className="panel-card eva-tarjeta-vista"
      style={{
        textAlign: "left", cursor: "pointer",
        background: t.panel, borderRadius: 16, padding: "22px 22px 24px",
        // border y box-shadow: ver la regla `.eva-tarjeta-vista` en REJILLA.
        // Un color puesto aquí, inline, nunca cedería ante el :hover de la
        // hoja de estilos — por eso viajan como variables, no como propiedad.
        "--tv-border": t.border, "--tv-shadow": t.shadow, "--shadow-hover": t.shadowHover,
        animation: "fadeInUp 0.5s ease both", animationDelay: `${delay}s`,
        display: "flex", flexDirection: "column", gap: 14, width: "100%",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 46, height: 46, borderRadius: 9, background: t.gradAccent, color: "#FFFFFF",
            boxShadow: `0 4px 14px ${t.accent}4D`, flexShrink: 0,
          }}
        >
          <Icono size={20} />
        </span>
        {/* Sin `color` por prop: así el trazo queda en `currentColor` y hereda
            del `color` del wrapper, que sí puede perder ante el :hover de la
            hoja de estilos (la herencia cede ante cualquier regla explícita,
            a diferencia de un valor puesto inline en el propio elemento). */}
        <span className="eva-tarjeta-flecha" style={{ display: "inline-flex", color: t.textFaint }}>
          <ArrowRight size={16} />
        </span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: t.text, fontFamily: SANS }}>{vista.label}</div>
      <p style={{ margin: 0, fontSize: 12.5, color: t.textSoft, lineHeight: 1.5 }}>{vista.frase}</p>

      {dato && (
        <div className="eva-tarjeta-dato">
          <span style={{ fontSize: 11.5, color: t.textFaint }}>Ahora mismo</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: t.text, fontFamily: MONO }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: estadoColor(dark, dato.estado) }} />
            {dato.texto}
          </span>
        </div>
      )}
    </button>
  );
}

/**
 * "Cómo funciona" — el pipeline real en cinco nodos, no un diagrama genérico
 * de arquitectura. Nombra la cadena completa desde el origen físico: el
 * sensor mide, el PLC lo lee y lo expone, ICONICS (AssetWorX + Hyper
 * Historian) lo históriza, el backend de la demo lo sirve por API, y este
 * tablero lo pinta. Nada inventado — es la misma cadena que explica por qué
 * "el dato es real" en vez de sólo afirmarlo.
 *
 * Los dos primeros nodos (Sensores, PLC) son la extensión que faltaba: hasta
 * ahora el pipeline empezaba en ICONICS, que es donde arranca el software de
 * este tablero, pero el prospecto veía "un servidor lee un servidor" sin que
 * quedara claro que detrás hay una magnitud física de verdad, medida por un
 * instrumento de verdad, antes de que cualquier software la toque. Sensores
 * y PLC no llevan marca ni modelo: la instalación de la demo no tiene un PLC
 * propio que nombrar (a diferencia de ICONICS, que sí es el producto real
 * instalado), así que el detalle describe el ROL genérico de la etapa —igual
 * de cierto para cualquier instalación de agua industrial— en vez de
 * inventar un fabricante que no está ahí.
 *
 * ── EL "PAQUETE VIAJANDO" ES UN DISPARO, NO UN BUCLE ───────────────
 *
 * La propuesta original imaginaba una animación continua de un paquete de
 * dato recorriendo los nodos. Con el mismo límite que ya aplicó
 * `TrazoFlujo`: un bucle nuevo compite con el vocabulario que
 * `lib/motion.js` reserva para las alarmas. Aquí el disparo es literal en
 * vez de decorativo — el punto viaja UNA vez cada vez que `lastUpdated`
 * cambia, que es cuando de verdad llegó un paquete nuevo del servidor. Mismo
 * mecanismo que `UltimaLectura`: `key={lastUpdated.getTime()}` remonta el
 * elemento y su animación CSS (sin `infinite`) arranca de cero. Con dos
 * nodos más el punto ahora recorre CUATRO enlaces en vez de dos — mismo
 * `flex: 1 1 40px` por enlace (ver `.eva-inicio-pipeline__enlace` en
 * REJILLA), así que la fila sigue repartiendo el ancho sola.
 */
const NODOS_PIPELINE = [
  { id: "sensores", Icono: Gauge, titulo: "Sensores", detalle: "Los ocho puntos físicos de ac:TDCON/​DEMO/​SENSORES/" },
  { id: "plc", Icono: Cpu, titulo: "PLC", detalle: "Lee los sensores y expone sus valores por OPC" },
  { id: "iconics", Icono: Server, titulo: "ICONICS", detalle: "AssetWorX + Hyper Historian, en la instalación real" },
  { id: "backend", Icono: Radio, titulo: "Servidor de la demo", detalle: "Lee ICONICS y sirve los ocho puntos por API" },
  { id: "tablero", Icono: Monitor, titulo: "Este tablero", detalle: "Pinta lo que el servidor acaba de leer, nada más" },
];

/**
 * ── LA ÚNICA SECCIÓN QUE ENTRA POR SCROLL, NO AL MONTAR ────────────
 *
 * El resto del hero y la rejilla de 4 tarjetas ya están en o cerca del
 * primer viewport: revelarlos "al hacer scroll" sería el mismo `fadeInUp`
 * que ya tienen, disparado un instante después por una API distinta, sin
 * ganar nada. `ComoFunciona` es la única sección que de verdad vive fuera
 * de la primera pantalla, así que es la candidata real a `useEnVista()` —
 * el reveal se gana su sitio aquí en vez de aplicarse por todas partes
 * porque la propuesta lo pedía en genérico.
 */
function ComoFunciona({ t, lastUpdated }) {
  const [ref, visible] = useEnVista();

  return (
    // `ComoFunciona` es la última sección de la vista: el hueco del botón
    // flotante del Asistente se resuelve en VERTICAL, no en horizontal —
    // tres intentos de reservarle ancho a la última tarjeta de la fila
    // (padding-right en el nodo, luego sólo sobre 1040px, luego margin-right
    // en el slot) rompieron el título de algún otro nodo cada vez, porque
    // cualquier reserva de ANCHO en una fila de cinco slots ya ajustados
    // compite con el propio texto (ver el comentario en REJILLA junto a
    // `.eva-inicio-pipeline__paso:last-child`). Un padding-bottom en la
    // sección entera no compite con nada del layout horizontal: sólo aleja
    // TODA la fila del borde inferior donde vive el botón, igual que
    // `.eva-page-shell` ya hace globalmente para cada vista.
    <section ref={ref} style={{ paddingBottom: 70 }}>
      <SectionLabel sub="El camino que hace cada número antes de llegar a esta pantalla">
        Cómo funciona
      </SectionLabel>

      <div className={`eva-inicio-pipeline${visible ? " eva-inicio-pipeline--visible" : ""}`}>
        {NODOS_PIPELINE.map((nodo, i) => (
          <div key={nodo.id} className="eva-inicio-pipeline__paso" style={{ animationDelay: visible ? `${0.1 + i * 0.08}s` : "0s" }}>
            <div className="eva-inicio-pipeline__nodo" style={{ background: t.panel, border: `1px solid ${t.border}`, boxShadow: t.shadow }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: 9, background: t.gradAccent, color: "#FFFFFF", flexShrink: 0 }}>
                <nodo.Icono size={19} />
              </span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.text, fontFamily: SANS }}>{nodo.titulo}</div>
                <p style={{ margin: "3px 0 0", fontSize: 11.5, color: t.textSoft, lineHeight: 1.45 }}>{nodo.detalle}</p>
              </div>
            </div>

            {i < NODOS_PIPELINE.length - 1 && (
              <div className="eva-inicio-pipeline__enlace" aria-hidden="true">
                <svg width="100%" height="16" viewBox="0 0 100 16" preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
                  <line x1="0" y1="8" x2="100" y2="8" stroke={t.border} strokeWidth="2" />
                  {lastUpdated && (
                    <circle key={lastUpdated.getTime()} cx="0" cy="8" r="3.5" fill={t.accent} className="eva-inicio-pipeline__paquete" />
                  )}
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function InicioEva({ onNavigate }) {
  const { theme: t, dark } = useTheme();
  const { sistema, loading, error, lastUpdated, series } = useSistemaAgua();
  // Mismo criterio que dentro de `CifraEnVivo`: sin la primera lectura, "ahora
  // mismo" hablaría de un conteo que todavía no llegó. La espera se convierte
  // en un dato ("qué está pasando") en vez de quedar en un silencio junto a
  // los puntos suspensivos — la única red que puede tardar de verdad es la
  // real, y `VITE_ICONICS_CHAOS` existe justo para poder ensayar este momento.
  const listo = !loading || sistema.resumen.medidas > 0;

  return (
    <>
      <style>{REJILLA}</style>

      <div className="eva-inicio">
        <section
          className="eva-inicio-hero"
          style={{
            // Tres paradas en vez de dos: la parada intermedia usa heroAgua
            // (themes.js), el tono cian-verde de agua exclusivo de este
            // hero — "profundidad de agua" de la propuesta 8 del plan — sin
            // tocar los tokens semánticos del resto del sistema (Regla de
            // las Dos Paletas, DESIGN.md). NOTA: hasta esta revisión aquí
            // había un `t.accentGradientEnd` que no existe como token —
            // el navegador lo descartaba en silencio y el gradiente
            // quedaba de dos paradas efectivas sin que ningún build fallara.
            background: `radial-gradient(120% 100% at 50% 0%, ${t.accentSoft} 0%, ${t.heroAgua}26 42%, ${t.page} 78%)`,
            border: `1px solid ${t.border}`,
          }}
        >
          <div className="eva-inicio-hero__maqueta">
            <MaquetaHero sistema={sistema} />
          </div>

          <div className="blob" style={{ width: 340, height: 340, background: t.blob1, top: -160, left: -80 }} />
          <div className="blob" style={{ width: 280, height: 280, background: t.blob2, bottom: -140, right: -60, animationDelay: "-6s" }} />

          <TrazoFlujo hayCaudal={!sistema.enReposo} t={t} />

          <div style={{ position: "relative", zIndex: 1 }}>
            {!error && (
              <div className="eva-inicio-hero__badge" style={{ display: "flex", marginBottom: 18 }}>
                <UltimaLectura fecha={lastUpdated} t={t} grande />
              </div>
            )}

            <CifraEnVivo sistema={sistema} loading={loading} error={error} t={t} serieNivel={series.nivelTanque} />
            {!error && (
              <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.3, color: t.textSoft, marginTop: 8 }}>
                {listo ? "señales con lectura, ahora mismo" : "conectando con el servidor ICONICS…"}
              </div>
            )}

            <p className="eva-inicio-hero__frase" style={{ color: t.textSoft }}>
              El dato es real: cada número de este tablero viene de una lectura contra un
              servidor ICONICS de verdad, con su calidad y su marca de tiempo. La maqueta
              de fondo es la misma instalación, con el mismo nivel de tanque en vivo.
            </p>

            {/* CTA dual: el primario es el camino operativo —quien va a usar el
                tablero de verdad—, y el ghost es el camino espectáculo —quien
                quiere ver la maqueta que acaba de asomar detrás del texto—.
                Dos preguntas distintas, así que se resuelven con dos botones y
                no con uno solo que tenga que servir a los dos visitantes. */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Button variant="primary" icon={<ArrowRight size={15} />} onClick={() => onNavigate?.("eva-planta")}>
                Entrar a Planta
              </Button>
              <Button variant="ghost" icon={<Factory size={15} />} onClick={() => onNavigate?.("eva-maqueta")}>
                Ver la Maqueta en vivo
              </Button>
            </div>
          </div>
        </section>

        <SectionLabel sub="La misma instalación, cuatro lentes distintas">
          Cuatro formas de verlo
        </SectionLabel>

        <div className="eva-inicio-grid">
          {VISTAS.map((vista, i) => (
            <TarjetaVista
              key={vista.id} vista={vista} sistema={sistema} dark={dark}
              onNavigate={onNavigate} t={t} delay={0.15 + i * 0.06}
            />
          ))}
        </div>

        <ComoFunciona t={t} lastUpdated={lastUpdated} />
      </div>
    </>
  );
}

export default InicioEva;
