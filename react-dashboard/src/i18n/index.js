/**
 * La instancia de i18next del tablero: idiomas, namespaces, persistencia y
 * formateo regional.
 *
 * ── LO QUE ESTA CAPA NO HACE, Y ES LO IMPORTANTE ───────────────────
 *
 * No toca el dominio. Los estados de máquina, las bandas de riesgo y las
 * claves de señal siguen siendo los identificadores de `shared/eva/`
 * (`critico`, `nivelTanque`…) y la lógica sigue comparándolos como siempre.
 * Lo único que cambia es QUIÉN pone el texto al pintarlos.
 *
 * Eso no es una precaución teórica: `shared/` es dominio puro que consumen los
 * DOS programas (CLAUDE.md §2.6 y §2.7), y el backend compone con esas mismas
 * etiquetas las respuestas del asistente. Meter i18next ahí rompería la regla
 * y dejaría al servidor sin vocabulario. Por eso las etiquetas en español
 * siguen viviendo en `shared/` y aquí sólo se las traduce — ver
 * `useDominio.js`, que es el puente.
 *
 * ── POR QUÉ LOS RECURSOS VAN INCRUSTADOS Y NO SE CARGAN POR HTTP ───
 *
 * Un tablero de planta arranca en una red que puede no tener salida, y una
 * pantalla que se queda sin sus textos porque no pudo bajar un JSON es peor
 * que una en un idioma que no era el preferido. Los catorce namespaces de los dos
 * idiomas pesan poco y viajan en el bundle.
 *
 * ── LA FUNCIÓN DE TRADUCIR SE LLAMA `traducir`, NO `t` ─────────────
 *
 * Y no es capricho: en este tablero `t` YA es el tema. Lo usan así 45 archivos
 * (`const { theme: t } = useTheme()`) y 38 lo pasan como prop (`<Fila t={t}>`).
 * Escribir `const { t } = useTranslation()` en cualquiera de ellos sombrea el
 * tema, y el resultado no es un error de compilación: es un `t.panel` que de
 * pronto vale `undefined` y una pantalla sin fondo.
 *
 * Así que la convención de este proyecto es:
 *
 *     const { t: traducir } = useTranslation("dashboard");
 *
 * Larga a propósito. La alternativa —renombrar el tema en 83 archivos— es un
 * refactor mucho mayor que la propia internacionalización, y §43 pide no
 * arrastrar refactors funcionales innecesarios mientras se traduce.
 *
 * ── POR QUÉ NO HAY `Suspense` ──────────────────────────────────────
 *
 * `react-i18next` suspende mientras carga recursos. Aquí ya están cargados
 * cuando arranca React, así que suspender sólo añadiría un estado que nunca
 * ocurre — y en el `Shell` ese `Suspense` competiría con el que ya envuelve
 * las páginas diferidas (`app/App.jsx`), que sí tiene motivo.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import { CLAVE_ALMACEN, CODIGOS, IDIOMA_POR_DEFECTO, localeDe } from "./idiomas.js";

import esCommon from "./locales/es/common.json";
import esNavigation from "./locales/es/navigation.json";
import esLayout from "./locales/es/layout.json";
import esDashboard from "./locales/es/dashboard.json";
import esMachines from "./locales/es/machines.json";
import esSensors from "./locales/es/sensors.json";
import esAlarms from "./locales/es/alarms.json";
import esDiagnostics from "./locales/es/diagnostics.json";
import esMaintenance from "./locales/es/maintenance.json";
import esSettings from "./locales/es/settings.json";
import esValidation from "./locales/es/validation.json";
import esErrors from "./locales/es/errors.json";
import esAssistant from "./locales/es/assistant.json";
import esData from "./locales/es/data.json";

import enCommon from "./locales/en/common.json";
import enNavigation from "./locales/en/navigation.json";
import enLayout from "./locales/en/layout.json";
import enDashboard from "./locales/en/dashboard.json";
import enMachines from "./locales/en/machines.json";
import enSensors from "./locales/en/sensors.json";
import enAlarms from "./locales/en/alarms.json";
import enDiagnostics from "./locales/en/diagnostics.json";
import enMaintenance from "./locales/en/maintenance.json";
import enSettings from "./locales/en/settings.json";
import enValidation from "./locales/en/validation.json";
import enErrors from "./locales/en/errors.json";
import enAssistant from "./locales/en/assistant.json";
import enData from "./locales/en/data.json";

/**
 * Los namespaces, por ÁREA del producto y no por pantalla.
 *
 * Por pantalla se duplicaría «Guardar» una vez por vista, que es justo lo que
 * §40 viene a evitar; y una vista que se parte en dos obligaría a partir su
 * namespace. Por área, un texto vive donde vive su concepto: el vocabulario de
 * estado en `machines`, las etiquetas de señal en `sensors`, las acciones
 * repetidas en `common`.
 */
export const NAMESPACES = Object.freeze([
  "common",
  "navigation",
  "layout",
  "dashboard",
  "machines",
  "sensors",
  "alarms",
  "diagnostics",
  "maintenance",
  "settings",
  "validation",
  "errors",
  "assistant",
  "data",
]);

const resources = {
  es: {
    common: esCommon,
    navigation: esNavigation,
    layout: esLayout,
    dashboard: esDashboard,
    machines: esMachines,
    sensors: esSensors,
    alarms: esAlarms,
    diagnostics: esDiagnostics,
    maintenance: esMaintenance,
    settings: esSettings,
    validation: esValidation,
    errors: esErrors,
    assistant: esAssistant,
    data: esData,
  },
  en: {
    common: enCommon,
    navigation: enNavigation,
    layout: enLayout,
    dashboard: enDashboard,
    machines: enMachines,
    sensors: enSensors,
    alarms: enAlarms,
    diagnostics: enDiagnostics,
    maintenance: enMaintenance,
    settings: enSettings,
    validation: enValidation,
    errors: enErrors,
    assistant: enAssistant,
    data: enData,
  },
};

/** En desarrollo un texto que falta tiene que verse; en planta, no. */
const enDesarrollo = import.meta.env?.DEV === true;

/** Para no repetir el mismo aviso en cada repintado. Sólo en desarrollo. */
const faltantesVistas = new Set();

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: CODIGOS,
    /*
     * `fallbackLng` en español y no en inglés: si a una clave le falta el
     * inglés, sale en español —que un técnico de esta planta entiende— en vez
     * de salir como `machines.status.critico`, que no entiende nadie.
     */
    fallbackLng: IDIOMA_POR_DEFECTO,
    /*
     * `es-MX` del navegador tiene que resolver a `es`, no caer al fallback por
     * no encontrar un recurso llamado `es-MX`.
     */
    load: "languageOnly",
    nonExplicitSupportedLngs: true,

    ns: NAMESPACES,
    defaultNS: "common",

    detection: {
      /*
       * El orden es la política: manda lo que el usuario eligió aquí; si nunca
       * eligió, lo que declare su navegador; y si su navegador no habla
       * ninguno de los nuestros, el defecto. `querystring` va primero para
       * poder abrir un wallboard en un idioma concreto desde su propia URL
       * (`?lng=en`) sin tocar el equipo.
       */
      order: ["querystring", "localStorage", "navigator"],
      lookupQuerystring: "lng",
      lookupLocalStorage: CLAVE_ALMACEN,
      /* Sólo se persiste lo que el usuario elige, no lo que se detecta. */
      caches: ["localStorage"],
    },

    interpolation: {
      /* React ya escapa: volver a escapar aquí convierte `°` y `·` en entidades. */
      escapeValue: false,
      /*
       * Formateadores regionales disponibles desde cualquier traducción, sin
       * que el componente tenga que importar nada:
       *
       *   "Actualizado {{instante, hora}}"
       *   "{{valor, numero}} L/min"
       *   "{{parte, porcentaje}}"
       *
       * El `lng` que reciben es el de i18next; `localeDe` lo traduce al
       * BCP-47 con región que espera `Intl` (ver `idiomas.js`).
       */
      format(valor, formato, lng, opciones) {
        if (valor === null || valor === undefined) return "";
        const locale = localeDe(lng);

        switch (formato) {
          case "fecha":
            return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(valor);
          case "hora":
            return new Intl.DateTimeFormat(locale, { timeStyle: "medium" }).format(valor);
          case "fechaHora":
            return new Intl.DateTimeFormat(locale, {
              dateStyle: "long",
              timeStyle: "short",
            }).format(valor);
          case "numero":
            return new Intl.NumberFormat(locale, {
              maximumFractionDigits: opciones?.decimales ?? 2,
            }).format(valor);
          case "porcentaje":
            /* Recibe la PROPORCIÓN (0,42), no el 42: es lo que espera `Intl`. */
            return new Intl.NumberFormat(locale, {
              style: "percent",
              maximumFractionDigits: opciones?.decimales ?? 1,
            }).format(valor);
          default:
            return String(valor);
        }
      },
    },

    /*
     * En desarrollo, una clave sin traducir sale por consola UNA vez, con su
     * namespace y su idioma. En producción se calla: la pantalla ya enseña el
     * español del fallback, y un log por cada repintado de una tabla sería
     * ruido que tapa lo que sí importa.
     */
    saveMissing: enDesarrollo,
    missingKeyHandler: enDesarrollo
      ? (lngs, ns, key) => {
        const marca = `${lngs?.[0] ?? "?"}:${ns}:${key}`;
        if (faltantesVistas.has(marca)) return;
        faltantesVistas.add(marca);
        console.warn(`[i18n] falta traducción → ${marca}`);
      }
      : undefined,

    react: {
      /* Ver la cabecera: no hay nada que cargar de forma diferida. */
      useSuspense: false,
    },
  });

/*
 * La negrita dentro de una frase traducida. Se reexporta desde aquí para que
 * una vista sólo tenga que conocer `@/i18n`, y porque su cabecera explica por
 * qué NO se usa `<Trans>`.
 */
export { Enfasis } from "./Enfasis.jsx";

export default i18n;
