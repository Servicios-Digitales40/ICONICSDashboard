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
 *    de memoria, y también una consulta hecha sobre la máquina equivocada.
 *
 * No se monta si el servidor no tiene asistente configurado, y su caída no
 * puede tocar ninguna vista del tablero: es estrictamente aditivo.
 */
import { useEffect, useRef, useState } from "react";
import {
  ArrowDown, Ban, Bot, Check, Copy, Loader2, RotateCw, Send, Trash2, TriangleAlert, X,
} from "lucide-react";
import { useTheme } from "@/theme";
import { ETIQUETA_HERRAMIENTA, describirConsulta, useAsistente } from "../lib/useAsistente.js";

/**
 * Los ejemplos que se ofrecen: uno por herramienta, para que se vea de un
 * vistazo lo que este asistente sabe hacer.
 *
 * Tres detalles que no son casuales:
 *
 *  - Las fechas van en RELATIVO. El ejemplo anterior decía «el 25 de marzo de
 *    2025» y a los pocos meses enseñaba a preguntar por un día que ya no le
 *    importaba a nadie.
 *  - La máquina es la Línea 1 porque es la única con historia en el
 *    historiador (`IA_MAQUINAS_CON_HISTORIA`), y un ejemplo que falla al
 *    pulsarlo enseña lo contrario de lo que pretende.
 *  - Están escritos como los escribiría un operador, no como un comando.
 */
const SUGERENCIAS = [
  "¿Cómo va la planta ahora mismo?",
  "¿Está operando la Línea 1?",
  "¿Cuál fue el OEE de la Línea 1 ayer?",
  "Compara ayer con anteayer en la Línea 1",
];

/**
 * A cuántos píxeles del final se considera que el hilo sigue «pegado» abajo.
 * Con margen, porque el desplazamiento suave de algunos navegadores deja un
 * par de píxeles sueltos y un umbral de cero desengancharía el hilo solo.
 */
const UMBRAL_ANCLA = 48;

export function Asistente() {
  const { theme: t } = useTheme();
  const [abierto, setAbierto] = useState(false);
  const [borrador, setBorrador] = useState("");
  const [ejemplo, setEjemplo] = useState(0);
  const [anclado, setAnclado] = useState(true);
  const [sinLeer, setSinLeer] = useState(false);
  const [segundos, setSegundos] = useState(0);

  const {
    disponible, mensajes, estado, ocupado, preguntar, reintentar, cancelar, limpiar,
  } = useAsistente();

  const finRef = useRef(null);
  const campoRef = useRef(null);
  const hiloRef = useRef(null);
  const ocupadoPrevio = useRef(false);

  /*
   * El hilo se desplaza solo al llegar texto nuevo, PERO solo si el usuario
   * estaba mirando el final. Sin la condición, subir a releer una cifra
   * anterior mientras se escribe la respuesta es imposible: a 40 tok/s el
   * panel te arranca de la pantalla lo que estabas leyendo varias veces por
   * segundo.
   */
  useEffect(() => {
    if (anclado) finRef.current?.scrollIntoView({ block: "end" });
  }, [mensajes, estado, anclado]);

  useEffect(() => {
    if (abierto) campoRef.current?.focus();
  }, [abierto]);

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

  useEffect(() => {
    if (abierto) setSinLeer(false);
  }, [abierto]);

  // Escape cierra, que es lo que espera cualquiera de un panel flotante.
  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e) => { if (e.key === "Escape") setAbierto(false); };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [abierto]);

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
    if (lanzar(borrador)) setBorrador("");
  };

  /**
   * Un ejemplo SE ENVÍA al pulsarlo.
   *
   * Parece un botón de preguntar, así que pedir un segundo gesto para lo que
   * ya se había pulsado sobra. El borrador que hubiera en el campo se queda
   * como estaba: la pregunta que va es la del ejemplo, pero tirar lo que
   * alguien estaba escribiendo no es asunto de un botón de ayuda.
   *
   * A cambio, cada consulta ocupa la GPU entre 30 y 90 segundos y bloquea a
   * las demás pantallas, así que los ejemplos se apagan mientras hay una en
   * curso en vez de quedarse pulsables sin efecto.
   */
  const preguntarEjemplo = (texto) => { lanzar(texto); };

  const alDesplazar = () => {
    const el = hiloRef.current;
    if (!el) return;
    setAnclado(el.scrollHeight - el.scrollTop - el.clientHeight < UMBRAL_ANCLA);
  };

  const irAlFinal = () => {
    setAnclado(true);
    finRef.current?.scrollIntoView({ block: "end" });
  };

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={sinLeer ? "Abrir el asistente. La respuesta está lista." : "Abrir el asistente"}
        style={{
          position: "fixed", right: 24, bottom: 24, zIndex: 60,
          width: 52, height: 52, borderRadius: "50%", border: "none", cursor: "pointer",
          background: t.gradAccent, color: "#FFFFFF",
          boxShadow: t.shadowHover,
          display: "grid", placeItems: "center",
        }}
      >
        <Bot size={22} />

        {/* El punto va con el color de aviso y un anillo del color del fondo
            de la página, que es lo que lo despega del degradado azul del
            botón en los dos temas. */}
        {sinLeer && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute", top: 2, right: 2,
              width: 13, height: 13, borderRadius: "50%",
              background: t.coral, border: `2.5px solid ${t.page}`,
            }}
          />
        )}
      </button>
    );
  }

  return (
    <section
      role="dialog"
      aria-label="Asistente de planta"
      style={{
        position: "fixed", right: 24, bottom: 24, zIndex: 60,
        width: "min(420px, calc(100vw - 48px))", height: "min(560px, calc(100vh - 48px))",
        display: "flex", flexDirection: "column",
        background: t.panel, border: `1px solid ${t.border}`, borderRadius: 14,
        boxShadow: t.shadowHover, overflow: "hidden",
      }}
    >
      <header
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 14px", borderBottom: `1px solid ${t.border}`,
        }}
      >
        <Bot size={17} color={t.accent} />
        <strong style={{ flex: 1, fontSize: 13.5, color: t.text }}>Asistente de planta</strong>

        <button
          type="button" onClick={limpiar} disabled={ocupado || !mensajes.length}
          aria-label="Borrar la conversación" title="Borrar la conversación"
          style={botonIcono(t, ocupado || !mensajes.length)}
        >
          <Trash2 size={15} />
        </button>
        <button
          type="button" onClick={() => setAbierto(false)}
          aria-label="Cerrar el asistente" style={botonIcono(t, false)}
        >
          <X size={16} />
        </button>
      </header>

      {/* El envoltorio existe para poder colgar el botón de «ir al final»
          encima del hilo: dentro del contenedor con scroll se desplazaría
          junto al texto, que es justo lo contrario de lo que hace falta. */}
      <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex" }}>
        <div
          ref={hiloRef}
          onScroll={alDesplazar}
          style={{ flex: 1, overflowY: "auto", padding: 14, display: "grid", gap: 12, alignContent: "start" }}
        >
          {!mensajes.length && <Bienvenida t={t} ocupado={ocupado} onPreguntar={preguntarEjemplo} />}

          {mensajes.map((m, i) => (
            <Turno
              key={i}
              mensaje={m}
              t={t}
              // Solo el último turno se puede repetir: ver `reintentar()`.
              puedeReintentar={i === mensajes.length - 1 && !ocupado && Boolean(m.error || m.cancelado)}
              onReintentar={() => { setAnclado(true); reintentar(); }}
              ocupado={ocupado}
              onPreguntar={preguntarEjemplo}
            />
          ))}

          {estado && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: t.textSoft }}>
              <Loader2 size={13} className="spin" />
              {/* El aria-live abarca solo las palabras del estado. Con los
                  segundos dentro, un lector de pantalla cantaría el contador
                  una vez por segundo durante minuto y medio. */}
              <span aria-live="polite">{estado}</span>
              {segundos > 0 && <span aria-hidden="true" style={{ color: t.textFaint }}>· {segundos} s</span>}
            </div>
          )}

          <div ref={finRef} />
        </div>

        {/* Sin `app-btn`: su hover es un `transform`, y aquí el transform ya
            está ocupado centrando el botón, así que al pasar por encima se
            descolocaría media anchura hacia la izquierda. */}
        {!anclado && Boolean(mensajes.length) && (
          <button
            type="button" onClick={irAlFinal}
            aria-label="Ir al final de la conversación"
            style={botonBajar(t)}
          >
            <ArrowDown size={13} /> Ir al final
          </button>
        )}
      </div>

      <form
        onSubmit={enviar}
        style={{ display: "flex", gap: 8, padding: 12, borderTop: `1px solid ${t.border}` }}
      >
        <input
          ref={campoRef}
          value={borrador}
          onChange={(e) => setBorrador(e.target.value)}
          placeholder={ocupado ? "Esperando respuesta…" : SUGERENCIAS[ejemplo]}
          disabled={ocupado}
          aria-label="Escribe tu pregunta"
          style={{
            flex: 1, minWidth: 0, fontSize: 13, padding: "9px 12px", borderRadius: 9,
            border: `1px solid ${t.border}`, background: t.page, color: t.text,
            fontFamily: "'Inter', sans-serif",
          }}
        />

        {ocupado ? (
          <button type="button" onClick={cancelar} className="app-btn" style={botonCancelar(t)}>
            Cancelar
          </button>
        ) : (
          <button
            type="submit" className="app-btn" aria-label="Enviar la pregunta"
            disabled={!borrador.trim()}
            style={botonEnviar(t, !borrador.trim())}
          >
            <Send size={15} />
          </button>
        )}
      </form>
    </section>
  );
}

/**
 * Lo primero que se ve. Dice qué se puede preguntar y, sobre todo, qué NO:
 * que solo algunas máquinas tienen historia es la limitación con la que se
 * tropieza cualquiera en la segunda pregunta.
 *
 * Los ejemplos van como botones y no como prosa porque son, literalmente, las
 * cuatro cosas que este asistente sabe hacer: leídos se olvidan, pulsados se
 * aprenden.
 */
function Bienvenida({ t, ocupado, onPreguntar }) {
  return (
    <div style={{ fontSize: 12.5, color: t.textSoft, lineHeight: 1.6 }}>
      Pregunta por el estado de una máquina o por el OEE de un día pasado.
      <div style={{ marginTop: 8, color: t.textFaint }}>
        Las respuestas salen de ICONICS, no de la memoria del modelo. Los datos
        históricos solo existen para algunas máquinas; si preguntas por otra, te
        lo dirá en vez de inventarlo.
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
          className="chip app-btn" style={estiloChip(t, ocupado)}
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
  const procedencia = mensaje.herramienta && !mensaje.error
    ? [
        ETIQUETA_HERRAMIENTA[mensaje.herramienta] ?? mensaje.herramienta,
        ...describirConsulta(mensaje.herramienta, mensaje.argumentos),
      ].join(" · ")
    : "";

  return (
    <div style={{ maxWidth: "92%" }}>
      {hayBurbuja && (
        <div
          style={{
            background: t.hover, color: t.text, fontSize: 13, lineHeight: 1.6,
            padding: "10px 12px", borderRadius: "10px 10px 10px 2px", whiteSpace: "pre-wrap",
          }}
        >
          {mensaje.texto || "…"}
        </div>
      )}

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
        <button type="button" onClick={onReintentar} className="app-btn" style={botonReintentar(t)}>
          <RotateCw size={12} /> Reintentar
        </button>
      )}

      {(procedencia || mensaje.texto) && (
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: t.textFaint, lineHeight: 1.45 }}>
            {procedencia}
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

const botonEnviar = (t, deshabilitado) => ({
  display: "grid", placeItems: "center", width: 38, borderRadius: 9, border: "none",
  background: deshabilitado ? t.hover : t.gradAccent,
  color: deshabilitado ? t.textFaint : "#FFFFFF",
  cursor: deshabilitado ? "default" : "pointer",
});

const botonCancelar = (t) => ({
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
