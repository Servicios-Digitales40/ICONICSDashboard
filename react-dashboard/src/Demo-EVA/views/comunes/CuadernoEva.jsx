/**
 * Vista «Cuaderno» — notas de quien está delante de la máquina
 * (Plan 25 F8 · `NUE-10`).
 *
 * ── QUÉ ES, Y QUÉ NO ES ─────────────────────────────────────────────
 *
 * Lo que un operador escribiría en un cuaderno de papel: «cambié el filtro»,
 * «la bomba hace ruido al arrancar». Junto a los hechos del diario de
 * accionamientos (F1), pero **no es lo mismo**: el diario es lo que el SISTEMA
 * registró (una acción sobre un tag real, confirmada por relectura); esto es
 * lo que dice una PERSONA, sin que nada la confirme. Mezclarlos borraría esa
 * diferencia — el porqué completo está en la cabecera de
 * `backend/routes/cuadernoRoutes.mjs`.
 *
 * ── EL AUTOR Y LA HORA NO LOS PONE ESTA PANTALLA ────────────────────
 *
 * Los pone el servidor, en el momento de guardar. Este formulario ni siquiera
 * tiene un campo para «quién escribe» — no hay nada que enviar, porque
 * enviarlo sería la misma falsificación que el backend ya rechaza.
 *
 * ── UN FALLO AL GUARDAR SE DICE, Y LA NOTA NO SE PIERDE EN SILENCIO ──
 *
 * Al revés que un accionamiento sobre planta: aquí no hay «ya pasó» que
 * proteger, así que un fallo de guardado se muestra y el texto escrito
 * permanece en el campo para que la persona pueda reintentarlo sin
 * reescribirlo entero.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NotebookPen, Send } from "lucide-react";

import { AlertBanner, SectionLabel } from "@/components/ui/index.js";
import { fieldStyle } from "@/components/ui/Input.jsx";
import { useDominio } from "@/i18n/useDominio.js";
import { useMensajeDeError } from "@/i18n/useMensajeDeError.js";
import { useTheme } from "@/theme";
import { escribirEnCuaderno, leerCuaderno } from "@/lib/api/cuadernoApi.js";
import { SISTEMA_IDS } from "@shared/eva/comun/sistemas.js";

const MAX_NOTA = 1000;

export default function CuadernoEva() {
  const { theme: t } = useTheme();
  const { t: traducir } = useTranslation(["maintenance", "common", "errors"]);
  const mensajeDeError = useMensajeDeError();
  const { sistema: nombreSistema } = useDominio();

  const [notas, setNotas] = useState({ cargando: true, error: null, entradas: [] });
  const [recarga, setRecarga] = useState(0);

  const [texto, setTexto] = useState("");
  const [sistemaElegido, setSistemaElegido] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorAlEnviar, setErrorAlEnviar] = useState(null);

  useEffect(() => {
    const control = new AbortController();
    setNotas((n) => ({ ...n, cargando: true, error: null }));

    leerCuaderno({ limite: 100, signal: control.signal })
      .then((r) => setNotas({ cargando: false, error: null, entradas: r?.entradas ?? [] }))
      .catch((e) => {
        if (e.name === "AbortError") return;
        setNotas({ cargando: false, error: e, entradas: [] });
      });

    return () => control.abort();
  }, [recarga]);

  const enviar = async (e) => {
    e.preventDefault();
    const limpio = texto.trim();
    if (!limpio) return;

    setEnviando(true);
    setErrorAlEnviar(null);

    try {
      await escribirEnCuaderno({ texto: limpio, sistema: sistemaElegido || undefined });
      // El campo se limpia SÓLO si se guardó: un fallo deja el texto puesto,
      // para que reintentar no obligue a reescribirlo.
      setTexto("");
      setSistemaElegido("");
      setRecarga((n) => n + 1);
    } catch (error) {
      setErrorAlEnviar(error);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <header>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: t.text }}>
          {traducir("maintenance:notebook.title")}
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: t.textSoft }}>
          {traducir("maintenance:notebook.subtitle")}
        </p>
      </header>

      {/* ── El formulario ──────────────────────────────────────────────── */}
      <form
        onSubmit={enviar}
        style={{
          background: t.panel, border: `1px solid ${t.border}`,
          borderRadius: 12, padding: 14,
          display: "flex", flexDirection: "column", gap: 10,
        }}
      >
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value.slice(0, MAX_NOTA))}
          placeholder={traducir("maintenance:notebook.placeholder")}
          style={{ ...fieldStyle(t), minHeight: 72, resize: "vertical", fontFamily: "'Inter', sans-serif" }}
          disabled={enviando}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: t.textFaint }}>
              {traducir("maintenance:notebook.machine")}
            </span>
            <select
              value={sistemaElegido}
              onChange={(e) => setSistemaElegido(e.target.value)}
              disabled={enviando}
              style={{
                height: 32, fontSize: 12, padding: "0 8px", borderRadius: 8,
                background: t.panel, color: t.text, border: `1px solid ${t.border}`,
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {/* Vacío = «no es de ninguna máquina en concreto» — «se fue la
                  luz media hora» no tiene por qué elegir tanque o vibraciones. */}
              <option value="">{traducir("maintenance:notebook.wholePlant")}</option>
              {SISTEMA_IDS.map((s) => (
                <option key={s} value={s}>{nombreSistema(s)}</option>
              ))}
            </select>
          </label>

          <span style={{ flex: 1 }} />

          <button
            type="submit"
            disabled={enviando || !texto.trim()}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 14px", borderRadius: 8,
              cursor: enviando || !texto.trim() ? "default" : "pointer",
              opacity: enviando || !texto.trim() ? 0.6 : 1,
              border: `1px solid ${t.accent}`, background: t.accentSoft,
              color: t.accent, fontSize: 13, fontWeight: 600,
              minHeight: 44,
            }}
          >
            <Send size={14} />
            {traducir(enviando ? "maintenance:notebook.saving" : "maintenance:notebook.save")}
          </button>
        </div>

        {errorAlEnviar && (
          <AlertBanner
            type="error"
            title={traducir("maintenance:notebook.saveError")}
            message={mensajeDeError(errorAlEnviar).titulo}
          />
        )}
      </form>

      {/* ── Las notas ya escritas ───────────────────────────────────────── */}
      <SectionLabel>{traducir("maintenance:notebook.list")}</SectionLabel>

      {notas.cargando ? (
        <p style={{ margin: 0, fontSize: 13, color: t.textFaint }}>…</p>
      ) : notas.error ? (
        <AlertBanner
          type="warning"
          title={traducir("maintenance:notebook.loadError")}
          message={mensajeDeError(notas.error).titulo}
        />
      ) : notas.entradas.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: t.textFaint, textAlign: "center", padding: "24px 0" }}>
          {traducir("maintenance:notebook.empty")}
        </p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
          {notas.entradas.map((n, i) => (
            <li
              key={i}
              style={{
                background: t.panel, border: `1px solid ${t.border}`,
                borderRadius: 10, padding: "10px 12px",
                display: "flex", gap: 10, alignItems: "flex-start",
              }}
            >
              <NotebookPen size={15} color={t.textFaint} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, color: t.text, whiteSpace: "pre-wrap" }}>{n.texto}</p>
                <p style={{ margin: "4px 0 0", fontSize: 11, color: t.textFaint }}>
                  {n.instante ? new Date(n.instante).toLocaleString() : "—"}
                  {n.autor ? ` · ${n.autor}` : ""}
                  {n.sistema ? ` · ${nombreSistema(n.sistema)}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
