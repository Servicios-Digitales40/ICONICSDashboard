# PLAN 37 — Las vistas de una máquina configurada

**Estado:** F1–F3 completadas · F4 por completar · **pendiente de verse en el navegador**
**Rama:** `Vibraciones1.0`
**Fecha:** 21-09-2026

> Sale del Plan 36. Con la pantalla de configuración funcionando, el usuario
> dio de alta `vib-motor-03` («Nuevo-Modor») y pidió lo que faltaba:
>
> > «Generar la vista plasmada actual pero para máquinas configuradas.
> > Literalmente como está definido actualmente esto, pero dinámicamente. El
> > día que cree una nueva máquina del mismo tipo, deberían crearse nuevamente
> > más vistas como las de la captura.»
>
> Es el objetivo de fondo de la rama (`BACKLOG-FRONTEND.md`: «que dar de alta
> una máquina nueva sea añadir una entrada al registro»), y la F1 de ese
> backlog dice cómo: **una vista por TIPO, parametrizada por máquina**, no una
> copia por máquina.

---

## 1. Lo que hay, medido el 21-09-2026

**Las vistas de vibraciones están escritas contra UNA máquina.** Las cuatro de
Visualización —`InicioVibraciones`, `Vibraciones` (Gráficas), `Vibraciones3D`,
`AlarmasEva`— leen `useVibracion()`, que sondea los 73 puntos del catálogo
escrito a mano, e importan de `domain/vibraciones.js` constantes de la
instancia (`CANALES` con sus rótulos, `AREA_ALARMAS`) mezcladas con las del
tipo (`LIMITES_ISO`, `VIGILANCIAS`, `MEDIDAS`, `bandaISO`).

**Las máquinas configuradas no existen para el tablero.** `registrarSistema()`
no lo llama nadie fuera de las pruebas —ni el backend al arrancar, ni el
frontend—. `useMaquina()` las resuelve a `registro: null`. Y `GET /api/maquinas`
exige `administrador`, así que un operador ni siquiera podría leer qué puntos
tiene una máquina configurada.

**Lo que sí está**, y hace esto viable en vez de un plan de un mes:

| Pieza | Qué aporta |
|---|---|
| `dominioDesdeRoles(maquina, tipo, valorDe)` | Devuelve `{canales, variador, alarmas}` con la MISMA forma que `createSistemaVibraciones`: las vistas no distinguen (Plan 34 F3, 66 valores idénticos) |
| `construirSistema(maquina, tipo)` | La entrada del registro de una máquina configurada, sin registrarla |
| `MaquinaProvider` + `?maquina=<id>` | La ruta y el parámetro ya dicen de qué máquina va una pantalla (Plan 33 F6) |
| `buildNav` deriva secciones de las rutas | Una sección nueva es una entrada de datos, no código |
| `createPollingEngine` | Un motor por lista de puntos; la regla «un motor POR SISTEMA» se cumple con uno por máquina |

---

## 2. Decisiones

**D1. Rutas genéricas con parámetro, no una ruta por máquina.** Tres rutas hoy
—`maq-inicio`, `maq-graficas`, `maq-3d`— y una cuarta, `maq-alarmas`, cuando
F4 la construya; la máquina viaja en `?maquina=<id>`. Es lo que el Plan 33 F6 decidió y por qué: `useNavegacion`
ya lleva parámetros, y traer un enrutador «tendría que ganarse su sitio con
algo más que esto». Una máquina nueva no añade rutas: añade una sección que
apunta a las mismas cuatro con otro parámetro.

**D2. Una sección por máquina configurada, derivada de los datos.** `buildNav`
recibe las máquinas en servicio y produce un grupo `maq:<id>` por cada una,
con el nombre de la máquina como rótulo y las rutas `maq-*` como hijos con su
parámetro. La sección escrita a mano de vibraciones sigue igual: retirarla es
la F5 del Plan 34, no esto.

**D3. `GET /api/maquinas` lo puede leer un `visualizador`.** Ver el tablero de
una máquina exige saber qué puntos leer, y los nombres de punto ya los puede
recorrer con `browse`. Las escrituras siguen siendo del administrador. El
frontend las carga UNA vez al resolverse la sesión (`MaquinasConfiguradasProvider`)
y las recarga cuando la pantalla de configuración guarda algo. Es una lectura
de configuración, no un sondeo.

**D4. Una fuente de sondeo por máquina configurada, construida desde su
configuración.** `fuenteDeMaquina(maquina, tipo, transporte)` abre un motor
sobre `maquina.variables` y produce con `dominioDesdeRoles` la misma
instantánea que `createVibracionSource`. El hook que las vistas usan
(`useDominioVibracion`) elige la fuente por `useMaquina()`: la escrita a mano
para `vibraciones`, la configurada para las demás. `useVibracion()` no cambia:
lo usa el badge del sidebar, que está montado siempre, y hacerlo dependiente
de la máquina de la pantalla es exactamente la regresión que este proyecto ya
cometió dos veces.

**D5. Las vistas se parametrizan, no se copian.** Donde una vista lee
`CANALES` (la instancia) pasa a leer `canales` del hook: para la escrita a
mano son los de siempre; para una configurada salen de `tipo.canales` cruzados
con sus assets, con el id como rótulo. Lo que es del tipo (`LIMITES_ISO`,
`VIGILANCIAS`, `MEDIDAS`, el banco 3D) se sigue importando.

**D6. Lo que NO entra, y por qué.** Diagnóstico (Hallazgos, Avisos) y
Documentación (Casos, RAG) para máquinas configuradas dependen de que el
**backend** las conozca —los casos validan `sistema` contra `SISTEMA_IDS`, el
asistente resuelve por `SISTEMA[id]`— y nadie registra las configuradas al
arrancar. Es un plan aparte: el registro dinámico en el servidor. Controles
sigue sin construir para ninguna. Historización es el Plan 32 F3.

---

## 3. Las fases

### F1 — Los datos y el menú ✅

**Completada el 21-09-2026.**

**Objetivo.** Que el tablero sepa qué máquinas configuradas hay y las enseñe
como secciones, con sus cuatro vistas dentro.

- Backend: `GET /api/maquinas` y `GET /api/maquinas/:id` con rol
  `visualizador`; la prueba de guardas lo declara por método.
- `MaquinasConfiguradasProvider` en el Shell; `useMaquinasConfiguradas()`.
- `MaquinaProvider` resuelve una configurada a su entrada de registro
  (`construirSistema`) y la expone como `configurada`.
- Tres rutas `maq-*` sin `nav` propio (la cuarta, Alarmas, es F4); `buildNav`
  produce la sección por máquina; `Sidebar` navega con parámetros y marca
  activa la pareja ruta+máquina; el Topbar enseña el nombre de la máquina.
- La ficha de Configuración gana «Quitar del tablero» (la API ya existe).

**Aceptación.** Con `vib-motor-03` en servicio, el menú tiene una sección con
su nombre y tres entradas; entrar en una lleva a `?maquina=vib-motor-03`.
Sin máquinas configuradas el menú es el de hoy, byte a byte. ✅ Las dos cosas
están fijadas por prueba (`secciones-por-maquina.test.jsx`).


#### Lo que de verdad pasó (F1)

**El menú y la máquina viajan juntos.** `buildNav` recibe las máquinas y
produce un grupo `maq:<id>` por cada una, con `label` (su nombre) y los hijos
con `params: { maquina }`. El Sidebar navega con ese parámetro y marca activa
la **pareja ruta+máquina** (`estaActiva`): dos máquinas apuntan a la misma
ruta y sólo una puede estar marcada. Es la única excepción a «en el árbol no
hay texto» de la cabecera de `buildNav`, y viaja como dato de la máquina,
no como texto del menú.

**La lista se lee una vez por sesión.** `MaquinasConfiguradasProvider` espera a
`useSesionResuelta()` —antes no hay token y el 401 se leería como sesión
inválida— y se recarga cuando Configuración guarda o quita algo
(`EVENTO_MAQUINAS_CAMBIARON`). No hay temporizador. La prueba lo fija mirando
cuántas veces se llama a la API.

**`useMaquina()` construye la entrada con `construirSistema` y NO la
registra.** `SISTEMAS` es un módulo que valida al cargar y lanza; meterle
entradas en caliente desde un provider daría dos registros que pueden
discrepar. La entrada vive lo que vive la pantalla. Y el registro escrito a
mano manda: una configurada homónima de `vibraciones` no lo sustituye.

**La paleta de comandos no ofrece las rutas `maq-*` sueltas**: sin parámetro
llevan a una pantalla que no sabe de qué máquina hablar. Su prueba cambió a
propósito.

**La prueba de guardas aprendió a razonar por método**: `GET /api/maquinas`
lo puede leer un visualizador; `POST`, `PATCH` y `DELETE` en la misma URL,
no. Antes la lista de permitidos era por URL entera.

**La ficha gana «Quitar del tablero»**, con confirmación en dos pulsaciones.
El servidor decide si borra o desactiva y la respuesta lo dice.

### F2 — La fuente de datos por máquina ✅

**Completada el 21-09-2026.**

**Objetivo.** Un motor de sondeo por máquina configurada, y un hook que las
vistas puedan usar sin saber cuál es cuál.

- `fuenteDeMaquina` con `createPollingEngine` sobre las variables de la
  máquina, `cadenciaMs` de la máquina, y `dominioDesdeRoles` como forma.
- Los contadores del área de alarmas, si la máquina los marcó, entran en
  `alarmas` por su sufijo (`=ActiveUnackedCount` → `activasSinReconocer`).
- `useDominioVibracion()` elige la fuente por máquina. Con el origen simulado
  una máquina configurada dice que no se puede simular, no inventa valores.

**Aceptación.** Con un transporte de mentira, la fuente de `vib-motor-03`
entrega `canales.S1.vRMS` leído de `…/S1/vRMS_S1` y `puntosPedidos` igual a
sus variables. Dos máquinas abren dos motores; ninguno mezcla puntos.


#### Lo que de verdad pasó (F2)

**`fuenteDeMaquina.js` es el gemelo de `vibracionSource.js`**: un motor de
sondeo sobre las variables de la configuración, `cadenciaMs` de la máquina, y
`dominioDesdeRoles` como forma. Las vistas no distinguen cuál de los dos las
alimenta. La caché es por máquina y transporte, con la revisión y el número de
variables en la clave: editar la máquina apaga el motor viejo antes de abrir
el nuevo, y la prueba lo fija.

**El tipo ganó `contadoresAlarma`** —clave y sufijo de los cuatro contadores
de un área de AlarmWorX—, para que una máquina que marcó sus contadores los
vea en `alarmas` en vez de como variables sin rol. `vistaDeMaquina.js` en
`shared/` cruza el tipo con la máquina: qué apoyos tiene (`canalesDeMaquina`,
con el id como rótulo y sin inventar sensibilidad ni rodamiento) y qué
contador es cada variable.

**Con el origen simulado, la fuente falla con un motivo** («el simulador sólo
reproduce las máquinas escritas en el código»), no inventa valores.

**Medido contra planta**, con el backend en un puerto propio y
`dominioDesdeRoles` sobre la respuesta de `/api/iconics/data/batch` para
`vib-motor-03` (94 variables): **94 de 94 puntos con respuesta en 459 ms**,
`velocidad: 753`, `S1.vRMS: 0.358`, `S3.aPeak: 5.65`, un solo hueco. La
primera llamada dio 401: el backend todavía no tenía el token de ICONICS
(`tokenValid: false` a los 13 s de arrancar). No es de esta fase, pero conviene
saberlo al probar.

### F3 — Las vistas, parametrizadas ✅

**Completada el 21-09-2026.**

**Objetivo.** Inicio, Gráficas y Vista 3D enseñan la máquina de la ruta.

- Las tres vistas cambian `useVibracion()` por `useDominioVibracion()` y
  `CANALES` por los canales del hook. El contexto del asistente
  (`declararContextoDeVista`) declara la máquina real.
- Con la máquina escrita a mano, las tres se ven exactamente igual que hoy:
  las pruebas existentes lo fijan.

**Aceptación.** Abrir `maq-inicio?maquina=vib-motor-03` con un transporte de
mentira pinta «Nuevo-Modor» y sus apoyos; abrir `vib-inicio` pinta lo de
siempre.


#### Lo que de verdad pasó (F3)

**Un hook nuevo, `useDominioVibracion()`, y `useVibracion()` intacto.** El
nuevo mira `useMaquina()` y elige la fuente; el viejo sigue siendo siempre la
máquina escrita a mano porque lo llama el badge del sidebar, montado en todas
las pantallas. Cambiarlo habría abierto el motor de cada máquina configurada
al pasar por su sección: la regresión de 31-08 y 17-09, por tercera vez.

**Tres vistas cambiaron `CANALES` por `canalesMeta`** (Inicio, Gráficas, 3D) y
el rótulo del apoyo: «Lado acople» es dónde está montado el S1 de la máquina
escrita a mano, y una configurada no lo ha dicho, así que su apoyo se llama
como su id. El banco 3D es del tipo y trae tres apoyos; los que esta máquina
no instrumenta se pintan sin sonda, como el resto del tren. Riesgos también
cambió de hook aunque no esté en el menú de la configurada.

**Inicio navega a las rutas de SU máquina** (`maq-graficas`, `maq-3d` con el
parámetro) y no ofrece Riesgos ni Controles para una configurada. Gráficas
declara al asistente la máquina real y nombra SU área de alarmas, no la del
catálogo. «Los tres apoyos» pasó a «Los apoyos» cuando la máquina es
configurada: no se afirman tres sobre una de dos.

**Con la máquina escrita a mano nada cambia**: las pruebas existentes de las
tres vistas siguen en verde sin tocarlas.

### F4 — Alarmas de la máquina

**Objetivo.** `maq-alarmas` enseña el área de alarmas que la máquina declaró
(`arboles.alarmas`), no la del catálogo.

**Queda por completar, y se decidió no forzarla en la misma sesión que F1–F3.**
`AlarmasEva` lee el historial con `leerAlarmas()` sobre las señales de alarma
del TANQUE (`ALARMAS_HISTORIZABLES` de `senales.js`) y trae una pestaña en
vivo desconectada; no es una vista que se parametrice con un prop. Hay que
mirar primero cómo contesta `/api/iconics/alarms` a un área `ae:` entera, y
con eso decidir si es una vista nueva y pequeña. Mientras tanto la sección de
una máquina configurada tiene TRES entradas, no cuatro, y el menú lo dice así.

---

## 4. Riesgos

**La regresión de sondeo, una vez más.** Cualquier hook nuevo que dependa de
`useMaquina()` y esté montado fuera de la vista de esa máquina sondea la
máquina equivocada. Por eso `useVibracion()` no cambia y el badge sigue con
él. La prueba de cada fase mira las suscripciones, no lo pintado.

**Tres pruebas de inventario cambian a propósito**: `routes.test.jsx` (cuatro
rutas más), y las que fijan el menú con y sin máquinas. Cambiar el inventario
es el contenido de F1, no un daño colateral.

**La máquina configurada tiene menos que la escrita a mano.** Sin sensor de
estado, sin rodamiento declarado, sin sensibilidad, sin alias. Las vistas lo
tienen que enseñar como hueco, no como cero (`CLAUDE.md` §2.4), y la ficha ya
lo confiesa en `limitaciones`.
