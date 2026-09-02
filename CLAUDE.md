# CLAUDE.md — no negociables de este proyecto

Este archivo es la referencia rápida antes de tocar código. Si algo aquí
contradice lo que ves en un archivo concreto, **el archivo tiene razón** —
avisa y se corrige este documento, no al revés. Los porqués largos viven en
las cabeceras de cada archivo y en `docs/`; aquí sólo el resumen accionable.

## 1. Qué es esto

Puente Node hacia ICONICS FrameWorX + un dashboard React (Demo EVA) que
enseña dos instalaciones de planta (un sistema de agua y un sistema de
vibraciones) y un asistente de IA que responde sobre ellas. Detalle de
producto en [`PRODUCT.md`](PRODUCT.md), de arranque en [`README.md`](README.md).

## 2. No negociables (arquitectura)

Estas decisiones ya se tomaron. No se reabren por conveniencia de una tarea
puntual — si una tarea choca con una de estas, la tarea se replantea, no la
regla.

1. **ICONICS FrameWorX es la única fuente de datos y la única fuente de
   verdad.** No hay MQTT, no hay OPC-UA en el camino de datos (`scripts/plc_opcua.py`
   es un guion suelto, no está conectado a nada), no hay Node-RED, no hay
   event bus. Todo dato de sensor entra por `backend/iconics/client.mjs`.
2. **No hay base de datos ni vector DB.** La persistencia es JSON en
   `backend/datos/` (embeddings-cache) y `datos/aprendizaje.json` (no
   versionado). Los "índices" de búsqueda son cachés JSON, no un motor
   externo.
3. **El código puntúa, el modelo redacta.** El motor de diagnóstico
   (`backend/ia/diagnostico.mjs` y lo que se mueva a `backend/ia/motor/`) es
   determinista y nunca lo toca el LLM. El modelo narra un resultado ya
   calculado; jamás decide una banda, un orden o una causa por su cuenta.
   Ver la cabecera de ese archivo antes de tocarlo.
4. **La ausencia de dato nunca se disfraza de cero.** Un valor que no llegó,
   que tiene mala calidad OPC, o un tramo del historiador sin muestra, se
   representa como hueco (`sinDato`, `motivo`, `cobertura`) y se cuenta
   aparte. Ver `shared/quality.js`, `shared/valores.js` y la nota del
   26-08-2026 en la cabecera de `shared/eva/estadoMaquina.js`.
5. **No se inventa lo que falta.** Si algo requeriría OCR, un servidor que no
   está montado, o un umbral sin calibrar, el código lo dice explícitamente
   (`fallo(...)`, `provisional: true`) en vez de simular una respuesta. Un
   servidor sin una pieza montada se niega y explica qué falta; no degrada en
   silencio.
6. **El dominio compartido no se duplica.** Una regla de negocio que necesitan
   backend y frontend a la vez vive en `shared/`, una sola vez. Ver
   [`shared/README.md`](shared/README.md) — incluye el incidente concreto que
   esta regla existe para no repetir.
7. **`shared/` es dominio puro.** Sin React, sin `fetch`, sin nada que sepa de
   HTTP o de UI. Se prueba en Node sin arrancar nada. Lo que sí necesita red
   (`data/historia.js`, `data/simulador.js` en el frontend;
   `backend/ia/indices/` en el backend) vive fuera y **llama** al dominio, no
   al revés.
8. **`ICONICS_FAKE=true` nunca en producción.** Es el transporte simulado para
   desarrollo sin red — ver `backend/iconics/fakeClient.mjs`.
9. **Sin comodín en CORS.** `CORS_ORIGINS` compara por igualdad exacta; no
   existe `*`.
10. **La agrupación en 4 activos (Tanque, Bombeo, Distribución, Eléctrico) es
    NUESTRA, no del servidor.** Bajo `ac:TDCON/DEMO/SENSORES/` no hay equipos,
    sólo señales sueltas. Si el servidor publica equipos de verdad algún día,
    se sustituye `shared/eva/activos.js` y ninguna vista se entera — pero
    hasta entonces, ese archivo es la única fuente de esa agrupación.
11. **Autenticación existe como decorador sin exigir nada todavía**
    (`backend/http/plugins/autenticacion.mjs`, `AUTH_HABILITADA=false`). No se
    activa como efecto colateral de otra tarea — es su propio plan (ver G11 en
    `docs/PLAN-17-CERRAR-AUDITORIA.md`).

## 3. Estructura del repo

```
.
├── CLAUDE.md            Este archivo
├── README.md             Arranque, orígenes de datos, pruebas
├── PRODUCT.md             Qué es esto para quién
├── DESIGN.md              Sistema de diseño (color, tipografía, componentes)
├── backend/               Servidor puente hacia ICONICS (Node, Fastify)
│   ├── http/                Mecánica HTTP: router, esquemas Zod, plugins
│   ├── ia/                  Asistente: índices, motor de diagnóstico, conversación, herramientas
│   │   └── herramientas/      Una carpeta por FAMILIA de herramienta del modelo
│   ├── iconics/              Autenticación OIDC, cliente REST, transporte falso
│   ├── routes/                Traducción HTTP ↔ cliente (una por dominio)
│   └── test/                  vitest: contratos HTTP, esquemas, config
├── react-dashboard/        Frontend React + Vite
│   └── src/
│       ├── Demo-EVA/           Todo lo que sabe de las dos máquinas de planta
│       │   ├── domain/            Puertas (re-export) hacia shared/eva/ — ver §4.2
│       │   ├── data/               Lectura de red específica de esta instalación
│       │   ├── components/, views/  Presentación
│       │   └── three-d/            Maqueta 3D
│       ├── components/          Kit de UI genérico (no sabe de ICONICS ni de Demo EVA)
│       ├── features/             Módulos verticales (asistente, three-d genérico, data)
│       ├── lib/                  Clientes HTTP e infraestructura de frontend
│       ├── theme/                 Tokens de tema (claro/oscuro/Mitsubishi Electric)
│       └── test/                  vitest: por área, espejo de src/
├── shared/                 Dominio puro que usan LOS DOS programas (§2.6, §2.7)
│   └── eva/                  Las dos instalaciones — ver shared/README.md para el mapa completo
├── scripts/                Verificadores (`verificar-*.mjs`) y sondas contra ICONICS real
└── docs/                   Planes (`PLAN-N-*.md`) y backlogs (`BACKLOG-*.md`)
```

Mapas detallados con el porqué de cada archivo: [`shared/README.md`](shared/README.md)
(dominio), [`backend/README.md`](backend/README.md) (servidor),
[`react-dashboard/src/Demo-EVA/README.md`](react-dashboard/src/Demo-EVA/README.md)
(frontend de planta).

## 4. Convenciones

### 4.1 Cabeceras de archivo

Todo archivo no trivial abre con un comentario que explica **por qué existe y
por qué así**, no qué hace línea a línea — eso ya lo dice el código. Secciones
recurrentes con esta forma:

```js
/**
 * Una frase: qué es este archivo.
 *
 * ── POR QUÉ EXISTE / POR QUÉ ASÍ ────────────────────────────────────
 *
 * El razonamiento, con el incidente o la alternativa descartada si aplica.
 */
```

Al modificar un archivo, si el motivo de la cabecera ya no es cierto, se
corrige la cabecera en el mismo commit. Una cabecera desactualizada es peor
que ninguna.

### 4.2 El patrón "puerta" al mover un archivo

Cuando un archivo se traslada pero algo externo sigue importando la ruta
vieja por conveniencia (p. ej. `react-dashboard/src/Demo-EVA/domain/*.js`
después de que su contenido se movió a `shared/eva/`), la ruta vieja se deja
como una puerta de una línea:

```js
/**
 * [Una frase de qué es.]
 *
 * El contenido vive en [`@shared/eva/X.js`](ruta/relativa); aquí queda la
 * puerta. El motivo del traslado está en `./archivo-hermano.js`.
 */
export * from "@shared/eva/X.js";
```

Nunca se copia el contenido a los dos sitios. Una puerta es una línea; una
copia es una divergencia esperando a pasar.

### 4.3 Separación por capa, no por tipo de archivo

- **Dominio** (`shared/`, `Demo-EVA/domain/` como puerta): reglas de negocio,
  puro, se prueba en Node sin red ni DOM.
- **Transporte/datos** (`Demo-EVA/data/`, `backend/ia/indices/`): sabe hacer
  `fetch` o leer el historiador; no decide reglas de negocio, las importa del
  dominio.
- **Presentación** (`components/`, `views/`): sabe de React y de colores; no
  decide bandas ni umbrales, los pide al dominio ya resueltos.

Una vista que calcula una banda de riesgo con su propio `if` está rompiendo
esta capa — la banda se pide a `shared/eva/`, no se recalcula.

### 4.4 Nomenclatura por máquina

Con dos instalaciones (tanque, vibraciones) más lo transversal, el nombre de
archivo/vista se distingue por **máquina**, no por el nombre de la demo:

- `tanque/` — `InicioTanque`, `PlantaTanque`, `RiesgosTanque`, `ControlesTanque`,
  `MaquetaTanque3D`, `DetalleActivo` (ya es exclusivo del tanque por
  contenido, no necesita el sufijo).
- `vibraciones/` — `InicioVibraciones`, `RiesgosVibracion`, `Vibraciones`,
  `Vibraciones3D`, `ControlesVibraciones`.
- `comunes/` — lo que no pertenece a una sola máquina (el explorador de
  Assets, Alarmas, Cierre de diagnóstico, Documentación, Predicción). Aquí
  "Eva" en el nombre no es ruido porque no hay máquina que distinguir.

El sufijo "Eva" se elimina cuando la carpeta ya dice la máquina; no aporta
información ahí y sólo la repite.

### 4.5 Alias de import

- `@/...` → `react-dashboard/src/...`
- `@shared/...` → `shared/...` (resuelto en Vite y en Node; ver
  `shared/README.md` sobre por qué el backend no importa desde `src/`)

### 4.6 Idioma y honestidad en el texto

Comentarios, mensajes de error y texto de cara al técnico van en español.
Un mensaje de `fallo(...)` dice qué falta y cómo resolverlo (qué llamar antes,
qué variable falta), nunca un genérico "algo salió mal".

## 5. Pruebas — qué existe y cuándo correrlas

Antes de dar una tarea por terminada, corre lo que toque de esta lista.

**Frontend** (`react-dashboard/`):
```bash
npm test              # vitest — dominio, componentes, hooks
npm run design:detect  # impeccable — antipatrones de diseño/CSS
npm run build           # confirma que el bundle sigue compilando
```

**Backend** (`backend/`):
```bash
npm test               # vitest — contratos HTTP (esquemas Zod), config, logger
```

**Verificadores de extremo a extremo** (`scripts/`, sin red real — levantan un
ICONICS y un llama-server falsos):
```bash
node scripts/verificar-backend.mjs          # contrato HTTP completo
node scripts/verificar-herramientas.mjs      # cada herramienta del asistente
node scripts/verificar-chat.mjs               # el bucle de conversación
node scripts/verificar-diagnostico.mjs        # el motor: las 4 fuentes y su puntuación
node scripts/verificar-documentos.mjs          # índice de manuales / BM25
node scripts/verificar-casos.mjs                # índice de casos previos
node scripts/verificar-casos-cierre.mjs          # cierre de diagnóstico (form y chat)
node scripts/verificar-temporal.mjs               # la 4ª fuente (tendencia)
node scripts/verificar-calibracion.mjs             # sensibilidad de umbrales al tamaño de corpus
node scripts/verificar-riesgos.mjs                  # reglas de riesgo del tanque
node scripts/verificar-riesgos-vibracion.mjs         # reglas de riesgo de vibraciones
node scripts/verificar-pronostico.mjs                 # desgaste acumulado
node scripts/verificar-voz.mjs                          # dictado (whisper falso)
node scripts/verificar-manos-libres.mjs                  # ciclo de voz completo
node scripts/verificar-transporte-falso.mjs                # ICONICS_FAKE sirve las dos máquinas
node scripts/verificar-antiguedad-historico.mjs              # edad de la última muestra
```

**Tras compilar el frontend:**
```bash
node scripts/verificar-bundle.mjs   # la pila 3D no viaja en el chunk de arranque
```
> Este verificador está en rojo conocido desde el 28-ago-2026 (161.84 KB sobre
> un techo de 90 KB, medido como preexistente). Ver `docs/BACKLOG-FRONTEND.md`
> F5. No se ignora: se corrige aparte, no se deja fallando en silencio ni se
> sube el techo para callarlo.

**Regla de oro:** un cambio que toca `backend/ia/` corre como mínimo
`verificar-herramientas.mjs` y el verificador específico de lo que tocó
(`verificar-diagnostico.mjs` si tocó el motor, `verificar-documentos.mjs` si
tocó el índice de manuales, etc.). Un cambio en `shared/eva/` corre los
verificadores de ambas instalaciones si el archivo es común a las dos.

## 6. Flujo de trabajo con Claude Code

- **Commit por fase.** Cuando un trabajo se divide en fases (planes
  `docs/PLAN-N-*.md`), cada fase se prueba y se comitea antes de pasar a la
  siguiente — nunca un commit gigante al final.
- **No se hace push sin pedirlo explícitamente en ese turno.** Un commit
  autorizado antes no autoriza el siguiente push.
- **Gaps se documentan, no se ocultan.** Si algo queda bloqueado (falta un
  servidor, falta dato real para calibrar), se anota en el plan y en el
  código (`provisional: true`, comentario con el motivo) en vez de fingir que
  quedó resuelto.
- **Antes de mover o renombrar algo que "parece" un duplicado**, confirma
  leyendo la cabecera — este proyecto usa el patrón puerta (§4.2)
  deliberadamente, y no todo lo que comparte nombre es lo mismo dos veces
  (ver `docs/PLAN-17-CERRAR-AUDITORIA.md`, sección de auditoría de
  duplicados).

## 7. Referencias

- [`README.md`](README.md) — arranque, variables de entorno, orígenes de datos
- [`PRODUCT.md`](PRODUCT.md) — producto, usuarios, posicionamiento
- [`DESIGN.md`](DESIGN.md) — sistema de diseño
- [`shared/README.md`](shared/README.md) — mapa completo del dominio compartido
- [`backend/README.md`](backend/README.md) — variables de entorno del servidor
- [`docs/BACKLOG-BACKEND.md`](docs/BACKLOG-BACKEND.md), [`docs/BACKLOG-FRONTEND.md`](docs/BACKLOG-FRONTEND.md) — deuda conocida y priorizada
- [`docs/PLAN-17-CERRAR-AUDITORIA.md`](docs/PLAN-17-CERRAR-AUDITORIA.md) — última auditoría de arquitectura completa
