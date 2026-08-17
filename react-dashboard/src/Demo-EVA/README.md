# Demo EVA · Sistemas de agua industrial

Sección de demostración sobre `ac:TDCON/DEMO/SENSORES/`, un árbol **real** del
mismo servidor ICONICS que alimenta el tablero de Resonac. Cuatro subvistas:
Planta, Máquina 3D, Maqueta 3D y Assets.

El plan completo, con todo lo que se midió contra el servidor antes de escribir
una línea, está en [`docs/PLAN-8-DEMO-EVA.md`](../../../docs/PLAN-8-DEMO-EVA.md).

---

## Lo que hay que saber antes de tocar nada

### 1. Aquí no hay OEE, ni máquinas, ni estado del servidor

El árbol de la demo son **ocho puntos hoja de un solo sistema**. No hay
jerarquía de equipos, ni tag `Estado`, ni contadores de pieza, ni tiempos.

Por eso este módulo tiene **dominio propio** (`domain/`) y no reutiliza
`@shared/tagCatalog.js`, `@shared/plantModel.js` ni `@shared/domain/estado.js`:
ninguno tiene entrada en este servidor. Lo que sí se reutiliza —y no se debe
duplicar— es la infraestructura: el motor de polling, el transporte, el kit de
interfaz, el tema, el formateo y el andamiaje 3D.

### 2. El historiador miente en tres de las ocho señales

Medido contra el servidor: a `CARGA_TRABAJO_MOTOR`, `KPIEFICIENCIA_ENERGETICA` e
`INDICE_DESVIACION_VOLTAJE` el Data Historian les devuelve **la serie de
`STEMPERATURA_TANQUE`**. Idéntica al decimal, con dos agregados distintos, y sin
dar error: responde `ok: true` con marcas de tiempo correctas.

La defensa es el campo `historizado` de [`domain/senales.js`](domain/senales.js),
y `data/historia.js` rechaza por catálogo **antes de salir a la red**. Si añades
una gráfica, no compruebes tú la marca: pide la serie y deja que te la nieguen.

### 3. Los estados son derivados, y la pantalla lo dice

No hay tag de estado ni alarmas configuradas para este árbol, así que los cinco
estados de [`domain/estado.js`](domain/estado.js) salen de comparar cada señal
contra los umbrales de [`domain/umbrales.js`](domain/umbrales.js), que **son
nuestros y siguen sin confirmar** (`PROVISIONALES = true`).

Las vistas lo rotulan. No quites esos avisos sin haber confirmado los rangos
reales con quien opera la instalación y puesto la bandera en `false`.

### 4. La instalación está parada casi siempre

Caudal ≈ 0, motor a 0, presión de succión. De ahí el estado `reposo` y el campo
`soloEnMarcha` del catálogo: sin ellos, media instalación caería bajo su límite
duro y la demo abriría en rojo permanente.

---

## Estructura

```
domain/     JS puro · sin React · sin tema · probado en node
  senales.js    las 8 señales: el ÚNICO archivo con nombres de tag
  activos.js    los 4 activos, derivados del campo `activo` de las señales
  estado.js     las 5 claves derivadas y su agregación
  umbrales.js   las bandas, y su declaración de procedencia
  sistema.js    createSistema(): saneamiento y evaluación en la frontera

data/       la frontera con la red
  evaSource.js    un motor de polling, un lote, 3 s
  historia.js     lectura del historiador, con la guarda de `historizado`
  EvaProvider.jsx el único sitio que crea una fuente
  hooks.js        useSistemaAgua(), useSerieHistorica()

lib/        derivaciones y formato, sin React salvo donde se indique
  buffer.js   búfer rodante de muestras vivas de la sesión
  formato.js  cómo se escribe cada señal
  modelo.js   las derivaciones de la vista de Planta

components/ los tiles 2D, con la forma de «Planta · v2»
three-d/    los modelos, su contrato de comportamiento y el layout
views/      las cuatro subvistas
```

Las pruebas viven en [`src/test/demo-eva/`](../test/demo-eva/), espejando este
árbol, como manda [`src/test/README.md`](../test/README.md).

---

## Convenciones propias

**El nombre de la carpeta lleva mayúsculas.** El resto de `src/` va en
minúscula-kebab (`three-d`, `dashboard-v2`); ésta se llama `Demo-EVA` porque así
se pidió. Windows no distingue mayúsculas pero un servidor de build en Linux sí,
así que **el import se escribe siempre exactamente `@/Demo-EVA/…`**.

**Nada de esto entra en el arranque.** Las cuatro rutas se registran con
`lazy()` en `app/routes/routes.jsx`, así que quien abre el tablero de Resonac no
descarga ni el dominio ni los tiles ni los modelos. Por eso **este módulo no
tiene barril `index.js`**: un `lazy()` sobre un barril hace que Rollup nombre el
trozo según su módulo de entrada y genere un segundo `index-*.js`, que es lo que
dejó de medir el presupuesto del arranque la última vez que pasó. Importa
siempre el archivo concreto.

**El simulador no conoce este árbol.** `fakeTransport` genera valores para los
puntos de Resonac; con el simulador activo, Demo EVA se ve entera sin dato. Es
lo correcto: fingir que el simulador conoce esta instalación sería el tipo de
dato inventado que el Plan 5 quitó de en medio.

**Dos bucles de animación en toda la sección**, igual que en el 3D de Resonac:
el destello de la baliza en crítico, y el giro del impulsor cuando la bomba
impulsa. Cualquier tercero hay que justificarlo contra la regla de
[`lib/motion.js`](../lib/motion.js) — y el flujo circulando por las tuberías ya
se descartó una vez por ahí.
