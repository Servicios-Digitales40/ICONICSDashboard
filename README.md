# Asistente — el puente hacia ICONICS que se pregunta

Una sola pantalla: la conversación. El técnico entra con **su usuario y
contraseña de ICONICS** y a partir de ahí pregunta en lenguaje natural sobre
las máquinas de la planta — el valor de una señal ahora mismo, su historia,
qué dice el manual, por qué se disparó un riesgo, y puede pedir una
intervención o encender la bomba si su cuenta tiene permiso.

No hay tablero, sidebar ni gráficas de planta: esta rama (`Asistente`) las
borró a propósito. El motivo completo, el inventario de lo que se fue y de lo
que se quedó, y las siete fases con las que se hizo —incluida cómo vivir
embebido dentro del HMI nativo de ICONICS sin pedir un segundo login—, están
en
[`docs/PLAN-20-ASISTENTE.md`](docs/PLAN-20-ASISTENTE.md). Si buscas el
tablero de 22 vistas (Demo EVA, con 3D y gráficas), vive en la rama
`Moises6`.

El proyecto son dos piezas: un backend puente en Node que resuelve la
autenticación OIDC+PKCE contra ICONICS por persona, y un frontend en React
que consume ese backend. Detalle de producto en [`PRODUCT.md`](PRODUCT.md),
no negociables de arquitectura en [`CLAUDE.md`](CLAUDE.md).

## Qué sabe hacer

Veintidós herramientas, agrupadas en seis familias
(`backend/ia/herramientas/`):

| Familia | Para qué |
|---|---|
| **registro** | Qué máquinas hay y qué limita a cada una |
| **maquina** | El instante — estado, riesgos activos, y la única que **escribe**: `controlar_bomba` |
| **historicos** | Todo lo que pregunta al pasado: historia, comparativas, correlaciones, gráficas, pronóstico de desgaste, reportes |
| **documentacion** | Los manuales de planta, y el cruce de lo medido contra sus límites |
| **diagnostico** | Las causas posibles, ordenadas por las 4 fuentes (dato en vivo, manual, casos previos, tendencia), y su cierre |
| **aprendizaje** | Lo que alguien verificó (`recordar_hecho`, `registrar_intervencion`) y lo que se propone aprender (`proponer_regla`) |

El modelo puede **encadenar hasta tres** herramientas para una misma
pregunta (`IA_MAX_PASOS`), que es lo que hace posible «¿por qué falló esto?»
— necesita el estado, la historia de la señal sospechosa y a veces el manual.

Tres reglas del diseño, por si sorprenden en pantalla:

- **Toda cifra viene de una consulta**, y debajo de cada respuesta se dice de
  dónde salió, una línea por consulta. Si el modelo contesta con números sin
  haber consultado nada, el puente no deja salir la respuesta.
- **El código puntúa, el modelo redacta.** El motor de diagnóstico
  (`backend/ia/motor/`) es determinista; el modelo nunca decide una banda,
  un orden o una causa por su cuenta.
- **Una consulta a la vez, y nadie recibe un error por llegar el segundo.**
  Con un `llama-server` sirviendo un modelo, dos personas preguntando a la
  vez se encolan; quien llega después ve cuántos tiene por delante.

Además: dictado y manos libres, exportar la conversación a PDF, adjuntar
texto a una pregunta, y persistencia del hilo entre recargas — sobrevive
incluso a que la sesión caduque a mitad de una respuesta.

## Requisitos

- Node.js 18 o superior
- Acceso a un servidor ICONICS con la API REST de FrameWorX habilitada
- Una cuenta de ICONICS por cada persona que vaya a usar el asistente — no
  hay credenciales de servicio compartidas para el uso normal

## Puesta en marcha

La configuración del **servidor** va en un archivo `.env.local` en la raíz,
que **no se versiona**. La plantilla comentada de todas las variables está en
[`.env.example`](.env.example):

```
ICONICS_API_BASE=https://tu-servidor/fwxapi/rest/v1
```

**No hace falta `ICONICS_USERNAME` ni `ICONICS_PASSWORD`.** El login es de
cada técnico, no del proceso: entra por la pantalla de login con su propia
cuenta de ICONICS. Esas dos variables sólo se leen en dos caminos que sí
necesitan una identidad de máquina —`ICONICS_FAKE=true` para desarrollar sin
red, y los `scripts/verificar-*.mjs`— y se documentan como tales en
`.env.example`.

`CORS_ORIGINS` se queda vacío: en los dos despliegues la API cuelga del mismo
origen que la página. En planta porque el backend sirve el bundle, y en
desarrollo porque el dev server reenvía `/api` al backend (`server.proxy` en
[`react-dashboard/vite.config.js`](react-dashboard/vite.config.js)).

Backend, en una terminal:

```bash
node --env-file=.env.local backend/server.mjs    # escucha en :3001
```

Frontend, en otra:

```bash
cd react-dashboard
npm install
npm run dev                                       # Vite, normalmente en :5173
```

Abre `http://localhost:5173`, entra con tu usuario y contraseña de ICONICS, y
pregunta.

El resto de variables —puerto, nivel de log, directorio de estáticos— están
en [`backend/README.md`](backend/README.md).

### Desde otro equipo de la red

Los dos procesos escuchan en todas las interfaces, así que basta abrir
`http://<ip-de-esta-máquina>:5173`. No hay ninguna IP escrita en el código: el
frontend pide `/api` a su propio origen y el dev server lo reenvía.

Si el equipo remoto hace ping pero el puerto no responde, es el Firewall de
Windows y no la aplicación. Una vez, como administrador:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\exponer-en-red.ps1
#                                                   -Quitar lo deja como estaba
```

El `-ExecutionPolicy Bypass` va porque Windows PowerShell 5.1 viene en
`Restricted` de fábrica y no ejecuta ningún script, ni local. Su política es
**independiente** de la de PowerShell 7: `Get-ExecutionPolicy` en `pwsh` puede
decir `RemoteSigned` y el 5.1 seguir negándose. Afecta sólo a esa invocación,
que es lo que se quiere: no hay motivo para relajar la política de la máquina
por dos guiones. Lo mismo vale para `scripts\dev.ps1`.

Abre 3001, 5173 y 4173 sólo para la subred local, y desactiva la regla que
bloquea `node.exe` —la que crea Windows cuando alguien pulsa "Cancelar" en el
aviso del firewall— porque un *Bloquear* vence a cualquier *Permitir* y deja el
puerto cerrado aunque las reglas de abrirlo estén puestas.

**Si quien mira está en otra subred**, «local» no le incluye: con esta máquina
en `10.10.17.14/24`, un equipo en `10.10.21.11` llega encaminado por el router y
la regla lo rechaza. Se autoriza con `-Desde`, que añade sin quitar la subred
local:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\exponer-en-red.ps1 -Desde 10.10.21.11
```

Mejor la IP concreta que el rango (`10.10.0.0/16`): es la diferencia entre «ese
equipo puede entrar» y «cualquiera de esa red puede entrar».

> Quien alcance el puerto llega a la pantalla de login, no directo al
> asistente: sin sesión de ICONICS válida, `/api/` responde 401. Eso sí
> significa que cualquiera con la cuenta de ICONICS de otra persona entra
> como ella — el control de acceso es el mismo que el de ICONICS, no uno
> nuevo.

### En producción

Un solo proceso: el backend sirve el frontend compilado desde el mismo
origen, así que no hace falta segundo servidor ni CORS.

```bash
cd react-dashboard && npm run build    # genera react-dashboard/dist
cd .. && node --env-file=.env.production backend/server.mjs
```

Sin ese build, el backend responde 503 diciendo que falta compilar.

> ⚠️ **`shared/` tiene que viajar en la release.** El backend importa de ahí
> el catálogo de señales y las reglas del historiador. Un paquete que lleve
> sólo `backend/` y `dist/` arranca y falla en el primer `import`.

> ⚠️ **HTTPS es obligatorio en producción, no opcional.** La cookie de sesión
> se emite con `Secure` en cuanto `NODE_ENV=production`, y un navegador
> descarta una cookie `Secure` sobre HTTP: el login parecería aceptar las
> credenciales y la siguiente petición volvería a dar 401. `backend/server.mjs`
> no termina TLS por sí mismo: sirve el puente detrás de un proxy inverso que sí
> lo haga. En desarrollo (`NODE_ENV` distinto de `production`) la cookie no
> lleva `Secure` y HTTP local funciona sin más.

El build se estampa solo con el `git describe` del árbol, y esa versión se ve
en `/api/health`. En producción **no** debe aparecer
`NODE_TLS_REJECT_UNAUTHORIZED`: impide el arranque con `NODE_ENV=production`
a propósito.

Tras cada build hay que ejecutar
[`scripts/verificar-bundle.mjs`](scripts/verificar-bundle.mjs), que comprueba
que la pila 3D, `recharts` y `xlsx` —desinstaladas en el Plan 20— no han
vuelto a colarse en el arranque.

## La sesión

El login es el de cada técnico contra ICONICS (OIDC + PKCE), no una
identidad de máquina. Consecuencias directas:

- **La escritura sobre la planta la autoriza ICONICS, no este puente.**
  `controlar_bomba` y `POST /api/iconics/write` salen con el token de quien
  preguntó: un técnico sin permiso de escritura en ICONICS recibe un 403 del
  servidor de planta, no del puente. `ICONICS_READ_ONLY` sigue existiendo
  como segunda puerta, del lado del servidor.
- **Cerrar sesión borra la conversación; que la sesión caduque sola, no.**
  Caducar (por inactividad, `SESION_TTL_MINUTOS`) devuelve al login
  conservando el hilo — es lo normal en planta: preguntar, ir a mirar la
  máquina, volver. Salir explícitamente sí lo borra, porque en un equipo
  compartido el siguiente turno no debería heredar lo que preguntó el
  anterior.
- **La sesión vive en memoria del proceso, no en una base de datos.**
  Reiniciar el backend obliga a todo el mundo a volver a entrar — es
  correcto y esperable en una aplicación de planta. `SESION_MAX` acota
  cuántas sesiones conviven a la vez.

### Sin login, cuando vive dentro de ICONICS

Si el Asistente se empotra en un `<iframe>` del HMI nativo de ICONICS
(AnyGlass/GraphWorX) y el técnico ya entró ahí, **no hace falta un segundo
login**: con `SSO_REDIRECT_URI` configurada, un iframe oculto le pregunta a
ICONICS con `prompt=none` si ya hay sesión, y entra solo. Requiere montar el
Asistente bajo el **mismo origen** que ICONICS (vía un proxy inverso de IIS,
por ejemplo `https://<host>/asistente/`) — el paso a paso completo, con los
motivos de cada requisito, está en
[`docs/PLAN-20-ASISTENTE.md`](docs/PLAN-20-ASISTENTE.md) §F7.

Detalle de diseño, riesgos declarados y por qué se hizo así:
[`docs/PLAN-20-ASISTENTE.md`](docs/PLAN-20-ASISTENTE.md) §4, §8 y §F7.

## Los tres cajones

Un panel lateral, no una segunda pantalla — se abre desde la barra del chat,
se cierra con Escape, y ninguno tiene URL propia:

- **Assets** — el árbol de AssetWorX con el valor y la calidad en crudo de
  cada punto. Seleccionar uno lo manda al chat como contexto.
- **Manuales** — subir, reemplazar y archivar los PDF que alimentan el índice
  documental que usa `consultar_documentacion`.
- **Casos** — la bitácora de intervenciones: filtrar por activos/archivados,
  buscar y archivar. Un caso archivado deja de alimentar el diagnóstico pero
  nunca se borra.

## Documentación de planta (RAG)

`IA_DOCS_DIR` apunta a una carpeta con manuales. Se leen `.txt`, `.md`,
`.csv`, `.log` y `.pdf` — el texto se extrae con el `zlib` de Node, sin
dependencias, lo que cubre los PDF generados por Word o InDesign. Un PDF
**escaneado** es una imagen: el índice lo detecta y lo dice, en vez de
indexar basura.

La búsqueda es BM25 (léxica, sin servidor) y, si `IA_EMBEDDING_BASE` apunta a
un segundo llama-server con `--embedding`, se mezcla con búsqueda semántica.

## El modelo de lenguaje

Apagado por defecto: sin `IA_BASE`, el asistente lo dice y no se rompe. Se
enciende apuntando a un `llama-server` local:

```bash
llama-server.exe -m <modelo>.gguf --jinja --host 127.0.0.1 --port 8080 -c 4096 -ngl 99 --parallel 1
```

Dos cosas de esa línea no son opcionales. **`--jinja`** activa la plantilla
de chat del modelo: sin ella no ve las herramientas y contesta de memoria,
que es el modo de fallo más peligroso porque parece que funciona. Y
**`127.0.0.1`**, porque `llama-server` no tiene autenticación de ninguna
clase.

## Voz

Opcional y apagado por defecto. Necesita un tercer proceso, `whisper-server`,
con un atajo para arrancarlo:

```powershell
.\scripts\whisper.ps1
```

Se apunta con `IA_WHISPER_BASE=http://127.0.0.1:8082` y aparecen dos botones
en la barra del asistente: **micrófono** (dicta la pregunta, que se revisa
antes de enviar) y **teléfono** (manos libres: escucha, pregunta, contesta en
voz alta y vuelve a escuchar, sin confirmar — es una llamada, no un chat con
un botón de más).

No hace falta ffmpeg (el audio se convierte a WAV en el navegador) ni un
modelo de voz para hablar (se usa el sintetizador del sistema — SAPI en
Windows). Los binarios de whisper.cpp no hace falta compilarlos: las
releases oficiales traen `whisper-blas-bin-x64.zip`.

## Pruebas

Frontend:

```bash
cd react-dashboard
npm test               # vitest
npm run design:detect   # impeccable — antipatrones de diseño/CSS
```

Backend:

```bash
cd backend
npm test
```

Verificadores de extremo a extremo, sin red ni servidores reales (levantan un
ICONICS y un llama-server falsos):

```bash
node scripts/verificar-backend.mjs
node scripts/verificar-herramientas.mjs
node scripts/verificar-chat.mjs
node scripts/verificar-sesion.mjs         # el login nativo, de punta a punta
```

La lista completa, con qué prueba cada uno y cuándo correrlo, está en
[`CLAUDE.md`](CLAUDE.md) §5.

Tras compilar:

```bash
node scripts/verificar-bundle.mjs
```

## Documentación

- [`CLAUDE.md`](CLAUDE.md) — no negociables de arquitectura, estructura del repo, pruebas
- [`PRODUCT.md`](PRODUCT.md) — producto, usuarios, posicionamiento
- [`DESIGN.md`](DESIGN.md) — el sistema visual: color, tipografía, los tres estados de la pantalla
- [`backend/README.md`](backend/README.md) — arquitectura del puente y referencia de la API
- [`shared/README.md`](shared/README.md) — qué vive en `shared/` y por qué
- [`docs/PLAN-20-ASISTENTE.md`](docs/PLAN-20-ASISTENTE.md) — por qué esta rama es lo que es
- [`docs/BACKLOG-BACKEND.md`](docs/BACKLOG-BACKEND.md), [`docs/BACKLOG-FRONTEND.md`](docs/BACKLOG-FRONTEND.md) — deuda conocida y priorizada
