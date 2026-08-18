# Plan 9 · El simulador aprende Demo EVA

> ⚠️ **DOCUMENTO HISTÓRICO (actualizado 18-ago-2026).** Este plan se escribió
> cuando convivían dos simuladores. El de Resonac, `lib/iconics/fakeTransport.js`,
> **ya no existe**: se retiró con su tablero en agosto de 2026, y con él
> `@shared/tagCatalog.js`. Los presets de caos que definía viven ahora en
> `lib/iconics/caos.js`. El simulador que este plan construye es hoy el único, y
> sigue donde lo dejó: `Demo-EVA/data/simulador.js`.


> **Objetivo.** Que el origen «Simulado» del Topbar sirva la instalación de agua
> de `ac:TDCON/DEMO/SENSORES/`, para poder seguir trabajando la interfaz de
> Demo EVA sin servidor de planta y sin red.

---

## 1 · El agujero que se tapa

Desde el Plan 5 hay **un solo camino de datos** y el interruptor del Topbar
conmuta el *transporte*, no la fuente. Eso funciona para Resonac, porque
`fakeTransport.js` sabe generar `ac:RESONAC/LIN/1/OEE`. No funciona para Demo
EVA, y su propio provider lo tenía escrito:

> «`fakeTransport` genera valores para los puntos de Resonac, no para los de este
> árbol. Con el simulador activo, Demo EVA se ve **entera sin dato**.»

Con `SOLO_DEMO_EVA = true` en `app/routes/routes.jsx`, el tablero que se está
construyendo es justo el que el simulador no sabe alimentar. Pulsar «Simulado»
hoy deja las ocho tarjetas en `sin_dato`, la franja de atención apagada, los
medidores vacíos y las cuatro gráficas del historiador en blanco. Es decir: el
interruptor existe y no sirve para lo que se está haciendo.

Hay además un segundo agujero, más silencioso: `data/historia.js` llama a
`fetchIconicsHistory` **directamente**, sin pasar por el transporte. Aunque el
tiempo real se simulara, la historia seguiría saliendo a la red.

---

## 2 · Dos decisiones que mandan sobre el resto

### 2.1 · El simulador vive en `Demo-EVA/`, no en `lib/iconics/`

`fakeTransport.js` es infraestructura compartida y depende de
`@shared/tagCatalog.js`. Enseñarle el árbol de la demo lo obligaría a importar
`Demo-EVA/domain/senales.js`, invirtiendo la dependencia: la infraestructura
pasaría a conocer un módulo de feature, y el pacto de que `senales.js` es **el
único archivo de Demo EVA con nombres de tag** se rompería desde fuera.

Así que el simulador de la demo es `Demo-EVA/data/simulador.js` y es aditivo:
ni una línea de Demo EVA entra en `lib/`. Los dos simuladores comparten la
*forma* (`read(pointNames)`, los presets de caos) y nada más — que es exactamente
la relación que ya tienen `iconicsSource.js` y `evaSource.js`.

### 2.2 · El simulador respeta `historizado`, y eso NO es un detalle

Cuatro de las ocho señales no tienen serie propia en el historiador: a
`CARGA_TRABAJO_MOTOR`, `KPIEFICIENCIA_ENERGETICA` e `INDICE_DESVIACION_VOLTAJE`
el servidor les devuelve la curva de `STEMPERATURA_TANQUE` (Plan 8 §1.3). La
interfaz está construida sobre ese hecho: la banda de KPIs son *las cuatro
historizadas*, y la carga del motor se alimenta del búfer de sesión porque no
puede pedir serie.

Un simulador que devolviera ocho series enseñaría a la interfaz una instalación
que no existe, y la pantalla se rompería al volver a datos reales. Por eso
`readSerie` del simulador **repite la misma guarda** que el lector real y
devuelve `SIN_SERIE` para las cuatro. Es el mismo criterio con el que
`CAOS_SUAVE` viene encendido: el simulador no está para que todo salga bien,
está para que la interfaz se escriba contra la planta que hay.

---

## 3 · El modelo: dos relojes

Todo valor es función del **reloj de pared**, sin `Math.random` en la señal. Tres
propiedades salen gratis de ahí: la historia empalma con el valor en vivo,
recargar la página no da un salto, y dos navegadores ven lo mismo.

Se superponen dos periodos porque las dos escalas de la interfaz piden cosas
distintas:

| Reloj | Periodo | Qué mueve | Por qué ese periodo |
|---|---|---|---|
| **Ciclo de bombeo** | 6 min (4,5 marcha · 1,5 paro) | caudal, carga, presión, eficiencia, modo VDF | Corto para que quien mira la pantalla vea el reposo y la marcha **sin esperar**. Es lo que ejercita `enReposo` y el estado `reposo`. |
| **Deriva de jornada** | 4 h | nivel, temperatura, tensión | Da forma legible a la gráfica de 6 h. Con sólo el ciclo rápido, la media por tramo del historiador saldría plana. |

Encima van **eventos deterministas**, uno cada siete ciclos, rotando entre
sobrecalentamiento del tanque, caída de tensión y sobrecarga del motor. Duran el
tercio central de su ciclo y entran y salen suave. Es lo que lleva señales a
`critico` cada ~14 min de media, en vez de dejar que la pantalla de alertas sólo
se pueda ver de casualidad.

La rotación completa recorre los cinco estados del vocabulario: `nominal`,
`atencion`, `critico`, `reposo` y —vía el caos— `sin_dato`.

**La presión en el paro baja a 0,22**, por debajo de su límite duro. Es a
propósito: `soloEnMarcha` hace que el *estado* sea `reposo` mientras la *banda*
cruda es `critico`, y esa discrepancia es justo la que la tarjeta explica. Sin
ella ese camino de la interfaz no se ejecuta nunca.

### La historia es la media del tramo, no una muestra

`leerSerie` promedia ~16 submuestras por punto de la rejilla, que es lo que hace
de verdad el agregado `Average` del servidor. No es cosmética: sin promediar, una
rejilla de 15 min sobre un ciclo de 6 min devolvería una curva de aliasing sin
significado. Promediando, el ciclo rápido se disuelve y queda la deriva de
jornada — que es la misma lectura que daría el historiador real.

---

## 4 · Por dónde entra

`data/historia.js` se queda **intacto como lector real**. Lo que cambia es quién
lo llama:

```
EvaProvider ── elige transporte ──▶ createTransporteEva()   (simulado)
                                  └ createTransport(real)   (servidor)

createEvaSource ── leerSerie = transport.readSerie ?? leerSerie(historiador)

hooks.js ── useSeriesHistoricas() ──▶ source.leerSerie()
```

La historia pasa a colgar de la **fuente**, igual que en Resonac
(`iconicsSource.readHistory`). Los hooks dejan de importar el lector real
directamente, que era lo que hacía imposible sustituirlo.

---

## 5 · Fases

| # | Fase | Qué entra | Cómo se comprueba |
|---|---|---|---|
| **A** | El modelo | `data/simulador.js`: `valorEn()`, `read()`, `readSerie()` | `test/demo-eva/simulador.test.js` |
| **B** | El enchufe | `evaSource.leerSerie`, `hooks.js`, `EvaProvider` | La suite entera sigue verde |
| **C** | La pantalla | — | Pulsar «Simulado» y recorrer las cuatro vistas |
| **D** | La documentación | `Demo-EVA/README.md`, `test/README.md`, este archivo | — |

### Lo que este plan NO hace

**Resonac se queda sin histórico simulado.** `iconicsSource.readHistory`,
`readDay` y `readDailyOee` devuelven vacío con el simulador puesto, así que el
comparativo del detalle de máquina y el mapa de calor del calendario siguen en
blanco. No se toca porque no es lo que se está construyendo, y porque el hueco ya
está declarado en `iconicsSource.js` («un gráfico vacío se ve, uno inventado
no»). Si el trabajo vuelve a esas vistas, es un plan aparte y el patrón ya está
puesto aquí.
