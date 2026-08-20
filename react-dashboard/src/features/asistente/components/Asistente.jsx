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
 */
import { useEffect, useRef, useState } from "react";
import {
  ArrowDown, Ban, Bell, Bot, Check, ChevronDown, ChevronRight, Copy, Loader2, Mic,
  MicOff, PhoneCall, PhoneOff, RotateCw, Send, Square, Trash2, TriangleAlert, X,
} from "lucide-react";
import { useTheme } from "@/theme";
import {
  ETIQUETA_HERRAMIENTA, describirConsulta, useAsistente, useDictado, useManosLibres,
} from "../lib/useAsistente.js";
import { nivelDeSeveridad, preguntaDeDiagnostico, useAlarmas } from "../lib/useAlarmas.js";

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
 *
 * ── EL CUARTO DICE «HACE SEIS HORAS» Y NO «HACE SEIS» ──────────────
 *
 * Probado contra el modelo: con el ejemplo escrito «…con la de hace seis», el
 * 4B copió literalmente `periodoB: "hace seis"` —hace lo correcto, que es
 * pasar el texto tal cual— y el resolvedor no tenía forma de saber seis QUÉ.
 * El ejemplo fallaba al pulsarlo, que es justo lo que un ejemplo no puede
 * hacer. El sustantivo se queda.
 */
/**
 * Cómo se llama el asistente de cara al usuario.
 *
 * En una constante y no repartido por el archivo, porque el nombre de un
 * producto cambia: ya pasó una vez —era «Asistente de la instalación»— y
 * estaba escrito en cinco sitios entre rótulos y etiquetas de accesibilidad,
 * de los que se actualizaron cuatro. Un lector de pantalla anunciando un
 * nombre distinto del que se ve escrito es un fallo difícil de detectar
 * mirando la pantalla.
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

  const dictado = useDictado();
  const { activas: alarmas } = useAlarmas();

  // El manos libres necesita el ÚLTIMO turno del asistente para leerlo en voz
  // alta cuando esté completo. Se le pasa el mensaje entero y no sólo el texto
  // porque también mira si acabó en error: un fallo no se lee como si fuera un
  // dato. Ver `useManosLibres`.
  const manosLibres = useManosLibres({
    preguntar,
    ocupado,
    ultimaRespuesta: mensajes.at(-1)?.rol === "asistente" ? mensajes.at(-1) : null,
  });

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
        aria-label={sinLeer ? `Abrir ${NOMBRE}. La respuesta está lista.` : `Abrir ${NOMBRE}`}
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
            botón en los dos temas.

            Dos avisos distintos, y NO comparten forma. Un punto es «tu
            respuesta está lista»; el número es «la planta tiene alarmas
            disparadas». Con el mismo indicador para los dos, quien vuelve al
            tablero y ve una marca no sabría si le contestaron o si algo se ha
            roto — y son cosas que se atienden de forma muy distinta. La alarma
            tiene prioridad si coinciden: importa más que la planta esté en
            alarma que el que haya una respuesta esperando. */}
        {alarmas.length > 0 ? (
          <span
            aria-label={`${alarmas.length} alarma${alarmas.length === 1 ? "" : "s"} activa${alarmas.length === 1 ? "" : "s"}`}
            style={{
              position: "absolute", top: -3, right: -3,
              minWidth: 19, height: 19, padding: "0 5px", borderRadius: 10,
              background: t.coral, color: "#FFFFFF",
              border: `2.5px solid ${t.page}`,
              fontSize: 10.5, fontWeight: 700, lineHeight: "14px",
              display: "grid", placeItems: "center",
            }}
          >
            {alarmas.length}
          </span>
        ) : sinLeer && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute", top: 2, right: 2,
              width: 13, height: 13, borderRadius: "50%",
              background: t.accent, border: `2.5px solid ${t.page}`,
            }}
          />
        )}
      </button>
    );
  }

  return (
    <section
      role="dialog"
      aria-label={NOMBRE}
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
        <strong style={{ flex: 1, fontSize: 13.5, color: t.text }}>{NOMBRE}</strong>

        <button
          type="button" onClick={limpiar} disabled={ocupado || !mensajes.length}
          aria-label="Borrar la conversación" title="Borrar la conversación"
          style={botonIcono(t, ocupado || !mensajes.length)}
        >
          <Trash2 size={15} />
        </button>
        <button
          type="button" onClick={() => setAbierto(false)}
          aria-label={`Cerrar ${NOMBRE}`} style={botonIcono(t, false)}
        >
          <X size={16} />
        </button>
      </header>

      {alarmas.length > 0 && (
        <PanelAlarmas t={t} alarmas={alarmas} ocupado={ocupado} onDiagnosticar={lanzar} />
      )}

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
          placeholder={
            manosLibres.activo
              ? FASE_MANOS_LIBRES[manosLibres.fase]
              : ocupado ? "Esperando respuesta…" : SUGERENCIAS[ejemplo]
          }
          disabled={ocupado || manosLibres.activo}
          aria-label="Escribe tu pregunta"
          style={{
            flex: 1, minWidth: 0, fontSize: 13, padding: "9px 12px", borderRadius: 9,
            border: `1px solid ${t.border}`, background: t.page, color: t.text,
            fontFamily: "'Inter', sans-serif",
          }}
        />

        {/* El micrófono sólo aparece si el servidor tiene whisper Y el navegador
            puede grabar. Un botón que siempre falla es peor que no tenerlo. */}
        {dictado.disponible && !ocupado && !manosLibres.activo && (
          <BotonMicrofono t={t} dictado={dictado} onTexto={anadirAlBorrador} />
        )}

        {/* El manos libres exige además que el navegador sepa hablar. */}
        {manosLibres.disponible && (
          <BotonManosLibres t={t} manosLibres={manosLibres} />
        )}

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

      {/* El fallo del dictado se cuenta bajo la barra y NO como un turno del
          hilo: no llegó a haber pregunta, así que meterlo en la conversación
          la ensuciaría con algo que nadie llegó a preguntar. */}
      {dictado.error && (
        <div style={{ padding: "0 12px 10px", fontSize: 11, color: t.coral, lineHeight: 1.45 }}>
          {dictado.error}
        </div>
      )}

      {/*
        Por qué NO están los botones de voz.

        Sólo se dice cuando el SERVIDOR sí tiene la voz configurada: si no la
        tiene, el operador no ha pedido esta función y explicarle una carencia
        que no le afecta es ruido. Cuando sí la tiene y aun así no aparece el
        micrófono, la causa es del navegador —casi siempre abrir el tablero por
        HTTP desde otro equipo— y sin este aviso desaparece un botón sin que
        nadie sepa por qué. Se acaba revisando whisper-server, el `.env.local`
        y los permisos del micrófono para descubrir que bastaba con escribir
        «localhost».
      */}
      {dictado.disponible === false && dictado.impedimento && (
        <div
          style={{
            display: "flex", gap: 7, alignItems: "flex-start",
            padding: "0 12px 10px", fontSize: 11,
            color: t.textSoft, lineHeight: 1.45,
          }}
        >
          <MicOff size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{dictado.impedimento}</span>
        </div>
      )}
    </section>
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
        style={botonMicro(t, "transcribiendo")}
      >
        <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
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
      type="button" onClick={alPulsar} className="app-btn"
      aria-label={grabando ? "Parar de grabar y transcribir" : "Dictar la pregunta"}
      title={grabando ? "Parar y transcribir" : "Dictar la pregunta"}
      style={botonMicro(t, grabando ? "grabando" : "listo")}
    >
      {grabando ? <Square size={13} fill="currentColor" /> : <Mic size={15} />}
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
        type="button" onClick={encender} className="app-btn"
        aria-label={`Hablar con ${NOMBRE} en manos libres`}
        title="Manos libres: hablar y escuchar la respuesta"
        style={botonMicro(t, "listo")}
      >
        <PhoneCall size={15} />
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
        type="button" onClick={cerrarTurno} className="app-btn"
        aria-label="He terminado de hablar"
        title="Te escucho. Se envía solo al callarte, o pulsa para enviar ya."
        style={{ ...botonMicro(t, "grabando"), position: "relative" }}
      >
        <span
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0, borderRadius: 9,
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
      type="button" onClick={apagar} className="app-btn"
      aria-label="Salir del manos libres"
      title="Colgar"
      style={botonMicro(t, "grabando")}
    >
      {transcribiendo
        ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
        : <PhoneOff size={15} />}
    </button>
  );
}

/**
 * El micrófono, en sus tres estados.
 *
 * Grabando va en rojo y con un cuadrado —el símbolo universal de «parar»— y no
 * con otro micrófono: el problema real de un botón que conmuta es que, si no
 * cambia de forma, no se sabe si está escuchando. El color solo no basta en
 * una pantalla de planta con reflejos.
 */
function botonMicro(t, estado) {
  const base = {
    display: "grid", placeItems: "center", width: 36, borderRadius: 9,
    border: `1px solid ${t.border}`, cursor: "pointer", flexShrink: 0,
  };

  if (estado === "grabando") {
    return { ...base, background: t.coralSoft, color: t.coral, borderColor: t.coral };
  }
  if (estado === "transcribiendo") {
    return { ...base, background: t.page, color: t.textFaint, cursor: "default" };
  }
  return { ...base, background: t.page, color: t.textSoft };
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
    <div style={{ fontSize: 12.5, color: t.textSoft, lineHeight: 1.6 }}>
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
        <button type="button" onClick={onReintentar} className="app-btn" style={botonReintentar(t)}>
          <RotateCw size={12} /> Reintentar
        </button>
      )}

      {(consultas.length > 0 || mensaje.texto) && (
        <div style={{ marginTop: 6, display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: t.textFaint, lineHeight: 1.45 }}>
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
 * Las alarmas disparadas, arriba del hilo, con un botón para preguntar por qué.
 *
 * ── POR QUÉ AQUÍ Y NO COMO UN TURNO DEL CHAT ───────────────────────
 *
 * Se pensó en inyectar la alarma como un mensaje más de la conversación, y es
 * peor por dos motivos. Uno: el hilo se guarda, así que una alarma que ya se
 * fue seguiría ahí mañana contando algo que dejó de ser cierto. Dos: una
 * conversación se lee de arriba abajo y una alarma no es un turno de nadie —
 * mezclarla con las preguntas del operador convierte el historial en un sitio
 * donde ya no se distingue lo que uno preguntó de lo que la planta avisó.
 *
 * Como panel fijo refleja SIEMPRE el estado de ahora, que es lo único que este
 * servidor puede saber: no hay registro histórico de alarmas.
 *
 * ── PULSAR PREGUNTA, NO ABRE UN DETALLE ────────────────────────────
 *
 * La acción de una alarma es «¿por qué?», y eso es exactamente una pregunta al
 * asistente. Abrir una ficha con más campos del evento no ayudaría: el operador
 * no necesita el `@SubConditionName`, necesita saber qué pasó.
 */
function PanelAlarmas({ t, alarmas, ocupado, onDiagnosticar }) {
  // Abierto de entrada: una alarma que aparece plegada es una alarma que nadie
  // ve. Se puede cerrar para que no coma sitio del hilo si son varias.
  const [abierto, setAbierto] = useState(true);

  const plural = alarmas.length === 1 ? "alarma activa" : "alarmas activas";

  return (
    <section
      aria-label="Alarmas de la instalación"
      style={{
        borderBottom: `1px solid ${t.border}`,
        background: t.coralSoft,
        flexShrink: 0,
        maxHeight: "42%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        style={{
          display: "flex", alignItems: "center", gap: 7, width: "100%",
          padding: "8px 12px", border: "none", background: "transparent",
          color: t.coral, fontSize: 12, fontWeight: 600, cursor: "pointer",
          fontFamily: "inherit", textAlign: "left",
        }}
      >
        {abierto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Bell size={13} />
        <span style={{ flex: 1 }}>{alarmas.length} {plural}</span>
      </button>

      {abierto && (
        <div style={{ overflowY: "auto", padding: "0 10px 10px" }}>
          {alarmas.map((a) => {
            const sev = nivelDeSeveridad(a.severidad);
            return (
              <div
                key={a.alarma}
                style={{
                  background: t.panel, border: `1px solid ${t.border}`,
                  borderRadius: 8, padding: "8px 10px", marginBottom: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <strong style={{ fontSize: 12.5, color: t.text, flex: 1, minWidth: 0 }}>
                    {a.alarma}
                  </strong>
                  <span
                    style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
                      color: sev.clave === "alta" ? t.coral : t.amber,
                    }}
                  >
                    {sev.label.toUpperCase()}
                  </span>
                </div>

                {/* La hora va SIEMPRE, y con fecha. Una alarma puede llevar
                    días activa —la de BAJO FLUJO de esta instalación lleva
                    tres— y sin la fecha se lee como que acaba de saltar. */}
                {a.desde && (
                  <div style={{ fontSize: 10.5, color: t.textFaint, marginTop: 2 }}>
                    Activa desde {a.desde}
                    {a.vigilaLaSenal ? ` · ${a.vigilaLaSenal}` : ""}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => onDiagnosticar(preguntaDeDiagnostico(a))}
                  disabled={ocupado}
                  className="app-btn"
                  style={{
                    marginTop: 7, padding: "4px 9px", fontSize: 11,
                    borderRadius: 6, cursor: ocupado ? "default" : "pointer",
                    border: `1px solid ${t.border}`,
                    background: ocupado ? t.page : t.hover,
                    color: ocupado ? t.textFaint : t.text,
                    fontFamily: "inherit",
                  }}
                >
                  ¿Por qué se disparó?
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
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
