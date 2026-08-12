/**
 * Barra superior fija: título de la página actual, buscador, notificaciones e
 * interruptores de origen de datos y de tema.
 */
import { Search, Bell, Sun, Moon, Shuffle, FlaskConical, Radio, Wifi } from "lucide-react";
import { useTheme } from "@/theme";
import { useDataSource, useIconicsStats } from "@/lib/datasource";
import { PAGE_META } from "../routes/index.js";
import { Input } from "@/components/ui/Input.jsx";
import { HoverTip } from "@/components/ui/HoverTip.jsx";
import { Avatar } from "@/components/ui/Avatar.jsx";

/**
 * Contador de peticiones por minuto, para medir el presupuesto de red en vez
 * de suponerlo. Si se dispara, suele significar que se ha reintroducido un
 * poller por componente.
 *
 * Solo en desarrollo: es instrumentación, no una función del producto.
 */
function ContadorRed({ t }) {
  const stats = useIconicsStats();
  if (!import.meta.env.DEV || !stats) return null;

  const alto = stats.peticionesPorMinuto > 30;

  return (
    <HoverTip label={`${stats.puntos} puntos activos · ${stats.motores.length} motores`}>
      <span
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "5px 9px", borderRadius: 8,
          background: t.panel, border: `1px solid ${alto ? t.coral : t.border}`,
          fontSize: 11, fontFamily: "'IBM Plex Mono', monospace",
          color: alto ? t.coral : t.textFaint,
        }}
      >
        <Radio size={12} />
        {stats.peticionesPorMinuto}/min
      </span>
    </HoverTip>
  );
}

/** Icono por origen. Es lo único de presentación que no vive en el dominio. */
const ICONO_ORIGEN = { real: Wifi, simulado: Radio };

/**
 * Qué build está corriendo esta pantalla.
 *
 * Lo inyecta el empaquetado desde `git describe`. Es lo primero que hace
 * falta cuando alguien de planta reporta que un número está mal: saber si esa
 * pantalla concreta ya tiene el arreglo, sin tener que ir hasta ella. Discreto
 * a propósito —no es información para el operador— pero visible sin
 * herramientas, que es lo que lo diferencia de mirarlo en la consola.
 */
function VersionBuild({ t }) {
  const version = import.meta.env.VITE_APP_VERSION;
  if (!version) return null;

  return (
    <span
      title={`Build ${version}`}
      style={{
        fontSize: 10.5, fontFamily: "'IBM Plex Mono', monospace",
        color: t.textFaint, opacity: 0.65, letterSpacing: 0.2,
      }}
    >
      {version}
    </span>
  );
}

export function Topbar({ page }) {
  const { theme: t, dark, toggleTheme } = useTheme();
  const { esSimulado, alternarTransporte, origen, conmutable } = useDataSource();
  const IconoOrigen = ICONO_ORIGEN[origen.key] ?? FlaskConical;
  const meta = PAGE_META[page];

  /* El indicador de origen es el mismo con y sin interruptor; lo que cambia es
     si además es pulsable. Se comparte el estilo para que no puedan derivar. */
  const estiloOrigen = {
    display: "flex", alignItems: "center", gap: 6,
    padding: "7px 12px", borderRadius: 999,
    background: origen.avisa ? `${t[origen.token]}22` : t.panel,
    border: `1px solid ${origen.avisa ? t[origen.token] : t.border}`,
    color: origen.avisa ? t[origen.token] : t.textSoft,
    fontSize: 12, fontWeight: 700, fontFamily: "inherit",
  };

  return (
    <div
      style={{
        position: "sticky", top: 0, zIndex: 30, background: `${t.page}E6`, backdropFilter: "blur(10px)",
        borderBottom: `1px solid ${t.border}`, padding: "18px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20,
      }}
    >
      <div>
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, color: t.text, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{meta.title}</h1>
        <p style={{ margin: "2px 0 0", fontSize: 12.5, color: t.textFaint }}>{meta.sub}</p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {/* <div style={{ width: 210 }}>
          <Input icon={<Search size={14} />} placeholder="Buscar…" />
        </div> */}

        {/* <HoverTip label="3 notificaciones">
          <span style={{ position: "relative", display: "flex", padding: 9, borderRadius: 9, background: t.panel, border: `1px solid ${t.border}`, cursor: "pointer" }}>
            <Bell size={16} color={t.textSoft} />
            <span style={{ position: "absolute", top: 6, right: 6, width: 7, height: 7, borderRadius: "50%", background: t.coral, border: `1.5px solid ${t.panel}` }} />
          </span>
        </HoverTip> */}
{/* Para restaurar este botón hay que volver a montar <DataProvider> (hoy
            archivado en _deprecated/providers/) y recuperar aquí el
            `const { regenerate, regenerating } = useData();`. Se retiró la
            llamada porque el botón lleva comentado desde hace tiempo y el
            provider era su último consumidor vivo.

        <button
          className="shuffle-btn"
          onClick={regenerate}
          style={{
            display: "flex", alignItems: "center", gap: 6, background: t.gradAccent, color: "#FFFFFF", border: "none",
            borderRadius: 999, padding: "9px 16px", fontSize: 12.5, fontFamily: "'IBM Plex Mono', monospace",
            fontWeight: 600, cursor: "pointer", boxShadow: `0 4px 14px ${t.accent}4D`,
          }}
        >
          <Shuffle size={13} className={regenerating ? "shuffle-icon-spin" : ""} />
          regenerar
        </button> */}

        <ContadorRed t={t} />
        <VersionBuild t={t} />

        {/* Indicador de ORIGEN.

            Antes solo decía «En vivo» o «Demo», y ese «En vivo» tapaba dos
            situaciones muy distintas: leer ICONICS de verdad o leer el
            simulador. Como los valores del simulador son plausibles a
            propósito, no había forma de notar la diferencia mirando la
            pantalla.

            Sin el interruptor compilado (`VITE_ENABLE_SIMULATOR`) el indicador
            se queda, porque distinguir el servidor real del simulador sigue
            importando; lo que desaparece es la posibilidad de pulsarlo. */}
        {conmutable ? (
          <HoverTip label={esSimulado ? "Volver a datos de ICONICS" : `${origen.descripcion} · pulsa para usar el simulador`}>
            <button
              onClick={alternarTransporte}
              aria-pressed={esSimulado}
              aria-label={`Origen de datos: ${origen.descripcion}`}
              style={{ ...estiloOrigen, cursor: "pointer" }}
            >
              <IconoOrigen size={13} strokeWidth={2.5} />
              {origen.label}
            </button>
          </HoverTip>
        ) : (
          <HoverTip label={origen.descripcion}>
            <span role="status" aria-label={`Origen de datos: ${origen.descripcion}`} style={estiloOrigen}>
              <IconoOrigen size={13} strokeWidth={2.5} />
              {origen.label}
            </span>
          </HoverTip>
        )}

        <button
          onClick={toggleTheme}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", background: t.accentSoft, border: "none", cursor: "pointer" }}
        >
          {dark ? <Moon size={15} color={t.accent} /> : <Sun size={15} color={t.accent} />}
        </button>

        {/* <Avatar name="Ana Torres" size={34} /> */}
      </div>
    </div>
  );
}
