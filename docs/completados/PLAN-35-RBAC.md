# PLAN 35 — RBAC: tres roles, con jerarquía, encendidos

**Estado:** F1–F4 completadas · plan terminado
**Rama:** `Vibraciones1.0`
**Fecha:** 21-09-2026

> **Es el punto 3 de los cuatro de la siguiente demo** (modularidad, panel de
> administración, RBAC, diagnóstico de vibraciones). Y es el que **desbloquea
> el 2**: la F4 del Plan 34 —el alta de máquinas desde pantalla— está parada
> por `AUTH_HABILITADA=false`, que es lo que este plan enciende.

---

## 1. Qué se quiere

Tres roles, definidos por el usuario el 21-09-2026:

| Rol | Qué puede |
|---|---|
| **Administrador** | Acceso completo. Se enfoca en gestión de máquinas y usuarios, asigna roles. CRUD completo |
| **Operador** | Sin panel de administración. Pregunta al asistente, ve gráficas y diagnósticos, registra intervenciones, escribe en el cuaderno |
| **Visualizador** | Sólo el apartado de visualización de cada máquina |

**Con jerarquía pura**, decidido el 21-09-2026:

```
administrador  >  operador  >  visualizador
```

Un administrador puede todo lo que puede un operador, **incluido accionar la
planta**. Se consideró la alternativa —que gestionar y accionar fueran
competencias separadas— y se descartó: quien lee «acceso completo» espera
poder hacer lo que su subordinado hace, y un admin que no puede sorprende en
el peor momento.

---

## 2. Lo que YA existe, medido el 21-09-2026

**Esto no se construye desde cero.** Se midió encendiendo
`AUTH_HABILITADA=true` con tres usuarios de prueba, uno por rol.

| Pieza | Estado |
|---|---|
| JWT, censo, caducidad (`http/plugins/autenticacion.mjs`) | **Funciona.** Plan 22 F6 |
| `AUTH_USUARIOS` con `scrypt` y `scripts/hash-clave.mjs` | **Funciona** |
| `autenticar` aplicado por ÁMBITO, con prueba de inventario | **Funciona.** Plan 20 F5 |
| Pantalla de acceso, `SesionProvider`, renovación | **Funciona.** Plan 25, ya en `completados/` |
| `exigirRol` | Funciona, **pero sin jerarquía** (§3.1) |

> **El `HANDOFF.md` estaba desactualizado en esto.** Decía que la
> autenticación seguía apagada porque «el tablero todavía no sabe pedir un
> token — pantalla de acceso y renovación son del Plan 25». Ese plan está
> **completado**, y las piezas existían. **Corregido en F4**, junto con
> `CLAUDE.md` §2.11 y la cabecera de `config.mjs`, que afirmaba además que
> «con `true` el servidor NO arranca».

Comprobado en vivo: los tres usuarios autentican y reciben un JWT con sus
roles dentro; sin token, `401`.

---

## 3. Lo que está roto o falta, medido

### 3.1 No hay jerarquía, y el administrador puede MENOS que el operador

`exigirRol` compara por igualdad:

```js
if (!request.usuario?.roles?.includes(rol))   // ← exacto, no jerárquico
```

La matriz real de hoy, medida endpoint por endpoint:

```
LECTURAS                  admin  oper  visor
GET  maquinas              200   200   200
GET  iconics/data          200   200   200
GET  casos                 200   200   200
GET  cuaderno              403   200   403    ← el admin NO puede leer

ESCRITURAS                admin  oper  visor
POST maquinas (alta)       400   403   403    ← correcto
POST descubrir             400   403   403    ← correcto
POST cuaderno              403   400   403    ← el admin NO puede
POST control/bomba         403   400   403    ← el admin NO puede
POST casos                 403   400   403    ← el admin NO puede
```

*(`400` = pasó el permiso y falló la validación del cuerpo vacío: autorizado.)*

**El administrador no puede escribir en el cuaderno, accionar la bomba ni
cerrar un caso.** Contradice «acceso completo» de frente.

### 3.2 El rol `visualizador` no existe

No está mal configurado: **ninguna ruta lo menciona**. Por eso el visor pasa
las mismas lecturas que todos, incluida `GET /api/maquinas` —la configuración
de la planta—, que según su definición no debería ver.

### 3.3 Sólo 18 de ~48 endpoints declaran `exigirRol`

Trece piden `operador` y cinco `administrador`. **Los otros ~30 sólo exigen
estar autenticado**, así que no distinguen un visualizador de un operador.

Es el mismo modo de fallo que el Plan 20 F5 documentó para `autenticar` —«la
llevaban trece de treinta y tres»— y por el mismo motivo: **olvidarla no rompe
nada visible**. La ruta funciona, sus pruebas pasan, y el hueco sólo aparece
el día que se enciende el interruptor.

---

## 4. Los tres roles, en dos sistemas que no hay que confundir

`ICONICS_USERNAME` y `AUTH_USUARIOS` se parecen y no son lo mismo. El código
ya avisa (`usuarios.mjs`, `.env.local`), y conviene repetirlo aquí porque la
demo lo va a poner delante:

| | Quién es | Dónde vive |
|---|---|---|
| `ICONICS_USERNAME` | El **puente** ante ICONICS. Sesión de **máquina** | `.env.local`, ya configurada |
| `AUTH_USUARIOS` | La **persona** que mira el tablero. Sesión de **usuario** | `.env.local`, con los tres usuarios desde F4 |

**Consecuencia que hay que decir en la demo:** el tablero lee planta con
`ICONICS_USERNAME` **sea quien sea** quien entre. El rol decide qué puede
hacer en NUESTRO tablero, no qué permisos tiene en ICONICS.

**ICONICS no define estos tres roles** —lo confirmó el usuario— y por eso son
nuestros. Federarlos contra su IdP es el Plan 26, y necesita que ICONICS los
publique.

### Los usuarios de la demo

Facilitados por el usuario el 21-09-2026:

| Rol | Usuario |
|---|---|
| Administrador | `MyUser` |
| Operador | `Moises` |
| Visualizador | `Gustavo` |

**Son credenciales de DEMOSTRACIÓN, no de producción.** La clave es de ocho
caracteres y el propio generador lo avisa: «esto se protege con scrypt, que
encarece probar a lo bruto, pero una clave corta sigue siendo una clave
corta». Viven en `.env.local`, que **no se versiona**.

---

## 5. Las fases

### F1 — Jerarquía y el rol `visualizador`

**Objetivo.** Que `administrador` implique `operador`, y `operador` implique
`visualizador`. Y que el tercer rol exista.

**Dónde vive.** La jerarquía es **dominio**, no HTTP: quién puede más que
quién no depende de Fastify. Va en `shared/`, y `exigirRol` la consulta. Eso
permite que el frontend use la MISMA tabla para decidir qué enseña, sin
duplicar la regla (`CLAUDE.md` §2.6).

**Aceptación.**
- Un `administrador` pasa toda guarda que hoy pide `operador`.
- Un `visualizador` NO pasa ninguna guarda de escritura.
- Un rol desconocido no hereda nada: **deny by default**.
- La matriz de §3.1 se invierte donde tiene que invertirse, y se comprueba
  entera en una prueba que recorre el inventario real.

**Riesgo.** Bajo, con una trampa: la jerarquía **no debe colarse como
`includes` sobre una lista aplanada al firmar el token**. Si el JWT lleva ya
expandidos los roles heredados, cambiar la jerarquía obliga a que todos
vuelvan a entrar. Se resuelve al comprobar, no al firmar.

#### Lo que de verdad pasó · ✅ completada el 21-09-2026

`shared/roles.js` con la tabla de alcance, y `exigirRol` pasando a pedir un
**rol mínimo** en vez de uno exacto. La trampa del token se evitó: el JWT
sigue guardando los roles **tal como se asignaron**, y la herencia se calcula
en cada comprobación.

**La matriz, medida con los tres usuarios de la demo:**

```
                       MyUser   Moises   Gustavo
                       (admin)  (oper)   (visor)
GET  cuaderno            200      200      403
POST cuaderno            400      400      403
POST control/bomba       400      400      403
POST casos               400      400      403
POST descubrir           400      403      403
```

Comparada con la de §3.1: **los cinco 403 del administrador desaparecieron** y
el visualizador queda fuera de todo lo que no es lectura. Es exactamente la
inversión que la fase buscaba.

> El `400` es «pasó el permiso y falló la validación del cuerpo vacío», o sea
> autorizado. Se prueba así a propósito: un cuerpo válido escribiría de verdad
> en la planta.

**Nota sobre `GET /api/cuaderno` con `403` para el visualizador:** no es de
esta fase. Esa ruta ya pedía `operador` desde el Plan 20, y con la jerarquía
sigue pidiéndolo. Si el cuaderno debe ser visible para un visualizador, se
decide en F2 — que es donde se revisa el rol mínimo de cada ruta.

#### Una decisión que la prueba de romper aclaró

Al romper el módulo a propósito (`CLAUDE.md` §6.2) se vio que **dos de las
defensas de `alcanza()` son redundantes**: quitar la guarda de
`esRolConocido(rolExigido)` no cambia ningún comportamiento, porque `ALCANCE`
ya devuelve `undefined` para cualquier rol que no liste.

Se dejan igualmente. No es código muerto: es que la seguridad de este módulo
descansa en que `ALCANCE` esté bien, y una segunda comprobación explícita
cuesta nada y documenta la intención. Lo que sí se comprobó es que la
invariante que **de verdad** importa —que un `visualizador` no escale— falla
con código 1 en cuanto se toca la tabla.

#### Lo medido al cerrar

| | |
|---|---|
| `verificar-roles` | **15** comprobaciones, sin red |
| `npm run verificar` | **los 40** (39 + el nuevo) |
| Backend · Frontend | 368 · 1017 (29 omitidas) |
| Puertas | 169 · 22 omitidas · 68 |
| Lint y types | limpios |

---

### F2 — `exigirRol` en todos los endpoints

**Objetivo.** Que los ~30 endpoints sin rol declarado lo declaren, y que
**no se pueda volver a olvidar**.

**Cómo no se olvida.** El patrón ya existe: `test/rutas/guardas.test.mjs`
recorre `app.inventarioApi()` y falla si una ruta de `/api/` no pasa por
`autenticar`. Aquí se añade lo mismo para el rol: **toda ruta de API declara
un rol mínimo, y la lista de excepciones es explícita** (salud, login).

**El criterio por defecto**, a confirmar ruta por ruta:

| Familia | Rol mínimo |
|---|---|
| Lectura de valores y diagnósticos de una máquina | `visualizador` |
| Asistente, cuaderno, casos, intervenciones, diario | `operador` |
| Control de planta (`/api/control/*`) | `operador` |
| Máquinas: alta, edición, baja, descubrir, sondear, verificar | `administrador` |

**Aceptación.** Ninguna ruta de `/api/` sin rol mínimo salvo las declaradas; la
prueba falla si aparece una nueva sin él.

**Riesgo.** Medio, y es de criterio más que de código: decidir el rol mínimo
de treinta rutas. Un rol de más deja pasar; uno de menos rompe al operador.
Por eso la matriz se comprueba con los tres tokens, no se razona sobre el
papel.

#### Lo que de verdad pasó · ✅ completada el 21-09-2026

**El criterio, afinado por el usuario:** «el operador tendrá acceso a la
mayoría de cosas menos al futuro panel de administración, donde vivirá la
configuración y el alta de las máquinas». Eso mueve una familia entera
respecto a lo que decía la tabla de arriba: **todo `/api/maquinas` pasa a
`administrador`**, incluidas sus lecturas.

Quedó así, sobre las 37 URLs del inventario:

| Rol mínimo | Rutas |
|---|---|
| `visualizador` | `/api/iconics/*` (lecturas), `/api/diagnostico*`, `/api/context`, y los `GET` de casos, chat, voz y documentos |
| `operador` | escribir en cuaderno, casos, RAG, dictado, reportes, `chat/exportar`, control de planta y las escrituras de ICONICS |
| `administrador` | **todo `/api/maquinas`**: listar, tipos, detalle, alta, edición, baja, descubrir, sondear y verificar |
| *(sin rol)* | `/api/health*`, `/api/auth/*` y `GET /api/reportes` — ver abajo |

**Tres exenciones, cada una con su motivo:**

- `/api/health*` y `POST /api/auth/login` ni siquiera pasan por `autenticar`:
  no hay rol que exigir a quien todavía no tiene sesión.
- `/api/auth/renovar` y `/api/auth/yo` parten de una sesión que ya existe y su
  trabajo es decir cuál es. Exigirles rol impediría a un visualizador saber
  que es visualizador.
- `GET /api/reportes` se abre desde el adjunto del chat con un **enlace
  firmado** (`REPORTES_SECRETO`). Su control de acceso es la firma; exigir
  además un rol rompería la descarga sin añadir nada.

#### La prueba que impide volver a olvidarlo

Hermana de la de `autenticar`, y **mide el efecto en vez de espiar el
mecanismo**: enciende la autenticación, entra con el rol más bajo y comprueba
que toda ruta fuera de la lista de permitidas devuelve `403`.

Se hizo así porque `exigirRol` se llama **al registrar** la ruta, no al
servirla: envolverlo desde la prueba llegaría tarde. Y sale mejor de lo
previsto — la prueba no depende de CÓMO se declare el rol, sólo de que un
visualizador no pase. Una ruta nueva sin rol aparece en el fallo con su código
de estado.

**Cazó una que se me había pasado**: `POST /api/chat/exportar`, que deja un
archivo en el servidor y ahora pide `operador`.

#### La matriz, medida con los tres usuarios

```
                          MyUser   Moises   Gustavo
                          (admin)  (oper)   (visor)
GET  iconics/data           200      200      200
GET  diagnostico            400      400      400
GET  casos                  200      200      200
POST cuaderno               400      400      403
POST control/bomba          400      400      403
POST chat/exportar          400      400      403
GET  maquinas               200      403      403
POST descubrir              400      403      403
POST verificar              404      403      403
```

`GET /api/maquinas` con **403 para el operador** es lo que pediste: el panel
de administración es suyo y sólo suyo.

> **Nota sobre `GET /api/cuaderno`:** sigue pidiendo `operador` desde el Plan
> 20, así que un visualizador no lo ve. Encaja con «sólo visualización» y se
> deja como estaba.

#### Lo medido al cerrar

| | |
|---|---|
| `guardas.test.mjs` | **4** pruebas (3 + la del rol) |
| Backend | **369** (368 + 1) |
| `npm run verificar` | los **40** |
| Frontend | 1017 · 29 omitidas |
| Lint y types | limpios |

---

### F3 — El frontend respeta el rol ✅

**Objetivo.** Que el tablero enseñe lo que el rol puede hacer, y que el panel
de administración exista.

**La regla que lo gobierna:** la pantalla **no decide** permisos, los
**refleja**. El backend sigue siendo quien niega —un menú oculto no es
seguridad— y la vista usa la misma tabla de jerarquía de F1 para no tener una
segunda versión de la regla.

**Qué entra:**
- El menú se acota por rol: un visualizador no ve entradas que no puede usar.
- Las acciones de escritura se deshabilitan **con su motivo**, no desaparecen
  sin explicación — una pantalla sin botón y sin aviso se lee como rota, que
  es lo que el Plan 33 F5 ya decidió para Configuración.
- **El panel de administración**, que hoy no existe: máquinas configuradas
  (ya está, es `Planta › Configuración`) más **el censo de usuarios y su rol,
  en lectura**.

**Aceptación.** Con los tres usuarios de demo, el tablero se comporta distinto
y **ninguna vista revienta** por un 403: un rol insuficiente se cuenta, no se
traga.

**Riesgo.** Medio. El modo muro (`modoMuro.js`) es un caso a mirar: una
pantalla sin teclado que caduca la sesión a mitad de turno. El Plan 25 ya
dejó `AvisoRenovacionMuro` para esto.

#### Lo que de verdad pasó · completada el 21-09-2026

**Una pregunta del usuario cambió el alcance**, y para mejor: «desde un punto
de vista de ciberseguridad esto no debería poder realizarse, ¿no?», sobre que
las rutas ocultas siguen siendo navegables por URL.

La respuesta corta es que **ocultar no es proteger, y nunca lo fue**: el
código de todas las vistas viaja al navegador y cualquiera puede llamar a la
API con `curl` sin pasar por la pantalla. Quien protege es `exigirRol` (F2),
que devuelve 403 aunque el frontend se salte entero.

Pero la pregunta destapó un hueco real que iba a dejar implícito: **una vista
a la que se llega por URL montaba, pedía datos, recibía 403 y se quedaba
vacía**. El dato nunca salía, pero la respuesta parecía una avería. De ahí
salió `SinPermiso.jsx`, que ahora es parte de la fase y tiene sus pruebas.

Quedan tres capas, y sólo la primera protege:

| | |
|---|---|
| **1 · El servidor niega** | F2. Es la única que es seguridad |
| **2 · El menú no ofrece** | cortesía: no llevar a un 403 |
| **3 · La URL directa explica** | «esta vista pide rol X, tú tienes Y» |

Lo que **no** se hizo: quitar la ruta del registro. Sería esconder en vez de
cerrar, y rompería los enlaces directos legítimos de quien sí tiene el rol.

#### Las piezas

- **`usePermisos()`** — `puede(rolMinimo)`, con la tabla de `@shared/roles.js`,
  la misma que usa el backend. No expone la lista de roles a pelo: quien la
  recibiera escribiría `roles.includes("operador")` y ahí se pierde la
  jerarquía, que es el defecto que F1 vino a arreglar.
- **`rol` en el registro de rutas** — hoy sólo `eva-configuracion`, con
  `administrador`.
- **`buildNav(routes, groups, puede)`** — `puede` entra **por la puerta** y no
  se importa: este archivo es JS puro que `verificar-navegacion` ejecuta en
  Node, y atarlo a React le quitaría eso. Un grupo que se queda sin hijos no
  se pinta: una sección vacía se lee como algo roto.
- **`SinPermiso.jsx`** — la capa 3.

#### Dos decisiones de «qué hacer sin información»

Las dos van hacia **permitir**, y por el mismo motivo:

- **Con `AUTH_HABILITADA=false`, todo permitido.** El backend tampoco niega
  nada; un menú recortado dejaría el tablero de hoy inservible.
- **Sin `SesionProvider`, todo permitido.** `usePermisos` lee el contexto
  directamente en vez de usar `useSesion()`, que lanza. Mismo patrón que
  `useSesionResuelta()` y `useEsSimulado()`: son hojas que se montan fuera del
  árbol completo —el Sidebar en una prueba— y reventar ahí convierte un
  montaje sin proveedor en una pantalla en blanco.

> El criterio general: **la pantalla restringe exactamente cuando el backend
> restringe, y nunca más.** Esconder de más miente igual que esconder de
> menos, sólo que en la otra dirección.

Eso obligó a exportar el contexto como `CtxSesion`. Lo destapó la suite: el
Sidebar reventaba en seis pruebas que lo montan sin proveedor.

#### Lo medido al cerrar

| | |
|---|---|
| `permisos.test.jsx` | **11** pruebas nuevas |
| Frontend | **1028** · 29 omitidas |
| Backend | 369 |
| `npm run verificar` | los **40** |
| i18n | **1324** claves × 2 idiomas, con paridad |

Roto a propósito (`CLAUDE.md` §6.2): desactivando el filtro de `buildNav`
fallan **4** comprobaciones.

---

### F4 — Encender `AUTH_HABILITADA` ✅

**Objetivo.** Que el interruptor quede en `true` y el tablero funcione.

Va al final a propósito: encenderlo antes dejaría el tablero inservible
mientras F2 y F3 se construyen, que es exactamente el motivo por el que el
Plan 22 F6 lo dejó apagado.

**Aceptación.**
- Arranque con los tres usuarios, y cada uno ve lo suyo.
- `REPORTES_SECRETO` puesto: sin él los enlaces de descarga no caducan, y el
  arranque ya lo avisa.
- **`HANDOFF.md` corregido**: hoy dice que la autenticación está apagada
  porque el tablero no sabe pedir token, y eso dejó de ser cierto con el Plan
  25 (§2).
- `CLAUDE.md` §2.11 actualizado.

**Riesgo.** Alto si se adelanta; bajo detrás de F2 y F3.

#### Lo que de verdad pasó · completada el 21-09-2026

**`.env.local` con las tres variables**, y el bloque reescrito: el que había
decía que la autenticación «todavía NO está implementada» y que «con true el
servidor NO arranca». Lo segundo era falso incluso entonces —lo único que
impide arrancar es faltar `AUTH_SECRETO` o que sea corto— y lo primero llevaba
dos planes sin ser cierto.

**Probado contra el backend real**, no contra el transporte falso:

```
sin token            → 401
GET /api/health/live → 200   (las sondas siguen fuera, como debían)
```

Y los tres usuarios entran con sus roles dentro del JWT:

```
MyUser  → {"id":"MyUser","roles":["administrador"]}
Moises  → {"id":"Moises","roles":["operador"]}
Gustavo → {"id":"Gustavo","roles":["visualizador"]}
```

**La matriz final, con la configuración de verdad:**

```
                          MyUser   Moises   Gustavo
GET  iconics/data           200      200      200
GET  maquinas (panel)       200      403      403
POST cuaderno               400      400      403
```

> Durante la medición salió un `401` suelto para MyUser en la primera fila.
> **No era del código**: mi script leía el token de un archivo que todavía no
> se había escrito. Repetida la llamada, `200`. Se anota porque una cifra rara
> sin explicar envenena la siguiente lectura de este documento.

#### Tres documentos que mentían, corregidos

Los tres decían lo mismo y ninguno se había actualizado al completarse el Plan
25:

| Dónde | Qué decía |
|---|---|
| `HANDOFF.md` | «no protegen nada: el tablero no sabe pedir token (Plan 25)» |
| `CLAUDE.md` §2.11 | «implementada y APAGADA […] el tablero todavía no sabe pedir un token» |
| `config.mjs` | «todavía no implementada […] con `true` el servidor NO arranca» |

De paso se corrigió otra fila del `HANDOFF` que también había caducado: «una
máquina configurada no diagnostica». Ya diagnostica desde el Plan 34 F3; lo
que le falta es leer alarmas y estado de sensor.

#### Lo medido al cerrar

| | |
|---|---|
| Backend · Frontend | 369 · **1028** (29 omitidas) |
| `npm run verificar` | los **40** |
| Puertas | 169 · 22 omitidas · 68 |
| Lint y types | limpios |

Las dos puertas y las dos suites siguen verdes **con `AUTH_HABILITADA=true` en
`.env.local`**, que era el riesgo real de esta fase: las pruebas montan su
propia configuración y no leen ese archivo, pero convenía comprobarlo en vez
de suponerlo.

---

## 6. Lo que queda fuera, y por qué

**El CRUD de usuarios desde pantalla.** Decidido el 21-09-2026 tras dejarlo el
usuario a criterio técnico. El motivo lo escribe el propio `usuarios.mjs`:

> «Este directorio está **destinado a desaparecer**. La decisión de largo
> plazo es federar contra el IdP OIDC de ICONICS […] una tabla de usuarios con
> su CRUD, su pantalla y sus migraciones sería **construir para tirar**.»

Construirlo ahora es trabajo que el Plan 26 borra, toca seguridad —almacenar,
rotar y revocar credenciales— y es la pieza más cara de las cuatro sin ser la
que más se ve en la demo.

**Lo que sí entra** es que el panel **muestre** el censo y el rol de cada
usuario, leídos de `AUTH_USUARIOS`. Dar de alta sigue siendo editar la
variable y reiniciar, que es lo que ya se hace hoy y está documentado.

Si después hace falta el alta desde pantalla, entra como plan aparte con esa
conversación delante.

**Federar contra el IdP de ICONICS.** Es el Plan 26, necesita planta y
necesita que ICONICS publique roles. Cuando llegue, cambia **quién firma** el
token, no el modelo: los roles y las guardas de este plan siguen valiendo.

**Permisos por máquina.** Que alguien opere sólo el tanque y no vibraciones.
No se ha pedido, y añadirlo ahora multiplicaría la matriz por el número de
máquinas (`CLAUDE.md` §4.8).

---

## 7. Abierto, y dicho

**El asistente puede accionar la planta.** `controlar_bomba` escribe desde el
chat. Con jerarquía pura, administrador y operador pueden usarlo y un
visualizador no — pero conviene decidir explícitamente en F2 si preguntar al
asistente y accionar por el asistente son el mismo permiso. Hoy lo son.

**El diario de accionamientos es hoy `operador`.** Es la trazabilidad de quién
hizo qué; con jerarquía el administrador ya lo leerá, pero merece una mirada
en F2 por si debe ser al revés —que lo lea quien audita, no quien acciona—.
