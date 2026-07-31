/**
 * Calendario propio en popover, con heatmap de valor por día.
 *
 * Existe en vez de `<input type="date">` por dos motivos: el popover nativo lo
 * dibuja el sistema operativo y desentona en una vista cuya acción principal
 * es elegir fechas, y sobre todo no puede mostrar datos. Aquí cada celda se
 * tiñe según el valor de ese día, así que el control deja de ser una elección
 * a ciegas.
 *
 * A cambio hay que reponer a mano lo que el input nativo daba gratis:
 * navegación completa por teclado, roles ARIA de rejilla, foco atrapado
 * mientras está abierto y devuelto al disparador al cerrar. Está implementado
 * abajo y conviene no tocarlo sin volver a probarlo con teclado.
 *
 * Props principales:
 *
 *  - value / onChange      controlado (string YYYY-MM-DD)
 *  - min / max             límites opcionales
 *  - accent                color de identidad (selección y tinte del mapa)
 *  - dayValue(iso)         número 0..100 o null, que alimenta el heatmap. Es
 *                          genérico a propósito: este componente no sabe nada
 *                          de máquinas ni de OEE.
 *  - marker / markerColor  otra fecha a señalar (el otro extremo de una
 *                          comparación), visible mientras se elige.
 *
 * Sobre el apilado: el popover es `position: absolute` con z-index alto, pero
 * eso solo lo sube dentro de su stacking context. Si un ancestro crea uno
 * propio —y `Panel` lo hace, porque anima con `fadeInUp … both` y conserva el
 * `transform` final— el calendario queda por detrás de los paneles hermanos
 * posteriores. La solución no es subir el z-index de aquí, sino dar
 * `position: relative` y `zIndex` al contenedor que aloja el campo; ver
 * `DateRangeControl` en ComparativoView.jsx.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { useTheme } from "@/theme";

/* Utilidades de fecha, locales y sin dependencias. */

const pad2 = (n) => String(n).padStart(2, "0");
const toIso = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
const parse = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m: m - 1, d };
};
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
/** 0 = lunes … 6 = domingo */
const firstWeekday = (y, m) => (new Date(y, m, 1).getDay() + 6) % 7;
/** Índice de día de la semana (0 = lunes) de un ISO concreto. */
const weekdayIndex = (iso) => {
  const { y, m, d } = parse(iso);
  return (new Date(y, m, d).getDay() + 6) % 7;
};

const DIAS = ["L", "M", "X", "J", "V", "S", "D"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const shiftIso = (iso, n) => {
  const { y, m, d } = parse(iso);
  const dt = new Date(y, m, d + n);
  return toIso(dt.getFullYear(), dt.getMonth(), dt.getDate());
};
const shiftMonthIso = (iso, n) => {
  const { y, m, d } = parse(iso);
  const dt = new Date(y, m + n, 1);
  const last = daysInMonth(dt.getFullYear(), dt.getMonth());
  return toIso(dt.getFullYear(), dt.getMonth(), Math.min(d, last));
};
const inRange = (iso, min, max) => (!min || iso >= min) && (!max || iso <= max);

/* Rejilla del mes. */

function CalendarGrid({ view, value, marker, markerColor, min, max, accent, dayValue, focusIso, setFocusIso, onPick, t }) {
  const { y, m } = view;
  const total = daysInMonth(y, m);
  const offset = firstWeekday(y, m);

  // El heatmap se normaliza contra el propio mes visible y no contra 0-100:
  // un mes que se mueve entre 34 y 41 se vería plano con escala absoluta. A
  // cambio el tinte es relativo al mes, y por eso la leyenda de abajo indica
  // los extremos reales.
  //
  // Solo entran los días seleccionables: los que caen fuera de min/max no se
  // tiñen, así que tampoco deben estirar la escala ni la leyenda.
  const valores = [];
  for (let d = 1; d <= total; d++) {
    const iso = toIso(y, m, d);
    if (!inRange(iso, min, max)) continue;
    const v = dayValue?.(iso);
    if (typeof v === "number") valores.push(v);
  }
  const lo = valores.length ? Math.min(...valores) : 0;
  const hi = valores.length ? Math.max(...valores) : 0;
  const alpha = (v) => {
    if (typeof v !== "number" || hi === lo) return 0.1;
    return 0.07 + ((v - lo) / (hi - lo)) * 0.48;
  };

  const celdas = [];
  for (let i = 0; i < offset; i++) celdas.push(null);
  for (let d = 1; d <= total; d++) celdas.push(d);

  return (
    <>
      <div role="row" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 4 }}>
        {DIAS.map((d, i) => (
          <div
            key={i} role="columnheader" aria-label={d}
            style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: t.textFaint, letterSpacing: 0.4, padding: "2px 0" }}
          >
            {d}
          </div>
        ))}
      </div>

      <div role="rowgroup" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {celdas.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />;

          const iso = toIso(y, m, d);
          const enabled = inRange(iso, min, max);
          const selected = iso === value;
          const isMarker = iso === marker;
          const focused = iso === focusIso;
          const v = dayValue?.(iso);

          return (
            <button
              key={iso}
              type="button"
              role="gridcell"
              data-iso={iso}
              disabled={!enabled}
              tabIndex={focused ? 0 : -1}
              aria-selected={selected}
              aria-label={`${d} de ${MESES[m]} de ${y}${typeof v === "number" ? `, ${v.toFixed(1)} por ciento` : ""}`}
              title={typeof v === "number" ? `${d} ${MESES[m]} · ${v.toFixed(1)}%` : undefined}
              onClick={() => enabled && onPick(iso)}
              onFocus={() => setFocusIso(iso)}
              style={{
                position: "relative",
                aspectRatio: "1 / 1",
                display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 8, cursor: enabled ? "pointer" : "not-allowed",
                fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5,
                fontWeight: selected ? 700 : 600,
                color: !enabled ? t.textFaint : selected ? "#FFFFFF" : t.text,
                opacity: enabled ? 1 : 0.35,
                background: selected
                  ? accent
                  : enabled
                    ? `${accent}${Math.round(alpha(v) * 255).toString(16).padStart(2, "0")}`
                    : "transparent",
                border: isMarker
                  ? `2px solid ${markerColor}`
                  : `1px solid ${selected ? accent : "transparent"}`,
                outlineOffset: 1,
              }}
            >
              {d}
            </button>
          );
        })}
      </div>

      {/* Leyenda: sin ella el tinte es decorativo. Con los extremos
          reales del mes, el mapa se puede leer. */}
      {valores.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 11, color: t.textFaint }}>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{lo.toFixed(0)}%</span>
          <span style={{ flex: 1, height: 6, borderRadius: 3, background: `linear-gradient(90deg, ${accent}12, ${accent}8C)` }} />
          <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{hi.toFixed(0)}%</span>
        </div>
      )}
    </>
  );
}

/* Popover. */

function Popover({ value, onChange, min, max, accent, dayValue, marker, markerColor, onClose, triggerRef, t }) {
  const [focusIso, setFocusIso] = useState(value);
  const boxRef = useRef(null);
  const view = useMemo(() => {
    const { y, m } = parse(focusIso || value);
    return { y, m };
  }, [focusIso, value]);

  // Mueve el foco real del navegador al día enfocado lógicamente.
  useLayoutEffect(() => {
    const el = boxRef.current?.querySelector(`[data-iso="${focusIso}"]`);
    if (el && !el.disabled) el.focus({ preventScroll: true });
  }, [focusIso]);

  // Cierre al hacer clic fuera. El disparador se excluye: si no, su
  // `mousedown` cerraría el popover y su `click` posterior lo volvería a
  // abrir, con lo que el botón nunca podría cerrarlo.
  useEffect(() => {
    const onDown = (e) => {
      if (boxRef.current?.contains(e.target)) return;
      if (triggerRef?.current?.contains(e.target)) return;
      onClose(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose, triggerRef]);

  const move = (n) => {
    const next = shiftIso(focusIso, n);
    if (inRange(next, min, max)) setFocusIso(next);
  };
  const moveMonth = (n) => {
    const next = shiftMonthIso(focusIso, n);
    setFocusIso(inRange(next, min, max) ? next : (n < 0 ? min : max) || next);
  };

  const onKeyDown = (e) => {
    switch (e.key) {
      case "ArrowLeft": e.preventDefault(); move(-1); break;
      case "ArrowRight": e.preventDefault(); move(1); break;
      case "ArrowUp": e.preventDefault(); move(-7); break;
      case "ArrowDown": e.preventDefault(); move(7); break;
      case "PageUp": e.preventDefault(); moveMonth(-1); break;
      case "PageDown": e.preventDefault(); moveMonth(1); break;
      case "Home": e.preventDefault(); move(-weekdayIndex(focusIso)); break;
      case "End": e.preventDefault(); move(6 - weekdayIndex(focusIso)); break;
      case "Escape": e.preventDefault(); onClose(true); break;
      case "Enter":
      case " ":
        if (e.target.dataset?.iso) { e.preventDefault(); onChange(e.target.dataset.iso); onClose(true); }
        break;
      case "Tab": {
        // Foco atrapado: el popover es modal mientras está abierto.
        const focusables = boxRef.current?.querySelectorAll("button:not([disabled])");
        if (!focusables?.length) return;
        const list = Array.from(focusables);
        const i = list.indexOf(document.activeElement);
        e.preventDefault();
        const next = e.shiftKey ? list[(i - 1 + list.length) % list.length] : list[(i + 1) % list.length];
        next?.focus();
        break;
      }
      default: break;
    }
  };

  const navBtn = {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 28, height: 28, borderRadius: 8, cursor: "pointer",
    background: t.hover, border: `1px solid ${t.border}`, color: t.textSoft,
  };

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-modal="true"
      aria-label="Elegir fecha"
      onKeyDown={onKeyDown}
      style={{
        position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 60,
        // maxWidth evita que el popover empuje scroll horizontal cuando el
        // campo es más estrecho que él (móvil, columnas apiladas).
        width: 288, maxWidth: "calc(100vw - 32px)", padding: 14, borderRadius: 14,
        background: t.panel, border: `1px solid ${t.border}`, boxShadow: t.shadowHover,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <button type="button" onClick={() => moveMonth(-1)} aria-label="Mes anterior" style={navBtn}>
          <ChevronLeft size={15} />
        </button>
        <div aria-live="polite" style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: 700, color: t.text, textTransform: "capitalize" }}>
          {MESES[view.m]} {view.y}
        </div>
        <button type="button" onClick={() => moveMonth(1)} aria-label="Mes siguiente" style={navBtn}>
          <ChevronRight size={15} />
        </button>
      </div>

      <div role="grid">
        <CalendarGrid
          view={view} value={value} marker={marker} markerColor={markerColor}
          min={min} max={max} accent={accent} dayValue={dayValue}
          focusIso={focusIso} setFocusIso={setFocusIso}
          onPick={(iso) => { onChange(iso); onClose(true); }}
          t={t}
        />
      </div>
    </div>
  );
}

/* Disparador y popover. */

export function DatePicker({ label, value, onChange, min, max, accent, dayValue, marker, markerColor }) {
  const { theme: t } = useTheme();
  const dot = accent || t.accent;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);

  const close = (restoreFocus) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const { y, m, d } = parse(value);
  const texto = `${pad2(d)} ${MESES[m].slice(0, 3)} ${y}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, position: "relative" }}>
      {label && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: t.textFaint }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot, boxShadow: `0 0 0 3px ${dot}22` }} />
          {label}
        </span>
      )}

      <button
        ref={triggerRef}
        type="button"
        className="field"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", boxSizing: "border-box", background: t.hover,
          border: `1px solid ${dot}55`, borderRadius: 9, padding: "9px 12px",
          fontSize: 13, color: t.text, cursor: "pointer",
          fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600,
          display: "flex", alignItems: "center", gap: 8, textAlign: "left",
        }}
      >
        <Calendar size={14} color={t.textFaint} style={{ flexShrink: 0 }} />
        <span>{texto}</span>
      </button>

      {open && (
        <Popover
          value={value} onChange={onChange} min={min} max={max}
          accent={dot} dayValue={dayValue} marker={marker} markerColor={markerColor}
          onClose={close} triggerRef={triggerRef} t={t}
        />
      )}
    </div>
  );
}
