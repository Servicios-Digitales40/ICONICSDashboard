/**
 * theme/ThemeContext.jsx
 * ------------------------------------------------------------------
 * Provee el tema actual (claro/oscuro) a toda la aplicación mediante
 * React Context, evitando tener que pasar `theme` como prop en cada
 * componente ("prop drilling").
 *
 * Uso en cualquier componente:
 *   const { theme, dark, toggleTheme } = useTheme();
 *   <div style={{ color: theme.text }}>...</div>
 */
import { createContext, useContext, useEffect, useState } from "react";
import { THEMES } from "./themes.js";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(true);
  const theme = dark ? THEMES.dark : THEMES.light;
  const toggleTheme = () => setDark((d) => !d);

  // Además de pasar `theme` por contexto (para estilos inline en JS),
  // reflejamos el modo actual como atributo en <html>. Esto permite que
  // index.css defina variables --color-* por tema y las use en reglas
  // que JS no puede tocar directamente, como :hover o :focus.
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
