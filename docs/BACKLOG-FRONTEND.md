# Backlog · Frontend

> **Objetivo de la rama.** Que dar de alta una máquina nueva sea añadir una
> entrada al registro. En el backend eso ya casi se cumple; **en el frontend
> todavía no**: hoy una máquina nueva escribe cinco vistas y su motor de
> sondeo. Este backlog es el camino desde ahí.

> **Cómo leer esto.** Cada entrada dice qué pasa HOY, qué escribe de más quien
> añada la **máquina #3** y qué tamaño tiene el arreglo. Las cifras están
> medidas sobre el árbol, no estimadas.

---

## Estado a 28-08-2026

**497 pruebas en verde** (50 archivos, 1 omitido). `npm run build` limpio.

Vistas registradas en `routes.jsx`: **14**, repartidas en tres secciones
(`sec-llenado`, `sec-vibraciones`, `sec-general`).

---

## Auditoría del 22-09-2026 — contrastado con el código, no con la memoria

> Mismo método que con los planes ese día (Plan 41 §0): cada punto se buscó en
> el árbol. **Cinco de ocho ya no existen.** Se dejan abajo con su texto
> original porque explican POR QUÉ el código quedó como quedó; esto dice qué
> queda de verdad.

| | Estado real | Dónde se ve |
|---|---|---|
| **F1** vistas duplicadas | **RESUELTO para vibraciones.** Hay UNA vista por TIPO parametrizada por máquina (`InicioVibraciones`, `Vibraciones`, `Vibraciones3D`, `RiesgosVibracion` reciben la configurada). El tanque conserva las suyas porque está cerrado; unificarlo es la reapertura (Plan 33 F9), no este punto | Planes 37 y 40 |
| **F2** dos motores de sondeo | **PARCIAL, y el resto bloqueado por la rama.** `fuenteDeMaquinaConfigurada` ES el `useMaquina(sistemaId)` que se pedía: abre un motor por máquina y lee cadencia, puntos y estado de la configuración. `evaSource.js` sigue para el tanque hasta reabrir | `data/comunes/fuenteDeMaquina.js` |
| **F3** indicador por sección | **RESUELTO.** `Topbar` monta `ContextoDeMaquina seccion={SECCION_DE_PAGINA[page]}`; el contexto lo aporta la sección, no un `if` | `test/app/contexto-de-maquina.test.jsx`, `topbar-estado-maquina.test.jsx` |
| **F4** secciones desde el registro | **RESUELTO.** `buildNav` deriva una sección por máquina configurada; añadir una máquina no toca `routes.jsx` | `test/app/secciones-por-maquina.test.jsx` |
| **F5** bundle | **RESUELTO.** Verificador en verde: `index` 343,6 KB / 450 · `vendor` 269,1 / 330 · `three` diferido. Los techos se subieron con medición escrita en el guion (ver B5) | `verificar-bundle` |
| **F6** placeholders | **DESAPARECIDOS.** `ControlesVibraciones.jsx` y `VibracionesEva3D.jsx` no existen; la 3D de la configurada es `Vibraciones3D` y Controles no se prometió | Plan 40 |
| **F7** cobertura | **PARCIAL.** La sección de una máquina nueva SÍ está probada (F4). Las cadencias distintas por máquina, también (`cadencia-del-registro.test.js`). Lo que sigue sin red es el **ciclo de vida**: que dos motores vivos sondeen por separado y mueran con su vista | — |
| **F8** una sola raíz | **ABIERTO.** El commit `c99099b` fue el apunte, no el arreglo; la decisión entre «varias raíces» y «marcar desde cualquier punto» sigue sin tomar | — |
| **F11** `maq-alarmas` | **NUEVO, en espera de un flanco real** (Plan 42 F3). Las banderas ya prometen historia y la cadena de flancos está probada; la vista se hace cuando haya un evento que enseñar | `verificar-vibraciones-configurada` |

**Nuevos, salidos del Plan 41 (22-09-2026):**

## F9 · El editor no deja escribir las limitaciones de una máquina — **HECHO (22-09-2026)**

> **Lo que se hizo.** Un `textarea` «Limitaciones de la instalación» en
> `EditorDeMaquina`, una por línea; `configuracionDesdeMarcas` las limpia
> (`limitacionesLimpias`: espacios, líneas vacías, repetidas) y las manda
> **siempre** como arreglo, porque al editar «vacío» significa «borra las
> mías» y omitirlo significaría «no toques nada».
>
> **Lo que el diseño de abajo no había visto**: `GET /api/maquinas/:id`
> devuelve `limitaciones` MEZCLADAS (propias + las que deriva la validación).
> Cargarlas tal cual habría re-grabado «65 series sin sondear» como si alguien
> lo hubiera escrito. Por eso la API separa ahora `limitacionesPropias`
> (`maquinasRoutes.mjs · conCapacidades`) y el editor lee ésa. Y si la API no
> la trae —un backend anterior a este cambio—, el PATCH **no toca** las
> limitaciones: mandar `[]` desde un campo que arrancó vacío sin que nadie lo
> vaciara habría borrado lo escrito. Tres pruebas en `editor-de-maquina`
> (alta limpia, edición sólo con las propias, backend viejo) y una en
> `rutas/maquinas.test.mjs`.

**Hoy (antes del arreglo).** `limitaciones` es un campo de la configuración (`CrearMaquinaSchema`,
`EditarMaquinaSchema`) y la ficha de `ConfiguracionPlanta` lo **enseña**, pero
`EditorDeMaquina` no tiene campo para escribirlo. El 22-09-2026 hizo falta
grabar «El motor gira sin carga acoplada…» en `vib-motor-03` y sólo se pudo
con `PATCH /api/maquinas/:id` a mano.

**Por qué importa.** Las limitaciones propias son lo que quien opera sabe de
la instalación y el tablero no puede deducir: «sin carga acoplada», «el
rodamiento intermedio no tiene referencia». El asistente las cita (`CLAUDE.md`
§2.5). Si sólo se escriben por API, no las escribe nadie.

**El arreglo.** Un campo de texto multilínea —una limitación por línea— en el
formulario del editor, que viaje en `payload.limitaciones` y se lea de
`maquina.limitaciones` al editar. Las derivadas por la validación no se
editan: se suman (`construirSistema`). Pequeño, con su prueba.

## F10 · Un intermitente que NO es contención — **CAZADO Y ARREGLADO (22-09-2026)**

`fuente-de-maquina.test.js › con el origen SIMULADO…` caía 2 de 4 veces al
correr sólo `src/test/demo-eva`, con un **aserto** y en ~70–90 ms; pasaba solo
y en suites completas. Se supuso orden o estado compartido. **No era eso.**

**Cazado** a la sexta tanda con `--reporter=verbose`:
`vRMS_S1: expected 'undefined' to be 'number'`. **La causa:** el simulador no
usa `Math.random` —la prueba ya lo fijaba en 0,99 y no servía de nada—; su
marcha y su paro van por **reloj de pared**, en ciclos, y con el motor
parado `vRMSEn()` devuelve `null` (el módulo no publica). El transporte lo
convierte en `{ quality: SIN_DATO }` sin `value`, y la prueba leía con
`Date.now()` real. Caía o no **según la hora a la que corriera la tanda**;
que fallara en la carpeta y no sola era coincidencia.

**El arreglo**, sólo en la prueba: fijar el reloj en un instante en marcha
(`vi.useFakeTimers({ toFake: ["Date"], now: EN_MARCHA })`, sólo `Date` porque
el transporte espera su latencia con `setTimeout`), con la misma receta que
`simulador-vibraciones.test.js`. El simulador y el transporte no se tocaron:
hacen lo que deben. La lección va a `HANDOFF.md` §9: un intermitente que no
dice `timed out` puede ser **reloj**, no sólo orden.

---

## F1 · Cada máquina duplica sus vistas

**Hoy.** Medido:

| Vista | Tanque | Vibraciones |
|---|---|---|
| Inicio | 806 | 590 |
| Gráficas | 250 | 434 |
| Riesgos | 628 | 195 |
| Controles | 145 | 107 |
| Vista 3D | 264 | 112 |

Diez archivos donde deberían bastar cinco parametrizados. La máquina #3 escribe
los cinco suyos.

**Por qué las secciones SÍ deben seguir separadas.** No es lo mismo separar la
navegación que duplicar el código. La cabecera de `routes.jsx` lo argumenta y
tiene razón: mezclar las pantallas de dos máquinas invita a leerlas juntas, y la
primera correlación que alguien saque entre el caudal del tanque y la vibración
de la otra une dos instalaciones que no se tocan. **Lo que sobra es el
duplicado, no la separación.**

**El arreglo.** Una vista por TIPO, parametrizada por sistema:
`Inicio({ sistema })` en vez de `InicioEva` + `InicioVibraciones`. La forma
común ya existe —`estadoMaquina.js` proyecta toda máquina a las mismas señales
con valor, unidad, estado, banda y grupo— así que la pieza que faltaba está
puesta desde el backend.

**Cuidado.** Las dos vistas de Riesgos son las más distintas (628 contra 195) y
no por descuido: una evalúa nivel, presión y caudal, y la otra un motor con
acelerómetros. Parametrizar no puede significar quedarse con el mínimo común —
eso empobrecería la del tanque. La ruta es extraer el ESQUELETO compartido y
dejar que cada máquina aporte sus bloques.

---

## F2 · Dos motores de sondeo con formas distintas

**Hoy.**

| Pieza | Líneas | Forma |
|---|---|---|
| `EvaProvider.jsx` + `evaSource.js` | 97 + 160 | Provider + contexto + `pollingEngine` |
| `vibracion.js` (`useVibracion`) | 202 | Hook con su propio ciclo de vida |

Ya no duplican la normalización del lote —eso se arregló: los dos orígenes salen
de `transporteDe`— pero **siguen siendo dos arquitecturas distintas** para el
mismo problema. La #3 elige una de las dos, o escribe la tercera.

**La regla que hay que respetar.** `sistemas.js` la declara innegociable: **un
motor de sondeo POR SISTEMA**, la unificación es del código y nunca del lote.
Un solo `useMaquina(sistemaId)` que abra su propio motor por sistema la cumple;
lo que la rompería es un motor único que junte los puntos de dos máquinas en la
misma petición.

**El arreglo.** Un `useMaquina(sistemaId)` que lea `cadenciaMs`, `puntos()` y
`estado()` del registro. Las tres ya están declaradas por cada entrada — el hook
no tendría que saber de ninguna instalación.

**Cuidado con el ámbito.** `EvaProvider` envuelve el Shell entero a propósito
(para que `EstadoMaquinaBanner` funcione en cualquier pestaña) mientras que
`useVibracion` vive en su vista. Unificar tiene que decidir esto explícitamente,
no heredarlo por accidente: un provider por máquina montado siempre son N
motores corriendo aunque no se vea ninguna de sus pantallas.

---

## F3 · El indicador de encendido conoce una sección por su nombre

**Hoy.** [`Topbar.jsx`] tiene `SECCION_DE_PAGINA[page] === "sec-llenado"`.

**Por qué está bien hecho para lo que es.** No es una lista paralela de ids —eso
sí se quedaría viejo— sino que deriva la sección del registro de rutas, y su
comentario ya dice cuál es el destino: *«cuando la máquina de vibraciones tenga
su propio control, esto no será un `if` con dos ramas sino un indicador por
sección»*.

**Qué cuesta el día de la #3.** La máquina nueva no enseña indicador de
encendido. Es el fallo correcto —callar es mejor que enseñar el estado de otra
instalación— pero es una capacidad que no hereda.

**El arreglo.** Que la sección declare su indicador, o que salga del registro de
sistemas: cada máquina sabe cuál es su tag de marcha, y «encendida» no significa
lo mismo en un grupo de bombeo que en un motor con variador. **Depende de F4.**

---

## F4 · Las secciones del sidebar no salen del registro de sistemas

**Hoy.** `SECCIONES` vive en `routes.jsx` con sus tres entradas escritas a mano,
y cada ruta declara su `group`. El registro de `shared/eva/sistemas.js` no
participa: sabe que hay dos máquinas, pero el sidebar no se entera por él.

**Qué cuesta el día de la #3.** Añadir la sección a mano, con su icono y su
etiqueta, y acordarse de poner el `group` correcto en cada una de sus rutas. Es
justo el tipo de paso manual que el registro existe para eliminar.

**El arreglo.** Que `SECCIONES` se derive de `SISTEMAS` —cada máquina aporta la
suya, con `sec-general` como la única escrita a mano— y que `group` salga del
sistema al que pertenece la vista.

**Es el cambio con mejor relación coste/beneficio del frontend.** Es pequeño,
no toca ninguna vista y convierte «añadir una sección» en «no hacer nada».

---

## F5 · Presupuesto de bundle incumplido *(preexistente)*

`verificar-bundle` falla: `vendor` **161.84 KB** sobre un techo de **90 KB**.

**Medido contra HEAD sin los cambios de esta rama: mismo tamaño byte a byte.**
Es anterior y ningún trabajo reciente lo introdujo.

Ver **B5** en el backlog de backend: la decisión (subir el techo con una razón
escrita, o partir `vendor`) es la misma y debe tomarse una sola vez. Lo que no
puede quedarse es un verificador en rojo permanente: deja de leerse, y entonces
no avisa el día que diga algo nuevo.

---

## F6 · Dos vistas son marcadores de posición

`ControlesVibraciones.jsx` (107) y `VibracionesEva3D.jsx` (112) están en el
sidebar y anuncian «todavía sin construir».

**No es deuda: es una decisión escrita.** La cabecera de `ControlesVibraciones`
explica lo importante — esa pantalla **escribirá en el PLC**, y un botón que
parezca operativo sin serlo es peor que no tener pantalla. Por eso no hay
ninguno.

**Qué vigilar.** Que sigan siendo honestas. Un placeholder que se queda dos
meses empieza a parecer una pantalla rota en vez de una pendiente; si la #3 llega
antes que ellas, conviene revisar si el sitio en el sidebar sigue justificado.

---

## F7 · Cobertura de pruebas: dónde está el hueco

**Bien cubierto.** El registro de sistemas (21 pruebas en `sistemas.test.js`,
incluidas las de resolución de nombres), la proyección común, el transporte
simulado, la traza del asistente y la accesibilidad.

**Sin cubrir.**

- **El ciclo de vida del sondeo por máquina.** Ninguna prueba comprueba que dos
  sistemas con `cadenciaMs` distinta sondeen por separado. Es la regla que
  `sistemas.js` declara innegociable y es también la que F2 puede romper sin
  que nada avise. **Escribirla ANTES de F2, no después.**
- **La sección de una máquina nueva en el sidebar.** `routes.test.jsx` valida
  las rutas actuales; nada comprueba que una máquina añadida al registro
  aparezca navegable. Es la prueba que hace verificable a F4.

---

## F8 · El editor sólo deja marcar lo que cuelga de UNA raíz

**Hoy.** `activoDe()` (`shared/eva/comun/configurarDesdeArbol.js`) devuelve
`null` si el punto no empieza por la raíz en vivo, y `activosDesdeRaiz()` sólo
ofrece los hijos DIRECTOS de esa raíz. Así que una máquina se configura con lo
que hay bajo una sola rama: subir la raíz para alcanzar una carpeta vecina
colapsa los activos de dentro —medido el 22-09-2026: con la raíz en
`DEMO_VIBRACIONES/`, `S1`, `S2`, `S3` y `V20` dejaron de agruparse y el activo
`Vibraciones` pasó a tener 163 variables juntas—.

**El caso que lo destapó.** La torreta de señalización (`TORRETA/ESTADO_TORRETA`)
colgaba de `ac:TDCON/DEMO_VIBRACIONES/`, un nivel por encima de los apoyos. Se
resolvió moviendo el tag en ICONICS, que funciona pero es cambiar la planta
para acomodar al tablero.

**Por qué es viable.** El backend NO impone esa restricción: ningún esquema ni
validación exige que una variable cuelgue de la raíz. Y el patrón ya existe —
el área de alarmas (`ae:/...`) entra como asset secundario con una ruta
completamente ajena a la raíz en vivo, y `configuracionDesdeMarcas` la añade
sin problema. Lo que falta es poder MARCARLA desde el árbol.

**Dos diseños, y la decisión no está tomada.**

1. **Varias raíces en vivo declaradas.** El formulario acepta N raíces; cada
   una aporta sus activos. Reutiliza el patrón del área de alarmas y no
   redefine qué es una raíz. Es el paso pequeño.
2. **Marcar desde cualquier punto del árbol.** Se explora desde arriba y se
   marca lo que sea. Más flexible, pero «la raíz» deja de significar algo y
   hay que redefinir qué es un activo y de dónde sale su `assetId`.

Hace falta saber si esto es para una o dos carpetas sueltas (bastaría el 1) o
para máquinas armadas con tags de varias zonas (haría falta el 2).

---

## F11 · «Alarmas» de la máquina configurada: la vista que espera un flanco

**De dónde sale.** El Plan 41 F4 cerró «Alarmas» de la configurada **sin
vista**: el Alarm Server da 500 a `AlarmHistory` y las banderas de la máquina
no tenían serie verificada. El Plan 42 (22-09-2026) resolvió lo segundo: las
once banderas de `vib-motor-03` están verificadas como `registrada-constante`,
`construirSistema` las ofrece como historia y un check de
`verificar-vibraciones-configurada` demuestra que `readHistory → normalizar →
eventosDeAlarma` da eventos con entrada, salida y duración para una
configurada.

**Por qué no se hizo la vista.** Porque hoy `eventosDeAlarma` sobre cualquiera
de esas banderas da **cero eventos** —son constantes porque nunca alarmaron—.
Una vista enseñaría una lista vacía y los seis contadores del área que Inicio
ya enseña. Es §4.8: escribir lo pequeño y anotar qué justificaría lo grande.

**Qué la justifica.** Que una bandera cambie de verdad. El sondeo lo dirá
solo: pasará de `registrada-constante` a `serie-propia`. Ese día, la vista es
la de `AlarmasEva` del tanque sobre las banderas de la configurada —flancos,
sin mensaje ni severidad ni acuse, que un flanco no los tiene— y una tarde de
trabajo. Hasta entonces, la pregunta «¿ha alarmado alguna vez?» la contesta el
asistente con `historia_de_senal` sobre la bandera, y la contesta bien: «no ha
cambiado».

## Orden sugerido (revisado el 22-09-2026)

1. ~~**F9**~~ — hecho el 22-09-2026
2. ~~**F10**~~ — cazado y arreglado el 22-09-2026 (era el reloj, no el orden)
3. **F7 (el ciclo de vida)** — la única red que falta antes de tocar motores
   *(F11 no entra en el orden: no es una tarea hasta que una bandera cambie)*
4. **F8** — decidir entre varias raíces y marcar desde cualquier punto; la
   pregunta que decide sigue siendo si es para una carpeta suelta o para
   máquinas armadas con tags de varias zonas
5. **F2 (la mitad del tanque)** — con la reapertura, no antes

**F1, F3, F4, F5 y F6 están cerrados**; se conservan arriba por su porqué.

## F-frescura · `verificar-frescura` no reconoce los tiles genéricos (23-09-2026)

Tras borrar las vistas del tanque (Plan 42.5 F4) el verificador dice «0
archivos formatean señales, 0 exentos» y sigue en verde: su heurística busca
la forma de los tres sitios del tanque, y los tiles genéricos de la Planta de
una máquina configurada (`components/maquina/tilesMaquina.jsx`) pasan por
`presentarValor` con otra forma. Hoy lo afirma `planta-maquina.test` (valor
congelado enseñado como su edad). Pendiente: enseñarle esa forma al
verificador para que vuelva a vigilar el árbol entero, antes de que alguien
escriba un tile que se salte la puerta.

## F-detalle-intermitente · `detalle-maquina-simulada` falló una vez en tanda completa (23-09-2026)

«al entrar la insignia dice Sesión actual, y tras elegir Ayer dice
Historiador, sin red» cayó UNA vez en una tanda completa (en 560 ms, no por
plazo) y pasó 3 de 3 aislada y en las dos tandas completas siguientes. No es
contención (CLAUDE.md §5.3: eso da `timed out`); huele a una carrera entre el
búfer de la sesión y la primera lectura del historiador simulado en
`useDetalleMaquina`. Pendiente de reproducir con `--repeat` antes de tocar
nada; si vuelve, mirar el orden en que `SelectorRango` y `useSeriesDe` fijan
el rango.
