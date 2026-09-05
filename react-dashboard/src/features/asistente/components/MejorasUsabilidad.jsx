import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2, Clock3, Database, Keyboard, Search, ShieldCheck,
  SlidersHorizontal, Sparkles, Star, Volume2, X,
} from "lucide-react";
import { idDeMensaje, resumirRespuesta } from "../lib/usabilidad.js";
import { pedir } from "@/lib/api/pedir.js";

const MONO = "'IBM Plex Mono', monospace";
const SANS = "'Plus Jakarta Sans', sans-serif";

function useEstadoOperativo() {
  const [estado, setEstado] = useState({ cargando: true, error: null, datos: null });
  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      try {
        const respuesta = await pedir("/api/health");
        const datos = await respuesta.json();
        if (vivo) setEstado({ cargando: false, error: respuesta.ok ? null : datos?.reason ?? "Sin conexión", datos });
      } catch (error) {
        if (vivo) setEstado({ cargando: false, error: error.message, datos: null });
      }
    };
    cargar();
    const id = setInterval(cargar, 30000);
    return () => { vivo = false; clearInterval(id); };
  }, []);
  return estado;
}

function Chip({ children, color, fondo, title }) {
  return (
    <span title={title} style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 8px",
      borderRadius: 999, color, background: fondo, font: `600 11px ${SANS}`,
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

export function BarraOperativa({ t, estado, modoTactil, setModoTactil, onBuscar, onGuia, onAtajos, onVocabulario }) {
  const d = estado.datos;
  const entorno = !d ? "ENTORNO DESCONOCIDO" : d.simulated ? "SIMULACIÓN" : "PLANTA REAL";
  const entornoColor = !d ? t.textSoft : d.simulated ? t.amber : t.success;
  const entornoFondo = !d ? t.hover : d.simulated ? t.amberSoft : t.successSoft;
  const disponible = d?.status === "ok";

  return (
    <section aria-label="Estado y accesos rápidos" style={{
      display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap",
      padding: "7px max(16px, calc(50% - 380px))", borderBottom: `1px solid ${t.border}`,
      background: t.page,
    }}>
      <Chip color={entornoColor} fondo={entornoFondo} title="Origen de los datos que se muestran">
        <Database size={12} /> {estado.cargando ? "COMPROBANDO" : entorno}
      </Chip>
      <Chip color={!d ? t.textSoft : d.readOnly ? t.textSoft : t.coral} fondo={!d || d.readOnly ? t.hover : t.coralSoft}>
        <ShieldCheck size={12} /> {!d ? "MODO DESCONOCIDO" : d.readOnly ? "SOLO LECTURA" : "CONTROL HABILITADO"}
      </Chip>
      <Chip color={estado.cargando ? t.textSoft : disponible ? t.success : t.coral} fondo={estado.cargando ? t.hover : disponible ? t.successSoft : t.coralSoft}>
        <CheckCircle2 size={12} /> {estado.cargando ? "COMPROBANDO ICONICS" : disponible ? "ICONICS DISPONIBLE" : "ICONICS SIN RESPUESTA"}
      </Chip>
      {d?.timestamp && (
        <span style={{ color: t.textFaint, font: `11px ${MONO}` }} title={new Date(d.timestamp).toLocaleString()}>
          verificado {new Date(d.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
      {d?.capabilities && (
        <span aria-label="Capacidades disponibles" style={{ display: "inline-flex", gap: 5, flexWrap: "wrap" }}>
          {[
            ["IA", d.capabilities.assistant], ["Voz", d.capabilities.voice],
            ["Manuales", d.capabilities.manuals], ["Semántica", d.capabilities.semanticSearch],
            ["Carga", d.capabilities.manualUpload], ["PDF", d.capabilities.conversationExport],
          ].map(([nombre, activo]) => <span key={nombre} title={`${nombre}: ${activo ? "disponible" : "no configurado"}`} style={{ color: activo ? t.success : t.textFaint, font: `10.5px ${MONO}` }}>● {nombre}</span>)}
        </span>
      )}
      <div style={{ flex: 1 }} />
      {[
        [onGuia, <Sparkles size={13} />, "Pregunta guiada"],
        [onBuscar, <Search size={13} />, "Buscar"],
        [onVocabulario, <Volume2 size={13} />, "Vocabulario"],
        [onAtajos, <Keyboard size={13} />, "Atajos"],
      ].map(([accion, icono, texto]) => (
        <button key={texto} type="button" onClick={accion} className="eva-asis-boton eva-asis-utilidad" style={botonUtilidad(t)}>
          {icono}{texto}
        </button>
      ))}
      <button
        type="button" aria-pressed={modoTactil} onClick={() => setModoTactil((v) => !v)}
        className="eva-asis-boton eva-asis-utilidad" style={{ ...botonUtilidad(t), ...(modoTactil ? { color: t.accent, borderColor: t.accent, background: t.accentSoft } : null) }}
      >
        <SlidersHorizontal size={13} /> Modo guantes
      </button>
      {estado.error && <span role="status" style={{ width: "100%", color: t.coral, font: `11px ${MONO}` }}>{estado.error}</span>}
    </section>
  );
}

const botonUtilidad = (t) => ({
  display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 8px",
  borderRadius: 8, border: `1px solid ${t.border}`, background: t.panel,
  color: t.textSoft, cursor: "pointer", font: `600 11px ${SANS}`,
});

const INTENCIONES = {
  estado: ({ sistema }) => `¿Cómo está ${sistema === "vibraciones" ? "el sistema de vibraciones" : "el tanque"} ahora mismo?`,
  historia: ({ sistema, periodo }) => `Muéstrame la evolución de las señales principales de ${sistema === "vibraciones" ? "vibraciones" : "el tanque"} durante ${periodo}.`,
  riesgos: ({ sistema }) => `¿Qué riesgos están activos en ${sistema === "vibraciones" ? "el sistema de vibraciones" : "el tanque"} y qué debería revisar primero?`,
  diagnostico: ({ sistema, periodo }) => `Diagnostica el problema más importante de ${sistema === "vibraciones" ? "vibraciones" : "el tanque"} usando el estado actual, ${periodo} de historia, manuales y casos anteriores.`,
  manual: ({ sistema }) => `¿Qué dicen los manuales sobre los límites y revisiones de ${sistema === "vibraciones" ? "vibraciones" : "el tanque"}?`,
  reporte: ({ sistema, periodo }) => `Genera un reporte de ${sistema === "vibraciones" ? "vibraciones" : "el tanque"} para ${periodo}, con hallazgos, riesgos y procedencia.`,
};

export function ConsultaGuiada({ t, onPreparar, cerrar }) {
  const [sistema, setSistema] = useState("tanque");
  const [intencion, setIntencion] = useState("estado");
  const [periodo, setPeriodo] = useState("las últimas 6 horas");
  const pregunta = INTENCIONES[intencion]({ sistema, periodo });

  return (
    <PanelFlotante t={t} titulo="Preparar una pregunta" cerrar={cerrar}>
      <div className="eva-asis-guia-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
        <CampoSelect label="Sistema" value={sistema} setValue={setSistema} opciones={[["tanque", "Tanque"], ["vibraciones", "Vibraciones"]]} t={t} />
        <CampoSelect label="Qué necesitas" value={intencion} setValue={setIntencion} opciones={[["estado", "Estado actual"], ["historia", "Histórico"], ["riesgos", "Riesgos"], ["diagnostico", "Diagnóstico"], ["manual", "Manuales"], ["reporte", "Reporte"]]} t={t} />
        <CampoSelect label="Periodo" value={periodo} setValue={setPeriodo} opciones={[["la última hora", "Última hora"], ["las últimas 6 horas", "Últimas 6 horas"], ["hoy", "Hoy"], ["esta semana", "Esta semana"]]} t={t} />
        <button type="button" onClick={() => { onPreparar(pregunta); cerrar(); }} className="eva-asis-boton" style={{ ...botonUtilidad(t), minHeight: 36, color: "#fff", background: t.gradAccent, border: "none" }}>
          Preparar
        </button>
      </div>
      <p style={{ margin: "9px 0 0", color: t.textSoft, font: `12px/1.45 ${SANS}` }}>{pregunta}</p>
    </PanelFlotante>
  );
}

function CampoSelect({ label, value, setValue, opciones, t }) {
  return <label style={{ display: "grid", gap: 4, color: t.textFaint, font: `11px ${MONO}` }}>{label}
    <select value={value} onChange={(e) => setValue(e.target.value)} style={{ minWidth: 0, padding: "7px 8px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.hover, color: t.text, font: `12px ${SANS}` }}>
      {opciones.map(([v, texto]) => <option value={v} key={v}>{texto}</option>)}
    </select>
  </label>;
}

export function PanelBusqueda({ t, mensajes, marcados, busqueda, setBusqueda, soloMarcados, setSoloMarcados, irA, cerrar }) {
  const resultados = useMemo(() => mensajes.map((m, indice) => ({ ...m, indice })).filter((m) => {
    const coincide = !busqueda.trim() || m.texto?.toLowerCase().includes(busqueda.trim().toLowerCase());
    return coincide && (!soloMarcados || marcados.includes(idDeMensaje(m, m.indice)));
  }), [mensajes, busqueda, soloMarcados, marcados]);

  return (
    <PanelFlotante t={t} titulo="Buscar en la conversación" cerrar={cerrar}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 260px" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: t.textFaint }} />
          <input autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Señal, activo, causa o fecha…" style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 30px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.hover, color: t.text }} />
        </div>
        <button type="button" aria-pressed={soloMarcados} onClick={() => setSoloMarcados((v) => !v)} className="eva-asis-boton" style={{ ...botonUtilidad(t), ...(soloMarcados ? { color: t.accent, borderColor: t.accent, background: t.accentSoft } : null) }}>
          <Star size={13} fill={soloMarcados ? "currentColor" : "none"} /> Marcados
        </button>
        <span style={{ color: t.textFaint, font: `11px ${MONO}` }}>{resultados.length} resultado(s)</span>
      </div>
      {busqueda.trim() && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", marginTop: 8 }}>
          {resultados.slice(0, 12).map((m) => <button key={m.indice} type="button" onClick={() => irA(m.indice)} style={{ ...botonUtilidad(t), maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.rol === "usuario" ? "Pregunta" : "Respuesta"}: {m.texto}</button>)}
        </div>
      )}
    </PanelFlotante>
  );
}

export function PanelVocabulario({ t, valor, setValor, cerrar }) {
  return (
    <PanelFlotante t={t} titulo="Vocabulario de voz" cerrar={cerrar}>
      <label style={{ display: "grid", gap: 5, color: t.textSoft, font: `12px ${SANS}` }}>
        Términos propios que Whisper debe reconocer
        <input value={valor} maxLength={240} onChange={(e) => setValor(e.target.value)} placeholder="Ej. Cerabar, aPico, rodamiento 6206" style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.hover, color: t.text }} />
      </label>
      <p style={{ margin: "6px 0 0", color: t.textFaint, font: `11px/1.4 ${MONO}` }}>Se guarda únicamente en este equipo y se añade al contexto de transcripción.</p>
    </PanelFlotante>
  );
}

export function PanelAtajos({ t, cerrar }) {
  return <PanelFlotante t={t} titulo="Atajos de teclado" cerrar={cerrar}>
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "7px 12px", color: t.textSoft, font: `12px ${SANS}` }}>
      {[['/', 'Escribir una pregunta'], ['Ctrl + Enter', 'Enviar'], ['Ctrl + K', 'Buscar en el hilo'], ['Esc', 'Cerrar un panel'], ['?', 'Mostrar estos atajos']].map(([tecla, texto]) => <div key={tecla} style={{ display: "contents" }}><kbd style={{ font: `11px ${MONO}`, color: t.text, background: t.hover, border: `1px solid ${t.border}`, borderRadius: 5, padding: "2px 6px" }}>{tecla}</kbd><span>{texto}</span></div>)}
    </div>
  </PanelFlotante>;
}

function PanelFlotante({ t, titulo, cerrar, children }) {
  return <section style={{ padding: "12px max(16px, calc(50% - 380px))", borderBottom: `1px solid ${t.border}`, background: t.panel }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}><strong style={{ color: t.text, font: `600 13px ${SANS}` }}>{titulo}</strong><div style={{ flex: 1 }} /><button type="button" onClick={cerrar} aria-label={`Cerrar ${titulo}`} style={{ border: 0, background: "transparent", color: t.textFaint, cursor: "pointer" }}><X size={15} /></button></div>
    {children}
  </section>;
}

export function ComparacionMarcados({ t, mensajes, marcados, irA }) {
  const elegidos = mensajes.map((m, indice) => ({ ...m, indice })).filter((m) => m.rol === "asistente" && marcados.includes(idDeMensaje(m, m.indice))).slice(-2);
  if (elegidos.length !== 2) return null;
  return <section style={{ maxWidth: "760px", width: "100%", border: `1px solid ${t.border}`, borderRadius: 12, background: t.panel, padding: 12 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, color: t.text, font: `600 12px ${SANS}` }}><Clock3 size={13} /> Comparación de hallazgos marcados</div>
    <div className="eva-asis-comparacion" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {elegidos.map((m, i) => <button key={m.indice} type="button" onClick={() => irA(m.indice)} style={{ textAlign: "left", border: `1px solid ${t.border}`, borderRadius: 9, background: t.hover, padding: 10, color: t.text, cursor: "pointer" }}><strong style={{ display: "block", marginBottom: 4, color: i ? t.success : t.textSoft, font: `600 11px ${MONO}` }}>{i ? "DESPUÉS" : "ANTES"}</strong><span style={{ font: `12px/1.45 ${SANS}` }}>{resumirRespuesta(m.texto)}</span></button>)}
    </div>
  </section>;
}

function accionesPara(mensaje) {
  const nombres = new Set((mensaje.consultas ?? []).map((c) => c.nombre));
  const acciones = [];
  if (nombres.has("estado_del_sistema")) acciones.push("Muéstrame el histórico de la señal más preocupante durante las últimas 6 horas.");
  if (nombres.has("riesgos_activos")) acciones.push("Diagnostica el riesgo activo con mayor severidad usando manuales y casos anteriores.");
  if (nombres.has("diagnosticar_falla") || nombres.has("diagnostico")) acciones.push("¿Qué comprobación segura debería hacer primero para confirmar la causa?");
  if (nombres.has("consultar_documentacion") || nombres.has("limites_del_manual")) acciones.push("Compara esos límites del manual con los valores actuales de la máquina.");
  if (nombres.has("historia_de_senal") || nombres.has("analisis_de_senal")) acciones.push("Genera un gráfico de esa señal para el mismo periodo.");
  if (acciones.length < 2) acciones.push("Hazme un resumen operativo con el hallazgo, la evidencia y el siguiente paso.");
  return [...new Set(acciones)].slice(0, 3);
}

export function AccionesSugeridas({ t, mensaje, onPreguntar }) {
  return <div aria-label="Siguientes acciones" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
    {accionesPara(mensaje).map((texto) => <button key={texto} type="button" onClick={() => onPreguntar(texto)} className="eva-asis-boton" style={{ padding: "6px 9px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.panel, color: t.textSoft, cursor: "pointer", font: `600 11px ${SANS}`, textAlign: "left" }}>{texto}</button>)}
  </div>;
}

export default function ControlesUsabilidad({
  t, modoTactil, setModoTactil, panel, alternarPanel, cerrarPanel,
  mensajes, marcados, busqueda, setBusqueda, soloMarcados, setSoloMarcados,
  irA, preparar, vocabulario, setVocabulario,
}) {
  const estado = useEstadoOperativo();
  return <>
    <BarraOperativa
      t={t} estado={estado} modoTactil={modoTactil} setModoTactil={setModoTactil}
      onBuscar={() => alternarPanel("buscar")} onGuia={() => alternarPanel("guia")}
      onAtajos={() => alternarPanel("atajos")} onVocabulario={() => alternarPanel("vocabulario")}
    />
    {panel === "guia" && <ConsultaGuiada t={t} onPreparar={preparar} cerrar={cerrarPanel} />}
    {panel === "buscar" && <PanelBusqueda t={t} mensajes={mensajes} marcados={marcados} busqueda={busqueda} setBusqueda={setBusqueda} soloMarcados={soloMarcados} setSoloMarcados={setSoloMarcados} irA={irA} cerrar={cerrarPanel} />}
    {panel === "vocabulario" && <PanelVocabulario t={t} valor={vocabulario} setValor={setVocabulario} cerrar={cerrarPanel} />}
    {panel === "atajos" && <PanelAtajos t={t} cerrar={cerrarPanel} />}
  </>;
}
