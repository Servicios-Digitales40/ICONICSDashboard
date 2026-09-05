> **Documento histórico.** Describe el alcance y las decisiones de su fecha, incluidas rutas y archivos posteriormente retirados. Para instalación, capacidades y estructura actuales consulta [el índice documental](README.md).

# Plan 8 · Demo EVA · Sistemas de Agua Industrial

> ⚠️ **DOCUMENTO HISTÓRICO (actualizado 18-ago-2026).** Este plan se escribió
> cuando Demo EVA era una sección dentro del tablero de OEE de Resonac, así que
> se lee entero en contraste con aquél. **La transición terminó**: el tablero de
> Resonac se retiró y esta demo es la aplicación. Las rutas de archivo que este
> documento cita de aquel lado —`shared/tagCatalog.js`, `shared/plantModel.js`,
> `shared/domain/*`, `features/dashboard/`, `features/machines/`,
> `src/prototypes/`— **ya no existen**, y los enlaces a los planes 1 a 7 tampoco.
> El razonamiento sigue valiendo; las rutas, no. La «fase aparte de una tarde»
> que anuncia el apartado «Lo que este plan NO hace» es la que se ejecutó.


> **ESTADO (17-ago-2026)** — **Fases 0 a 8 ejecutadas. Suite en verde, bundle
> dentro de presupuesto. Falta la verificación EN PANTALLA con datos vivos.**
>
> | Fase | Entregable | Verificación |
> |---|---|---|
> | 0 | Descubrimiento contra el servidor | §1, todo medido |
> | 1 | `domain/` + umbrales | **24 pruebas** en node |
> | 2 | `data/` sobre el motor existente | **10 pruebas** con transporte falso |
> | 3 | Vista **Planta** | compila; pendiente de ver en pantalla |
> | 4 | Sección y rutas en el sidebar | **+3 pruebas** en `routes.test.jsx` |
> | 5 | **Maqueta 3D** | **21 pruebas** de comportamiento y layout |
> | 6 | **Máquina 3D** | idem; el modo «En vivo» pendiente de D-6 |
> | 7 | **Assets** + refactor del explorador | la vista de Resonac no cambia |
> | 8 | README, live test, bundle | `verificar-bundle.mjs` ✔ |
>
> **Suite: 182 pruebas en verde, 0 fallos** (eran 148 antes). El trozo `index`
> del arranque queda en **152.61 KB** sobre un techo de 170: Demo EVA no le
> cuesta nada porque sus cuatro rutas van con `lazy()`.
>
> **Dos correcciones sobre lo planificado**, las dos documentadas en su sitio:
>
> - `umbrales.js` acabó en `domain/` y no en `lib/`. Es lo que DECIDE el estado,
>   así que ponerlo fuera del dominio obligaba a que el dominio importara hacia
>   arriba. Con esto, `domain/` no depende de nada del módulo.
> - El halo del 3D pasó de booleano a `"ninguno"|"simple"|"doble"`. Lo tumbó una
>   prueba: con el halo apagado en `atencion`, ese estado y `nominal` **sólo se
>   distinguían por el color**, que es justo lo que el principio de diseño
>   prohíbe. Ver la cabecera de `TABLA` en `three-d/lib/comportamiento.js`.
>
> **⚠ Lo que NO se ha podido verificar, y por qué.** A las 19:33 UTC el servidor
> ICONICS pasó a devolver **mala calidad en todos sus árboles**, Resonac
> incluido (`quality` 2147483652 y 2147487756, sin valor). Con eso, las dos
> secciones del tablero muestran huecos y no hay nada que mirar en pantalla.
> Queda pendiente:
>
> - Abrir las cuatro subvistas con datos vivos.
> - `LIVE=1 npx vitest run src/test/live/eva.live.test.js`, que hoy falla por
>   el mismo motivo — y que es la prueba que comprueba que el historiador sigue
>   mintiendo en tres señales (§1.3).
>
> Que la pantalla en ese estado diga «sin dato» y no «avería» sí está
> verificado, pero con transporte falso (`src/test/demo-eva/fuente.test.js`),
> reproduciendo el `quality` exacto que devolvió el servidor.
>
> **Sigue pendiente de confirmar por el usuario:** los umbrales operativos (D-5)
> y las unidades de tres señales (§1.2). Hasta entonces `PROVISIONALES = true` y
> la vista de Planta lo rotula.
>
> ---
>
> El descubrimiento cambió el plan antes de escribirlo, y por eso la §1 va
> primero: `ac:TDCON/DEMO/SENSORES/` **no tiene jerarquía de equipos**. Son
> ocho señales planas de **un solo sistema**, sin `Estado`, sin OEE y sin
> contadores de pieza. Nada del modelo de dominio actual —máquinas, áreas,
> OEE, FTY, Pareto de rechazos— tiene contrapartida en el servidor.
>
> Además hay una **trampa medida** que condiciona el diseño entero: el
> historiador devuelve la serie de `STEMPERATURA_TANQUE` para tres tags que
> **no** son la temperatura (§1.3). Una gráfica que confíe en el historiador
> sin filtrar mostraría la curva de temperatura rotulada «Carga del motor», y
> se vería perfectamente creíble.

Octavo plan. **Independiente de los [1](PLAN-1-CONEXION-ICONICS.md) al
[7](PLAN-7-ALCANCE-ASISTENTE.md)** en cuanto a datos: no toca el puente, ni el
catálogo de Resonac, ni el asistente. Añade **superficie nueva** sobre el mismo
backend y el mismo motor de polling.

Lo pedido:

1. Una sección **«Demo EVA»** en el sidebar, con cuatro subvistas.
2. **«Planta»** — reutilizando el lenguaje visual de *Planta · v2*.
3. **«Máquina 3D»** y **«Maqueta 3D»** — el equipo y la instalación.
4. **«Assets»** — el explorador, anclado al árbol de la demo.
5. Todo el código nuevo en **`src/Demo-EVA/`**, con la estructura del proyecto.
6. Tema: **sistemas de agua industrial**, no compresores.

**Convención de esfuerzo:** ▁ bajo (horas) · ▄ medio (días) · █ alto (semanas).

---

## 1. Lo que hay en el servidor, medido

Todo lo de esta sección se leyó del servidor real (`BMS-Server`) el 17-ago-2026
a través del puente ya en marcha, con `/api/iconics/browse`, `/data/batch` e
`/history`. No hay ni una cifra supuesta.

### 1.1 El árbol: ocho señales planas, un solo sistema

`ac:TDCON/DEMO/` contiene **un solo hijo**, `SENSORES/`, y ése contiene **ocho
puntos hoja**. No hay equipos, ni subcarpetas, ni `.ChildEquipmentNames`.

| # | Punto (`ac:TDCON/DEMO/SENSORES/…`) | Valor 17-ago 18:50 UTC | Calidad | Tipo |
|---|---|---|---|---|
| 1 | `Modo AM VDF` | `false` | 0 (buena) | booleano |
| 2 | `SFLUJO_INSTANTANEO` | `-0.0398` | 0 | real |
| 3 | `SPRESION_RELATIVA` | `-0.8355` | 0 | real |
| 4 | `STEMPERATURA_TANQUE` | `24.512` | 0 | real |
| 5 | `SNIVEL_TANQUE` | `51.537` | 0 | real |
| 6 | `KPIEFICIENCIA_ENERGETICA` | `0` | 0 | real |
| 7 | `INDICE_DESVIACION_VOLTAJE` | `122.114` | 0 | real |
| 8 | `CARGA_TRABAJO_MOTOR` | `0` | 0 | real |

Consecuencias inmediatas:

- **No existe `Estado`.** El vocabulario de
  [`shared/domain/estado.js`](../shared/domain/estado.js) —cuyos códigos salen
  de una expresión `IF B_Run THEN 1 …` que aquí no hay— **no aplica**. Cualquier
  color de estado en Demo EVA será *derivado por umbrales*, y eso hay que
  decirlo en pantalla, no esconderlo (D-4).
- **No hay OEE, ni piezas, ni rechazos.** Se cae entero el rollup de
  [`shared/plantModel.js`](../shared/plantModel.js): media de factores, FTY,
  Pareto de rechazos, producción por hora. No es que haya que adaptarlo — es que
  no tiene entrada.
- **No hay N máquinas.** Hay un sistema con ocho sensores. La rejilla de
  máquinas y la maqueta necesitan una unidad intermedia que hoy no existe en el
  servidor: la creamos nosotros como **agrupación de señales** (D-3).
- El nombre `Modo AM VDF` **lleva espacios**. Se comprobó que el lote
  (`/api/iconics/data/batch`, separado por comas) y `isSafePointName` lo aceptan
  tal cual. No hace falta tocar el backend.

### 1.2 Lo que las señales parecen ser, y lo que no sabemos

`.Description` está **vacía** en el servidor y `.Attributes` no devuelve nada,
así que no hay unidades declaradas. Lo que sigue es lectura del nombre más el
valor observado, y está marcado como tal:

| Señal | Lectura propuesta | Unidad supuesta | Confianza |
|---|---|---|---|
| `SNIVEL_TANQUE` | Nivel del tanque | **%** | alta — 51.5 y estable |
| `STEMPERATURA_TANQUE` | Temperatura del tanque | **°C** | alta — 24.5 y subiendo lento |
| `SFLUJO_INSTANTANEO` | Caudal instantáneo | ? (l/s, m³/h) | **baja** — vale ≈ −0.04 |
| `SPRESION_RELATIVA` | Presión relativa | ? (bar, mca) | **baja** — vale −0.84 |
| `CARGA_TRABAJO_MOTOR` | Carga del motor | **%** | media — vale 0 |
| `KPIEFICIENCIA_ENERGETICA` | Eficiencia energética | **%** | media — vale 0 |
| `INDICE_DESVIACION_VOLTAJE` | *(no es un índice)* | **V** | media — vale 122.1 |
| `Modo AM VDF` | Modo Automático/Manual del variador | booleano | alta |

Dos observaciones que importan al diseño:

- **El sistema está parado ahora mismo.** Caudal ≈ 0, carga del motor 0,
  eficiencia 0, presión ligeramente negativa (succión). La demo se va a
  desarrollar contra un sistema en reposo: hay que diseñar para que la pantalla
  en reposo **se lea como reposo** y no como avería, y verificar el estado
  «operando» arrancando la bomba en el servidor (**D-6**, acción del usuario).
- `INDICE_DESVIACION_VOLTAJE` vale 122.1, que es una **tensión**, no un índice de
  desviación (que rondaría 0-5 %). Rotularlo «Índice de desviación» sobre un
  122.1 pinta un valor catastrófico donde probablemente hay una red sana. Se
  rotula **«Tensión de línea»** con el nombre del tag visible debajo, hasta que
  el usuario confirme.

### 1.3 ⚠ La trampa del historiador: tres tags devuelven la temperatura

**Este es el hallazgo que más condiciona el plan.**

El histórico **sí funciona**, pero con el nombre `ac:` —no con la sintaxis
`hda:\Configuration\…` que usa Resonac, que responde **500** para este árbol—.
Probado con `aggregate=Average` e `interval=00:15:00`, y repetido con
`Maximum`/`00:20:00` para descartar un error propio:

| Señal | ¿Serie propia? | Últimos valores (Máximo, 20 min) |
|---|---|---|
| `SFLUJO_INSTANTANEO` | **sí** | −0.06 … −0.04 · coincide con el valor vivo |
| `SPRESION_RELATIVA` | **sí** | −0.78 … −0.83 · coincide |
| `STEMPERATURA_TANQUE` | **sí** | 24.32 … 24.51 · coincide |
| `SNIVEL_TANQUE` | **sí** | 51.68 … 51.51 · coincide |
| `KPIEFICIENCIA_ENERGETICA` | **NO** | 24.32 … 24.51 · **es la temperatura** (vivo = 0) |
| `INDICE_DESVIACION_VOLTAJE` | **NO** | 24.32 … 24.51 · **es la temperatura** (vivo = 122.1) |
| `CARGA_TRABAJO_MOTOR` | **NO** | 24.32 … 24.51 · **es la temperatura** (vivo = 0) |
| `Modo AM VDF` | **no** | HTTP 500 |

Las tres series «malas» son **idénticas entre sí y a la de temperatura**, hasta
el último decimal, con dos agregados distintos. No es ruido: es una
configuración del *Data Historian* que resuelve esos tres nombres al mismo tag
subyacente.

El modo de fallo es el peor de todos: **no da error**. Devuelve `ok: true`, una
serie bien formada, con marcas de tiempo correctas y valores plausibles. Un
sparkline de «Carga del motor» alimentado de ahí sería la curva de la
temperatura del tanque, y nadie lo notaría mirando la pantalla.

> **Regla que se deriva, y que la Fase 1 hace cumplir:** cada señal declara
> `historizado: true|false` en el catálogo, y **sólo las cuatro verificadas**
> lo tienen. Ningún componente puede pedir historia de una señal que no lo
> declare; la que no lo declara pinta su hueco y dice por qué. Se comprueba con
> una prueba que compara el último punto histórico contra el valor vivo.

### 1.4 Profundidad del histórico, y alarmas

- El historiador **sólo tiene ~3 h**: la primera muestra es de las **16:00 UTC
  de hoy**. Un rango de 7 días devuelve **0 puntos**; uno de 24 h devuelve 2 ó 3.
  La colección se activó hace poco.
- `/api/iconics/alarms` sobre `ac:TDCON/DEMO/SENSORES/` responde **500**. No hay
  alarmas configuradas para este árbol, así que **no hay franja de alarmas
  reales**: lo que se pinte como «atención» será derivado de umbrales (D-4).

Consecuencia de diseño (**D-2**): las tendencias no pueden depender sólo del
historiador el primer día. Se combinan dos fuentes, con la procedencia visible.

---

## 2. Decisiones de diseño

Cada una responde a algo medido en la §1, no a una preferencia.

### D-1 · Dominio propio, infraestructura compartida

`src/Demo-EVA/` trae **su propio dominio** (señales, activos, estado derivado)
porque el de Resonac no tiene entrada aquí (§1.1). Lo que **sí** se reutiliza
sin tocar, porque es infraestructura y no vocabulario:

| Se reutiliza tal cual | Por qué |
|---|---|
| `lib/iconics/pollingEngine.js` | Agrupa, trocea, filtra por calidad, reintenta, marca rancio |
| `lib/iconics/transport.js` (`read`) | Lote y normalización `{value, quality}` |
| `lib/iconics/apiClient.js` | Toda la E/S de red de la app pasa por ahí |
| `lib/datasource/DataSourceProvider` | El interruptor real/simulado y su cinta |
| `components/ui/*`, `theme/`, `lib/format.js`, `lib/motion.js` | Lenguaje visual |
| `features/three-d/components/{Escena,Piso,Encuadre,Baliza,Luces,Sin3D}` | Andamiaje 3D, sin tema |
| `features/three-d/lib/{webgl,paleta,useDescriptor}` | Respaldo sin WebGL, paleta, `frameloop` |

Lo que **no** se reutiliza: `shared/tagCatalog.js`, `shared/plantModel.js`,
`shared/domain/{machine,estado,history}.js`, `features/dashboard/lib/plantModel.js`,
`prototypes/dashboard-v2/model.js`. Ninguno tiene entrada en este servidor.

**La UI de `dashboard-v2` sí se reutiliza, pero como referencia de diseño, no
por import:** su `tiles.jsx` recibe `s.oee`, `s.producidas`, `pareto.filas`…
Adaptarlo por props sería un adaptador que traduce agua a piezas. Se copia la
*forma* —rejilla de 12 columnas, ritmo 24/16, un solo héroe, tarjeta sin
chrome— a componentes nuevos con datos propios. Es lo que pidió el usuario:
mismos componentes en cuanto a UI/UX, reescritos para los valores nuevos.

### D-2 · Tendencias: historiador + búfer de sesión, con la procedencia a la vista

Con 3 h de histórico y cuatro señales historizadas (§1.3, §1.4), una tendencia
sólo del historiador sale casi vacía y sólo del navegador se pierde al recargar.
Se hacen las dos, y **el origen de cada tramo se rotula**:

- **Historiador** (`ac:` + `aggregate`), sólo para las cuatro señales verificadas.
- **Búfer rodante en sesión**: el motor de polling ya trae una muestra cada 3 s;
  se guardan las últimas N en memoria. Sirve para las **ocho** señales, incluidas
  las tres que el historiador falsea, y es dato **real** aunque efímero.

Lo que **no** se hace: `getMachineHistory`, la rejilla determinista simulada que
alimenta `plantTrend` en el tablero de Resonac. Aquí no hay ninguna necesidad de
inventar una serie, y con un historiador que ya miente por su cuenta, añadir una
serie sintética encima sería impagable de depurar.

### D-3 · Cuatro activos, derivados por agrupación de señales

La rejilla de la vista Planta y la maqueta necesitan «cosas» que enseñar, y el
servidor sólo da ocho números sueltos. Se agrupan en cuatro **activos**, que
son la unidad de la vista:

| Activo | Señales | Qué responde |
|---|---|---|
| **Tanque de almacenamiento** | `SNIVEL_TANQUE`, `STEMPERATURA_TANQUE` | ¿Hay agua y en qué condiciones? |
| **Grupo de bombeo (motor + VDF)** | `CARGA_TRABAJO_MOTOR`, `Modo AM VDF` | ¿Está impulsando, y quién manda? |
| **Red de distribución** | `SFLUJO_INSTANTANEO`, `SPRESION_RELATIVA` | ¿Sale agua y con qué presión? |
| **Suministro eléctrico** | `INDICE_DESVIACION_VOLTAJE`, `KPIEFICIENCIA_ENERGETICA` | ¿Con qué calidad y coste de energía? |

La agrupación es **nuestra**, no del servidor, y el `README.md` del módulo lo
dice en su cabecera. Es honesta porque no inventa ningún valor: cada activo
muestra exactamente las señales que lo componen. El día que el servidor traiga
equipos de verdad, se sustituye `domain/activos.js` y ninguna vista se entera —
que es la misma promesa que `layout.js` hace hoy con las coordenadas inventadas
de la maqueta.

### D-4 · El estado es DERIVADO, y la pantalla lo dice

Sin tag `Estado` (§1.1) y sin alarmas (§1.4), el color de un activo sale de
comparar sus señales contra unos umbrales nuestros. Cuatro claves, deliberadamente
**distintas** de las de Resonac para que nadie las confunda al leer el código:

| Clave | Cuándo | Token |
|---|---|---|
| `nominal` | todas las señales del activo dentro de banda | `success` |
| `atencion` | alguna en banda de aviso | `amber` |
| `critico` | alguna fuera de límite | `coral` |
| `reposo` | el sistema no está impulsando (caudal ≈ 0 y carga 0) | `textSoft` |
| `sin_dato` | mala calidad o sin leer aún | `textFaint` |

`reposo` existe por lo medido en §1.2: el sistema está parado, y sin esta clave
un caudal de 0 caería en `critico` y la demo abriría en rojo permanente.

**Y se rotula.** La vista Planta lleva una línea fija bajo el título: *«Estados
derivados de umbrales locales; ICONICS no publica un estado para este sistema»*,
con enlace a los umbrales. Es el mismo criterio con el que «Máquina 3D» separa
hoy los estados que ICONICS no emite.

### D-5 · Los umbrales viven en un solo archivo, y son una suposición declarada

`Demo-EVA/lib/umbrales.js` es una tabla —señal → `{ min, avisoMin, avisoMax, max }`—
con su cabecera diciendo de dónde salen. **Hoy no salen de nada**: nadie nos ha
dado el rango operativo de este sistema. La tabla inicial se escribe con valores
de libro (nivel 20/80 %, temperatura 5/35 °C…) y **marcada como provisional en
la propia UI** hasta que el usuario los confirme.

**Ésta es la única pregunta abierta que cambia lo que se ve en pantalla.** Todo
lo demás del plan se puede ejecutar sin respuesta.

### D-6 · Verificación con el sistema en marcha

Con caudal 0 y motor a 0 no se puede comprobar ni el giro del impulsor, ni el
estado `nominal`, ni la animación de flujo. Hace falta **una ventana con la bomba
en marcha** para dar por buenas las Fases 4 y 5. Se pide al usuario; no bloquea
escribir el código, sí bloquea marcarlo verificado.

### D-7 · `src/Demo-EVA/` y el nombre de la carpeta

Se respeta el nombre pedido, aunque el resto de `src/` va en minúscula-kebab
(`three-d`, `dashboard-v2`). Nota práctica: Windows no distingue mayúsculas pero
el build de un servidor Linux sí, así que **el import se escribe exactamente
`@/Demo-EVA/…`** en todos los sitios. Se añade una regla al `README` del módulo.

---

## 3. Estructura de `src/Demo-EVA/`

Espeja la del proyecto —`domain/`, `data/`, `lib/`, `components/`, `views/`— para
que quien conozca `features/` no tenga que aprender nada nuevo. La separación es
la de siempre: **lo que tiene criterio es JS puro y probable en node; lo que
pinta es JSX y no decide nada.**

```
src/Demo-EVA/
├── README.md                    ← qué es, de dónde salen los datos, qué es derivado
├── index.js                     ← barril: sólo las 4 vistas
│
├── domain/                      JS puro · sin React · sin tema · probado en node
│   ├── señales.js               las 8 señales: punto, etiqueta, unidad, decimales,
│   │                             grupo, `historizado`. Único sitio con nombres de tag.
│   ├── activos.js               los 4 activos de D-3 y qué señal lleva cada uno
│   ├── estado.js                las 5 claves de D-4 + `estadoDeActivo(señales)`
│   └── sistema.js               createSeñal/createActivo/createSistema, null-safe
│
├── data/
│   ├── evaSource.js             motor de polling sobre los 8 puntos (1 lote / 3 s)
│   ├── historia.js              lectura `ac:` + búfer rodante de sesión (D-2)
│   └── hooks.js                 useSistemaAgua(), useSerieSeñal()
│
├── lib/
│   ├── umbrales.js              D-5 · la tabla, y su cabecera de procedencia
│   ├── formato.js               unidades y decimales por señal (sobre lib/format.js)
│   └── layout3d.js              dónde va cada activo en la maqueta
│
├── components/                  los tiles, con la forma de dashboard-v2
│   ├── rejilla.js               el CSS de bandas de 12 columnas (M7/M8)
│   ├── FranjaAtencion.jsx       activos fuera de banda · no se pinta si no hay nada
│   ├── BandaSeñales.jsx         4 stat tiles con sparkline y delta
│   ├── HeroeNivel.jsx           el arco héroe + 3 medidores de apoyo
│   ├── RejillaActivos.jsx       los 4 activos con su estado derivado
│   ├── TarjetaSeñal.jsx         una señal: valor, unidad, banda, frescura
│   └── TendenciaSeñales.jsx     la gráfica de las 4 historizadas
│
├── three-d/
│   ├── components/
│   │   ├── TanqueModel.jsx      cilindro + líquido a la altura de SNIVEL_TANQUE
│   │   ├── BombaModel.jsx       motor, impulsor giratorio, brida y manómetro
│   │   ├── ArmarioVdfModel.jsx  el variador; puerta abierta = modo Manual
│   │   ├── TuberiaModel.jsx     tramos + testigo de caudal
│   │   └── FichaActivo.jsx      la tarjeta al pulsar un activo
│   └── lib/
│       └── comportamiento.js    estado derivado → pose/baliza/movimiento
│
└── views/
    ├── PlantaEva.jsx
    ├── EquipoEva3D.jsx
    ├── MaquetaEva3D.jsx
    └── AssetsEva.jsx
```

Pruebas en `src/test/demo-eva/`, espejando el árbol, como manda
[`src/test/README.md`](../react-dashboard/src/test/README.md).

---

## 4. Las cuatro subvistas

### 4.1 «Planta» · sobre el lenguaje de *Planta · v2*

Mismas cinco bandas y mismo ritmo; contenido nuevo. La columna derecha dice qué
sustituye a qué y por qué:

| Banda de v2 | En Demo EVA | Motivo |
|---|---|---|
| Franja de atención | Activos fuera de banda | Derivada de umbrales, no de alarmas (§1.4) |
| Banda de 4 KPIs | Nivel · Caudal · Presión · Temperatura | Las 4 **historizadas**: son las únicas con sparkline honesto |
| Héroe OEE + 3 gauges | **Héroe: Nivel del tanque** + Caudal, Presión, Carga motor | No hay OEE. El nivel es la magnitud de estado del sistema |
| Rejilla de máquinas | **Rejilla de los 4 activos** (D-3) | No hay máquinas |
| Pareto de rechazos | **Margen consumido por señal** | No hay rechazos. Responde lo mismo: dónde está la tensión |
| Producción por hora | **Tendencia de las 4 historizadas** | No hay producción |

Los dos tiles que quedan fuera de la banda de KPIs —eficiencia energética y
tensión de línea— van en la tarjeta del activo «Suministro eléctrico», **sin
sparkline y con la nota de por qué** (§1.3).

### 4.2 «Máquina 3D» → el grupo de bombeo

Conserva el interruptor **Manual / En vivo** de la vista actual, que es lo que
permite enseñar los comportamientos sin esperar a que la planta cambie — y aquí
hace más falta que nunca, porque el sistema está parado (§1.2, D-6).

Los canales de `estadoVisual.js` se conservan; cambia a qué se atan:

| Canal | En Resonac | En Demo EVA |
|---|---|---|
| Giro | Husillo, velocidad ← `OEE_Rend` | **Impulsor**, velocidad ← `CARGA_TRABAJO_MOTOR` |
| Baliza | Estado de ICONICS | Estado derivado (D-4) |
| Pose abierta | Set-Up | **Puerta del VDF abierta** ← `Modo AM VDF` = Manual |
| Pieza en cinta | Pieza presente | **Testigo de caudal en la tubería** ← `SFLUJO_INSTANTANEO` |
| — | — | **Manómetro** en la brida ← `SPRESION_RELATIVA` |

Se mantienen las dos reglas duras del módulo 3D: **un solo bucle informativo**
(el impulsor) más el destello de alarma, y `frameloop` bajo demanda para que un
sistema en reposo deje la GPU a cero.

### 4.3 «Maqueta 3D» → la instalación

Tanque, grupo de bombeo, tramo de distribución y armario eléctrico sobre el
mismo `Piso`/`Escena`/`Encuadre` de hoy, con los tres encuadres.

Lo que la hace valer la pena y no ser un adorno: **el nivel del líquido dentro
del tanque es `SNIVEL_TANQUE` en vivo**. Es la única vista del proyecto en la
que la geometría *es* el dato, y el argumento de venta de la demo.

Pulsar un activo abre su ficha con las señales que lo componen. La leyenda de
abajo cuenta activos por estado derivado, como hoy cuenta máquinas.

### 4.4 «Assets» → el explorador, anclado a la demo

**Refactor en vez de copia.** Hoy `features/assets/views/Assets.jsx` tiene la
raíz `ac:` escrita a fuego (línea 18) y el árbol y el panel en el mismo archivo.
Se extrae `features/assets/components/ExploradorAssets.jsx` con props
`{ raiz, titulo, subtitulo }`, y quedan dos consumidores de tres líneas cada uno:
el `Assets` actual (raíz `ac:`) y `AssetsEva` (raíz `ac:TDCON/DEMO/SENSORES/`).

Es el único sitio donde se toca código existente, y es un refactor sin cambio de
comportamiento para la vista de hoy. `AssetsEva` añade un botón «ver todo el
árbol» que sube a `ac:`, para que siga sirviendo de herramienta de diagnóstico.

---

## 5. Fases

| Fase | Entregable | Esfuerzo | Verificación |
|---|---|---|---|
| **0** | Descubrimiento contra el servidor | ▁ | **hecha** · §1 |
| **1** | `domain/` + `lib/umbrales.js` | ▁ | Pruebas en node: 8 señales, 4 activos, 5 estados, huecos |
| **2** | `data/` sobre el motor existente | ▄ | Una petición por ciclo con los 8 puntos; `stats()` lo confirma |
| **3** | Vista **Planta** | ▄ | Pantalla + prueba de que ninguna señal sin `historizado` pide serie |
| **4** | Sección y ruta en el sidebar | ▁ | `buildNav`; las 4 subvistas navegables |
| **5** | **Maqueta 3D** | ▄ | Nivel del líquido = `SNIVEL_TANQUE`; prueba de layout |
| **6** | **Máquina 3D** | ▄ | Los estados en Manual; En vivo pendiente de D-6 |
| **7** | **Assets** + refactor del explorador | ▁ | La vista actual no cambia de comportamiento |
| **8** | `README.md`, `docs/TAGS-EVA.md`, bundle | ▁ | `verificar-bundle.mjs`: `index`/`vendor` sin crecer |

**Orden y por qué:** 1 y 2 antes que nada porque todo lo demás lee de ahí. La
Fase 4 va **después** de la 3 y no antes: una entrada de sidebar que abre una
vista vacía es lo que hace que una demo se enseñe rota. La 5 antes que la 6
porque la maqueta es lo que se enseña y la 6 depende de D-6.

**Regla de la Fase 8, que arrastra a las anteriores:** la sección Demo EVA lleva
las dos vistas 3D, así que **sus rutas se registran con `lazy()`** igual que las
de hoy, o la pantalla de Planta de Resonac empezaría a descargar three.js en el
arranque. `verificar-bundle.mjs` es la comprobación, no la intención.

### Lo que este plan NO hace

- **No borra nada de Resonac.** El usuario autorizó eliminarlo y a la vez pidió
  conservarlo como referencia de UI/UX; se conserva. Cuando Demo EVA esté
  verificada, retirar `features/machines`, `features/dashboard`, `prototypes/` y
  el catálogo de Resonac es una fase aparte de una tarde — y hasta entonces son
  la única referencia de cómo se comporta cada tile.
- **No toca el backend, ni `shared/`, ni el asistente.** El asistente conoce el
  catálogo de Resonac; darle las señales de agua es otro plan.
- **No añade banderas de compilación.** Demo EVA es superficie pedida, no un
  prototipo, y su origen de datos es el servidor real de siempre.

---

## 6. Riesgos

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| R-1 | El historiador falsea 3 señales (§1.3) | **Alto** · gráficas creíbles y falsas | `historizado` en el catálogo + prueba que compara último punto histórico contra valor vivo |
| R-2 | Umbrales sin confirmar (D-5) | Medio · colores arbitrarios | Un solo archivo, rotulados como provisionales en la UI |
| R-3 | Unidades desconocidas (§1.2) | Medio · «122.1» sin unidad no dice nada | Se pinta el nombre del tag bajo cada valor hasta confirmar |
| R-4 | Sistema parado (§1.2) | Medio · media demo sin verificar | Estado `reposo` explícito + modo Manual en 3D; D-6 para cerrar |
| R-5 | Histórico de 3 h (§1.4) | Bajo | Búfer de sesión (D-2); la ventana crece sola |
| R-6 | `three` en el arranque de Planta | Bajo, ya conocido | `lazy()` + `verificar-bundle.mjs` en la Fase 8 |
| R-7 | `Demo-EVA` con mayúsculas en Linux | Bajo | Import literal `@/Demo-EVA/…`; regla en el README del módulo |

---

## 7. Lo que hace falta del usuario

1. **Umbrales operativos** de las señales que los tengan (D-5) — lo único que
   cambia lo que se ve.
2. **Unidades** de caudal, presión, y confirmación de que
   `INDICE_DESVIACION_VOLTAJE` es una tensión en voltios (§1.2).
3. **Una ventana con la bomba en marcha** para verificar las Fases 5 y 6 (D-6).
4. Confirmar que `KPIEFICIENCIA_ENERGETICA`, `INDICE_DESVIACION_VOLTAJE` y
   `CARGA_TRABAJO_MOTOR` **deberían** tener historia propia — si es un fallo de
   configuración del Data Historian, arreglarlo allí devuelve tres sparklines a
   la vista Planta sin tocar una línea de código (§1.3).

Ninguna de las cuatro bloquea empezar por la Fase 1.
