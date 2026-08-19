---
target: eva-planta (PlantaEva.jsx)
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-08-19T14-03-23Z
slug: react-dashboard-src-demo-eva-views-plantaeva-jsx
---
# Crítica de UX — `eva-planta` (`PlantaEva.jsx`)

**Method: dual-agent (A: general-purpose design-review subagent · B: general-purpose detector subagent)**

**Nota de reconciliación:** el worktree de Assessment B no tenía sincronizado el árbol de trabajo actual y extrajo los archivos del commit `demo-3` (`git show`), así que sus 3 hallazgos de `borderLeft`/`layout-transition` corresponden a código que ya se había arreglado en esta sesión pero seguía sin comitear. Se re-corrió el detector contra el árbol de trabajo real: 0 hallazgos, exit 0. Se tratan como resueltos, no como issues abiertos.

## Design Health Score

| # | Heurística | Puntaje | Hallazgo clave |
|---|-----------|-------|-----------------|
| 1 | Visibilidad del estado del sistema | 3 | Hay estados de carga y NotaProcedencia, pero ningún timestamp de "última lectura" visible pese a que PRODUCT.md promete marca de tiempo por lectura. |
| 2 | Coincidencia sistema/mundo real | 3 | Lenguaje en español natural en general; "modo del variador" muestra modo.tag crudo sin explicar qué es un VFD. |
| 3 | Control y libertad del usuario | 2 | Sin zoom en gráficas, sin forma de cambiar la ventana de tiempo, sin cerrar NotaProcedencia. Superficie de solo lectura por diseño, pero con cero agencia. |
| 4 | Consistencia y estándares | 2 | Card en base.jsx duplica Panel.jsx en vez de componerlo. Más grave: Delta y el líder de MargenesConsumidos colorean texto con t.viz.*/estadoColor(), violando la Regla de las Dos Paletas del propio DESIGN.md. |
| 5 | Prevención de errores | 3 | hasValue() y fallbacks SIN_DATO evitan renderizar matemática rota sobre datos ausentes. |
| 6 | Reconocimiento antes que recuerdo | 2 | Estado siempre va con punto+etiqueta (bien), pero abreviaturas tipo .corto truncan sin glosario visible. |
| 7 | Flexibilidad y eficiencia | 1 | Nada acelera al usuario recurrente: sin atajos, sin filtro, sin saltar a una señal concreta. Aceptable para demo guiada, pero puntúa bajo en sus propios términos. |
| 8 | Diseño estético y minimalista | 2 | Restringido y on-brand en general; penalizado por los fallos de contraste medidos abajo. |
| 9 | Ayuda a reconocer/diagnosticar errores | 2 | AlertBanner de fetch es claro. El estado "crítico" solo se anuncia con color + pulso + abreviatura de 2 letras, sin explicar qué implica. |
| 10 | Ayuda y documentación | 1 | NotaProcedencia es el único explicador de todo el sistema de color, y se ve como nota al pie de 11.5px. |
| **Total** | | **21/40** | Por debajo del promedio típico (20-32), base sólida pero ejecución incompleta |

## Veredicto de especificidad de diseño

**LLM assessment:** Autorado específicamente para una demo de sensores industriales de agua, no un dashboard genérico con piel nueva. NotaProcedencia declara explícitamente que los colores salen de comparar contra umbrales locales, no de alarmas de ICONICS — eco directo del principio 1 de PRODUCT.md. StatSenal cae a mostrar el tag en vez de inventar una unidad cuando senal.unidad está vacío. Los chips de FranjaAtencion deliberadamente no son botones. El vínculo con la vista 3D (North Star "El Gemelo Digital") existe pero solo se descubre haciendo clic.

**Deterministic scan:** El detector no encontró nada en el árbol actual (0/0). Los 3 hallazgos de la corrida stale (side-tab x2 en líneas 62/465, layout-transition en línea 661) ya están resueltos: FranjaAtencion pasó a borde completo de 1px, TarjetaActivo perdió el borde lateral redundante con PuntoEstado, y la barra de márgenes usa transform: scaleX() en vez de animar width. Ningún falso positivo detectado sobre el código actual. El grep de accesibilidad encontró que Card (base.jsx:62-76) acepta un prop onClick sin role/tabIndex/onKeyDown propios — pero ningún <Card> en estos tres archivos lo invoca con onClick, así que hoy es capacidad muerta, no un bug activo. Cero drift de color: ningún hex literal fuera del sistema de tokens en estos archivos.

**Visual overlays:** No disponibles — sin automatización de navegador en este entorno.

## Overall Impression

Una pantalla con convicción de producto real, pero con dos grietas que contradicen reglas que el propio DESIGN.md acaba de fijar (color de dato usado como texto, sin foco visible en tarjetas interactivas) y una falta de explicación en el momento exacto donde un prospecto sin contexto más la necesita: la alarma "crítico".

## What's Working

1. **Delta's subirEsBueno = null** (base.jsx:152-166): se niega a colorear una dirección como buena/mala cuando no hay una dirección objetivamente mejor.
2. **BarraBanda's banda como zona, no como marca** (tiles.jsx:152-196): pinta la banda cómoda como región teñida en vez de un solo tick de meta.
3. **MargenesConsumidos evita un falso total tipo Pareto** (tiles.jsx:600-608): el comentario explica por qué un porcentaje acumulado sería sin sentido.

## Priority Issues

**[P1] Sin indicador de foco visible en tarjetas de activo navegables por teclado**
- Qué: TarjetaActivo (tiles.jsx:452-476) es un control real (tabIndex={0}, onKeyDown Enter/Space) pero pone outline: "none" y no hay regla :focus-visible en index.css.
- Por qué importa: falla dura de WCAG 2.4.7.
- Fix: añadir .metric-card:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; } en index.css.
- Comando sugerido: /impeccable harden

**[P1] Delta y MargenesConsumidos usan color de dato como color de texto**
- Qué: Delta (base.jsx:158-159) colorea texto con t.viz.verde/t.viz.coral. El líder de MargenesConsumidos (tiles.jsx:632) colorea su porcentaje con estadoColor(dark, lider.estado).
- Por qué importa: DESIGN.md prohíbe explícitamente usar viz como color de interfaz por falta de contraste. Medido contra blanco: viz-verde ~2.5:1, viz-coral ~2.9:1, estadoColor crítico ~3.9:1 — todos bajo el 4.5:1 de WCAG AA.
- Fix: usar tokens semánticos de interfaz (t.success, t.coral) para texto; reservar viz/estadoColor a puntos, barras y relleno de gráficas.
- Comando sugerido: /impeccable harden

**[P1] El estado "crítico" no explica su severidad ni consecuencia**
- Qué: TarjetaActivo pulsa coral con solo una abreviatura de 2 letras; FranjaAtencion no dice qué significa operativamente ni si requiere acción.
- Por qué importa: el usuario es un prospecto sin contexto evaluando en minutos; una alarma sin explicación arriesga leerse como "el producto está roto".
- Fix: tooltip/expansión persistente en el chip de FranjaAtencion repitiendo, condensada, la frase de NotaProcedencia.
- Comando sugerido: /impeccable clarify

**[P2] Sin orientación a nivel de sección dentro de la página (SectionLabel sin usar)**
- Qué: DESIGN.md prescribe SectionLabel como la marca de agua del sistema, pero PlantaEva.jsx nunca lo importa.
- Por qué importa: el propio comentario del archivo describe un orden de lectura deliberado que nada en el render comunica.
- Fix: añadir SectionLabel sobre la banda de KPIs y la de tendencias.
- Comando sugerido: /impeccable layout

**[P3] Card duplica Panel.jsx en vez de componerlo**
- Qué: Demo-EVA/components/base.jsx's Card reimplementa lo que ya existe en components/ui/Panel.jsx, heredado de un prototipo dashboard-v2 ya eliminado.
- Por qué importa: cualquier cambio futuro de paleta/radio/sombra a Panel no se propaga aquí; es la ruta por defecto de la app.
- Fix: dejar comentario de deuda técnica o migrar las variantes tono de Card a Panel como prop.
- Comando sugerido: /impeccable distill

## Persona Red Flags

**Jordan (Confused First-Timer)**
- Ve una TarjetaActivo coral pulsante con solo una abreviatura de 2 letras.
- "Modo del variador" muestra un modo.tag crudo bajo una etiqueta nunca explicada.
- El tag mono de FilaSenal aparece sin explicación de la convención (esto viene del servidor).
- Sin SectionLabels, tiene que inferir la estructura de la página solo por espaciado.
- NotaProcedencia es la frase más importante de confianza pero se ve como nota al pie de 11.5px.

**Sam (Accessibility-Dependent User)**
- TarjetaActivo operable por teclado pero sin :focus-visible en ningún lado.
- Delta y el líder de MargenesConsumidos usan tokens viz/estadoColor como texto, contraste ~2.5-3.9:1, fallan WCAG AA.
- El toggle de tema en Topbar es solo-ícono sin aria-label.
- El pulso alertaLatido no tiene equivalente no-visual (sin aria-live).

## Minor Observations

- VersionBuild en Topbar: opacidad 0.65 a 10.5px empuja el contraste aún más bajo que textFaint.
- El toggle de origen de datos en Topbar (aria-pressed, aria-label, role="status") es buen patrón; úsalo de plantilla para el toggle de tema.
- ArcoNivel tiene role="img" + aria-label correctos — es la vara con la que medir el resto de SVG de la app.

## Questions to Consider

- Si NotaProcedencia es la única frase que hace confiables todos los colores, ¿por qué es el texto visualmente menos importante de la pantalla?
- ¿Vale la pena reutilizar vocabulario de alarma real para umbrales inventados localmente?
- ¿Qué haría falta para que un prospecto note el vínculo 2D/3D antes de descubrirlo por accidente?
