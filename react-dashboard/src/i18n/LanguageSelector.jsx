/**
 * El selector de idioma. Único sitio de la aplicación que cambia el idioma.
 *
 * ── POR QUÉ UN GRUPO DE BOTONES Y NO UN DESPLEGABLE ────────────────
 *
 * Con dos idiomas, un `<select>` esconde detrás de un clic lo que cabe a la
 * vista, y en una pantalla táctil de planta —con guantes— acertar una opción
 * de una lista desplegada es peor que pulsar un botón de 34 px. El día que
 * haya cuatro idiomas esto se convierte en un desplegable y el resto de la
 * aplicación no se entera, porque nadie más cambia el idioma.
 *
 * ── ACCESIBILIDAD ──────────────────────────────────────────────────
 *
 * Es un `radiogroup`: son opciones excluyentes de un mismo ajuste, no acciones
 * independientes. `aria-checked` dice cuál está puesto —el color por sí solo
 * no se lo cuenta a un lector de pantalla— y el grupo lleva su propia
 * etiqueta, traducida. El nombre de cada idioma va en su propio idioma y por
 * eso lleva `lang`: sin él, un lector configurado en español leería «English»
 * con fonética española.
 *
 * ── LA PERSISTENCIA NO ESTÁ AQUÍ ───────────────────────────────────
 *
 * `changeLanguage` la dispara, pero quien escribe en `localStorage` es el
 * detector de i18next (`caches: ["localStorage"]`, ver `index.js`). Este
 * componente no toca el almacén: si lo hiciera, habría dos sitios escribiendo
 * la misma clave y bastaría cambiar uno para que dejaran de coincidir.
 */
import { useTranslation } from "react-i18next";

import { useTheme } from "@/theme";
import { CODIGOS, IDIOMAS } from "./idiomas.js";

export function LanguageSelector() {
  const { theme } = useTheme();
  const { t, i18n } = useTranslation("common");
  /*
   * `resolvedLanguage` y no `language`: con `es-MX` detectado del navegador,
   * `language` vale «es-MX» y ninguna opción coincidiría, así que el grupo se
   * pintaría sin ninguna marcada. `resolvedLanguage` da el que de verdad se
   * está sirviendo («es»), que es lo que hay que resaltar.
   */
  const activo = i18n.resolvedLanguage ?? i18n.language;

  return (
    <div
      role="radiogroup"
      aria-label={t("language.label")}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: 2,
        borderRadius: 999,
        background: theme.panel,
        border: `1px solid ${theme.border}`,
      }}
    >
      {CODIGOS.map((codigo) => {
        const idioma = IDIOMAS[codigo];
        const puesto = codigo === activo;

        return (
          <button
            key={codigo}
            type="button"
            role="radio"
            aria-checked={puesto}
            lang={codigo}
            /*
             * El título completo va en `title` y la abreviatura en el botón:
             * «ES» cabe en la barra, «Español» no, y un botón de dos letras
             * sin nombre accesible no dice nada. `aria-label` lleva el nombre
             * entero.
             */
            aria-label={idioma.nombre}
            title={idioma.nombre}
            onClick={() => i18n.changeLanguage(codigo)}
            style={{
              minWidth: 32,
              height: 26,
              padding: "0 9px",
              borderRadius: 999,
              border: "none",
              cursor: puesto ? "default" : "pointer",
              background: puesto ? theme.accentSoft : "transparent",
              color: puesto ? theme.accent : theme.textFaint,
              fontSize: 11.5,
              fontWeight: 700,
              fontFamily: "'IBM Plex Mono', monospace",
              letterSpacing: 0.3,
            }}
          >
            {codigo.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
