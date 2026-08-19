/**
 * Vista «Inicio» — la landing de Demo EVA. Arranque de la app (`DEFAULT_ROUTE`)
 * y única pantalla Persuade de un tablero que en todo lo demás es Operate.
 *
 * ── CONTRATO DE DIRECCIÓN (shape → new-work, surface scope) ────────
 *
 * THESIS: una sola vitrina — la lectura en vivo es la prueba, no un adorno,
 *   y las cuatro vistas son entradas co-iguales, no un menú secundario.
 * OWN-WORLD: mismo DESIGN.md —mismo azul, misma tipografía— con estrategia
 *   de color Committed: el acento carga toda la sección hero, y la cifra
 *   rompe el techo de 16px que DESIGN.md reserva al texto de interfaz.
 * STORY: el prospecto llega, ve un número que cambia solo, entiende que es
 *   real, y elige por dónde entrar.
 * FIRST VIEWPORT: cifra en vivo + frase + CTA llenan la pantalla; la rejilla
 *   de 4 tarjetas asoma debajo como invitación a bajar.
 * FORM: Hero + rejilla debajo — de tres estructuras repartidas (editorial +
 *   franja, hero + rejilla, riel + vitrina) ordenadas por resonancia propia
 *   en posiciones 6/2/4, se confirmó la 2. seed 4bb7eb55.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with
 *   the finish review, the verdict, DESIGN.md, and every shipping raster
 *   carrying its provenance.
 *
 * ── POR QUÉ NO ESPERA AL SERVIDOR PARA DEJAR NAVEGAR ───────────────
 *
 * Es la puerta de la demo: si el CTA y las cuatro tarjetas quedaran detrás
 * de un `if (loading) return …`, una red lenta bloquearía lo único que un
 * presentador necesita poder hacer siempre, que es seguir adelante. Sólo la
 * cifra —lo único que de verdad depende del servidor— tiene su propio
 * estado de espera, y nunca un cero: un cero ahí se leería como «no hay
 * nada conectado», justo lo contrario de lo que esta pantalla existe para
 * demostrar.
 */
import { ArrowRight, Boxes, Cog, Factory, LayoutDashboard, WifiOff } from "lucide-react";

import { Button, SectionLabel } from "@/components/ui/index.js";
import { useTheme } from "@/theme";

import { conFuenteEva } from "../data/EvaProvider.jsx";
import { useSistemaAgua } from "../data/hooks.js";
import { Cifra, SANS, UltimaLectura } from "../components/base.jsx";

const REJILLA = `
.eva-inicio { display: flex; flex-direction: column; gap: 32px; }

.eva-inicio-hero {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  padding: 64px 40px 56px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.eva-inicio-hero__cifra-num { font-size: 104px; }

.eva-inicio-hero__frase {
  max-width: 480px;
  margin: 18px 0 26px;
  font-size: 14.5px;
  line-height: 1.6;
}

.eva-inicio-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 16px;
}

/* border y sombra viven aquí, parametrizados por variables por instancia, y
   no en el estilo inline: un color inline nunca cede ante un :hover de hoja
   de estilos, así que el tinte de acento al pasar el cursor sólo puede
   ocurrir si la propiedad real la declara la hoja, no el componente. */
.eva-tarjeta-vista {
  border: 1px solid var(--tv-border);
  box-shadow: var(--tv-shadow);
  transition: border-color 0.2s ease, background 0.2s ease;
}
.eva-tarjeta-vista:hover {
  border-color: var(--color-accent);
}

.eva-tarjeta-flecha { transition: transform 0.18s ease; }
.eva-tarjeta-vista:hover .eva-tarjeta-flecha { transform: translateX(3px); color: var(--color-accent); }

/* Por debajo de 560px el número deja de caber en una línea junto al
   denominador; se recorta para que la primera pantalla siga sin scroll. */
@media (max-width: 560px) {
  .eva-inicio-hero { padding: 44px 22px 36px; }
  .eva-inicio-hero__cifra-num { font-size: 60px; }
}
`;

const VISTAS = [
  {
    id: "eva-planta",
    label: "Planta",
    frase: "El estado de las ocho señales, con su histórico.",
    Icono: LayoutDashboard,
  },
  {
    id: "eva-maquina-3d",
    label: "Máquina 3D",
    frase: "El grupo de bombeo se comporta según el estado derivado de sus señales.",
    Icono: Cog,
  },
  {
    id: "eva-maqueta",
    label: "Maqueta 3D",
    frase: "La instalación en miniatura — el nivel del tanque es el dato en vivo.",
    Icono: Factory,
  },
  {
    id: "eva-assets",
    label: "Assets",
    frase: "Los ocho puntos de la demo, con su valor y su calidad en crudo.",
    Icono: Boxes,
  },
];

/**
 * La cifra del hero. Tres estados, nunca un cero de mentira: leyendo (guion
 * discreto), error (frase honesta, sin alarmar) o la cuenta real.
 */
function CifraEnVivo({ sistema, loading, error, t }) {
  const { medidas, totalSenales } = sistema.resumen;
  const listo = !loading || medidas > 0;

  if (error) {
    // Coral porque esto ES el caso que DESIGN.md reserva para ese color —
    // "error de lectura" — y no un gris neutro que subestime lo que pasó.
    // Sin latido: `alertaLatido` (index.css) es el vocabulario que `tiles.jsx`
    // reserva para una SEÑAL fuera de banda; prestárselo a un corte de red
    // confundiría dos alarmas de gravedad distinta. La reafirmación es una
    // frase, no un bucle — el motor de sondeo ya reintenta solo cada pocos
    // segundos (`evaSource.js`), así que decirlo es honesto y no un adorno.
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "18px 0" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 600, color: t.coral }}>
          <WifiOff size={17} />
          Sin conexión con el servidor por ahora
        </span>
        <span style={{ fontSize: 12, color: t.textFaint }}>
          Vuelve a intentarlo solo, cada pocos segundos
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
      <span className="eva-inicio-hero__cifra-num" style={{ display: "inline-flex" }}>
        {listo ? (
          <Cifra
            valor={medidas}
            fmt={(v) => Math.round(v)}
            duracion={1200}
            style={{ fontFamily: SANS, fontWeight: 800, lineHeight: 1, letterSpacing: -2, color: t.accent }}
          />
        ) : (
          <span style={{ fontFamily: SANS, fontWeight: 800, color: t.textFaint, opacity: 0.5 }}>···</span>
        )}
      </span>
      <span style={{ fontSize: 28, fontWeight: 700, color: t.textFaint }}>/ {totalSenales}</span>
    </div>
  );
}

function TarjetaVista({ vista, onNavigate, t, delay }) {
  const { Icono } = vista;
  return (
    <button
      type="button"
      onClick={() => onNavigate?.(vista.id)}
      className="panel-card eva-tarjeta-vista"
      style={{
        textAlign: "left", cursor: "pointer",
        background: t.panel, borderRadius: 16, padding: "22px 22px 24px",
        // border y box-shadow: ver la regla `.eva-tarjeta-vista` en REJILLA.
        // Un color puesto aquí, inline, nunca cedería ante el :hover de la
        // hoja de estilos — por eso viajan como variables, no como propiedad.
        "--tv-border": t.border, "--tv-shadow": t.shadow, "--shadow-hover": t.shadowHover,
        animation: "fadeInUp 0.5s ease both", animationDelay: `${delay}s`,
        display: "flex", flexDirection: "column", gap: 14, width: "100%",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 46, height: 46, borderRadius: 9, background: t.gradAccent, color: "#FFFFFF",
            boxShadow: `0 4px 14px ${t.accent}4D`, flexShrink: 0,
          }}
        >
          <Icono size={20} />
        </span>
        {/* Sin `color` por prop: así el trazo queda en `currentColor` y hereda
            del `color` del wrapper, que sí puede perder ante el :hover de la
            hoja de estilos (la herencia cede ante cualquier regla explícita,
            a diferencia de un valor puesto inline en el propio elemento). */}
        <span className="eva-tarjeta-flecha" style={{ display: "inline-flex", color: t.textFaint }}>
          <ArrowRight size={16} />
        </span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: t.text, fontFamily: SANS }}>{vista.label}</div>
      <p style={{ margin: 0, fontSize: 12.5, color: t.textSoft, lineHeight: 1.5 }}>{vista.frase}</p>
    </button>
  );
}

function InicioEva({ onNavigate }) {
  const { theme: t } = useTheme();
  const { sistema, loading, error, lastUpdated } = useSistemaAgua();
  // Mismo criterio que dentro de `CifraEnVivo`: sin la primera lectura, "ahora
  // mismo" hablaría de un conteo que todavía no llegó. La espera se convierte
  // en un dato ("qué está pasando") en vez de quedar en un silencio junto a
  // los puntos suspensivos — la única red que puede tardar de verdad es la
  // real, y `VITE_ICONICS_CHAOS` existe justo para poder ensayar este momento.
  const listo = !loading || sistema.resumen.medidas > 0;

  return (
    <>
      <style>{REJILLA}</style>

      <div className="eva-inicio">
        <section
          className="eva-inicio-hero"
          style={{
            background: `radial-gradient(120% 100% at 50% 0%, ${t.accentSoft} 0%, ${t.page} 65%)`,
            border: `1px solid ${t.border}`,
          }}
        >
          <div className="blob" style={{ width: 340, height: 340, background: t.blob1, top: -160, left: -80 }} />
          <div className="blob" style={{ width: 280, height: 280, background: t.blob2, bottom: -140, right: -60, animationDelay: "-6s" }} />

          <div style={{ position: "relative" }}>
            <CifraEnVivo sistema={sistema} loading={loading} error={error} t={t} />
            {!error && (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0.3, color: t.textSoft, marginTop: 8 }}>
                  {listo ? "señales con lectura, ahora mismo" : "conectando con el servidor ICONICS…"}
                </div>
                <div style={{ marginTop: 10, display: "flex", justifyContent: "center" }}>
                  <UltimaLectura fecha={lastUpdated} t={t} />
                </div>
              </>
            )}

            <p className="eva-inicio-hero__frase" style={{ color: t.textSoft }}>
              El dato es real: cada número de este tablero viene de una lectura contra un
              servidor ICONICS de verdad, con su calidad y su marca de tiempo.
            </p>

            <Button variant="primary" icon={<ArrowRight size={15} />} onClick={() => onNavigate?.("eva-planta")}>
              Entrar a Planta
            </Button>
          </div>
        </section>

        <SectionLabel sub="La misma instalación, cuatro lentes distintas">
          Cuatro formas de verlo
        </SectionLabel>

        <div className="eva-inicio-grid">
          {VISTAS.map((vista, i) => (
            <TarjetaVista key={vista.id} vista={vista} onNavigate={onNavigate} t={t} delay={0.15 + i * 0.06} />
          ))}
        </div>
      </div>
    </>
  );
}

export default conFuenteEva(InicioEva);
