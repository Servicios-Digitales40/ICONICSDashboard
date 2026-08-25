# Plan de Alarmas — rama Moises3

Plan de trabajo separado del [`PLAN-MOISES3-UI-UX.md`](./PLAN-MOISES3-UI-UX.md)
general. Se centra en retomar y redefinir la funcionalidad de Alarmas de la
demo, punto por punto, porque cada una de las 11 alarmas tiene su propio
comportamiento/valores por definir además del simple true/false.

Cómo se usa: igual que el plan de UI/UX — se va llenando durante la
conversación, y los cambios se implementan juntos al terminar de definir
todas las alarmas (o cuando el usuario lo indique).

---

## Contexto y decisión de arquitectura

**Por qué esto es un cambio de fuente de datos, no solo de contenido:**

La vista "Alarmas" actual ([`react-dashboard/src/Demo-EVA/views/AlarmasEva.jsx`](../react-dashboard/src/Demo-EVA/views/AlarmasEva.jsx)
y [`react-dashboard/src/Demo-EVA/data/alarmas.js`](../react-dashboard/src/Demo-EVA/data/alarmas.js))
es un **historial de eventos** vía `GET /api/iconics/alarms`, que llama a
`readAlarmHistory` en el puente hacia GENESIS64/ICONICS. El propio código deja
escrito con cuidado que esto es historial ("qué ha pasado"), nunca un semáforo
de alarmas activas ahora mismo — esa distinción se consideró importante para
no prometer algo que el dato no es.

**El problema:** ese endpoint nativo de alarmas de ICONICS nunca se logró leer
con éxito en la práctica (confirmado por el usuario). Lo que sí funciona,
probado por Swagger, es leer directamente `/fwxapi/rest/v1/Data` contra los
puntos MQTT de abajo, que devuelven `value: 0` o `value: 1` — el estado real
de cada alarma, en vivo.

**Decisión tomada:** las alarmas de la demo se reconstruyen sobre estos 11
puntos MQTT leídos vía `/fwxapi/rest/v1/Data`, en vez de depender del endpoint
nativo de alarmas de ICONICS. Esto efectivamente reemplaza el concepto actual
de "Alarmas" (historial GENESIS64) por un semáforo en vivo real. Si en el
futuro se logra hacer funcionar el endpoint nativo, se evaluará como mejora
adicional — no bloquea este trabajo.

**Nota de honestidad a mantener:** dado que ahora SÍ tendremos alarmas en
vivo (a diferencia de antes), hay que revisar si el aviso de "esto es
historial, no un semáforo en vivo" en `AlarmasEva.jsx`/`alarmas.js` deja de
aplicar y debe reescribirse, una vez decidido el diseño final.

---

## Las 11 alarmas — catálogo base

Todas son booleanas (`0`/`1`), leídas desde `iot:Data_mqtt/pruebaiot/DP-*` vía
`/fwxapi/rest/v1/Data`. Nombre visible (ICONICS) → punto MQTT:

| # | Nombre (ICONICS) | Punto MQTT |
|---|---|---|
| 1 | Bajo flujo | `DP-Bajo_flujo` |
| 2 | Falla variador de frecuencia | `DP-Falla_variador_frecuencia` |
| 3 | Falta de presión | `DP-Falta_de_presion` |
| 4 | Nivel alto | `DP-Nivel_alto` |
| 5 | Nivel alto alto | `DP-Nivel_alto_alto` |
| 6 | Nivel bajo | `DP-Nivel_bajo` |
| 7 | Nivel bajo bajo | `DP-Nivel_bajo_bajo` |
| 8 | Presión alta | `DP-Presion_alta` |
| 9 | Solenoide inferior en mantenimiento | `DP-Soledoine_inferior_mtto` |
| 10 | Solenoide superior en mantenimiento | `DP-Solenoide_superior_mtto` |
| 11 | VFD en mantenimiento | `DP-VFD_Mantenimiento` |

Ruta base observada: `iot:Data_mqtt/pruebaiot/` + el punto de la tabla.

**Nota:** el punto 9 lleva una probable errata en el propio servidor
(`Soledoine` en vez de `Solenoide`) — no se corrige aquí, se respeta tal cual
lo entrega el servidor, siguiendo la misma norma que ya sigue `senales.js`
con `INDICE_DESVIACION_VOLTAJE` (el nombre del tag no manda sobre lo que de
verdad representa, pero tampoco se inventa o corrige silenciosamente).

---

## Pendientes — comportamiento por alarma

Se definen una por una. Cada entrada debe terminar con: qué activo del
dominio le corresponde (tanque/bombeo/distribución/eléctrico, o si necesita
uno nuevo), severidad, condición exacta de disparo, y cualquier relación con
las señales continuas que ya existen (p. ej. "Nivel alto" vs. `nivelTanque`).

### 1. Bajo flujo (`DP-Bajo_flujo`)

**Estado:** en definición — pendiente de que el usuario aporte detalle de
comportamiento/valores para esta alarma específica.

---

## Notas de contexto

- Las alarmas 4-7 (Nivel alto / alto alto / bajo / bajo bajo) probablemente
  se relacionan con la señal continua `nivelTanque` ya existente en
  [`shared/eva/senales.js`](../shared/eva/senales.js) y sus umbrales en
  [`shared/eva/umbrales.js`](../shared/eva/umbrales.js) (`nivelTanque: { min: 15, avisoMin: 25, avisoMax: 90, max: 95 }`).
  Falta confirmar si estas 4 alarmas booleanas son el mismo umbral expresado
  de otra forma, o un umbral independiente configurado aparte en el PLC/SCADA.
  A confirmar alarma por alarma, no asumir.
- Alarmas 9-11 (mantenimiento) no tienen ninguna señal continua equivalente
  hoy en el catálogo — son estado puro, sin magnitud asociada.
- Falla variador de frecuencia (2) podría relacionarse con `modoVdf`
  (Automático/Manual) del activo `bombeo`, pero son conceptos distintos
  (modo de operación vs. fallo) — no asumir relación sin confirmar.
