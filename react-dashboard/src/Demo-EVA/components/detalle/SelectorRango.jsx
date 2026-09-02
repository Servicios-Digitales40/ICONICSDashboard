/**
 * Selector de rango de tiempo del historiador (Plan 11): «Tiempo real» —el
 * búfer de esta sesión, repintándose solo— más Ayer y Hace una semana
 * contra el historiador, y un calendario personalizado. Vive en la
 * cabecera de `views/tanque/DetalleActivo.jsx` y gobierna TODAS las tarjetas
 * historizadas de la pestaña activa a la vez, no una por gráfica — mismo
 * criterio que ya usa `useSeriesHistoricas` para traerlas juntas.
 *
 * Visualmente emparentado con `components/ui/Tabs.jsx` (mismo fondo, mismo
 * estado activo), pero no es ese componente: «Personalizado» no cambia de
 * valor al pulsarlo, abre un calendario, y sólo pasa a activo cuando el
 * usuario confirma un rango dentro de él.
 *
 * El calendario es de clic puro, sin campo de texto para escribir una fecha:
 * el criterio de que toda la app se opere sin teclado (heredado de la época
 * en planta, ver `app/routes/routes.jsx`) sigue vigente. Es también por lo
 * que se construye a mano en vez de traer una librería — ninguna candidata
 * típica lo cumple sin trabajo extra encima, y el resto de la UI pequeña de
 * esta sección (`Spark`, `GraficaBufer` en `piezas.jsx`) ya se hace así.
 */
import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, Radio } from "lucide-react";

import { MONO } from "../base.jsx";
import { useEvaSource } from "../../data/comunes/EvaProvider.jsx";

/**
 * `vivo` no lleva calculadora de rango: no le pide nada al historiador, así
 * que su icono (`Radio`, el mismo que usa `InsigniaOrigen` para «Sesión
 * actual») es la única pista de que esta pestaña es distinta a las otras
 * tres — todas contra el historiador, ésta contra el búfer en vivo.
 */
const PRESETS = [
  { key: "vivo", label: "Tiempo real", Icono: Radio },
  { key: "ayer", label: "Ayer" },
  { key: "semana", label: "Hace una semana" },
];

const DIAS_SEMANA = ["L", "M", "X", "J", "V", "S", "D"];
const FORMATO_MES = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" });

function inicioDelDia(fecha) {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
}

function mismoDia(a, b) {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Lunes=0…Domingo=6, con celdas vacías delante para alinear la rejilla. */
function celdasDelMes(mesVisible) {
  const anio = mesVisible.getFullYear();
  const mes = mesVisible.getMonth();
  const primerDia = new Date(anio, mes, 1);
  const ultimoDia = new Date(anio, mes + 1, 0).getDate();
  const offset = (primerDia.getDay() + 6) % 7;

  const celdas = Array(offset).fill(null);
  for (let dia = 1; dia <= ultimoDia; dia++) celdas.push(new Date(anio, mes, dia));
  return celdas;
}

function botonIcono(t, deshabilitado) {
  return {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 26, height: 26, borderRadius: 7, border: "none",
    background: t.hover, color: t.textSoft,
    cursor: deshabilitado ? "default" : "pointer", opacity: deshabilitado ? 0.35 : 1,
  };
}

/**
 * Qué días del mes visible tienen al menos una muestra real del
 * historiador, para la señal `claveSonda` — una consulta por MES, no por
 * día: se pide el mes entero de una vez y se agrupa por fecha del lado del
 * cliente. No hay atajo mejor: ICONICS no publica «desde cuándo existe la
 * serie», así que la única forma honesta de saberlo es preguntarle al
 * historiador, no adivinar.
 *
 * Se relee al cambiar de mes visible, y no antes: abrir el calendario no
 * dispara más que la consulta del mes que ya se está mirando.
 */
function useDiasConDato(claveSonda, mesVisible, hoy) {
  const source = useEvaSource();
  const [dias, setDias] = useState(() => new Set());

  const anio = mesVisible.getFullYear();
  const mes = mesVisible.getMonth();

  useEffect(() => {
    setDias(new Set());
    if (!claveSonda) return undefined;

    const inicio = new Date(anio, mes, 1);
    const finMes = new Date(anio, mes + 1, 0);
    // No tiene sentido pedir más allá de hoy: el historiador no tiene futuro,
    // y un mes que sea completamente futuro (navegado por error) no pide nada.
    const fin = new Date(Math.min(finMes.getTime(), hoy.getTime()) + 24 * 3_600_000);
    if (fin.getTime() <= inicio.getTime()) return undefined;

    let vivo = true;
    source
      .leerSerie(claveSonda, { inicio, fin })
      .then(({ datos }) => vivo && setDias(new Set(datos.map((d) => d.t.toDateString()))))
      .catch(() => vivo && setDias(new Set()));

    return () => {
      vivo = false;
    };
    // `hoy` no va en las dependencias a propósito: un cambio de fecha a
    // medianoche con el popover abierto no tiene por qué repetir la consulta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, claveSonda, anio, mes]);

  return dias;
}

/** El calendario de dos clics: día de inicio, día de fin, confirmar o cancelar. */
function CalendarioRango({ onAplicar, onCancelar, t, claveSonda }) {
  const hoy = inicioDelDia(new Date());
  const [mesVisible, setMesVisible] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [inicio, setInicio] = useState(null);
  const [fin, setFin] = useState(null);
  const [sobre, setSobre] = useState(null);
  const diasConDato = useDiasConDato(claveSonda, mesVisible, hoy);

  const enMesDeHoy = mesVisible.getFullYear() === hoy.getFullYear() && mesVisible.getMonth() === hoy.getMonth();

  function elegir(dia) {
    if (dia.getTime() > hoy.getTime()) return;
    if (!inicio || fin) {
      setInicio(dia);
      setFin(null);
      return;
    }
    if (dia.getTime() < inicio.getTime()) {
      setFin(inicio);
      setInicio(dia);
    } else {
      setFin(dia);
    }
  }

  const bordeRango = fin ?? sobre;
  function dentroDelRango(dia) {
    if (!inicio || !bordeRango) return false;
    const desde = Math.min(inicio.getTime(), bordeRango.getTime());
    const hasta = Math.max(inicio.getTime(), bordeRango.getTime());
    return dia.getTime() >= desde && dia.getTime() <= hasta;
  }

  return (
    <div style={{ width: 272 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button
          type="button"
          aria-label="Mes anterior"
          onClick={() => setMesVisible((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          style={botonIcono(t, false)}
        >
          <ChevronLeft size={15} />
        </button>
        <span style={{ fontSize: 13, fontWeight: 700, color: t.text, textTransform: "capitalize" }}>
          {FORMATO_MES.format(mesVisible)}
        </span>
        <button
          type="button"
          aria-label="Mes siguiente"
          disabled={enMesDeHoy}
          onClick={() => setMesVisible((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          style={botonIcono(t, enMesDeHoy)}
        >
          <ChevronRight size={15} />
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {DIAS_SEMANA.map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: 10, color: t.textFaint, fontFamily: MONO, padding: "2px 0" }}>
            {d}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {celdasDelMes(mesVisible).map((dia, i) => {
          if (!dia) return <div key={`vacio-${i}`} />;

          const futuro = dia.getTime() > hoy.getTime();
          const extremo = mismoDia(dia, inicio) || mismoDia(dia, fin);
          const dentro = !extremo && dentroDelRango(dia);
          const tieneDato = !futuro && diasConDato.has(dia.toDateString());

          return (
            <button
              key={dia.getTime()}
              type="button"
              disabled={futuro}
              onClick={() => elegir(dia)}
              onMouseEnter={() => setSobre(dia)}
              onMouseLeave={() => setSobre(null)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                height: 28, borderRadius: 7, border: "none",
                cursor: futuro ? "default" : "pointer",
                fontFamily: MONO, fontSize: 11.5, fontWeight: extremo ? 700 : 400,
                color: futuro ? t.textFaint : extremo ? "#FFFFFF" : t.text,
                background: extremo ? t.accent : dentro ? t.accentSoft : "transparent",
                opacity: futuro ? 0.35 : 1,
              }}
            >
              {dia.getDate()}
              {/* Punto de 4px: el único indicio de que ESE día tiene muestras
                  reales del historiador, no una suposición sobre el rango. */}
              <span
                style={{
                  width: 4, height: 4, borderRadius: 999, marginTop: 1,
                  background: tieneDato ? (extremo ? "#FFFFFF" : t.accent) : "transparent",
                }}
              />
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
        <span style={{ width: 4, height: 4, borderRadius: 999, background: t.accent, flexShrink: 0 }} />
        <span style={{ fontSize: 10.5, color: t.textFaint, lineHeight: 1.4 }}>Hay muestras del historiador</span>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
        <button
          type="button"
          onClick={onCancelar}
          style={{ padding: "7px 14px", borderRadius: 9, border: "none", background: "transparent", color: t.textSoft, fontFamily: "'Inter', sans-serif", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={!inicio || !fin}
          onClick={() => onAplicar(inicio, fin)}
          style={{
            padding: "7px 14px", borderRadius: 9, border: "none",
            background: t.gradAccent, color: "#FFFFFF",
            fontFamily: "'Inter', sans-serif", fontSize: 12.5, fontWeight: 600,
            cursor: !inicio || !fin ? "default" : "pointer", opacity: !inicio || !fin ? 0.4 : 1,
          }}
        >
          Aplicar
        </button>
      </div>
    </div>
  );
}

/**
 * @param activo         clave del preset vigente: "vivo" | "ayer" | "semana" | "personalizado"
 * @param onPreset       (key) => void, para los tres accesos rápidos
 * @param onPersonalizado (diaInicio, diaFin) => void, al confirmar el calendario
 * @param claveSonda     clave de una señal historizada de la pestaña activa, para
 *                       pintar en el calendario qué días tienen muestras reales
 */
export function SelectorRango({ activo, onPreset, onPersonalizado, t, claveSonda }) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;
    function alTocarFuera(e) {
      if (raiz.current && !raiz.current.contains(e.target)) setAbierto(false);
    }
    document.addEventListener("mousedown", alTocarFuera);
    return () => document.removeEventListener("mousedown", alTocarFuera);
  }, [abierto]);

  function estiloItem(seleccionado) {
    return {
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "7px 13px", borderRadius: 9, border: "none", cursor: "pointer",
      whiteSpace: "nowrap",
      fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 12.5, fontWeight: seleccionado ? 700 : 600,
      color: seleccionado ? t.accent : t.textSoft,
      background: seleccionado ? t.panel : "transparent",
      boxShadow: seleccionado ? `${t.shadow}, inset 0 0 0 1px ${t.accent}44` : "none",
      transition: "color 160ms ease, background 160ms ease, box-shadow 160ms ease",
    };
  }

  return (
    <div ref={raiz} style={{ position: "relative", display: "inline-flex" }}>
      <div
        role="group"
        aria-label="Rango de tiempo del historiador"
        style={{ display: "inline-flex", gap: 4, padding: 4, borderRadius: 12, background: t.hover, border: `1px solid ${t.border}` }}
      >
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={activo === p.key}
            onClick={() => {
              setAbierto(false);
              onPreset(p.key);
            }}
            style={estiloItem(activo === p.key)}
          >
            {p.Icono && <p.Icono size={13} />}
            {p.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={activo === "personalizado"}
          aria-expanded={abierto}
          onClick={() => setAbierto((v) => !v)}
          style={estiloItem(activo === "personalizado")}
        >
          <Calendar size={13} />
          Personalizado
        </button>
      </div>

      {abierto && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 40,
            background: t.panel, border: `1px solid ${t.border}`, borderRadius: 16,
            padding: 16, boxShadow: t.shadowHover,
          }}
        >
          <CalendarioRango
            t={t}
            claveSonda={claveSonda}
            onCancelar={() => setAbierto(false)}
            onAplicar={(diaInicio, diaFin) => {
              onPersonalizado(diaInicio, diaFin);
              setAbierto(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
