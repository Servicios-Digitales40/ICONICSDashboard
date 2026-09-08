/**
 * Punto de entrada de la aplicación: monta <App /> dentro de
 * <React.StrictMode> en el div#root de index.html e importa los estilos
 * globales (fuentes, animaciones y variables CSS de tema).
 *
 * ── POR QUÉ i18n SE IMPORTA AQUÍ Y NO EN UN PROVIDER ───────────────
 *
 * Porque `i18n/index.js` inicializa una instancia ÚNICA al importarse y
 * `react-i18next` la encuentra sola: no hace falta envolver el árbol en un
 * `<I18nextProvider>`. Importarla en el punto de entrada garantiza que los
 * recursos están puestos antes del primer pintado, así que ningún componente
 * ve un instante con las claves sin resolver.
 *
 * Va ANTES de `App` a propósito: el orden de los imports es el de evaluación,
 * y una vista que se importe en cascada desde `App` podría llamar a `t()`
 * durante su propia evaluación de módulo.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import "@/i18n";
import App from "@/app/App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
