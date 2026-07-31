/**
 * Provee el tema actual (claro u oscuro) a toda la aplicación por contexto,
 * para no pasar `theme` como prop en cada componente.
 *
 *   const { theme, dark, toggleTheme } = useTheme();
 *   <div style={{ color: theme.text }}>…</div>
 */
import { createContext, useContext, useEffect, useState } from "react";
import { THEMES } from "./themes.js";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(true);
  const theme = dark ? THEMES.dark : THEMES.light;
  const toggleTheme = () => setDark((d) => !d);

  // Además de pasar `theme` por contexto para los estilos inline, el modo
  // actual se refleja como atributo en <html>. Así index.css puede definir
  // variables --color-* por tema y usarlas en reglas que JS no alcanza, como
  // :hover o :focus.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <ThemeContext.Provider value={{ theme, dark, toggleTheme }}>
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
