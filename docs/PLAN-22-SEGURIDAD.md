# Plan 22 · Seguridad

> **De dónde sale.** De la auditoría de `Moises6` del 04-09-2026, frente
> seguridad. De sus diez puntos **ya hay tres hechos**, así que este plan cubre
> los siete que quedan.

> **Rama.** `Mejoras-Demo-6.0`, a continuación del Plan 21.

> **No necesita planta, y está COMPROBADO.** Ver §0.2 — no es una estimación,
> se verificó punto por punto con el servidor apagado.

---

## 0 · Lo que ya está hecho, y por qué importa saberlo

| Punto | Dónde | Qué quedó |
|---|---|---|
| SEG-02 · guardas de ruta | Plan 20 F5 | La guarda es del ÁMBITO, con una prueba que recorre el inventario real y falla nombrando las que se queden fuera |
| SEG-03 · CSP vs Predicción | Plan 20 F4 | `CONNECT_ORIGINS`, por origen exacto, y el arranque avisa del contenido mixto |
| SEG-04 · inyección por manual | Plan 21 F8 | El texto de un manual va marcado como cita y las herramientas de escritura se retiran de la ronda |

Esto cambia el plan de verdad, y no es una nota al pie: **SEG-02 hizo el trabajo
caro de F6.** Decidir qué rutas exigen sesión y qué roles hay es lo que cuesta
de una autenticación; validar un token es lo barato. Esa decisión ya está
tomada, escrita y probada.

## 0.1 · El criterio de orden

Cinco fases baratas e independientes primero, la grande cuando el resto ya está
en verde. Es el mismo criterio de los dos planes anteriores y por el mismo
motivo: si F6 se atasca, las otras seis ya están entregadas.

**F7 va DESPUÉS de F6** a propósito: un enlace firmado puede atarse a la sesión
que F6 crea, en vez de inventarse un secreto propio que después habría que
reconciliar.

## 0.2 · Que no necesita planta no es una suposición

Comprobado el 05-09-2026 con el servidor de planta apagado:

- **`.env.local` ni siquiera declara `ICONICS_API_BASE`.** El entorno local ya
  corre en `ICONICS_FAKE`, y así se hicieron los Planes 20 y 21 enteros.
- **F2**: `verificar-documentos.mjs` **fabrica su corpus** con `writeFile` en un
  directorio temporal. No hay ningún PDF real en el árbol ni ningún servidor
  detrás.
- **F3**: `/api/control/bomba` ya tiene **seis comprobaciones** en
  `verificar-backend.mjs`, contra su propio ICONICS falso.
- **F5**: se probó el mecanismo completo contra un HTTPS autofirmado en
  loopback (`openssl` está en el PATH):

  ```
  sin CA declarado ......: rechazado: DEPTH_ZERO_SELF_SIGNED_CERT
  con NODE_EXTRA_CA_CERTS: ACEPTADO 200 ok
  ```

  Dos callejones descartados por el camino, para que nadie los repita: `undici`
  no es importable como paquete —así que un `Agent` con `ca` propio no vale— y
  un `execFileSync` en el proceso que sirve congela su bucle de eventos y hace
  parecer un problema de certificado lo que es un bloqueo.

Criterio de cierre de cada fase, como siempre:
`npm run lint && npm run types && npm run verificar` en verde sin red.

## 0.3 · Lo que este plan NO hace

- **No enciende `AUTH_HABILITADA` en producción.** Ver F6: entrega el
  interruptor probado y apagado.
- **No federa contra el IdP de ICONICS.** Es la otra mitad de SEG-01 y está en
  el Plan 26, porque ese flujo no se ejercita sin planta.
- **No comprueba el certificado real de `bms-server`.** F5 entrega el soporte y
  su prueba; el certificado concreto es del Plan 26.
- **No toca el motor de diagnóstico ni ninguna regla de riesgo** (§2.3).

---

## F1 · Sustituir `xlsx` (SEG-05)

**Hoy.** `xlsx@0.18.5`, dependencia directa del tablero, usada por
`Demo-EVA/lib/exportarExcel.js` y `views/tanque/DetalleActivo.jsx`. Esa rama
publicada en npm acumula avisos conocidos —contaminación de prototipo, ReDoS—
cuyo arreglo sólo existe en las versiones que SheetJS distribuye fuera del
registro.

**Cuánta superficie hay de verdad.** Poca: el tablero **sólo escribe** hojas,
nunca las lee, y los vectores conocidos son de lectura. Pero cualquier auditoría
lo marca, y explicar cada vez por qué un aviso alto «no aplica aquí» cuesta más
que quitarlo.

**Qué se hace.** Se elige entre dos, y la decisión se toma con el criterio de la
casa —qué promete menos de lo que puede cumplir—:

1. **CSV y fuera.** El backend ya genera PDF con `pdfkit`; el CSV lo produce
   `descargarCSV`, que ya existe en `Demo-EVA/lib/exportar.js`. Un formato menos
   que mantener y cero dependencias nuevas.
2. **`exceljs`**, si el Excel con formato es un requisito real de quien usa el
   tablero.

La primera es la recomendada mientras nadie haya pedido el `.xlsx` por su
nombre. Se pregunta antes de romper una exportación que alguien pueda estar
usando.

**Efecto lateral que interesa.** Son **276 KB fuera del bundle**, y `vendor` va
hoy a 206,85 KB de un techo de 210. Es la mitad del alivio que COD-07 pedía, sin
tocar el resto.

**Cómo se prueba.** `exportarExcel.test.js` se sustituye por el de la salida
elegida, comprobando lo que de verdad importa: que el archivo lleva las mismas
columnas, que un hueco sale como hueco y **no como cero**, y que la cobertura
del rango viaja en el archivo (Plan 21 F7).

## F2 · El parseo de subidas, fuera del bucle de eventos (SEG-10)

**Hoy.** `indices/documentos.mjs` extrae texto de PDF con `pdfjs-dist` y de DOCX
a mano, **en el mismo hilo que atiende las lecturas de planta**. Se valida el
tamaño (`MAX_BYTES`) y no la firma del archivo: la extensión decide qué parser
corre.

Un PDF malformado, o uno de miles de páginas, congela el bucle de eventos —y con
él todas las pantallas— mientras se procesa. Y `RAG_UPLOAD_ENABLED` existe
precisamente para que alguien suba archivos.

**Qué se hace.**

1. **Validar los *magic bytes***, no la extensión: `%PDF-` para PDF, `PK\x03\x04`
   para DOCX. Un `.pdf` que no lo es se rechaza antes de tocar `pdfjs`.
2. **Tope de páginas y de texto extraído**, además del de bytes.
3. **La extracción a un `worker_thread`** con corte por tiempo. Que un manual mal
   formado degrade la búsqueda es aceptable; que congele el tablero, no.

**Cómo se prueba.** `verificar-documentos.mjs` ya fabrica su propio corpus en un
temporal —incluido «un `.pdf` que no es un PDF de verdad», que ya está escrito—
así que las tres guardas se prueban ahí sin añadir un solo archivo al árbol. Se
añade una que mida que el bucle **sigue respondiendo** durante una extracción
larga, que es la afirmación de la fase.

## F3 · Diario de accionamientos sobre planta (SEG-08)

**Hoy.** `controlRoutes.mjs` registra la acción con IP y usuario en pino, y su
propia cabecera dice que es «el único registro que queda fuera del historiador
de ICONICS». Si el log rota o el contenedor se reinicia, no queda constancia de
por qué arrancó la bomba a las tres de la mañana.

**Qué se hace.** Un diario append-only, una línea JSON por acción:

```
instante · quién · tag · valor pedido · valor releído · coinciden · resultado
```

`valor releído` y `coinciden` **ya los produce el Plan 21 F5**: la confirmación
por relectura viaja en el sobre de toda escritura. El diario no calcula nada
nuevo, sólo persiste lo que hoy se tira.

Se apoya en `escribirAtomico` de `backend/lib/jsonAtomico.mjs` (Plan 20 F3), con
retención declarada por antigüedad y rotación por tamaño.

**Cómo se prueba.** `/api/control/bomba` tiene ya seis comprobaciones en
`verificar-backend.mjs`; se añade que cada una **deja su línea**, que una
escritura rechazada por la guarda de nivel deja constancia del RECHAZO —que es
tan interesante como la orden cumplida— y que el archivo sobrevive a un corte a
mitad de escritura.

## F4 · Límites por familia, no un cubo único (SEG-07)

**Hoy.** `rateLimitMax` global por IP cubre por igual una lectura cacheada de
2 ms y una consulta al asistente que ocupa la GPU dos minutos. Un wallboard
sondeando puede agotar la cuota que necesitaba quien iba a preguntar.

Y hay un segundo filo: detrás de un proxy inverso con `TRUST_PROXY=false`, la
planta entera cuenta como una sola IP.

**Qué se hace.**

- **Generoso** en `/api/iconics/*`, que además ya está cacheado por punto
  (Plan 21 F4).
- **Estricto** en `/api/chat` y `/api/voz`, que consumen GPU por petición.
- Una **comprobación de arranque** que avise si `TRUST_PROXY=false` pero llegan
  cabeceras `X-Forwarded-For`. Es un despliegue mal configurado que hoy no se
  nota hasta que alguien se queda sin cuota, y el aviso lo dice en el momento en
  que alguien está mirando.

Las sondas de salud siguen fuera del límite, por el motivo que ya está escrito
en `systemRoutes.mjs`.

**Cómo se prueba.** Con `app.inject`: que agotar la cuota del chat no agota la
de las lecturas, y al revés. Y que las de salud siguen contestando 200 con el
límite a 2 — eso ya está probado desde el Plan 20 F10 y no puede romperse aquí.

## F5 · Dejar de apagar el TLS del proceso entero (SEG-06)

**Hoy.** `NODE_TLS_REJECT_UNAUTHORIZED=0` en `.env.local`, porque `bms-server`
usa certificado autofirmado. Está bien acotado —`config.mjs` impide arrancar así
con `NODE_ENV=production`— pero desactiva la verificación para **todas** las
salidas del proceso: el servidor de IA, el backend predictivo y cualquier
llamada futura.

**Qué se hace.** Soporte de `NODE_EXTRA_CA_CERTS`, que confía en un CA concreto
en vez de en ninguno. No hace falta tocar el cliente: es un mecanismo del propio
Node y funciona con el `fetch` global — **verificado**, ver §0.2.

Lo que sí entra es la parte que Node no da:

1. **Validar al arrancar** que el archivo existe y es un certificado legible, en
   vez de descubrirlo en la primera llamada.
2. **Avisar si siguen puestos los dos**: con un CA declarado, mantener
   `NODE_TLS_REJECT_UNAUTHORIZED=0` deja el agujero abierto y da la falsa
   sensación de haberlo cerrado. Ése es el fallo que esta fase existe para
   evitar.
3. **Documentar cómo exportar el certificado** de `bms-server`, que es el paso
   que bloquea a quien lo intente.

**Cómo se prueba.** Con un HTTPS autofirmado en loopback y un proceso hijo: sin
CA declarado rechaza con `DEPTH_ZERO_SELF_SIGNED_CERT`, con él acepta. Está
probado a mano y entra como verificador.

**Lo que queda para el Plan 26.** Que el certificado REAL de `bms-server` se
acepte. Es otra afirmación y necesita la planta.

## F6 · Autenticación de usuarios, sesión local (SEG-01, primera mitad)

**Hoy.** `AUTH_HABILITADA=false`. Cualquiera con acceso de red al puerto lee
toda la planta, encola consultas a la GPU y —si alguien puso
`ICONICS_READ_ONLY=false` para el botón de la bomba— la acciona.

**Por qué esta fase cambió de forma respecto a la auditoría.** La auditoría
proponía federar contra el IdP OIDC de ICONICS, para no mantener un segundo
directorio de usuarios. Sigue siendo la decisión correcta a largo plazo y **no
se puede desarrollar sin planta**: con `ICONICS_FAKE=true` el cliente real ni se
construye (`app.mjs`), así que ese flujo no se ejercita nunca. Con la propuesta
original, este plan se habría parado en su punto principal.

Así que se parte, y la partición no cuesta trabajo tirado:

- **Aquí**: `@fastify/jwt` con emisor propio. Roles, caducidad, renovación y qué
  responde cada ruta.
- **Plan 26**: sustituir la verificación del token por la del IdP de ICONICS. Es
  cambiar quién firma, no rehacer el modelo — porque el modelo lo fija el Plan
  20 F5, que ya decidió qué exige cada ruta.

**El alcance, y es una decisión que conviene ver.** Activar
`AUTH_HABILITADA=true` hace que las treinta y tres rutas exijan token, y **el
tablero hoy no sabe pedirlo**: haría falta pantalla de acceso, guardado del
token, renovación, y qué pasa cuando caduca a mitad de un turno en un wallboard
sin teclado.

Eso es trabajo de frontend que no figura en el frente de seguridad, y es la
razón real de que §2.11 diga que la autenticación «es su propio plan».

**Este plan elige lo primero de estas dos:**

1. **F6 entrega el backend listo y `AUTH_HABILITADA` se queda en `false`.** El
   interruptor existe, está probado, y se enciende el día que el tablero sepa
   acompañarlo. La pantalla de acceso pasa al Plan 25, que es el de superficie.
2. F6 incluye la parte de tablero y el plan crece dos o tres fases.

Se elige la 1 porque deja el Plan 22 cerrable y no mezcla dos oficios en una
fase. **Si se prefiere la 2, se decide antes de empezar F6** — a mitad ya no,
porque cambia el reparto de las fases siguientes.

**Cómo se prueba.** Con `AUTH_HABILITADA=true` en las pruebas: que sin token las
rutas responden 401 y con token válido pasan; que un token caducado se
distingue de uno inválido —son dos arreglos distintos—; que `exigirRol` niega
con 403 y no con 404, que diría que la ruta no existe; y que las sondas de salud
siguen fuera, porque un despliegue autenticado no puede reiniciarse solo porque
su propia sonda responda 401.

## F7 · Enlaces de reporte firmados (SEG-09)

**Hoy.** `GET /api/reportes?id=<uuid>` sirve cualquier PDF de las dos carpetas.
El patrón de UUID protege del recorrido de rutas —eso está bien resuelto— y no
hay caducidad ni autorización por documento: la purga es por antigüedad del
archivo. Un informe de proceso reenviado por chat sigue descargable meses
después por cualquiera que tenga la URL.

**Qué se hace.** Firmar el enlace con HMAC sobre `id` + expiración, y —ya con
F6 hecha— atarlo al usuario que lo pidió. El asistente devuelve el enlace
firmado en lugar del desnudo.

**Lo que hay que cuidar.** Los enlaces que el asistente ya entregó en
conversaciones anteriores. Que dejen de funcionar de golpe es un cambio visible
para quien los tenga guardados, así que la fase decide y documenta si hay
período de gracia o no — y lo dice en el mensaje del 410, no sólo en el código.

**Cómo se prueba.** Que un enlace sin firma se rechaza, que uno caducado da un
error que dice **que caducó** y no un 404 genérico, y que la firma de un id no
sirve para otro.

---

## Orden de ejecución

Un commit por fase, probado antes de pasar a la siguiente (`CLAUDE.md` §6).

| # | Fase | Toca |
|---|---|---|
| 1 | F1 · Sustituir `xlsx` | `Demo-EVA/lib/`, `package.json` |
| 2 | F2 · Parseo aislado | `ia/indices/documentos.mjs` |
| 3 | F3 · Diario de accionamientos | `backend/lib/`, `controlRoutes` |
| 4 | F4 · Límites por familia | `http/plugins/seguridad.mjs`, `config` |
| 5 | F5 · Soporte de CA propio | `config.mjs`, `scripts/` |
| 6 | F6 · Sesión local | `http/plugins/autenticacion.mjs`, `config` |
| 7 | F7 · Enlaces firmados | `reportesRoutes`, `herramientas/historicos` |

## Lo que quedará abierto al cerrarlo

1. **La federación OIDC** (F6, segunda mitad) — Plan 26.
2. **El certificado real de `bms-server`** (F5) — Plan 26.
3. **La pantalla de acceso del tablero** (F6, alcance) — Plan 25, salvo que se
   decida lo contrario antes de empezar F6.
