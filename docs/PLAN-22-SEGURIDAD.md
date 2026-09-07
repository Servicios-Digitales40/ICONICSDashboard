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

### HECHO (07-09-2026) — con una corrección al párrafo de arriba

Elegida la opción 1: **un solo CSV en formato largo**, con una columna `senal`
porque las cinco series no comparten rejilla de instantes y alinearlas sería
inventar dato. `Demo-EVA/lib/exportarExcel.js` → `exportarTodo.js`; la descarga
la hace el `descargarCSV` que ya existía. 580 pruebas de frontend en verde.

Dos cosas que el archivo desmiente, y el archivo tiene razón (CLAUDE.md §0):

1. **El alivio de bundle no existe donde este párrafo lo pone.** Los 276 KB de
   `xlsx` ya viajaban en un **trozo propio y diferido** —`manualChunks` tenía
   una regla justo para eso—, así que el arranque nunca los pagó: medido tras
   el cambio, `vendor` sigue en 206,85 KB e `index` en 97,5. Lo que se ahorra
   es la descarga de quien pulsa «Exportar todo». **COD-07 sigue necesitando
   sus 3 KB de margen en otro sitio.**
2. **El .xlsx escondía un hueco.** Una señal sin muestras dejaba una hoja con
   su cabecera; en formato largo desaparecería del archivo sin dejar rastro. El
   CSV emite una nota `#` que la nombra y, si `leerSerie` dio `motivo`, lo dice
   —«no historizada» no es lo mismo que «el historiador no devolvió nada»—. Y
   la **cobertura por señal** viaja ahora hasta el archivo: el libro de Excel
   la tiraba, teniéndola delante desde el Plan 21 F7.

`scripts/verificar-bundle.mjs` invierte su comprobación en vez de perderla: sin
la regla de `manualChunks`, un `xlsx` reinstalado caería en el catch-all de
`vendor` —que sí es de carga inmediata— y sumaría los 276 KB al arranque sin
romper nada visible. Ahora el verificador falla si vuelve.

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

### HECHO (07-09-2026)

Las tres guardas, más dos cosas que salieron al hacerlo. 16 → **24**
comprobaciones en `verificar-documentos.mjs`; 220 pruebas de backend en verde.

La extracción entera —`pdfjs`, el lector casero, el de `.docx` y sus
ayudantes— se mudó a `backend/ia/indices/extraccion.worker.mjs` **sin tocar una
línea de su lógica**, con `extraccion.mjs` de puerta: firma antes de arrancar
el hilo, topes dentro, reloj fuera (un hilo colgado no se mide a sí mismo).
Efecto lateral que interesa a COD-04: `documentos.mjs` pasa de **1051 a 749
líneas** y sale de la lista de archivos de más de mil.

La prueba del bucle de eventos fabrica un `.docx` de 20 000 párrafos —0,18 MB
en disco, ~15 MB de XML inflado, 226 ms de CPU medidos— y cuenta latidos de un
`setInterval` mientras se indexa. Antes de esta fase, ese cuarto de segundo no
atendía nada. Es la distinción que `MAX_BYTES` por sí solo no podía hacer: lo
caro no es leer el archivo, es procesarlo.

**Lo que no estaba en el plan:**

1. **Recortar no puede significar descartar.** El primer recorte por
   caracteres tiraba la página que se pasaba del tope. Un `.docx` es UNA sola
   página, así que un documento demasiado largo salía con cero páginas y el
   índice lo leía como «no se pudo extraer nada» — ilegible, cuando lo que
   pasa es exactamente lo contrario. Ahora corta el texto y el documento entra
   recortado, que es lo que es.
2. **Un aviso de recorte tiene que sobrevivir a la caché.** Un archivo
   recortado SÍ se cachea —lo que entró es bueno— así que en la siguiente
   `recargar()` no vuelve a pasar por la extracción. Anotar el aviso allí lo
   habría hecho desaparecer en cuanto otro archivo disparara una recarga: el
   mismo fallo que `ilegibles` ya tuvo una vez, y que su prueba vigila desde
   entonces. El motivo viaja en la entrada de la caché y `parciales` se
   reconstruye de ahí.

`parciales` es lista propia en `estado()`, no una variante de `ilegibles`: el
arreglo es distinto —convertir el archivo en un caso, decidir si lo que faltó
importaba en el otro— y mezclarlos obligaría a leer el texto del motivo para
saber cuál es cuál. La pantalla de Documentación aún no la pinta; eso es del
Plan 24 (`USO-04`, errores accionables), y hasta entonces sale en el registro
de arranque, que es donde alguien la busca hoy.

La firma se comprueba también **al subir** (`manuales.mjs`), por el mismo
motivo que el tamaño: un archivo que el índice nunca podrá leer no tiene por
qué ocupar disco y salir en la lista de manuales como si fuera uno más. En
`reemplazar` se contrasta contra la extensión del archivo que ya está, que es
la que se conserva.

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

### HECHO (07-09-2026)

`backend/lib/diario.mjs`, JSONL en `datos/diario-accionamientos.jsonl`, con
`DIARIO_ACCIONAMIENTOS`, `DIARIO_MAX_BYTES` y `DIARIO_DIAS` documentadas en
`backend/README.md`. 73 → **79** comprobaciones en `verificar-backend.mjs`, y
`backend/test/diario.test.mjs` con 11 más para la poda, que desde la ruta no se
puede provocar sin treinta mil accionamientos.

**JSONL y no un array JSON**, que es la decisión de forma: un array hay que
reescribirlo entero para añadirle un elemento, así que cada orden a la bomba
pagaría el coste del diario completo y un corte a mitad se llevaría todo lo
anterior. Con una línea por entrada, un archivo con la última a medias sigue
siendo legible hasta la penúltima — y eso es exactamente lo que comprueba la
prueba del corte. `escribirAtomico` (Plan 20 F3) sí entra, pero sólo en la
poda, que es la única operación que reescribe el archivo entero.

**La poda se anota.** Cuando el tope muerde, en el sitio de lo que se fue queda
una línea diciendo cuántas entradas eran y hasta cuándo llegaban. Un diario que
adelgaza en silencio es peor que no tenerlo: quien lo lee cree tener el registro
completo de un periodo del que le faltan las primeras horas.

**Lo que faltaba del Plan 21 F5, y el plan daba por hecho que estaba.**
`valorLeido` y `coinciden` sí se producían, pero no llegaban hasta aquí: el
éxito de `controlar_bomba` devolvía sólo `{ok, accion, tag}` —la confirmación se
comprobaba y se tiraba— y `writePoint` perdía `intentos`, que `sendWrite` ya
contaba. Dos líneas en cada sitio. Cuántas relecturas costó una orden es un
síntoma que se lee meses después: la que hoy necesita tres intentos es la que
mañana falla.

Y una nota sobre el recuento: son cuatro líneas para cinco peticiones. La del
cuerpo vacío no aparece porque Fastify la rechaza en la validación del esquema
antes de que la ruta corra — no fue un accionamiento, fue una petición mal
formada, y anotarla habría sido ensuciar el diario con ruido de protocolo.

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

### HECHO (07-09-2026)

Tres familias en `familiaDeRuta` (`http/plugins/seguridad.mjs`), repartidas
desde el `onRoute` de `app.mjs` —donde ya vivía la decisión de alcance— y no
ruta por ruta, por lo mismo que la guarda de autenticación es del ámbito: una
ruta nueva hereda su techo por estar donde está. `RATE_LIMIT_MAX_LECTURAS`
(1200) y `RATE_LIMIT_MAX_IA` (20) en `backend/README.md`; `RATE_LIMIT_MAX`
sigue significando lo mismo que antes, para no cambiarle el comportamiento a
quien ya lo tuviera ajustado.

**La primera versión de la clasificación estaba mal, y lo dijo una prueba
vieja.** Daba la cuota generosa a todo `/api/iconics/` menos las escrituras;
`iconics.test.mjs` baja `RATE_LIMIT_MAX` a 3 y espera un 429 en `userinfo`, y
dejó de llegar. La prueba tenía razón: la cuota generosa se justifica por dos
cosas A LA VEZ —que la petición sea barata y que algo la repita solo— y de esa
carpeta sólo `data` e `history` cumplen las dos. `browse`, `points`, `userinfo`
y `alarms` van al servidor sin caché y las dispara alguien pulsando algo.
Quedó acotada a las dos que un tablero sondea, con el porqué en la cabecera.

El aviso del proxy sin declarar no puede ser una comprobación de arranque:
hasta que no llega una petición no se sabe si hay un proxy delante. Se
comprueba en la primera que trae `X-Forwarded-For` y se avisa **una vez** —
repetirlo por petición es la forma segura de que nadie lo lea. La condición
vive en `hayProxySinDeclarar` y el texto en `AVISO_PROXY`, aparte del gancho,
para poder probar CUÁNDO se avisa y que el aviso dice qué se rompe (la cuota
compartida por toda la planta, y la IP del proxy en el diario de F3) sin tener
que capturar líneas de log.

231 → **240** pruebas de backend.

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

### HECHO (07-09-2026)

`scripts/verificar-tls.mjs`, 7 comprobaciones, y entró solo en la tanda —21 →
**22** verificadores— porque `verificar-todo.mjs` descubre la carpeta (Plan 20
F2). Fabrica un autofirmado con `openssl`, levanta un HTTPS en loopback y lanza
procesos hijo: sin CA declarado sale `DEPTH_ZERO_SELF_SIGNED_CERT`, con él sale
200. **Tiene que ser un verificador y no un `.test.mjs`**: `NODE_EXTRA_CA_CERTS`
la lee Node al arrancar el proceso, así que ponerla en `process.env` a mitad de
una prueba no hace absolutamente nada.

La tercera comprobación es la que hace útiles a las dos primeras: declarar la CA
de OTRO certificado no cuela. Sin ella, «con CA funciona» podría ser cierto por
haber apagado la verificación por otro lado y la prueba no lo notaría.

Sin `openssl` en el PATH el verificador lo dice y **sale con 0**: no puede
afirmar nada, pero tampoco es una regresión del código, y hacerlo fallar
convertiría la tanda en roja por una herramienta que falta.

**Lo que Node no hace, y por eso hay comprobación de arranque**: si
`NODE_EXTRA_CA_CERTS` apunta a un archivo que no existe o no es un PEM, lo
**ignora en silencio**. El síntoma llega mucho después, disfrazado de fallo de
red contra ICONICS, y lleva a buscar en el sitio equivocado. Ahora el arranque
falla con el motivo — y si el archivo es DER, con la orden de `openssl` que lo
convierte.

El aviso de los dos a la vez es su propia línea, aparte del que ya existía: el
viejo dice que la verificación está apagada, y quien acaba de declarar una CA lo
lee pensando que ya no le aplica. `caDeclaradaYVerificacionApagada` está en
`config.mjs` con sus cuatro pruebas.

`backend/README.md` lleva las dos órdenes de `openssl` para exportar el
certificado de `bms-server` —incluida la conversión desde el `.cer` binario que
sale del navegador en Windows—, que es el paso que de verdad bloquea a quien lo
intenta. 240 → **244** pruebas de backend.

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

> **Confirmado el 07-09-2026, antes de empezar F1**: se mantiene la opción 1.
> La pantalla de acceso del tablero queda en el Plan 25.

**Cómo se prueba.** Con `AUTH_HABILITADA=true` en las pruebas: que sin token las
rutas responden 401 y con token válido pasan; que un token caducado se
distingue de uno inválido —son dos arreglos distintos—; que `exigirRol` niega
con 403 y no con 404, que diría que la ruta no existe; y que las sondas de salud
siguen fuera, porque un despliegue autenticado no puede reiniciarse solo porque
su propia sonda responda 401.

### HECHO (07-09-2026), con la opción 1

`@fastify/jwt` con emisor propio. Tres rutas —`login`, `renovar`, `yo`—, el
censo en `http/usuarios.mjs`, y `AUTH_HABILITADA` **entregada en `false`**.
244 → **275** pruebas de backend: 18 en `test/rutas/autenticacion.test.mjs`, que
enciende el interruptor entero, y 13 del censo.

**El censo va en el entorno y no en una tabla** porque está destinado a
desaparecer: el Plan 26 lo sustituye por el IdP de ICONICS, y montar ahora un
CRUD de usuarios con su pantalla sería construir para tirar. Tampoco un JSON en
`datos/`: ahí vive lo que el backend GENERA; un censo de personas es
configuración de despliegue.

`scrypt` de `node:crypto` para las contraseñas —una dependencia menos— con sal
por usuario. Y `scripts/hash-clave.mjs`, sin el cual `AUTH_USUARIOS` sería una
variable que nadie puede rellenar: mismo criterio que documentar cómo exportar
el certificado en F5, la pieza que bloquea no es la difícil, es la que nadie
escribió. Pide la clave sin eco y también la lee de una tubería, porque un
argumento de línea de órdenes queda en el historial y lo ve un `ps`.

**Tres decisiones que no estaban en el plan:**

1. **No hay logout.** Un JWT vale hasta que caduca; una ruta que dijera
   `ok: true` sin invalidar nada daría a entender lo contrario. Revocar de
   verdad exige una lista de tokens revocados releída en cada petición — una
   base de datos por la puerta de atrás (§2.2). El día que haga falta, la
   respuesta es la federación, que ya la tiene.
2. **La renovación relee los roles del censo, no los copia del token.** Si los
   copiara, un token viejo se prolongaría a sí mismo con permisos ya retirados,
   indefinidamente, mientras siguiera renovando. Tiene su prueba.
3. **El login verifica un hash de mentira contra un usuario inexistente.** Sin
   eso, «usuario que no existe» contesta en un milisegundo y «existe con clave
   mala» tarda los ~100 ms de `scrypt`: la diferencia se mide desde fuera y
   convierte el login en un buscador de nombres de usuario válidos.

**Y una prueba vieja hizo su trabajo.** `guardas.test.mjs` falló nombrando
`POST /api/auth/login` como ruta sin guarda, que es exactamente para lo que se
escribió en el Plan 20 F5: obligar a que toda excepción se declare con su
motivo en vez de aparecer por descuido. La excepción es sólo el login —
`renovar` y `yo` parten de una sesión que ya existe y sí pasan por la guarda.

`seguridad.test.mjs` tenía una prueba que exigía que arrancar con
`AUTH_HABILITADA=true` fallara «porque no está implementada». Ya no es cierto:
ahora falla porque falta `AUTH_SECRETO`. La puerta se mantiene y el motivo se
corrigió.

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

### HECHO (07-09-2026)

`backend/lib/enlacesFirmados.mjs` (HMAC-SHA256 sobre `id|expira|usuario`) y 9
comprobaciones en `test/rutas/reportes.test.mjs`. 275 → **284** pruebas de
backend.

**HMAC y no una lista de enlaces vigentes**: esa lista sería estado compartido
que hay que escribir al emitir y leer al descargar, o sea una base de datos por
la puerta de atrás (§2.2). El precio es que un enlace emitido no se puede
revocar antes de tiempo, y por eso el plazo es de 24 h y no de 30 días.

**Se firma en la SALIDA de la ruta, no en `generar_reporte`.** La herramienta
corre dentro del bucle del modelo y no sabe quién hizo la pregunta; la ruta sí,
porque tiene `request.usuario`. Firmar en la frontera —reescribiendo la `url`
del adjunto al pasar por `emitir`— deja las 22 herramientas sin enterarse de
que existe una firma, que es donde tiene que quedarse ese detalle. Sin esto
habría que plumar el usuario por `chat.responder` y el bucle de herramientas
entero.

**El usuario viaja en la firma aunque hoy todos sean `anonimo`.** Es la misma
razón por la que `request.usuario` se rellena siempre desde el Plan 20 F5: el
día que se encienda F6, un enlace de Ana deja de servirle a Juan sin tocar una
línea. Si el campo no estuviera, ese día habría que cambiar el formato y todos
los enlaces vigentes se caerían a la vez.

**El período de gracia: NO lo hay**, y el mensaje del 403 lo dice con esas
palabras —que era la otra mitad de lo que pedía el plan, no basta con que esté
en el código—. Un plazo de gracia sobre una guarda es la guarda apagada con
pasos de más, y el coste está acotado: los reportes se purgan a los 30 días y
volver a pedir uno es una frase al asistente.

Dos decisiones de detalle, cada una con su prueba:

- **La firma se comprueba antes de mirar el disco.** Al revés, un enlace
  inventado sobre un id inexistente daría 404 y sobre uno real daría 403: por
  diferencia se pueden enumerar los ids que existen.
- **Un enlace válido de un PDF ya purgado sigue dando 404.** La firma autoriza
  a PEDIR, no promete que el archivo esté; son dos respuestas distintas y
  tienen que seguir siéndolo.

Sin `REPORTES_SECRETO` no se firma nada y todo se comporta como antes de esta
fase, con un aviso de arranque. No se genera un secreto al vuelo por lo mismo
que en F6: uno aleatorio por arranque invalidaría en cada reinicio los enlaces
que el asistente ya entregó, y el fallo sería intermitente y nadie lo
relacionaría con esto.

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

## Resultado (07-09-2026)

Las siete fases están hechas, cada una con su commit y su suite en verde.
Ningún punto necesitó la planta, como decía §0.2 — que era una comprobación y
no una estimación, y salió bien.

| Antes | Después |
|---|---|
| 220 pruebas de backend | 284 |
| 570 pruebas de frontend | 580 |
| 21 verificadores | 22 |
| `xlsx` con avisos altos | fuera, y un verificador impide que vuelva |
| el parseo de PDF en el hilo de planta | en un hilo aparte, con firma y topes |
| una orden a la bomba sólo en el log | también en un diario que sobrevive al reinicio |
| un cubo de peticiones para todo | tres familias |
| TLS apagado en todo el proceso | una CA propia basta, y se comprueba |
| `AUTH_HABILITADA` sin implementación | JWT completo, probado, y el interruptor a mano |
| enlaces de reporte eternos | firmados y con caducidad |

**Lo que salió al hacerlo, y no estaba en el plan:**

- **F1 · el alivio de bundle no existía donde el plan lo ponía.** Los 276 KB de
  `xlsx` ya viajaban en un trozo diferido, así que el arranque nunca los pagó.
  COD-07 sigue necesitando sus 3 KB en otro sitio.
- **F2 · recortar no puede significar descartar.** Un `.docx` es una sola
  página: tirar la que se pasa del tope dejaba el documento en cero páginas y
  el índice lo leía como «no se pudo extraer nada» — lo contrario de lo que
  pasa.
- **F2 · un aviso de recorte tiene que sobrevivir a la caché**, o desaparece en
  cuanto otro archivo dispara una recarga. Es el mismo fallo que `ilegibles` ya
  tuvo una vez.
- **F3 · faltaba media tubería del Plan 21 F5.** `valorLeido` y `coinciden` se
  producían y no llegaban a la ruta; `writePoint` perdía `intentos`.
- **F4 · la primera clasificación de familias estaba mal, y lo dijo una prueba
  vieja.** `iconics.test.mjs` esperaba un 429 en `userinfo` y dejó de llegar.
- **F6 · `guardas.test.mjs` hizo exactamente su trabajo**: falló nombrando
  `POST /api/auth/login` como ruta sin guarda, obligando a declarar la
  excepción con su motivo en vez de que apareciera por descuido.

Las dos últimas son el argumento entero del Plan 20: las pruebas que se
escribieron entonces para vigilar decisiones, no comportamiento, son las que
han encontrado los errores de éste.

## Lo que queda abierto

1. **La federación OIDC** (F6, segunda mitad) — Plan 26. El emisor de los
   tokens somos nosotros; sustituirlo por el IdP de ICONICS es cambiar quién
   firma, no el modelo.
2. **El certificado real de `bms-server`** (F5) — Plan 26. El mecanismo está
   probado contra un autofirmado en loopback; que ESE certificado se acepte es
   otra afirmación y necesita la planta.
3. **La pantalla de acceso del tablero** (F6) — Plan 25. Confirmada la opción 1
   antes de empezar: el backend está listo y `AUTH_HABILITADA` se entrega en
   `false` porque el tablero todavía no sabe pedir un token.
4. **Encender `AUTH_HABILITADA` y `REPORTES_SECRETO` en producción.** Los dos
   son decisiones de despliegue, con sus variables documentadas en
   `backend/README.md`, y ninguno se enciende solo. Hasta que se enciendan, lo
   entregado en F6 y F7 está probado y **no está protegiendo nada** — conviene
   no confundir las dos cosas.
