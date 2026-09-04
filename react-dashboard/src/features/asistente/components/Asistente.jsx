/**
 * El asistente: un botón flotante y el panel de conversación.
 *
 * ── QUÉ MANDA EN ESTE DISEÑO ───────────────────────────────────────
 *
 * Que una respuesta tarda entre 30 y 90 segundos. De ahí sale casi todo lo
 * que aquí parece decoración y no lo es:
 *
 *  - El estado se dice con PALABRAS («Consultando ICONICS…»), no con una
 *    barra indeterminada, y con los segundos que lleva. Una barra girando un
 *    minuto no informa de nada; el nombre del paso además delata dónde se
 *    atascó cuando algo falla, y el contador dice si esto va como siempre.
 *  - Siempre se puede cancelar, y cancelar NO es un fallo: se cuenta en gris.
 *  - Cuando un turno acaba en nada —cancelado, un 409 de otra pantalla, un
 *    corte por tiempo— se puede repetir la pregunta con un botón. Reescribirla
 *    a mano después de esperar minuto y medio es la peor forma de perder ese
 *    minuto y medio.
 *  - Si la respuesta llega con el panel cerrado, el botón flotante lo avisa.
 *    Cerrar y volver al tablero durante la espera es lo natural, y sin aviso
 *    la respuesta se queda ahí sin que nadie la lea.
 *  - Debajo de cada respuesta se dice DE DÓNDE salió el dato y CON QUÉ se
 *    preguntó. Es lo que permite al operador detectar una respuesta recitada
 *    de memoria, y también una consulta hecha sobre la señal equivocada.
 *
 * No se monta si el servidor no tiene asistente configurado, y su caída no
 * puede tocar ninguna vista del tablero: es estrictamente aditivo.
 *
 * ── EL PANEL MAXIMIZADO, LA VOZ Y EL ADJUNTO ────────────────────────
 *
 * Cuatro añadidos sobre el diseño original. Los tres primeros salieron de
 * comparar en vivo tres direcciones visuales (concept-seed, seed 0c4916e5);
 * el cuarto llegó al juntar esta rama con la del asistente por voz:
 *
 *  - «Maximizar» abre un panel grande y centrado en vez del recuadro de
 *    esquina de siempre — un overlay, no una ruta nueva: se cierra con
 *    Escape o con clic fuera y vuelve exactamente a donde estaba.
 *  - Adjuntar sólo acepta texto plano (.txt/.csv/.md), leído en el propio
 *    navegador y sumado a la pregunta como contexto: el modelo de hoy es
 *    texto-solo y el endpoint no acepta imágenes ni PDF, así que ese botón
 *    no se ofrece — prometerlo sería mentir sobre lo que el backend hace.
 *  - El dictado transcribe con `whisper-server`, en el servidor, y NO con la
 *    Web Speech API del navegador. Hubo una versión con la del navegador y
 *    no sobrevivió a la comparación: no existe en Firefox y, sobre todo, no
 *    entrega el flujo de audio que necesita el modo de abajo para saber
 *    cuándo has dejado de hablar. Sin `IA_WHISPER_BASE` el botón no aparece,
 *    igual que antes no aparecía en Firefox.
 *  - El manos libres es una llamada, no un walkie: hablas, el turno se cierra
 *    solo al callarte, y la respuesta llega en voz alta. Es el modo para
 *    quien está delante del equipo con las manos ocupadas, que es cuando de
 *    verdad hace falta poder preguntarle algo al tablero. Ver
 *    `useManosLibres`.
 *
 * ── POR QUÉ EL TRAZO, Y POR QUÉ YA NO ES VERDE ──────────────────────
 *
 * La dirección elegida lee la respuesta como se lee una señal real en un
 * osciloscopio: un trazo que se DIBUJA SOLO mientras el texto llega —
 * derivado de los caracteres que de verdad llegaron, nunca una onda
 * decorativa— en vez de un spinner genérico. Eso es la identidad
 * ESTRUCTURAL de esta versión, y se queda.
 *
 * El primer boceto pintaba esa pantalla en un verde fósforo fijo, fuera del
 * sistema de temas — una identidad propia, como si el asistente fuera una
 * app aparte. No sobrevivió: la demo ya tiene tres temas seleccionables
 * (claro, oscuro, Mitsubishi Electric — `theme/themes.js`) y el resto de la
 * aplicación entera lee su color de `useTheme()`, nunca de un hexadecimal
 * propio. Aquí pasa lo mismo ahora: el trazo, la retícula y el resplandor
 * usan `t.accent` — azul en claro/oscuro, rojo en Mitsubishi — así que el
 * osciloscopio "brilla" en el color que cada tema llama su señal, y no hay
 * un cuarto mundo visual que mantener aparte de los otros tres.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, Ban, Bot, Boxes, Check, Copy, FileDown, FileText, Loader2, LogOut,
  Mic, NotebookPen, Paperclip, PhoneCall, PhoneOff, RotateCw, Send, Square,
  Trash2, TriangleAlert, X,
} from "lucide-react";
import { useTheme } from "@/theme";
import { pedir } from "@/lib/api/pedir.js";
import {
  ETIQUETA_HERRAMIENTA, describirConsulta, useAsistente, useDictado, useManosLibres,
} from "../lib/useAsistente.js";
import { conAdjunto, useAdjuntoTexto } from "../lib/useAdjuntoTexto.js";
import { markdownSeguro } from "../lib/markdown.js";
import { EVENTO_PREGUNTA } from "../lib/preguntaExterna.js";
/*
 * ── LOS TRES CAJONES SE CARGAN AL ABRIRSE ──────────────────────────
 *
 * Estáticos costaban 24 KB del trozo de arranque, y `scripts/verificar-bundle.mjs`
 * lo cazó al pasar de 102 a 126 KB. No es una cifra abstracta: quien entra a
 * hacer UNA pregunta —que es el caso normal— descargaba el árbol de AssetWorX,
 * el gestor de manuales, el de casos y las tres consultas de TanStack Query
 * antes de poder escribir.
 *
 * Diferirlos no los convierte en rutas: siguen sin URL, sin poder enlazarse y
 * sin sobrevivir a una recarga. `lazy()` aquí es reparto de descarga, no
 * navegación — que es la distinción que §2.12 protege.
 *
 * Se importa el ARCHIVO de cada uno y no un barril: un `lazy()` sobre un
 * `index.js` hace que Rollup nombre el trozo por su módulo de entrada y genere
 * un segundo `index-*.js`, que es justo lo que dejó de medir el presupuesto de
 * arranque la última vez que pasó.
 */
const ExploradorAssets = lazy(() =>
  import("@/components/assets/ExploradorAssets.jsx").then((m) => ({ default: m.ExploradorAssets }))
);
const CajonManuales = lazy(() => import("../cajones/Manuales.jsx"));
const CajonCasos = lazy(() => import("../cajones/Casos.jsx"));

const MONO = "'IBM Plex Mono', monospace";
const SANS = "'Plus Jakarta Sans', sans-serif";

/**
 * Los ejemplos que se ofrecen: uno por herramienta, para que se vea de un
 * vistazo lo que este asistente sabe hacer.
 *
 * Cuatro detalles que no son casuales:
 *
 *  - Los períodos van en RELATIVO, y además en HORAS. Un ejemplo anterior
 *    decía «el 25 de marzo de 2025» y a los pocos meses enseñaba a preguntar
 *    por un día que ya no le importaba a nadie. Y aquí lo que se vigila es una
 *    tendencia en curso, no el cierre de un día: la pregunta natural sobre un
 *    tanque es «cómo va yendo», no «cuánto produjo el martes».
 *  - Las señales de los ejemplos son las que **tienen historia** —nivel,
 *    temperatura, caudal, presión—, porque un ejemplo que falla al pulsarlo
 *    enseña lo contrario de lo que pretende. La carga del motor y la
 *    eficiencia no aparecen aquí por eso.
 *  - El primero no nombra ninguna señal a propósito: es el que enseña que se
 *    puede preguntar en vago y que la respuesta llega igual.
 *  - Están escritos como los escribiría un operador, no como un comando.
 */
/**
 * Cómo se llama el asistente de cara al usuario.
 *
 * En una constante y no repartido por el archivo, porque el nombre de un
 * producto cambia: ya pasó dos veces —«Asistente de planta», luego «Asistente
 * de la instalación»— y estaba escrito en cinco sitios entre rótulos y
 * etiquetas de accesibilidad, de los que se actualizaron cuatro. Un lector de
 * pantalla anunciando un nombre distinto del que se ve escrito es un fallo
 * difícil de detectar mirando la pantalla.
 *
 * Los identificadores INTERNOS no lo siguen a propósito: el archivo sigue
 * siendo `Asistente.jsx` y los turnos siguen llevando `rol: "asistente"`.
 * Renombrar eso sería tocar decenas de sitios, y las pruebas y el historial
 * de git para nada — el nombre comercial y el nombre del módulo no tienen por
 * qué coincidir.
 */
export const NOMBRE = "Tdconcito";

/**
 * Los seis ejemplos del estado vacío — uno por FAMILIA de capacidad.
 *
 * ── POR QUÉ SEIS, Y POR QUÉ ÉSTOS ──────────────────────────────────
 *
 * Detrás hay veintidós herramientas y el técnico no puede adivinarlas. Seis es
 * lo que se lee de un vistazo sin convertirse en un menú, y van elegidos para
 * que cada uno revele una familia distinta — no los seis más vistosos, que
 * enseñarían cuatro veces lo mismo.
 *
 * El quinto es el que más trabajo hace: es el único que enseña que a este
 * asistente se le puede **contar** algo, no sólo preguntarle. Esa es la vía por
 * la que se llena la bitácora de casos, que es la Fuente #3 del diagnóstico y
 * la única que se alimenta sola. Sin él, nadie descubriría que existe.
 */
const EJEMPLOS = [
  { texto: "¿Cómo está el tanque ahora mismo?", revela: "el instante" },
  { texto: "¿Cuánto subió la temperatura esta semana?", revela: "el histórico" },
  { texto: "¿Qué dice el manual sobre la presión máxima?", revela: "los manuales" },
  { texto: "¿Por qué se disparó el riesgo de cavitación?", revela: "el diagnóstico" },
  { texto: "Ya cambié la histéresis, apúntalo", revela: "contarle lo que hiciste" },
  { texto: "Hazme un reporte de este turno", revela: "un documento" },
];

/**
 * Los tres cajones.
 *
 * ── UN REGISTRO, Y NO ES UN ENRUTADOR ──────────────────────────────
 *
 * Se parece a la lista de rutas que esta aplicación borró, y la diferencia
 * importa: un cajón no es un destino. No tiene URL, no se puede enlazar, no
 * sobrevive a una recarga, y al cerrarlo se vuelve exactamente a donde se
 * estaba con el hilo intacto. Es contenido de la única vista, no otra vista.
 *
 * Están aquí los tres juntos porque comparten el mismo porqué: cada uno
 * ALIMENTA al asistente. Assets es con lo que se diagnostica un dato que falta;
 * Manuales, el único camino por el que entra conocimiento externo; Casos, la
 * única fuente que se llena sola y por tanto la única que puede degradarse sin
 * que nadie haga nada.
 */
const CAJONES = [
  { id: "assets", label: "Assets", Icono: Boxes },
  { id: "manuales", label: "Manuales", Icono: FileText },
  { id: "casos", label: "Casos", Icono: NotebookPen },
];

/** Sólo el texto, para el marcador de posición que rota en el campo. */
const SUGERENCIAS = EJEMPLOS.map((e) => e.texto);

/**
 * A cuántos píxeles del final se considera que el hilo sigue «pegado» abajo.
 * Con margen, porque el desplazamiento suave de algunos navegadores deja un
 * par de píxeles sueltos y un umbral de cero desengancharía el hilo solo.
 */
const UMBRAL_ANCLA = 48;

/*
 * ── LA RETÍCULA SE REPLEGÓ AL TRAZO (PLAN 20 FASE 5) ───────────────
 *
 * Era el fondo del panel entero, y ahí tenía sentido: un recuadro de esquina
 * con retícula y un trazo encima se lee como un instrumento. Al pasar el
 * asistente a ocupar la pantalla, esa misma retícula cubría los 1920 px de la
 * aplicación — y una cuadrícula que no mide nada, extendida a toda una
 * pantalla, deja de ser un instrumento y pasa a ser papel pintado. Lo señaló
 * el detector de `impeccable` y tiene razón: su propia regla reserva las
 * retículas para superficies donde de verdad se mide.
 *
 * Así que ahora sólo va detrás del trazo, que es lo único de esta interfaz que
 * SÍ es una medida: se dibuja con los caracteres que de verdad han llegado. La
 * identidad no se pierde, se concentra donde significa algo.
 *
 * `--eva-asis-retic` es la única propiedad de color que el `<style>` no puede
 * leer directamente: la regla es estática pero el matiz cambia con el tema, así
 * que la variable viaja inline y la hoja sólo la consume con `var()`.
 */
const ESTILOS = `
.eva-asis-reticula {
  background-image:
    linear-gradient(var(--eva-asis-retic) 1px, transparent 1px),
    linear-gradient(90deg, var(--eva-asis-retic) 1px, transparent 1px);
  background-size: 7px 7px;
}
.eva-asis-boton { transition: transform 0.12s ease, background 0.15s ease, border-color 0.15s ease; }
.eva-asis-boton:active:not(:disabled) { transform: translateY(1px) scale(0.96); }

@keyframes evaAsisTrazo { from { stroke-dashoffset: 240; } to { stroke-dashoffset: 0; } }
.eva-asis-trazo { stroke-dasharray: 240; animation: evaAsisTrazo 0.9s linear infinite; }

@keyframes evaAsisPunto {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.3); }
}
.eva-asis-punto { animation: evaAsisPunto 2.4s ease-in-out infinite; }

/* La entrada del cajón. Antes animaba el paso de esquina a centrado del panel
   maximizado, que ya no existe; ahora es lo único que entra en esta pantalla y
   por eso se queda: un panel que aparece de golpe encima del texto no deja ver
   de dónde salió. */
@keyframes evaAsisEntrada {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}
.eva-asis-entrada { animation: evaAsisEntrada 0.22s cubic-bezier(0.22, 1, 0.36, 1) both; }

@media (prefers-reduced-motion: reduce) {
  .eva-asis-trazo, .eva-asis-punto, .eva-asis-entrada { animation: none !important; }
}

/* La burbuja del asistente, ahora que trae markdown renderizado (regla 12 del
   prompt) en vez de texto llano. Tipografía compacta a propósito: es una
   burbuja de chat de 13px, no un documento. */
.eva-asis-markdown p { margin: 0 0 6px; }
.eva-asis-markdown p:last-child { margin-bottom: 0; }
.eva-asis-markdown ul, .eva-asis-markdown ol { margin: 4px 0; padding-left: 18px; }
.eva-asis-markdown li { margin: 2px 0; }
.eva-asis-markdown h1, .eva-asis-markdown h2, .eva-asis-markdown h3, .eva-asis-markdown h4 {
  margin: 8px 0 4px; font-size: 1em; font-weight: 700;
}
.eva-asis-markdown h1:first-child, .eva-asis-markdown h2:first-child,
.eva-asis-markdown h3:first-child, .eva-asis-markdown h4:first-child { margin-top: 0; }
.eva-asis-markdown code { font-family: 'IBM Plex Mono', monospace; font-size: 0.9em; background: rgba(127,127,127,0.16); padding: 1px 4px; border-radius: 4px; }
.eva-asis-markdown pre { overflow-x: auto; margin: 4px 0; }
.eva-asis-markdown blockquote { margin: 4px 0; padding-left: 8px; border-left: 2px solid currentColor; opacity: 0.85; }
`;

/**
 * Elige qué modelo responde. Un `<select>` nativo, a propósito.
 *
 * ── POR QUÉ NO UN DESPLEGABLE PROPIO ───────────────────────────────
 *
 * Porque el nativo ya trae teclado, lector de pantalla y —lo que aquí decide—
 * un menú que se pinta FUERA del panel. Uno propio dentro de una cabecera de
 * 420 px con `overflow: hidden` se recorta, y arreglarlo pide un portal y un
 * posicionador para ganar un menú más bonito en un control que se usa una vez
 * al día.
 *
 * ── LO QUE ESTA UI TIENE QUE DECIR, Y CASI SE NOS OLVIDA ────────────
 *
 * Que el cambio es GLOBAL. El modelo es uno para todo el servidor (ver
 * `chat.mjs`), así que quien lo cambia se lo cambia también a la pantalla del
 * taller. Un selector mudo se lee como una preferencia de esta pantalla, que
 * es exactamente lo contrario, y el operador de al lado vería cambiar la
 * velocidad de sus respuestas sin ninguna explicación. Lo dice el `title`, y
 * el aviso bajo la cabecera cuando el servidor rechaza el cambio.
 *
 * No se pinta si hay menos de dos modelos: un desplegable de una sola opción
 * es ruido que además promete una elección que no existe.
 */
function SelectorModelo({ modelo, modelos, elegir, error, ocupado, t }) {
  if (!modelos || modelos.length < 2) return <span style={{ flex: 1 }} />;

  return (
    <span style={{ flex: 1, display: "flex", alignItems: "center", minWidth: 0 }}>
      <select
        value={modelo ?? ""}
        onChange={(e) => elegir(e.target.value)}
        disabled={ocupado}
        aria-label="Modelo de IA (afecta a todas las pantallas)"
        title={
          ocupado
            ? "No se puede cambiar el modelo con una consulta en curso"
            : "Modelo de IA. El cambio afecta a TODAS las pantallas y la primera " +
              "respuesta tarda más mientras se carga."
        }
        style={{
          maxWidth: "100%", fontFamily: SANS, fontSize: 11,
          // `coral` es el color de error de la casa —«fuera de banda, error de
          // lectura, estado de fallo», ver `themes.js`— y es el que usa el
          // resto del panel. `textSoft` para el estado normal: el nombre del
          // modelo es contexto, no el rótulo principal de la cabecera.
          color: error ? t.coral : t.textSoft,
          background: "transparent",
          border: `1px solid ${error ? t.coral : t.border}`,
          borderRadius: 6, padding: "2px 4px",
          cursor: ocupado ? "not-allowed" : "pointer",
          opacity: ocupado ? 0.5 : 1,
        }}
      >
        {/* El activo puede no estar en la lista si alguien editó `IA_MODELOS`
            sin reiniciar. Se ofrece igual, porque es el que responde: omitirlo
            dejaría al `<select>` enseñando otro nombre por su cuenta. */}
        {(modelos.includes(modelo) ? modelos : [modelo, ...modelos].filter(Boolean)).map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </span>
  );
}

/**
 * Un trazo derivado del texto que de verdad llegó — no una onda decorativa
 * de mentira. Cada carácter nuevo aporta un punto; la señal crece con la
 * respuesta y se congela cuando el turno termina, como la traza de un
 * osciloscopio en modo «hold».
 */
function useTrazo(mensajes) {
  const ultimo = mensajes[mensajes.length - 1];
  const texto = ultimo?.rol === "asistente" ? ultimo.texto : "";

  return useMemo(() => {
    const muestras = 48;
    const base = texto || "iconics-agua";
    const puntos = Array.from({ length: muestras }, (_, i) => {
      const c = base.charCodeAt(i % base.length) || 60;
      const fase = Math.sin(i * 0.6 + c) * 0.5 + 0.5;
      return fase;
    });
    const w = 280;
    const h = 28;
    return puntos
      .map((v, i) => `${i ? "L" : "M"} ${((i / (muestras - 1)) * w).toFixed(1)} ${(h - 4 - v * (h - 8)).toFixed(1)}`)
      .join(" ");
  }, [texto]);
}

function PantallaTrazo({ ocupado, mensajes, t }) {
  const d = useTrazo(mensajes);
  return (
    <span
      className="eva-asis-reticula"
      aria-hidden="true"
      style={{
        "--eva-asis-retic": `${t.accent}1A`,
        flexShrink: 0, display: "grid", placeItems: "center",
        width: 104, height: 28, borderRadius: 7,
        border: `1px solid ${t.border}`,
        background: t.hover,
        overflow: "hidden",
      }}
    >
    <svg width={90} height={20} viewBox="0 0 280 28" style={{ flexShrink: 0, overflow: "visible" }} aria-hidden="true">
      <path d={d} fill="none" stroke={t.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
        opacity={ocupado ? 0.95 : 0.35} className={ocupado ? "eva-asis-trazo" : ""}
        style={{ filter: `drop-shadow(0 0 3px ${t.accent})` }} />
    </svg>
    </span>
  );
}

/**
 * @param {string} [usuario] Quién está dentro, para la cabecera.
 * @param {() => void} [salir] Cerrar sesión.
 *
 * ── POR QUÉ LLEGAN POR PROPS Y NO DE `useSesion()` ─────────────────
 *
 * Porque `features/asistente/` no tiene por qué saber que existe la
 * autenticación. Consumir el contexto de sesión aquí ataría el asistente a
 * `auth/`, y con él sus siete archivos de prueba, que tendrían que montar un
 * proveedor de sesión para comprobar cómo se pinta una respuesta.
 *
 * Quien sí conoce las dos cosas es `app/App.jsx`, que es exactamente su
 * trabajo. Sin ellos la cabecera no pinta ese bloque — no falla ni finge un
 * usuario anónimo.
 */
export function Asistente({ usuario = null, salir = null }) {
  const { theme: t } = useTheme();
  /*
   * Qué cajón está abierto, o `null`. Uno solo a la vez: dos paneles laterales
   * simultáneos serían una segunda columna de navegación, que es lo que §2.12
   * existe para impedir.
   */
  const [cajon, setCajon] = useState(null);
  const [borrador, setBorrador] = useState("");
  const [ejemplo, setEjemplo] = useState(0);
  const [anclado, setAnclado] = useState(true);
  const [sinLeer, setSinLeer] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [exportando, setExportando] = useState(false);
  const [errorExportar, setErrorExportar] = useState(null);

  const {
    disponible, mensajes, estado, ocupado, preguntar, reintentar, cancelar, limpiar,
    modelo, modelos, elegirModelo, errorModelo,
  } = useAsistente();
  const { adjunto, error: errorAdjunto, cargar, quitar } = useAdjuntoTexto();

  const finRef = useRef(null);
  const campoRef = useRef(null);
  const hiloRef = useRef(null);
  const archivoRef = useRef(null);
  const ocupadoPrevio = useRef(false);

  const dictado = useDictado();

  // El manos libres necesita el ÚLTIMO turno del asistente para leerlo en voz
  // alta cuando esté completo. Se le pasa el mensaje entero y no sólo el texto
  // porque también mira si acabó en error: un fallo no se lee como si fuera un
  // dato. Ver `useManosLibres`.
  const manosLibres = useManosLibres({
    preguntar,
    ocupado,
    ultimaRespuesta: mensajes.at(-1)?.rol === "asistente" ? mensajes.at(-1) : null,
  });

  /*
   * El hilo se desplaza solo al llegar texto nuevo, PERO solo si el usuario
   * estaba mirando el final. Sin la condición, subir a releer una cifra
   * anterior mientras se escribe la respuesta es imposible: a 40 tok/s el
   * panel te arranca de la pantalla lo que estabas leyendo varias veces por
   * segundo.
   */
  useEffect(() => { if (anclado) finRef.current?.scrollIntoView({ block: "end" }); }, [mensajes, estado, anclado]);
  /*
   * El campo toma el foco al arrancar y al cerrarse un cajón: la aplicación
   * ES el campo de preguntas, así que llegar y poder teclear sin pulsar nada
   * es el comportamiento correcto. Al abrir un cajón NO se roba el foco de
   * vuelta — dentro hay un árbol que se navega con el teclado.
   */
  useEffect(() => { if (!cajon) campoRef.current?.focus(); }, [cajon]);

  /*
   * Los segundos que lleva la consulta en curso. Con una espera de 30 a 90 s,
   * es la diferencia entre «va como siempre» y «esto se ha colgado», que es
   * la única pregunta que se hace quien está esperando.
   */
  useEffect(() => {
    if (!ocupado) return;
    setSegundos(0);
    const desde = Date.now();
    const id = setInterval(() => setSegundos(Math.round((Date.now() - desde) / 1000)), 1000);
    return () => clearInterval(id);
  }, [ocupado]);

  /*
   * La respuesta llegó con un cajón tapando la conversación.
   *
   * Antes esto marcaba el botón flotante cuando el panel estaba cerrado. El
   * panel ya no se cierra —es la aplicación— pero el problema sobrevive con
   * otro disfraz: consultar un manual mientras se espera es exactamente lo que
   * alguien hace durante minuto y medio, y sin aviso la respuesta se queda ahí
   * sin que nadie la lea.
   */
  useEffect(() => {
    if (ocupadoPrevio.current && !ocupado && cajon) setSinLeer(true);
    ocupadoPrevio.current = ocupado;
  }, [ocupado, cajon]);

  /*
   * Escape cierra el cajón abierto y devuelve el foco al campo.
   *
   * Ya no cierra nada más: esta aplicación no tiene un panel del que salir,
   * es la aplicación. Escape sobre la conversación no hace nada a propósito —
   * un atajo que a veces vacía la pantalla y a veces no es peor que ninguno.
   */
  useEffect(() => {
    if (!cajon) return;
    const alPulsar = (e) => { if (e.key === "Escape") cerrarCajon(); };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [cajon]);

  /**
   * Preguntas que llegan desde otra pantalla (ver `lib/preguntaExterna.js`).
   *
   * Va aquí arriba, con los demás efectos, y no junto a `lanzar()`: `lanzar`
   * se define DESPUÉS del `return null` de la línea siguiente, y un hook
   * declarado tras un return condicional cambia de orden entre renders.
   *
   * Con una consulta en vuelo NO se manda la nueva —sería una segunda petición
   * pisando a la primera— pero el panel se abre igual: quien pulsó el botón
   * tiene que ver que ya hay algo contestándose, no quedarse sin señal alguna
   * de que su gesto llegó.
   */
  useEffect(() => {
    const alPedir = (e) => {
      const texto = String(e?.detail?.texto ?? "").trim();
      if (!texto) return;
      // Un cajón abierto taparía la respuesta que se acaba de pedir.
      setCajon(null);
      if (ocupado) return;
      setAnclado(true);
      preguntar(texto);
    };
    window.addEventListener(EVENTO_PREGUNTA, alPedir);
    return () => window.removeEventListener(EVENTO_PREGUNTA, alPedir);
  }, [ocupado, preguntar]);

  // El servidor manda: sin `IA_BASE` no hay asistente y no se pinta nada.
  if (disponible !== true) return null;

  /**
   * Manda una pregunta, venga del campo o de un ejemplo.
   *
   * Deja el hilo anclado al final —quien acaba de preguntar quiere ver la
   * respuesta— y rota el ejemplo del campo, para que el segundo uso enseñe
   * una forma de preguntar distinta de la que ya conoce.
   *
   * @returns {boolean} si llegó a mandarse
   */
  const lanzar = (texto) => {
    if (!String(texto ?? "").trim() || ocupado) return false;
    preguntar(texto);
    setAnclado(true);
    setEjemplo((i) => (i + 1) % SUGERENCIAS.length);
    return true;
  };

  const enviar = (e) => {
    e?.preventDefault();
    const pregunta = conAdjunto(borrador, adjunto).slice(0, 2000);
    if (lanzar(pregunta)) { setBorrador(""); quitar(); }
  };

  /**
   * Lo transcrito se AÑADE a lo que hubiera escrito, no lo sustituye.
   *
   * El caso real es empezar a escribir, quedarse a medias y terminar la frase
   * hablando. Sustituir tiraría lo ya escrito sin manera de recuperarlo, y es
   * el tipo de pérdida que hace que nadie vuelva a pulsar el micrófono.
   *
   * El foco vuelve al campo porque el paso siguiente casi siempre es corregir
   * una palabra que Whisper oyó mal antes de enviar.
   */
  const anadirAlBorrador = (texto) => {
    setBorrador((previo) => (previo.trim() ? `${previo.trim()} ${texto}` : texto));
    campoRef.current?.focus();
  };

  /**
   * Un ejemplo SE ENVÍA al pulsarlo.
   *
   * Parece un botón de preguntar, así que pedir un segundo gesto para lo que
   * ya se había pulsado sobra. El borrador que hubiera en el campo se queda
   * como estaba: la pregunta que va es la del ejemplo, pero tirar lo que
   * alguien estaba escribiendo no es asunto de un botón de ayuda.
   */
  const preguntarEjemplo = (texto) => { lanzar(texto); };

  const alDesplazar = () => {
    const el = hiloRef.current;
    if (!el) return;
    setAnclado(el.scrollHeight - el.scrollTop - el.clientHeight < UMBRAL_ANCLA);
  };

  const irAlFinal = () => { setAnclado(true); finRef.current?.scrollIntoView({ block: "end" }); };

  /**
   * Exporta la conversación completa a PDF (`POST /api/chat/exportar`,
   * `backend/ia/reporte.mjs::componerConversacionPdf`) y abre la descarga.
   *
   * Es una acción de UI puntual —no estado del hilo—, así que vive aquí y no
   * en `useAsistente.js`. `cuerpo.url` se abre TAL CUAL, sin anteponer nada:
   * mismo criterio que `ReporteDescarga` más abajo, que usa `adjunto.url`
   * directo como `href` porque frontend y backend comparten origen.
   */
  const exportarPdf = async () => {
    setExportando(true);
    setErrorExportar(null);
    try {
      const historial = mensajes
        .filter((m) => m.texto?.trim())
        .map((m) => ({ rol: m.rol, texto: m.texto }));
      /*
       * Por `pedir` como todo lo demas (Plan 20 Fase 4). Esta llamada era la
       * unica de la aplicacion que escribia la ruta a pelo, sin `API_BASE`:
       * con `VITE_API_BASE` apuntando a otro backend, exportar era lo unico
       * que seguia hablando con el origen de la pagina. No daba error, daba un
       * PDF que venia del servidor equivocado.
       */
      const r = await pedir("/api/chat/exportar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ historial }),
      });
      const cuerpo = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(cuerpo?.error ?? `El servidor respondió ${r.status}.`);
      window.open(cuerpo.url, "_blank");
    } catch (e) {
      setErrorExportar(e.message);
    } finally {
      setExportando(false);
    }
  };

  const cerrarCajon = () => {
    setCajon(null);
    setSinLeer(false);
  };

  return (
    <>
      <style>{ESTILOS}</style>

      {/*
        * ── LA APLICACIÓN, NO UN PANEL (PLAN 20 FASE 5) ────────────────────
        *
        * Hasta aquí esto era un botón flotante que abría un recuadro de
        * esquina, con un modo maximizado por encima. Los tres estados —cerrado,
        * esquina, grande— existían porque el chat convivía con veintidós
        * pantallas y tenía que apartarse de ellas.
        *
        * Ya no hay nada de lo que apartarse. La pantalla es la conversación, y
        * los estados que quedan son otros tres, ninguno de los cuales es un
        * tamaño: LECTURA (esto), CAJÓN abierto encima, y MANOS LIBRES tomando
        * la pantalla entera. Ver el brief en `docs/PLAN-20-ASISTENTE.md` §F5.
        */}
      <div
        style={{
          position: "fixed", inset: 0,
          display: "flex", flexDirection: "column",
          background: `radial-gradient(120% 90% at 50% 0%, ${t.panel} 0%, ${t.page} 60%)`,
        }}
      >
        <Cabecera
          t={t} usuario={usuario} salir={salir}
          modelo={modelo} modelos={modelos} elegirModelo={elegirModelo}
          errorModelo={errorModelo} ocupado={ocupado} mensajes={mensajes}
          exportando={exportando} exportarPdf={exportarPdf} limpiar={limpiar}
          cajon={cajon} abrirCajon={setCajon}
        />

        {/* Los dos avisos que no interrumpen: el modelo anterior sigue
            sirviendo, y la conversación sigue en pantalla. `role="status"`. */}
        {errorModelo && <AvisoBarra t={t} texto={errorModelo} />}
        {errorExportar && <AvisoBarra t={t} texto={`No se pudo exportar la conversación: ${errorExportar}`} />}

        <main style={{ position: "relative", flex: 1, minHeight: 0, display: "flex" }}>
          <div
            ref={hiloRef} onScroll={alDesplazar}
            style={{
              flex: 1, overflowY: "auto",
              /*
               * La columna de lectura. `68ch` sobre el texto de las respuestas
               * (ver `Turno`) es lo que fija la medida; este ancho le deja aire
               * a los lados y sitio a las burbujas del usuario, alineadas a la
               * derecha. En una pantalla de 1920 los lados quedan en calma a
               * propósito: no hay nada que meter ahí que no compita con leer.
               */
              padding: "28px max(16px, calc(50% - 380px)) 20px",
              display: "grid", gap: 14, alignContent: "start",
            }}
          >
            {!mensajes.length && <Bienvenida t={t} ocupado={ocupado} onPreguntar={preguntarEjemplo} />}

            {mensajes.map((m, i) => (
              <Turno
                key={i} mensaje={m} t={t}
                // Solo el último turno se puede repetir: ver `reintentar()`.
                puedeReintentar={i === mensajes.length - 1 && !ocupado && Boolean(m.error || m.cancelado)}
                onReintentar={() => { setAnclado(true); reintentar(); }}
                ocupado={ocupado} onPreguntar={preguntarEjemplo}
              />
            ))}

            {estado && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: t.textSoft, fontFamily: MONO }}>
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: t.accent, boxShadow: `0 0 6px 1px ${t.accent}` }} />
                {/* El aria-live abarca solo las palabras del estado. Con los
                    segundos dentro, un lector de pantalla cantaría el contador
                    una vez por segundo durante minuto y medio. */}
                <span aria-live="polite">{estado}</span>
                {segundos > 0 && <span aria-hidden="true" style={{ color: t.textFaint }}>· {segundos} s</span>}
              </div>
            )}

            <div ref={finRef} />
          </div>

          {!anclado && Boolean(mensajes.length) && (
            <button type="button" onClick={irAlFinal} aria-label="Ir al final de la conversación" className="eva-asis-boton" style={botonBajar(t)}>
              <ArrowDown size={13} /> Ir al final
            </button>
          )}
        </main>

        <Redactor
          t={t}
          enviar={enviar} borrador={borrador} setBorrador={setBorrador}
          ocupado={ocupado} cancelar={cancelar}
          campoRef={campoRef} archivoRef={archivoRef}
          adjunto={adjunto} quitar={quitar} cargar={cargar} errorAdjunto={errorAdjunto}
          dictado={dictado} manosLibres={manosLibres}
          anadirAlBorrador={anadirAlBorrador}
          ejemplo={SUGERENCIAS[ejemplo]}
        />
      </div>

      {cajon && (
        <PanelCajon t={t} cual={cajon} cerrar={cerrarCajon} respuestaLista={sinLeer} />
      )}

      {manosLibres.activo && (
        <PantallaLlamada t={t} manosLibres={manosLibres} mensajes={mensajes} estado={estado} />
      )}
    </>
  );
}

/* ── Piezas del armazón ─────────────────────────────────────────────── */

/**
 * La cabecera: quién eres, con qué modelo, y las tres acciones sobre el hilo.
 *
 * ── ABSORBE LA BARRA DE SESIÓN DE LA FASE 4 ────────────────────────
 *
 * `auth/BarraSesion.jsx` existía provisionalmente para que hubiera forma de
 * salir. Su sitio era éste desde el principio: en una aplicación de una sola
 * vista, la identidad y la salida van en la única cabecera que hay, no en una
 * franja aparte que sólo dice eso.
 *
 * ── EL ORDEN NO ES CASUAL ──────────────────────────────────────────
 *
 * A la izquierda lo que identifica (el asistente, su modelo, su pulso); a la
 * derecha lo que actúa, y de menos a más consecuencia: cajones, exportar,
 * borrar, salir. Borrar el hilo va pegado a salir porque las dos son las
 * únicas que destruyen algo.
 */
function Cabecera({
  t, usuario, salir, modelo, modelos, elegirModelo, errorModelo, ocupado,
  mensajes, exportando, exportarPdf, limpiar, cajon, abrirCajon,
}) {
  const sinHilo = ocupado || !mensajes.length;

  return (
    <header
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 16px", borderBottom: `1px solid ${t.border}`,
        background: t.panel,
      }}
    >
      <Bot size={17} color={t.accent} aria-hidden="true" />
      <strong style={{ fontSize: 13.5, color: t.text, fontFamily: SANS }}>{NOMBRE}</strong>

      <SelectorModelo
        modelo={modelo} modelos={modelos} elegir={elegirModelo}
        error={errorModelo} ocupado={ocupado} t={t}
      />
      <PantallaTrazo ocupado={ocupado} mensajes={mensajes} t={t} />

      <div style={{ flex: 1 }} />

      {CAJONES.map(({ id, label, Icono }) => (
        <button
          key={id} type="button"
          onClick={() => abrirCajon(cajon === id ? null : id)}
          aria-pressed={cajon === id}
          aria-label={`${label} (panel lateral)`}
          title={label}
          className="eva-asis-boton"
          style={{
            ...botonIcono(t, false),
            ...(cajon === id ? { background: t.accentSoft, color: t.accent } : null),
          }}
        >
          <Icono size={15} />
        </button>
      ))}

      <span aria-hidden="true" style={{ width: 1, height: 18, background: t.border, margin: "0 4px" }} />

      <button
        type="button" onClick={exportarPdf} disabled={sinHilo || exportando}
        aria-label="Exportar la conversación a PDF" title="Exportar PDF"
        className="eva-asis-boton" style={botonIcono(t, sinHilo || exportando)}
      >
        {exportando ? <Loader2 size={15} className="spin" /> : <FileDown size={15} />}
      </button>
      <button
        type="button" onClick={limpiar} disabled={sinHilo}
        aria-label="Borrar la conversación" title="Borrar"
        className="eva-asis-boton" style={botonIcono(t, sinHilo)}
      >
        <Trash2 size={15} />
      </button>

      {usuario && (
        <>
          <span style={{ fontFamily: MONO, fontSize: 11.5, color: t.textFaint, marginLeft: 4 }}>
            {usuario}
          </span>
          <button
            type="button" onClick={salir}
            aria-label="Cerrar sesión" title="Cerrar sesión"
            className="eva-asis-boton" style={botonIcono(t, false)}
          >
            <LogOut size={15} />
          </button>
        </>
      )}
    </header>
  );
}

/** Un aviso de barra que NO interrumpe: lo de debajo sigue funcionando. */
function AvisoBarra({ t, texto }) {
  return (
    <div role="status" style={{ padding: "7px 16px", fontSize: 11.5, color: t.coral, fontFamily: MONO, lineHeight: 1.45, borderBottom: `1px solid ${t.border}` }}>
      {texto}
    </div>
  );
}

/**
 * El redactor: adjuntar, dictar, llamar, escribir y enviar.
 *
 * ── POR QUÉ ES UNA PIEZA APARTE ────────────────────────────────────
 *
 * Porque es lo único de esta pantalla que no cambia nunca de sitio. La
 * conversación se llena, los cajones entran y salen, el manos libres toma la
 * pantalla — y el redactor sigue abajo, en el mismo píxel. En una aplicación
 * de una sola vista ése es el ancla, y separarlo del armazón evita que se
 * arrastre en el próximo cambio de composición.
 *
 * ── LOS BOTONES QUE NO APARECEN ────────────────────────────────────
 *
 * El micrófono sólo existe si el servidor tiene whisper Y el navegador puede
 * grabar; el manos libres exige además que el navegador sepa hablar. No se
 * pintan inertes: un botón que siempre falla es peor que su ausencia, y en una
 * planta nadie va a averiguar que le falta una variable de entorno mirando un
 * icono gris.
 */
function Redactor({
  t, enviar, borrador, setBorrador, ocupado, cancelar, campoRef, archivoRef,
  adjunto, quitar, cargar, errorAdjunto, dictado, manosLibres, anadirAlBorrador,
  ejemplo,
}) {
  return (
    <div style={{ borderTop: `1px solid ${t.border}`, background: t.panel }}>
      <div style={{ padding: "0 max(16px, calc(50% - 380px))" }}>
        {adjunto && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0 0" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontFamily: MONO, color: t.textSoft, background: t.hover, border: `1px solid ${t.border}`, borderRadius: 8, padding: "4px 8px" }}>
              <FileText size={12} aria-hidden="true" />
              {adjunto.nombre}{adjunto.truncado && " (recortado)"}
              <button type="button" onClick={quitar} aria-label="Quitar el adjunto" style={{ background: "none", border: "none", color: t.textFaint, cursor: "pointer", display: "grid", placeItems: "center", padding: 0 }}>
                <X size={12} />
              </button>
            </span>
          </div>
        )}

        {errorAdjunto && (
          <div role="status" style={{ padding: "8px 0 0", fontSize: 11, color: t.coral, fontFamily: MONO }}>{errorAdjunto}</div>
        )}

        {/* El fallo del dictado se cuenta aquí y NO como un turno del hilo: no
            llegó a haber pregunta, así que meterlo en la conversación la
            ensuciaría con algo que nadie llegó a preguntar. */}
        {dictado.error && (
          <div role="status" style={{ padding: "8px 0 0", fontSize: 11, color: t.coral, fontFamily: MONO, lineHeight: 1.45 }}>
            {dictado.error}
          </div>
        )}

        <form onSubmit={enviar} style={{ display: "flex", gap: 8, padding: "12px 0 16px" }}>
          <input
            ref={archivoRef} type="file" accept=".txt,.csv,.md" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) cargar(f); e.target.value = ""; }}
          />

          {/* En manos libres no hay envío desde este formulario: un adjunto
              puesto ahí se quedaría colgado sin viajar con ninguna pregunta. */}
          <button
            type="button" onClick={() => archivoRef.current?.click()}
            disabled={ocupado || manosLibres.activo}
            aria-label="Adjuntar un documento de texto" title="Adjuntar .txt, .csv o .md"
            className="eva-asis-boton" style={botonIcono(t, ocupado || manosLibres.activo)}
          >
            <Paperclip size={16} />
          </button>

          {dictado.disponible && !ocupado && !manosLibres.activo && (
            <BotonMicrofono t={t} dictado={dictado} onTexto={anadirAlBorrador} />
          )}

          {manosLibres.disponible && !manosLibres.activo && (
            <BotonManosLibres t={t} manosLibres={manosLibres} />
          )}

          <input
            ref={campoRef}
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            placeholder={dictado.grabando ? "Te escucho…" : ocupado ? "Esperando respuesta…" : ejemplo}
            disabled={ocupado || manosLibres.activo}
            aria-label="Escribe tu pregunta"
            style={{
              flex: 1, minWidth: 0, fontSize: 13, padding: "9px 12px", borderRadius: 9,
              border: `1px solid ${dictado.grabando ? t.coral : t.border}`,
              background: t.hover, color: t.text,
              fontFamily: "'Inter', sans-serif",
            }}
          />

          {ocupado ? (
            <button type="button" onClick={cancelar} className="eva-asis-boton" style={botonCancelar(t)}>
              <Square size={12} /> Cancelar
            </button>
          ) : (
            <button
              type="submit" aria-label="Enviar la pregunta"
              disabled={!borrador.trim()}
              className="eva-asis-boton" style={botonEnviar(t, !borrador.trim())}
            >
              <Send size={15} />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

/**
 * Un cajón: el panel lateral que entra por la derecha.
 *
 * ── POR QUÉ ENCIMA Y NO PARTIENDO LA PANTALLA ──────────────────────
 *
 * Porque un panel fijo que empuja la conversación la estrecha para siempre, y
 * la conversación es lo que se ha venido a leer. Encima, el cajón se abre
 * cuando hace falta y desaparece cuando no, y la columna de lectura recupera
 * su medida entera.
 *
 * ── LA RESPUESTA QUE LLEGA CON EL CAJÓN ABIERTO ────────────────────
 *
 * Consultar un manual mientras se espera es exactamente lo que alguien hace
 * durante minuto y medio. Si la respuesta llega entonces, el cajón lo dice y
 * ofrece el camino de vuelta — sin cerrarse solo, que sería arrancarle a
 * alguien de las manos lo que estaba leyendo.
 */
function PanelCajon({ t, cual, cerrar, respuestaLista }) {
  const { label } = CAJONES.find((c) => c.id === cual) ?? {};

  return (
    <>
      <div
        aria-hidden="true" onClick={cerrar}
        style={{ position: "fixed", inset: 0, zIndex: 59, background: t.overlay }}
      />
      <aside
        role="dialog" aria-label={label}
        className="eva-asis-cajon"
        style={{
          position: "fixed", zIndex: 60, top: 0, right: 0, bottom: 0,
          width: "min(560px, 100vw)",
          display: "flex", flexDirection: "column",
          background: t.page,
          borderLeft: `1px solid ${t.border}`,
          boxShadow: t.shadowHover,
        }}
      >
        <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${t.border}`, background: t.panel }}>
          <strong style={{ fontSize: 13.5, color: t.text, fontFamily: SANS }}>{label}</strong>
          <div style={{ flex: 1 }} />

          {respuestaLista && (
            <button
              type="button" onClick={cerrar}
              className="eva-asis-boton"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 12, fontWeight: 600, fontFamily: SANS,
                padding: "5px 10px", borderRadius: 9,
                border: `1px solid ${t.accent}`, background: t.accentSoft, color: t.accent,
                cursor: "pointer",
              }}
            >
              <ArrowDown size={13} aria-hidden="true" />
              Respuesta lista
            </button>
          )}

          <button
            type="button" onClick={cerrar}
            aria-label={`Cerrar ${label}`} title="Cerrar (Esc)"
            className="eva-asis-boton" style={botonIcono(t, false)}
          >
            <X size={16} />
          </button>
        </header>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16 }}>
          {/*
            * El respaldo dice QUÉ se está trayendo, no «cargando…». Son
            * milisegundos en red local, pero en una planta con wifi flojo el
            * primer clic puede tardar, y un texto genérico no distingue «está
            * llegando» de «se colgó».
            */}
          <Suspense
            fallback={
              <p style={{ margin: 0, fontSize: 12.5, color: t.textFaint, fontFamily: MONO }}>
                Abriendo {label?.toLowerCase()}…
              </p>
            }
          >
            {cual === "assets" && <ExploradorAssets />}
            {cual === "manuales" && <CajonManuales />}
            {cual === "casos" && <CajonCasos />}
          </Suspense>
        </div>
      </aside>
    </>
  );
}

/**
 * El manos libres, cuando está activo: la pantalla ES la llamada.
 *
 * ── POR QUÉ TOMA LA PANTALLA Y NO ES UN BOTÓN QUE PARPADEA ─────────
 *
 * Porque es una llamada, no un walkie — lo dice ya la cabecera de
 * `BotonManosLibres`, y una llamada no es un control en una barra: es un
 * estado del aparato. Quien lo usa está a un metro de la pantalla, con las
 * manos en la máquina, y lo único que necesita ver desde ahí es EN QUÉ VA:
 * si le escucha, si está pensando o si está hablando.
 *
 * De ahí que el indicador sea grande y esté solo. Un panel con el mismo
 * tamaño de letra que el resto obligaría a acercarse, que es justo lo que este
 * modo existe para evitar.
 *
 * La conversación sigue debajo, en pequeño, porque el turno anterior es el
 * contexto de lo que se acaba de oír. No se puede desplazar ni escribir aquí:
 * para eso se cuelga.
 */
function PantallaLlamada({ t, manosLibres, mensajes, estado }) {
  const { fase, apagar, cerrarTurno, nivel } = manosLibres;
  const ultimo = mensajes.filter((m) => m.rol === "asistente").at(-1);

  const escuchando = fase === "escuchando";
  const escala = 1 + Math.min((nivel ?? 0) * 6, 0.9);

  return (
    <div
      role="dialog" aria-label="Manos libres"
      style={{
        position: "fixed", inset: 0, zIndex: 70,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 28, padding: 32,
        background: `radial-gradient(90% 70% at 50% 40%, ${t.panel} 0%, ${t.page} 70%)`,
        fontFamily: SANS,
      }}
    >
      {/*
        * El anillo crece con la voz. No es adorno: en un modo sin teclado y sin
        * texto es la única prueba de que el micrófono capta algo. Sin él,
        * alguien que hable con el micrófono silenciado por el sistema espera
        * una respuesta que no va a llegar y no tiene forma de saber por qué.
        */}
      <div style={{ position: "relative", display: "grid", placeItems: "center", width: 132, height: 132 }}>
        {escuchando && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute", width: 132, height: 132, borderRadius: "50%",
              border: `2px solid ${t.coral}`, opacity: 0.55,
              transform: `scale(${escala})`, transition: "transform 90ms linear",
            }}
          />
        )}
        <span
          aria-hidden="true"
          style={{
            width: 96, height: 96, borderRadius: "50%", display: "grid", placeItems: "center",
            background: escuchando ? t.coralSoft : t.accentSoft,
            color: escuchando ? t.coral : t.accent,
          }}
        >
          {escuchando ? <Mic size={34} /> : <Bot size={34} />}
        </span>
      </div>

      {/*
        * El texto grande es el estado, y va con `aria-live`: en este modo la
        * pantalla puede no estar mirándose, así que el cambio de fase tiene que
        * poder oírse igual que se ve.
        */}
      <p
        aria-live="polite"
        style={{ margin: 0, fontSize: 21, fontWeight: 600, letterSpacing: "-0.02em", color: t.text, textAlign: "center", maxWidth: "22ch", lineHeight: 1.35 }}
      >
        {FASE_MANOS_LIBRES[fase] ?? estado ?? "Manos libres"}
      </p>

      {ultimo?.texto && (
        <p style={{ margin: 0, maxWidth: "60ch", fontSize: 13.5, lineHeight: 1.6, color: t.textSoft, textAlign: "center" }}>
          {ultimo.texto}
        </p>
      )}

      <div style={{ display: "flex", gap: 12 }}>
        {escuchando && (
          <button
            type="button" onClick={cerrarTurno}
            className="eva-asis-boton"
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "12px 20px", borderRadius: 9, fontSize: 14, fontWeight: 600, fontFamily: SANS,
              border: `1px solid ${t.border}`, background: t.panel, color: t.text, cursor: "pointer",
            }}
          >
            He terminado
          </button>
        )}
        <button
          type="button" onClick={apagar}
          className="eva-asis-boton"
          aria-label="Colgar el manos libres"
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "12px 20px", borderRadius: 9, fontSize: 14, fontWeight: 600, fontFamily: SANS,
            border: "none", background: t.coral, color: "#FFFFFF", cursor: "pointer",
          }}
        >
          <PhoneOff size={16} aria-hidden="true" />
          Colgar
        </button>
      </div>
    </div>
  );
}

/**
 * El botón de dictar: pulsar para hablar, pulsar otra vez para parar.
 *
 * ── POR QUÉ CONMUTA Y NO ES MANTENER PULSADO ───────────────────────
 *
 * «Mantener pulsado» es el gesto de un walkie y parece lo natural, pero aquí
 * falla: una pregunta de diagnóstico son diez o quince segundos hablando, y
 * sostener el ratón todo ese rato mientras se piensa la frase es incómodo — y
 * en una pantalla táctil de planta, con guantes, se suelta sola. Al conmutar,
 * el gesto no compite con pensar la pregunta.
 *
 * ── POR QUÉ EL TEXTO SE AÑADE Y NO SE ENVÍA ────────────────────────
 *
 * Lo que devuelve la transcripción va al cuadro de entrada, no a la consulta.
 * Whisper se equivoca con el ruido de una sala de máquinas y con los nombres
 * de tag; una pregunta lanzada sobre una frase mal oída gasta un minuto de GPU
 * en responder a algo que nadie preguntó. Ver `backend/routes/vozRoutes.mjs`.
 */
function BotonMicrofono({ t, dictado, onTexto }) {
  const { grabando, transcribiendo, empezar, detener } = dictado;

  if (transcribiendo) {
    return (
      <button
        type="button" disabled
        aria-label="Transcribiendo lo que has dicho"
        style={botonVoz(t, "transcribiendo")}
      >
        <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
      </button>
    );
  }

  const alPulsar = async () => {
    if (!grabando) return empezar();
    const texto = await detener();
    if (texto) onTexto(texto);
  };

  return (
    <button
      type="button" onClick={alPulsar} className="eva-asis-boton"
      aria-label={grabando ? "Parar de grabar y transcribir" : "Dictar la pregunta"}
      title={grabando ? "Parar y transcribir" : "Dictar la pregunta"}
      style={botonVoz(t, grabando ? "grabando" : "listo")}
    >
      {grabando ? <Square size={13} fill="currentColor" /> : <Mic size={16} />}
    </button>
  );
}

/**
 * Qué está pasando en el modo manos libres, en el sitio donde se escribiría.
 *
 * El campo de texto está bloqueado mientras dura, así que su hueco es el mejor
 * sitio para decir de quién es el turno. Sin esto, un modo sin teclado y sin
 * pantalla no da ninguna pista de si te está escuchando o pensando, y la gente
 * habla encima de la respuesta.
 */
const FASE_MANOS_LIBRES = {
  parado: "Manos libres listo",
  escuchando: "Te escucho… se envía solo cuando dejes de hablar",
  pensando: "Entendiendo lo que has dicho…",
  hablando: "Contestando en voz alta…",
};

/**
 * El botón del modo manos libres.
 *
 * ── POR QUÉ CAMBIA DE FUNCIÓN SEGÚN LA FASE ────────────────────────
 *
 * Mientras escucha, pulsar significa «he terminado de hablar» — es el gesto
 * que más se usa y tiene que ser el mismo botón, no otro. En cualquier otra
 * fase significa colgar.
 *
 * Suena a dos cosas en un botón, y es al revés: es un teléfono. Descolgar,
 * hablar, ceder el turno y colgar son los cuatro gestos de una llamada, y
 * repartirlos en tres botones obligaría a mirar la pantalla, que es
 * exactamente lo que este modo existe para evitar.
 */
function BotonManosLibres({ t, manosLibres }) {
  const { activo, fase, encender, apagar, cerrarTurno, transcribiendo, nivel } = manosLibres;

  if (!activo) {
    return (
      <button
        type="button" onClick={encender} className="eva-asis-boton"
        aria-label={`Hablar con ${NOMBRE} en manos libres`}
        title="Manos libres: hablar y escuchar la respuesta"
        style={botonVoz(t, "listo")}
      >
        <PhoneCall size={16} />
      </button>
    );
  }

  if (fase === "escuchando") {
    /*
     * El anillo crece con la voz.
     *
     * No es adorno: en un modo sin teclado y sin texto, es la única prueba de
     * que el micrófono está captando algo. Sin ella, alguien que hable con el
     * micrófono silenciado por el sistema espera una respuesta que nunca va a
     * llegar, y no tiene forma de saber por qué.
     *
     * El turno se cierra SOLO al detectar silencio; el botón queda como salida
     * manual para cuando el ruido de fondo impida ese corte.
     */
    const escala = 1 + Math.min(nivel * 6, 0.9);
    return (
      <button
        type="button" onClick={cerrarTurno} className="eva-asis-boton"
        aria-label="He terminado de hablar"
        title="Te escucho. Se envía solo al callarte, o pulsa para enviar ya."
        style={botonVoz(t, "grabando")}
      >
        <span
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0, borderRadius: 7,
            background: t.coral, opacity: 0.18,
            transform: `scale(${escala})`,
            transition: "transform 100ms linear",
          }}
        />
        <Square size={13} fill="currentColor" style={{ position: "relative" }} />
      </button>
    );
  }

  return (
    <button
      type="button" onClick={apagar} className="eva-asis-boton"
      aria-label="Salir del manos libres"
      title="Colgar"
      style={botonVoz(t, "grabando")}
    >
      {transcribiendo
        ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
        : <PhoneOff size={16} />}
    </button>
  );
}

/**
 * Lo primero que se ve. Dice qué se puede preguntar y, sobre todo, qué NO.
 *
 * Aquí las limitaciones son dos y las dos se encuentran pronto, así que se
 * cuentan antes de que muerdan:
 *
 *  - **Sólo cuatro de las ocho señales tienen historia.** Es la limitación con
 *    la que tropieza cualquiera en la segunda pregunta, igual que pasaba con
 *    las máquinas sin historiar en el tablero de Resonac.
 *  - **Los límites son nuestros.** El servidor no publica alarmas para este
 *    árbol y las bandas contra las que se dice «en aviso» son estimaciones sin
 *    confirmar. La vista de Planta ya lo rotula; el chat, que es donde la cifra
 *    se lee suelta y sin la banda al lado, lo tiene que decir también.
 *
 * Los ejemplos van como botones y no como prosa porque son, literalmente, las
 * cosas que este asistente sabe hacer: leídos se olvidan, pulsados se aprenden.
 */
function Bienvenida({ t, ocupado, onPreguntar }) {
  return (
    <div style={{ fontFamily: SANS, maxWidth: "68ch" }}>
      <h1 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 650, letterSpacing: "-0.02em", color: t.text }}>
        Pregunta por la planta.
      </h1>

      <p style={{ margin: "0 0 6px", fontSize: 13.5, lineHeight: 1.6, color: t.textSoft }}>
        Las respuestas salen de ICONICS en el momento de preguntar, no de la
        memoria del modelo. Debajo de cada una verás con qué se consultó.
      </p>

      {/*
        * Las dos advertencias van aquí y no en una nota al pie porque cambian
        * cómo se lee TODA respuesta posterior, y quien las lea después de
        * creerse una cifra ya se la creyó.
        */}
      <p style={{ margin: "0 0 22px", fontSize: 12.5, lineHeight: 1.6, color: t.textFaint }}>
        No todas las señales tienen histórico: si preguntas por el pasado de una
        que no lo tiene, te lo dirá en vez de inventarlo. Y los límites con los
        que se juzga cada valor son estimaciones nuestras, no rangos confirmados
        de la instalación.
      </p>

      <Sugerencias t={t} ocupado={ocupado} onPreguntar={onPreguntar} />
    </div>
  );
}

/**
 * Los ejemplos. Pulsar uno manda esa pregunta tal cual.
 *
 * Van como botones y no como prosa porque son, literalmente, las cosas que
 * este asistente sabe hacer: leídos se olvidan, pulsados se aprenden.
 *
 * Cada uno lleva debajo qué revela. No es una etiqueta decorativa: seis frases
 * sueltas parecen seis preguntas de ejemplo, y con el rótulo se leen como seis
 * TIPOS de pregunta — que es lo que de verdad se está enseñando.
 */
function Sugerencias({ t, ocupado, onPreguntar }) {
  return (
    <ul
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
        gap: 8,
        margin: 0,
        padding: 0,
        listStyle: "none",
      }}
    >
      {EJEMPLOS.map(({ texto, revela }) => (
        <li key={texto}>
          <button
            type="button"
            onClick={() => onPreguntar(texto)}
            disabled={ocupado}
            className="eva-asis-boton eva-asis-ejemplo"
            style={{
              width: "100%",
              textAlign: "left",
              display: "grid",
              gap: 3,
              padding: "11px 13px",
              borderRadius: 9,
              border: `1px solid ${t.border}`,
              background: t.panel,
              cursor: ocupado ? "default" : "pointer",
              opacity: ocupado ? 0.55 : 1,
              fontFamily: SANS,
            }}
          >
            <span style={{ fontSize: 13, lineHeight: 1.4, color: t.text }}>{texto}</span>
            <span style={{ fontSize: 11, color: t.textFaint }}>{revela}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Turno({ mensaje, t, puedeReintentar, onReintentar, ocupado, onPreguntar }) {
  if (mensaje.rol === "usuario") {
    return (
      <div style={{ justifySelf: "end", maxWidth: "85%" }}>
        <div
          style={{
            background: t.accentSoft, color: t.text, fontSize: 13, lineHeight: 1.55,
            padding: "9px 12px", borderRadius: "10px 10px 2px 10px", whiteSpace: "pre-wrap",
          }}
        >
          {mensaje.texto}
        </div>
      </div>
    );
  }

  // El «…» es el turno que aún no ha empezado a escribir. Un turno que acabó
  // en error o cancelado y no llegó a decir nada no lleva burbuja: la nota de
  // debajo ya cuenta todo lo que pasó, y una burbuja vacía encima parece una
  // respuesta perdida.
  const hayBurbuja = Boolean(mensaje.texto) || !(mensaje.error || mensaje.cancelado);

  // De dónde salió el dato y con qué se preguntó. Es la invariante que permite
  // detectar una respuesta recitada: si no hay esta línea, no hubo consulta.
  //
  // Se enseñan TODAS las consultas, una por línea, porque desde que el backend
  // encadena herramientas un diagnóstico son varias. Resumirlas en «consultó 3
  // cosas» ahorraría dos líneas y destruiría justo lo que esto sirve para ver:
  // que la señal y el período de cada paso eran los que el operador esperaba.
  const consultas = mensaje.error ? [] : (mensaje.consultas ?? []);
  const adjuntos = mensaje.error ? [] : (mensaje.adjuntos ?? []);

  return (
    /*
     * `68ch` y no un porcentaje. Un 92 % de la columna son unos 97 caracteres
     * por línea, y el ojo pierde el renglón a partir de ~75: al volver del
     * final de una línea larga aterriza una línea más abajo. En un párrafo de
     * diagnóstico de diez líneas eso pasa varias veces.
     *
     * Es lo único de esta pantalla donde la medida importa de verdad: las
     * burbujas del usuario son cortas y los rótulos son de una línea.
     */
    <div style={{ maxWidth: "68ch" }}>
      {hayBurbuja && (
        mensaje.texto ? (
          <div
            className="eva-asis-markdown"
            style={{
              background: t.hover, color: t.text, fontSize: 13, lineHeight: 1.6,
              padding: "10px 12px", borderRadius: "10px 10px 10px 2px",
              borderLeft: `2px solid ${t.accent}`,
            }}
            // El HTML ya pasó por DOMPurify en `markdownSeguro`: ver ese
            // archivo para por qué el saneado no es opcional aquí.
            dangerouslySetInnerHTML={{ __html: markdownSeguro(mensaje.texto) }}
          />
        ) : (
          <div
            style={{
              background: t.hover, color: t.text, fontSize: 13, lineHeight: 1.6,
              padding: "10px 12px", borderRadius: "10px 10px 10px 2px",
              borderLeft: `2px solid ${t.accent}`,
            }}
          >
            …
          </div>
        )
      )}

      {/* Gráficos y reportes, debajo de la respuesta que los comenta. Llegan
          por su propio evento y nunca pasan por el modelo: lo que se ve aquí
          son puntos del historiador o un PDF ya compuesto por el backend,
          nunca algo que el asistente haya «dibujado» o inventado. */}
      {adjuntos.map((adjunto, i) => (
        <AdjuntoVista key={i} t={t} adjunto={adjunto} />
      ))}

      {mensaje.error && (
        <Nota t={t} color={t.coral} fondo={t.coralSoft} icono={<TriangleAlert size={12} />}>
          {mensaje.error}
        </Nota>
      )}

      {/* Cancelar es una decisión, no una avería: en gris y sin triángulo. */}
      {mensaje.cancelado && (
        <Nota t={t} color={t.textSoft} fondo={t.page} icono={<Ban size={12} />}>
          {mensaje.texto
            ? "Cancelaste la consulta; la respuesta quedó a medias."
            : "Cancelaste la consulta."}
        </Nota>
      )}

      {/* La respuesta se bloqueó por venir sin herramienta. El aviso importa
          más que el texto: casi siempre significa llama-server sin --jinja. */}
      {mensaje.bloqueada && (
        <Nota t={t} color={t.amber} fondo={t.amberSoft} icono={<TriangleAlert size={12} />}>
          Respuesta bloqueada: el modelo no consultó los datos de la planta.
        </Nota>
      )}

      {puedeReintentar && (
        <button type="button" onClick={onReintentar} className="eva-asis-boton" style={botonReintentar(t)}>
          <RotateCw size={12} /> Reintentar
        </button>
      )}

      {(consultas.length > 0 || mensaje.texto) && (
        <div style={{ marginTop: 6, display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: t.textFaint, lineHeight: 1.45, fontFamily: MONO }}>
            {consultas.map((consulta, i) => (
              <div key={i}>
                {[
                  ETIQUETA_HERRAMIENTA[consulta.nombre] ?? consulta.nombre,
                  ...describirConsulta(consulta.nombre, consulta.argumentos),
                ].join(" · ")}
              </div>
            ))}
          </div>
          {Boolean(mensaje.texto) && <BotonCopiar t={t} texto={mensaje.texto} />}
        </div>
      )}

      {/* Los dos callejones sin salida —el modelo recitó de memoria, o no supo
          qué contestar— acaban en un párrafo que enumera en prosa lo que sí se
          puede preguntar. Esa prosa es exactamente esta lista de botones, y
          aquí es donde más falta hace. */}
      {(mensaje.bloqueada || mensaje.sinRespuesta) && (
        <Sugerencias t={t} ocupado={ocupado} onPreguntar={onPreguntar} />
      )}
    </div>
  );
}

/**
 * Un gráfico que acompaña la respuesta.
 *
 * ── POR QUÉ UNA IMAGEN CON DATA URI Y NO EL SVG EN LÍNEA ───────────
 *
 * Porque el SVG lo genera el servidor y meterlo en el DOM con
 * `dangerouslySetInnerHTML` haría que cualquier cosa que acabara dentro de esa
 * cadena se ejecutara en la página. Hoy el contenido viene sólo del catálogo de
 * señales y del historiador, pero la ruta es la misma por la que viajan los
 * rótulos, y una etiqueta de señal la cambia quien configure el servidor
 * ICONICS. Dentro de una etiqueta de imagen el SVG se pinta igual y no ejecuta
 * nada: el navegador lo trata como imagen, no como documento.
 *
 * `encodeURIComponent` y no base64: pesa menos, se lee al depurar, y evita el
 * viaje por `btoa`, que además rompe con los acentos de los rótulos.
 */
/**
 * Reparte un adjunto al componente que sabe pintarlo, por `formato` — no por
 * `tipo`: el `tipo` del adjunto ('grafico', 'reporte'...) no sobrevive al
 * evento SSE que lo envuelve (ver la nota en `chat.mjs` junto a donde se
 * emite), así que `formato` es el campo estable para distinguir uno de otro.
 */
function AdjuntoVista({ t, adjunto }) {
  if (adjunto?.formato === "svg") return <Grafico t={t} adjunto={adjunto} />;
  if (adjunto?.formato === "pdf") return <ReporteDescarga t={t} adjunto={adjunto} />;
  return null;
}

function Grafico({ t, adjunto }) {
  if (adjunto?.formato !== "svg" || !adjunto.contenido) return null;

  return (
    <figure style={{ margin: "8px 0 0" }}>
      <img
        src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(adjunto.contenido)}`}
        alt={adjunto.titulo ? `Evolución de ${adjunto.titulo}` : "Gráfico de la señal"}
        style={{
          display: "block", width: "100%", height: "auto",
          borderRadius: 8, border: `1px solid ${t.border}`, background: "#fff",
        }}
      />
    </figure>
  );
}

/**
 * El enlace de descarga de un reporte PDF (Plan 14 Fase 5).
 *
 * El PDF nunca pasa por el modelo ni por este componente: `adjunto.url` es
 * la ruta de `GET /api/reportes`, y es el navegador quien lo descarga. Un
 * `<a href download>` normal basta — no hay nada que sanear, porque no hay
 * contenido ajeno inyectado en el DOM, sólo un enlace.
 */
function ReporteDescarga({ t, adjunto }) {
  if (adjunto?.formato !== "pdf" || !adjunto.url) return null;

  return (
    <a
      href={adjunto.url}
      download
      style={{
        marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 8,
        border: `1px solid ${t.border}`, background: t.hover, color: t.text,
        textDecoration: "none", fontFamily: "'Inter', sans-serif",
      }}
    >
      <FileDown size={14} />
      {adjunto.titulo || "Descargar reporte"}
    </a>
  );
}

/**
 * Copiar la respuesta. La cifra acaba en un parte o en un correo, y copiarla a
 * mano desde una burbuja es la forma más fácil de transcribirla mal.
 */
function BotonCopiar({ t, texto }) {
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const id = setTimeout(() => setCopiado(false), 1600);
    return () => clearTimeout(id);
  }, [copiado]);

  const copiar = async () => {
    try {
      await copiarAlPortapapeles(texto);
      setCopiado(true);
    } catch {
      // Sin portapapeles no hay nada que decirle al operador: el texto sigue
      // en pantalla y se puede seleccionar a mano.
    }
  };

  return (
    <button
      type="button" onClick={copiar}
      aria-label={copiado ? "Respuesta copiada" : "Copiar la respuesta"}
      title={copiado ? "Copiada" : "Copiar"}
      className="eva-asis-boton"
      style={{
        ...botonIcono(t, false),
        color: copiado ? t.success : t.textFaint,
        flexShrink: 0, padding: 4,
      }}
    >
      {copiado ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

/**
 * Copiar texto, también donde no existe la API moderna.
 *
 * `navigator.clipboard` solo está en contexto seguro, y el servidor de planta
 * sirve el tablero por http en la LAN: sin el respaldo, este botón no
 * funcionaría justo en la única instalación que importa.
 */
function copiarAlPortapapeles(texto) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(texto);

  return new Promise((resolver, rechazar) => {
    const campo = document.createElement("textarea");
    campo.value = texto;
    campo.setAttribute("readonly", "");
    campo.style.cssText = "position:fixed;top:-1000px;opacity:0";

    document.body.appendChild(campo);
    campo.select();
    const copiado = document.execCommand?.("copy");
    document.body.removeChild(campo);

    if (copiado) resolver();
    else rechazar(new Error("El navegador no dejó copiar."));
  });
}

function Nota({ t, color, fondo, icono, children }) {
  return (
    <div
      style={{
        marginTop: 6, display: "flex", alignItems: "flex-start", gap: 6,
        fontSize: 11.5, lineHeight: 1.5, color, background: fondo,
        padding: "7px 9px", borderRadius: 8,
      }}
    >
      <span style={{ marginTop: 2, flexShrink: 0 }}>{icono}</span>
      <span>{children}</span>
    </div>
  );
}

const botonIcono = (t, deshabilitado) => ({
  background: "transparent", border: "none", color: t.textFaint,
  cursor: deshabilitado ? "default" : "pointer", opacity: deshabilitado ? 0.4 : 1,
  padding: 5, borderRadius: 7, display: "grid", placeItems: "center",
});

/**
 * El micrófono y el teléfono, en sus tres estados.
 *
 * Grabando va en rojo y con un cuadrado —el símbolo universal de «parar»— y no
 * con otro micrófono: el problema real de un botón que conmuta es que, si no
 * cambia de forma, no se sabe si está escuchando. El color solo no basta en
 * una pantalla de planta con reflejos.
 *
 * Parte de `botonIcono` y no de un estilo propio para que el micrófono, el
 * teléfono y el clip se lean como la misma fila de herramientas.
 */
const botonVoz = (t, estado) => {
  const base = { ...botonIcono(t, false), position: "relative", flexShrink: 0 };

  if (estado === "grabando") {
    return { ...base, color: t.coral, background: `${t.coral}22` };
  }
  if (estado === "transcribiendo") {
    return { ...base, color: t.textFaint, cursor: "default" };
  }
  return base;
};

const botonEnviar = (t, deshabilitado) => ({
  display: "grid", placeItems: "center", width: 38, borderRadius: 9, border: "none",
  background: deshabilitado ? t.hover : t.gradAccent,
  color: deshabilitado ? t.textFaint : "#FFFFFF",
  cursor: deshabilitado ? "default" : "pointer",
});

const botonCancelar = (t) => ({
  display: "inline-flex", alignItems: "center", gap: 5,
  fontSize: 12.5, fontWeight: 600, padding: "0 14px", borderRadius: 9,
  border: `1px solid ${t.border}`, background: "transparent", color: t.textSoft,
  cursor: "pointer", fontFamily: "'Inter', sans-serif",
});

const botonReintentar = (t) => ({
  marginTop: 6, display: "inline-flex", alignItems: "center", gap: 5,
  fontSize: 11.5, fontWeight: 600, padding: "5px 10px", borderRadius: 8,
  border: `1px solid ${t.border}`, background: "transparent", color: t.textSoft,
  cursor: "pointer", fontFamily: "'Inter', sans-serif",
});

const botonBajar = (t) => ({
  position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: 10,
  display: "inline-flex", alignItems: "center", gap: 5,
  fontSize: 11.5, fontWeight: 600, padding: "5px 11px", borderRadius: 999,
  border: `1px solid ${t.border}`, background: t.panel, color: t.textSoft,
  boxShadow: t.shadow, cursor: "pointer", fontFamily: "'Inter', sans-serif",
});

const estiloChip = (t, deshabilitado) => ({
  fontSize: 11.5, lineHeight: 1.4, textAlign: "left",
  padding: "5px 10px", borderRadius: 999,
  border: `1px solid ${t.border}`, background: "transparent", color: t.textSoft,
  cursor: deshabilitado ? "default" : "pointer", opacity: deshabilitado ? 0.4 : 1,
  fontFamily: "'Inter', sans-serif",
});
