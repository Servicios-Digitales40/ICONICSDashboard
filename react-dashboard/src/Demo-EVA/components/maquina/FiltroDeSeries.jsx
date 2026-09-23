/**
 * Los chips de activo y el interruptor «sólo medidas» que filtran las series
 * de una máquina configurada (Plan 42.5 F6, D16). Lo usan la Planta y
 * «Comparar señales» del Detalle, con el MISMO filtro de dominio detrás
 * (`filtrarClaves`): esta pieza sólo pinta y avisa; no decide qué es una
 * medida ni de qué activo es una clave.
 *
 * ── POR QUÉ CHIPS, Y UNA CIFRA EN CADA UNO ───────────────────────────
 *
 * Los activos de una máquina son pocos y fijos (tres apoyos, un variador):
 * chips, no un `<select>`, por el mismo criterio que las opciones fijas de la
 * vista de Alarmas del tanque que se retiró. Cada chip dice cuántas series
 * dejaría ANTES de pulsarlo, y uno que dejaría cero se ofrece apagado: un
 * botón que lleva a una pantalla vacía es peor que su ausencia.
 *
 * El interruptor dice «sólo medidas», no «ocultar calidades»: se nombra lo que
 * se ve, no lo que se esconde. Y la cifra «12 de 72 series» está siempre,
 * también con el filtro apagado, para que nadie crea que la máquina tiene
 * doce variables.
 */
import { useTranslation } from "react-i18next";

import { SIN_ACTIVO } from "@shared/eva/comun/vistaDeMaquina.js";

import { MONO } from "../base.jsx";

function Chip({ activa, deshabilitada, color, t, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={activa}
      disabled={!activa && deshabilitada}
      onClick={onClick}
      style={{
        padding: "6px 11px", borderRadius: 999, fontSize: 12, fontWeight: 600,
        border: `1px solid ${activa ? color : t.border}`,
        background: activa ? `${color}22` : "transparent",
        color: activa ? color : t.textSoft,
        cursor: !activa && deshabilitada ? "default" : "pointer",
        opacity: !activa && deshabilitada ? 0.45 : 1,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {children}
    </button>
  );
}

/**
 * @param {object} props
 * @param {Array<{id: string, nombre: string|null}>} props.activos  los de `activosConVariables`
 * @param {Record<string, number>} props.conteoPorActivo  cuántas series deja cada activo con el interruptor actual
 * @param {{ activo: string|null, soloMedidas: boolean }} props.filtro
 * @param {(filtro: { activo: string|null, soloMedidas: boolean }) => void} props.onCambiar
 * @param {number} props.visibles  cuántas series quedan con el filtro
 * @param {number} props.total  cuántas tiene la máquina
 */
export function FiltroDeSeries({ activos, conteoPorActivo, filtro, onCambiar, visibles, total, t }) {
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation("machines");
  const nombreDe = (a) => (a.id === SIN_ACTIVO ? traducir("maquina.detalle.sinActivo") : a.nombre ?? a.id);

  return (
    <div
      role="group"
      aria-label={traducir("maquina.filtro.label")}
      style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}
    >
      <Chip activa={filtro.activo === null} color={t.accent} t={t} onClick={() => onCambiar({ ...filtro, activo: null })}>
        {traducir("maquina.filtro.todaLaMaquina")}
      </Chip>
      {activos.map((a) => {
        const n = conteoPorActivo[a.id] ?? 0;
        return (
          <Chip
            key={a.id}
            activa={filtro.activo === a.id}
            deshabilitada={n === 0}
            color={t.accent}
            t={t}
            onClick={() => onCambiar({ ...filtro, activo: a.id })}
          >
            {traducir("maquina.filtro.chip", { nombre: nombreDe(a), n })}
          </Chip>
        );
      })}

      <label style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto", fontSize: 11.5, color: t.textSoft, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={filtro.soloMedidas}
          onChange={(e) => onCambiar({ ...filtro, soloMedidas: e.target.checked })}
        />
        {traducir("maquina.filtro.soloMedidas")}
      </label>
      <span style={{ fontSize: 11, color: t.textFaint, fontFamily: MONO }}>
        {traducir("maquina.filtro.visibles", { visibles, total })}
      </span>
    </div>
  );
}
