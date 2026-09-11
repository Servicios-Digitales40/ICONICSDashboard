# Plan 22.5 · Integrar Gustavo5 en una rama nueva IntegracionMoises6Gustavo5

> **Objetivo.** Traer a `Mejoras-Demo-6.0` las ocho mejoras que se acumularon
> en `origin/Gustavo5` desde que divergió (`dd557a6`) — identidad de marca
> TDCON en los reportes PDF, un módulo nuevo de vida de rodamiento, el
> respaldo sin modelo aprendiendo a resumir vibraciones, y auto-corte por
> silencio en el dictado, entre otras — sin perder ningún trabajo de los
> Planes 20-27 ni de la sesión de hoy (fix de contexto/polaridad, reorganización
> de `docs/`).

> **Rama.** Nueva, `IntegracionMoises6Gustavo5`, creada desde `Mejoras-Demo-6.0`
> — no desde `main` ni desde `Gustavo5`, porque el trabajo activo vive en la
> primera.

> **ESTADO — SIN EMPEZAR (10-09-2026).** Investigado con `git diff`/`git show`
> contra ambas ramas, no supuesto: la divergencia y los conflictos exactos ya
> están identificados (§1). Este documento es el plan, la ejecución es el
> paso siguiente.

> **Por qué el número 22.5.** Es trabajo de integración de ramas, no una
> fase nueva del roadmap de 60 mejoras (`docs/HOJA-DE-RUTA-60-MEJORAS.md`,
> que sigue en Plan 26). Se numera junto al Plan 22 —el más reciente ya
> cerrado antes de esta sesión— para que quede fechado en su sitio sin
> desplazar la numeración de los Planes 23-26 ya reservada.

---

## 1 · La divergencia, medida no supuesta

`Gustavo5` tiene 8 commits propios desde el punto común (`dd557a6`);
`Mejoras-Demo-6.0` tiene 85. De los archivos que Gustavo5 tocó, sólo 4
también los tocó `Mejoras-Demo-6.0`, y de esos 4 sólo 2 generan conflicto de
mezcla real — confirmado con `git diff dd557a6 <rama> -- <archivo>` en ambos
sentidos, no por cercanía de nombre de archivo:

| Archivo | Riesgo | Motivo, con líneas |
|---|---|---|
| `shared/eva/vibraciones/vibraciones.js` | Bajo | Ambos lados INSERTAN bloques nuevos justo después de `export const CANAL` (línea base ~174), sin tocar código existente. Git puede marcar un hunk-conflict de "los dos añaden en el mismo punto", trivial de resolver concatenando los dos bloques (mi lado: `TREN_MECANICO`/`ELEMENTO_TREN`/`elementoDeCanal`/`ACELEROMETRO`/`EJES_MEDIDA`/`EJE`; Gustavo5: `CARGA_RADIAL_APROX_N`). |
| `backend/ia/conversacion/chat.mjs` | Bajo | Gustavo5 sólo agrega 26 líneas dentro de `resumirSinModelo()` (base 1181-1186): la rama que resume `estado_del_sistema` de vibraciones cuando el modelo no llega a redactar. Confirmado que ninguno de mis 7 commits recientes toca esa función — mi hunk más cercano termina en la línea 1096, antes de que `resumirSinModelo()` empiece (línea base 1151). |
| `backend/ia/reporte.mjs` | **Real** | Mi commit `a55c06b` (Plan 21 F7) inserta un bloque de aviso de cobertura entre el `doc.text(...)` del resumen y el `if (grafico.interpretacion)` de `componerReportePdf` (base ~128-143). Gustavo5 reescribe ESE MISMO tramo para la marca TDCON: `doc.font('Helvetica').fontSize(10).fillColor(GRIS)` y cada `doc.text(...)` gana `MARGEN, doc.y, { width: ANCHO_TEXTO }` (su versión final, línea ~456-467). Los dos cambios son compatibles en intención — ninguno anula al otro — pero el merge automático no puede fusionarlos solo. |
| `react-dashboard/src/features/asistente/components/Asistente.jsx` | **Real** | Gustavo5 reescribe la firma y el cuerpo de `BotonMicrofono` (base 738-778): auto-corte por silencio, `MS_SILENCIO_DICTADO`, `onEnviar`, `enviarRef`, y el `aria-label`/`title` del botón. Mis 3 commits de i18n insertaron `useTranslation`/`traducir(...)` exactamente en esa misma firma (745-757) y en ese mismo `aria-label`/`title` (768-778). |

## 2 · Estrategia de mezcla

`git merge origin/Gustavo5 --no-ff` sobre la rama nueva — no un rebase, para
conservar el historial de los 8 commits tal cual están, con su autoría y sus
mensajes (varios ya documentan decisiones de diseño que conviene no perder,
como la reversión del `openImage` que dejaba páginas en blanco).

**Criterio de resolución de los dos conflictos reales, decidido de antemano:**

- **`reporte.mjs`**: el bloque de cobertura se reinserta DENTRO de la versión
  con marca TDCON, adoptando su mismo estilo (`MARGEN, doc.y, { width:
  ANCHO_TEXTO }`) — no se descarta ninguna de las dos features, se hace que
  la más nueva (marca) envuelva a la más vieja (cobertura).
- **`Asistente.jsx`**: se conservan las DOS cosas. La lógica de auto-corte
  por silencio de Gustavo5 se queda completa; el texto del `aria-label`/
  `title` pasa a usar `traducir(...)` en vez de quedar hardcoded en español
  — si el texto de auto-corte ("o calla 3 s y se envía solo") no tiene ya una
  clave en `i18n/locales/{es,en}/assistant.json`, se añade una nueva.

No se toca ICONICS, ni el dominio del tanque, ni ningún documento movido en
la reorganización de `docs/` de hoy — la integración es puramente de código
de asistente, vibraciones y reportes.

## 3 · Pasos

1. **Preparación.** `git fetch --all`, confirmar árbol de trabajo limpio,
   crear `IntegracionMoises6Gustavo5` desde `Mejoras-Demo-6.0`.
2. **Merge.** `git merge origin/Gustavo5 --no-ff -m "..."`. Se espera
   conflicto real en `reporte.mjs` y `Asistente.jsx`; posible hunk-conflict
   trivial en `vibraciones.js`; `chat.mjs` debería fusionar solo.
3. **Resolver `vibraciones.js`** (si marca conflicto): conservar ambos
   bloques nuevos, uno junto al otro, sin reordenar ni fusionar su contenido.
4. **Resolver `chat.mjs`** (si marca conflicto, no debería): confirmar que la
   rama `if (Array.isArray(resultado.apoyos))` de Gustavo5 queda intacta
   dentro de `resumirSinModelo()`.
5. **Resolver `reporte.mjs`** con el criterio de §2: reinsertar el bloque
   `if (grafico.cobertura && !grafico.cobertura.completa) {...}` entre el
   `doc.text(...)` del resumen y el `if (grafico.interpretacion)`, con
   `MARGEN, doc.y, { width: ANCHO_TEXTO }`. Revisar el JSDoc de
   `componerReportePdf` por si el merge automático dejó dos versiones
   distintas del tipo de `datos.graficos` (una con `cobertura`, otra sin).
6. **Resolver `Asistente.jsx`** con el criterio de §2: fusionar la firma de
   `BotonMicrofono` para que reciba `onEnviar`/`enviarRef` (Gustavo5) Y el
   hook de traducción (mi lado); conservar `MS_SILENCIO_DICTADO` y
   `vigilarSilencio` completos; mover el texto nuevo de auto-corte a
   `traducir(...)`, añadiendo la clave a `es`/`en` si hace falta.
7. **Verificación offline, antes de comitear el merge:**
   - `npm run lint && npm run types` en la raíz.
   - `npm run verificar` en la raíz (26 verificadores) — atención particular
     a `verificar-catalogo.mjs` (por `vibraciones.js`), `verificar-chat.mjs`
     (por `resumirSinModelo`), `verificar-vida-rodamiento.mjs` (nuevo, de
     Gustavo5 — confirmar que corre igual dentro de la tanda completa, no
     sólo suelto), `verificar-i18n.mjs`/`verificar-textos.mjs` (por la clave
     nueva de `Asistente.jsx`).
   - `npm test` en `backend/` y en `react-dashboard/`.
   - `npm run build` en `react-dashboard/` — confirmar que los assets nuevos
     de `backend/ia/marca/*.png` (banner, cintillo, portada) NO entran al
     bundle de frontend y no rompen `verificar-bundle.mjs` — son de backend,
     no deberían, pero se confirma en vez de asumirlo.
   - `node scripts/frecuencias-rodamiento.mjs 6205 1750 --carga 1400 --horas 5000`
     a mano, para confirmar que el guion nuevo corre en el árbol fusionado.
8. **Prueba funcional dirigida** (con `ICONICS_FAKE=true`, sin necesitar
   planta ni GPU para lo estructural):
   - Generar un reporte PDF (`generar_reporte`) y confirmar a ojo que sale
     con la marca TDCON Y con el aviso de cobertura cuando corresponda —
     las dos features del mismo archivo, verificar que ninguna se perdió al
     resolver el conflicto.
   - Si hay acceso a `llama-server`: una consulta de vibraciones con el
     modelo forzado a fallar o a agotar el presupuesto de rondas, para
     confirmar que `resumirSinModelo` cae en la rama nueva de `apoyos`.
   - Probar el botón de dictado en el navegador: confirmar que el auto-corte
     por silencio a los 3 s sigue funcionando Y que el `aria-label`/`title`
     sale traducido — cambiar el idioma del tablero a inglés y confirmar que
     el texto del botón también cambia.
9. **Commit del merge** con mensaje que documente qué se trajo y cómo se
   resolvieron los dos conflictos reales — no un mensaje genérico de "merge
   branch 'Gustavo5'".
10. **Sin push.** La rama queda local hasta que se pida explícitamente en ese
    turno.

## 4 · Lo que este plan NO hace

- No decide si `Gustavo5` o `Mejoras-Demo-6.0` se actualizan, se renombran o
  se cierran después de esto — sólo crea la rama de integración.
- No reconfirma `CARGA_RADIAL_APROX_N` (marcada `provisional` por su propio
  commit de origen) contra una carga real del banco — ya está anotado como
  pendiente ahí y no es parte de esta integración.
- No toca ningún documento de `docs/completados`/`docs/por-completar`/
  `docs/obsoletos` movidos en la reorganización de hoy.
- No abre ninguna fase del Plan 23 (Asistente) ni de los planes 24-26 de la
  hoja de ruta — es una integración de trabajo YA HECHO en otra rama, no
  trabajo nuevo del roadmap.
