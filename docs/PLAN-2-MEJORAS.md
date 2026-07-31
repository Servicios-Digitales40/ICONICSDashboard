# Plan 2 · Mejoras

Segundo plan de acción, **subordinado a [Plan 1](PLAN-1-CONEXION-ICONICS.md)**. Nada de aquí
debe iniciarse antes de que el dashboard lea datos reales de ICONICS: la criticidad recae en
el plan principal.

Tres bloques de diez propuestas: estética, rendimiento y herramientas nuevas.

**Convención de esfuerzo:** ▁ bajo (horas) · ▄ medio (días) · █ alto (semanas).

---

## A · Mejoras de UI

Objetivo: que la aplicación se vea mejor sin cambiar lo que significa.

| # | Mejora | Esfuerzo |
|---|---|---|
| A-01 | Escala tipográfica y de espaciado en tokens | ▄ |
| A-02 | Migrar estilos inline a variables CSS | █ |
| A-03 | Skeletons con la forma real de la tarjeta | ▁ |
| A-04 | Interpolar los cambios de valor | ▁ |
| A-05 | Micro-sparkline en cada `GaugeCard` | ▄ |
| A-06 | Semáforo de frescura del dato | ▁ |
| A-07 | Jerarquía visual en el dashboard | ▄ |
| A-08 | Modo wallboard | ▄ |
| A-09 | Paleta de estados accesible | ▁ |
| A-10 | Unificar el mapa de estados duplicado | ▁ |

**A-01 · Escala tipográfica y de espaciado en tokens.**
Hoy hay tamaños sueltos en estilos inline (21, 12.5, 13). Un `t.type.*` y `t.space.*` unifica
la escala y permite ajustar la densidad global desde un solo sitio.

**A-02 · Migrar estilos inline a variables CSS del tema.**
Es la de mayor esfuerzo del bloque y la que habilita a las demás: con estilos inline no se
pueden declarar transiciones reales ni respetar `prefers-reduced-motion`. Conviene hacerla
antes que A-04 y A-07.

**A-03 · Skeletons con la forma de la tarjeta**, no spinners genéricos. Ya existen en
`_deprecated/components/ui/loaders/` — rescatarlos en lugar de reescribirlos. Encaja
directamente con los estados de carga que introduce la Fase 4 del Plan 1.

**A-04 · Interpolar los cambios de valor.**
Con polling los KPIs saltan en cada tick. `CountUp` (también en `_deprecated/`) suaviza la
transición y hace que el dato se sienta vivo en vez de nervioso.

**A-05 · Micro-sparkline en cada `GaugeCard`** con las últimas 2 h: da contexto de tendencia
sin obligar a abrir el detalle. Depende de que la historia (`hda:`) esté conectada.

**A-06 · Semáforo de frescura del dato.**
Un punto sutil para *fresco / desactualizado / mala calidad*, en lugar de texto. Es la
expresión visual de la regla de calidad 192 del Plan 1 §3.8.

**A-07 · Jerarquía en el dashboard.**
Un KPI héroe —el OEE de planta— y el resto subordinado, en vez de una rejilla plana donde
todo compite por la misma atención.

**A-08 · Modo wallboard.**
Pantalla completa con tipografía escalada, pensado para monitores de piso de planta vistos a
varios metros.

**A-09 · Paleta de estados accesible.**
Validar contraste AA y no depender solo del color. Los iconos de `GaugeCard` ya lo hacen bien;
extender ese criterio a los tiles del dashboard.

**A-10 · Unificar el mapa de estados duplicado** entre `ESTADO_TOKEN` (`machines.js:66`) y
`ESTADOS` (`GaugeCard.jsx:54`). Hoy pueden divergir y ya hay un `TODO` en el código marcándolo.
Conviene hacerlo **junto con** la decisión de vocabulario del Plan 1 §5.1, no después.

---

## B · Mejoras de rendimiento

Las cinco primeras son **el núcleo del Plan 1** y se listan aquí solo para dejar el mapa
completo: se ejecutan allí, no aquí. Las cinco últimas sí son trabajo adicional.

| # | Mejora | Dónde |
|---|---|---|
| B-01 | Un solo poller compartido | Plan 1 |
| B-02 | Lectura por lotes con troceado | Plan 1 |
| B-03 | Pausa por visibilidad | Plan 1 |
| B-04 | Backoff exponencial y cortacircuitos | Plan 1 |
| B-05 | Cadencias por criticidad | Plan 1 |
| B-06 | Caché de historia por (punto, rango) | Plan 2 ▁ |
| B-07 | Memoizar `plantModel` | Plan 2 ▁ |
| B-08 | Estabilizar las props de `GaugeCard` | Plan 2 ▁ |
| B-09 | Code-splitting por ruta | Plan 2 ▄ |
| B-10 | Compresión y `cache-control` en el backend | Plan 2 ▁ |

**B-06 · Caché de historia por (punto, rango) con TTL.**
La historia no cambia hacia atrás: solo el tramo más reciente puede crecer. Cachear por
`(punto, rango)` e invalidar únicamente el borde derecho evita repetir consultas caras al
navegar entre máquinas.

**B-07 · Memoizar `plantModel`.**
`buildPlantSummary` recorre todas las máquinas y `plantTrend` genera 12 puntos × N máquinas.
Hoy se recalcula en cada render; con polling cada 15 s eso pasa de ser gratis a ser visible.

**B-08 · Estabilizar las props de `GaugeCard`.**
`Area1.jsx:33` hace `{...e}`, que crea objetos nuevos en cada render y anula cualquier
`React.memo`. Pasar el objeto entero con identidad estable arregla la memoización de golpe.

**B-09 · Code-splitting por ruta.**
Los 11 prototipos de `src/prototypes/` entran hoy en el bundle principal aunque casi nunca se
visiten. `React.lazy` por ruta los saca del camino crítico. Alternativa más simple: retirarlos,
para lo que ya existe una receta completa en `src/prototypes/README.md`.

**B-10 · Compresión y `cache-control` en el backend puente**, que además sirve los estáticos
del build de producción.

---

## C · Mejoras de usabilidad

Herramientas y componentes nuevos. Ordenadas por valor descendente.

| # | Mejora | Esfuerzo |
|---|---|---|
| C-01 | Vista de Alarmas | █ |
| C-02 | Selector de rango temporal global | ▄ |
| C-03 | Comparador de máquinas lado a lado | ▄ |
| C-04 | Panel de diagnóstico de conexión | ▄ |
| C-05 | Buscador global de máquina y tag | ▄ |
| C-06 | Exportar a CSV/Excel | ▄ |
| C-07 | Fijar máquinas favoritas | ▁ |
| C-08 | Umbrales configurables por máquina | ▄ |
| C-09 | Historial de paros con motivo | █ |
| C-10 | Escenarios guionizados en modo demo | ▄ |

**C-01 · Vista de Alarmas.**
La funcionalidad de mayor valor que no está construida. El backend ya expone consulta y
reconocimiento (`/api/iconics/alarms` y `.../acknowledge`), y el Excel define 57 tipos de
alarma más un subárbol `Alarmas` por máquina, con estaciones y clasificaciones. La materia
prima está toda; falta la vista.

**C-02 · Selector de rango temporal global** (turno / hoy / ayer / 7 días) que alimente todas
las gráficas desde un solo control, en vez de que cada vista decida su ventana.

**C-03 · Comparador de máquinas lado a lado.**
Hoy `ComparativoView` compara dos *fechas* de una misma máquina. Falta la otra pregunta:
comparar máquinas entre sí en la misma ventana.

**C-04 · Panel de diagnóstico de conexión.**
Estado del token, latencia, peticiones/min, tags en mala calidad. Convierte un "no carga" en
un diagnóstico accionable, y es el sitio natural donde exponer el contador que el Plan 1
introduce en la Fase 3.5 y el verificador de catálogo de la Fase 7.3.

**C-05 · Buscador global de máquina y tag** con salto directo. El `Input` del `Topbar` ya está
maquetado y comentado, esperando función.

**C-06 · Exportar a CSV/Excel** la vista actual. Cierra el círculo con el nodo `Reportes` que
ya existe en el árbol de ICONICS.

**C-07 · Fijar máquinas favoritas** para componer un wallboard propio por operador. Combina
bien con A-08.

**C-08 · Umbrales configurables por máquina**, en lugar de las metas globales de `shiftModel`
—que el propio código marca como "confirmar con planta" y que hoy mezclan un valor tomado del
ejemplo de referencia con dos que son estándar de industria.

**C-09 · Historial de paros con motivo.**
El Excel ya tiene `T_Muerto_Ico_DT_Route`, pensado para clasificar el tiempo muerto por causa.
Hay materia prima para un Pareto de paros, que suele ser el gráfico más accionable de un
sistema de OEE.

**C-10 · Escenarios guionizados en modo demo** (máquina en fallo, planta al 95 %, pérdida de
comunicación) para presentaciones reproducibles. Extiende el interruptor del Plan 1 §4 y
reutiliza el modo de caos del transporte falso, que para entonces ya existirá.

---

## Secuencia sugerida

1. **A-10** junto con la decisión de estados del Plan 1 — si se hace después, se hace dos veces.
2. **A-03, A-06** al cerrar la Fase 4 del Plan 1: son la cara visible de los estados de carga
   y calidad que esa fase introduce.
3. **B-07, B-08** en cuanto el polling esté vivo: es cuando el coste de render deja de ser gratis.
4. **C-01** como primer bloque grande de funcionalidad nueva.
5. **A-02** antes que A-04 y A-07, que dependen de ella.
