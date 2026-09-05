# Hoja de ruta · las sesenta mejoras en seis planes

> **De dónde sale.** De la auditoría de `Moises6` del 04-09-2026 (sesenta
> propuestas en seis frentes). El Plan 20 ejecutó las diez primeras; esto ordena
> las cincuenta que quedan.

> **Estado.** Plan 20 **hecho** en `Mejoras-Demo-6.0`. Planes 21 a 26,
> pendientes.

---

## 0 · La regla que ordena todo esto

**Ningún plan intermedio puede quedarse bloqueado esperando a que la planta esté
alcanzable.** Todo lo que necesita red real a ICONICS se agrupa en el Plan 26.

No es comodidad: es que el bloqueo no avisa. Un plan con un punto que necesita
el servidor no se para el día que se llega a ese punto — se para el día que
alguien lo intenta, se encuentra sin red, y deja el plan a medias con las otras
nueve mejoras ya empezadas. Agrupando, cada plan del 21 al 25 se puede terminar
entero en una máquina de desarrollo con `ICONICS_FAKE=true`.

### Qué cuenta como «necesita la planta»

Tres cosas distintas, y sólo la primera bloquea:

1. **Descubrir la forma de un dato que no conocemos.** No se puede inventar el
   mapeo (`CLAUDE.md` §2.5). Es lo único que va al Plan 26 de verdad.
2. **Reconfirmar un número que ya está medido.** El trabajo se hace offline y
   queda anotado como `provisional`; la reconfirmación es una línea de la sesión
   con planta.
3. **Que el asistente conteste.** Eso necesita `llama-server`, no ICONICS —
   `medir-asistente.mjs` corre perfectamente con `ICONICS_FAKE=true`. El Plan 23
   es ICONICS-libre por construcción.

---

## Los seis planes

| # | Plan | ¿Necesita planta? |
|---|---|---|
| 20 | Andamiaje: lo que hace verificable el resto | no · **hecho** |
| 21 | ICONICS: el registro despacha de verdad | no |
| 22 | Seguridad | no |
| 23 | Asistente | no (necesita GPU) |
| 24 | Usabilidad | no |
| 25 | Layout y funcionalidad nueva | no |
| 26 | Código, y la sesión con planta | **sí, y sólo éste** |

### Plan 21 · ICONICS

`ICO-01` caché por punto · `ICO-04` calidad OPC con subestados ·
`ICO-05` cadencias desde el registro · `ICO-06` escribe y confirma ·
`ICO-07` relojes a UTC · `ICO-09` cobertura hasta la gráfica ·
`COD-05` un solo motor de sondeo · `SEG-04` inyección vía manuales

Es el que desbloquea la máquina #3, y por eso va primero.

Los tres que llevan una reconfirmación pendiente —y se hacen igual:

- **ICO-04.** Los cinco códigos de calidad ya están MEDIDOS en
  `shared/quality.js`, incluido el `0x08000000` del incidente del 26-08-2026, y
  el transporte falso emite tres de ellos. Se construye entero. Lo que la red
  añadiría es confirmar que no hay un sexto código en esta instalación.
- **ICO-06.** El falso guarda lo escrito y lo devuelve al releer, así que el
  mecanismo se prueba completo. Lo que no se puede reproducir es el retraso de
  escaneo del PLC (~1 s) que obligó a `controlar_bomba` a llevar reintentos: ese
  número se copia del que ya está medido y se reconfirma en el Plan 26.
- **ICO-07.** Normalizar a UTC en la frontera es offline. Medir el desfase
  puente↔planta en `/api/health` sólo significa algo con red: se deja escrito y
  devolviendo `null`.

### Plan 22 · Seguridad

`SEG-01` autenticación de usuarios · `SEG-05` sustituir `xlsx` ·
`SEG-07` límites por familia · `SEG-08` diario de accionamientos ·
`SEG-09` enlaces de reporte firmados · `SEG-10` parseo de subidas aislado

**SEG-01 cambia de forma por esta regla, y es el cambio importante de esta hoja.**

La auditoría proponía federar contra el IdP OIDC de ICONICS para no mantener un
segundo directorio de usuarios. Es la decisión correcta a largo plazo y **no se
puede desarrollar sin planta**: con `ICONICS_FAKE=true` el cliente real ni se
construye (`app.mjs`), así que el flujo OIDC no se ejercita nunca.

Así que SEG-01 se parte:

- **En el Plan 22, sesión local.** `@fastify/jwt` con un emisor propio, y
  `AUTH_HABILITADA=true` funcionando de verdad. Toda la parte cara —qué rutas la
  exigen, qué roles hay, cómo se comporta el tablero cuando caduca— ya está
  decidida por el Plan 20 F5 y se prueba entera offline.
- **En el Plan 26, federación.** Cambiar el emisor por el IdP de ICONICS es
  sustituir la verificación del token, no rehacer el modelo. Y para entonces
  habrá red.

`SEG-06` (dejar de apagar la verificación TLS del proceso entero) se parte
igual: el soporte de `NODE_EXTRA_CA_CERTS` y la comprobación de arranque van en
el 22; probar que el certificado de `bms-server` se acepta, en el 26.

### Plan 23 · Asistente

`IA-02` auditar cifras tras redactar · `IA-04` validar argumentos con Zod ·
`IA-05` progreso de la primera pasada · `IA-06` caché entre turnos ·
`IA-07` memoria del foco · `IA-08` router de modelo ·
`IA-09` las cuatro herramientas que faltan · `IA-10` registro por turno

Necesita `llama-server`, no ICONICS. El banco del Plan 20 F9 es lo que hace que
cada uno de estos se pueda demostrar en vez de opinar.

`IA-02` empieza cerrando el hueco que el Plan 20 dejó escrito: que
`medir-asistente.mjs` reejecute las herramientas con los argumentos que ya
captura, para que la auditoría de cifras corra también contra el modelo real.

### Plan 24 · Usabilidad

`USO-01` frescura obligatoria · `USO-02` estado en la URL ·
`USO-03` panel de procedencia · `USO-04` errores accionables en pantalla ·
`USO-05` bandeja de eventos con acuse · `USO-06` paleta de comandos ·
`USO-07` asistente con contexto de la vista · `USO-08` criterio táctil ·
`USO-09` exportación unificada · `USO-10` modo muro con latido

Va después del 21 porque `USO-01` y `USO-03` pintan lo que `ICO-04` e `ICO-09`
ponen en el dominio.

### Plan 25 · Layout y funcionalidad nueva

`NUE-01` vista de Turno · `NUE-02` línea de tiempo por máquina ·
`NUE-03` bandeja de propuestas · `NUE-04` casos similares proactivos ·
`NUE-06` barra de contexto de máquina · `NUE-07` navegación por módulo ·
`NUE-08` asistente acoplado · `NUE-09` muro multi-máquina ·
`NUE-10` cuaderno de planta

`NUE-05` (panel de salud) ya está hecho en el Plan 20 F10.

### Plan 26 · Código, y la sesión con planta

**Primero lo de código, que es offline** — `COD-04` partir los seis archivos de
más de mil líneas · `COD-06` esquemas de salida · `COD-07` presupuesto de bundle
· `COD-08` telemetría del sondeo · `COD-09` migradores y poda ·
`COD-10` cerrar el registro (`evaluarRiesgos`, `resolverSenal`)

`COD-04` va deliberadamente al final: partir archivos antes de saber por dónde
van a crecer es reorganizar a ciegas, y los planes 21 a 25 son los que lo dicen.

**Y después, la sesión con planta.** Todo lo que necesita red, junto:

| Qué | Por qué no se puede antes |
|---|---|
| `ICO-10` contrato de alarmas | `readAlarmHistory()` del falso devuelve `{ alarms: [] }`. Sólo están confirmados `eventId` y `startDate`; el resto del mapeo hay que **descubrirlo**, no inventarlo |
| `ICO-03` suscripciones | No es implementación: es una pregunta que sólo contesta el servidor. ¿Expone FrameWorX suscripciones en esta versión y con esta licencia? Sin respuesta no se decide si se hace |
| `SEG-01` federación OIDC | El flujo no se ejercita con el transporte falso |
| `SEG-06` certificado de planta | Comprobar que `NODE_EXTRA_CA_CERTS` acepta el autofirmado de `bms-server` |
| `ICO-04` sexto código de calidad | Confirmar que no hay más de los cinco medidos |
| `ICO-06` retraso de escaneo | Reconfirmar los reintentos de la relectura contra el tag real |
| `ICO-07` desfase de relojes | Medirlo y dejarlo en `/api/health` |
| `verificar-catalogo --real` | Ya está escrito (Plan 20 F8): recorre las raíces y lista lo que sobra y lo que falta |

Las dos primeras salen como **sondas** en `scripts/`, en la línea de
`sondear-paginacion-historico.mjs`, que ya existe para exactamente esto:
capturar la forma real de una respuesta y dejarla escrita antes de construir
nada encima.

---

## Cómo se comprueba que la regla se cumple

Un plan del 21 al 25 está bien cerrado si esto pasa en una máquina sin red a
planta:

```bash
npm run lint && npm run types && npm run verificar
```

Si alguno de sus puntos necesitara la planta para *terminarse*, no está en el
plan que le toca: está en el 26.
