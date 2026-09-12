# Plan 25 · Layout y funcionalidad nueva

> **De dónde sale.** De [`HOJA-DE-RUTA-60-MEJORAS.md`](../HOJA-DE-RUTA-60-MEJORAS.md),
> quinto de los seis planes. Nueve entregas `NUE-*` más la pantalla de acceso
> que el Plan 22 remitió aquí (§0.2).
>
> **Rama.** `Moises7`, la misma de los planes 23 y 24.
>
> **No necesita planta.** Se termina entero con `ICONICS_FAKE=true`. Lo que
> necesitaba red ya está agrupado en el Plan 26 y este plan no lo toca.

---

## 0 · Lo que ya se investigó, y por qué cambia el plan

Igual que en el Plan 24, esto se miró contra el código **antes** de escribir
las fases. Y otra vez cambia el reparto: **cuatro de las diez entregas tienen
ya construida su parte difícil**, y una quinta resultó ser presentación de algo
que el motor lleva meses calculando.

La hoja de ruta enumera los `NUE-*` por su nombre y no los define en ningún
sitio — busqué `NUE-01` en todo `docs/` y sólo aparece esa línea. Así que esta
sección no resume la hoja de ruta: **establece qué significa cada código
contra el código que hay**, que es lo único que hace ejecutable el plan.

### 0.1 · Lo que ya existe

| Entrega | Qué hay ya | Qué falta de verdad |
|---|---|---|
| `NUE-04` casos similares proactivos | **Lo difícil está hecho.** `motorDiagnostico.diagnosticar()` ya llama a `buscarCasosSimilares()` y devuelve los casos **dentro de cada causa candidata**, separados en `confirmados` y `refutados` (`ia/motor/diagnostico.mjs`) | Que se VEAN sin abrir el cierre de diagnóstico. Hoy sólo los pinta `CierreDiagnostico` |
| `NUE-06` barra de contexto de máquina | `EstadoMaquinaBanner` es exactamente eso, **para el tanque** | Generalizarlo. Su propia cabecera ya dice cómo: «lo que hará falta es OTRO indicador con su propio tag, no una condición más aquí» |
| `NUE-07` navegación por módulo | El sidebar **ya agrupa** por máquina y módulo: `sec-llenado`, `sec-vibraciones`, `sec-prediccion`, `sec-general`, `sec-rag`, derivados del registro por `buildNav.js` | Que la agrupación sea *navegable* como módulo, no sólo cinco secciones de una lista plana |
| `NUE-08` asistente acoplado | `contextoDeVista.js` (Plan 24 F7) ya le dice al asistente qué pantalla hay delante, con su frontera probada (`ChatSchema.contexto` con `strict()`) | Que el acoplamiento sea de ida **y vuelta**: hoy el asistente lee la vista, pero no puede llevarte a ella |
| `NUE-09` muro multi-máquina | `modoMuro.js` resuelve **cómo se pinta** un muro (zoom, rotación, sin cromo) y `LatidoMuro` que está vivo | **Qué** se pinta: hoy el modo muro enseña la ruta activa, una sola máquina |

Esto no es «ya está hecho»: es que la parte cara —el dominio, el registro, la
frontera con el asistente— está construida y probada, y lo que queda es
superficie. El Plan 24 encontró lo mismo y el resultado fueron ~7 KB de bundle
para nueve entregas.

### 0.2 · La décima entrega: la pantalla de acceso

**No está en la lista de la hoja de ruta, y sin embargo es de este plan.** Lo
dicen cinco sitios del repositorio, ninguno de ellos esa lista:

- `CLAUDE.md` §2.11 — «pantalla de acceso y renovación son del Plan 25»
- `backend/README.md` §80
- `backend/http/plugins/autenticacion.mjs` — «Eso es trabajo de frontend y es el Plan 25»
- `backend/test/rutas/autenticacion.test.mjs`
- [`PLAN-22-SEGURIDAD.md`](../completados/PLAN-22-SEGURIDAD.md) §«Lo que queda abierto» — «Confirmada la opción 1 antes de empezar»

Confirmado con quien decide, antes de escribir las fases: **entra como entrega
propia.**

El reparto está limpio y medido:

```
backend   POST /api/auth/login · POST /api/auth/renovar · GET /api/auth/yo
          los tres montados, probados con AUTH_HABILITADA=true
frontend  ni un solo header Authorization en todo react-dashboard/src/lib/
```

Es la única entrega del plan que desbloquea algo apagado. Hasta que exista,
`AUTH_HABILITADA` sigue **probada y sin proteger nada**, que es una distinción
que el Plan 22 pidió expresamente no confundir.

### 0.3 · `GET /api/diario` — una entrega de backend en un plan de frontend

El diario de accionamientos (SEG-08) **es de sólo escritura**: `crearDiario()`
anota, y no hay ninguna ruta que lo lea. Lo comprobé recorriendo
`backend/routes/`.

Eso bloquea de verdad a `NUE-01` y `NUE-10`: una vista de Turno que no pueda
decir quién accionó la bomba no es una vista de turno. Y la alternativa
—inventar los hechos desde otro sitio— choca de frente con §2.5.

Confirmado: **se abre la ruta**, paginada y con `exigirRol`. Va en F1, antes
que las vistas que la consumen. El diario dice quién accionó qué y a qué hora,
así que es lectura sensible aunque sea lectura.

### 0.4 · Lo que este plan NO va a hacer, y por qué

- **No unifica las dos pestañas de Alarmas** (`USO-05`, segunda mitad). Es del
  Plan 26 detrás de `ICO-10`, por la asimetría de cobertura. Ver
  [`PLAN-24-USABILIDAD.md`](../completados/PLAN-24-USABILIDAD.md) §0.2.
- **No enciende `AUTH_HABILITADA`.** La pantalla de acceso es el requisito que
  faltaba, no la decisión de encender: encenderla es de despliegue, y §2.11 dice
  que no se enciende como efecto colateral de otra tarea. F9 la deja *posible*,
  no *puesta*.
- **No federa contra el IdP de ICONICS** (`SEG-01` segunda mitad) — Plan 26,
  necesita red.
- **No toca `evaluarRiesgos` ni `resolverSenal`** (`COD-10`) ni parte los
  archivos de más de mil líneas (`COD-04`) — Plan 26, y `COD-04` va al final a
  propósito: este plan es de los que dicen por dónde crece el frontend.
- **No añade una máquina nueva.** `NUE-09` enseña a la vez las que hay; un
  sistema nuevo se declara en `SISTEMAS` y es otro trabajo (§4.7).

### 0.5 · La regla del bundle, fijada antes de empezar

Medido hoy, 12-09-2026, con `npm run build` en limpio:

```
index    247,06 KB  de 450   → 203 KB libres
vendor   264,04 KB  de 270   → 6 KB libres
three    827,21 KB  diferido
```

**El riesgo no es el que la hoja de ruta esperaba.** El `index` va sobrado; el
que está al borde es `vendor`, con 6 KB. Una librería nueva de calendario, de
línea de tiempo o de virtualización entra en `vendor` y lo revienta.

La regla para este plan, confirmada antes de empezar:

> Una librería nueva **sólo** si viaja en trozo diferido, como la pila 3D y
> `xlsx`. Nada nuevo en `vendor`.

> **Corregido el 12-09-2026, tras F2.** El techo de `vendor` se subió de 270 a
> **330**, decidido por quien lleva el proyecto tras plantearle la medición y
> las alternativas. Lo que lo empujó no fue una librería nueva —la regla de
> arriba se ha cumplido— sino que **`lucide-react` no está troceado** y cae en
> el catch-all: los dos iconos de la vista de Turno costaron 1,10 KB de los
> 5,96 que quedaban.
>
> Mi recomendación era trocear `lucide-react` en vez de subir el techo, y se
> descartó; queda anotada como palanca pendiente en la cabecera de
> `verificar-bundle.mjs` junto a la del idioma activo. La condición que el
> propio guion exigía —«si alguna vez hay que subirlo, que sea con su propia
> medición delante»— **sí se cumple aquí**: la subida anterior de `index` fue
> por holgura, ésta tiene su medición. Y se gana su propio límite, más estrecho:
> `vendor` no vuelve a subir sin haber tomado antes una de las dos palancas.

Con dos guardas, porque «diferido» no puede volverse la puerta de atrás por la
que entra cualquier cosa:

1. **`verificar-bundle.mjs` tiene que seguir pasando sin subir ningún techo.**
   Las dos últimas subidas del `index` fueron por holgura y sin medición, y la
   cabecera del propio guion dice que una tercera no toca. Este plan no la pide.
2. **El trozo diferido se declara y se mide.** Si una fase mete una librería,
   su entrada en §2 dice cuánto pesa y qué vista la carga. Un diferido que nadie
   mide es un `three` de 827 KB esperando a que alguien lo cuele en el arranque
   — que es exactamente lo que pasó el 08-09.

### 0.6 · El criterio de orden

Las fases no van por número de código, van por **dependencia**:

1. **Primero lo que otras fases consumen.** `GET /api/diario` (F1) antes que la
   vista de Turno (F2) y el cuaderno (F8).
2. **Primero lo que ya tiene motor.** `NUE-04` es presentación de algo que el
   motor ya calcula: es la fase barata que además valida el patrón.
3. **La pantalla de acceso, tarde pero no la última.** Toca el arranque de la
   aplicación entera, así que quiero el resto estable debajo — pero no la última,
   porque si algo va a destapar un problema de forma quiero margen para tratarlo.
4. **`NUE-09` al final.** Es la que compone lo que las demás construyen.

### 0.7 · Cómo se comprueba cada fase

Lo mismo que el Plan 24, sin rebajas:

```bash
npm run lint && npm run types && npm run verificar    # en la raíz
cd react-dashboard && npm test && npm run build
node scripts/verificar-bundle.mjs                      # tras compilar
cd backend && npm test                                 # si la fase toca backend
```

Y tres que este plan usa más que el anterior:

- `verificar-i18n.mjs` — nueve vistas nuevas son muchas claves nuevas; la
  paridad es/en no se comprueba a ojo.
- `verificar-textos.mjs` — el Plan 24 destapó tres textos en español escritos a
  mano, uno de ellos el ejemplo literal que el guion citaba como su hueco.
  Nueve vistas nuevas es la mejor ocasión posible para repetir ese error.
- `verificar-guardas` (`backend/test/rutas/guardas.test.mjs`) — recorre el
  inventario real de rutas y falla si alguna queda sin guarda. F1 añade una.

**Commit por fase** (§6), y ninguna fase se da por buena con una prueba en rojo
que «ya venía de antes» sin haberlo comprobado con `git stash`. El Plan 24
tuvo un fallo de accesibilidad dos fases en rojo que resultó ser un plazo
agotado, no una violación.

---

## F0 · `NUE-04` — casos similares, donde se están mirando los riesgos

**Qué hay.** `diagnosticar()` ya devuelve, por cada causa candidata, los casos
previos que la respaldan o la refutan (`confirmados`, `refutados`). Sólo los
pinta `CierreDiagnostico`, que es donde se va a cerrar un caso — no donde se
descubre que hay uno.

**Qué se hace.** Que `RiesgosTanque` y `RiesgosVibracion` enseñen, junto al
riesgo activo, «esto ya pasó N veces» con acceso al caso. Sin recalcular nada:
se pide a `/api/diagnostico`, que es el mismo motor.

**Lo que no se hace.** Puntuar aquí. La banda y el orden los da el dominio
(§4.3); una vista que ordene casos por su cuenta ya está rompiendo la capa.

**Cómo se comprueba.** Una prueba de que la vista pide y pinta; y una de que
con cero casos **no** dice «0 veces» sino que no dice nada — un contador a cero
se lee como «es la primera vez», que es una afirmación que no se puede hacer
sobre un índice que puede estar vacío por no haberse construido (§2.4).

---

## F1 · `GET /api/diario` — el sustrato de Turno y del cuaderno

**Qué se hace.** Abrir la lectura del diario de accionamientos:

```
GET /api/diario?desde=&hasta=&limite=&cursor=    con exigirRol
```

Paginado con cursor, porque el archivo crece sin techo y una vista de turno
sólo quiere unas horas. Con `exigirRol` porque dice **quién** accionó qué.

**Lo que no se hace.** Escribir. El diario lo escriben `controlRoutes` y el
acuse, cada uno en su sitio; esta ruta lee.

**Cómo se comprueba.** Contrato HTTP en `backend/test`: que pagina de verdad
(dos páginas encadenadas no repiten ni saltan entradas), que sin rol da 403 y
no 404, y que un archivo con **la última línea a medias** se lee hasta la
penúltima — que es la propiedad que `lib/diario.mjs` eligió JSONL para tener, y
que sólo se puede afirmar si alguien la prueba.

---

## F2 · `NUE-01` — vista de Turno

**Qué se hace.** Una pantalla que contesta «¿qué ha pasado en mi turno?»:
accionamientos (F1), eventos de alarma (el derivador del 12-09), casos abiertos
y cerrados. Un rango que por defecto es el turno en curso.

**La decisión ya está tomada, y no aquí.** Mi primer borrador de esta fase
proponía inventarse «las últimas 8 horas». No hace falta y sería peor:
`shared/periodo.js` **ya tiene un resolvedor de turnos** (`resolverPeriodo`,
`leerTurnos`), configurable por `IA_TURNOS` (`manana=6-14,tarde=14-22,…`), y
vacío por defecto **a propósito**. Su cabecera dice por qué, mejor de lo que yo
lo habría dicho:

> «sin el horario real de la planta, un turno inventado devolvería datos
> verdaderos de las horas equivocadas, que es indistinguible de la respuesta
> correcta. Preferimos decir que no está configurado.»

Así que esta vista **lee de ahí**, no define nada. Con `IA_TURNOS` configurado,
el rango por defecto es el turno en curso y se llama por su nombre. Sin
configurar, la vista ofrece un rango explícito («últimas 8 h») y **dice que los
turnos no están configurados**, con la variable que los configuraría — que es
lo que §4.6 pide de un mensaje: qué falta y cómo resolverlo.

Es además dominio compartido que ya usa el asistente: si esta vista definiera
su propio turno, la misma pregunta tendría dos respuestas según dónde se hiciera
(§2.6).

**Cómo se comprueba.** Que con `IA_TURNOS` configurado el rango es el turno y
lleva su nombre; que sin configurar **no** se inventa uno y el aviso nombra la
variable; que las tres fuentes se piden por separado y la caída de una **no**
vacía las otras dos (el patrón de `leerSerie` con los tramos); y que un turno
sin nada lo dice, en vez de tres tablas vacías.

---

## F3 · `NUE-02` — línea de tiempo por máquina

**Qué se hace.** Los hechos de una máquina en un eje temporal común: alarmas
(entrada/salida/duración, que el derivador ya da), accionamientos, casos.

**Por qué después de F2.** Porque es la misma consulta con otra forma. Si F2
resolvió de dónde salen los hechos, esto es presentación; si se hace al revés,
se resuelven dos veces.

**El riesgo concreto.** Es la fase que puede pedir una librería. Antes de
añadir ninguna: un eje temporal con divs posicionados en porcentaje es unas
pocas decenas de líneas y ya hay precedente en el proyecto. Si aun así hace
falta, **trozo diferido y medida en §2** (§0.5).

**Cómo se comprueba.** Que dos hechos simultáneos no se tapan; que un tramo sin
hechos se distingue de un tramo no consultado (§2.4, otra vez: un eje vacío no
puede significar las dos cosas); y que la máquina de la línea es la que se pidió
— cruzar tanque y vibraciones en un eje es exactamente lo que `NO_COMPARTEN`
prohíbe (§2.1).

---

## F4 · `NUE-06` — barra de contexto, para las dos máquinas

**Qué se hace.** Generalizar `EstadoMaquinaBanner` a un indicador por máquina,
tal como su propia cabecera dice que hay que hacerlo: **otro indicador con su
propio tag**, no una condición más dentro del que hay.

**Lo que no se hace.** Un indicador genérico que lea «el tag de estado» de una
máquina cualquiera. «Encendida» no significa lo mismo en las dos, y el registro
(`SISTEMAS`) es quien sabe qué señal mira cada una.

**Cómo se comprueba.** Que en una pantalla de vibraciones no aparece el estado
de la bomba del tanque — el cruce concreto que la cabecera actual documenta
como el motivo de existir del filtro por sección.

---

## F5 · `NUE-07` — navegación por módulo

**Qué se hace.** Que el cambio de módulo sea un gesto, no recorrer una lista de
cinco secciones. El árbol ya sale del registro (`buildNav.js`), así que esto es
presentación sobre una estructura que ya existe.

**Lo que se respeta.** `buildNav.js` no lleva texto a propósito: se construye
una vez al evaluar el módulo, y un texto ahí se congelaría en el idioma de
arranque. Lo que se añada sigue esa regla o repite un fallo ya resuelto.

**Cómo se comprueba.** Que el árbol sigue derivándose del registro (una ruta
nueva aparece sola); y que cambiar de idioma repinta también esto.

---

## F6 · `NUE-03` — bandeja de propuestas

**Qué se hace.** Un sitio donde se acumula lo que el sistema propone y aún no
ha visto nadie: riesgos nuevos, casos similares que aparecieron solos (F0),
diagnósticos sin cerrar.

**La frontera que importa.** Una propuesta **no es una orden**. Nada de esta
bandeja acciona planta por sí solo; acciona quien pulsa, por la ruta de control
que ya existe, con su diario y su rol. El motor puntúa y el modelo narra (§2.3);
esta bandeja enseña, y nada más.

**Cómo se comprueba.** Que una propuesta aceptada deja rastro (diario), que una
descartada también —«no lo hice» contesta a la misma pregunta que «lo hice», que
es el argumento de `lib/diario.mjs`— y que la bandeja vacía dice que está vacía.

---

## F7 · `NUE-08` — asistente acoplado, de ida y vuelta

**Qué hay.** `contextoDeVista.js`: el asistente sabe qué pantalla tienes
delante, con su frontera probada (sólo identificadores, ningún valor).

**Qué se hace.** La vuelta: que una respuesta pueda llevarte a la pantalla de la
que habla. El canal ya existe y se llama `preguntaExterna.js`; esto es su
simétrico.

**La frontera NO se mueve.** Sigue sin viajar un solo valor:
`ChatSchema.contexto` es `strict()` y rechaza cualquier campo que no sea uno de
los cuatro identificadores. Navegar necesita un id de ruta, no una medida.

**Cómo se comprueba.** Que el esquema sigue rechazando un campo de más (la
prueba ya existe: que siga en verde es la mitad del trabajo); y que un id de
ruta que no existe no rompe la aplicación.

---

## F8 · `NUE-10` — cuaderno de planta

**Qué se hace.** Notas de quien está delante de la máquina, con su hora y su
autor, junto a los hechos de F1. Lo que un operador escribiría en un cuaderno
de papel: «cambié el filtro», «la bomba hace ruido al arrancar».

**Dónde vive.** En `datos/`, JSONL, con el mismo criterio que
`lib/diario.mjs` — y por los mismos motivos, que ya están escritos ahí: una
línea se añade sin reescribir el archivo, y un corte a mitad deja legible todo
lo anterior. **No es una base de datos** (§2.2).

**Lo que no se hace.** Mezclarlo con el diario de accionamientos. El diario es
lo que hizo el sistema; el cuaderno es lo que dice una persona. Juntarlos
borraría la diferencia entre un hecho registrado y una afirmación.

**Cómo se comprueba.** Que una nota sobrevive al reinicio; que el autor y la
hora no los pone el cliente (los pone el servidor, o son falsificables); y que
el archivo a medias se lee hasta la penúltima línea.

---

## F9 · Pantalla de acceso y renovación (`SEG-01`, segunda mitad)

**Qué se hace.** Lo que le falta al tablero para saber pedir un token:
pantalla de acceso, guardado, envío en cada petición, y renovación antes de que
caduque contra `/api/auth/renovar`.

**La pregunta difícil, que el Plan 22 dejó escrita.** *«Qué pasa cuando caduca a
mitad de un turno en un wallboard sin teclado».* Es real: `modoMuro` existe
para un monitor a tres metros sin teclado ni ratón, encendido el turno entero.
Una pantalla de acceso que aparezca ahí a las cuatro de la mañana deja el muro
en blanco hasta que alguien suba con un teclado.

Lo que este plan hace con eso: **la renovación se intenta antes de caducar, y
un muro que no puede renovar lo dice sin tapar los datos** — un aviso, no un
modal. Un dato viejo señalado como viejo es más útil que una pantalla de acceso
que nadie va a rellenar. Es la misma regla del latido: lo que está en la pared
no puede mentir sobre su frescura.

**Lo que NO se hace.** Encender `AUTH_HABILITADA`. Queda posible, no puesta
(§0.4).

**Cómo se comprueba.** Con `AUTH_HABILITADA=true` en las pruebas: que sin token
se ve la pantalla y con token se pasa; que un token caducado se distingue de
uno inválido —son dos arreglos distintos, y el backend ya los distingue—; que la
renovación ocurre antes de caducar y no después de un 401; y que en modo muro
un fallo de renovación avisa **sin** vaciar la pantalla.

---

## F10 · `NUE-09` — muro multi-máquina

**Qué hay.** `modoMuro.js` (cómo se pinta) y `LatidoMuro` (que está vivo).

**Qué se hace.** Qué se pinta: las dos máquinas a la vez, cada una con su
estado, sus alarmas activas y su frescura propia.

**La regla que no se puede romper, y es la de este proyecto entero.** Las dos
máquinas comparten pantalla, **no comparten dato**. `NO_COMPARTEN` en
`shared/eva/comun/sistemas.js` impide cruzar dos máquinas con distinto PLC; un
muro que enseñe «3 alarmas» sumando las dos instalaciones ya rompió esa regla,
aunque el número esté bien. Cada máquina trae su cifra, con su nombre.

**Y la frescura es por máquina.** Si el tanque va al día y vibraciones lleva
media hora sin dato, el muro tiene que decirlo de vibraciones, no dar un latido
común que promedie las dos. Un latido único es exactamente el fallo que
`LatidoMuro` existe para no repetir.

**Cómo se comprueba.** Que ninguna cifra agrega las dos máquinas; que la
frescura es por máquina; y que con una máquina caída la otra se sigue viendo.

---

## 1 · Riesgos de este plan

1. **`vendor` a 6 KB del techo.** Es el riesgo real y está medido (§0.5). La
   regla de trozo diferido lo contiene, pero cualquier fase que meta una
   librería tiene que decirlo en voz alta en §2. No se sube ningún techo: la
   tercera subida sin medición está descartada en el propio guion.
2. **Nueve vistas nuevas son muchas claves de i18n.** El Plan 24 destapó tres
   textos en español escritos a mano con la mitad de superficie. `verificar-i18n`
   y `verificar-textos` en cada fase, no al final.
3. **F9 toca el arranque de la aplicación entera.** Es la fase con más
   superficie de fallo del plan, y por eso no va la última: si destapa algo,
   quiero una fase de margen.
4. **El cruce entre máquinas.** F3 y F10 son las dos que podrían agregar tanque
   y vibraciones sin querer. La prueba de que **no** se agrega va en las dos.
5. **Redefinir lo que ya está resuelto** (F2). Mi primer borrador iba a
   inventarse un horario de turnos teniendo `shared/periodo.js` delante. El
   riesgo no es sólo duplicar: es que la misma pregunta conteste distinto según
   se haga por la vista o por el asistente (§2.6). Mitigado leyendo el dominio.
   **Es el riesgo a vigilar en todas las fases de este plan**, no sólo en F2 —
   cinco de las diez entregas resultaron tener ya construida su parte difícil
   (§0.1), así que la pregunta antes de escribir cada fase es qué existe ya.

---

## 2 · Resultado

### F0 · `NUE-04` — HECHA el 12-09-2026

`components/CasosPrevios.jsx`, montado en las dos tarjetas de riesgo. Pide
`/api/diagnostico` —el mismo motor, ninguna lógica propia— y enseña «Ya pasó N
veces antes» junto al riesgo, antes de decidir si se cierra el caso.

**Medido:** `index` 247,06 → **247,42 KB** (+0,36) de 450; `vendor` **264,04
KB**, sin tocar. Ninguna librería nueva, como pedía §0.5. 767 pruebas (+8), lint
0 errores, types limpio, los 28 verificadores, i18n en paridad.

**Dos cosas que destapó, y las dos son del mismo tipo: lo que este componente
NO puede hacer.**

1. **El enlace «ver los casos» se quitó al comprobar a dónde iba.** `CasosRag`
   filtra por `params.filtro` y nada más — no acepta `sistema` ni `riesgoId`, y
   su búsqueda por texto **no viaja en la URL a propósito** (se teclea letra a
   letra y llenaría el historial; lo explica su cabecera). El enlace habría
   abierto la lista completa sin filtrar: «ver los 3 casos» llevando a cuarenta
   hace que el contador parezca mentir. Se deja el número sin enlace.

2. **El componente pegaba al servidor con el simulador encendido**, y lo cazó
   `vibraciones-simulada.test.jsx` —que corta la red— antes del commit. Es
   literalmente el fallo que `DataSourceProvider` nombra en su cabecera:
   «acabaría dejando alguno pegando al servidor con el simulador encendido».

   El modo de fallo era **invisible**: la tarjeta se pintaba igual, porque el
   error de esta consulta se traga a propósito, y lo único que pasaba es que el
   tablero simulado llamaba tres veces a un servidor que no estaba.

**Y un cambio de diseño que salió de arreglarlo.** El primer arreglo usaba
`useDataSource()`, que **lanza** fuera de su proveedor — correcto para quien
consume el origen, pero rompió once pruebas: convertía una hoja de presentación
en algo que exige el árbol de contextos entero para dibujarse, y las tarjetas de
riesgo se montan sueltas en las pruebas de idioma y de vocabulario.

De ahí sale `useEsSimulado()` (`lib/datasource/`), para hojas: el mismo dato,
y **sin proveedor responde «simulado»**. El defecto importa y está razonado en
su cabecera — «no lo sé» tiene que caer del lado que no toca la red, porque al
revés un tablero montado sin declarar su origen llamaría al servidor de planta.
`useDataSource()` no se tocó: quien de verdad depende del origen sigue usando el
que lanza.

---

### F1 · `GET /api/diario` — HECHA el 12-09-2026

`routes/diarioRoutes.mjs`, y `leer()` de `lib/diario.mjs` ampliado con rango y
cursor. Con `exigirRol('operador')`.

**Medido:** 324 pruebas de backend (+13: 7 de `leer()`, 9 de la ruta, 3 de la
guarda con `AUTH_HABILITADA=true`), los 28 verificadores —incluido `codigos`,
que exige que el error nuevo se sepa decir en los dos idiomas—, lint 0 errores.

**Lo que se decidió al escribirla, y no estaba en el plan:**

1. **El cursor es un ÍNDICE, no una fecha.** Con una fecha, dos entradas del
   mismo milisegundo —posible, el diario anota en ráfaga— caen las dos en el
   borde y la página siguiente repite una o se salta otra. La prueba que lo
   fija encadena tres páginas y comprueba que se ven las diez entradas **y que
   no hay duplicados**; mirando una sola página no se vería.

2. **`podas` viaja en la respuesta aunque sea 0.** Una poda dice que faltan
   entradas que sí existieron. Sin ese número, un turno podado y un turno
   tranquilo llegan idénticos al cliente (§2.4).

3. **Un rango invertido se rechaza con 400.** Devolver `[]` habría sido más
   fácil, pero vacío se lee como «no pasó nada en esas horas» — una afirmación
   sobre la instalación a partir de un error de quien pregunta.

4. **El filtro por fecha va ANTES de paginar.** Al revés, una página de 50
   podría quedarse en 3 tras filtrar y parecería que no hay más, cuando el
   resto del rango está más atrás en el archivo.

5. **Una entrada sin fecha legible no se descarta al acotar.** Una línea
   `ilegible` es la constancia de que algo se perdió; filtrarla por una fecha
   que no tiene la borraría justo del rango que alguien está investigando.

**Y una que sí estaba, confirmada:** el rol. Es la única lectura de este backend
que lo lleva, y se ejerce con el interruptor encendido en las pruebas — una
guarda que nadie ha ejercido es una promesa, no una guarda.

---

### F2 · `NUE-01` — HECHA el 12-09-2026

`views/comunes/TurnoEva.jsx` + `turnoEnCurso()` en `@shared/periodo.js` +
`turnos` publicado en `/api/health` + `lib/api/diarioApi.js`.

**Medido:** 776 pruebas de frontend (+9) y 334 de backend (+10), los 28
verificadores, lint 0 errores y de vuelta a los 5 avisos de siempre, types
limpio. Bundle: `index` 247,79 → **250,34 KB** de 450.

**El riesgo #5 del plan se cumplió, y se corrigió antes de escribir código.**
La fase iba a inventarse «las últimas 8 horas» como definición de turno.
`shared/periodo.js` ya tenía `leerTurnos` e `IA_TURNOS`, vacío por defecto a
propósito, con el motivo escrito: «un turno inventado devolvería datos
verdaderos de las horas equivocadas, que es indistinguible de la respuesta
correcta».

Lo que faltaba de verdad era otra cosa: **`turnoEnCurso()`**. `resolverPeriodo`
parte de lo que ESCRIBE una persona («el turno de noche»); una vista tiene un
reloj y necesita la pregunta inversa. Se añadió al mismo archivo, con sus ocho
pruebas — y lo que más se prueba es el turno que cruza medianoche (`noche=22-6`),
donde un `desde <= h < hasta` escrito sin pensar falla dos veces: a las 23:00
diría que no hay turno, y a las 3:00 tampoco. Además, a las 3:00 el turno
**empezó ayer**; sin eso la vista se comería las primeras cinco horas.

**Un fallo que destapó su propia prueba, y era el de esta pantalla entera.** Al
contar sólo los eventos, que fallaran TODAS las alarmas se pintaba como
«ninguna alarma entró en esta ventana»: un historiador caído se leía como un
turno limpio. Corregido contando también las fuentes perdidas, y fijado con una
prueba propia.

**El horario viaja por `/api/health`.** Es un hecho del despliegue que el
tablero no puede deducir, igual que `relojes` — y el campo va como objeto, no
como booleano, para que «no hay turnos» y «hay tres» se distingan.

**Y una cifra que hay que mirar: `vendor` 264,04 → 265,14 KB, quedan 4,86.**
No es una librería nueva: son dos iconos de `lucide-react` (`ClipboardList`,
`Siren`) que `routes.jsx` importa a nivel de módulo, y `lucide-react` **no está
troceado** en `vite.config.js`, así que cae en el catch-all de `vendor`. Con
cinco fases por delante que añaden vistas —y cada vista, su icono— esto toca el
techo antes del final del plan. Ver §1 riesgo 1: el plan no sube techos, así
que lo que corresponde es trocear `lucide-react`, y es una decisión que se
consulta antes de tomarla.

---

### F3 · `NUE-02` — HECHA el 12-09-2026

`components/LineaDeTiempo.jsx`, montada en la vista de Turno: una línea por
máquina, con tres carriles (accionamientos, alarmas, casos).

**Medido:** 787 pruebas de frontend (+11), los 28 verificadores, lint 0 errores,
types limpio. Bundle: `index` 250,34 → **251,02 KB**; **`vendor` sin tocar**, y
ésa era la cifra a vigilar — **ninguna librería nueva**, como pedía §0.5.

**Sin librería, y la decisión tiene número.** Un eje temporal son divs
posicionados en porcentaje: ~60 líneas. Una librería habría entrado en `vendor`
—que acababa de subir a 330 justo por este tipo de goteo— y «diferida» no
habría significado nada, porque la pantalla ES el eje.

**Lo que encontró esta fase y no estaba previsto: las alarmas son del tanque.**
Las nueve del catálogo llevan `naturaleza: "alarma"` en
`shared/eva/tanque/senales.js`; **vibraciones no tiene ninguna declarada**. Es
la misma asimetría por la que el Plan 24 mandó `USO-05` al Plan 26, y aquí
obliga a un tercer estado de carril:

| Estado | Qué significa | Cómo se pinta |
|---|---|---|
| vacío | se miró y no hubo nada | «sin hechos» |
| incompleto | una fuente no se pudo leer | «incompleto», en ámbar |
| **no aplica** | **no hay nada que consultar** | «no hay alarmas declaradas para esta máquina», con el carril en trazo discontinuo |

Sin el tercero, el carril de alarmas de vibraciones diría «sin hechos» — que
afirma que se miró. Se miró nada.

**Y la regla que este componente no puede romper.** `NO_COMPARTEN`: dos marcas
alineadas en la misma vertical *se leen* como relacionadas aunque nadie lo diga.
Por eso son dos líneas separadas y no un eje común, y hay una prueba de que un
caso del tanque aparece **una sola vez** en toda la pantalla.

---

## 3 · Cierre del plan

_(Se rellena al terminar.)_
