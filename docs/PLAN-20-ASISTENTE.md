# Plan 20 — La rama `Asistente`: una sola vista, el mismo motor

> Estado: **plan aprobado, sin ejecutar**. Rama creada desde `Moises6` el
> 03-09-2026. Cada fase se prueba y se comitea antes de pasar a la siguiente
> (CLAUDE.md §6).

## §0 La decisión: rama, no proyecto nuevo

Se evaluó empezar de cero desde un prompt. Se descarta, y el motivo es
medible: lo que hay que **conservar** son 20 000 líneas de las que casi
ninguna se puede regenerar redactando, y lo que hay que **borrar** son hojas
del árbol de dependencias.

| Capa | LOC | Sobrevive |
|---|---:|---|
| `backend/ia/` — motor, índices, 22 herramientas, bucle de chat | 10 306 | íntegro |
| `shared/` — señales, riesgos, causas, umbrales, historia, casos | 8 144 | íntegro |
| `backend/iconics/` — OIDC+PKCE, cliente REST, transporte falso | 1 298 | íntegro salvo el login |
| `backend/routes` + `backend/http` | 2 552 | ~80 % |
| `react-dashboard/src/Demo-EVA/` — vistas, 3D, gráficas | 12 965 | ~5 % |
| `modulos/prediccion` + `features/data` + `features/three-d` | ~2 400 | 0 % |

La dirección de dependencia lo permite: vista → dominio → `shared/`, **nunca
al revés**. Comprobado en este árbol:

- `backend/` no importa una sola línea de `react-dashboard/src/`.
- `shared/eva/comun/sistemas.js` arrastra transitivamente TODO `shared/eva/`
  —tanque y vibraciones, sus estados, sus simuladores— porque es código
  ejecutable y no una lista de nombres (CLAUDE.md §4.7). Así que el dominio
  compartido **no se toca**: se borra el frontend que lo pintaba.

### Lo que un proyecto nuevo perdería y no podría reescribir

1. **Los umbrales del diagnóstico.** `UMBRAL_COSENO_*` / `UMBRAL_BM25_*` de
   `ia/motor/diagnostico.mjs` salieron de `scripts/medir-calibracion.mjs`
   corriendo contra ICONICS real. Un proyecto nuevo los pondría a ojo, que es
   exactamente lo que la separación medir/verificar existe para impedir.
2. **La guarda de `historia_de_senal`.** `CARGA_TRABAJO_MOTOR`,
   `KPIEFICIENCIA_ENERGETICA` e `INDICE_DESVIACION_VOLTAJE` reciben del Data
   Historian la curva de `STEMPERATURA_TANQUE`, con `ok: true`, marcas de
   tiempo correctas y valores plausibles. Un asistente nuevo diría «la carga
   del motor llegó al 41 %» siendo grados centígrados de un tanque, y nadie
   lo notaría.
3. **El flujo OIDC.** Los cinco saltos de `iconics/authenticator.mjs` —CSRF
   oculto en el HTML, `ReturnUrl` con entidades escapadas, cookies repartidas
   entre tres respuestas— son ingeniería inversa sobre ICONICS 11.x, no
   documentación pública.
4. **Las 22 descripciones de `conversacion/definiciones.mjs`**, redactadas y
   corregidas para que un modelo de 4B elija la herramienta correcta.
5. **El historial.** En este proyecto el porqué vive en las cabeceras Y en el
   log de commits. `git blame` sobre un umbral es la única forma de saber qué
   incidente lo puso ahí.

### Cómo se gobierna la divergencia

`Asistente` es una **variante de producto**, no un experimento:

- Un arreglo en `shared/`, `backend/ia/` o `backend/iconics/` se hace en la
  rama donde se detecte y viaja a la otra por `cherry-pick`. Son las tres
  carpetas que las dos ramas comparten sin diferencias.
- `react-dashboard/src/` diverge y **no vuelve**. No se intenta un merge de
  vistas entre ramas.
- Si una corrección de `shared/` no aplica limpia, es señal de que alguien
  metió presentación en el dominio: se arregla eso, no el conflicto.

---

## §1 Qué es la aplicación `Asistente`

Un puente Node hacia ICONICS FrameWorX y **una sola pantalla**: la
conversación. Sin sidebar, sin router de páginas, sin 3D, sin gráficas de
tablero, sin banners de estado.

El técnico entra con **su usuario y contraseña de ICONICS** —no los del
`.env`— y a partir de ahí pregunta. Todo lo que la aplicación sabe hacer se
pide hablando.

### Capacidades exigidas (las siete del encargo)

| # | Capacidad | Dónde vive hoy | Trabajo |
|---|---|---|---|
| 1 | Valor de cualquier señal | `herramientas/maquina/`, `estado_del_sistema` | ninguno |
| 2 | Valores historizados | `herramientas/historicos/` (9 herramientas) | ninguno |
| 3 | RAG de manuales | `ia/indices/{documentos,bm25,embeddings}.mjs` | ninguno |
| 4 | Límites del manual + las 4 fuentes del diagnóstico | `herramientas/lib/limites.mjs`, `ia/motor/diagnostico.mjs` | ninguno |
| 5 | Diagnosticar fallas posibles | `diagnosticar_falla` + `motor/{casos,temporal}.mjs` | ninguno |
| 6 | Intervención | `registrar_intervencion`, `cerrar_diagnostico`, `controlar_bomba` | §4.5 (permisos) |
| 7 | Anexar manuales desde la UI | `ia/indices/manuales.mjs` + `/api/rag/documentos` | §5.5 (cajón «Manuales») |

> **Punto 4, resuelto (03-09-2026).** El encargo decía «las 4 señales con las
> que se realiza el diagnóstico»; **son las 4 FUENTES**, confirmado por el
> autor. Datos en vivo (0–3), manual (0–2), casos previos (0–2 / −1) y
> tendencia temporal. `ia/motor/diagnostico.mjs` no se toca: ni la aritmética
> ni los umbrales.

### §1.1 Cuánto encoge el frontend

**De 22 rutas registradas a 0.** No queda enrutador de páginas: quedan dos
pantallas que se alternan por estado de sesión, y tres cajones dentro de una
de ellas.

| | Hoy | Tras el plan |
|---|---:|---:|
| Rutas en `ROUTES` | 22 | **0** (no hay registro) |
| Pantallas | 22 | **2** (Login, Asistente) |
| Cajones | 0 | **3** (Assets, Manuales, Casos) |
| Entradas de sidebar | 20 en 5 grupos | **0** (no hay sidebar) |
| Archivos `.jsx` de vista | 26 | **2** |
| Archivos de prueba (frontend) | 53 | **17** (§7.4) |

#### Las 22 que se van, una por una

**Estación de llenado (5)** — `eva-inicio`, `eva-planta` (gráficas),
`eva-riesgos`, `eva-controles`, `eva-maqueta` (3D).
**Estación de vibraciones (5)** — `vib-inicio`, `eva-vibraciones`,
`vib-controles`, `eva-riesgos-vibracion`, `vib-3d`.
**General (2)** — `eva-alarmas`, `eva-assets` → *renace como cajón*.
**Predicción (6)** — `pred-inicio`, `pred-eventos`, `pred-variables`,
`pred-historico`, `pred-correlacion`, `pred-pronostico`. Módulo entero: otra
fuente de datos, fuera de alcance.
**RAG (2)** — `rag-casos` → *cajón*, `rag-documentacion` → *cajón*.
**Sin `nav` (2)** — `eva-detalle` (detalle de activo), `cierre-diagnostico`
→ *existe por chat*.

De las 22, **cuatro no se pierden: se encogen a cajón** (§5.5). Las otras 18
desaparecen, y con ellas `Sidebar`, `Topbar`, los dos banners de estado, el
modo muro y todo el motor de sondeo del frontend.

#### Las 2 que quedan

| Pantalla | Origen | Trabajo |
|---|---|---|
| **Login** | no existe hoy | **nueva entera** — F4 |
| **Asistente** | `features/asistente/components/Asistente.jsx` (1 266 líneas) | **transformación**: de botón flotante + panel de esquina a la aplicación — F5 |

El asistente no se reescribe. Hoy ya es un panel completo con su modo
maximizado; F5 lo promueve a pantalla y le cuelga los tres cajones. Lo que se
conserva de su diseño está en §6 F5, y no es negociable: el trazo derivado de
los caracteres que llegan, los estados dichos con palabras, el contador de
segundos, la cancelación y las citas de origen bajo cada respuesta.

### §1.2 Con qué capacidades queda el asistente

**Las 22 herramientas, íntegras.** Ninguna se retira: son la capacidad que
esta rama destila. Agrupadas por familia (`backend/ia/herramientas/`):

| Familia | Herramientas | Qué contesta |
|---|---|---|
| **registro** (1) | `sistemas_de_la_planta` | qué máquinas hay y qué limita a cada una |
| **maquina** (3) | `estado_del_sistema`, `riesgos_activos`, `controlar_bomba` | el instante — y la única que **escribe** |
| **historicos** (9) | `historia_de_senal`, `valor_en_momento`, `comparar_periodos`, `analisis_de_senal`, `perfil_de_senal`, `correlacionar_senales`, `grafico_de_senal`, `pronostico_de_desgaste`, `generar_reporte` | todo lo que pregunta al pasado |
| **documentacion** (3) | `consultar_documentacion`, `limites_del_manual`, `diagnostico` | los manuales, y el cruce de lo medido con lo documentado |
| **diagnostico** (2) | `diagnosticar_falla`, `cerrar_diagnostico` | las causas ordenadas por las 4 fuentes, y su corrección |
| **aprendizaje** (4) | `hechos_de_la_planta`, `recordar_hecho`, `registrar_intervencion`, `proponer_regla` | lo que alguien verificó, y lo que se aprende sobre la marcha |

Mapeadas contra el encargo: capacidad 1 → `estado_del_sistema`; 2 → las nueve
de históricos; 3 → `consultar_documentacion`; 4 → `limites_del_manual` +
`diagnostico`; 5 → `diagnosticar_falla`; 6 → `registrar_intervencion` +
`cerrar_diagnostico` + `controlar_bomba`; 7 → cajón «Manuales».

Más lo que no es herramienta y también se conserva: **dictado y manos libres**,
**exportar la conversación a PDF**, **adjuntar texto plano** a una pregunta, la
**persistencia del hilo** entre recargas, y la **cola** con su aviso de cuántos
hay delante.

> **Corrección de cabecera pendiente (CLAUDE.md §4.1).** La cabecera de
> `ia/conversacion/herramientas.mjs` dice «las diecinueve implementaciones» y
> lista **cinco** familias. Son **22 en seis**: falta `diagnostico/`, que tiene
> su propio `index.mjs`. La cabecera se quedó atrás cuando esa familia se
> separó. Se corrige en la F1, que es cuando se toca ese archivo por la
> sesión — no antes y no en un commit suelto.

### El criterio de corte

Una sola frase decide qué se borra y qué se queda, y no es «cuántas vistas
hay»:

> **Lo que ALIMENTA al asistente se queda. Lo que sólo lo PINTA, se va.**

Minimizar no es quitar capacidad: es quitar superficie. Una pantalla que
dibuja el nivel del tanque en 3D no le enseña nada al asistente — el dato ya
lo lee él por `estado_del_sistema`. Una pantalla desde la que se sube un
manual, se poda un caso basura o se corrige un diagnóstico **sí**: cambia lo
que el asistente sabrá mañana. La primera se borra sin discusión; la segunda
se conserva, y si estorba como página se convierte en un cajón del chat.

De ahí salen las cuatro fuentes de conocimiento que hay que preservar enteras,
con su vía de entrada:

| Fuente del asistente | Cómo se alimenta | Dónde vive tras el plan |
|---|---|---|
| Manuales (RAG documental) | subir / reemplazar / archivar PDF | **cajón «Manuales»** (§5.5) |
| Casos previos (Fuente #3) | chat, voz, cierre de diagnóstico | se llena sola; se **poda** en el **cajón «Casos»** (§5.5) |
| Hechos y bitácora | `recordar_hecho`, `registrar_intervencion` por chat | el propio chat |
| Propuestas de regla | `proponer_regla` por chat | consola, por decisión (§5.6) |

### Capacidades conservadas por decisión explícita

- **Cajón de Assets.** El árbol de AssetWorX no es una vista aparte: es un
  cajón lateral de la única pantalla. Sigue habiendo una vista. El técnico
  navega el árbol, ve el valor y la calidad en crudo, y puede mandar un punto
  al chat como contexto de su pregunta.
- **Cajón de Manuales y cajón de Casos** — las dos fuentes de conocimiento que
  una persona administra a mano (§5.5).
- **Voz: dictado y manos libres.** Es la capacidad que distingue esto de un
  chat cualquiera — el técnico está delante del equipo con las manos ocupadas.
- **Reporte PDF de la conversación.**
- **Escritura sobre la planta** (`controlar_bomba`), con las condiciones de
  §4.5.

---

## §2 Invariantes

Se heredan **todas** las de CLAUDE.md §2, con dos cambios declarados.

**Se mantienen sin discusión:** ICONICS como única fuente de dato de planta
(§2.1); sin base de datos (§2.2); **el código puntúa, el modelo redacta**
(§2.3); la ausencia de dato nunca se disfraza de cero (§2.4); no se inventa lo
que falta (§2.5); el dominio no se duplica (§2.6); `shared/` es dominio puro
(§2.7); `ICONICS_FAKE=true` nunca en producción (§2.8); sin comodín en CORS
(§2.9); la agrupación en 4 activos es nuestra (§2.10).

**Cambia §2.11 — la autenticación deja de ser un decorador vacío.** Este plan
ES el plan que esa regla exigía. Con él, `AUTH_HABILITADA` deja de existir
como interruptor: en esta rama la sesión es obligatoria, porque sin
credenciales de una persona no hay token con el que leer ICONICS.

**Se retira §4.7 (módulo vs sistema) por vacío.** El único módulo que no era
de ICONICS —Predicción— se borra en esta rama. La distinción no se elimina de
`shared/modulos.js` como concepto, pero queda con un solo módulo; si vuelve un
segundo, vuelve la regla entera.

**Invariante nueva, propia de esta rama:**

> **§2.12 — Una sola vista.** No se añade una ruta de página. Lo que haya que
> enseñar se enseña dentro del chat o en un cajón del chat. Un `router` con
> dos entradas es el primer paso para volver a tener nueve, y este proyecto ya
> hizo ese camino una vez (ver la cabecera de `app/routes/routes.jsx` sobre
> `SOLO_DEMO_EVA`).

---

## §3 Arquitectura destino

```
.
├── backend/
│   ├── http/plugins/
│   │   ├── autenticacion.mjs   REESCRITO — sesión de persona (§4)
│   │   ├── cuerpoCrudo.mjs     igual
│   │   ├── errores.mjs         igual
│   │   └── seguridad.mjs       + cookie, + límite duro en /api/sesion
│   ├── ia/                     ÍNTEGRO. No se toca una línea.
│   ├── iconics/
│   │   ├── authenticator.mjs   + login con credenciales de argumento (§4.2)
│   │   ├── client.mjs          igual (menos alarmas)
│   │   ├── fakeClient.mjs      igual
│   │   └── validation.mjs      igual
│   ├── sesiones/               NUEVO — el registro de sesiones (§4.3)
│   │   └── registro.mjs
│   ├── routes/
│   │   ├── sesionRoutes.mjs    NUEVO — login, logout, quién soy
│   │   ├── chatRoutes.mjs      + guarda de sesión
│   │   ├── iconicsRoutes.mjs   + guarda; se borran alarms/*
│   │   ├── ragRoutes.mjs       + guarda
│   │   ├── casosRoutes.mjs     + guarda
│   │   ├── controlRoutes.mjs   + guarda (§4.5)
│   │   ├── diagnosticoRoutes / reportesRoutes / vozRoutes   + guarda
│   │   └── systemRoutes.mjs    readiness redefinida (§4.6)
│   └── app.mjs                 el grafo pasa a ser por sesión (§4.3)
│
├── react-dashboard/src/
│   ├── main.jsx                igual
│   ├── app/
│   │   ├── App.jsx             REESCRITO — Login | Asistente. Sin router.
│   │   ├── ErrorBoundary.jsx   igual
│   │   └── providers/          igual (Modal, Toast)
│   ├── auth/                   NUEVO
│   │   ├── SesionProvider.jsx
│   │   └── Login.jsx
│   ├── features/asistente/     el corazón; + los tres cajones (§5.5)
│   ├── components/
│   │   ├── ui/                 igual (Button, Input, Panel, AlertBanner, Tabs…)
│   │   └── assets/ExploradorAssets.jsx   conservado, montado en el cajón
│   ├── lib/
│   │   ├── api/                apiBase, ragApi, casosApi + credenciales
│   │   ├── iconics/            SOLO apiClient + index (browse/points/data)
│   │   └── format.js, formato.js, motion.js, queryClient.js, viewport.js
│   └── theme/                  igual
│
└── shared/                     ÍNTEGRO. No se toca una línea.
```

---

## §4 El login nativo — el 80 % del riesgo de este plan

### §4.1 El problema

`app.mjs` construye **una vez, al arrancar**:

```
createAuthenticator(config) → createIconicsClient(config, auth)
                            → createHerramientas({client, …})
                            → createChat({config, herramientas})
```

Toda esa cadena está cerrada sobre `ICONICS_USERNAME`/`ICONICS_PASSWORD` del
entorno: es **una identidad de máquina**. Mover las credenciales a la UI la
convierte en una cadena **por persona**, y ése es el cambio estructural.

A favor: las factorías ya existen y ya reciben sus dependencias por argumento.
No hay que rediseñar nada — hay que construirlas más tarde y más de una vez.

### §4.2 `authenticator.mjs` — el cambio mínimo

Hoy `performInteractiveLogin(config, timeoutMs)` saca `username`/`password` de
`config.iconics`. Pasa a recibirlos:

```js
createAuthenticator(config, credenciales)  // { usuario, contrasena }
```

`config.iconics.username/password` dejan de leerse en el camino normal. **Se
conservan en `config.mjs`** con un solo uso: `ICONICS_FAKE=true` y los
verificadores, que necesitan una identidad sin humano delante.

Se añade una función exportada aparte:

```js
export async function probarCredenciales(config, { usuario, contrasena })
```

Es `performInteractiveLogin` sin guardar estado: devuelve los tokens o lanza.
Es lo que usa `POST /api/sesion` para no crear una sesión con credenciales que
ICONICS va a rechazar en la primera lectura.

**Qué NO cambia:** el `pendingAuthentication` compartido (varias peticiones en
frío del mismo usuario siguen esperando al mismo login), el refresco con
`refresh_token`, el timeout por salto, y que un fallo de auth devuelva
cabeceras vacías para que ICONICS conteste 401 en vez de un 502 del puente.

**La cabecera del archivo se reescribe en el mismo commit** (CLAUDE.md §4.1):
hoy dice «es una sesión de máquina, no de persona», y a partir de aquí es
exactamente lo contrario.

### §4.3 `sesiones/registro.mjs` — qué es por sesión y qué no

Ésta es la decisión de diseño del plan, y hay que acertarla.

**Por sesión** (dependen de quién pregunta, porque leen ICONICS con su token):
`authenticator`, `client`, `herramientas`, `chat`, los ayudantes de historia.

**Singleton del proceso** (no dependen del usuario, y duplicarlos sería un
despilfarro grave):

- `indiceDocumentos` — trocear y embeber los PDF cuesta segundos; hacerlo por
  usuario multiplicaría ese coste por cada persona conectada, y todas leen los
  mismos manuales.
- `gestorManuales`, `indiceCasos`, `motorDiagnostico`, `evaluadorTemporal`.
- `cola` — el turno del modelo es **del servidor**, no del usuario. Con un
  `llama-server` sirviendo un modelo, dos personas preguntando a la vez se
  encolan igual que hoy lo hacen dos pantallas. La cola ya sabe decir cuántos
  hay delante; ahora ese número significa algo de verdad.
- `voz` — habla con whisper-server, no con ICONICS.

> **La trampa que esto evita.** `motorDiagnostico` recibe hoy
> `evaluadorTemporal`, que envuelve un `leerSerie` construido sobre `client`.
> Si `client` pasa a ser por sesión y el motor sigue siendo singleton, el
> motor se queda leyendo el historiador con el token de **la primera persona
> que entró**, para siempre, sin ningún síntoma visible. La forma de que eso
> no pueda pasar: `createMotorDiagnostico` deja de recibir el evaluador
> construido y pasa a recibirlo **en la llamada**
> (`diagnosticar(riesgoId, { temporal })`), con el evaluador de la sesión que
> pregunta. Es el único cambio que este plan hace dentro de `ia/motor/`, y es
> de firma, no de aritmética.

Forma del registro:

```js
crearRegistroDeSesiones({ config, singletons })
  crear({ usuario, contrasena, tokens })  → { id, expiraEn }
  resolver(id)                            → { usuario, chat, herramientas, client } | null
  cerrar(id)
```

- `id`: 32 bytes de `crypto.randomBytes`, en cookie `httpOnly`,
  `SameSite=Strict`, `Secure` cuando `config.isProduction`, `Path=/`.
- **La contraseña se guarda en memoria del proceso** y sólo ahí: hace falta
  para el login completo cuando el `refresh_token` caduca o el servidor lo
  rechaza. No se escribe a disco, no viaja en ninguna respuesta, y
  `logger.mjs` amplía su lista de redacción para incluir `contrasena`,
  `password` y `Password` junto a los tokens que ya redacta. **Se declara como
  hueco conocido en §8.**
- Expiración por inactividad (`SESION_TTL_MINUTOS`, por defecto 60) con
  barrido periódico. Cerrar una sesión libera su `client` y su `chat`; los
  índices no se tocan.
- Tope de sesiones vivas (`SESION_MAX`, por defecto 32) para que el registro
  no sea un vector de agotamiento de memoria.

### §4.4 Las rutas

```
POST   /api/sesion     { usuario, contrasena } → 200 + cookie | 401 | 429
DELETE /api/sesion     cierra y borra la cookie
GET    /api/sesion     quién soy, o 401 (lo que consulta el frontend al cargar)
```

Todas las demás rutas de `/api/` declaran `onRequest: [fastify.autenticar]`
salvo `/api/health*` y `POST /api/sesion`. La lista queda escrita en una sola
lectura de `app.mjs`, que es justo lo que la cabecera del plugin decía que
había que conseguir.

`fastify.autenticar` deja de rellenar un usuario anónimo: resuelve la cookie
contra el registro, pone `request.sesion` y responde **401 con
`{ ok:false, motivo:'sesion' }`** si no hay. El frontend distingue ese motivo
y vuelve al login sin perder la conversación en curso (§6 F4).

Con `ICONICS_FAKE=true`, `POST /api/sesion` acepta cualquier credencial no
vacía y crea una sesión sobre el cliente falso. Sin esto no se puede
desarrollar ni probar sin red a planta, que es la mitad del valor del
transporte falso.

### §4.5 Escritura sobre la planta, ahora que hay personas

`controlar_bomba` y `/api/iconics/write` accionan de verdad. Con login nativo
hay **dos puertas, y la segunda es nueva y mejor**:

1. `ICONICS_READ_ONLY` — puerta del servidor, como hoy. Se mantiene.
2. **El token es el de la persona.** La escritura sale con las credenciales de
   quien la pidió, así que **ICONICS aplica sus propios permisos**. Un técnico
   sin permiso de escritura recibe un 403 del servidor de planta, no del
   puente. Esto es estrictamente más seguro que hoy, donde todo el mundo
   escribía con la identidad de máquina del `.env`.

No se inventa un sistema de roles propio: `fastify.exigirRol` se conserva sin
uso, con su cabecera actualizada explicando que la autorización de escritura
la resuelve ICONICS y que un rol local sería una segunda verdad que se
desincroniza de la primera.

Toda escritura se registra en el log con `usuario`, punto y valor. Hasta ahora
no había a quién apuntar.

### §4.6 `/api/health` deja de mentir

Hoy `readiness` llama a `authenticator.hasValidToken()` sobre el autenticador
único. Sin identidad de máquina eso no existe. La ruta pasa a devolver:

```
iconicsReachable   client.ping() con un cliente SIN token (sólo alcanzabilidad)
sesionesActivas    cuántas hay
tokenValid         ELIMINADO  ← no hay un token, hay N
```

Se anota en la cabecera de `systemRoutes.mjs` que el campo desapareció y por
qué, porque hay guiones que lo leen.

---

## §5 Inventario de borrado

Lo que sigue se borra **entero**. Nada se deja «por si acaso»: el árbol
completo vive en `Moises6`, a un `git checkout` de distancia, y ésa es la
razón de que esto sea una rama.

### §5.1 Frontend — vistas y presentación de planta

```
src/Demo-EVA/three-d/                       todo (10 modelos + 3 libs)
src/Demo-EVA/views/tanque/                  6 vistas
src/Demo-EVA/views/vibraciones/             5 vistas
src/Demo-EVA/views/comunes/AlarmasEva.jsx
src/Demo-EVA/views/comunes/CasosRag.jsx          → §5.3
src/Demo-EVA/views/comunes/DocumentacionRag.jsx  → §5.3
src/Demo-EVA/views/comunes/CierreDiagnostico.jsx → §5.3
src/Demo-EVA/views/comunes/AssetsEva.jsx         → §5.3
src/Demo-EVA/components/                    detalle/, tiles.jsx, riesgoVibracion.jsx, paleta.js
                                            base.jsx PARCIAL — ver el aviso de abajo
src/Demo-EVA/data/                          todo (EvaProvider, hooks, transportes, simuladores, historia)
src/Demo-EVA/domain/                        todo — son PUERTAS a shared/ (CLAUDE.md §4.2);
                                            el backend importa shared/ directo, así que
                                            borrar la puerta no borra el dominio
src/Demo-EVA/lib/                           todo salvo formato.js (se mueve a src/lib/)
src/features/three-d/                       todo
src/features/data/                          todo (ya estaba huérfano, sin importadores)
src/modulos/prediccion/                     todo (otra fuente de datos, fuera de alcance)
src/components/charts/                      todo
src/app/layout/                             todo (Sidebar, Topbar, los dos banners)
src/app/routes/                             todo (routes, buildNav, useNavegacion)
src/app/modoMuro.js
src/lib/iconics/{pollingEngine,transporteSimulado,caos,useIconicsPoint,useAlarmCount}.js
src/lib/datasource/                         todo (el selector real/simulado del tablero)
```

> **`base.jsx` no se borra entero, y descubrirlo tarde costaría un build
> roto.** Exporta dos cosas de naturaleza distinta: piezas de tablero
> (`Card`, `Spark`, `Delta`, `Cifra`, `PuntoEstado`, `UltimaLectura`), que
> mueren con las vistas; y **tokens tipográficos** (`MONO`, `SANS`, `ESCALA`)
> de los que depende `components/ui/Panel.jsx`, que **sí se conserva** — y
> también los tres cajones y el propio `Asistente.jsx`, que hoy redeclara
> `MONO`/`SANS` por su cuenta. Los tokens se mudan a `src/theme/tipografia.js`
> y el duplicado del asistente se elimina en el mismo commit: es exactamente
> el caso que CLAUDE.md §2.6 prohíbe, y hoy ya estaba duplicado.

### §5.2 Backend

```
backend/routes/iconicsRoutes.mjs   → se borran /api/iconics/alarms y /alarms/acknowledge
backend/iconics/client.mjs         → se borran readAlarmHistory y acknowledgeAlarms
```

Nada más. `ia/`, `motor/`, `indices/`, `herramientas/` quedan intactos: son la
capacidad que esta rama existe para destilar.

> **Por qué las alarmas sí y `pronostico_de_desgaste` no.** El historial de
> alarmas era una vista y sólo una vista; ninguna herramienta del asistente lo
> consulta. El pronóstico, en cambio, es una herramienta que el modelo puede
> invocar — vive en `shared/eva/comun/pronostico.js` y se queda.

### §5.3 Lo que no se borra: se absorbe en el chat

Cuatro vistas desaparecen como páginas y **su función se conserva** dentro de
la única pantalla:

| Vista que muere | Dónde reaparece |
|---|---|
| `AssetsEva` + `ExploradorAssets` | cajón lateral del chat, botón «Assets». Un punto seleccionado se manda al chat como contexto |
| `DocumentacionRag` | cajón «Manuales»: listar, **subir**, reemplazar, archivar. Es la capacidad 7 del encargo |
| `CasosRag` | cajón «Casos»: revisar, filtrar y **archivar** la bitácora que respalda los diagnósticos |
| `CierreDiagnostico` | ya existe por chat: `cerrar_diagnostico`. El formulario se pierde; `verificar-casos-cierre.mjs` cubre las dos vías y sigue pasando por la de chat |

### §5.5 Los tres cajones

No son tres pantallas disfrazadas. Es una sola vista con un panel lateral que
enseña **de dónde sale lo que el asistente sabe**, y desde el que se puede
cambiar. Se abren desde la barra del chat, se cierran con Escape, y ninguno
tiene URL propia — §2.12 sigue en pie.

**1 · Assets** (`ExploradorAssets`, conservado tal cual). El árbol de
AssetWorX con browse perezoso y las propiedades del nodo en vivo. Es la
herramienta con la que se diagnostica «falta un dato en el panel». Añadido:
seleccionar un punto lo manda al chat como contexto de la siguiente pregunta.

**2 · Manuales** (de `DocumentacionRag`). Listar, **subir**, reemplazar y
archivar los PDF que alimentan el índice documental. Es la capacidad 7 del
encargo y el único camino por el que entra conocimiento externo.

**3 · Casos** (de `CasosRag`). La bitácora de intervenciones: filtrar por
activos/archivados/todos, buscar y **archivar**.

> **Por qué el tercer cajón no es opcional.** Un caso basura no es inocuo:
> `buscarCasosSimilares` lo recupera y `respaldoDeCasos` lo cuenta como
> respaldo de una causa, así que un «La bomba falla / Por investigarse» escrito
> en una prueba **sube la banda de un diagnóstico real**. La auditoría del
> 01-09-2026 midió 2 de 5 registros así. Y es la única de las cuatro fuentes
> que **se llena sola** —por chat, por voz, al cerrar un diagnóstico—, o sea la
> única que puede degradarse sin que nadie haga nada. Un manual malo lo subió
> alguien; un caso basura aparece solo.
>
> Dos invariantes que el cajón hereda de la vista y no puede perder al
> encogerse:
>
> - **Archivar, no borrar.** Un caso archivado deja de alimentar el
>   diagnóstico —el índice no lo mira— pero su texto, su fecha y su resultado
>   siguen intactos, y devolverlo es un clic. Ver «ARCHIVAR: LA ÚNICA BAJA QUE
>   EXISTE» en `shared/eva/comun/aprendizaje.js`.
> - **`resuelto` y `diagnosticoCorrecto` se pintan distinto.** El primero dice
>   si la avería se arregló; el segundo, si la causa que propuso el sistema era
>   la buena. Un caso resuelto con el diagnóstico equivocado es el más valioso
>   de la bitácora, y fundirlos en un semáforo borraría la única señal que mide
>   si el motor acierta.

Backend: los tres cajones ya tienen sus rutas y **no hace falta ninguna
nueva** — `/api/iconics/{browse,points,data}`, `/api/rag/documentos`
(GET/POST/PUT/PATCH) y `/api/casos` (GET/PATCH). Sólo ganan la guarda de
sesión de §4.4.

### §5.6 La cuarta vía: `proponer_regla`

El asistente puede **proponer reglas de riesgo** nuevas: mira semanas de
datos, ve un patrón y lo deja redactado con su evidencia. Hoy esas propuestas
sólo se leen con `scripts/revisar-propuestas.mjs`, desde consola. Por el
criterio de §1 sería candidata a cuarto cajón.

**Se queda en consola, y no por ahorrar trabajo.** Aprobar una propuesta **no
la convierte en regla**: quien la aprueba tiene que escribirla a mano en
`shared/eva/tanque/riesgos.js` y añadir su prueba en
`scripts/verificar-riesgos.mjs`. Un cajón no puede cerrar ese bucle, así que
ofrecería un botón «Aprobar» que no aprueba nada — la clase de promesa falsa
que CLAUDE.md §2.5 prohíbe. Y hay una razón medida detrás del paso manual:
contra este mismo servidor, el modelo local dijo tres veces seguidas
«velocidad eficaz 1,13 mm/s» leyendo la **aceleración**, con total aplomo.
Quien confunde un campo no firma el criterio con el que se para una bomba.

Queda anotado como decisión, no como olvido. Si algún día la aprobación puede
generar la regla y su prueba, entonces sí gana un cajón.

### §5.7 Dependencias que caen

Frontend: `three`, `@react-three/fiber`, `@react-three/drei`, `recharts`,
`xlsx`. Se conservan `react`, `react-dom`, `lucide-react`, `marked`,
`dompurify` (el markdown del chat) y `@tanstack/react-query` (las tres
consultas del explorador de Assets). De `lib/api/` se conservan los tres
clientes —`apiBase`, `ragApi` (cajón Manuales) y `casosApi` (cajón Casos)—:
ninguno era del tablero, los tres son del asistente.

Backend: ninguna cae. `pdfjs-dist` lee los manuales, `pdfkit` +
`svg-to-pdfkit` generan el reporte.

Efecto esperado en el bundle: `vendor` va hoy a 203 KB de un techo de 210, con
7 KB de margen (CLAUDE.md §5). Quitando `three` y `recharts` debería bajar del
orden de dos tercios. `scripts/verificar-bundle.mjs` **no se borra: se le
bajan los techos** a lo que mida de verdad tras la F6, y esa medición es la
prueba de que la pila 3D se fue.

---

## §6 Fases

Cada fase termina en commit con sus pruebas en verde.

### F1 · La sesión en el backend (sin tocar el frontend) — **HECHA**

> Ejecutada el 03-09-2026. Backend: **185 pruebas** (antes 157) en 12 archivos,
> y los **19 verificadores en verde**. Tres cosas salieron distintas de lo
> planeado y quedan anotadas abajo, en «Lo que la F1 enseñó».

`authenticator.mjs` acepta credenciales por argumento y exporta
`probarCredenciales`. Nace `sesiones/registro.mjs`. `app.mjs` separa
singletons de por-sesión y construye el grafo perezoso. `autenticacion.mjs` se
reescribe. Nace `sesionRoutes.mjs`. Todas las rutas declaran su guarda.
`motorDiagnostico` recibe el evaluador temporal en la llamada.
**Verde:** `backend: npm test` (con `test/ayudas.mjs` creando sesión),
`verificar-backend.mjs`, `verificar-herramientas.mjs`, `verificar-chat.mjs`,
**nuevo** `verificar-sesion.mjs`.

#### Lo que la F1 enseñó

1. **`verificar-backend.mjs` ya tenía un ICONICS falso con OIDC completo.** Su
   servidor de mentira implementa los cinco saltos —autorización con PKCE,
   página de login con CSRF, credenciales, segunda autorización, canje—. Al
   hacer que el guion entre con `u`/`p`, ese login pasa a recorrer
   `performInteractiveLogin` **entero**: es ahora la única cobertura
   automática del flujo OIDC, que antes sólo se ejercía contra planta real.
2. **Una comprobación cambió de significado, y se reescribió en vez de
   borrarse.** «20 peticiones concurrentes en frío → un solo flujo OIDC» ya no
   existe: el login ocurre al abrir sesión, no en la primera lectura. En su
   lugar mide lo que ahora sí es caro equivocar — que **entrar cueste un flujo
   y no dos**, que es la garantía del reaprovechamiento de `tokensIniciales`.
   Sin esa prueba, quitarlo no rompería nada: sólo doblaría el coste de cada
   login, en silencio.
3. **El fallo de «sin `ICONICS_API_BASE`» se adelantó al login, y es mejor
   así.** Antes se pedía una ruta de datos y se exigía un 500 limpio. Ahora no
   se puede ni entrar: el puente lo dice donde el técnico está mirando. La
   comprobación conserva la propiedad que la motivó —que **no se cuelga**— con
   un corte de tiempo explícito.

Dos mejoras de calidad no planeadas, hechas porque el cambio las puso a la
vista:

- **Desapareció una construcción duplicada.** `app.mjs` montaba unos ayudantes
  de historia sueltos para el evaluador temporal, además de los que
  `createHerramientas` monta por dentro. Su comentario lo admitía («construirla
  dos veces no duplica nada que importe»). Con el cliente por sesión eso habría
  pasado de inocuo a **fallo**: dos clientes distintos. Ahora los dos salen del
  mismo `client` por construcción.
- **La lista de campos redactados del log estaba copiada en su prueba.** Una
  copia no guarda nada: quitar un campo del logger real habría dejado la prueba
  en verde redactando su propia lista. Ahora se importa `CAMPOS_SECRETOS`.

### F2 · Readiness, log y escritura con nombre — **ADELANTADA EN LA F1**

Se hizo junto con la F1 porque su contenido es inseparable de lo que ésta
tocaba: `/api/health` no podía quedar publicando un `tokenValid` que ya no
existe, y la contraseña no podía pasar ni un commit sin redactar. Lo entregado:
readiness sin `tokenValid` y con `sesionesActivas`; `contrasena` y `set-cookie`
añadidos a la redacción del log, con sus tres pruebas; `exigirRol` conservado
sin uso y con la cabecera corregida.

### F2 (original) · Readiness, log y escritura con nombre
`/api/health` sin `tokenValid`. `logger.mjs` redacta contraseñas. Las
escrituras registran `usuario`. `exigirRol` documentado sin uso.
**Verde:** `logger.test.mjs`, `rutas/seguridad.test.mjs`,
`verificar-backend.mjs`.

### F3 · Borrado del frontend — **HECHA**

> Ejecutada el 04-09-2026. Frontend: **17 archivos / 172 pruebas** en verde,
> `npm run build` compilando, `verificar-bundle` en verde con techos nuevos y
> medidos. Backend intacto: 185 pruebas y sus verificadores siguen pasando, que
> es lo que demuestra que el borrado no tocó el motor.
>
> **Medición del bundle:** `index` 88.87 KB (era 92.21) y **`vendor` 109.53 KB,
> que venía de 203.26** — cayó el 46 % al salir `three`, `recharts` y `xlsx`.
>
> #### Lo que la F3 corrigió del propio plan
>
> 1. **Cuatro de las «8 pruebas a mover» no eran de dominio.** `simulador`,
>    `simulador-vibraciones`, `estado-dato` e `historia` probaban código de
>    `Demo-EVA/data/` —transportes simulados del frontend, presentación de
>    frescura, lectura de red del historiador—, no `shared/`. Se borran con las
>    vistas. **Sobreviven cuatro, no ocho**, y esas cuatro sí prueban `shared/`
>    y siguen en verde con la carpeta `Demo-EVA/` entera borrada, que es el
>    resultado que valida §0.
> 2. **La suite queda en 17 archivos, no 26.** La aritmética del plan
>    (53 − 33 + 6) contaba altas de las Fases 4 y 5, que todavía no existen.
> 3. **Los cajones se mudaron ANTES de borrar**, no en la F5. Sus dos pruebas
>    montaban el componente, no una ruta, así que el traslado no tocó una sola
>    aserción — y así ninguna quedó sin sujeto entre fases.
>
> #### Código muerto que el borrado destapó, y que no estaba en el plan
>
> - **`vite.config.js` y `verificar-bundle.mjs` giraban enteros alrededor de la
>   pila 3D.** Una lista de veinte paquetes, un `esDe3D()`, tres reglas de
>   reparto y dos comprobaciones de «está diferido». Sin `three` instalado, eso
>   era el mapa de un edificio demolido. El verificador cambia de pregunta:
>   ya no es «¿está diferido?» sino **«¿ha vuelto?»**, que es una guarda más
>   fuerte, y los techos bajan de 170/210 a 102/126 — dejarlos habría permitido
>   duplicar la aplicación entera sin que protestara.
> - **`Tabs`, `Avatar`, `HoverTip`, `motion.js`, `viewport.js`, `format.js`**:
>   cero consumidores tras el borrado. Un barril `export *` los mantenía
>   nombrables, así que no eran código muerto inerte sino una invitación a
>   construir con piezas que nadie mantiene ni prueba.
> - **La prop `bare` de `Panel`**, cuyo único consumidor era la `Card` del
>   tablero. Una rama muerta dentro de la primitiva más usada de la aplicación
>   es una bifurcación que hay que leer y descartar cada vez que alguien abre
>   el archivo.
> - **El barril `lib/iconics/index.js` pasó de once exportaciones a cuatro.**
>   Lo consume un solo archivo: el explorador de Assets. Es la medida de cuánta
>   red hacía el tablero y cuánta hace un asistente.
>
> #### Dos hallazgos sobre las propias guardas
>
> - **`design:detect` da tres avisos y los tres son falsos positivos.** Dos
>   `broken-image` que señalan un `<img>` de EJEMPLO dentro de una cabecera, no
>   el real (que tiene `src` y `alt`); y un `codex-grid-background` sobre la
>   retícula del osciloscopio, que es justo la excepción que la propia regla
>   nombra —«reserve grid overlays for actual measurement surfaces»— y que la
>   F5 tiene orden de preservar. Se revisa de nuevo en la F5, sin cambiar nada
>   por ahora.
> - **La guarda de §2.12 hubo que enseñarla a ignorar comentarios.** Acusaba a
>   `App.jsx` por explicar que ya no hay `lazy()`, y a `lib/motion.js` por
>   mencionar de dónde venía un helper. En un proyecto que documenta a fondo lo
>   que se fue, una guarda que busca sobre el texto crudo acusa precisamente a
>   las cabeceras que cuentan que eso se fue.

### F3 (original) · Borrado del frontend
Todo §5.1 de una vez. `App.jsx` queda montando `<Asistente />` sin router. Se
retiran las cinco dependencias. Se borran las pruebas de §7.4.
**Verde:** `npm run build` compila; `npm test` pasa con lo que queda.

### F4 · Login en la UI — **HECHA**

> Ejecutada el 04-09-2026. Frontend: **19 archivos / 179 pruebas** en verde.
>
> #### La decisión de fondo: una sola puerta a la API
>
> Había **diecisiete `fetch` repartidos en cinco archivos**, y la sesión añade
> dos obligaciones a cada uno: mandar la cookie e interpretar el 401. Hacerlo
> sitio por sitio eran diecisiete oportunidades de olvidarlo, y el olvido no da
> un fallo ruidoso — da una pantalla que no carga y un error genérico donde
> debería haber un formulario de login.
>
> Nace `lib/api/pedir.js` y **hoy no queda un solo `fetch` fuera de él**. Trajo
> tres cosas que no estaban en el plan:
>
> - **Un defecto latente reparado de paso.** `Asistente.jsx` pedía
>   `fetch("/api/chat/exportar")` **sin `API_BASE`**: era la única llamada de la
>   aplicación que escribía la ruta a pelo. Con `VITE_API_BASE` apuntando a otro
>   backend, exportar seguía hablando con el origen de la página. No daba error;
>   daba un PDF del servidor equivocado.
> - **`parseResponse` estaba copiado literal** en `casosApi.js` y `ragApi.js`.
>   La capa que interpreta errores de la API no puede estar en dos sitios: con
>   la sesión de por medio habría además dos lugares donde acertar a distinguir
>   un 401 de caducidad de uno de permisos.
> - **`credentials: "include"` no es opcional.** En planta la API es del mismo
>   origen y el defecto bastaría; con `VITE_API_BASE` apuntando fuera, la
>   petición pasa a ser cruzada y el defecto omite la cookie — el login
>   funcionaría y la pantalla siguiente daría 401.
>
> #### La distinción que sostiene todo
>
> **Sólo un 401 con `motivo: "sesion"` expulsa.** El 401 que devuelve ICONICS
> cuando alguien pide un punto sobre el que no tiene permiso NO puede cerrar la
> sesión: sería perder una conversación de minuto y medio por consultar un dato
> prohibido. Los dos extremos del cable están probados —que se distinga, en
> `apiClient.test.js`; que el aviso se recoja, en `sesion-caducada.test.jsx`—.
>
> #### Caducar y salir son dos caminos, no uno
>
> - **Caducar** devuelve al login y **conserva la conversación**. Es lo normal
>   en planta: preguntar, ir a mirar la máquina, volver.
> - **Salir** la borra. En un equipo compartido, quien pulsa «Salir» no espera
>   que el siguiente turno lea lo que preguntó.
>
> #### Código muerto que la fase destapó
>
> `apiClient.js` exportaba **diez funciones y sólo tres tenían consumidor**. Las
> otras siete —historia, historia en lote, escritura, escritura en lote,
> alarmas, reconocimiento de alarmas y salud— murieron con el tablero. Peor: su
> archivo de prueba cubría **exclusivamente** funciones muertas y pasaba en
> verde, que es peor que no tenerlo porque da confianza sobre nada. Reescrito
> sobre las tres vivas más las dos garantías nuevas de la sesión.
>
> #### Un hueco funcional que había que tapar aquí
>
> `SesionProvider` sabía salir y **nada en la interfaz podía llamarlo**. En un
> equipo compartido eso no es incomodidad: es que el turno siguiente hereda la
> sesión del anterior, con sus permisos de escritura sobre la planta. Se añade
> `auth/BarraSesion.jsx`, mínima y declarada como provisional — la Fase 5 la
> absorbe en la cabecera del chat. Va **fuera** de la frontera de errores: si el
> chat revienta, salir tiene que seguir funcionando.

### F4 (original) · Login en la UI
`auth/SesionProvider.jsx` + `auth/Login.jsx`. `App.jsx` decide entre login y
asistente según `GET /api/sesion`. Los clientes de `lib/api/` mandan
`credentials: 'include'` y, ante un 401 con `motivo:'sesion'`, disparan la
vuelta al login **sin borrar el hilo de la conversación**
(`features/asistente/lib/persistencia.js` ya lo guarda).
**Verde:** pruebas nuevas de §7.3.

### F4.5 · `PRODUCT.md` y `DESIGN.md`, ANTES de diseñar — **HECHA**

> Ejecutada el 04-09-2026, junto con la F4.
>
> `PRODUCT.md` cambia de usuario: ya no es un prospecto en demostración mirando
> un tablero, sino **un técnico delante del equipo con una avería y las manos
> ocupadas**. De ahí sale la restricción que gobierna el diseño y que antes no
> figuraba: una respuesta tarda entre 30 y 90 segundos.
>
> `DESIGN.md` cambia de estrella polar. «El Gemelo Digital» —la instalación
> existiendo dos veces, como geometría y como número— se apagó con las vistas
> 3D. La nueva es **«el instrumento que contesta»**, y de ella se derivan las
> reglas de la espera y del trazo. La sección «Navigation» se sustituye por
> «Cajones», con la regla de que no son pestañas ni tienen URL.
>
> **Deuda encontrada al revisar la paleta, anotada en `DESIGN.md`:** el gráfico
> que devuelve `grafico_de_senal` lleva sus colores escritos a mano en
> `shared/eva/comun/graficos.js`, y (a) su azul `#2563eb` no es el azul de marca
> `#3654E0` —son parecidos, que es lo peor: no se lee como una decisión— y (b)
> siempre es claro, así que con el tema oscuro aparece una lámina blanca en
> mitad de una conversación oscura. No se arregla aquí porque el SVG lo genera
> el backend y la corrección tiene que decidir si el tema viaja en la petición.
> Es trabajo de la Fase 5.
>
> La paleta `viz` se queda **sin ningún consumidor** al irse las gráficas del
> tablero. No se borra: es la referencia con la que hay que alinear ese SVG.

### F4.5 (original) · `PRODUCT.md` y `DESIGN.md`, ANTES de diseñar

Fase corta y de sólo documentación, y va aquí por una razón mecánica que
descoloca el orden natural: **`/impeccable shape` arranca ejecutando
`scripts/context.mjs`, que carga `PRODUCT.md` y `DESIGN.md`** como contexto de
producto y verdad visual incumbente. Hoy los dos describen un tablero de
planta de 22 rutas con sidebar, banners y maqueta 3D.

Si `shape` corre antes de reescribirlos, diseña con brío para el producto
equivocado — y el skill avisa de esto él mismo: «visual authority is evidence,
not a filename». La evidencia tiene que ser la correcta antes de pedirla.

Se reescriben:
- **`PRODUCT.md`** — qué es esto ahora: una sola conversación, quién la usa
  (el técnico delante del equipo, con las manos ocupadas), y las 22
  capacidades de §1.2.
- **`DESIGN.md`** — se recorta a lo que sobrevive. Los tokens de
  `.impeccable/design.json` (Azul Señal, Verde Instrumento, las rampas
  tonales) **se conservan**: el asistente ya lee su color de `useTheme()` y
  los tres temas siguen. Lo que se va es el vocabulario de tablero —tiles,
  sparks, banners de estado, la retícula de nueve vistas.

### F5 · El asistente pasa a ser la aplicación

**Método: `/impeccable shape` primero, código después.** No se improvisa la
pantalla. El encargo de esta rama es de **modo Operate** —el visitante
completa una tarea, no se le persuade— y de los tres verbos del skill el que
manda es `shape` (planear UX/UI antes de escribir código), con `distill`
(despojar a lo esencial) como referencia secundaria: esta fase literalmente
comprime 22 destinos en uno.

Lo que `shape` tiene que resolver antes de la primera línea:

1. **Dónde vive la conversación cuando es la aplicación entera** y no un panel
   de esquina. Un hilo de chat a 1 920 px de ancho sin medida de línea es
   ilegible; el ancho de lectura y qué ocupa el resto es la decisión de fondo.
2. **Cómo se abren y conviven los tres cajones** sin volverse pestañas —que
   serían §2.12 por la puerta de atrás.
3. **El estado vacío**: la primera pantalla tras el login, antes de la primera
   pregunta. Hoy el asistente ofrece un ejemplo por herramienta; con 22 hay
   que elegir cuáles se enseñan.
4. **El login**, que es la primera impresión del producto y hoy no existe.
5. **La espera de 30–90 s** — ya resuelta en el diseño actual y que `shape`
   debe **preservar, no rediseñar**: es identidad estructural, no adorno.

Después: `Asistente.jsx` deja de ser un botón flotante sobre un tablero y pasa
a ocupar la pantalla, con los tres cajones de §5.5. Los tokens de `base.jsx`
se mudan a `theme/tipografia.js` y se elimina el duplicado de `Asistente.jsx`.

Cierre de fase con los verbos de evaluación del mismo skill: **`audit`**
(a11y, responsive, rendimiento) y **`polish`**. `npm run design:detect`
—`impeccable detect`, que ya está en el `package.json`— tiene que salir limpio.

Lo que se conserva y `shape` **no** puede rediseñar: el trazo derivado de los
caracteres que de verdad llegan, los estados dichos con palabras, el contador
de segundos, la cancelación que no es un fallo, el reintento y las citas de
origen bajo cada respuesta. Está razonado en la cabecera de `Asistente.jsx` y
sale de una restricción real —la respuesta tarda entre 30 y 90 segundos—, no
de una preferencia visual.

**Verde:** `asistente.test.jsx`, `manosLibres.test.jsx`, las tres nuevas de
cajón, `npm run design:detect`.

### F6 · Documentación y presupuestos
`CLAUDE.md` de esta rama: §2.11 reescrita, §2.12 nueva, §3 con el árbol real,
§5 con la lista de pruebas que quedan. `README.md`: arranque sin
`ICONICS_USERNAME`/`PASSWORD` y el requisito de HTTPS (§8.4).
`.env.example` recortado, con `SESION_TTL_MINUTOS` y `SESION_MAX`. Techos
nuevos y **medidos** en `verificar-bundle.mjs`. (`PRODUCT.md` y `DESIGN.md` ya
se reescribieron en F4.5 — tenían que estar listos antes de diseñar.)
**Verde:** `npm run design:detect`, `verificar-bundle.mjs`, la tanda completa
de `verificar-*`.

---

## §7 Qué prueba qué

### §7.1 Verificadores que sobreviven y DEBEN seguir pasando

Son la red que demuestra que la simplificación no tocó el motor:

```
verificar-herramientas.mjs      la invariante definición ↔ implementación
verificar-chat.mjs              el bucle de conversación
verificar-diagnostico.mjs       las 4 fuentes y su puntuación
verificar-documentos.mjs        índice de manuales / BM25
verificar-casos.mjs             índice de casos previos
verificar-casos-cierre.mjs      cierre por chat (la vía de formulario se fue)
verificar-temporal.mjs          la 4ª fuente
verificar-calibracion.mjs       sensibilidad de umbrales
verificar-riesgos.mjs           reglas del tanque
verificar-riesgos-vibracion.mjs reglas de vibraciones
verificar-pronostico.mjs        desgaste acumulado
verificar-aprendizaje.mjs       hechos y propuestas
verificar-voz.mjs               dictado
verificar-manos-libres.mjs      ciclo de voz completo
verificar-transporte-falso.mjs  ICONICS_FAKE sirve las dos máquinas
verificar-backend.mjs           contrato HTTP completo
verificar-bundle.mjs            techos NUEVOS tras F6
```

**Que `verificar-riesgos-vibracion.mjs` siga en verde con todas las vistas de
vibraciones borradas es el resultado que valida el §0 entero**: prueba que el
dominio estaba de verdad separado de la presentación.

### §7.2 Verificadores que se borran

`verificar-modulos.mjs` (no queda un segundo módulo que separar) y la sonda
`comprobar-historial-alarmas.mjs`. Se conservan
`verificar-antiguedad-historico.mjs`, `medir-calibracion.mjs` y
`medir-narracion.mjs`.

### §7.3 Pruebas nuevas

**Backend** (`backend/test/rutas/sesion.test.mjs`):

- login con credenciales buenas → 200 + cookie `httpOnly`
- login con credenciales malas → 401 **y no se crea sesión**
- ruta protegida sin cookie → 401 con `motivo:'sesion'`
- ruta protegida con cookie caducada → 401, y la sesión queda liberada
- logout invalida: la misma cookie deja de servir
- **dos sesiones no se pisan los tokens** — la prueba que justifica que el
  estado viva en el cierre de la factoría y no en variables de módulo
- el tope `SESION_MAX` rechaza la siguiente con 503 y un mensaje que dice qué
  pasa y cómo se resuelve
- la contraseña **no aparece** en ninguna línea del log

**`scripts/verificar-sesion.mjs`** (extremo a extremo con ICONICS falso):
login → pregunta al chat → la herramienta lee con el token de esa sesión →
logout → la siguiente pregunta da 401.

**Frontend:**

- `test/auth/login.test.jsx` — envía credenciales; muestra el error de rechazo
  tal cual lo manda el servidor, no lo traduce a un genérico (CLAUDE.md §4.6)
- `test/auth/sesion-caducada.test.jsx` — un 401 en mitad de una respuesta
  vuelve al login **conservando el hilo**, y al reentrar la conversación sigue
  ahí
- `test/features/asistente/cajon-assets.test.jsx` — seleccionar un punto lo
  manda al chat como contexto
- `test/features/asistente/cajon-manuales.test.jsx` — subir un PDF llama a
  `subirManual` y refresca la lista
- `test/features/asistente/cajon-casos.test.jsx` — dos comprobaciones que son
  las invariantes de §5.5, no adorno: **archivar no borra** (el caso sigue en
  la lista con el filtro «archivados» y se puede devolver), y **`resuelto` y
  `diagnosticoCorrecto` se pintan por separado** — un caso resuelto con el
  diagnóstico equivocado tiene que distinguirse de uno resuelto y acertado
- `test/app/una-sola-vista.test.jsx` — **guarda de §2.12**: falla si aparece un
  segundo destino navegable
- accesibilidad (`axe-core`) sobre login y sobre el chat: es lo único que
  queda, así que tiene que estar bien

### §7.4 Las 53 pruebas del frontend, una por una

Cada archivo cae en uno de cuatro cubos. Nada queda sin decidir: una prueba
que se queda «por si acaso» apuntando a un componente borrado es un fallo de
build, no una red de seguridad.

**BORRAR — 33.** Prueban vistas que dejan de existir.

```
app/          modo-muro.test.js · modo-muro-shell.test.jsx · navegacion.test.jsx
              routes.test.jsx · topbar-alarmas.test.jsx · topbar-estado-maquina.test.jsx
demo-eva/     alarmas.test.js · alarmas-eva.test.jsx · cierre-diagnostico.test.jsx
              comparar.test.js · contraste-tooltip.test.jsx · controles.test.jsx
              detalle-activo-simulada.test.jsx · detalle-exportar.test.jsx
              edad-dato.test.jsx · exportar.test.js · exportarExcel.test.js
              fuente.test.js · grafica-comparada.test.jsx · grafica-historia.test.jsx
              hooks-historia.test.jsx · inicio-simulada.test.jsx · planta-simulada.test.jsx
              riesgos-mismo-layout.test.jsx · riesgos-pronostico-diferido.test.jsx
              selector-rango.test.jsx · tres-d.test.js · useAhora.test.jsx
              vibraciones-simulada.test.jsx
lib/          datasource/origen.test.jsx · iconics/pollingEngine.test.js
              iconics/transporteSimulado.test.js · iconics/use-alarm-count.test.jsx
live/         eva.live.test.js
```

**MOVER a `src/test/dominio/` — 8.** No prueban vistas: prueban `shared/`.
Sobreviven intactas al borrado de `Demo-EVA/` entera, y **eso es la prueba de
que §0 tenía razón**. Sólo cambian de carpeta, para que su ubicación deje de
mentir.

```
dominio.test.js · estado-maquina.test.js · sistemas.test.js · historia.test.js
rango.test.js · estado-dato.test.js · simulador.test.js · simulador-vibraciones.test.js
```

**ADECUAR — 10.** El sujeto sigue vivo pero cambió de forma o de contexto.

| Prueba | Qué cambia |
|---|---|
| `demo-eva/casos-rag.test.jsx` | → `features/asistente/cajon-casos.test.jsx`; monta el cajón, no la ruta |
| `demo-eva/documentacion-rag.test.jsx` | → `features/asistente/cajon-manuales.test.jsx`; ídem |
| `demo-eva/accesibilidad.test.jsx` | pasa a cubrir las **dos** pantallas que quedan (login y chat) en vez de nueve vistas |
| `app/theme.test.jsx` | los tres temas siguen; se le quita el montaje del layout |
| `features/asistente/asistente.test.jsx` | pantalla completa, no panel flotante; y ahora exige sesión |
| `features/asistente/manosLibres.test.jsx` | igual, más el `credentials:'include'` en la ruta de voz |
| `features/asistente/persistencia.test.js` | el hilo tiene que sobrevivir a una **sesión caducada**, no sólo a una recarga |
| `features/asistente/silencio.test.js` | sin cambio de sujeto; se reubica |
| `features/asistente/traza.test.js` | ídem |
| `lib/iconics/apiClient.test.js` | manda cookie de sesión; un 401 con `motivo:'sesion'` no es un error de red |

**CONSERVAR sin tocar — 2.** `lib/concurrencia.test.js`, `lib/valores.test.js`.

**NACEN — 6** (§7.3): `auth/login`, `auth/sesion-caducada`,
`asistente/cajon-assets`, `asistente/cajon-manuales`, `asistente/cajon-casos`,
`app/una-sola-vista`.

> Dos de las nuevas ya aparecen arriba como «adecuar» porque heredan el cuerpo
> de la prueba de la vista correspondiente. Se cuentan una sola vez: **53 − 33
> = 20, + 6 nuevas = 26.**

### §7.5 Las 11 pruebas del backend

Ninguna se borra. **Las 11 se adecúan de golpe y en un solo sitio**:
`test/ayudas.mjs` monta la app y ahora tiene que crear una sesión y devolver
su cookie, y cada `inject()` la manda. Ése es el motivo de que el ayudante
exista.

```
config.test.mjs · esquemas.test.mjs · iconics-timeouts.test.mjs · logger.test.mjs
rutas/{casos,chat,diagnostico,iconics,rag,seguridad,voz}.test.mjs
```

`logger.test.mjs` gana además el caso de §4.3: **la contraseña no sale en el
log**. `rutas/seguridad.test.mjs` gana el de la cookie (`httpOnly`,
`SameSite`). Y nace `rutas/sesion.test.mjs` (§7.3) → **12**.

---

## §8 Riesgos y huecos, declarados y no escondidos

1. **La contraseña vive en memoria del proceso** mientras la sesión esté
   abierta. Es inevitable con este flujo: ICONICS sólo admite Authorization
   Code + PKCE, y renovar tras un `refresh_token` rechazado exige rehacer el
   login completo. Mitigado con redacción en el log, cookie `httpOnly` y TTL.
   No mitigado frente a un volcado de memoria del servidor. **Se anota en la
   cabecera de `sesiones/registro.mjs`.**
2. **N usuarios = N flujos OIDC de cinco saltos.** A escala de demo (decenas)
   es irrelevante; con cientos, el servidor de seguridad de ICONICS es el
   cuello de botella. `SESION_MAX` pone un tope explícito en vez de
   descubrirlo en planta.
3. **El cajón de Casos es carga de trabajo recurrente, no una pantalla que se
   monta y se olvida.** Conservarlo (§5.5) cierra el hueco de degradación
   silenciosa, pero sólo si alguien lo abre: el corpus se ensucia solo y la
   auditoría del 01-09-2026 ya midió 2 de 5 registros basura. La revisión
   periódica es un hábito de operación, y este plan no puede garantizarlo —
   sólo dejar la herramienta a un clic en vez de en consola.
   `scripts/purgar-casos-invalidos.mjs` se conserva para la poda masiva.
4. **`Secure` en la cookie exige HTTPS.** Hoy el puente se sirve por HTTP en
   red de planta y `bms-server` usa certificado autofirmado
   (`NODE_TLS_REJECT_UNAUTHORIZED=0` en `.env.local`). En producción la cookie
   irá `Secure` y **la aplicación tendrá que servirse por HTTPS o el login no
   funcionará**. Es un requisito de despliegue, no un detalle: se documenta en
   `README.md` en F6.
5. **El techo de `vendor` hay que MEDIRLO, no estimarlo** tras F3. Bajarlo a un
   número inventado repetiría el error que CLAUDE.md §5 ya señala en sentido
   contrario.
6. **La lectura de «las 4 señales»** del encargo se interpretó como las cuatro
   fuentes del motor (§1). Si era otra cosa, hay que decirlo antes de F1.

---

## §9 Lo que este plan NO hace

- No toca `backend/ia/motor/` salvo una firma (§4.3). La aritmética del
  diagnóstico se queda byte a byte.
- No toca `shared/`.
- No reescribe las descripciones de las herramientas.
- No añade base de datos para las sesiones. Son memoria del proceso: reiniciar
  el puente obliga a volver a entrar, y eso es correcto y esperable en una
  aplicación de planta.
- No inventa un sistema de permisos propio (§4.5).

---

## Anexo A · Descubrir las máquinas en vez de escribirlas

> Análisis pedido el 03-09-2026. **No es parte del Plan 20.** Es el Plan 21, y
> este anexo explica por qué esa separación no es burocracia sino la condición
> para que el 21 salga barato.

### A.1 La visión, tal y como se formuló

Que dar de alta un cliente nuevo sea:

1. «Dame estos permisos para tu servidor de ICONICS.»
2. «Dame la lista de assets sobre los que voy a trabajar.»
3. «Enlístame los componentes que intervienen en cada asset o máquina.»

Y a partir de ahí, alimentar el sistema con los PDF de cada componente y los
límites de cada máquina. Cambiar de máquina —o de servidor ICONICS entero—
sería configuración, no código.

### A.2 Qué está escrito a mano hoy, exactamente

| Archivo | Qué fija | Forma |
|---|---|---|
| `shared/eva/tanque/senales.js` | las 8 señales: clave, unidad, punto, sinónimos, `esHistorizada` | catálogo |
| `shared/eva/vibraciones/vibraciones.js` | medidas, banderas, vigilancias, calidades, variador, contadores, por canal | catálogo |
| `shared/eva/tanque/activos.js` | la agrupación en 4 activos | catálogo |
| `shared/eva/comun/sistemas.js` | `raices`, `puntos()`, `parse()`, `modelo()`, `esHistorizada()`, `cadenciaMs` | **funciones** |
| `shared/eva/tanque/riesgos.js`, `vibraciones/riesgosVibracion.js` | las REGLAS de riesgo | **funciones** |
| `shared/eva/comun/causas.js` | qué causas puede tener cada riesgo | catálogo |

Dar de alta una máquina hoy **es escribir JavaScript**. Ése es el problema
real, y está bien identificado.

### A.3 Las cuatro capas no son igual de automatizables

Meterlas en un solo saco —«que el sistema entienda leyendo Assets»— es lo que
haría fracasar el intento. Se separan:

| Capa | ¿Quién lo sabe? | Veredicto |
|---|---|---|
| **1 · Inventario** — qué puntos hay, cómo se llaman, tipo, unidad | el servidor | **Automatizable hoy.** `/api/iconics/browse` ya lo lee: es lo que hace el cajón de Assets |
| **2 · Agrupación** — qué puntos forman una máquina | a veces el servidor; si no, el cliente | **Semiautomatizable.** Ver A.4 |
| **3 · Semántica** — qué magnitud es, en qué unidad, si tiene histórico, cómo la llama un técnico | mezcla | **Parcial, con una trampa grave.** Ver A.5 |
| **4 · Reglas y límites** — cuándo hay riesgo y por qué | sólo el ingeniero | **No automatizable con seguridad.** Ver A.6 |

### A.4 La agrupación: el paso 3 del onboarding ya reconoce el problema

CLAUDE.md §2.10 lo dice sin rodeos: **la agrupación en 4 activos es NUESTRA,
no del servidor.** Bajo `ac:TDCON/DEMO/SENSORES/` no hay equipos, sólo señales
sueltas. En **este** servidor no hay nada que descubrir: la jerarquía no
existe.

Así que «que el sistema agrupe los assets por máquina leyendo Assets» sólo
funciona si el servidor del cliente **publica** esa jerarquía en AssetWorX. A
veces la publica —AssetWorX está hecho justamente para eso— y a veces, como
aquí, el árbol es plano.

De ahí la corrección al objetivo, y es buena noticia: **el paso 3 del
onboarding ya lo resuelve.** «Enlístame los componentes que intervienen en
cada máquina» es exactamente la información que el servidor no da. La meta
realista no es *adivinar* la agrupación, sino:

> Que la agrupación sea **un dato que se recibe** —descubierto del árbol si
> existe, aportado por el cliente si no— y que **ni un caso ni el otro exijan
> escribir código**.

Eso sigue siendo la transformación entera. Hoy `activos.js` es un archivo
fuente; mañana sería un JSON validado con la misma forma, y §2.10 seguiría
siendo cierta —la agrupación sigue sin ser del servidor— pero dejaría de estar
compilada dentro del programa.

### A.5 La trampa que impide fiarse del descubrimiento automático

Un descubridor ingenuo preguntaría «¿esta señal tiene histórico?» pidiendo su
serie. En este servidor **contestaría que sí para tres señales que no la
tienen**: `CARGA_TRABAJO_MOTOR`, `KPIEFICIENCIA_ENERGETICA` e
`INDICE_DESVIACION_VOLTAJE` reciben la curva de `STEMPERATURA_TANQUE` con
`ok: true`, marcas de tiempo correctas y valores plausibles.

`esHistorizada` está hoy escrito a mano **por esto exactamente**. Un
descubrimiento automático sin defensa generaría un sistema que miente con
aplomo, y el Plan 21 heredaría el fallo más caro del proyecto en vez de
resolverlo.

La defensa existe y es construible: una **sonda de duplicados** que pida las
series de puntos distintos y marque como sospechosas las que salgan idénticas.
`scripts/sondear-paginacion-historico.mjs` y
`verificar-antiguedad-historico.mjs` ya hacen sondeo de este tipo. Pero es
trabajo real, y es requisito de entrada del Plan 21, no un detalle.

Lo que sí sale gratis del servidor: nombre, tipo y **unidad** del punto. Los
sinónimos —«temp del tanque», «la temperatura»— los puede proponer un modelo y
los aprueba una persona: son texto de búsqueda, no un umbral. Si se equivoca,
el asistente no encuentra una señal; no diagnostica mal. Esa asimetría es la
que decide qué se le puede delegar al modelo y qué no.

### A.6 «Definir las reglas es anexar un PDF»: la mitad ya funciona

**Lo que ya existe.** `limites_del_manual` extrae candidatos a límite del
texto de un manual, y `herramientas/lib/limites.mjs` los cruza contra lo
medido y calcula el exceso. Eso **ya es** «los límites salen del PDF».

**Lo que ya está medido que NO puede.** Sólo calcula el exceso para las
palabras sin ambigüedad de dirección —«máximo», «no debe exceder», «mínimo»—.
«Rango admisible de 100 V a 132 V» captura el 100, que es el **suelo**, y
tratarlo como techo diría que 121 V excede un máximo de 100. Y
`unidadesCoinciden` puede ser `false`: un límite en bar contra una lectura en
kPa no es una comparación, es una coincidencia numérica.

**La distinción que decide el Plan 21:**

- Un **límite** es una variable y un número. Sale de un PDF. Ya sale.
- Una **regla de riesgo** combina varias señales, con histéresis y con un
  `necesita` que declara qué la corrobora. *Eso el PDF no lo da*, y un modelo
  que lo invente choca de frente con CLAUDE.md §2.3: **el código puntúa, el
  modelo redacta**. Hay medición detrás: contra este mismo servidor el modelo
  local dijo tres veces «velocidad eficaz 1,13 mm/s» leyendo la
  **aceleración**.

La salida no es prohibir la idea — es la que el proyecto **ya eligió** y tiene
a medio construir: **el modelo PROPONE, una persona APRUEBA, el código
EJECUTA.** Es `proponer_regla`, que ya existe (§5.6). Lo que falta no es la
propuesta: es que lo aprobado se guarde como **dato ejecutable** en vez de
como código que alguien transcribe a mano a `riesgos.js`.

### A.7 El bloqueo estructural, y por qué el Plan 20 es su prerrequisito

El muro no es ninguna de las cuatro capas: es que **`sistemas.js` es código,
no datos**. `puntos()`, `parse()`, `modelo()`, `esHistorizada()` son
funciones. Para que dar de alta una máquina sea configuración, tienen que
volverse declaraciones que interprete un motor genérico.

Y hay que hacerlo **conservando la garantía por la que se volvieron
ejecutables**: su propia cabecera cuenta que antes ese conocimiento vivía
repartido en `if`s, y que el fallo se vio **dos veces** — un simulador que
sólo conocía un árbol dejaba la máquina nueva devolviendo `value: null` con
calidad BUENA. La pantalla no veía un fallo; veía una máquina que contesta y
no dice nada. Un motor genérico mal hecho reproduce ese fallo para todas las
máquinas a la vez.

**Aquí es donde las dos cosas se atan.** Cambiar la forma de `SISTEMAS` cuesta
en proporción a cuántos sitios lo consumen. Hoy lo consumen nueve vistas, dos
simuladores, el transporte falso y el asistente. Después del Plan 20 lo
consume **el asistente y nada más**.

> El Plan 20 no retrasa esta visión: **la abarata**. Es mucho más fácil
> cambiarle la forma al dominio cuando tiene un solo consumidor.

Y el criterio de §1 —«lo que alimenta al asistente se queda»— resulta ser el
mismo que pide el Plan 21: el cajón de Assets, el de Manuales y el de Casos
son, exactamente, las tres puertas por las que entraría la configuración de un
cliente nuevo. Se conservan por una razón y sirven para la otra.

### A.8 Camino escalonado, cada peldaño con valor propio

Ninguna etapa exige la siguiente. Si el proyecto se detiene en la C, lo hecho
sigue valiendo.

**A · Inventario declarado** — `senales.js` y `vibraciones.js` dejan de ser
fuentes y pasan a JSON validado con Zod al arrancar. Sin motor genérico
todavía: mismo comportamiento, mismo `sistemas.js`.
*Valor: los catálogos se editan sin tocar código.* *Riesgo: bajo.*

**B · La sonda de duplicados** (A.5) — antes de descubrir nada
automáticamente. Corre contra el servidor del cliente y marca las señales cuya
serie es la de otra.
*Valor: se puede confiar en el histórico de un servidor que nadie auditó a
mano.* *Riesgo: bajo; es un script.*

**C · Agrupación como dato** — `activos.js` pasa a JSON con dos orígenes:
descubierto del árbol de AssetWorX si el servidor publica jerarquía, aportado
por el cliente si no (paso 3 del onboarding). §2.10 se reescribe: la
agrupación sigue sin ser del servidor, pero deja de estar compilada.
*Valor: **el paso 3 del onboarding queda cubierto**.* *Riesgo: medio.*

**D · El motor genérico** — `puntos()`, `parse()` y `modelo()` se derivan de la
declaración en vez de escribirse por máquina. Es la etapa cara y la que tiene
que conservar la garantía de A.7.
*Valor: **una máquina nueva no toca código**.* *Riesgo: alto.*

**E · Límites por manual, extendidos** — se ataca la ambigüedad de dirección
medida en A.6: rangos con suelo y techo, unidades que no casan.
*Valor: «los límites son un PDF» pasa de medio cierto a cierto.*
*Riesgo: medio.*

**F · Reglas propuestas y aprobadas** — `proponer_regla` deja de terminar en un
script de consola y termina en una **regla declarativa aprobada**, guardada
como dato. Es cuando el cuarto cajón de §5.6 empieza a tener sentido, porque
por fin puede cerrar el bucle.
*Valor: la visión completa.* *Riesgo: alto — y es el que toca §2.3, así que la
aprobación humana no se negocia.*

### A.9 Lo que hay que decir claro

**Alcanzable:** que dar de alta una máquina, o cambiar de servidor ICONICS
entero, no exija escribir ni una línea de JavaScript. Etapas A–D.

**Alcanzable con trabajo medido:** que los límites de una variable salgan de
un PDF. Ya sale a medias; la etapa E cierra los huecos conocidos.

**No alcanzable, y no por falta de esfuerzo:** que las reglas de riesgo salgan
solas de un PDF sin que nadie las firme. Una regla decide si se para una
bomba. El sistema puede **proponerla** con su evidencia y ahorrar seis meses
de descubrirla —y eso es mucho— pero la firma es de una persona. Prometer lo
contrario sería vender lo que CLAUDE.md §2.5 prohíbe: fingir que está montado
lo que no lo está.
