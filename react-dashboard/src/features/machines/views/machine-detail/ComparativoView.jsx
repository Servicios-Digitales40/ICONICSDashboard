/**
 * pages/machine-detail/ComparativoView.jsx
 * ------------------------------------------------------------------
 * Subvista "Comparativo": compara el OEE de una máquina entre DOS fechas.
 *
 * La vista no muestra dos días — muestra LA DIFERENCIA entre dos días, y
 * los dos días son el contexto que la explica. De ahí su orden:
 *
 *   1. Selección   presets, cápsula A⇄B y relación entre ambas fechas
 *   2. Titular     la conclusión y su causa, antes que nada más
 *   3. Espejo      las dos fechas enfrentadas, deltas en el eje central
 *   4. Gráficas    la evidencia por métrica y por hora
 *
 * Todo el cálculo (deltas, zona muerta, veredicto, escalas) vive en
 * `compare.js` y todo el pintado en `comparativo-ui.jsx`; aquí solo se
 * compone. Que la comparación se calcule UNA vez y se reparta es lo que
 * impide que dos paneles de la misma pantalla se contradigan.
 *
 * ── DE DÓNDE SALEN LOS NÚMEROS ─────────────────────────────────────
 *
 * Del HISTORIADOR de ICONICS (`hda:\Configuration\RESONAC\…`), un día por
 * lado, vía `useMachineDay`. Antes se derivaban del valor en vivo con un
 * generador determinista: era andamiaje para poder diseñar la vista sin
 * histórico, y producía una comparación creíble y falsa — el peor tipo de
 * dato en una pantalla de planta.
 *
 * De ahí que ahora la vista tenga tres estados que antes no podía tener
 * (leyendo · sin historia · error de lectura) y que NINGUNO de ellos
 * rellene el hueco con cifras: un día sin historizar y un día malo son
 * noticias opuestas.
 *
 * El estado de las fechas vive aquí (local): no toca el router.
 */
import { useMemo, useState } from "react";
import { GitCompareArrows, AlertTriangle, DatabaseZap, Loader } from "lucide-react";
import { Panel, DatePicker } from "@/components/ui/index.js";
import { useMachineDay, useMachineDailyOee } from "@/lib/datasource";
import {
  isoDay, addDays, fmtDay, PRESETS, matchPreset, relationLabel,
  buildComparison, verdict,
} from "../../lib/compare.js";
import {
  VerdictHeadline, SameDateNotice, MirrorSide, DeltaChip, sharedDomain,
  MetricDumbbell, HourlyDiff, DiffLegend, HistoryNotice,
} from "../../components/comparativoUi.jsx";

/* ------------------------------------------------------------------
 * Chip de preset. Las cuatro comparaciones habituales a un clic: sin
 * ellos, la pregunta más frecuente de la vista ("¿cómo vamos contra la
 * semana pasada?") cuesta teclear dos fechas completas.
 * ------------------------------------------------------------------ */
function PresetChip({ preset, active, onClick, t }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={preset.hint}
      aria-pressed={active}
      className="app-btn"
      style={{
        fontSize: 11.5, fontWeight: 600, fontFamily: "'Inter', sans-serif",
        padding: "5px 12px", borderRadius: 999, cursor: "pointer",
        background: active ? `${t.accent}18` : "transparent",
        color: active ? t.accent : t.textSoft,
        border: `1px solid ${active ? `${t.accent}66` : t.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {preset.label}
    </button>
  );
}

/* ------------------------------------------------------------------
 * Control de rango: los dos campos, el botón de intercambio y el rótulo
 * que explica la relación entre ambas fechas.
 *
 * Se presenta como UNA cápsula y no como dos campos sueltos porque lo
 * que se elige no son dos fechas independientes, sino una comparación.
 * El degradado A→B tiñe cada extremo con su color de identidad, de modo
 * que la correspondencia campo↔columna se aprende sin leer etiquetas.
 * ------------------------------------------------------------------ */
function DateRangeControl({ dateA, dateB, setDateA, setDateB, todayIso, colorA, colorB, dayOee, t }) {
  const activePreset = matchPreset(dateA, dateB, todayIso);
  const rel = relationLabel(dateA, dateB);

  const applyPreset = (p) => {
    const [a, b] = p.range(todayIso);
    setDateA(a);
    setDateB(b);
  };

  const swap = () => {
    setDateA(dateB);
    setDateB(dateA);
  };

  return (
    /* zIndex sobre el panel, no sobre el popover: `Panel` anima con
       `fadeInUp ... both` y conserva el `transform` del último
       fotograma, lo que crea un stacking context propio. Dentro de él,
       cualquier z-index del calendario queda atrapado y los paneles
       siguientes (titular, espejo) se pintan encima. Elevando el
       contenedor, todo su contenido sube con él. */
    <Panel style={{ position: "relative", zIndex: 40 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {PRESETS.map((p) => (
          <PresetChip key={p.id} preset={p} active={activePreset === p.id} onClick={() => applyPreset(p)} t={t} />
        ))}
      </div>

      <div
        style={{
          display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap",
          padding: "14px 16px", borderRadius: 14,
          border: `1px solid ${t.border}`,
          background: `linear-gradient(90deg, ${colorA}0F, transparent 38%, transparent 62%, ${colorB}0F)`,
        }}
      >
        <div style={{ flex: 1, minWidth: 150 }}>
          <DatePicker
            label="Fecha A · base" value={dateA} onChange={setDateA}
            accent={colorA} max={todayIso} dayValue={dayOee}
            marker={dateB} markerColor={colorB}
          />
        </div>

        <button
          type="button"
          onClick={swap}
          className="app-btn"
          aria-label="Intercambiar fecha A y fecha B"
          title="Intercambiar A y B"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 38, height: 38, flexShrink: 0, borderRadius: "50%",
            background: t.panel, border: `1px solid ${t.border}`,
            color: t.textSoft, cursor: "pointer", boxShadow: t.shadow,
          }}
        >
          <GitCompareArrows size={17} />
        </button>

        <div style={{ flex: 1, minWidth: 150 }}>
          <DatePicker
            label="Fecha B · sujeto" value={dateB} onChange={setDateB}
            accent={colorB} max={todayIso} dayValue={dayOee}
            marker={dateA} markerColor={colorA}
          />
        </div>
      </div>

      <div
        style={{
          display: "flex", alignItems: "center", gap: 6, marginTop: 10,
          fontSize: 12, color: rel.warn ? t.amber : t.textFaint,
          fontFamily: "'Inter', sans-serif",
        }}
      >
        {rel.warn && <AlertTriangle size={13} />}
        <span>{rel.text}</span>
        {rel.hint && <span style={{ opacity: 0.85 }}>· {rel.hint}</span>}
        {rel.invertido && !rel.same && (
          <span style={{ color: t.textFaint }}>· B es la fecha anterior</span>
        )}
      </div>
    </Panel>
  );
}

/**
 * Ventana del mapa de calor del calendario, en días hacia atrás.
 *
 * 90 y no "todo lo que haya" por un límite real del transporte: el
 * backend pide como mucho 100 muestras por llamada
 * (`X-ICO-MAX-ITEM-COUNT`), y con un punto por día eso son 100 días. Se
 * deja margen para no rozar el tope.
 */
const DIAS_CALENDARIO = 90;

// Sin prop `C` a propósito: el color de identidad codifica SOLO la fecha
// (azul = A, violeta = B) y verde/coral quedan reservados a la dirección
// del cambio. La paleta por métrica era un tercer sistema compitiendo por
// el mismo canal visual, y el resultado era que el color no significaba
// nada en concreto.
export default function ComparativoView({ machine, t }) {
  const todayIso = isoDay(new Date());
  const weekAgoIso = isoDay(new Date(Date.now() - 7 * 86400000));
  const [dateA, setDateA] = useState(weekAgoIso);
  const [dateB, setDateB] = useState(todayIso);

  const colorA = t.accent;
  const colorB = t.violet;

  // Un día por lado, cada uno con su propia lectura al historiador. La
  // fuente cachea por (máquina, fecha), así que alternar entre presets ya
  // vistos no vuelve a la red.
  const diaA = useMachineDay(machine.id, dateA);
  const diaB = useMachineDay(machine.id, dateB);

  // Mapa de calor del calendario: UNA petición para toda la ventana, no
  // una por celda. El DatePicker no sabe nada de máquinas ni de OEE —
  // solo recibe una función iso → número — así que este es el único
  // punto que hubo que tocar al pasar de datos simulados a reales.
  const ventana = useMemo(
    () => ({ desde: addDays(todayIso, -DIAS_CALENDARIO), hasta: todayIso }),
    [todayIso]
  );
  const { oeeDe: dayOee } = useMachineDailyOee(machine.id, ventana);

  const snapA = diaA.resumen;
  const snapB = diaB.resumen;
  const trendA = diaA.serie;
  const trendB = diaB.serie;

  // Comparación y veredicto: un solo cálculo que alimenta el titular,
  // el canal de deltas y (en la Fase 3) las gráficas. Que todo salga de
  // aquí es lo que impide que dos paneles se contradigan.
  const cmp = useMemo(() => buildComparison(snapA, snapB), [snapA, snapB]);
  const v = useMemo(() => verdict(cmp), [cmp]);

  // Escala común a las dos mini-tendencias: con escalas independientes,
  // la misma altura significaría valores distintos en cada columna.
  const domain = useMemo(() => sharedDomain(trendA, trendB), [trendA, trendB]);

  // Referencia para las micro-barras de los deltas: el mayor cambio de
  // esta comparación, con un suelo de 5 pts para que un día tranquilo no
  // convierta un ±0.3 en una barra a tope.
  const maxAbs = useMemo(
    () => Math.max(...cmp.map((m) => Math.abs(m.delta)), 5),
    [cmp]
  );

  // Serie combinada por hora. Se empareja por LA HORA, no por índice, y
  // con datos reales eso ha dejado de ser una precaución teórica: dos
  // días del historiador rara vez traen el mismo número de puntos —un
  // turno corto, una parada, un día que aún no ha terminado— y el
  // emparejado posicional compararía las 10:00 contra las 11:00 sin
  // avisar de nada.
  const overlay = useMemo(() => {
    const porHora = new Map(trendB.map((r) => [r.t, r.oee]));
    return trendA.map((row) => ({
      t: row.t,
      A: row.oee,
      B: porHora.has(row.t) ? porHora.get(row.t) : null,
    }));
  }, [trendA, trendB]);

  // Comparar una fecha consigo misma no es un error que haya que
  // bloquear, pero sí uno que hay que decir en voz alta: todos los
  // deltas valen 0 y la vista parecería estar afirmando "sin cambios".
  const mismaFecha = dateA === dateB;

  // Estado de la LECTURA, que no es lo mismo que el estado del dato. Se
  // resuelve en este orden porque cada caso hace irrelevante al
  // siguiente: si aún se está leyendo, no se sabe si hay historia; si la
  // lectura falló, "no hay historia" sería una conclusión falsa.
  const leyendo = diaA.loading || diaB.loading;
  const errorLectura = diaA.error ?? diaB.error;
  const sinHistoria = !snapA && !snapB;
  const historiaParcial = !leyendo && !errorLectura && !sinHistoria && (!snapA || !snapB);
  const hayEvidencia = !leyendo && !errorLectura && !sinHistoria;

  const cabecera = leyendo ? (
    <HistoryNotice
      icon={<Loader size={26} className="spin" />} t={t}
      titulo="Leyendo el historiador…"
      detalle={`Serie por hora y cierre del día para ${fmtDay(dateA)} y ${fmtDay(dateB)}.`}
    />
  ) : errorLectura ? (
    <HistoryNotice
      icon={<DatabaseZap size={26} />} tono="error" t={t}
      titulo="No se pudo leer el historiador"
      detalle={
        <>
          {errorLectura}
          <br />
          Comprueba que el backend puente está en marcha y que la ruta{" "}
          <code>/api/iconics/history</code> responde para los puntos{" "}
          <code>hda:\Configuration\RESONAC\…</code>. Para diagnosticarlo:{" "}
          <code>node scripts/verificar-historia.mjs</code>.
        </>
      }
    />
  ) : sinHistoria ? (
    <HistoryNotice
      icon={<DatabaseZap size={26} />} tono="aviso" t={t}
      titulo="Sin historia para estas dos fechas"
      detalle={`El historiador no tiene muestras de ${machine.equipo} ni el ${fmtDay(dateA)} ni el ${fmtDay(dateB)}. Prueba con fechas más recientes o revisa la configuración de logging de esos tags.`}
    />
  ) : mismaFecha ? (
    <SameDateNotice iso={dateA} t={t} />
  ) : (
    <VerdictHeadline v={v} t={t} />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Selección de fechas: presets, cápsula A⇄B y relación entre ambas */}
      <DateRangeControl
        dateA={dateA} dateB={dateB}
        setDateA={setDateA} setDateB={setDateB}
        todayIso={todayIso} colorA={colorA} colorB={colorB}
        dayOee={dayOee} t={t}
      />

      {/* TITULAR — la conclusión, antes que la evidencia. Cuando no hay
          conclusión que dar (leyendo, error, sin historia, misma fecha),
          este hueco explica por qué en vez de fingir una. */}
      {cabecera}

      {/* Un solo lado sin historia no invalida la pantalla —la columna
          que sí tiene datos sigue siendo útil— pero sí invalida todos los
          deltas, que salen como "—". Conviene decirlo antes de que el
          usuario los busque. */}
      {historiaParcial && (
        <HistoryNotice
          icon={<AlertTriangle size={22} />} tono="aviso" t={t}
          titulo={`Sin historia del ${fmtDay(snapA ? dateB : dateA)}`}
          detalle="Solo una de las dos fechas tiene muestras, así que no hay diferencias que calcular: los deltas quedan en blanco."
        />
      )}

      {/* La EVIDENCIA solo se pinta si hay algo que evidenciar. Un espejo
          con dos columnas en blanco y tres gráficas vacías no informa de
          nada y además se lee como un fallo de la aplicación, no como una
          ausencia de datos en el servidor. */}
      {hayEvidencia && (
        <>
          {/* ESPEJO — las dos fechas enfrentadas, con los deltas en el eje
              de simetría. El canal central sustituye al antiguo panel
              "Diferencias" del fondo, que obligaba a un viaje de ida y
              vuelta entre las gráficas y los números. */}
          <div className="cmp-mirror">
            <MirrorSide
              label="Fecha A · base" iso={dateA} snap={snapA} trend={trendA}
              accent={colorA} t={t} domain={domain} domId="cmp-a" align="left"
            />

            <div className="cmp-channel">
              {cmp.map((m) => (
                <div key={m.key} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: t.textFaint, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 3 }}>
                    {m.short}
                  </div>
                  <DeltaChip metric={m} t={t} size="sm" showBar max={maxAbs} />
                </div>
              ))}
            </div>

            <MirrorSide
              className="cmp-side-b"
              label="Fecha B · sujeto" iso={dateB} snap={snapB} trend={trendB}
              accent={colorB} t={t} domain={domain} domId="cmp-b" align="right"
            />
          </div>

          {/* Comparación por métrica: dumbbell. La diferencia se percibe
              como LONGITUD del segmento, no restando dos alturas. */}
          <Panel title="Comparación por métrica" code="distancia entre A y B">
            <MetricDumbbell cmp={cmp} colorA={colorA} colorB={colorB} t={t} maxAbs={maxAbs} />
          </Panel>

          {/* OEE por hora: a ancho completo, porque la lectura hora a hora
              necesita resolución horizontal. */}
          <Panel
            title="OEE por hora"
            code="área rellena = diferencia B − A"
            right={<DiffLegend dateA={dateA} dateB={dateB} colorA={colorA} colorB={colorB} t={t} />}
          >
            <HourlyDiff overlay={overlay} dateA={dateA} dateB={dateB} colorA={colorA} colorB={colorB} t={t} />
          </Panel>
        </>
      )}
    </div>
  );
}
