# PLAN 29 — Más reglas y más causas para el tanque

**Estado:** propuesta, pendiente de revisión. **No se ha escrito código.**
**Fecha:** 14-09-2026
**Alcance:** SÓLO el tanque. Vibraciones queda fuera de este plan por decisión
explícita del 14-09-2026.

**Relación con el Plan 28:** independiente. El 28 mejora el MOTOR (auditoría,
calidad, estados); éste mejora el CATÁLOGO que el motor puntúa. El 29 da más
retorno inmediato y es más barato.

---

## 0. El diagnóstico que lleva a este plan

Medido el 14-09-2026 sobre el catálogo real:

| Métrica | Valor |
|---|---|
| Riesgos del tanque | 10 |
| Riesgos con causas declaradas | 9 |
| Causas totales | 17 |
| Causas con `firmaTemporal` | **1** |
| Señales historizadas del tanque | **52** |
| Señales que alguna regla usa | **7** |

Las siete son `nivelTanque`, `cargaMotor`, `presionRelativa`,
`flujoInstantaneo`, `tensionLinea`, `modoVdf`, `temperaturaTanque`. **Sobran
45 señales historizadas que ninguna regla mira.**

### Por qué eso importa para el diagnóstico

La aritmética de `diagnostico.mjs` suma cuatro términos. Para dos causas del
MISMO riesgo:

- `datos` es **idéntico** — verdad física, lo dice la cabecera del motor.
- `manual` sale parejo si los manuales se parecen.
- `casos` es casi siempre 0 (no hay `aprendizaje.json` en esta copia).
- `temporal` es 0 en 16 de 17 causas.

Resultado: **el motor puntúa pero no ordena**. Con empate, `sort` es estable y
el técnico ve como «más respaldada» la causa que alguien tecleó primero.

---

## 1. La distinción que gobierna todo el plan

Las 45 señales sin usar NO son igual de utilizables, y la línea que las separa
es `UMBRALES`.

| Clase | ¿Escribible hoy? | Por qué |
|---|---|---|
| **Booleanas** — alarmas, mandos, estados | **Sí** | No necesitan umbral. `nivelAlto === true` es un hecho del PLC |
| **Analógicas nuevas** — corriente, par, bus DC | **No** | Necesitan un umbral que nadie nos ha dado |

### El incidente que lo demuestra, y es de hoy

[`umbrales.js`](../../shared/eva/comun/umbrales.js) dice que sus números salen
**«de ningún sitio»**: son valores de libro, y `PROVISIONALES` sigue en `true`.
El 14-09-2026 se corrigieron dos contra el historiador real:

- `flujoInstantaneo.avisoMax` estaba en **45** cuando la instalación nunca pasa
  de **~21 L/min**. `posible-fuga` no podía dispararse **jamás**.
- `presionRelativa.avisoMax` estaba en **5,5** cuando la operación sana llega a
  una mediana de **6,74 PSI**. Marcaba «sobrepresión crítica» la mayor parte
  del tiempo que la bomba trabajaba.

Una regla que nunca dispara y una que dispara siempre son los dos fallos
opuestos, y los dos vienen de un umbral inventado. Es además el argumento
textual de `aprendizaje.js`: *una regla inventada que salta sin motivo se
desactiva a la semana y se lleva por delante la credibilidad de las que sí
valen.*

**Regla de este plan: ninguna regla nueva introduce un umbral analógico.**

---

## 2. Lo que habilita escribir sin inventar nada

Auditado el 14-09-2026 contra `senales.js`. Las tres clases utilizables:

### 2.1 Las ocho alarmas nativas (`naturaleza: "alarma"`)

`nivelAltoAlto`, `nivelAlto`, `nivelBajoBajo`, `nivelBajo`, `presionAlta`,
`faltaDePresion`, `bajoFlujo`, `fallaVariador`, `paroDeEmergencia`.

Todas `historizado: true`. Su polaridad **está confirmada contra
Lista-variables.pdf §1.10**: `true` es la condición mala en las ocho.
`paroDeEmergencia` lleva `invertida: true` —contacto normalmente cerrado—
confirmado contra el programa real el 10-09-2026.

Y traen `estadoActivo` ya declarado (`critico` / `atencion`), que es
**exactamente la severidad de la regla** sin decidir nada nuevo.

> El umbral de estas señales lo puso quien configuró el PLC. Usarlas no es
> inventar un número: es leer el que ya existe.

### 2.2 Los estados de actuador (`naturaleza: "estado"`)

`estadoS1`, `estadoS2`, `estadoBa`, con tabla declarada:

```
1: "Apagado"   2: "En marcha"   3: "Error"   4: "Mantenimiento"
```

`3 = Error` es un diagnóstico que el propio equipo emite. Y `0` ya está
documentado como **valor inicial del PLC: se trata como sin dato, no como
apagado** — respeta §2.4 sin trabajo extra.

### 2.3 Los pares orden/realimentación (`naturaleza: "mando"`)

`arranqueParoS1`/`estadoS1`, `arranqueParoS2`/`estadoS2`,
`arranqueParoBa`/`estadoBa`, `referenciaVariador`/`frecuenciaSalidaVariador`.

Comparan **dos lecturas entre sí**, no contra una banda inventada. Una orden
que no se cumple es una avería, y decirlo no requiere ningún umbral nuestro.

---

## 3. Reglas nuevas propuestas (bloque A y B)

Nueve. Cada una con la evidencia de que no inventa nada.

### A — Sobre alarmas nativas

| id | Condición | Severidad | De dónde sale |
|---|---|---|---|
| `emergencia-activa` | `paroDeEmergencia` en condición mala | crítico | `estadoActivo` de la señal; `invertida` confirmada 10-09-2026 |
| `variador-en-falla` | `fallaVariador === true` | crítico | `estadoActivo: "critico"` declarado |
| `nivel-critico-alto` | `nivelAltoAlto === true` | crítico | `estadoActivo: "critico"` + nota «Riesgo de derrame» |
| `nivel-critico-bajo` | `nivelBajoBajo === true` | crítico | `estadoActivo: "critico"` |
| `alarma-de-proceso-activa` | `presionAlta`/`faltaDePresion`/`bajoFlujo` | crítico | `estadoActivo` de cada una |

> **DECIDIDO el 14-09-2026: una sola regla con tres causas**, no tres reglas.
> El objetivo del plan es que el motor pueda DESEMPATAR, y tres reglas
> separadas no desempatan nada — cada una tendría una causa única, que es
> exactamente la situación que este plan viene a corregir en `derrame` y
> `posible-fuga`. Con una regla, las tres alarmas compiten como causas de un
> mismo hecho («hay una alarma de proceso activa») y el motor puede ordenarlas
> por manual, casos y tendencia.

### B — Sobre coherencia entre señales

| id | Condición | Severidad | Por qué no necesita umbral |
|---|---|---|---|
| `orden-sin-respuesta` | `arranqueParoS1 === true` y `estadoS1 !== 2` durante la ventana | crítico | Compara orden contra realimentación |
| `actuador-en-error` | cualquier `estadoSx === 3` | crítico | El equipo lo declara: `3: "Error"` |
| `bloqueo-de-mantenimiento-activo` | algún `mttoSx === true` con proceso en marcha | informativo | Es un hecho de operación, como `variador-en-manual` |

**`variador-no-sigue-consigna` queda FUERA de este plan. DECIDIDO el
14-09-2026.** Necesitaría una tolerancia de divergencia que no conocemos: la
que es normal en una rampa de arranque no está medida, y sin ese número la
regla dispararía en cada arranque. Es literalmente el fallo de
`presionRelativa.avisoMax` descrito en §1, escrito de nuevo con otra señal.
Entra cuando alguien mida la divergencia real contra el historiador — no
antes.

**`orden-sin-respuesta` sí entra**, con `nota:` declarando que su tolerancia es
provisional, igual que `posible-fuga` declara la suya. La diferencia con la
anterior es que aquí la condición es cualitativa: una válvula que recibe orden
de abrir y sigue reportando `1: "Apagado"` varios ciclos de sondeo seguidos no
depende de acertar un número fino.

---

## 4. Causas nuevas para riesgos existentes (bloque C)

Todas **transcritas** de `consecuencia`/`accion` que ya están escritas.

### `posible-fuga` — de 1 causa a 3

Su `consecuencia` dice literalmente: *«compatible con fuga, rotura **o una
salida quedada abierta**»*. Son tres mecanismos en una frase; hoy hay una sola
causa que los agrupa.

| Causa | Firma temporal | Transcrita de |
|---|---|---|
| `fuga-o-rotura-en-la-red` (existe) | — | ya está |
| `salida-quedada-abierta` | — se distingue por `estadoS1/S2` | «una salida quedada abierta» |
| `lectura-de-presion-no-fiable` | — | la propia `nota` de la regla: *«El umbral de "hay presión" todavía es una estimación»* |

### `derrame` — de 1 causa a 3

Su `accion` dice: *«Confirmar que el corte por nivel alto está operativo **y que
el lazo de control responde**»*. Dos mecanismos, hoy una causa.

| Causa | Distinguida por |
|---|---|
| `corte-nivel-alto-no-actua` (existe) | `nivelAlto`/`nivelAltoAlto` **no activas** con nivel alto → el corte no ve |
| `lazo-de-control-no-responde` | alarma **sí activa** y la bomba sigue → el corte ve y no actúa |
| `aporte-externo-no-controlado` | `estadoS2` en marcha sin orden |

**Esto es lo más valioso del plan entero:** las alarmas nativas son lo que
separa «el sensor no ve» de «ve y nadie actúa». Ninguna firma temporal podía
hacerlo.

### `marcha-en-seco` — desempate por fin posible

Las dos causas existentes cursan igual en `nivelTanque`, y por eso la firma
temporal no las separaba (auditado antes de este plan). `nivelBajoBajo` sí:

- alarma **no activa** con nivel bajo → `proteccion-nivel-bajo-no-actua`
- alarma **activa** y la bomba sigue impulsando → `nivel-real-insuficiente`

### `tension-fuera-con-motor` — ídem

`fallaVariador` separa «problema en el suministro» (el variador **no** reporta
falla: recibe mal de fuera) de «protecciones mal ajustadas» (el variador **sí**
reporta y no protegió).

---

## 5. Firmas temporales transcribibles (del análisis previo)

Cuatro, ya auditadas:

| Causa | Firma | Frase de origen |
|---|---|---|
| `consigna-variador-alta` | `referenciaVariador` sube, 2 h | «Revisar la consigna del variador» |
| `filtro-colmatado` | `flujoInstantaneo` baja, 6 h | «filtro sucio» — se colmata progresivamente; una válvula es un salto |
| `impulsor-desgastado` | `eficienciaEnergetica` baja, 24 h | «impulsor desgastado» + `pronostico.js · MECANISMOS` |
| *(pendiente)* `agua-caliente` | por confirmar | sus dos causas no se han leído aún |

**Reserva medida:** `temporal.mjs` documenta que **27 de 36 ventanas de 1 h no
reunían 3 puntos** — el historiador sólo guarda densidad de 15 min en las horas
recientes. Declarar una firma hace que el término *pueda* discriminar; que
discrimine depende de que haya serie. Las ventanas de 6 h y 24 h propuestas
arriba son **más vulnerables a esto, no menos**, y hay que medirlo antes de
darlas por buenas.

---

## 6. Lo que este plan NO hace

- **Ninguna regla analógica nueva.** Sin umbrales confirmados, no se escriben.
  Eso es medición contra planta, no trabajo de escritorio.
- **Nada de vibraciones.** Decisión explícita del 14-09-2026.
- **No se tocan `UMBRALES` ni `bandaDe()`.** Plan 28 §0.
- **No se retira `PROVISIONALES`.** Sigue en `true` hasta que se revise la tabla
  entera, no una fila.

---

## 7. Fases

### F1 — Causas nuevas sobre riesgos existentes (bloque C)
Lo más barato y lo que más desempata. Sólo `causas.js`; ninguna regla nueva.
Riesgos tocados: `posible-fuga`, `derrame`, `marcha-en-seco`,
`tension-fuera-con-motor`.
**Pruebas:** `verificar-catalogo.mjs`, `verificar-diagnostico.mjs`,
`verificar-riesgos.mjs`.

### F2 — Firmas temporales transcribibles
Las cuatro de §5, cada una con su justificación transcrita en comentario, al
estilo de `sin-recirculacion-minima`. **Precedido de medir** si esas señales
tienen serie suficiente en las ventanas propuestas.
**Pruebas:** `verificar-temporal.mjs`, `verificar-diagnostico.mjs`.

### F3 — Reglas sobre alarmas nativas (bloque A)
Cinco reglas + sus causas. Toca `riesgos.js` y `causas.js`.
**Pruebas:** `verificar-riesgos.mjs`, `verificar-catalogo.mjs`,
`verificar-i18n.mjs` (toda regla nueva necesita su texto en los dos idiomas).

### F4 — Reglas de coherencia (bloque B)
Las tres acordadas, dejando `variador-no-sigue-consigna` fuera hasta medir.
**Pruebas:** las de F3.

**Orden:** F1 → F2 → F3 → F4. Commit por fase (§6 de CLAUDE.md).

---

## 8. Criterios de aceptación

- [ ] Ninguna regla nueva introduce un umbral analógico inventado
- [ ] Toda causa nueva cita en su comentario la frase de `riesgos.js` de la que
      se transcribe
- [ ] Ningún riesgo del tanque con 2+ causas queda sin al menos una fuente que
      pueda desempatarlas (firma temporal o alarma nativa)
- [ ] `verificar-catalogo.mjs` en verde: todo riesgo sin causas sigue
      clasificado en `SIN_CAUSAS_DELIBERADO` o `SIN_CAUSAS_PENDIENTE`
- [ ] `verificar-i18n.mjs` en verde: cada texto nuevo, en los dos idiomas
- [ ] `npm run lint`, `npm run types`, `npm run verificar` en verde

---

## 9. Riesgos de este plan

| Riesgo | Mitigación |
|---|---|
| Se cuela un umbral inventado «porque hace falta» | §1 es la regla; el criterio de aceptación lo verifica |
| Una regla de alarma dispara a la vez que la analógica equivalente y el técnico ve dos avisos de lo mismo | Revisar solapes en F3: `nivelAltoAlto` y `derrame` pueden coexistir. Decidir si una absorbe a la otra o si son complementarias |
| Las ventanas de 6 h y 24 h no tienen puntos suficientes | Medir antes de declarar (F2) |
| Más reglas = más ruido en pantalla | `PESO` ya ordena por severidad. Vigilar que lo informativo no desplace a lo crítico |
