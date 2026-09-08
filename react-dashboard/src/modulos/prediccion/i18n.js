/**
 * El diccionario del módulo de Predicción, fuera del chunk de arranque.
 *
 * ── POR QUÉ ÉSTE SÍ Y LOS DEMÁS NO ─────────────────────────────────
 *
 * La cabecera de `@/i18n` explica por qué los recursos van INCRUSTADOS y no se
 * bajan por HTTP de un servidor de traducción: un tablero de planta arranca en
 * una red que puede no tener salida, y una pantalla sin sus textos es peor que
 * una en el idioma equivocado. Eso sigue siendo cierto y no cambia aquí.
 *
 * Lo que cambia es OTRA cosa: en qué trozo del propio build viaja. Las cinco
 * vistas de este módulo ya se cargan en diferido (`lazy()` en `routes.jsx`),
 * así que el navegador ya pide un chunk propio al abrirlas — del mismo origen,
 * del mismo `dist`, sin red externa. Que su diccionario viaje en ESE chunk en
 * vez de en el de arranque no añade ninguna petición nueva: la que ya se hacía
 * trae unos kilobytes más.
 *
 * Y el ahorro es real. Los dos idiomas de `prediction.json` son 17 KB de los
 * 103 que suman todos los diccionarios, y sirven a cinco pantallas que la
 * mayoría de las sesiones no abren: `verificar-bundle.mjs` paró el arranque en
 * 183,17 KB sobre un techo de 170 justo al añadirlos.
 *
 * ── POR QUÉ UN `import` ESTÁTICO Y NO UN `await import()` ──────────
 *
 * Porque el bundler garantiza que este módulo se evalúa ANTES que el
 * componente que lo importa. Con una carga asíncrona habría un instante en que
 * la vista pinta y el namespace todavía no está: claves crudas en pantalla.
 * Al importarlo desde las vistas del módulo, Rollup lo mete en el chunk de
 * ellas y lo ejecuta primero.
 *
 * ── SI ALGÚN DÍA HAY UN TERCER MÓDULO ──────────────────────────────
 *
 * Copia este patrón, no lo generalices antes de tiempo: son ocho líneas y el
 * criterio de cuándo aplica —«sus vistas ya son diferidas Y su diccionario
 * pesa»— es una decisión por módulo, no una regla automática.
 */
import i18n from "@/i18n";

import es from "@/i18n/locales/es/prediction.json";
import en from "@/i18n/locales/en/prediction.json";

/*
 * `false, true` son `deep` y `overwrite`: no fusiona en profundidad —el
 * namespace entra entero— y sí pisa lo que hubiera, para que un recargado en
 * caliente durante el desarrollo no acumule dos versiones.
 */
i18n.addResourceBundle("es", "prediction", es, false, true);
i18n.addResourceBundle("en", "prediction", en, false, true);
