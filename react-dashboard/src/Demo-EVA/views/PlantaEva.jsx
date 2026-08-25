/**
 * Vista «Planta» de Demo EVA — el sistema de agua industrial de un vistazo.
 *
 * Misma pregunta que la de Resonac —«¿cómo va esto ahora mismo?»— y la misma
 * arquitectura visual que «Planta · v2»: cinco bandas sobre una rejilla de 12
 * columnas, un solo héroe, y la franja de atención que sólo existe cuando hay
 * algo que atender.
 *
 * Lo que cambia es TODO el contenido, porque el servidor es otro. El mapa de
 * qué ocupa el sitio de qué, y por qué, está en la cabecera de
 * `components/tiles.jsx`.
 *
 * Orden de lectura, de arriba abajo:
 *   1. Procedencia  · de dónde salen los colores (fijo mientras sean nuestros)
 *   2. Atención     · qué está fuera de banda AHORA (si no hay nada, no aparece)
 *   3. Señales      · las cuatro con historia propia, con su tendencia
 *   4. Titular      · el nivel del tanque y lo que lo está moviendo
 *   5. Estado       · qué dicen las ocho señales y dónde aprieta el margen
 *   6. Recorrido    · cómo se conectan los 4 activos (topología, no flujo)
 *   7. Tendencias   · las cuatro series del historiador, con escala propia
 */
import { useMemo } from "react";
import { LayoutGrid } from "lucide-react";

import { AlertBanner, Button, SectionLabel } from "@/components/ui/index.js";
import { useTheme } from "@/theme";

import { conFuenteEva } from "../data/EvaProvider.jsx";
import { useSeriesHistoricas, useSistemaAgua } from "../data/hooks.js";
import { VENTANA } from "../data/historia.js";
import { DERIVADO } from "../domain/estado.js";
import { esHistorizada, historizadas } from "../domain/senales.js";
import { PROVISIONALES } from "../domain/umbrales.js";
import { buildModeloEva } from "../lib/modelo.js";
import { useAhora } from "../lib/useAhora.js";
import { UltimaLectura } from "../components/base.jsx";
import {
  BandaSenales, EstadoSenales, FranjaAtencion, HeroeNivel,
  MargenesConsumidos, RecorridoSistema, RejillaActivos, TendenciaSenales,
} from "../components/tiles.jsx";

/* ==================================================================
 * REJILLA DE 12 COLUMNAS Y RITMO BINARIO
 * ==================================================================
 * Cada BANDA es su propia rejilla de 12 columnas. Como todas comparten
 * plantilla y ancho de contenedor, los cantos alinean de banda a banda — que es
 * el 80 % de la sensación de «diseñado».
 *
 * Ritmo binario: 24 px ENTRE bandas, 16 px DENTRO de una banda.
 *
 * El CSS va inyectado aquí y no en `index.css` porque necesita media queries
 * (que los estilos inline no pueden expresar) y porque así se borra junto con
 * la carpeta, sin dejar reglas huérfanas en un archivo de producción. Los
 * prefijos son `eva-` para que no puedan colisionar con los `dv2-` de la
 * propuesta de Resonac si las dos vistas conviven en el mismo build.
 */
const REJILLA = `
.eva-page { display: flex; flex-direction: column; gap: 24px; }
.eva-band { display: grid; grid-template-columns: repeat(12, 1fr); gap: 16px; align-items: stretch; }

.eva-kpi      { grid-column: span 3; }
.eva-hero     { grid-column: span 5; }
.eva-activos  { grid-column: span 7; }
.eva-estado   { grid-column: span 5; }
.eva-margenes { grid-column: span 7; }
.eva-full     { grid-column: 1 / -1; }

/* 12 → 6: los pares se mantienen, las parejas asimétricas se apilan. */
@media (max-width: 1280px) {
  .eva-kpi { grid-column: span 6; }
  .eva-hero, .eva-activos, .eva-estado, .eva-margenes { grid-column: 1 / -1; }
}

/* Una sola columna: por debajo de 720 px la rejilla deja de tener sentido. */
@media (max-width: 720px) {
  .eva-kpi { grid-column: 1 / -1; }
}

/* El chevron de cada activo se desliza al pasar por encima. Vive en CSS y no
   inline porque es un :hover sobre un HIJO del elemento apuntado. */
.eva-chevron { transition: transform 0.18s ease; }
.metric-card:hover .eva-chevron { transform: translateX(3px); }
`;

/**
 * Aviso de procedencia. Va FIJO y arriba del todo mientras el estado sea
 * derivado o los umbrales provisionales.
 *
 * No es una alerta —no usa el tono de aviso ni compite con la franja de
 * atención— sino una nota de pie puesta arriba: lo que dice no cambia y no
 * requiere ninguna acción, pero determina cómo hay que leer todos los colores
 * de la pantalla. Esconderlo sería dejar que la demo prometa una evaluación que
 * la instalación no publica.
 */
function NotaProcedencia({ t }) {
  if (!DERIVADO && !PROVISIONALES) return null;

  return (
    <p
      style={{
        margin: 0, padding: "8px 14px", borderRadius: 10,
        background: t.hover, border: `1px solid ${t.border}`,
        fontSize: 11.5, color: t.textSoft, lineHeight: 1.55,
      }}
    >
      <strong style={{ color: t.text }}>Estados derivados.</strong> ICONICS no publica
      un estado ni alarmas para <code style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>ac:TDCON/DEMO/SENSORES/</code>:
      los colores de esta pantalla salen de comparar cada señal contra umbrales
      locales{PROVISIONALES ? ", todavía sin confirmar contra la instalación real" : ""}.
      Los valores son del servidor; las bandas, nuestras.
    </p>
  );
}

function PlantaEva({ onNavigate }) {
  const { theme: t, dark } = useTheme();
  const { sistema, series, ventana, loading, error, lastUpdated } = useSistemaAgua();
  // Un solo reloj para toda la vista: ver la cabecera de `useAhora`.
  const ahora = useAhora();

  // Las cuatro series del historiador se piden UNA vez y se reparten: los
  // sparklines de la banda de KPIs, la tendencia del héroe y los cuatro
  // paneles de cierre leen todos de aquí. Pedirlas por componente serían tres
  // rondas de cuatro peticiones para dibujar exactamente los mismos puntos.
  const claves = useMemo(historizadas, []);
  const { porClave, metaPorClave, loading: cargandoHistoria } = useSeriesHistoricas(claves, VENTANA);

  const m = useMemo(() => buildModeloEva(sistema), [sistema]);

  // El héroe y sus tres medidores de apoyo. Se nombran aquí, y no en el tile,
  // porque es una decisión de la VISTA —qué merece el arco— y no del componente.
  const nivel = sistema.senales.nivelTanque;
  const apoyos = [
    sistema.senales.flujoInstantaneo,
    sistema.senales.presionRelativa,
    sistema.senales.cargaMotor,
  ];

  /*
   * Las series de los apoyos vienen de DOS sitios y se aplanan aquí, que es el
   * único lugar que conoce los dos: caudal y presión tienen serie propia en el
   * historiador; la carga del motor no —el historiador le devuelve la curva de
   * la temperatura— así que se alimenta del búfer de muestras vivas.
   *
   * La alternativa era que el medidor decidiera, y entonces cada componente que
   * quisiera una serie tendría que acordarse de comprobar `historizado`. Aquí se
   * decide una vez.
   */
  const seriesApoyo = useMemo(
    () =>
      Object.fromEntries(
        apoyos.map((s) => [
          s.key,
          esHistorizada(s.key) ? (porClave[s.key] ?? []).map((p) => p.valor) : series[s.key] ?? [],
        ])
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [porClave, series, sistema]
  );

  if (loading && !sistema.resumen.medidas) {
    return <p style={{ fontSize: 13, opacity: 0.7 }}>Leyendo el sistema de agua…</p>;
  }

  return (
    <>
      <style>{REJILLA}</style>

      <div className="eva-page">
        {error && (
          <AlertBanner type="error" title="No se pudo leer el sistema de agua" message={error} />
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            {/* <NotaProcedencia t={t} /> */}
          </div>
          <UltimaLectura fecha={lastUpdated} t={t} />
          <Button variant="primary" icon={<LayoutGrid size={14} />} onClick={() => onNavigate?.("eva-detalle")}>
            Detalle
          </Button>
        </div>

        {/* 1 · ATENCIÓN — condicional: sin nada fuera de banda, no se pinta. */}
        <FranjaAtencion atencion={m.atencion} t={t} dark={dark} delay={0} />

        {/* 2 · Las cuatro señales con serie propia, cada una con su tendencia. */}
        <SectionLabel sub="Las cuatro señales con historia propia, con su tendencia">
          Señales destacadas
        </SectionLabel>
        <div className="eva-band">
          <BandaSenales senales={m.destacadas} series={porClave} t={t} dark={dark} ahora={ahora} base={0.05} />
        </div>

        {/* 3 · TITULAR — el nivel del tanque, y lo que lo mueve. */}
        <div className="eva-band">
          <div className="eva-hero">
            <HeroeNivel
              nivel={nivel} apoyos={apoyos} series={seriesApoyo}
              historia={porClave.nivelTanque} t={t} dark={dark} delay={0.25}
            />
          </div>
          <div className="eva-activos">
            <RejillaActivos
              activos={sistema.activos} seriesVivas={series} ventana={ventana}
              t={t} dark={dark} onNavigate={onNavigate} ahora={ahora} delay={0.3}
            />
          </div>
        </div>

        {/* 4 · Qué dicen las ocho señales, y dónde aprieta el margen. */}
        <div className="eva-band">
          <div className="eva-estado">
            <EstadoSenales sistema={sistema} t={t} dark={dark} delay={0.35} />
          </div>
          <div className="eva-margenes">
            <MargenesConsumidos margenes={m.margenes} t={t} dark={dark} delay={0.4} />
          </div>
        </div>

        {/* 5 · Topología del proceso: cómo se conectan los 4 activos. */}
        <div className="eva-band">
          <div className="eva-full">
            <RecorridoSistema activos={sistema.activos} t={t} dark={dark} delay={0.42} />
          </div>
        </div>

        {/* 6 · Cierre: las cuatro series del historiador, con escala propia. */}
        <SectionLabel sub="Las series del historiador, cada una con su propia escala">
          Tendencias
        </SectionLabel>
        <div className="eva-band">
          <div className="eva-full">
            {cargandoHistoria ? (
              <p style={{ fontSize: 12, color: t.textFaint, textAlign: "center", padding: "20px 0" }}>
                Leyendo el historiador…
              </p>
            ) : (
              <TendenciaSenales
                senales={m.destacadas} porClave={porClave} metaPorClave={metaPorClave} horas={VENTANA.horas}
                t={t} dark={dark} delay={0.45}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default conFuenteEva(PlantaEva);
