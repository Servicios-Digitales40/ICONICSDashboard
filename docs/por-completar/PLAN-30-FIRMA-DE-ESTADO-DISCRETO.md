# PLAN 30 — La quinta fuente: firma de estado discreto

**Estado:** por completar
**Fecha:** 15-09-2026
**Alcance:** SÓLO el tanque. Vibraciones sigue fuera por decisión del 14-09-2026.

**Relación con los otros planes.** El 29 llenó el catálogo de causas; éste le da
al motor la evidencia que necesita para ORDENARLAS. El 28 (auditoría del motor)
sigue pendiente y es independiente.

---

## 1. El hueco, medido

Tras el Plan 29, el tanque tiene 17 reglas y 34 causas. Pero:

> **Once riesgos del tanque tienen 2+ causas y NINGUNA firma que las desempate.**

```
derrame                                    3 causas
posible-fuga                               3 causas
orden-sin-respuesta                        3 causas
marcha-en-seco                             2 causas
tension-fuera-con-motor                    2 causas
nivel-critico-con-bomba-impulsando         2 causas
emergencia-con-motor-en-carga              2 causas
variador-en-falla-y-sigue-mandando         2 causas
alarma-de-proceso-sin-respaldo-analogico   2 causas
actuador-en-error                          2 causas
agua-caliente                              2 causas
```

En todos ellos, la aritmética de `diagnostico.mjs` deja el mismo total para
cada causa: `datos` es idéntico por verdad física, `manual` suele empatar,
`casos` está a 0 sin bitácora, y `temporal` vale 0 porque no hay firma. El
`sort` es estable, así que **el orden que ve el técnico es el orden en que
alguien tecleó las causas en `causas.js`** — no un ranking.

## 2. Por qué no se arregla con más firmas temporales

Se auditó causa por causa durante el Plan 29, y el resultado está escrito en
los comentarios de `causas.js`. Lo que separa esas causas **no es una
tendencia, es un bit**:

| Riesgo | Lo que de verdad las separa |
|---|---|
| `derrame` | ¿se activó `nivelAlto`/`nivelAltoAlto`? Si no, el corte no ve; si sí, ve y nadie actuó |
| `marcha-en-seco` | ídem con `nivelBajoBajo` |
| `tension-fuera-con-motor` | ¿reportó `fallaVariador`? Si no, el problema viene de fuera |
| `orden-sin-respuesta` | `estadoS1` en 1 (no se mueve) frente a 3 (error declarado) |
| `posible-fuga` | ¿hay alguna salida (`estadoS1`/`estadoS2`) abierta? |

`temporal.mjs` sólo sabe medir **pendientes** — mínimos cuadrados, `sube`/
`baja`. Una alarma booleana no tiene pendiente: tiene **flancos**. Declararle
una firma de tendencia a `nivelBajoBajo` no es que dé mal resultado: es que no
significa nada.

Esa distinción ya está escrita en tres comentarios del Plan 29, en prosa que el
código no puede leer. Este plan la hace ejecutable.

## 3. La pieza ya existe

`shared/eva/comun/eventosDeAlarma.js` (commit `3864acb`, 14-09-2026) calcula
flancos de una serie booleana y ya está probado:

- `eventosDeAlarma(muestras)` → eventos con `inicio`, `fin`, `activa`, `desdeAntes`
- `tiempoActivoEnVentana(eventos, ventana)` → cuánto estuvo activa
- `evaluarPersistencia(eventos, …)` → distingue un arranque sano de uno que no se resuelve

Y `historia.mjs` ya sabe pedir la serie SIN agregado (`{ crudo: true }`), que es
imprescindible: **promediar una booleana no la degrada, la BORRA** — el cubo de
un agregado vale 0,5, que nunca es un flanco.

**Verificado contra ICONICS real el 15-09-2026:**

```
nivelAlto        20 muestras    6 activas    6 eventos
faltaDePresion  483 muestras  237 activas  237 eventos
fallaVariador     8 muestras    0 activas    0 eventos
```

Los tres casos que importan: una alarma con eventos, una con el parpadeo del
incidente del 14-09, y una en calma. `nivelBajoBajo` falló por sesión caducada
en la primera llamada de la tanda — es el B10/B-sesión conocido, no el punto.

## 4. Diseño

### 4.1 Una firma NUEVA, no un cuarto término más

`firmaTemporal` se queda como está. La nueva se declara aparte:

```js
firmaEstado: [{ senal: "nivelBajoBajo", estado: "activa", ventanaH: 2 }]
```

`estado` admite:

- `"activa"` / `"inactiva"` — para señales booleanas (`naturaleza: "alarma"`)
- un número — para las de `naturaleza: "estado"` (`estadoS1 === 3`)

### 4.2 Suma al MISMO término, no a uno nuevo

`respaldoTemporal()` pasa a evaluar las dos firmas y devolver un solo `puntos`,
con el mismo tope de 2.

**Por qué no un quinto término.** Añadir un sumando sube el máximo teórico de 9
a 11 y obligaría a recalibrar `bandaDe()`, que está **bloqueado a propósito**
por falta de disco real (Plan 17 F7a). Las dos firmas responden además a la
misma pregunta —«¿qué dice el tiempo reciente sobre esta causa?»— sólo que una
mira una pendiente y la otra un flanco.

### 4.3 El silencio sigue siendo la respuesta por defecto

Igual que `firmaTemporal`: sin serie, con pocas muestras, o con la señal sin
declarar, el resultado es 0 sin evidencia — nunca una dirección forzada. Y el
`0` de `estadoSx` es **sin dato**, no «apagado» (Plan 29 F4).

### 4.4 Lo que NO hace

- No lee sensores por su cuenta: usa el mismo `historia.leerSerie` que ya usa
  `temporal.mjs`.
- No toca `bandaDe()` ni ningún `UMBRAL_*`.
- No introduce umbrales analógicos: un bit del PLC no tiene banda que estimar.

## 5. Fases

### F1 — El evaluador
`backend/ia/motor/temporal.mjs`: `evaluarEstado()` junto a `evaluar()`, y
`respaldoTemporal()` en `diagnostico.mjs` sumando las dos con tope 2.
Claves de evidencia nuevas en `CLAVES_DE_EVIDENCIA` + su inglés.
**Pruebas:** `verificar-temporal.mjs`, `verificar-diagnostico.mjs`.

### F2 — Las firmas declaradas
`causas.js`: `firmaEstado` en las causas de los cinco riesgos de §2, cada una
con su justificación transcrita. Medir antes de declarar, como en el Plan 29 F2.
**Pruebas:** las de F1 + `verificar-catalogo.mjs`, `verificar-dominio.mjs`.

## 6. Criterios de aceptación

- [ ] Ninguna firma nueva introduce un umbral analógico
- [ ] `bandaDe()` y los `UMBRAL_*` sin tocar
- [ ] El máximo de `temporal` sigue siendo 2
- [ ] El `0` de `estadoSx` no se lee como un estado válido
- [ ] Toda `firmaEstado` nombra una señal real, historizada y del tipo correcto
- [ ] Ningún riesgo del tanque con 2+ causas queda sin desempate posible
- [ ] Los dos idiomas dicen lo mismo (`verificar-i18n`, `verificar-dominio`)
- [ ] `npm run verificar`, `types` y el frontend en verde

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| Sumar al mismo término oculta cuál de las dos firmas aportó | La evidencia lleva `fuente` y frase propia; el punto se comparte, la explicación no |
| Una firma de estado sobre una señal sin serie queda muda para siempre | La prueba exige `esHistorizada`, igual que en el Plan 29 F2 |
| Declarar `firmaEstado` idéntica en dos causas del mismo riesgo | Misma prueba que ya existe para `firmaTemporal`, extendida |
| El agregado borra las booleanas | `{ crudo: true }`, y una prueba que lo fija |
