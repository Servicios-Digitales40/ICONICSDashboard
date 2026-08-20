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
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, Ban, Bot, Check, Copy, FileText, Loader2, Maximize2, Mic,
  Minimize2, Paperclip, PhoneCall, PhoneOff, RotateCw, Send, Square, Trash2,
  TriangleAlert, X,
} from "lucide-react";
import { useTheme } from "@/theme";
import {
  ETIQUETA_HERRAMIENTA, describirConsulta, useAsistente, useDictado, useManosLibres,
} from "../lib/useAsistente.js";
import { conAdjunto, useAdjuntoTexto } from "../lib/useAdjuntoTexto.js";

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

const SUGERENCIAS = [
  "¿Cómo va la instalación ahora mismo?",
  "¿Qué nivel tiene el tanque?",
  "¿Cómo ha ido la temperatura estas últimas horas?",
  "Compara la presión de esta hora con la de hace seis horas",
];

/**
 * A cuántos píxeles del final se considera que el hilo sigue «pegado» abajo.
 * Con margen, porque el desplazamiento suave de algunos navegadores deja un
 * par de píxeles sueltos y un umbral de cero desengancharía el hilo solo.
 */
const UMBRAL_ANCLA = 48;

/*
 * `--eva-asis-retic` es la única propiedad de color que el `<style>` no
 * puede leer directamente: el fondo de retícula vive en una regla CSS
 * estática, pero el matiz cambia con el tema. Se resuelve como en
 * `InicioEva.jsx` (`--tv-border`/`--tv-shadow`): la variable viaja inline,
 * por instancia, y la hoja de estilos sólo la consume con `var()`.
 */
const ESTILOS = `
.eva-asis-reticula {
  background-image:
    linear-gradient(var(--eva-asis-retic) 1px, transparent 1px),
    linear-gradient(90deg, var(--eva-asis-retic) 1px, transparent 1px);
  background-size: 20px 20px;
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

/* Maximizar cambia el ancla de posicionado (esquina fija ↔ centrado): animar
   width/height interpolaría layout. Se anima transform+opacity en su lugar,
   disparado por el remontaje que fuerza la key en <section>. */
@keyframes evaAsisEntrada {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}
.eva-asis-entrada { animation: evaAsisEntrada 0.22s cubic-bezier(0.22, 1, 0.36, 1) both; }

@media (prefers-reduced-motion: reduce) {
  .eva-asis-trazo, .eva-asis-punto, .eva-asis-entrada { animation: none !important; }
}
`;

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
    <svg width={90} height={20} viewBox="0 0 280 28" style={{ flexShrink: 0, overflow: "visible" }} aria-hidden="true">
      <path d={d} fill="none" stroke={t.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
        opacity={ocupado ? 0.95 : 0.35} className={ocupado ? "eva-asis-trazo" : ""}
        style={{ filter: `drop-shadow(0 0 3px ${t.accent})` }} />
    </svg>
  );
}

export function Asistente() {
  const { theme: t } = useTheme();
  const [abierto, setAbierto] = useState(false);
  const [maximizado, setMaximizado] = useState(false);
  const [borrador, setBorrador] = useState("");
  const [ejemplo, setEjemplo] = useState(0);
  const [anclado, setAnclado] = useState(true);
  const [sinLeer, setSinLeer] = useState(false);
  const [segundos, setSegundos] = useState(0);

  const { disponible, mensajes, estado, ocupado, preguntar, reintentar, cancelar, limpiar } = useAsistente();
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
  useEffect(() => { if (abierto) campoRef.current?.focus(); }, [abierto, maximizado]);

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
   * La respuesta llegó con el panel cerrado: se marca el botón flotante.
   *
   * La consulta sigue viva aunque se cierre el panel —el hilo no se desmonta—
   * y esa es justo la trampa: sin este aviso, quien cierra para volver al
   * tablero mientras espera no se entera nunca de que ya hay respuesta.
   */
  useEffect(() => {
    if (ocupadoPrevio.current && !ocupado && !abierto) setSinLeer(true);
    ocupadoPrevio.current = ocupado;
  }, [ocupado, abierto]);

  useEffect(() => { if (abierto) setSinLeer(false); }, [abierto]);

  // Escape restaura el panel maximizado, y si ya estaba en su tamaño de
  // esquina, cierra — lo que espera cualquiera de un panel flotante.
  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e) => {
      if (e.key !== "Escape") return;
      if (maximizado) setMaximizado(false);
      else setAbierto(false);
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [abierto, maximizado]);

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

  if (!abierto) {
    return (
      <button
        type="button" onClick={() => setAbierto(true)}
        aria-label={sinLeer ? `Abrir ${NOMBRE}. La respuesta está lista.` : `Abrir ${NOMBRE}`}
        className="eva-asis-boton"
        style={{
          position: "fixed", right: 24, bottom: 24, zIndex: 60,
          width: 54, height: 54, borderRadius: "50%", border: "none", cursor: "pointer",
          background: t.gradAccent, color: "#FFFFFF", boxShadow: t.shadowHover,
          display: "grid", placeItems: "center",
        }}
      >
        <Bot size={22} />
        {/* El punto vive en blanco sobre el degradado de marca: es el único
            color que se lee limpio encima de un acento saturado en los tres
            temas (azul, azul oscuro y rojo Mitsubishi). */}
        <span aria-hidden="true" className="eva-asis-punto" style={{ position: "absolute", bottom: 9, width: 5, height: 5, borderRadius: "50%", background: "#FFFFFF", boxShadow: "0 0 6px 1px rgba(255,255,255,0.85)" }} />
        {sinLeer && (
          <span aria-hidden="true" style={{ position: "absolute", top: 3, right: 3, width: 13, height: 13, borderRadius: "50%", background: t.coral, border: `2.5px solid ${t.page}` }} />
        )}
      </button>
    );
  }

  const grande = maximizado;

  return (
    <>
      <style>{ESTILOS}</style>

      {grande && (
        <div aria-hidden="true" onClick={() => setMaximizado(false)} style={{ position: "fixed", inset: 0, zIndex: 59, background: t.overlay, backdropFilter: "blur(2px)" }} />
      )}

      <section
        key={grande ? "grande" : "chico"}
        role="dialog" aria-label={NOMBRE}
        className="eva-asis-reticula eva-asis-entrada"
        style={{
          position: "fixed", zIndex: 60,
          "--eva-asis-retic": `${t.accent}0F`,
          ...(grande
            ? { inset: 0, margin: "auto", width: "min(920px, 92vw)", height: "min(760px, 88vh)" }
            : { right: 24, bottom: 24, width: "min(420px, calc(100vw - 48px))", height: "min(560px, calc(100vh - 48px))" }),
          display: "flex", flexDirection: "column",
          background: `radial-gradient(120% 130% at 50% 0%, ${t.panel} 0%, ${t.page} 65%)`,
          border: `1px solid ${t.border}`, borderRadius: 16,
          boxShadow: t.shadowHover, overflow: "hidden",
        }}
      >
        <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: `1px solid ${t.border}` }}>
          <Bot size={17} color={t.accent} />
          <strong style={{ flex: 1, fontSize: 13.5, color: t.text, fontFamily: SANS }}>{NOMBRE}</strong>
          <PantallaTrazo ocupado={ocupado} mensajes={mensajes} t={t} />

          <button type="button" onClick={limpiar} disabled={ocupado || !mensajes.length} aria-label="Borrar la conversación" title="Borrar" className="eva-asis-boton" style={botonIcono(t, ocupado || !mensajes.length)}>
            <Trash2 size={15} />
          </button>
          <button type="button" onClick={() => setMaximizado((m) => !m)} aria-label={grande ? "Restaurar tamaño" : "Maximizar"} title={grande ? "Restaurar" : "Maximizar"} className="eva-asis-boton" style={botonIcono(t, false)}>
            {grande ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button type="button" onClick={() => setAbierto(false)} aria-label={`Cerrar ${NOMBRE}`} className="eva-asis-boton" style={botonIcono(t, false)}>
            <X size={16} />
          </button>
        </header>

        {/* El envoltorio existe para poder colgar el botón de «ir al final»
            encima del hilo: dentro del contenedor con scroll se desplazaría
            junto al texto, que es justo lo contrario de lo que hace falta. */}
        <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex" }}>
          <div
            ref={hiloRef} onScroll={alDesplazar}
            style={{ flex: 1, overflowY: "auto", padding: grande ? "20px max(14px, calc(50% - 340px))" : 14, display: "grid", gap: 12, alignContent: "start" }}
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
        </div>

        {adjunto && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px 0" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontFamily: MONO, color: t.textSoft, background: t.hover, border: `1px solid ${t.border}`, borderRadius: 8, padding: "4px 8px" }}>
              <FileText size={12} />
              {adjunto.nombre}{adjunto.truncado && " (recortado)"}
              <button type="button" onClick={quitar} aria-label="Quitar el adjunto" style={{ background: "none", border: "none", color: t.textFaint, cursor: "pointer", display: "grid", placeItems: "center", padding: 0 }}>
                <X size={12} />
              </button>
            </span>
          </div>
        )}
        {errorAdjunto && (
          <div style={{ padding: "6px 12px 0", fontSize: 11, color: t.coral, fontFamily: MONO }}>{errorAdjunto}</div>
        )}

        {/* El fallo del dictado se cuenta aquí y NO como un turno del hilo: no
            llegó a haber pregunta, así que meterlo en la conversación la
            ensuciaría con algo que nadie llegó a preguntar. */}
        {dictado.error && (
          <div style={{ padding: "6px 12px 0", fontSize: 11, color: t.coral, fontFamily: MONO, lineHeight: 1.45 }}>
            {dictado.error}
          </div>
        )}

        <form onSubmit={enviar} style={{ display: "flex", gap: 8, padding: 12, borderTop: `1px solid ${t.border}` }}>
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

          {/* El micrófono sólo aparece si el servidor tiene whisper Y el
              navegador puede grabar. Un botón que siempre falla es peor que
              no tenerlo. Y desaparece durante el manos libres: ahí el turno
              lo abre y lo cierra el otro botón. */}
          {dictado.disponible && !ocupado && !manosLibres.activo && (
            <BotonMicrofono t={t} dictado={dictado} onTexto={anadirAlBorrador} />
          )}

          {/* El manos libres exige además que el navegador sepa hablar. */}
          {manosLibres.disponible && (
            <BotonManosLibres t={t} manosLibres={manosLibres} />
          )}

          <input
            ref={campoRef}
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            placeholder={
              manosLibres.activo
                ? FASE_MANOS_LIBRES[manosLibres.fase]
                : dictado.grabando ? "Te escucho…"
                : ocupado ? "Esperando respuesta…" : SUGERENCIAS[ejemplo]
            }
            disabled={ocupado || manosLibres.activo}
            aria-label="Escribe tu pregunta"
            style={{
              flex: 1, minWidth: 0, fontSize: 13, padding: "9px 12px", borderRadius: 9,
              border: `1px solid ${dictado.grabando || manosLibres.activo ? t.coral : t.border}`,
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
      </section>
    </>
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
    <div style={{ fontSize: 12.5, color: t.textSoft, lineHeight: 1.6, fontFamily: "'Inter', sans-serif" }}>
      Pregunta por el estado del sistema de agua o por cómo ha evolucionado una
      de sus señales.
      <div style={{ marginTop: 8, color: t.textFaint }}>
        Las respuestas salen de ICONICS, no de la memoria del modelo. Sólo cuatro
        de las ocho señales tienen historia —nivel, temperatura, caudal y
        presión—; si preguntas por el pasado de otra, te lo dirá en vez de
        inventarlo. Los límites con los que se juzga cada valor son estimaciones
        nuestras, no rangos confirmados de la instalación.
      </div>

      <Sugerencias t={t} ocupado={ocupado} onPreguntar={onPreguntar} />
    </div>
  );
}

/** Los ejemplos. Pulsar uno manda esa pregunta tal cual. */
function Sugerencias({ t, ocupado, onPreguntar }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
      {SUGERENCIAS.map((s) => (
        <button
          key={s} type="button" onClick={() => onPreguntar(s)} disabled={ocupado}
          className="eva-asis-boton" style={estiloChip(t, ocupado)}
        >
          {s}
        </button>
      ))}
    </div>
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
    <div style={{ maxWidth: "92%" }}>
      {hayBurbuja && (
        <div
          style={{
            background: t.hover, color: t.text, fontSize: 13, lineHeight: 1.6,
            padding: "10px 12px", borderRadius: "10px 10px 10px 2px", whiteSpace: "pre-wrap",
            borderLeft: `2px solid ${t.accent}`,
          }}
        >
          {mensaje.texto || "…"}
        </div>
      )}

      {/* Los gráficos, debajo de la respuesta que los comenta. Llegan por su
          propio evento y nunca pasan por el modelo: lo que se ve aquí son
          puntos del historiador, no algo que el asistente haya «dibujado». */}
      {adjuntos.map((adjunto, i) => (
        <Grafico key={i} t={t} adjunto={adjunto} />
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
 * ── POR QUÉ UN `<img>` CON DATA URI Y NO EL SVG EN LÍNEA ───────────
 *
 * Porque el SVG lo genera el servidor y meterlo en el DOM con
 * `dangerouslySetInnerHTML` haría que cualquier cosa que acabara dentro de esa
 * cadena se ejecutara en la página. Hoy el contenido viene sólo del catálogo de
 * señales y del historiador, pero la ruta es la misma por la que viajan los
 * rótulos, y una etiqueta de señal la cambia quien configure el servidor
 * ICONICS. Dentro de un `<img>` el SVG se pinta igual y no ejecuta nada:
 * el navegador lo trata como imagen, no como documento.
 *
 * `encodeURIComponent` y no base64: pesa menos, se lee al depurar, y evita el
 * viaje por `btoa`, que además rompe con los acentos de los rótulos.
 */
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
