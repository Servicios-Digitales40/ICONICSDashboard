# PLAN 39 — El asistente sirve a cualquier máquina configurada

**Estado:** F0–F6 por completar
**Rama:** `Vibraciones1.0`
**Fecha:** 21-09-2026

> Sale del Plan 38 F3, que midió por primera vez al asistente sobre una
> máquina configurada: 6 de 7 preguntas llegan a `Nuevo-Modor`, pero lo que
> contesta al llegar es poco —`estado_del_sistema` devuelve cuatro
> recuentos y ningún valor— y varias herramientas siguen fijadas al tanque.
> El usuario pidió el plan:
>
> > «El objetivo es que las herramientas que se habían definido previamente
> > para el tanque y vibraciones se adapten ahora a funcionar con máquinas
> > configurables. Me imagino que el registro o "contrato" que le da el
> > contexto al asistente se tendría que generar de manera dinámica. […] De
> > manera que cuando se configure una nueva máquina y se valide que hay
> > datos, el asistente pueda responder preguntas respecto a la nueva máquina
> > también automáticamente.»

---

## 0. La idea en tres líneas

El registro **ya es dinámico**: `SISTEMAS` se llena al arrancar y tras cada
alta, y el prompt, los esquemas y las herramientas lo leen en vivo (Plan 38
F1 y F3). Lo que NO es dinámico es **lo que una entrada configurada sabe
hacer**: `construirSistema` rellena el contrato a medias —puntos, claves,
series, riesgos— y deja vacío lo que el tanque y vibraciones traen escrito a
mano: resumen con valores, estado con bandas, unidades, términos de manual,
desgaste, reporte. Cada hueco es una herramienta que hoy contesta poco o se
niega.

**La fuente de todo eso es el TIPO** (`shared/eva/tipos/`), que ya existe
para vibraciones y ya exporta `estado`, `resumen`, `evaluarRiesgos`,
`reglas`, `canales`, `roles` y `capacidadesPosibles`. Este plan hace que la
entrada configurada le pida al tipo lo que le falta, y que cada herramienta
pregunte «¿esta entrada tiene X?» en vez de «¿es el tanque?». Cuando eso esté,
dar de alta una máquina de un tipo conocido es dar de alta una máquina que
el asistente entiende entera, sin tocar el asistente.

---

## 1. Lo que hay, medido el 21-09-2026

### 1.1 Lo que ya llega a una configurada

Medido contra planta y modelo reales con `medir-asistente-configurada.mjs`
(Plan 38 F3), y leído herramienta por herramienta:

| Herramienta | Llega | Con qué calidad |
|---|---|---|
| `sistemas_de_la_planta` | sí | id, nombre, `mide`, `limitaciones`, `herramientas` (por capacidad) |
| `estado_del_sistema` | sí | **sólo recuentos**: `senales`, `recuento`, `sinLectura`, `puntosPedidos`. Ni un valor. El modelo dijo «no tiene lecturas disponibles» con 64 de 94 leyendo |
| `riesgos_activos` | sí | completo: `evaluarRiesgosDe` evalúa por tipo (Plan 38 F1) |
| `diagnosticar_falla` | sí | `reglasDe` cae al tipo |
| `historia_de_senal` y las 8 de historia | sí, con `sistema` | **sin unidad** (`metaDe` devuelve `''` para todo lo que no es el tanque) y con etiquetas repetidas (tres «Velocidad eficaz») |
| `consultar_documentacion` | sí | filtra por id vivo |
| `cerrar_diagnostico`, `registrar_intervencion`, `hechos_de_la_planta`, `recordar_hecho`, `proponer_regla` | sí | por `SISTEMA_IDS` vivo |

### 1.2 Lo que se niega o degrada, y por qué

| Herramienta | Qué pasa | Dónde está el `if` |
|---|---|---|
| `limites_del_manual` | se niega si la señal no es del tanque | `documentacion/index.mjs:414` |
| `diagnostico` (dossier) | sólo `SISTEMA_DEL_DOSSIER = 'tanque'` | `documentacion/index.mjs:51, 567` |
| `pronostico_de_desgaste` | `desgaste: null` en toda configurada; además `id !== 'tanque'` | `construirSistema.js` (`desgaste: null`), `historicos/index.mjs:392` |
| `generar_reporte` | sólo sabe dibujar el PDF del tanque | `historicos/index.mjs:1366` |
| `alarma_sostenida` | `sistemaId !== 'tanque'` → se niega | `historicos/index.mjs:1973` |
| `resumen_de_turno` | pide `series.claves()` donde no existe: lista vacía para TODAS | `historicos/index.mjs:2071` |
| `lib/historia.mjs` | un id desconocido cae en silencio al tanque | `historia.mjs:89` (`?? SISTEMA.tanque`) |

### 1.3 Lo que el prompt le enseña al modelo

- El **inventario** sale del registro, con nombre e id (Plan 38 F3).
- El **catálogo de señales** («Las señales de la instalación») sale de
  `SENALES` del tanque, y sólo de ahí (`herramientas.mjs`, `catalogo()`). El
  modelo no sabe que existe `vRMS_S1` hasta que una herramienta se lo dice.
- El **contexto de pantalla** nombra la máquina y ordena pasar su id. Con
  una pregunta sin máquina («¿hay algún riesgo activo?») el modelo aún llama
  a `sistemas_de_la_planta` —que `intencion.mjs` mete SIEMPRE— y barre las
  cuatro.
- Coste fijo medido: ~14 330 tokens (prompt + 26 herramientas); está
  comprobado que 896 caracteres de más rompen al 4B.

### 1.4 Cómo entra hoy una configurada al registro

`sincronizarRegistroConfigurado` corre al arrancar y tras `crear`, `editar`,
`eliminar` y `anotarRevision`. Registra toda máquina con `activa !== false`,
**sin mirar su `estado`** (`VALID`, `DEGRADED`, `INVALID`, `UNKNOWN`). Una
máquina recién creada y nunca revisada (`UNKNOWN`) o una a la que no responde
ningún punto (`INVALID`) sale igual en `sistemas_de_la_planta`, y sus
`limitaciones` no lo dicen.

### 1.5 Lo que el tipo ya tiene y nadie consume desde una configurada

`TIPO_VIBRACIONES` exporta `estado: estadoDeVibraciones`, `resumen:
resumenVibracionesParaAsistente`, `canales`, `roles` (con `label`, `corto`,
`unidad`), `umbrales`, `contadoresAlarma`, `peorZona`. Los dos primeros
están escritos sobre las constantes de la máquina a mano (`CANALES`,
`createSistemaVibraciones(valorDe)` con sus tags fijos): **saben componer,
pero sólo su propia máquina.** `dominioDesdeRoles` ya reconstruye
`{canales, variador, alarmas, sinDato, puntosPedidos}` para una configurada;
lo que falta es que el tipo acepte ese dominio en vez de fabricarlo.

Las causas (`shared/eva/comun/causas.js`) se indexan por `riesgoId` y las de
vibraciones ya traen `terminosManual` («desequilibrio», «desalineación»,
«aflojamiento»). La ISO 20816-3 está indexada: 47 fragmentos.

---

## 2. Decisiones

**D1 · El contrato es el TIPO, y se rellena al construir la entrada.** Todo lo
que una herramienta necesita de una máquina —cómo resumirla, cómo poner
bandas a su estado, qué unidades tienen sus señales, qué términos buscar en
el manual, cómo dibujar su reporte— lo declara el tipo una vez y
`construirSistema` lo cuelga de la entrada. El registro no cambia de forma:
sigue siendo `SISTEMAS` con las mismas funciones; sólo que una entrada
configurada ya no deja huecos. Ésa es la lectura literal de «el contrato se
genera de manera dinámica»: dinámico por MÁQUINA, escrito una vez por TIPO.

**D2 · Ninguna herramienta pregunta «¿es el tanque?». Pregunta «¿esta entrada
tiene X?».** Los `if (id !== 'tanque')` de §1.2 se convierten en comprobaciones
de capacidad sobre la entrada: `sistema.desgaste`, `sistema.reporte`,
`sistema.dossier`, `sistema.series`. Una entrada sin la pieza se niega con un
`fallo(...)` que dice qué falta y qué tipo la traería. El tanque sigue
teniendo las suyas escritas a mano: **no se toca** (rama). Vibraciones a mano
tampoco: la escrita a mano manda hasta el Plan 34 F5.

**D3 · Validado es registrado, y lo que falta se confiesa.** Una máquina
entra en el registro cuando está activa y **no es `INVALID`**: sin un punto
que responda no hay nada que contestar, y aparecer en la lista sería fingir.
`UNKNOWN` y `DEGRADED` entran, con una limitación generada («Sin revisar
todavía: N puntos declarados, ninguno comprobado» / «M de N puntos ausentes
en la última revisión»). La revisión (`anotarRevision`) ya resincroniza el
registro, así que **el alta es automática de verdad**: configurar, revisar,
preguntar. Sin reiniciar nada.

**D4 · El catálogo del prompt es el de la máquina que se tiene delante.**
Generar el catálogo de señales para TODAS las máquinas desde el registro es
directo, pero cuesta contexto (§1.3). Se genera para el `contexto.sistema`
del turno cuando lo hay, y para el tanque cuando no (lo que hoy hay). Se
mide en tokens antes y después, y si con dos máquinas de 94 variables no
cabe, se recorta a las claves con serie o se quita: el instrumento dice si
hacía falta.

**D5 · La regla de «¿hay algún riesgo activo?» va en código.** Con
`contexto.sistema` y una pregunta que no nombra otra máquina, `intencion.mjs`
deja `sistemas_de_la_planta` fuera del catálogo del turno. Es la regla de
`HANDOFF.md` §8: una regla que importa no se insiste en el prompt (ya se
insistió, y siguió barriendo).

**D6 · Se mide con el instrumento, antes y después de cada fase.**
`medir-asistente-configurada.mjs` gana los casos que ejercitan lo que cada
fase abre (valores por apoyo, unidad en una serie, límite del manual,
reporte). Cada fase termina con la tabla antes/después en este documento,
como la F3 del Plan 38.

**D7 · Primero lo que cambia lo que el modelo contesta.** Orden: estado y
resumen (F1) antes que documentación (F3) antes que reporte (F4). El
pronóstico de desgaste **queda fuera**: exige mecanismos de desgaste por
tipo, que es la mejora C1 y es trabajo de dominio, no de asistente. Se deja
la negativa honesta y por capacidad.

---

## 3. Las fases

### F0 — Una configurada en el transporte falso, para las pruebas

**Objetivo.** Que `verificar-herramientas` y `verificar-chat` monten una
máquina configurada y la ejerciten sin red. Hoy ninguno lo hace: las 169
comprobaciones son sobre las escritas a mano, y todo lo de este plan se
probaría sólo contra planta.

**Cómo.** `generar-configuracion-vibraciones.mjs` ya deriva una configurada
espejo de la escrita a mano; sus puntos son los mismos tags, así que el
transporte falso les da valores simulados por `sistemaDePunto()` sin cambiar
nada. Los guiones escriben ese `maquinas.json` en su carpeta privada
(`MAQUINAS_RUTA`, que `montarApp` y `verificar-chat` ya usan) y la app la
registra al arrancar.

**Criterios.** Las herramientas de §1.1 pasan sobre la configurada con los
mismos asertos que sobre la escrita a mano; `verificar-herramientas` imprime
cuántas comprobaciones son sobre configuradas.

**Riesgo.** El solape de raíces con la escrita a mano (`toleraSolapeConEscritas`)
es exactamente el de planta: bien, porque es lo que hay hasta el Plan 34 F5.

### F1 — Estado y resumen por tipo

**Objetivo.** Que `estado_del_sistema` sobre una configurada devuelva lo que
devuelve sobre la escrita a mano: apoyos con sus medidas y su banda ISO,
variador, alarmas, y un resumen que el modelo pueda redactar.

**Cómo.**
- `estadoDeVibraciones` y `resumenVibracionesParaAsistente` aceptan el
  dominio ya construido y la lista de canales de la máquina
  (`canalesDeMaquina`, Plan 37) en vez de `CANALES` y de fabricar el dominio
  con tags fijos. La escrita a mano las llama como hoy; la configurada, con
  `dominioDesdeRoles`.
- `construirSistema.estado()` usa `tipo.estado` cuando el tipo lo trae: bandas
  ISO, norma aplicable, `soloEnMarcha`, etiquetas con apoyo (`Velocidad
  eficaz · S1`), unidad del rol. Lo genérico de hoy queda como camino para un
  tipo sin `estado`.
- `construirSistema.resumen()` usa `tipo.resumen`; los cuatro recuentos de hoy
  se quedan dentro, porque «cuántos puntos no contestaron» sigue siendo lo
  primero que hay que decir.
- `etiquetaDe`/`aliasDe` añaden el apoyo cuando el tipo tiene canales y la
  variable no trae descripción.

**Criterios.** Sobre la configurada, `estado_del_sistema` trae `apoyos[]` con
valores y banda; la etiqueta de `vRMS_S1` es distinta de la de `vRMS_S2`; el
instrumento gana «¿qué vibración tiene cada apoyo?» y contesta con valores;
«no he podido resumirlos» desaparece de ese caso (hoy: 2 de 7 casos).

**Depende de** F0.

### F2 — Historia por tipo

**Objetivo.** Que las nueve herramientas de historia traten a una configurada
como a la escrita a mano: unidad, decimales, etiqueta única, y ningún camino
que caiga al tanque sin decirlo.

**Cómo.** `metaDe` lee `unidad`/`decimales` de la variable (ya guardadas en
`construirSistema`) o del rol; `lib/historia.mjs` deja de hacer
`?? SISTEMA.tanque` y falla con el id que no encontró; `resumen_de_turno`
pide `claves()` a la entrada, no a `series`; `alarma_sostenida` se niega por
capacidad (la entrada no declara señales de alarma con serie) y no por id.

**Criterios.** `historia_de_senal(vRMS_S1, sistema=vib-motor-03)` trae
`unidad: "mm/s"`; `resumen_de_turno` lista señales para las tres máquinas;
un `sistema` inexistente en `lib/historia.mjs` es un fallo con nombre, no la
serie del tanque.

**Depende de** F0. Independiente de F1.

### F3 — Documentación por tipo

**Objetivo.** Que `limites_del_manual` y el dossier sirvan a una configurada
cuando su tipo tiene manual que citar.

**Cómo.** `limites_del_manual` acepta `sistema`, resuelve la señal en la
entrada (`sistemasDeSenal` ya la encuentra) y busca los términos que el TIPO
declara para ese rol —los de la ISO 20816-3 ya indexada— en vez de negarse
por no ser el tanque. El dossier (`diagnostico`) se niega por capacidad:
«este tipo no declara dossier», con lo que habría que declarar. Es la mejora
B3 del backlog del asistente y el Plan 32 F5, acotados a lo que necesita
una configurada.

**Criterios.** El caso «¿qué dice la documentación sobre los límites de
vibración de esta máquina?» del instrumento cita la ISO con archivo y página
para `vib-motor-03`; `limites_del_manual(senal="vRMS_S1", sistema=...)` no
se niega.

**Depende de** F1 (etiquetas y roles por señal).

### F4 — Reporte por tipo

**Objetivo.** Que `generar_reporte` dibuje el PDF de una configurada.

**Cómo.** El reporte se compone desde `estado.senales` agrupadas por `grupo`
(el apoyo, el variador, el área) y desde las series que la entrada declara;
el tipo aporta el orden y los rótulos de los grupos. El del tanque sigue
siendo el suyo, sin tocar. `generar_reporte` deja de omitir `sistema` en su
esquema Zod (hoy pasa por `.passthrough()`).

**Criterios.** `generar_reporte(sistema=vib-motor-03, senales=[vRMS_S1])`
devuelve un enlace firmado y el PDF abre con los tres apoyos; el caso
«hazme un reporte de esta semana» del instrumento llega.

**Depende de** F1 y F2.

### F5 — El prompt habla de la máquina que se tiene delante

**Objetivo.** Que el modelo tenga delante las señales de la configurada de su
pantalla, y que una pregunta sin máquina no barra la planta.

**Cómo.** `catalogo()` recibe el `contexto.sistema` y devuelve el catálogo de
esa entrada (claves, etiqueta, unidad, `historia`) cuando es configurada, el
del tanque cuando no. `intencion.mjs` deja `sistemas_de_la_planta` fuera del
turno cuando hay `contexto.sistema` y la pregunta no menciona otra máquina
del registro. Se mide el tamaño del prompt en tokens con `Nuevo-Modor` (94
variables) antes de darlo por bueno.

**Criterios.** «¿Hay algún riesgo activo?» desde la pantalla de `Nuevo-Modor`
llama a `riesgos_activos` **sólo** con `vib-motor-03` (hoy: las cuatro);
el prompt con catálogo de 94 variables se mide y queda escrito aquí; el
instrumento pasa de 6 de 7 a 7 de 7 en la tanda base.

**Depende de** F1 (etiquetas únicas), independiente del resto.

### F6 — El alta automática, de punta a punta

**Objetivo.** Configurar una máquina nueva de un tipo conocido, revisarla, y
preguntarle al asistente sin reiniciar nada, con lo que falte dicho.

**Cómo.** `sincronizarRegistroConfigurado` omite `INVALID` y registra
`UNKNOWN`/`DEGRADED` con una limitación generada desde la última revisión
(§2 D3). `construirSistema` añade a `limitaciones` lo que la validación sabe:
puntos ausentes, series sin verificar, roles requeridos que faltan. Una
prueba de contrato recorre el ciclo con el transporte falso: crear →
`sistemas_de_la_planta` la trae con «sin revisar» → `anotarRevision` VALID
→ la limitación desaparece → `estado_del_sistema` contesta. Y el instrumento
se corre entero contra planta sobre `Nuevo-Modor`, con los casos nuevos de
F1–F5, y su tabla cierra este plan.

**Criterios.** La prueba de contrato del ciclo pasa; una máquina `INVALID` no
aparece en `sistemas_de_la_planta` y el log dice por qué; el instrumento
imprime la tabla final y va aquí, con lo que siga sin llegar.

**Depende de** F1–F5.

---

## 4. Riesgos

**El contexto del 4B.** F5 añade texto al prompt; F1 añade valores al
resultado de `estado_del_sistema`. Los dos empujan contra un techo medido.
Por eso F5 se mide en tokens antes de aceptarse, y F1 conserva los recuentos
arriba del resumen para que, si el modelo no redacta el resto, lo primero
que diga siga siendo cuántos puntos no contestaron.

**Dos entradas para la misma instalación** hasta el Plan 34 F5. Una respuesta
sobre `vibraciones` parece correcta por los números aunque se pidiera
`vib-motor-03`. El instrumento mira a qué id fue cada herramienta, no lo que
dicen las cifras; es la única forma de cazarlo.

**El tanque no se toca** (rama). Todo lo de este plan generaliza por la rama
`sistema.configurada`; el tanque conserva sus caminos escritos a mano y los
`if` que le sirven a él siguen ahí hasta el Plan 33 F9. Un `if (id ===
'tanque')` NUEVO sí es un defecto.

**Refactorizar `estadoDeVibraciones` para que acepte el dominio** toca la
escrita a mano de vibraciones, que sí es de esta rama. Sus pruebas
(`verificar-vibraciones`, `verificar-vibraciones-configurada`, 25 checks)
tienen que seguir dando lo mismo; F1 no cambia ni un valor de la escrita a
mano, sólo por dónde le entra el dominio.

**Tiempo de medición.** Cada tanda del instrumento son 6–8 minutos con el
modelo real, y cada fase pide dos. Se corre al cerrar la fase, no en cada
cambio; entre medio, F0 da la cobertura sin GPU.

---

## 5. Lo que queda fuera

- **`pronostico_de_desgaste` para vibraciones.** Exige mecanismos de
  desgaste por tipo (horas en zona C/D de la ISO, arranques). Es **C1** del
  backlog del asistente y trabajo de dominio; aquí sólo se deja la negativa
  por capacidad.
- **El tanque como tipo** (Plan 33 F9). Bloqueado por la rama.
- **Retirar `vibraciones.js`** (Plan 34 F5). Cuando F1–F4 estén, la
  configurada hará todo lo que hace el catálogo en el asistente, que era la
  condición.
- **El badge del sidebar por configurada** y **Alarmas de la máquina** (Plan
  37 F4): son del tablero, no del asistente.
- **Sinónimos por máquina** (B2) y **un solo resolvedor** (B1): mejoran cómo
  el modelo encuentra una señal por su nombre coloquial; no hacen falta para
  que una configurada conteste.

---

## 6. Orden y tamaño

| Fase | Tamaño | Qué desbloquea |
|---|---|---|
| F0 | pequeña | probar todo lo demás sin planta |
| F1 | media | `estado_del_sistema` con valores; las etiquetas |
| F2 | pequeña | unidades en historia; tres defectos de herramienta |
| F5 | pequeña | el barrido; el catálogo de la máquina |
| F3 | media | límites del manual para vibraciones |
| F4 | media | el PDF |
| F6 | pequeña | el alta automática con sus límites dichos, y la tabla final |

F0 → F1 → F2 → F5 → F3 → F4 → F6. F2 y F5 pueden ir en paralelo a F1 si hace
falta; F3 y F4 no, porque leen las etiquetas y grupos que F1 fija.
