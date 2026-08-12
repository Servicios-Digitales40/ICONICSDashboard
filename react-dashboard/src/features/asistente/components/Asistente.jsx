/**
 * El asistente: un botón flotante y el panel de conversación.
 *
 * ── QUÉ MANDA EN ESTE DISEÑO ───────────────────────────────────────
 *
 * Que una respuesta tarda entre 30 y 90 segundos. De ahí salen tres cosas que
 * parecen decoración y no lo son:
 *
 *  - El estado se dice con PALABRAS («Consultando ICONICS…»), no con una
 *    barra indeterminada. Una barra girando un minuto no informa de nada; el
 *    nombre del paso además delata dónde se atascó cuando algo falla.
 *  - Siempre se puede cancelar. Un minuto de espera sin salida es peor que
 *    un error.
 *  - Debajo de cada respuesta se dice DE DÓNDE salió el dato. Es lo que
 *    permite al operador detectar una respuesta recitada de memoria.
 *
 * No se monta si el servidor no tiene asistente configurado, y su caída no
 * puede tocar ninguna vista del tablero: es estrictamente aditivo.
 */
import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send, Trash2, TriangleAlert, X } from "lucide-react";
import { useTheme } from "@/theme";
import { ETIQUETA_HERRAMIENTA, useAsistente } from "../lib/useAsistente.js";

export function Asistente() {
  const { theme: t } = useTheme();
  const [abierto, setAbierto] = useState(false);
  const [borrador, setBorrador] = useState("");

  const { disponible, mensajes, estado, ocupado, preguntar, cancelar, limpiar } = useAsistente();

  const finRef = useRef(null);
  const campoRef = useRef(null);

  // Al llegar texto nuevo, el hilo se desplaza solo. Sin esto hay que
  // perseguir la respuesta con la rueda mientras se escribe.
  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [mensajes, estado]);

  useEffect(() => {
    if (abierto) campoRef.current?.focus();
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

  const enviar = (e) => {
    e?.preventDefault();
    if (!borrador.trim() || ocupado) return;
    preguntar(borrador);
    setBorrador("");
  };

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Abrir el asistente"
        style={{
          position: "fixed", right: 24, bottom: 24, zIndex: 60,
          width: 52, height: 52, borderRadius: "50%", border: "none", cursor: "pointer",
          background: t.gradAccent, color: "#FFFFFF",
          boxShadow: t.shadowHover,
          display: "grid", placeItems: "center",
        }}
      >
        <Bot size={22} />
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

      <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "grid", gap: 12, alignContent: "start" }}>
        {!mensajes.length && <Bienvenida t={t} />}
        {mensajes.map((m, i) => <Turno key={i} mensaje={m} t={t} />)}

        {estado && (
          <div
            aria-live="polite"
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: t.textSoft }}
          >
            <Loader2 size={13} className="spin" />
            {estado}
          </div>
        )}

        <div ref={finRef} />
      </div>

      <form
        onSubmit={enviar}
        style={{ display: "flex", gap: 8, padding: 12, borderTop: `1px solid ${t.border}` }}
      >
        <input
          ref={campoRef}
          value={borrador}
          onChange={(e) => setBorrador(e.target.value)}
          placeholder={ocupado ? "Esperando respuesta…" : "¿OEE de la Línea 1 el 25 de marzo de 2025?"}
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
 */
function Bienvenida({ t }) {
  return (
    <div style={{ fontSize: 12.5, color: t.textSoft, lineHeight: 1.6 }}>
      Pregunta por el estado de una máquina o por el OEE de un día pasado.
      <div style={{ marginTop: 8, color: t.textFaint }}>
        Las respuestas salen de ICONICS, no de la memoria del modelo. Los datos
        históricos solo existen para algunas máquinas; si preguntas por otra, te
        lo dirá en vez de inventarlo.
      </div>
    </div>
  );
}

function Turno({ mensaje, t }) {
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

  return (
    <div style={{ maxWidth: "92%" }}>
      <div
        style={{
          background: t.hover, color: t.text, fontSize: 13, lineHeight: 1.6,
          padding: "10px 12px", borderRadius: "10px 10px 10px 2px", whiteSpace: "pre-wrap",
        }}
      >
        {mensaje.texto || (mensaje.error ? "" : "…")}
      </div>

      {mensaje.error && (
        <Nota t={t} color={t.coral} fondo={t.coralSoft} icono={<TriangleAlert size={12} />}>
          {mensaje.error}
        </Nota>
      )}

      {/* La respuesta se bloqueó por venir sin herramienta. El aviso importa
          más que el texto: casi siempre significa llama-server sin --jinja. */}
      {mensaje.bloqueada && (
        <Nota t={t} color={t.amber} fondo={t.amberSoft} icono={<TriangleAlert size={12} />}>
          Respuesta bloqueada: el modelo no consultó los datos de la planta.
        </Nota>
      )}

      {/* De dónde salió el dato. Es la invariante que permite detectar una
          respuesta recitada: si no hay esta línea, no hubo consulta. */}
      {mensaje.herramienta && !mensaje.error && (
        <div style={{ marginTop: 6, fontSize: 11, color: t.textFaint }}>
          {ETIQUETA_HERRAMIENTA[mensaje.herramienta] ?? mensaje.herramienta}
        </div>
      )}
    </div>
  );
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
