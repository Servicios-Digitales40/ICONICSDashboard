/**
 * Paleta de comandos: `Ctrl/Cmd+K` y se escribe a dónde ir (Plan 24 F6 · `USO-06`).
 *
 * ── POR QUÉ EXISTE / POR QUÉ ASÍ ────────────────────────────────────
 *
 * Con veinte rutas repartidas en cuatro secciones, llegar a «Riesgos ·
 * Vibraciones» desde «Documentación» son tres clics y saber de antemano en qué
 * sección vive. Quien usa el tablero a diario ya sabe el NOMBRE de lo que
 * busca; lo que no tiene es una forma de escribirlo.
 *
 * ── LOS DESTINOS SALEN DEL REGISTRO, NUNCA DE UNA LISTA ────────────
 *
 * `ROUTES` y `NAV_GROUPS` de `app/routes/`. Una lista escrita a mano aquí se
 * quedaría vieja en cuanto entre la máquina #3 —es el fallo que
 * `BACKLOG-FRONTEND.md` F4 ya describe para el sidebar— y lo peor es cómo
 * fallaría: la paleta seguiría funcionando, sólo que sin la pantalla nueva, y
 * nadie relacionaría las dos cosas.
 *
 * Los nombres tampoco se escriben: salen de `navigation.json` por el id de la
 * ruta, que es de donde ya los lee el sidebar y el Topbar. Así la paleta está
 * traducida por construcción y no por acordarse.
 *
 * ── NO APARECE EN MODO MURO ────────────────────────────────────────
 *
 * Un wallboard colgado a tres metros no tiene teclado, así que un atajo de
 * teclado ahí es superficie que no se puede usar. `App.jsx` ya retira el cromo
 * con `muro.activo` y esto sigue la misma puerta — no se monta siquiera, en vez
 * de montarse y esconderse.
 *
 * ── SIN DEPENDENCIA NUEVA, Y DIFERIDA ──────────────────────────────
 *
 * Mismo criterio que `useNavegacion` aplicó al enrutador: una dependencia en el
 * bundle de planta tiene que ganarse su sitio, y un filtro sobre veinte
 * cadenas no lo necesita. Y va en `lazy()` como el asistente, con el cuidado
 * que `App.jsx` documenta: se importa el COMPONENTE y no un barril, porque con
 * el barril Rollup nombra el trozo `index.js`, genera un segundo `index-*.js` y
 * `verificar-bundle.mjs` mide el que encuentre primero.
 *
 * ── LO QUE NO HACE, A PROPÓSITO ────────────────────────────────────
 *
 * No acciona nada. Navega, y abre el asistente con una pregunta —que es lo
 * mismo que ya hace `pedirAlAsistente()` desde una vista—. Encender una bomba
 * desde una caja de texto con autocompletado es exactamente la clase de atajo
 * que una instalación no debe tener: `ControlesTanque` pide dos clics
 * deliberados para eso, y la paleta no puede ser la puerta de atrás.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";

import { useTheme } from "@/theme";
import { ROUTES } from "./routes/routes.jsx";

/** Sin acentos y en minúsculas, para que «vibración» encuentre «vibracion». */
function normalizar(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function PaletaComandos({ onNavigate, paginaActual }) {
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation(["navigation", "common"]);
  const { theme: t } = useTheme();

  const [abierta, setAbierta] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [indice, setIndice] = useState(0);
  const inputRef = useRef(null);

  /**
   * Los destinos, con su nombre ya traducido. Del registro (ver cabecera).
   *
   * Se memoiza por `traducir` porque react-i18next devuelve una función nueva al
   * cambiar de idioma: sin eso, la lista se quedaría con los nombres del idioma
   * en que se montó la paleta.
   */
  const destinos = useMemo(
    () =>
      ROUTES.map((r) => ({
        id: r.id,
        titulo: traducir(`navigation:routes.${r.id}.title`, { defaultValue: r.id }),
        nav: traducir(`navigation:routes.${r.id}.nav`, { defaultValue: r.id }),
        seccion: r.nav?.group
          ? traducir(`navigation:sections.${r.nav.group}`, { defaultValue: "" })
          : "",
      })),
    [traducir]
  );

  const resultados = useMemo(() => {
    const q = normalizar(consulta).trim();
    /*
     * Sin consulta se enseña todo, no una lista vacía: abrir la paleta y ver el
     * catálogo completo también es una forma de usarla —«qué pantallas hay»— y
     * es lo que hace que el atajo se pueda descubrir sin leer documentación.
     */
    if (!q) return destinos;

    /* Se busca en las tres formas del nombre y en su sección: quien escribe
       «vibra» puede estar pensando en la sección, no en la pantalla. */
    return destinos.filter((d) =>
      [d.titulo, d.nav, d.seccion, d.id].some((campo) => normalizar(campo).includes(q))
    );
  }, [consulta, destinos]);

  /* Al filtrar, la selección vuelve arriba: dejarla en la fila 7 de una lista
     que ahora tiene 2 elementos apuntaría a algo que ya no está. */
  useEffect(() => setIndice(0), [consulta]);

  const cerrar = useCallback(() => {
    setAbierta(false);
    setConsulta("");
    setIndice(0);
  }, []);

  const ir = useCallback(
    (id) => {
      cerrar();
      onNavigate?.(id);
    },
    [cerrar, onNavigate]
  );

  /* El atajo global. `Ctrl+K` y `Cmd+K`: el segundo es el de macOS, y aunque el
     destino sea Windows, el desarrollo no siempre lo es. */
  useEffect(() => {
    const alPulsar = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); // sin esto, Firefox se lleva el foco a su barra
        setAbierta((v) => !v);
      }
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, []);

  /* El foco entra en la caja al abrir: una paleta que hay que clicar para
     escribir no ahorra nada respecto al sidebar. */
  useEffect(() => {
    if (abierta) inputRef.current?.focus();
  }, [abierta]);

  if (!abierta) return null;

  const alTeclear = (e) => {
    if (e.key === "Escape") {
      cerrar();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndice((i) => Math.min(i + 1, resultados.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndice((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter" && resultados[indice]) {
      ir(resultados[indice].id);
    }
  };

  return (
    /*
     * El fondo cierra al pulsarlo, igual que la maqueta 3D cierra su ficha al
     * pulsar el suelo. No es un `<dialog>` nativo: `showModal()` necesita una
     * referencia imperativa y un `::backdrop` que este sistema de temas no
     * puede colorear con sus tokens.
     */
    <div
      onClick={cerrar}
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingTop: "12vh",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={traducir("navigation:palette.title")}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, calc(100vw - 32px))",
          background: t.panel, border: `1px solid ${t.border}`,
          borderRadius: 14, boxShadow: t.shadowHover, overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: `1px solid ${t.border}` }}>
          <Search size={16} style={{ color: t.textFaint, flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            onKeyDown={alTeclear}
            placeholder={traducir("navigation:palette.placeholder")}
            aria-label={traducir("navigation:palette.placeholder")}
            style={{
              flex: 1, minWidth: 0, border: "none", outline: "none",
              background: "transparent", color: t.text, fontSize: 14,
              fontFamily: "'Inter', sans-serif",
            }}
          />
        </div>

        {resultados.length === 0 ? (
          <div style={{ padding: "18px 14px", fontSize: 13, color: t.textFaint }}>
            {traducir("navigation:palette.empty")}
          </div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 6, maxHeight: "52vh", overflowY: "auto" }}>
            {resultados.map((d, i) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => ir(d.id)}
                  onMouseEnter={() => setIndice(i)}
                  aria-current={d.id === paginaActual ? "page" : undefined}
                  style={{
                    display: "flex", alignItems: "baseline", gap: 10, width: "100%",
                    textAlign: "left", cursor: "pointer", border: "none", borderRadius: 8,
                    padding: "9px 10px",
                    background: i === indice ? t.hover : "transparent",
                    color: t.text, fontFamily: "'Inter', sans-serif",
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, minWidth: 0 }}>{d.nav}</span>
                  {d.seccion && (
                    <span style={{ fontSize: 11, color: t.textFaint }}>{d.seccion}</span>
                  )}
                  {d.id === paginaActual && (
                    <span style={{ marginLeft: "auto", fontSize: 10.5, color: t.textFaint }}>
                      {traducir("navigation:palette.current")}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default PaletaComandos;
