# Demo EVA — Sistemas de agua industrial

Tablero que muestra el estado de una instalación de agua industrial leyendo sus
señales de un servidor **ICONICS** (AssetWorX y Hyper Historian).

El proyecto son dos piezas: un backend puente en Node que resuelve la
autenticación contra ICONICS, y un frontend en React que consume ese backend.

## Qué hace

Ocho señales, todas bajo `ac:TDCON/DEMO/SENSORES/`, presentadas de cuatro
formas:

- **Planta** — el estado del sistema derivado de sus señales, con la serie
  histórica de las que el historiador entrega.
- **Máquina 3D** — el grupo de bombeo, que se comporta según ese estado.
- **Maqueta 3D** — la instalación en miniatura; el nivel del tanque es el dato
  en vivo.
- **Assets** — los ocho puntos con su valor y su calidad en crudo, navegando el
  árbol de AssetWorX.
- **Asistente** — un chat que responde en lenguaje natural consultando ICONICS
  de verdad, con un modelo que corre en el propio servidor. Opcional: sin
  `IA_BASE` no aparece.

> **De dónde viene esto.** Hasta agosto de 2026 la aplicación era un tablero de
> **OEE** sobre las diez máquinas de Resonac —siete líneas y tres
> rectificadoras—, y la demo de agua era una sección más. La transición invirtió
> los papeles y el tablero de OEE se retiró entero: sus vistas, su modelo de
> planta, su catálogo de tags, su simulador y sus doce propuestas de diseño. Lo
> que sobrevivió es lo que nunca supo de máquinas: el puente HTTP, el motor de
> sondeo, el explorador de assets y las primitivas 3D.

## Estructura

```
.
├── backend/            Servidor puente hacia ICONICS (Node, sin dependencias)
│   ├── http/             Mecánica HTTP: router, respuestas, estáticos
│   ├── ia/               Asistente: herramientas y bucle de conversación
│   ├── iconics/          Autenticación OIDC, cliente REST y validación
│   └── routes/           Traducción HTTP ↔ cliente
├── react-dashboard/    Frontend React + Vite
│   └── src/Demo-EVA/     Todo lo que sabe de la instalación de agua
├── shared/             Dominio que usan los dos: señales, estado y umbrales
├── scripts/            Utilidades de verificación
└── docs/               Planes de la demo y del simulador
```

`shared/` existe porque el backend y el frontend necesitan las mismas reglas de
negocio —qué señales hay, cómo se nombra un punto, cuándo una medida está fuera
de banda— y duplicarlas las haría divergir. Ver
[`shared/README.md`](shared/README.md).

## Requisitos

- Node.js 18 o superior
- Acceso a un servidor ICONICS con la API REST de FrameWorX habilitada

## Puesta en marcha

Las credenciales van en un archivo `.env.local` en la raíz, que **no se
versiona**. La plantilla comentada de todas las variables está en
[`.env.example`](.env.example):

```
ICONICS_API_BASE=https://tu-servidor/fwxapi/rest/v1
ICONICS_USERNAME=usuario
ICONICS_PASSWORD=contraseña
ICONICS_POINT_NAME=punto por defecto para /api/iconics/data

# Sólo para desarrollo:
ICONICS_READ_ONLY=false              # la escritura está deshabilitada por defecto
```

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

El resto de variables —puerto, nivel de log, directorio de estáticos— están en
[`backend/README.md`](backend/README.md).

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
equipo puede entrar» y «cualquiera de esa red puede entrar», y aquí no hay
contraseña que respalde lo segundo.

> ⚠️ Esto no pone autenticación delante del tablero: quien alcance el puerto
> entra, y el backend habla con ICONICS con una sesión privilegiada. Vale para
> una red de planta o de laboratorio; no para una Wi-Fi compartida con
> desconocidos. Deja `ICONICS_READ_ONLY` sin tocar y al menos nadie podrá
> escribir en la planta.

### En producción

Un solo proceso: el backend sirve el frontend compilado desde el mismo origen,
así que no hace falta ni segundo servidor ni CORS.

```bash
cd react-dashboard && npm run build    # genera react-dashboard/dist
cd .. && node --env-file=.env.production backend/server.mjs
```

Sin ese build, el backend responde 503 diciendo que falta compilar.

> ⚠️ **`shared/` tiene que viajar en la release.** El backend importa de ahí el
> catálogo de señales y las reglas del historiador. Un paquete que lleve solo
> `backend/` y `dist/` arranca y falla en el primer `import`.

El build se estampa solo con el `git describe` del árbol, y esa versión se ve
en el Topbar y en `/api/health`. En producción **no** deben aparecer
`VITE_ICONICS_FAKE`, `VITE_ENABLE_SIMULATOR` ni `NODE_TLS_REJECT_UNAUTHORIZED`:
las dos primeras se hornean en el bundle, y la última impide el arranque con
`NODE_ENV=production`.

Tras cada build hay que ejecutar [`scripts/verificar-bundle.mjs`](scripts/verificar-bundle.mjs),
que comprueba que la pila 3D no se ha colado en el arranque.

## Orígenes de datos

Hay **dos**, y los dos se ven igual de plausibles en pantalla. El indicador del
Topbar dice cuál está activo, y el que no es real lleva además una cinta de
aviso permanente.

| Origen | De dónde salen los datos | Cómo se activa |
|---|---|---|
| En vivo | Servidor ICONICS | Por defecto |
| Simulado | Transporte falso, sin red | `VITE_ICONICS_FAKE=true` al arrancar, o el botón del Topbar si se compiló con `VITE_ENABLE_SIMULATOR=true` |

El simulador sirve para desarrollar sin servidor **y** para enseñar la
aplicación. Pasa por el motor de polling igual que el servidor real, así que
ejercita la calidad OPC, los reintentos y la marca de dato rancio; lo único que
cambia es de dónde salen los bytes. Vive en
[`Demo-EVA/data/simulador.js`](react-dashboard/src/Demo-EVA/data/simulador.js) e
incluye serie histórica. Ver [`docs/PLAN-9-SIMULADOR-EVA.md`](docs/PLAN-9-SIMULADOR-EVA.md).

### Banderas de compilación

| Variable | Qué hace | Por defecto |
|---|---|---|
| `VITE_ICONICS_FAKE` | Arranca en el simulador | real |
| `VITE_ENABLE_SIMULATOR` | Añade el **botón** para cambiar de origen en caliente | apagada |
| `VITE_ICONICS_CHAOS` | `none` · `soft` · `high` — cuántos fallos inyecta el simulador | `soft` |

Todas se resuelven en **build**, así que un bundle compilado sin ellas va al
backend real y no trae interruptor — que es lo que debe llegar a un monitor de
planta.

Para una demostración con público, `VITE_ICONICS_CHAOS=none` apaga la
aleatoriedad del simulador: sin huecos, sin calidad mala y sin latencia.

## El asistente

Un chat, disponible desde cualquier pantalla, que responde preguntas en
lenguaje natural consultando ICONICS. «¿Cuánto ha bajado el nivel del tanque
desde ayer?» se convierte en una lectura real del historiador, no en una cifra
recitada por el modelo.

Es **opcional y está apagado por defecto**. Se enciende apuntando `IA_BASE` a
un llama-server local:

```bash
llama-server.exe -m <modelo>.gguf --jinja --host 127.0.0.1 --port 8080 -c 4096 -ngl 99 --parallel 1
```

Dos cosas de esa línea no son opcionales. **`--jinja`** activa la plantilla de
chat del modelo: sin ella no ve las herramientas y contesta de memoria, que es
el modo de fallo más peligroso porque parece que funciona. Y **`127.0.0.1`**,
porque llama-server no tiene autenticación de ninguna clase.

Tres reglas del diseño, por si sorprenden en pantalla:

- **Toda cifra viene de una consulta.** Debajo de cada respuesta se dice de
  dónde salió el dato. Si el modelo contesta con números sin haber consultado
  nada, el puente **no** deja salir la respuesta.
- **Una consulta a la vez.** La segunda pregunta simultánea recibe un aviso, no
  una espera muda: dos a la vez se reparten la GPU y tardan el doble las dos.
- **Sólo algunas señales tienen historia.** A tres de las ocho el historiador
  les devuelve la serie de otra sin dar error, así que la marca vive como hecho
  medido en `shared/eva/senales.js` (campo `historizado`). Preguntar por el
  pasado de una que no la tiene devuelve «no tengo ese dato», nunca un cero.

## Pruebas

Frontend:

```bash
cd react-dashboard
npm test
```

Backend, sin necesidad de servidor ni configuración —levantan un ICONICS falso
y un llama-server falso, y comprueban que cada pieza devuelve la forma que
espera la siguiente:

```bash
node scripts/verificar-backend.mjs        # el contrato HTTP
node scripts/verificar-herramientas.mjs   # las herramientas del asistente
node scripts/verificar-chat.mjs           # el bucle de conversación
```

Tras compilar:

```bash
node scripts/verificar-bundle.mjs         # la pila 3D no está en el arranque
```

## Documentación

- [`backend/README.md`](backend/README.md) — arquitectura del puente y referencia de la API
- [`react-dashboard/README.md`](react-dashboard/README.md) — arquitectura del frontend
- [`shared/README.md`](shared/README.md) — qué vive en `shared/` y por qué
- [`docs/PLAN-8-DEMO-EVA.md`](docs/PLAN-8-DEMO-EVA.md) — la demo de sistemas de agua
- [`docs/PLAN-9-SIMULADOR-EVA.md`](docs/PLAN-9-SIMULADOR-EVA.md) — el simulador de la sección
