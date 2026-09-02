/**
 * Vista «Controles» — encender/apagar la bomba desde un botón del tablero,
 * sin pasar por el asistente de IA.
 *
 * El endpoint (`POST /api/control/bomba`, `backend/routes/controlRoutes.mjs`)
 * llama a la MISMA herramienta que usa el chat (`controlar_bomba` en
 * `backend/ia/conversacion/herramientas.mjs`), así que esta pantalla hereda gratis sus dos
 * guardas —modo solo lectura, nivel de tanque alto— y su confirmación por
 * relectura. El nivel del tanque que se ve aquí es el mismo dato
 * (`useSistemaAgua`) que esa guarda del backend está mirando en el momento de
 * encender.
 *
 * Confirmación de dos pasos en el propio botón (sin modal: no hay
 * `ConfirmDialog` en el proyecto y crear uno para un solo botón sería
 * sobre-ingeniería): el primer clic pide confirmar, un segundo clic dentro de
 * una ventana de 4 s ejecuta la acción; cualquier otro caso (timeout, elegir
 * la otra acción) cancela la pendiente.
 */
import { useEffect, useRef, useState } from "react";
import { Power, PowerOff } from "lucide-react";

import { AlertBanner, Button, Panel, SectionLabel } from "@/components/ui/index.js";
import { useTheme } from "@/theme";

import { useSistemaAgua } from "../../data/hooks.js";
import { fmtSenal } from "../../lib/formato.js";
import { UltimaLectura } from "../../components/base.jsx";

const VENTANA_CONFIRMACION_MS = 4000;

function EstadoTanque({ sistema, lastUpdated, t }) {
  const senal = sistema.senales?.nivelTanque;
  return (
    <Panel title="Nivel del tanque" code="ac:TDCON/DEMO/SENSORES/NIVEL_TANQUE">
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: 34, fontWeight: 800, color: t.text, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          {fmtSenal(senal)}
        </span>
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 12.5, color: t.textFaint }}>
        Mismo dato que usa el servidor para decidir si puede encender la bomba.
      </p>
      <div style={{ marginTop: 10 }}>
        <UltimaLectura fecha={lastUpdated} t={t} />
      </div>
    </Panel>
  );
}

function BotonAccion({ accion, pendiente, cargando, onPedir, t }) {
  const esEncender = accion === "encender";
  const confirmando = pendiente === accion;
  const otroPendiente = pendiente && pendiente !== accion;

  return (
    <Button
      variant={esEncender ? "primary" : "danger-solid"}
      icon={esEncender ? <Power size={16} /> : <PowerOff size={16} />}
      loading={cargando && confirmando}
      disabled={cargando || otroPendiente}
      onClick={() => onPedir(accion)}
    >
      {confirmando
        ? esEncender
          ? "¿Confirmar encendido?"
          : "¿Confirmar apagado?"
        : esEncender
          ? "Encender bomba"
          : "Apagar bomba"}
    </Button>
  );
}

function ControlesTanque() {
  const { theme: t } = useTheme();
  const { sistema, lastUpdated } = useSistemaAgua();

  const [pendiente, setPendiente] = useState(null); // 'encender' | 'apagar' | null
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState(null); // { ok, mensaje } | null
  const timeoutRef = useRef(null);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  function pedirConfirmacion(accion) {
    if (pendiente === accion) {
      ejecutar(accion);
      return;
    }
    setPendiente(accion);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setPendiente(null), VENTANA_CONFIRMACION_MS);
  }

  async function ejecutar(accion) {
    clearTimeout(timeoutRef.current);
    setPendiente(null);
    setCargando(true);
    setResultado(null);
    try {
      const r = await fetch("/api/control/bomba", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ encender: accion === "encender" }),
      });
      const cuerpo = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(cuerpo?.error ?? `El servidor respondió ${r.status}.`);
      setResultado({ ok: true, mensaje: `Bomba ${cuerpo.accion}.` });
    } catch (e) {
      setResultado({ ok: false, mensaje: e.message });
    } finally {
      setCargando(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <EstadoTanque sistema={sistema} lastUpdated={lastUpdated} t={t} />

      <SectionLabel sub="Escribe directamente sobre ac:TDCON/DEMO/SENSORES/CONTROL, con las mismas guardas que el asistente">
        Bomba
      </SectionLabel>

      <Panel>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <BotonAccion accion="encender" pendiente={pendiente} cargando={cargando} onPedir={pedirConfirmacion} t={t} />
          <BotonAccion accion="apagar" pendiente={pendiente} cargando={cargando} onPedir={pedirConfirmacion} t={t} />
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 12, color: t.textFaint }}>
          Un primer clic pide confirmación; el segundo, dentro de unos segundos, ejecuta la acción.
        </p>
      </Panel>

      {resultado && (
        <AlertBanner
          type={resultado.ok ? "success" : "error"}
          title={resultado.ok ? "Acción aplicada" : "No se pudo accionar la bomba"}
          message={resultado.mensaje}
        />
      )}
    </div>
  );
}

export default ControlesTanque;
