# Plan 1 · Conectar el dashboard a la configuración real de ICONICS

Plan principal. Deriva del export `IcoUnifiedConfigSetIco_Assets_2026-07-28_12.48.07.057.xlsx`
y del estado del código a 29-jul-2026.

> **ESTADO (29-jul-2026)** — Fases 0–6 ejecutadas y verificadas (97 pruebas).
> Cambios posteriores al plan: los agregados del Dashboard devuelven `null`
> con servidor caído (no 0), la UI distingue los TRES orígenes de datos
> (real / simulado / demo), y el transporte por defecto pasó a ser el
> servidor real — el simulador es ahora opt-in con `VITE_ICONICS_FAKE=true`.
> Quedan las Fases 7–8, que requieren el servidor configurado, y dos
> pendientes de código marcados para entonces: la tendencia del Dashboard
> (`plantModel.js`) y el Comparativo siguen sobre serie simulada hasta que
> haya histórico `hda:` real.

Las mejoras estéticas, de rendimiento adicional y de nuevas herramientas se han separado a
**Plan 2** para no competir en prioridad con lo que aquí es crítico.

---

## 0. ¿Hace falta el servidor de ICONICS para empezar?

**No.** Seis de las ocho fases se ejecutan sin servidor, y eso no es una casualidad: es una
consecuencia buscada de la arquitectura.

El Excel **ya es el contrato**. Contiene los nombres de las 10 máquinas, sus propiedades, las
fórmulas del OEE, el enum de estados y el formato de direccionamiento (`ac:`, `hda:`). Si la
configuración del servidor se hará a partir de ese mismo Excel, entonces todo lo que dependa
del *contrato* puede construirse ya, y solo lo que depende del *comportamiento real* debe esperar.

| Fase | Necesita servidor |
|---|---|
| 0 · Red de seguridad | No |
| 1 · Contrato de datos | No |
| 2 · Fuente demo | No |
| 3 · Motor de polling | No |
| 4 · Adaptación de la UI | No |
| 5 · Interruptor demo/live | No |
| 6 · Documentación | No |
| 7 · Conexión real | **Sí** |
| 8 · Endurecimiento | **Sí** |

### Las dos piezas que hacen esto posible

**1 · Construir la fuente demo primero, no al final.**
En la versión anterior de este plan el interruptor de demo era la Fase 3. Invertirlo es mejor:
si `demoSource` existe desde el principio, **toda la arquitectura nueva y toda la UI se
construyen y validan sobre ella**, y conectar `iconicsSource` al final es un paso pequeño y
acotado en lugar de un salto al vacío.

**2 · Un transporte falso adversarial.**
`demoSource` sustituye a la capa de *dominio*, pero el motor de polling vive por debajo: su
trabajo es agrupar, filtrar por calidad, reintentar y cachear. Para probarlo hace falta un
falso a nivel de *transporte*: un módulo que imite la respuesta de `fetchIconicsBatch`
—incluidos códigos de calidad, puntos ausentes, HTTP 500 y respuestas lentas—.

> El falso debe ser **adversarial desde el primer día**. Si solo devuelve datos buenos, la UI
> se construirá asumiendo que todos los tags existen siempre y que la calidad siempre es 192,
> y esas suposiciones reventarán justo el día de la conexión real. Ver riesgo **R-04**.

### Qué sí requiere el servidor, y por qué no se puede adelantar

- Confirmar que las 10 rutas `ac:RESONAC/...` existen tal y como se derivaron del Excel.
- Comprobar el rango y las unidades reales de cada valor (el Excel declara la fórmula, no el dato).
- Verificar que `T_Ciclo_Teo` y `T_Inac_plan` resuelven contra la base SQL externa.
- Medir latencia real para calibrar cadencias y tiempos de espera.
- Validar el flujo OIDC contra el host de producción (hoy solo probado contra el simulador).

---

## 1. Arquitectura objetivo

```
                    ┌─────────────────────────────────┐
                    │  Vistas (Dashboard, Area, …)    │
                    │  usePlantData() useMachineData()│
                    └────────────────┬────────────────┘
                                     │  forma normalizada `Machine`
                    ┌────────────────▼────────────────┐
                    │  DataSourceProvider             │  ← el único `if (demo)`
                    └───────┬─────────────────┬───────┘
                            │                 │
              ┌─────────────▼──────┐   ┌──────▼──────────┐
              │  iconicsSource     │   │  demoSource     │
              │  + PollingEngine   │   │  (mock actual)  │
              └─────────┬──────────┘   └─────────────────┘
                        │  1 petición por tick
              ┌─────────▼──────────┐
              │  lib/iconics       │  ← aquí se inyecta el transporte falso
              └─────────┬──────────┘
              ┌─────────▼──────────┐
              │  backend/server.mjs│  OIDC + FWX REST
              └────────────────────┘
```

### Principio rector

> Las vistas no saben de dónde vienen los datos.

Hoy ya es casi cierto: `plantModel.js` recibe las máquinas por parámetro. El plan lo lleva
hasta el final. **Ningún componente pregunta nunca "¿estoy en demo?".**

### Módulos nuevos

| Módulo | Ubicación | Responsabilidad |
|---|---|---|
| Catálogo de tags | `src/lib/iconics/tagCatalog.js` | Traduce el Excel a nombres de punto. |
| Motor de polling | `src/lib/iconics/pollingEngine.js` | JS puro: agrupa, agenda, reintenta, cachea. |
| Transporte falso | `src/lib/iconics/fakeTransport.js` | Imita la API, incluidos los fallos. |
| Provider | `src/lib/iconics/IconicsDataProvider.jsx` | Conecta el motor a React. |
| Fuente de datos | `src/lib/datasource/` | Interfaz + `iconicsSource` + `demoSource`. |
| Dominio | `src/lib/domain/` | Forma `Machine`, estados, saneamiento. |

Sin dependencias nuevas de producción. El repo tiene hoy 6 y esa frugalidad es una virtud:
nada de librerías de estado de servidor para 10 máquinas.

---

## 2. El catálogo de tags

Un archivo declarativo derivado del Excel. Cuando ICONICS cambie, se edita aquí y solo aquí.

```js
// src/lib/iconics/tagCatalog.js

export const AREAS = {
  LIN: { label: "Lineales",       machines: ["1","2","3","4","5","6","7"] },
  REC: { label: "Rectificadoras", machines: ["10","11","13"] },
};

/** Propiedad de dominio → nombre de la propiedad en AssetWorX. */
export const TAGS = {
  oee: "OEE", disponibilidad: "OEE_Disp", rendimiento: "OEE_Rend", calidad: "OEE_Cal",
  aprobadas: "Pz_OK", rechazadas: "Pz_NOK", producidas: "Prod_Real_Total",
  estado: "Estado", modelo: "Modelo",
  tCiclo: "T_Ciclo", tCicloTeo: "T_Ciclo_Teo",
  tDispPot: "T_Disp_pot", tInacPlan: "T_Inac_plan", tMuerto: "T_Muerto_Ico",
};

export const pointName = (areaId, machineId, tag) =>
  `ac:RESONAC/${areaId}/${machineId}/${TAGS[tag]}`;

export const historyPointName = (areaId, machineId, tag) =>
  `hda:\\Configuration\\RESONAC\\${areaId}\\${machineId}:${TAGS[tag]}`;
```

**`T_Ciclo_Calc` no es uniforme.** Existe en las 7 líneas y **no** en las 3 rectificadoras, que
calculan el rendimiento con `T_Ciclo` en su lugar. El catálogo debe modelar esa diferencia por
área en vez de asumir un conjunto único de tags.

---

## 3. El motor de polling

10 máquinas × ~14 tags = **140 puntos**. Si cada `GaugeCard` usara el hook actual
`useIconicsPoint`, serían 10 intervalos independientes en la vista de área y ~14 en el detalle.

### Diseño: un poller, una petición, muchos suscriptores

**1 · Registro de tags con conteo de referencias.** Los componentes declaran qué necesitan al
montar y lo liberan al desmontar. El motor mantiene la unión. La vista de planta pide ~8 tags
× 10 máquinas; el detalle añade los restantes **de una sola máquina**.

**2 · Una petición por tick.** `POST /Data` con la unión completa, usando el lote que el
backend ya soporta (`batchReadIconicsPoints`, `server.mjs:413`). 140 puntos en **una** llamada.

**3 · Troceado con concurrencia acotada.** Si la unión supera ~200 puntos, se parte en lotes y
se emiten como máximo 3 en paralelo.

**4 · Guarda de petición en vuelo.** Si el tick anterior sigue corriendo, el siguiente se
**omite**, no se encola. Con un servidor lento es la diferencia entre degradarse y colapsar.

**5 · Consciente de visibilidad.** Al ocultarse la pestaña, pausa; al volver, refresco inmediato.
Un dashboard abierto toda la noche pasa de ~5 760 peticiones a 0.

**6 · Backoff exponencial.** 5 s → 10 s → 20 s → 40 s → tope 60 s, reiniciado al primer éxito.

**7 · Stale-while-revalidate.** Nunca se vacía la UI: se conserva el último valor bueno con su
`receivedAt`. Tras 3 ciclos fallidos la vista lo marca como *desactualizado*.

**8 · Filtro por calidad.** ICONICS devuelve un código junto al valor. **192 (0xC0) es "good"**;
lo sabemos por las propias expresiones del Excel, que detectan fallo de comunicación con
`quality({{...}}) != 192`.

> Un valor con calidad ≠ 192 **no se pinta como 0**: se marca como "sin dato". Un 0 de mala
> calidad entrando en `buildPlantSummary` hundiría la media de toda la planta sin que nadie
> lo note.

### Cadencias por criticidad

| Nivel | Qué | Intervalo | Por qué |
|---|---|---|---|
| Rápido | máquina abierta en detalle | 5 s | ya es más rápido de lo que se lee |
| Normal | vista de área y planta | 15 s | los KPIs de OEE se mueven despacio |
| Lento | `Modelo`, `T_Disp_pot`, `T_Inac_plan` | 5 min | son casi estáticos |
| Bajo demanda | historia (`hda:`) | sin poll | se pide al abrir la gráfica y se cachea |

### Presupuesto de red

| Vista | Peticiones/min | Enfoque ingenuo |
|---|---|---|
| Planta (10 × 8 tags) | **4** | ~120 |
| Detalle (1 × 14 tags) | **12** | ~168 |
| Pestaña oculta | **0** | ~120 |

---

## 4. El interruptor de demo

Un botón que desconecta la API y devuelve los datos hardcodeados, para enseñar y probar la UI
sin servidor.

La tentación es un `if (demoMode)` en cada componente. **Es exactamente lo que hay que evitar:**
ensucia toda la UI y garantiza que algún camino se olvide. En su lugar, dos implementaciones
de una misma interfaz:

```js
// src/lib/datasource/types.js — el contrato
//   subscribePlant(cb)        → unsubscribe
//   subscribeMachine(id, cb)  → unsubscribe
//   readHistory(id, range)    → Promise<Sample[]>
```

- `iconicsSource.js` — envuelve el `PollingEngine`.
- `demoSource.js` — reubica el `machines.js` actual (**no se borra**) y simula latencia y
  deriva de valores para que la demo se vea viva.

`DataSourceProvider` elige una al montar según `localStorage`. El cambio remonta el árbol de
datos vía `key={mode}`, garantizando que no queden valores del modo anterior.

### Reglas

1. El botón vive en el `Topbar`, junto al de tema.
2. **Indicador permanente y visible** en modo demo. Que nadie confunda una demo con producción.
3. Al entrar en demo el poller se **detiene** de verdad, no basta con ignorar sus datos.
4. Se persiste el modo, pero **`live` es el valor por defecto** en instalación limpia.

---

## 5. Las tres decisiones de producto

No son de código y bloquean la Fase 4.

### 5.1 Vocabulario de estados

Solo **Operando ↔ 1 (Running)** coincide. La app tiene cinco estados que ICONICS nunca envía
(Mantenimiento Correctivo y Preventivo, Limpieza, Receso, Paro de Emergencia) e ICONICS tiene
cuatro que la app desconoce (Stand By, Set-Up, Comm Fail, Alarma).

**Propuesta:** adoptar el vocabulario de ICONICS como canónico y conservar la capa de
presentación (colores, iconos) que ya existe. Si planta necesita los estados de mantenimiento,
hay que añadirlos en el servidor, no inventarlos en el frontend.

### 5.2 Ventana de tiempo de la disponibilidad

`shiftModel.js:38` asume turno de 8 h (`TURNO_S = 28800`). ICONICS calcula sobre
`T_Disp_pot = 86400` (**24 h**), restando un `T_Inac_plan` que viene de SQL. Son dos
definiciones distintas y darán números distintos.

**Propuesta:** usar los valores reales y degradar a las constantes solo en modo demo.

### 5.3 Nomenclatura

`area1`/`area2` con ids `a1-1…a1-7`, `a2-1…a2-3` → `LIN`/`REC` con `1…7` y `10, 11, 13`.
"Rectif 1/2/3" pasa a ser "Multi 10/11/13". Confirmar que planta reconoce esa nomenclatura.

---

## 6. Riesgos y mitigación

El respaldo del proyecto se hace hoy por **copia manual de la carpeta**. Eso cubre "volver
atrás", pero no cubre el riesgo más caro de este trabajo: que el código nuevo funcione,
compile, se vea bien y **calcule distinto**. Una copia te devuelve el código anterior; no te
dice si `buildPlantSummary` sigue dando el mismo OEE. De ahí que **R-01** sea la Fase 0.

| ID | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| R-01 | Regresión numérica silenciosa | Alto | *Golden fixtures* antes de tocar nada (Fase 0) |
| R-02 | El async es viral y rompe consumidores | Alto | Detener el async en la frontera del provider |
| R-03 | Los 11 prototipos dependen de `machines.js` | Medio | `demoSource` conserva su API intacta |
| R-04 | UI construida sobre datos demasiado limpios | Alto | Transporte falso adversarial desde el día 1 |
| R-05 | Suscripciones huérfanas y fugas | Alto | Refcount con prueba de montaje/desmontaje |
| R-06 | React 18 StrictMode duplica suscripciones | Medio | Probar bajo StrictMode desde el principio |
| R-07 | `NaN`/`Infinity` contaminan los agregados | Alto | Saneamiento en el normalizador de dominio |
| R-08 | Tormenta de peticiones al navegar rápido | Medio | *Debounce* del recálculo de la unión |
| R-09 | Estado obsoleto al cambiar demo↔live | Medio | Remontaje forzado con `key={mode}` |
| R-10 | El catálogo diverge del servidor | Medio | Aviso cuando un punto pedido no vuelve |
| R-11 | Contrato `Machine` mal congelado | Medio | Definirlo desde el Excel, no desde la UI |
| R-12 | Sobre-ingeniería para 10 máquinas | Bajo | Un archivo por pieza, cero dependencias nuevas |
| R-13 | Credenciales y TLS relajado | Alto | `NODE_TLS_REJECT_UNAUTHORIZED=0` no debe desplegarse |

### Los que merecen detalle

**R-01 · Regresión numérica silenciosa.**
No hay pruebas en el repo: ni `test` en los scripts, ni dependencias, ni archivos. Se van a
tocar ~10 archivos que alimentan todos los KPIs. Un error de conversión de unidades o de
promediado produce una app que arranca y se ve perfecta, con números equivocados — el peor
modo de fallo posible en un panel de planta.
*Mitigación:* antes de cambiar nada, serializar la salida actual de `buildPlantSummary`,
`plantTrend`, `productionByMachine` y `getMachineSnapshot` sobre las máquinas mock, y guardarla
como fixture. Tras cada fase, comparar. Añadir `vitest` cuesta una dependencia de desarrollo y
casi cero configuración, porque Vite ya está.

**R-02 · El async es viral.**
`const EQUIPOS = getMachinesByArea("area1")` (`Area1.jsx:12`) se evalúa al importar el módulo.
Convertirlo en llamada de red puede propagarse hacia arriba hasta contaminar todo el árbol.
*Mitigación:* `plantModel.js` ya es puro y recibe las máquinas por parámetro — **no se toca**.
El async se detiene en el provider. Cambia *quién* llama, no *qué* se calcula. Esto también
protege R-01: si la aritmética no se toca, no puede regresar.

**R-04 · UI construida sobre datos demasiado limpios.**
Es el riesgo característico de construir contra un falso. Si `fakeTransport` siempre devuelve
valores buenos, nadie escribirá el camino de "sin dato" y la conexión real será un día de
sorpresas.
*Mitigación:* el falso incluye desde el inicio un modo de caos configurable — calidad ≠ 192,
puntos ausentes en la respuesta, `null`, valores fuera de rango, HTTP 500 y latencia alta. La
Fase 4 no se da por cerrada hasta que la UI se comporta con dignidad en todos ellos.

**R-07 · `NaN` e `Infinity`.**
No es hipotético. En el Excel, `OEE_Cal = (Pz_OK / Prod_Real_Total) × 100` a nivel de instancia
**no tiene protección por abajo**: si `Prod_Real_Total` vale 0 al inicio del turno, el resultado
es `Infinity` o `NaN`. Y `buildPlantSummary` promedia sin comprobar, así que **un solo NaN
contamina el resumen de toda la planta**. Curiosamente la clase `Calculos` del propio Excel sí
acota a 0–120, lo que sugiere que el problema ya se detectó del lado del servidor pero no en
todas las rutas.
*Mitigación:* el normalizador de dominio descarta con `Number.isFinite` y marca el campo como
ausente. Mismo argumento que la regla de calidad 192: **sanear en la frontera, nunca en la vista.**

**R-05 y R-06 · Ciclo de vida de las suscripciones.**
Un motor con refcounting es propenso a suscriptores que no se dan de baja e intervalos que
sobreviven al desmontaje. Además React 18 en StrictMode monta, desmonta y vuelve a montar en
desarrollo, lo que duplicaría suscripciones si el `useEffect` no es simétrico.
*Mitigación:* prueba explícita de "montar y desmontar 100 veces deja 0 suscriptores y 0 timers",
y desarrollo bajo StrictMode desde el principio. El `mountedRef` de `useIconicsPoint.js` ya es
un buen precedente del patrón.

---

## 7. Fases de ejecución

### Fase 0 · Red de seguridad `sin servidor`
- **0.1** Añadir `vitest` como dependencia de desarrollo y un script `test`.
- **0.2** Congelar *golden fixtures* de `buildPlantSummary`, `plantTrend`,
  `productionByMachine` y `getMachineSnapshot` con los datos mock actuales.
- **0.3** Activar `StrictMode` si no lo está, para que R-06 aparezca pronto y no tarde.

### Fase 1 · Contrato de datos `sin servidor`
- **1.1** `tagCatalog.js` (§2), incluida la asimetría de `T_Ciclo_Calc`.
- **1.2** Forma `Machine` en `domain/`, derivada del Excel y **no** de lo que la UI usa hoy
  (R-11). `Prod_Teo` y `Operador` se declaran opcionales: no tienen fuente en el Excel.
- **1.3** `domain/estado.js` con la decisión de §5.1.
- **1.4** Normalizador con saneamiento de calidad y de `NaN`/`Infinity` (R-07).

### Fase 2 · Fuente demo sobre el nuevo contrato `sin servidor`
- **2.1** Interfaz `DataSource`.
- **2.2** `demoSource` que produce `Machine` normalizadas desde el `machines.js` actual,
  preservando su API pública para no romper los prototipos (R-03).
- **2.3** Comprobar contra las fixtures de la Fase 0 que los números no se han movido.

> Al cerrar esta fase la app sigue funcionando exactamente igual, pero ya **a través de la
> arquitectura nueva**. Es el hito que valida la abstracción antes de apostar por ella.

### Fase 3 · Motor de polling `sin servidor`
- **3.1** `fakeTransport.js` con modo de caos (R-04).
- **3.2** `pollingEngine.js` con las 8 propiedades de §3. JS puro, probado en node contra el falso.
- **3.3** Pruebas de ciclo de vida y presupuesto de red (R-05, R-06).
- **3.4** `IconicsDataProvider` + hooks `usePlantData()`, `useMachineData(id)`,
  `useMachineHistory(id, range)`.
- **3.5** Contador de peticiones/min visible en desarrollo, para **demostrar** el presupuesto.

### Fase 4 · Adaptación de la UI `sin servidor`
Se ejecuta sobre `demoSource` y sobre el falso adversarial.
- **4.1** `Area1`/`Area2` → `LIN`/`REC` con hooks. Elimina el `const EQUIPOS` de nivel de
  módulo (`Area1.jsx:12`), que es lo que hoy impide que los datos sean asíncronos.
- **4.2** Renombrado de áreas y máquinas (§5.3).
- **4.3** Estados de carga, error, *sin dato* y *desactualizado* en `GaugeCard` y en los tiles.
- **4.4** `MachineDetail` y subvistas sobre `useMachineData`.
- **4.5** Sustituir las constantes de `shiftModel` por lecturas reales, degradando a constantes
  cuando falten (§5.2).

### Fase 5 · Interruptor demo/live `sin servidor`
- **5.1** `DataSourceProvider` con persistencia y remontaje por `key` (R-09).
- **5.2** Botón en el `Topbar` + indicador permanente.
- **5.3** `iconicsSource` conectado al motor. Aún sin servidor: apunta al falso.

### Fase 6 · Documentación `sin servidor`
Subfase explícita, no un "si da tiempo". El repo ya tiene un estilo de comentario muy bueno
—explica el **porqué**, no el qué— y hay que sostenerlo.
- **6.1** Cabecera en cada módulo nuevo, en el estilo existente.
- **6.2** Comentar las cinco decisiones no obvias: la regla de calidad **192** y por qué un 0
  de mala calidad es peligroso; el saneamiento de `NaN`; las cadencias y su justificación; por
  qué el interruptor vive en la raíz; y la decisión de vocabulario de estados.
- **6.3** `README` con cómo arrancar en `demo` y en `live`.
- **6.4** `docs/TAGS.md`: tabla Excel → nombre de punto → campo de dominio.

### Fase 7 · Conexión real **`requiere servidor`**
- **7.1** Apuntar `.env.local` al servidor real (hoy: `svrsim:sin`, el simulador).
- **7.2** Validar con la vista **Assets**, que ya navega `ac:`, que las 10 rutas responden.
- **7.3** Ejecutar el verificador de catálogo: leer los 140 puntos y reportar los ausentes o
  con calidad ≠ 192. Debe quedar como script **reejecutable**, no de un solo uso (R-10).
- **7.4** Añadir `fetchIconicsHistory` a `apiClient.js` — única laguna del transporte; la ruta
  backend ya existe (`server.mjs:861`).
- **7.5** Sustituir el falso por el transporte real. Debería ser un cambio de una línea; si no
  lo es, la abstracción de la Fase 2 estaba mal puesta.

### Fase 8 · Endurecimiento **`requiere servidor`**
- **8.1** Calibrar cadencias y tiempos de espera con la latencia medida.
- **8.2** Contrastar peticiones/min reales contra el presupuesto de §3.
- **8.3** Escenarios: servidor caído, tag en mala calidad, pestaña oculta 10 min, cambio
  demo↔live, máquina sin `T_Ciclo_Calc`, `Prod_Real_Total` a 0 al inicio del turno.
- **8.4** Revisar que `NODE_TLS_REJECT_UNAUTHORIZED=0` y las credenciales no viajen al
  despliegue (R-13).

---

## 8. Riesgos de la configuración del servidor

Detectados en el Excel. No son del frontend, pero lo afectan y conviene resolverlos antes de
la Fase 7.

| Hallazgo | Consecuencia |
|---|---|
| `Prod_Teo` y `Operador` sin fuente de datos | Llegarán vacíos; tratarlos como opcionales |
| `OEE_Today` / `OEE_Yday` sin expresión ni punto | No construir UI que dependa de ellos |
| `T_Ciclo_Teo` y `T_Inac_plan` vienen de SQL externo | Si esa base no está poblada, D y R fallan aunque el PLC esté bien |
| Rectificadoras sin `T_Ciclo_Calc` | Rendimiento no comparable entre familias |
| `OEE_Cal` de instancia sin acotar por abajo | `Infinity`/`NaN` con `Prod_Real_Total` = 0 |
