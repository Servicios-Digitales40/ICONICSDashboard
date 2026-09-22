# PLAN 32 — Vibraciones 1.0: el módulo completo

**Estado:** F1 y **F5** completadas · F4 parcial (`necesita` hecho; cresta imposible en S1, del servidor) · F2 y F3 sólo esperan el sondeo en planta · **F6 es la única fase de código viva** · sondeado el 22-09-2026, lo vivo se ejecuta en el **Plan 41**
**Rama:** `Vibraciones1.0`
**Fecha:** 17-09-2026

> **Mientras dure esta rama, la ESTACIÓN DE LLENADO está cerrada por
> mantenimiento.** Su código se consulta —es el módulo maduro y el espejo del
> que copiar— y **no se modifica**. Qué está cerrado y cómo se reabre, en §2.

---

## 1. Qué se quiere

Que el sistema y el asistente puedan, sobre el sistema de **vibraciones**:

1. **Buscar y ver sus señales**, en vivo y en histórico.
2. **Traer lo suyo del RAG y de los casos previos.**
3. **Diagnosticar** con el motor determinista.

El tanque ya hace las tres. Vibraciones no, y el porqué está medido en §3.

---

## 2. F1 — Sanitización: cerrar la estación de llenado ✅

**Completada el 17-09-2026.** Cuatro commits: `84aa6c6`, `151af33`, `4795d63`,
`0056aa3`.

### 2.1 El hallazgo que definió la fase

**Ocultar las rutas no calla la red.** El motor de sondeo arranca por conteo de
referencias desde `subscribeSistema` (`evaSource.js`), no al montar una vista.
El **sidebar** —que está en todas las pantallas— llamaba a `useSistemaAgua()`
para pintar un punto de estado, así que abrir cualquier vista de vibraciones
seguía leyendo los **52 puntos del tanque cada 3 s**.

Es el mismo defecto por el que se retiró el contador de alarmas del Topbar el
31-08-2026, y por eso la prueba que lo fija mira las **suscripciones**, no el
menú (`llenado-cerrado.test.jsx`).

**Y el badge del Plan 31 hacía lo mismo.** `useConteoHallazgos` contaba las dos
máquinas desde el chrome. Su propia prueba seguía verde porque cuenta `fetch`
en el badge, **no las suscripciones que abre**.

### 2.2 Lo que se cerró

| Qué | Cómo |
|---|---|
| Las 5 rutas del tanque | sin `nav` — la sección desaparece sola de `buildNav` |
| `DEFAULT_ROUTE` | `eva-inicio` → `vib-inicio` |
| El sondeo del tanque | fuera del sidebar y del badge de hallazgos |
| «En vivo» y los chips de Alarmas | son del PLC_1 y de los 4 activos del tanque |
| Selectores de Turno y Cuaderno | `SISTEMA_IDS_EN_SERVICIO` |
| Casos previos | filtrados a máquinas en servicio |
| El asistente | `resolverSistema()` niega los sistemas `cerrado` |

### 2.3 Tres decisiones que no eran obvias

**El tanque sigue en `SISTEMAS`.** Quitarlo era lo evidente y se descartó: ese
registro alimenta también el motor de diagnóstico, el transporte falso y
`NO_COMPARTEN` —la regla que impide cruzar las dos instalaciones—, así que
borrarlo para callar al asistente se habría llevado piezas que vibraciones
necesita. En su lugar se declara `cerrado` con su motivo.

**No se filtró `SISTEMA_IDS`.** Esa lista hace dos trabajos que se parecen y no
son el mismo: valida esquemas Zod y decide si un caso guardado es válido
(`purgar-casos-invalidos.mjs`), además de llenar selectores. Filtrarla habría
dejado los 11 casos del tanque con un `sistema` que el backend no reconoce.
**Ocultar una máquina no puede invalidar su historia.** De ahí
`SISTEMAS_EN_SERVICIO`, aparte.

**Una guarda, no sólo el prompt.** El cierre se le dice al asistente por
`limitaciones`, pero lo que de verdad lo impide es `resolverSistema()`. El
motivo está medido ese mismo día: el 4B abrió **6 de cada 6** narraciones
desobedeciendo su instrucción. Dejar el cierre de una máquina en manos de una
frase del prompt sería confiar justo en lo que acababa de fallar.

### 2.4 Las pruebas

**Adaptadas** las que afirman algo que no depende de qué máquina sea —idioma,
avisos, bandeja, badge, rutas—. **Omitidas con su motivo** las que necesitan la
segunda máquina o cuya pantalla está cerrada.

En `verificar-herramientas` se añadió `omitir()`: la comprobación no corre pero
**se cuenta**, y el resumen imprime cuántas y por qué. Borrarlas habría tirado
trabajo que vuelve a valer; comentarlas habría dejado un guion en verde que
dejó de mirar la mitad sin decirlo.

**Los primeros que hay que reactivar al reabrir** son los dos grupos de
`NO_COMPARTEN` (`turno-eva`, `bandeja-eva`): vigilan un no negociable (§2.1).

### 2.5 Cómo se reabre

1. Devolver el `nav` a las cinco rutas del tanque en `routes.jsx`, y
   `DEFAULT_ROUTE` a `eva-inicio`.
2. Quitar `cerrado` y la primera `limitaciones` del tanque en `sistemas.js`.
   Con eso, `SISTEMAS_EN_SERVICIO` vuelve a ser `SISTEMAS` y el asistente deja
   de negarlo — **sin tocar ninguna vista**.
3. Descomentar `useSistemaAgua` en `Sidebar.jsx` y `hallazgos.js`.
4. Los `.skip` de las pruebas y `omitirEnvuelto` → `checkAsync`.

Cada sitio lleva escrito su «para reabrir».

---

## 3. El estado del módulo de vibraciones, medido

Medido el 17-09-2026 contra el servidor real. Corrige dos cosas que se habían
dicho de memoria y eran falsas.

| | Tanque | Vibraciones |
|---|---|---|
| Líneas de dominio | 3 393 | **3 257** |
| Puntos en vivo | 52 | **73** |
| Series declaradas | 52 | **40** |
| **Series que responden HOY** | **86 muestras/6 h** | **0, tramo fallido** |
| Reglas de riesgo | 17 | 18 |
| Huérfanas | 2 | 14 — **12 deliberadas** |
| `firmaTemporal` | 4 | **0** |
| Casos previos | 11 | **0** |
| Vistas que usan historia | 3 | **0** |

**El dominio no es el hermano pobre.** La máquina está caracterizada: motor WEG
W22 143/5T 2 HP 2 polos (3475 rpm), rodamiento 6205 ZZ en S1, sensibilidades
reales 100,05 / 99 / 100 mV/g, y la norma correcta elegida por potencia —
**ISO 10816-1 Clase I**, no la 10816-3, que pondría el aviso en 4,5 mm/s y
perdería la mitad del margen.

**La topología está resuelta:** es un tren de rotor y sólo S1 está sobre el
motor. S2 y S3 son chumaceras, con `rodamiento: null` para no calcular
BPFO/BPFI con la geometría equivocada.

**«15 huérfanos de 18» era engañoso.** De los 14, **12 son deliberados**:
`rodamientos-sin-vigilar` no tiene causas *porque el riesgo dice justamente que
no se vigila*. Sólo 2 están pendientes de transcribir.

### 3.1 Las fallas

1. **El historiador no devuelve nada.** Ocho claves probadas —tres `vRMS`,
   `aRMS`, `DKW` y tres del variador— dan **0 muestras y `tramosFallidos: 1`**
   en 6 h y en 24 h. El tanque, en el mismo instante, devuelve 86. **Es el
   bloqueante del objetivo 1.**
2. **El diagnóstico está ciego.** 8 de 18 reglas tienen `necesita: 0`, así que
   el motor no puede vetar por calidad ni citar cifras. Y **cero
   `firmaTemporal`**: la cuarta fuente no puntúa nada.
3. **Cero casos previos.** La tercera fuente está vacía para esta máquina.
4. **El RAG no la cita, aunque podría.** La **ISO 20816-3 está indexada con 47
   fragmentos** y el V20 con 917. Falta que las causas declaren
   `terminosManual` para alcanzarlo.
5. **Instrumentación apagada.** `MonState_e_f_BPFO/BPFI/FTF` están en posición
   **0 — no se vigilan**. El Janitza da mala calidad en 16 de 18 tags.
6. **Sin Vista de Planta ni Detalle.** No hay equivalente a `PlantaTanque` ni a
   `DetalleActivo`, ni `data/vibraciones/historia.js`.

---

## 4. El diagnóstico por análisis de vibraciones

El análisis clásico se apoya en el **espectro**. El SM 1281 lo calcula dentro y
**sólo publica escalares**, así que aquí no hay FFT. Pero los escalares que
publica dan para más de lo que se está usando.

### 4.1 Lo que se puede diagnosticar con lo que ya se lee

| Falla | Firma con lo que tenemos |
|---|---|
| **Desbalance** | `vRMS` alto, factor de cresta **bajo** (1,4-3), y sube con ω² — el variador da la rpm |
| **Desalineación / holgura** | `vRMS` alto con **asimetría entre apoyos** (la regla ya existe) |
| **Rodamiento picado** | `aRMS`/`aPeak` suben y `vRMS` apenas se mueve; factor de cresta **>5-6** |
| **Degradación** | `DKW` — «cuántas veces peor que la referencia», si se aprendió con la máquina sana |

### 4.2 Lo que falta, por valor

1. **Factor de cresta — `aPeak/aRMS`.** Coste cero: las dos medidas ya se leen
   en los tres apoyos. Separa «golpe seco de rodamiento» de «ruido de
   desbalance». **La mejor relación valor/esfuerzo del módulo.**
2. **Normalizar por rpm.** Un `vRMS` de 2 mm/s a 600 rpm y otro a 3400 no
   significan lo mismo, y hoy se juzgan con el mismo umbral.
3. **Encender BPFO/BPFI/FTF** en el SM 1281 — es configuración, no código. Sólo
   sirve en **S1**: S2 y S3 son chumaceras sin referencia conocida.
4. **La referencia de las chumaceras.** El reporte de I+D+i la marca como dato
   faltante de prioridad alta. Sin geometría no hay frecuencias de defecto en
   dos de tres apoyos.
5. **`firmaTemporal` para las reglas.** Depende de arreglar el historiador.

**Lo que NO se hará:** pedir espectro FFT. El módulo no lo publica y sacarlo
exigiría otro hardware.

---

## 5. Fases siguientes

> **Revisadas el 22-09-2026 (Plan 40 F5).** Estas fases se escribieron para la
> máquina de vibraciones ESCRITA A MANO, que ya no existe: desde el Plan 40 la
> demo es una máquina **configurada** de tipo `vibraciones`. Lo que pedía
> tocar el catálogo se hace ahora en el TIPO (`shared/eva/tipos/vibraciones.js`
> y los módulos de `shared/eva/vibraciones/`) y vale para toda configurada de
> ese tipo; lo que pedía datos de la instalación se hace en su configuración.

### F2 — Desbloquear el historiador · **sólo queda el paso en planta**
Por qué `DEMO 3` devuelve 0 muestras: si el grupo dejó de registrar, o si la
ruta cambió como en B10. **Bloquea el objetivo 1 y las `firmaTemporal`.**

**Sondeado el 22-09-2026: la maquinaria del repo está completa.**
`backend/lib/sondearSeries.mjs` gana `historyVerified` variable por variable
(sube a `true` con muestras, lo deja intacto si no se pudo leer — no lo baja a
`false`, que sería disfrazar un fallo de lectura de ausencia de dato), y
`backend/ia/indices/maquinas.mjs:95` lo conserva entre ediciones mientras la
serie sea la misma. El esquema **rechaza `historyVerified` del cliente**
(`backend/http/esquemas.mjs:759`): lo pone el sondeo, no quien edita.

**Lo que falta no es código: es sondear con el motor girando.** Es el paso 1
de la F4 del Plan 40, recogido en el **Plan 41 §F1**.

### F3 — Las señales en la pantalla · **depende de F2, sin trabajo propio**
La vista Gráficas de la sección de cada configurada ya usa `GraficaHistoria` y
`SelectorRango` (Plan 37 F2). Lo que falta es que tenga series que pintar
(F2), no la vista. **No tiene trabajo de código propio**: en cuanto F2 dé
series verificadas, esta fase se cierra mirando la pantalla.

### F4 — El diagnóstico ve · **PARCIALMENTE HECHA (sondeo del 22-09-2026)**

De los tres puntos que pedía, **uno está hecho y otro resultó imposible**:

- **`necesita` en las 8 reglas que no lo tenían: ✅ HECHO.** Las **17** reglas
  de `riesgosVibracion.js` lo declaran hoy, y el motor lo usa
  (`riesgosVibracion.js:811`) para marcar NO EVALUABLE en vez de puntuar con
  un hueco. Se comprobó regla por regla.
- **Factor de cresta: ⛔ IMPOSIBLE EN S1, y es del servidor.** Medido el
  21-09-2026 y escrito en `shared/eva/vibraciones/vibraciones.js:1151`:
  `aPeak_S1` **devuelve la serie de `aRMS_S1`** —1805 de 1805 marcas con el
  valor idéntico, el 100 %—. El factor `aPeak/aRMS` daría **exactamente 1,0
  siempre** en S1. En S2 y S3 sí se puede. Una regla que puntuara la cresta
  de S1 estaría puntuando un 1,0 fabricado por un defecto del historiador, que
  es justo lo que `CLAUDE.md` §2.4 prohíbe. **Queda fuera hasta que el
  servidor publique `aPeak_S1` de verdad**, y entonces vale para S1 también.
- **Normalizar por rpm: queda**, y es lo único vivo de esta fase. Recogido en
  el **Plan 41 §F3**.

### F5 — RAG y casos · ✅ **COMPLETADA (Plan 39 F3, confirmada el 22-09-2026)**
Pedía `terminosManual` en las causas de vibraciones para alcanzar los 47
fragmentos de la ISO 20816-3 ya indexados. **Está**: `vibraciones.js` los
declara en las cuatro medidas —`vRMS`, `aRMS`, `aPeak` y `DKW`, líneas 523 a
567— y el tipo los propaga a toda configurada
(`shared/eva/tipos/vibraciones.js:166`). El Plan 39 F3 cerró la otra mitad:
los manuales se asignan al **TIPO** (`tipo:vibraciones`), y el modelo cita la
ISO 20816-3 para `Nuevo-Modor`. Medido allí.

### F6 — Índice de sinónimos · **queda, y es la fase de código viva**
Que el asistente entienda «el apoyo del motor» como el tanque entiende «la
bomba». El tipo ya trae `vocabulario` (Plan 40 F3) y llega a cada configurada
por `construirSistema.js:553`, **pero hoy sólo alimenta el dictado**
(`backend/ia/voz.mjs:79`): nadie lo usa para resolver a qué se refiere quien
escribe. `aliasDeTags.js` **no es esto** — reconoce cómo llama el SERVIDOR a
un tag (`VEL_RMS` → rol `vRMS`), no cómo lo llama una PERSONA. Recogido en el
**Plan 41 §F2**.

---

## 6. Lo que queda fuera

- **Modificar el código del tanque.** Se consulta, no se toca.
- **Espectro FFT.** Ver §4.2.
- **Reabrir la estación de llenado.** Es el final de la rama, no una fase.
