# Demo EVA · Las máquinas de la planta

La aplicación, sobre árboles **reales** del servidor ICONICS. Nació sobre uno
—`ac:TDCON/DEMO/SENSORES/`, la estación de llenado— y hoy sirve **dos máquinas**
en secciones separadas del sidebar, con una tercera prevista:

| Sección | Máquina | Árbol | Vistas |
|---|---|---|---|
| Estación de llenado | Tanque y grupo de bombeo (`PLC_1`) | `ac:TDCON/DEMO/SENSORES/` | 5 |
| Vibraciones | Motor WEG + SIPLUS CMS (`PLC_2`) | `ac:TDCON/Motors/01/` y `ae:` | 5 |
| General | — | — | 4 |

**Van en secciones aparte a propósito, y no es cosmético.** Son instalaciones
separadas: otro motor, otro variador, otro PLC. Mezclar sus pantallas invita a
leerlas juntas, y la primera correlación que alguien saque entre el caudal del
tanque y la vibración de la otra une dos máquinas que no comparten ni un
tornillo. La misma regla la defiende el registro en
[`shared/eva/sistemas.js`](../../../shared/eva/sistemas.js).

Quién manda sobre qué máquinas existen no es este módulo: es ese registro. Aquí
sólo se pintan.

La **Maqueta 3D** reproduce el skid real, a partir de un dibujo del equipo que
está en [`react-dashboard/img/`](../../img/). Hubo brevemente una quinta vista
que dibujaba esa misma instalación en SVG, para comparar los dos medios; se
comparó y ganó la maqueta. El porqué, y lo que la comparación dejó en el
código, está en [`docs/PLAN-10-VISTA-SVG.md`](../../../docs/PLAN-10-VISTA-SVG.md).

Nació como una sección más dentro del tablero de OEE de Resonac; en agosto de
2026 aquél se retiró y esto pasó a ser todo lo que hay. De ahí que el módulo
siga siendo una isla autocontenida: las convenciones de más abajo son las que
lo mantuvieron separable, y ese aislamiento es lo que hizo barata la transición.

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

### 5. La sección se puede trabajar sin servidor

El origen **Simulado** del Topbar sirve también este árbol desde
[`data/simulador.js`](data/simulador.js): las ocho señales en vivo y la serie de
las cuatro historizadas, sin red y sin backend. Ver
[`docs/PLAN-9-SIMULADOR-EVA.md`](../../../docs/PLAN-9-SIMULADOR-EVA.md).

```bash
VITE_ENABLE_SIMULATOR=true npm run dev   # el botón «Simulado» del Topbar
VITE_ICONICS_FAKE=true npm run dev       # arrancar ya en simulado
VITE_ICONICS_CHAOS=none npm run dev      # sin huecos ni mala calidad, para enseñar
```

Dos cosas que **no** hace, y son las que lo hacen útil:

- **No inventa las cuatro series que el servidor no publica.** `readSerie` repite
  la guarda de `historizado`, así que una gráfica escrita contra el simulador
  sigue funcionando contra el servidor real. Ver el punto 2.
- **No se queda en verde.** Un ciclo de bombeo de 6 min recorre marcha y reposo,
  y un evento cada siete ciclos lleva alguna señal a `critico`. Con el caos en
  `soft` —el valor por defecto— hay además huecos y mala calidad. Si la interfaz
  sólo se prueba en `nominal`, la mitad de la pantalla no se ejercita nunca.

---

## Estructura

```
domain/     cinco reexports de una línea · el contenido vive en @shared/eva/
  senales.js    las 8 señales: el ÚNICO archivo con nombres de tag
  activos.js    los 4 activos, derivados del campo `activo` de las señales
  estado.js     las 5 claves derivadas y su agregación
  umbrales.js   las bandas, y su declaración de procedencia
  sistema.js    createSistema(): saneamiento y evaluación en la frontera

data/       la frontera con la red
  evaSource.js    un motor de polling, un lote, 3 s · elige quién lee el pasado
  historia.js     el `fetch` · las reglas están en @shared/eva/historia.js
  simulador.js    la instalación entera sin red: `read()` y `readSerie()`
  EvaProvider.jsx el único sitio que crea una fuente
  hooks.js        useSistemaAgua(), useSerieHistorica()
  vibracion.js    la OTRA máquina: su propio sondeo en lote, sin `EvaProvider`
  simuladorVibracion.js  esa máquina sin red: sólo `read()`, no hay historia
  transportes.js  clase de transporte → transporte, para CUALQUIER máquina

lib/        derivaciones y formato, sin React salvo donde se indique
  buffer.js   búfer rodante de muestras vivas de la sesión
  formato.js  cómo se escribe cada señal
  modelo.js   las derivaciones de la vista de Planta

components/ los tiles 2D, con la forma de «Planta · v2»
three-d/    los modelos, su contrato de comportamiento y el layout
views/      las vistas, hoy una familia por máquina

            Cada máquina duplica hoy sus cinco vistas (Inicio, Gráficas,
            Riesgos, Controles y 3D). Es la deuda mayor del frontend y está
            anotada como F1 en `docs/BACKLOG-FRONTEND.md`: la forma común de
            `estadoMaquina.js` ya existe, así que la pieza que faltaba para
            parametrizarlas está puesta desde el backend.
```

Las pruebas viven en [`src/test/demo-eva/`](../test/demo-eva/), espejando este
árbol, como manda [`src/test/README.md`](../test/README.md).

### El dominio ya no vive aquí

Los cinco archivos de `domain/` —y las reglas del historiador que estaban en
`data/historia.js`— subieron a [`shared/eva/`](../../../shared/eva/) cuando **el
asistente pasó a responder sobre esta instalación**. Sus herramientas
(`backend/ia/herramientas.mjs`) leen los mismos ocho tags, aplican los mismos
umbrales y repiten la misma guarda de `historizado`; `shared/README.md` explica
por qué el backend no puede importar de `react-dashboard/src` ni conformarse con
una copia.

Para quien trabaja en esta carpeta no cambia nada: los imports se siguen
escribiendo `@/Demo-EVA/domain/…`, y `data/historia.js` sigue exportando
`VENTANA` y `SIN_SERIE`. Lo que sí cambia es dónde se edita una banda o se marca
una señal como historizada — y que hacerlo mueve ahora **dos** programas: esta
sección y lo que el asistente contesta.

---

## Convenciones propias

**El nombre de la carpeta lleva mayúsculas.** El resto de `src/` va en
minúscula-kebab (`three-d`, `asistente`); ésta se llama `Demo-EVA` porque así
se pidió. Windows no distingue mayúsculas pero un servidor de build en Linux sí,
así que **el import se escribe siempre exactamente `@/Demo-EVA/…`**.

**Nada de esto entra en el arranque.** Las cuatro rutas se registran con
`lazy()` en `app/routes/routes.jsx`, así que abrir una vista no descarga las
otras tres —y sobre todo, las 2D no pagan la pila 3D. Por eso **este módulo no
tiene barril `index.js`**: un `lazy()` sobre un barril hace que Rollup nombre el
trozo según su módulo de entrada y genere un segundo `index-*.js`, que es lo que
dejó de medir el presupuesto del arranque la última vez que pasó. Importa
siempre el archivo concreto.

**El simulador es de la sección.** Vive en [`data/simulador.js`](data/simulador.js)
y sirve las ocho señales con su historia. No está en `lib/iconics/` a propósito:
un simulador allí tendría que importar el catálogo de señales para saber qué
generar, invirtiendo la dependencia. Hubo un tiempo en que el único simulador
era el del tablero anterior, que generaba otros puntos, y pulsar «Simulado»
dejaba esta sección entera sin dato.

**Y hay DOS simuladores, uno por máquina.**
[`data/simuladorVibracion.js`](data/simuladorVibracion.js) sirve el sistema de
vibraciones, y es un archivo aparte por lo mismo que lo son su catálogo y sus
reglas: son dos instalaciones sin un punto en común. La física de cada una vive
en `@shared/eva/simulador.js` y `@shared/eva/simuladorVibraciones.js`, y las
comparte con el transporte falso del backend (`ICONICS_FAKE=true`), para que los
dos programas sirviendo el mismo instante enseñen lo mismo.

El de vibraciones **no tiene `readSerie()`**: ninguna señal de ese catálogo está
historizada todavía, y servir series inventadas enseñaría a la pantalla una
máquina que no existe. Lo que sí reproduce es el apagón medido el 26-08-2026 —al
pararse el variador se van los `vRMS` y sobreviven la aceleración y el pico—,
porque de ahí sale la mitad de la pantalla que declara lo que NO se pudo
comprobar.

**Dos bucles de animación en toda la sección**:
el destello de la baliza en crítico, y el giro del impulsor cuando la bomba
impulsa. Cualquier tercero hay que justificarlo contra la regla de
[`lib/motion.js`](../lib/motion.js) — y el flujo circulando por las tuberías ya
se descartó una vez por ahí.
