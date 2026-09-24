# Backlog · Backend

> **Objetivo de la rama.** Que dar de alta una máquina nueva sea añadir una
> entrada al registro y su catálogo, sin tocar el asistente, sus herramientas
> ni el transporte. Todo lo de aquí se ordena por lo que costaría el día del
> alta de la **máquina #3**, no por lo que parece más grave leyéndolo.

> **Cómo leer esto.** Cada entrada dice qué pasa HOY, qué se rompe cuando llegue
> la #3 y qué tamaño real tiene el arreglo.

> **Lo específico del asistente vive aparte**, en
> [`MEJORAS-ASISTENTE.md`](MEJORAS-ASISTENTE.md): treinta mejoras de veracidad,
> herramientas y capacidades. Este backlog es del backend como sistema; aquél,
> de lo que el modelo puede preguntar y de cuánto se puede confiar en lo que
> contesta. Lo medido va como medido; lo que es
> una estimación, lo dice. Nada aquí es un deseo: todo sale de código que está
> en el árbol y de pruebas que se ejecutaron.

---

## Estado a 28-08-2026

| Verificador | Comprobaciones |
|---|---|
| `verificar-herramientas` | 114 |
| `verificar-backend` | 73 |
| `verificar-chat` | 44 |
| `verificar-riesgos-vibracion` | 40 |
| `verificar-riesgos` | 30 |
| `verificar-transporte-falso` | 21 |
| `verificar-pronostico` | 18 |
| `verificar-aprendizaje` | 13 |

`herramientas.mjs`: **1123 líneas** (eran 4100). Reparto **completo**: las 19
herramientas viven en `backend/ia/herramientas/`, una subcarpeta por familia.

---

## B1 · Reparto de herramientas — **COMPLETADO (28-08-2026)**

Las cinco fases están hechas. `herramientas.mjs` pasa de **4100 a 1123 líneas**
y las diecinueve herramientas viven en `backend/ia/herramientas/`, una
subcarpeta por familia:

| Familia | Herramientas | Líneas | Recibe |
|---|---|---|---|
| `aprendizaje/` | 3 | 211 | nada |
| `registro/` | 1 | 48 | nada |
| `maquina/` | 3 | 304 | `client`, `readOnly`, ayudantes de máquina |
| `historicos/` | 9 | 1298 | `client`, `turnos`, `reportes`, ayudantes |
| `documentacion/` | 3 | 515 | `indiceDocumentos` |

Con `lib/` compartido: `formato`, `respuesta`, `limites`, `maquina`, `historia`.

**Lo que quedó pendiente de esta tarea** está ahora en B3 (el índice de nombres
de señal, que sigue en el ensamblador porque su reparto depende de
parametrizarlo por máquina) y en B7 (`diagnostico` como orquestador).

> **Dos cosas que el reparto destapó, y que la suite atrapó:**
>
> - **La ruta del `import()` diferido de `reporte.mjs`.** Al mover
>   `generar_reporte` a su familia, `await import('./reporte.mjs')` dejó de
>   resolver. El error era el mensaje amable de «faltan las dependencias del
>   backend», así que en producción se habría visto como un problema de
>   instalación de `pdfkit`, no como una ruta rota.
> - **`estado_del_sistema()` sin argumento.** `generar_reporte` lo llamaba sin
>   `sistema`, que es obligatorio desde que las herramientas sirven a cualquier
>   máquina. El reporte caía al respaldo «sin dato» **en silencio**: la tabla
>   salía vacía sin decir por qué.

---

## Auditoría del 22-09-2026 — contrastado con el código

> Cada punto se buscó en el árbol el mismo día que se cerró el Plan 41. Lo
> que sigue abajo es el texto original, que explica el porqué; esto dice qué
> queda.

| | Estado real |
|---|---|
| **B2** switch por máquina | **PARCIAL, resto bloqueado por la rama.** Una configurada se evalúa con `tipo.evaluarRiesgos` (Plan 38 F1); el `switch` sólo conserva `case 'tanque'`. Desaparece con la reapertura |
| **B3** dos resolvedores | **MITAD HECHA** (Plan 41 F2): el tipo deriva los alias de vibraciones. La unificación con el `SINONIMOS` del tanque, con la reapertura |
| **B4** pronóstico contra el tanque | **ABIERTO**, sin urgencia: vibraciones sigue sin mecanismos de desgaste declarados, así que la para la primera guarda, la legítima |
| **B5** bundle | **RESUELTO.** Verificador en verde con techos medidos (343,6/450 y 269,1/330) |
| **B6, B7** fronteras | Siguen siendo fronteras a vigilar, no tareas |
| **B8** cobertura | Ver corrección abajo: **una de sus tres afirmaciones ya es falsa** |
| **B11** color del PDF por palabras | **HECHO el mismo día**: la fila lleva `clave` y `colorDeFila` colorea por ella; las palabras quedan de respaldo |
| **B12** el tipo describe un SM 1281 | Informativo; sin cliente con otro equipo, no se toca |
| **B13** banderas constantes | **HECHO el 22-09-2026 (Plan 42).** Contra planta: las 35 «sin variación» de `vib-motor-03` pasaron a **0**; 50 constantes registradas (las once banderas de alarma incluidas), sin forzar nada |
| **B14** ventanas anchas vacías | **NUEVO** (Plan 42 F0). 72 h y 168 h devolvieron 0 muestras con 20 páginas de continuación vacías |
| **B15** `MINIMO_COMUNES` con pocas marcas | **NUEVO** (Plan 42 F2). Series con 9–14 marcas y valores enteros salen «compartidas» entre sí |

---

## B2 · `evaluarRiesgosDe` sigue siendo un `switch` por máquina

**Hoy.** [`herramientas.mjs`] mantiene un `switch (sistema.id)` con una rama
por instalación. Está documentado, no escondido, y desde el commit
«La máquina que aún no existe dejaba de salir en verde» su `default` ya no
produce una respuesta en verde: `riesgos_activos` devuelve `fallo()` cuando
`evaluadas === 0`.

**Por qué sigue ahí.** Las dos funciones NO reciben lo mismo: `evaluarRiesgos`
espera el `Sistema` del tanque y `evaluarRiesgosVibracion` espera
`{ canales, variador, alarmas }`. Declarar `riesgos: evaluarRiesgos` en el
registro exige que las dos acepten la forma común de `estadoMaquina.js`, es
decir, reescribir los dos motores de reglas.

**Qué cuesta el día de la #3.** Una línea en el `switch` — y si nadie la añade,
un error explícito en vez de un silencio. **No bloquea el alta.**

**El arreglo de verdad.** Que cada entrada del registro declare su
`riesgos(estado)` y el `switch` desaparezca. Depende de que los dos motores
acepten la proyección común. Con B1 hecho, este `switch` ya vive en
`herramientas/lib/maquina.mjs` —156 líneas, junto a `leerMaquina`— así que
sustituirlo es ahora un cambio local y visible.

---

## B3 · La resolución de nombres de señal está partida en dos

**Hoy.** Hay dos resolvedores y no hacen lo mismo:

- `resolverSenal` (en `herramientas.mjs`): índice con las cuatro formas del
  catálogo, tabla de `SINONIMOS` escrita a mano y respaldo por contención con
  desempate. **Sólo conoce el tanque.**
- `sistemasDeSenal` (en `shared/eva/sistemas.js`): recorre el registro entero,
  con igualdad, contención literal y cobertura por palabras. **Sirve a todas
  las máquinas pero no tiene sinónimos.**

`historia_de_senal` los une a mano desde el 28-08-2026
(`resolverSenalDeSistema` en `historicos/index.mjs`): con `sistema` usa el
registro, sin él el índice del tanque. Funciona y está documentado como
transición, pero es un tercer sitio donde se decide lo mismo.

**Resuelto el 23-09-2026 (Plan 44 F3.6) por ausencia de índice.** El índice del
tanque (`SINONIMOS`, `resolverSenal`, `senalesMencionadas`, `senalDesconocida`)
se borró del asistente; toda señal se resuelve DENTRO de la máquina del turno
con lo que declara el registro (clave, etiqueta y alias de cada máquina), en
`backend/ia/herramientas/lib/senales.mjs`. Los sinónimos del tanque escritos a
mano volverán, si vuelven, como `alias` de su configuración cuando entre como
máquina configurada (Plan 43): es exactamente el sitio que este apunte pedía.

**El síntoma.** Quien pregunta por «la bomba» o «el voltaje» acierta en el
tanque —tiene sinónimos— y quien pregunta por un equivalente coloquial de
vibraciones, no: `sistemasDeSenal("vibración del motor")` devuelve `[]`.

**Qué cuesta el día de la #3.** La máquina nueva nace sin sinónimos y sus
señales sólo se encuentran por su nombre técnico o su etiqueta.

**Y hay ocho herramientas que siguen sin `sistema`.** `analisis_de_senal`,
`perfil_de_senal`, `correlacionar_senales`, `grafico_de_senal`,
`generar_reporte`, `valor_en_momento` y `comparar_periodos` sólo sirven al
tanque, aunque las demás máquinas ya tengan series que podrían alimentarlas.
Añadir el argumento a cada una es mecánico —el patrón está en
`historia_de_senal`— pero son ocho, y el arreglo bueno es que compartan un solo
resolvedor en vez de repetirlo.

**El arreglo.** Que `SINONIMOS` sea un campo del registro (`sinonimos: {...}`
por máquina), que exista UN resolvedor por máquina, y que las ocho lo usen.
Es también lo que permitiría sacar `resolverSenal` del ensamblador: hoy
`documentacion/` e `historicos/` lo importan de él, y ése es el último hilo que
las ata al archivo grande.

> **MEDIDO el 11-09-2026, antes de empezarlo — y por eso NO se empezó.**
>
> Se fue a hacer y la medición dijo que, tal como está descrito arriba, el
> resultado acertaría MENOS que hoy. Queda escrito para que quien lo retome no
> lo redescubra a medio camino.
>
> **1 · La tabla de sinónimos envejeció con el Plan 27.** Se escribió cuando el
> tanque tenía OCHO señales; hoy tiene **52**. Ocho de sus entradas ya chocan
> con el catálogo ampliado:
>
> | sinónimo | debería dar | lo que el registro devuelve hoy |
> |---|---|---|
> | `voltaje` | `tensionLinea` | `voltajeBusDc`, `voltajeSalidaVariador` |
> | `bomba` | `cargaMotor` | `manualAutoBa` |
> | `modo` | `modoVdf` | `modoVdf` + tres `manualAuto*` |
> | `variador` | `modoVdf` | + `fallaVariador`, `frecuenciaSalidaVariador`, `corrienteVariador` |
> | `llenado` | `nivelTanque` | `arranqueParoLlenado`, `setpointLlenado` |
> | `motor` | `cargaMotor` | + `velocidadMotor`, `voltajeSalidaVariador` |
> | `tanque` | `nivelTanque` | + `temperaturaTanque` |
> | `manual` | `modoVdf` | tres `manualAuto*` |
>
> Cinco señales reclaman «voltaje/tensión» y siete «bomba/motor».
>
> **2 · Y el resolvedor del tanque acierta por accidente, no por criterio.**
> `construirIndice` registra con `if (!indice.has(k))`: **gana el primero que
> llega**, y los sinónimos se insertan en el orden del catálogo. Que
> `resolverSenal('voltaje')` dé `tensionLinea` —cosa que una prueba fija— es
> consecuencia de que esa señal aparece antes en el array, no de ninguna regla.
> Subir la tabla al registro tal cual rompe esa casualidad y convierte un
> acierto frágil en un fallo visible.
>
> **3 · Lo que hay que hacer ANTES, y no es refactor.** Decidir, palabra por
> palabra, cuál de las candidatas gana cada sinónimo ambiguo. Eso es
> conocimiento de la instalación —¿«la bomba» es la carga del motor o su mando
> manual/automático?— y lo tiene quien opera, no quien programa. Con la tabla ya
> desambiguada, subirla al registro es mecánico y seguro.
>
> **4 · Además, el apartado de arriba está desactualizado en un punto:** decía
> «ocho herramientas siguen sin `sistema`» y enumeraba siete que **ya lo
> tienen** (`analisis_de_senal`, `perfil_de_senal`, `correlacionar_senales`,
> `grafico_de_senal`, `valor_en_momento`, `comparar_periodos`). Medido con
> `DEFINICIONES`: **20 de 25 aceptan `sistema`**. De las cinco que no, cuatro no
> lo necesitan —`sistemas_de_la_planta` las lista todas, `controlar_bomba` es
> del tanque por definición, `diagnostico` se niega explícitamente para otras
> máquinas y `limites_del_manual` busca en manuales—. La única discutible es
> `generar_reporte`.
>
> **Lo que sí estaba listo:** `aliasDe` ya es parte del contrato del registro y
> las dos máquinas lo implementan; el hueco para los sinónimos está previsto y
> documentado en `sistemas.js`. El trabajo pendiente es de dominio, no de
> estructura.

> **La mitad de vibraciones, HECHA el 22-09-2026 (Plan 41 F2).** «La máquina
> nueva nace sin sinónimos» ya no pasa para el tipo `vibraciones`: el tipo
> deriva los alias de rol × apoyo (`tipo.aliasDe`, `shared/eva/tipos/
> vibraciones.js`) y `construirSistema` los suma, con una tabla corta de
> palabras del oficio. Se hizo en el TIPO y no en el registro porque las
> palabras son del oficio, no de la máquina, y así no hay tabla que envejezca
> con cada alta.
>
> **La mitad del tanque sigue tal cual**, y es a propósito: su `SINONIMOS` con
> las ocho entradas ambiguas de arriba y su `resolverSenal` no se pueden tocar
> mientras dure la rama `Vibraciones1.0`. La unificación en UN resolvedor —lo
> que este apartado pide de fondo— queda para la reapertura, y cuando llegue
> ya tendrá el patrón: lo que hoy hace `tipo.aliasDe` para vibraciones es lo
> que un tipo `estacionLlenado` haría con la tabla del tanque, desambiguada
> antes por quien opera (punto 3).

---

## B4 · `pronostico_de_desgaste` está escrito contra el tanque

**Hoy.** Resuelve el sistema, pero el cuerpo usa `SENALES_PRONOSTICO`
—constante local con claves del tanque—, `esHistorizada` y `leerSerieEnRango`
de `senales.js` e `historia.js`.

Tiene **dos guardas**, y el orden es deliberado: primero la de CAPACIDAD (sin
histórico ni mecanismos declarados, con la razón de dominio), después la de
PARAMETRIZACIÓN (`id !== 'tanque'`), que es la que impide que una máquina con
histórico entre a leer las señales del agua.

**Qué cuesta HOY, y ya no es hipotético.** Vibraciones tiene series desde el
28-08-2026. Le falta `desgaste` —sus mecanismos no están escritos— así que hoy
la para la primera guarda, la de capacidad. El día que se declaren, la parará la
segunda: **la máquina tendrá datos suficientes para un pronóstico y no podrá
tenerlo** porque el cuerpo lee el catálogo del agua.

Ha dejado de ser una limitación teórica: es la siguiente en el camino.

**El arreglo.** Que `SENALES_PRONOSTICO` salga del registro (`series.pronostico`
o derivarlo de `series.historizadas()`) y que la lectura de series use la ruta
y el agregado que declara cada máquina. La segunda guarda se cae sola cuando ya
no haya un `id` que citar.

---

## B5 · Presupuesto de bundle incumplido *(preexistente)*

**Hoy.** `verificar-bundle` **falla**: `vendor` ocupa 161.84 KB sobre un techo
de 90 KB.

**Medido.** Se comprobó contra HEAD sin los cambios de esta rama: da el **mismo
tamaño byte a byte**. Es anterior y no lo introdujo ningún trabajo reciente.

**Decisión.** Se deja como está y se anota aquí en vez de arreglarlo de paso:
mezclar un presupuesto de bundle con un barrido de código muerto o con un
reparto de módulos habría hecho ilegibles los tres.

**Qué hay que decidir.** O se sube el techo con una razón escrita, o se parte
`vendor`. Lo que no puede quedarse es un verificador que falla siempre: un
verificador en rojo permanente deja de leerse, y entonces no avisa el día que
diga algo nuevo.

---

## B6 · La forma común no la usan los motores de reglas

**Hoy.** `estadoMaquina.js` proyecta toda máquina a una forma única, y las
herramientas la usan. Pero `evaluarRiesgos` y `evaluarRiesgosVibracion` siguen
recibiendo el dominio crudo de cada máquina vía `estado.dominio`.

**Por qué está bien hoy.** Es deliberado y su cabecera lo explica: si la forma
común sustituyera al dominio, cada máquina nueva presionaría para meter ahí su
particularidad —el factor de cresta, el modo del variador, el reposo del
tanque— y en cinco máquinas sería un objeto con treinta campos opcionales que
no describe bien a ninguna.

**Qué vigilar.** Que `extra` de `estadoComun` no se convierta en el vertedero
que la separación evita. Hoy tiene un uso legítimo por máquina; si la #3 añade
el tercero sin una razón escrita, la frontera se está erosionando.

---

## B7 · `diagnostico` orquesta herramientas de otras familias

**Hoy.** Vive en `documentacion/` pero llama a `estado_del_sistema`,
`historia_de_senal` y `correlacionar_senales`, que siguen en la clausura
grande. Recibe `dameHerramientas()` —una función, no el objeto— porque cuando
se construye su familia el catálogo todavía no existe.

**Qué cuesta.** Nada funcionalmente; la indirección es de una línea y está
documentada. Pero significa que `documentacion/` **no es del todo
independiente**, y conviene revisarlo después de B1: cuando las otras tres
vivan en sus familias, hay que decidir si `diagnostico` se queda aquí (es quien
cruza manual y medida) o sube al ensamblador.

**Recomendación.** Que se quede. Cruzar lo documentado con lo medido es su
razón de ser, y el ensamblador debería ensamblar, no diagnosticar.

---

## B8 · Cobertura: lo que ninguna prueba mira

**Lo que sí está cubierto.** El alta de una máquina nueva tiene ya dos pruebas
que registran máquinas ficticias (`prensa` sin motor de reglas, `horno` con
histórico declarado) y comprueban que **no contesten en verde**.

**Lo que no.**

- **El ciclo de vida del sondeo por máquina.** Ninguna prueba comprueba que dos
  sistemas con `cadenciaMs` distinta sondeen por separado y no acaben en el
  mismo lote. Es la regla que `sistemas.js` declara innegociable y no tiene red.
- ~~**`SISTEMA` es una instantánea.**~~ **Ya no (22-09-2026):** desde el Plan
  33 F3 el registro es dinámico y `registrarSistema()` actualiza `SISTEMAS`,
  `SISTEMA` y `SISTEMA_IDS` a la vez (`sistemas.js`), con validación de id
  repetido y raíz solapada. El verificador `registro-configurado` lo cubre.
- **El backend contra ICONICS real.** Los verificadores corren con
  `fakeClient`. Los scripts `comprobar-*` existen para el servidor real pero no
  están en ningún flujo: se invocan a mano y nadie se acuerda.

---

## B9 · El health dice «token válido» mientras ICONICS devuelve el login — **HECHO (11-09-2026)**

> **Las dos piezas, y una prueba que las ata.** El cliente reconoce la respuesta
> de reautenticación en `request()` —por donde pasa toda salida— y la devuelve
> como `{ ok: false, status: 401, reautenticacion: true }` en vez de como un
> sobre bueno con HTML dentro. La marca viaja hasta `/api/health`, que tiene
> ahora su propia rama: «está pidiendo REAUTENTICACIÓN… se arregla reiniciando
> el puente», en los dos idiomas (`needsReauth`).
>
> **Dos señales, y hacen falta las dos** para no acusar de más: que el cuerpo
> sea texto —el JSON de una lectura nunca lo es— y que lleve `connect/authorize`
> o `signin-oidc`. Con una sola, un manual que hablara del flujo OIDC o un error
> en texto plano caerían aquí por error.
>
> **Lo que NO se hizo**, y queda dicho: renovar y reintentar automáticamente. La
> detección es lo que hace que el incidente se vea; el reintento haría que no se
> viera siquiera, y es un cambio de comportamiento sobre el camino de datos que
> merece su propia decisión. Hoy el operador lee qué pasa y reinicia.
>
> Probado sin planta: `backend/test/reautenticacion.test.mjs` levanta un ICONICS
> de mentira que devuelve la página de login con 200 —el cuerpo real, recortado—
> y comprueba el camino entero, incluido que el HTML no viaje como si fuera el
> valor de un punto.

### El problema, tal como se encontró

**Medido el 11-09-2026 con la planta delante**, en un backend con 7 h 53 min de
marcha. La pantalla de Salud mostraba:

```
Origen de datos        Con problemas
  Se alcanza https://bms-server y el token es válido,
  pero la última lectura (hace 2 s) no trajo NI UN valor de 52 puntos pedidos.
Puente hacia ICONICS   Funcionando
  Alcanzable: sí    Token: válido
```

Y lo que ICONICS estaba devolviendo de verdad a cada lectura era esto:

```json
{"ok": true, "status": 200,
 "payload": "<html><head><title>Working...</title></head>
             <form action=\"https://bms-server/.../connect/authorize\">…"}
```

La página de **login de OIDC**. La sesión había caducado en el servidor y el
puente estaba recibiendo el formulario de reautenticación en lugar de datos.

**Por qué el health no lo ve.** `tokenValid` sale de
`authenticator.hasValidToken()`, que es:

```js
return Boolean(accessToken) && Date.now() < expiresAtMs
```

Es decir: **comprueba nuestra memoria, no al servidor**. Si ICONICS invalida la
sesión por su cuenta —reinicio, expiración del lado del servidor, política de
sesiones— nuestro reloj sigue diciendo que el token vale hasta la hora que
guardamos. `estadoDeLosDatos` tiene una rama para `!tokenValid` con el mensaje
correcto («no hay token válido, revisa usuario y contraseña»), pero **no hay
ninguna rama para «el token parece nuestro y aun así el servidor nos manda al
login»**, que es el caso real.

**Por qué es peor que un fallo normal.** Es exactamente el modo que el
CLAUDE.md §2.4 señala: *un servidor que contesta y no dice nada*. La respuesta
llega con `ok: true` y `status: 200` porque, como petición HTTP, salió bien. El
tablero se quedó en «Conectando…» y «Sin dato», y **la pantalla que existe para
diagnosticar daba un diagnóstico equivocado**: decía «token válido» cuando lo
único que había que hacer era reautenticar. Se descubrió por casualidad, al
mirar el `payload` en crudo durante otra tarea.

**Qué haría falta.** Dos piezas, y la primera sirve sola:

1. **Que el cliente reconozca la respuesta de reautenticación.** Un `payload`
   que es HTML —o que contiene `connect/authorize`— no es una lectura, es una
   sesión caída. Hoy pasa por el mismo camino que un valor. Detectarlo permite
   además **renovar y reintentar una vez**, que es lo que un operador espera y
   lo que haría que el incidente no se viera siquiera.
2. **Que el health lo diga con esas palabras.** Una rama nueva en
   `estadoDeLosDatos`: «se alcanza el servidor, pero está pidiendo
   reautenticación: la sesión caducó del lado de ICONICS». Y que `tokenValid`
   deje de anunciarse como verdad absoluta cuando lo que sabemos es sólo lo que
   apuntamos nosotros.

**Tamaño.** Pequeño y acotado: el reconocimiento vive en `iconics/client.mjs`
(donde ya se normaliza la respuesta) y el mensaje en
`routes/systemRoutes.mjs`. Lo caro sería probarlo contra el servidor real con
la sesión caducada a propósito; con un doble que devuelva el HTML del
`authorize` se cubre el camino entero sin planta.

**Mientras tanto**, el síntoma a reconocer: *alcanzable sí, token válido, y
cero valores de todos los puntos pedidos*. Eso es sesión caducada — se arregla
reiniciando el puente.

---

## ~~B10~~ — la sonda del histórico pedía el punto EN VIVO, no el del archivo

**Hecho el 15-09-2026.** Un cambio de una línea: `pointName()` → `puntoHistorico()`.

**El síntoma.** La sonda devolvía «sin dato ni siquiera en los últimos días»
para TODOS los puntos del tanque: HTTP 500 en las analógicas y timeout de 15 s
en las ocho de `ALARMAS/`. El historiador funcionaba: por el camino de
producción las mismas señales daban 21 puntos en 6 h, y el commit `3864acb`
había recalibrado umbrales contra 849 muestras reales esa misma mañana.

**La causa, medida.** `/History` sólo contesta sobre el árbol PROPIO del
historiador (`hda:\Configuration\DEMO TANQUE\…`), no sobre el nombre `ac:` del
valor en vivo. Desde la reorganización del árbol del 09-09-2026, pedir `ac:`
da 500 en doce de las trece ramas — está documentado en la cabecera de
`puntoHistorico()` en `senales.js` y en §4 del Plan 27. Producción se actualizó
entonces (`series.punto` pasó a `puntoHistorico`); esta sonda se quedó atrás.

Mismo rango, misma señal, medido antes de tocar nada:

```
nivelTanque   ac:  → 500      hda: → 200, 35 muestras
presionRelativa ac: → 500     hda: → 200, 35 muestras
fallaVariador ac:  → 504      hda: → 200
```

**La hipótesis que esta entrada traía era FALSA.** Decía que la sonda saturaba
el servidor con sus 365 tramos y proponía espaciar peticiones o bajar
`TOPE_TRAMOS`. No: falla **en el primer tramo**, sin carga ninguna. Nada de la
búsqueda hacia atrás estaba mal — el algoritmo, que costó dos intentos, sigue
intacto. Se cambió el nombre que pide, y ya.

**Resultado.** Recorre las 52 señales y contesta: historia contigua desde el
18-08-2026 en `nivelTanque` y `temperaturaTanque` —coincide con lo medido el
02-09, que es la comprobación de que no miente—, desde el 08 o 09-09 en las
ramas nuevas. Los «sin dato» que quedan son verdaderos negativos: el servidor
responde 200 con cero muestras (comprobado en `mttoS1`, `arranqueParoS1`,
`setpointLlenado`, `potenciaActualVariador`).

**Las dos notas de método, que son lo que no caduca:**

1. El fallo de UN camino de lectura no autoriza a declarar caída la fuente.
   Antes de escribir «el historiador no sirve» en un plan, se prueba por el
   camino que usa producción. (Esto ya estaba escrito aquí y se cumplió.)
2. Y la que faltaba: **una hipótesis sobre la causa, aunque explique el
   síntoma, no es la causa.** «Satura el servidor» encajaba con los timeouts y
   con los 500, y era plausible sin ser cierta. Costaba una sola petición
   comprobarlo, y esa petición debió ir antes de escribir la entrada.

---

## B11 · El PDF colorea los estados por palabras que las etiquetas ya no dicen — **HECHO (22-09-2026)**

> **Lo que se hizo.** Cada fila de `tablaActual` lleva `clave` además de la
> etiqueta: en una configurada es el `estado` de la señal tal cual
> (`nominal`, `atencion`…); en el tanque, cuyas señales llegan al reporte ya
> descritas para el modelo —con el rótulo y sin la clave—, se recupera por la
> etiqueta exacta contra `ESTADOS` (`claveDeEtiqueta`, en `generar_reporte`),
> sin tocar el tanque. `reporte.mjs` exporta `colorDeFila(fila)`: por clave si
> la hay, y si no, el respaldo por palabras de siempre —que ahora también
> entiende «Fuera de límite» y «En banda»—. La síntesis automática cuenta
> «fuera» por clave igual. Probado en `backend/test/reporte-color.test.mjs`
> sin dibujar un PDF.

**Hoy.** `reporte.mjs·colorEstado` decide el color de una fila de la tabla de
valores actuales buscando «crit», «alarm», «normal», «ok»… en el texto del
estado. Las etiquetas de `shared/eva/tanque/estado.js` son «Fuera de límite»,
«En aviso», «En banda», «Sin dato»: la primera y la tercera no casan con
ningún patrón y salen en gris, igual que «sin criterio». Se vio el 22-09-2026
al pasar la tabla de una máquina configurada por `estadoInfo` (Plan 39 F4);
al tanque le pasa lo mismo desde que esas etiquetas existen.

**Propuesta.** Que la fila lleve la CLAVE del estado (`nominal`, `critico`…)
además de la etiqueta y que `colorEstado` mire la clave; el texto libre queda
sólo como respaldo. Es un cambio de `reporte.mjs` y de quien arma
`tablaActual` (`generar_reporte`), sin tocar el dominio del tanque.

---

## B12 · El tipo `vibraciones` describe un SM 1281, no «cualquier motor»

**Hoy.** Los 30 roles del tipo nacen de cinco listas en
`shared/eva/vibraciones/vibraciones.js` (medidas, banderas, vigilancias,
confianzas, variador), y cada uno declara el `tag` con que lo publica el
SIPLUS CMS SM 1281 de esta instalación. Desde el 22-09-2026 la comparación
tolera la grafía y hay un archivo de alias por rol
(`vibraciones/aliasDeTags.js`), así que un equipo que llame `VEL_RMS` a la
velocidad eficaz se absorbe escribiendo un alias — sin tocar reglas ni estado.

**Lo que eso NO resuelve, y hay que saberlo antes de prometer que «vale para
cualquier motor»:**

- **Un equipo que mida cosas distintas.** Si un servidor no publica el valor
  característico de daño, ese rol no existe en esa máquina y las reglas que lo
  necesitan no se evalúan. Se declara en las limitaciones (`construirSistema`),
  que es lo correcto, pero no se puede inventar.
- **Los apoyos son `S1`, `S2`, `S3`.** `CANALES` los declara el tipo; un motor
  con acelerómetros nombrados de otra forma no separaría el sufijo.
- **Las 18 reglas SÍ son portables**: declaran `necesita: ["vRMS"]`, conceptos,
  no tags. Ahí no hay acoplamiento que deshacer.

**Propuesta, sólo cuando llegue un cliente real con otro equipo.** Perfiles de
nomenclatura: un mismo tipo con varios diccionarios de tags, y al configurar se
elige el del fabricante. Hasta entonces sería adivinar qué alias hacen falta, y
el archivo de alias cubre el caso de uno en uno.

1. ~~**B1**~~ — hecho el 28-08-2026
2. ~~**B9**~~ — hecho el 11-09-2026
3. ~~**B10**~~ — hecho el 15-09-2026
4. ~~**B5**~~ — resuelto: verificador de bundle en verde con techos medidos
5. ~~**B11**~~ — hecho el 22-09-2026
6. ~~**B13**~~ — hecho el 22-09-2026 (Plan 42)
7. **B15** — el umbral de `mismaSerie` con pocas marcas: medir antes de tocar
8. **B14** — las ventanas anchas vacías del historiador: mirar si sigue así
9. **B4** — cuando vibraciones declare mecanismos de desgaste, no antes
10. **B8 (el ciclo de vida del sondeo)** — la red que falta
11. **B2 y la otra mitad de B3** — con la reapertura del tanque (Plan 33 F9)

**B6 y B7 no son tareas**: son fronteras que vigilar en la revisión de la #3.


## B13 · El sondeo no puede verificar una bandera que nunca cambió — **HECHO (22-09-2026, Plan 42)**

> **Lo que pasó.** Se midió primero (`scripts/medir-cadencia-historiador.mjs`):
> el grupo registra **sólo al cambiar**, pero cuando escribe una constante lo
> hace en los mismos minutos que las medidas (al reanudar la recolección).
> De ahí el criterio `registrada-constante` de `sondearSeries.mjs`: la mitad o
> más de las marcas de la constante son marcas de una serie propia del mismo
> sondeo. Contra planta, las 35 «sin variación» pasaron a 0 y las once
> banderas de alarma quedaron verificadas. Lo que no se puede afirmar —que dos
> constantes iguales sean distintas— lo declara la máquina en sus
> limitaciones. El detalle está en
> `docs/completados/PLAN-42-VERIFICAR-BANDERAS-CONSTANTES.md`. Lo que sigue
> es el texto original.

**Hoy.** `sondearSeries.mjs` marca `historyVerified: true` sólo cuando una
serie **varía** en la ventana y no coincide con otra. Es la salvaguarda
correcta contra el servidor que entrega una serie por otra (`aPeak_S1`, las
nueve `QC_*`). Pero un booleano legítimamente constante —`Alarma_S1` que nunca
alarmó, `FAULT_BMS` que nunca falló— **no puede pasar nunca**: «sin variación»
lo deja en `false`, y sin verificar no se ofrece como historia (§2.4).

**El síntoma, medido el 22-09-2026 (Plan 41 F4).** Las once banderas de
`vib-motor-03` tienen serie declarada y ninguna verificada. Como el Alarm
Server de GENESIS64 da 500 a `AlarmHistory` para cualquier punto (también del
tanque), unas «Alarmas» de la máquina configurada tendrían que ser flancos de
esas banderas, igual que hace el tanque — y hoy no hay ninguna de la que
derivarlos. F4 se cerró sin vista por esto.

**Lo que NO es la solución.** Marcar verificada una constante «porque es
booleana»: dos banderas constantes en 0 son indistinguibles entre sí, y el
servidor ya ha servido una serie por otra. Sería justo la afirmación que el
sondeo existe para no hacer.

**Lo que podría serlo, a medir antes.** Para una serie constante, comparar las
**marcas de tiempo** con las de una serie del mismo grupo que sí varía: si el
historiador escribió las mismas muestras a las mismas horas, la constante es
suya —está registrada, sólo que no pasó nada—. Distinguiría «registrada y
tranquila» de «no registrada», que es lo que hoy se confunde. Toca
`backend/lib/sondearSeries.mjs` y `verificar-sondeo-series`, y es una
decisión sobre qué significa «verificada»: se escribe primero en un plan.

**Cómo se desbloquea sin código.** Que una bandera alarme de verdad, se sondee
después, y el sondeo la vea variar. A partir de ahí `eventosDeAlarma` sobre su
serie da los flancos.

## B14 · Las ventanas de 72 h y 168 h del historiador devuelven páginas vacías

**Visto el 22-09-2026 por la tarde** (Plan 42 F0, `medir-cadencia-historiador`):
sobre `vib-motor-03`, la ventana de 24 h traía 569 muestras de `vRMS_S1` y las
de 72 h y 168 h devolvían **0 muestras con 20 páginas de continuación**, todas
vacías, sin error. Por la mañana la de 7 días sí traía material (Plan 41 §0).

**Lo que cuesta.** `POST /api/maquinas/:id/sondear` prueba 24 → 72 → 168 h y
se queda con la primera que verifique algo. Cuando la de 24 h no verifica nada
(máquina parada), las dos siguientes le cuestan **40 páginas por serie** para
no traer nada, y un sondeo de 86 series tarda minutos.

**Lo que NO se hace todavía.** Bajar `maxHistoryPaginas` o quitar ventanas:
sería subir o bajar un techo para callar un síntoma sin saber si es del
servidor de esa tarde o permanente (`CLAUDE.md` §6.2). Primero: repetir la
medida otro día con el mismo guion. Si se confirma, la ruta puede cortar una
ventana cuando la primera página venga vacía con continuación, o la lectura
puede declarar «páginas vacías» como motivo aparte de «truncada».

## B15 · `MINIMO_COMUNES = 8` se escribió pensando en cientos de marcas

**Visto el 22-09-2026** en el sondeo contra planta del Plan 42:
`UPPER_LEVEL_2`, `ACTUAL PWR_BMS`, `OUTPUT VOLTS_BMS` y `Numero de arranques`
salieron `serie-compartida` **entre ellas**. Tienen 9–14 marcas cada una en
24 h (se registran al cambiar) y 2–7 valores distintos, enteros. Ocho
coincidencias de valor sobre marcas comunes son alcanzables por azar entre
series que apenas cambian y toman valores pequeños. Por la mañana no pasaba:
con la ventana corrida, cambian las marcas que entran.

**Lo que cuesta.** Cuatro series que probablemente son legítimas no prometen
historia. Es el lado seguro del error —callar, no afirmar— y por eso no urge.

**Lo que se podría medir.** Si `mismaSerie` debe exigir, además de ocho
coincidencias, que las series tengan **variación suficiente** en las marcas
comunes (más de N valores distintos), o una fracción de las marcas totales.
La cifra tiene que salir de una medida sobre las series reales, no de un
número redondo. Toca `sondearSeries.mjs` y `verificar-sondeo-series`; se
escribe antes como fase de un plan.

> **Seguimiento del 22-09-2026 (noche).** Las nueve `QC_*` ya no entran aquí:
> el tipo las declara `seriesEquivalentes` y el sondeo las verifica aunque
> coincidan (Plan 42 §6); y tras reiniciar los servidores salieron propias por
> sí mismas. Quedan `OUTPUT VOLTS_BMS` y `Numero de arranques`, que son
> exactamente el caso de este punto: 9–14 marcas y valores enteros. En vivo
> no tenían dato cuando se midió (`medir-igualdad-en-vivo`), así que no se pudo
> discriminar por esa vía; repetir cuando el variador publique.

## B16 · `salud.test.mjs` depende de que un nombre DNS falle rápido

**Visto el 22-09-2026 por la noche** (Plan 42.5 F2.0): «sin ninguna lectura
todavía, lo DICE en vez de pintarlo mal» monta el puente con
`ICONICS_API_BASE: https://planta.local/api` y `ICONICS_FAKE=false`, y `GET
/api/health` tarda lo que tarde la red en decir que `planta.local` no
existe. En la línea base de esa misma noche pasó (399/399); tres horas
después falló por `timed out in 5000ms` corrida sola y en la suite. Es el
«rojo de entorno» que HANDOFF §1 ya citaba, ahora con la causa.

**Lo que cuesta.** Un rojo intermitente en la suite de backend que no dice
nada del código, y que enseña a ignorar el rojo.

**El arreglo.** Que la prueba no salga a la red: un nombre que resuelva a
una dirección no enrutable de forma inmediata (`http://127.0.0.1:1`), o
doblar el cliente de ICONICS como hacen las demás pruebas de rutas. Se
escribe como tarea aparte; no se subió el `timeout` para callarlo
(CLAUDE.md §6.2).

## B17 · `RUTA_APRENDIZAJE` es relativa al `cwd`, y la suite de backend escribe una bitácora aparte

**Visto el 22-09-2026 por la noche** (Plan 42.5 F3): `backend/datos/aprendizaje.json`
tenía 30 intervenciones de `vib-motor-03` que nadie registró desde la
pantalla. Son las pruebas de `POST /api/casos` (`backend/test/rutas/`), que
corren con `cwd = backend/` y resuelven `join('datos', 'aprendizaje.json')`
contra esa carpeta. El puente de producción arranca desde la raíz y no las
ve; pero un backend arrancado desde `backend/` leería ESA bitácora.

**Lo que cuesta.** Un archivo que crece con cada tanda y que parece una
bitácora real; y la posibilidad de dos bitácoras según el `cwd`.

**El arreglo.** Resolver `RUTA_APRENDIZAJE` contra la raíz del repositorio
(como hace `backend/config.mjs` con otras rutas) y que las pruebas de casos
usen un `mkdtemp`, como ya hacen `verificar-casos` y `verificar-herramientas`.
Se escribe como tarea aparte.

## B18 · El catálogo de `generar_reporte` del tanque sale aunque el tanque esté cerrado

**Visto el 23-09-2026 por la noche** (Plan 44 F3.4, midiendo con el modelo
real): «Expórtame todas las señales de esta semana en PDF» llegó con
`sistema: "tanque"` y el PDF **salió**, con las 52 señales del tanque servidas
por el transporte falso. El camino del catálogo (`historicos/index.mjs`,
`generar_reporte` sin `tipo`) toma `SISTEMA[sistemaDelReporte]` directamente y
no pasa por `resolverSistema()`, que es donde vive la guarda de máquina
cerrada (Plan 32). Las plantillas (`reportes/generar.mjs`) sí pasan por ella y
se niegan.

**Por qué no se tocó en el Plan 44.** Es anterior al plan y está en la zona
del asistente; el plan sólo quitó la causa más frecuente —que el modelo
escribiera «tanque» por omisión— resolviendo la omisión en código
(`reportes/sistemaPorOmision.mjs`).

**El arreglo.** Que el catálogo resuelva la máquina con `resolverSistema()`
como las demás herramientas por máquina, y que la comprobación «señales por
defecto» del verificador quede omitida por el cierre, como sus 22 hermanas.

**Resuelto el 23-09-2026 (Plan 44 F3.5), la misma noche.** El usuario pidió
seguir quitando lo del tanque: el catálogo de `generar_reporte` resuelve
ahora la máquina con `resolverSistema()` (id, nombre o alias, con la guarda
de cerrada) o toma la única configurada en servicio, y sus rótulos, series y
bandas salen del registro y del tipo. Se fueron `senalInfo`, `UMBRALES`,
`esHistorizada` y el estado del tanque de ese camino, y `claveDeEtiqueta`
con ellos. Las dos comprobaciones que sólo el tanque justificaba («señales
por defecto», «una lista explícita de señales») quedaron omitidas con el
motivo del cierre, como sus 22 hermanas; las demás miran a la espejo.

## B19 · Sesenta y cuatro comprobaciones de herramientas usaban el tanque como escenario y hoy no corren

**Visto el 23-09-2026** (Plan 44 F3.6). Al quitar del asistente las ramas del
tanque —la omisión «sin `sistema`, el tanque» era la que las hacía pasar—,
`verificar-herramientas` bajó de 197 correctas y 24 omitidas a **133 y 88**.
Las 64 nuevas omitidas no comprueban el tanque: comprueban mecánica genérica
(tramos de `leerSerieEnRango`, cobertura, 502, hora local, truncado,
`comparar_periodos`, `analisis_de_senal`, `perfil_de_senal`, `buscar_evento`,
`alarma_sostenida`, los patrones de límite del manual, la bomba) con las
señales y el cliente falso del tanque. Están escritas enteras y a la vista,
con `omitirEnvuelto`, como las 24 anteriores.

**El arreglo.** Portarlas a la espejo: `createFakeIconicsClient` sirve sus
puntos y su historiador, y `configuracionEspejo({ verificadasDelCatalogo: true })`
da las series. Es trabajo mecánico por comprobación —cambiar el nombre de la
señal y las cifras esperadas— y conviene hacerlo por familia, con la puerta
pasada entre cada una. Las ocho de `controlar_bomba` son del tanque de verdad y
vuelven cuando él vuelva, o se reescriben para la escritura genérica del Plan 43.

**Resuelto el 24-09-2026.** Se portaron **43** comprobaciones, todas marcadas
con `[espejo]` en su nombre: `verificar-herramientas` pasa de **134 correctas
y 88 omitidas** a **177 y 45**. Por familia: resolución de nombres (5), idioma
de las herramientas de serie (3), la forma común del estado (5), historia y
troceado (7), cobertura y concurrencia (6), `comparar_periodos` (3),
`valor_en_momento` (3), `tendencia_multiple` (4), `buscar_evento` (3) y
`alarma_sostenida` (4).

Lo que hizo falta además del cambio mecánico:

- **`espejoFalso()`**, un envoltorio sobre `createFakeIconicsClient` que ANOTA
  lo que se le pide (`historial`, `lotes`) y permite sustituir la respuesta del
  historiador. La familia de historia no mira el dato que vuelve sino CÓMO se
  pidió —cuántas llamadas, con qué agregado, con qué prefijo—, y el
  `clienteFalso` que llevaba ese registro sólo sabía servir el catálogo del
  tanque.
- **Las cinco de resolución no se pudieron «reactivar»**: probaban
  `resolverSenal`, el índice de nombres escrito a mano que el Plan 44 F3.6
  borró. Se reescribieron contra `resolverSenalDeSistema`, que **no tenía
  ninguna comprobación directa** hasta ahora.
- **Dos comprobaciones cambiaron lo que afirman**, por motivos medidos y
  escritos en su cuerpo: `perfil_de_senal` ya no compara cifras entre dos
  llamadas (el transporte falso no es determinista ni con `rnd` fijo, así que
  medía el azar), y la de la hora local mira que **ninguna marca ISO cruda
  llegue al modelo**, porque una configurada no publica `leidoA` por esa
  herramienta.

**Lo que sigue omitido (45).** Son las que de verdad dependen del tanque: las
ocho de `controlar_bomba` con su guarda de nivel, las de su catálogo escrito a
mano (`SENALES`, `SENAL_KEYS`), su narración en inglés —cubierta por las vivas
de vibraciones—, su dossier y los patrones de límite de su manual. Vuelven
cuando vuelva la estación de llenado, o con la escritura genérica del Plan 43.

## B20 · Las banderas de apoyo declaran decimales distintos según por dónde se pregunte

**Visto el 24-09-2026** (portando B19). `alarma_S1` sale con **1 decimal** por
`leerMaquina(entrada).estado.senales` y con **0** por `entrada.metaDe(clave)`.
La causa: los roles de `MEDIDAS` declaran `decimales` y los de `BANDERAS` no,
así que la ruta del estado cae al valor por omisión de `estadoMaquina.js`
(`decimales = 1`) mientras `metaDe` sí lo deriva de la familia.

**No hay defecto visible hoy**: ninguna herramienta publica los decimales de
una bandera, y el reporte usa `metaDe`. Pero son dos respuestas distintas a la
misma pregunta, y la próxima pieza que lea la primera ruta citará «alarma: 1,0».

**El arreglo.** Declarar `decimales: 0` en los roles de `BANDERAS` del tipo, o
hacer que `estadoMaquina` no tenga un valor por omisión y exija el del rol. Lo
segundo es más honesto y más caro. Antes de tocarlo hay que mirar qué cita hoy
el tablero, porque cambia lo que se ve en pantalla.
