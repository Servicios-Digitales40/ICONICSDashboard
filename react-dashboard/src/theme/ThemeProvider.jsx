/**
 * Provee el tema actual a toda la aplicación por contexto, para no pasar
 * `theme` como prop en cada componente.
 *
 *   const { theme, dark, modo, toggleTheme } = useTheme();
 *   <div style={{ color: theme.text }}>…</div>
 *
 * ── POR QUÉ `modo` Y NO SÓLO `dark` ─────────────────────────────────
 *
 * Hasta el tercer tema («Mitsubishi», ver `themes.js`) `dark` bastaba porque
 * sólo había dos estados. Con tres, una sola bandera booleana ya no puede
 * decir cuál está activo — así que `modo` se AÑADE con el nombre completo, y
 * `dark` se queda como una lectura derivada (`modo === "dark"`) para que el
 * puñado de componentes que ya lo usaban —sobre todo en la pila 3D, donde
 * `dark` decide si la escena es de fondo claro u oscuro— sigan funcionando
 * sin tocarlos: el tema Mitsubishi es de superficie clara, así que para ellos
 * se comporta exactamente como `light`.
 */
import { createContext, useContext, useEffect, useState } from "react";
import { THEMES } from "./themes.js";

const ThemeContext = createContext(null);

/** Orden del ciclo al pulsar el interruptor. */
const CICLO_MODOS = ["light", "dark", "mitsubishi"];

export function ThemeProvider({ children }) {
  const [modo, setModo] = useState("dark");
  const theme = THEMES[modo];
  const dark = modo === "dark";
  const toggleTheme = () => setModo((m) => CICLO_MODOS[(CICLO_MODOS.indexOf(m) + 1) % CICLO_MODOS.length]);

  // Además de pasar `theme` por contexto para los estilos inline, el modo
  // actual se refleja como atributo en <html>. Así index.css puede definir
  // variables --color-* por tema y usarlas en reglas que JS no alcanza, como
  // :hover o :focus.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", modo);
  }, [modo]);

  return (
    <ThemeContext.Provider value={{ theme, dark, modo, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** Hook de acceso. Lanza un error claro si se usa fuera del Provider. */
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme() debe usarse dentro de <ThemeProvider>");
  return ctx;
}
