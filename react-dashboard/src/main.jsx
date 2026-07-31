/**
 * Punto de entrada de la aplicación: monta <App /> dentro de
 * <React.StrictMode> en el div#root de index.html e importa los estilos
 * globales (fuentes, animaciones y variables CSS de tema).
 */
import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/app/App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
