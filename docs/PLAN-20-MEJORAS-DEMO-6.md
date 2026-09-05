# Plan 20 · Mejoras Demo 6.0 — las diez primeras

> **De dónde sale.** De la auditoría de la rama `Moises6` del 04-09-2026, que
> propuso sesenta mejoras repartidas en seis frentes (código, seguridad,
> asistente, ICONICS, usabilidad, funcionalidad nueva). Esto ejecuta las diez
> que la propia auditoría situó primero, por una razón concreta y no por
> gravedad aparente: **son las que hacen verificable todo lo demás.**

> **Rama.** `Mejoras-Demo-6.0`, salida de `Moises6` en `d4119b7`.

> **Los otros cincuenta** están ordenados en
> [`HOJA-DE-RUTA-60-MEJORAS.md`](HOJA-DE-RUTA-60-MEJORAS.md), con una regla que
> sale de la experiencia de este plan: **ningún plan intermedio depende de que
> la planta esté alcanzable.** Todo lo que necesita red real se agrupa al final.

---

## 0 · El criterio de orden

Las diez no están ordenadas por lo grave que parecen, sino por lo que
desbloquean. Tres grupos:

1. **Primero lo que mide** (F1, F2, F9). Un linter, una tanda de CI y un banco
   de evaluación no arreglan ningún fallo por sí solos — hacen que el siguiente
   arreglo se pueda demostrar. Meterlos al final significa hacer cuarenta
   cambios sin red debajo.
2. **Después lo que está roto** (F4, F3, F5). La CSP contra Predicción es un
   módulo que no funciona en producción, no una mejora. Las escrituras no
   atómicas y las guardas de ruta son deuda que sólo se paga cuando ya ha
   costado algo.
3. **Al final lo que escala** (F6, F7, F8, F10). Caché del histórico, prompt
   generado, verificador de catálogo y panel de salud: ninguno urge hoy, todos
   duelen con la máquina #3.

## 0.1 · Lo que este plan NO hace

- **No activa `AUTH_HABILITADA`.** F5 cierra la lista de rutas que la exigirán,
  que es el trabajo caro; la implementación es su propio plan (G11 de
  `PLAN-17`, SEG-01 de la auditoría).
- **No toca el motor de diagnóstico** ni ninguna regla de riesgo. El código
  puntúa y el modelo redacta (`CLAUDE.md` §2.3): nada de aquí cambia una banda,
  un orden ni una causa.
- **No mete el módulo de Predicción por el puente.** F4 desbloquea sus llamadas
  declarando su origen en la CSP; el proxy sigue siendo `PLAN-19` F4 y sigue
  bloqueado por la misma pregunta de red que ya estaba anotada.

---

## F1 · Linter y comprobación de tipos (COD-01)

**Hoy.** No existe `eslint.config.js` en ninguna carpeta, y sin embargo
`Demo-EVA/data/comunes/hooks.js` lleva tres `// eslint-disable-next-line
react-hooks/exhaustive-deps`: se escriben supresiones para un linter que nadie
ejecuta. Las reglas no negociables de `CLAUDE.md` §2.7 —`shared/` no conoce
`fetch` ni React— las vigila hoy la revisión humana.

**Qué se hace.**

- `eslint.config.js` en la raíz, plano, con un bloque por capa: `shared/`,
  `backend/`, `react-dashboard/src/`, `scripts/`.
- La regla de la casa como regla de linter: `no-restricted-globals` sobre
  `fetch`, `window`, `document` y `localStorage` dentro de `shared/`, con el
  mensaje que dice **por qué** y a dónde va ese código. Es §2.7 mecanizada.
- `checkJs` sobre `shared/` vía `jsconfig.json`, que es la capa donde un campo
  mal escrito no falla: devuelve `undefined` y se pinta como cero.
- `npm run lint` y `npm run types` en la raíz.

**Cómo se prueba.** Las dos órdenes salen en verde sobre el árbol tal cual.
El conjunto de reglas se elige para que así sea: un linter que entra con
cuatrocientos avisos no es una puerta, es ruido que se aprende a ignorar.

## F2 · Integración continua (COD-02)

**Hoy.** No hay `.github/workflows/`. La regla de oro de `CLAUDE.md` §5 —un
cambio en `backend/ia/` corre como mínimo `verificar-herramientas.mjs`— es
disciplina personal.

**Qué se hace.** Un flujo con cuatro trabajos en paralelo: `lint`, `backend`,
`frontend` y `verificadores`. Los veinte `verificar-*.mjs` ya levantan un
ICONICS y un llama-server falsos: **están hechos para CI sin saberlo.**
Se excluyen los que necesitan red a planta o servidores de IA, y el flujo dice
en su propio comentario cuáles y por qué.

**Cómo se prueba.** El mismo guion que ejecuta CI —`scripts/verificar-todo.mjs`—
corre igual en local. Si pasa en la máquina, pasa en CI: no hay un segundo
listado que mantener.

## F3 · Escrituras atómicas de los almacenes JSON (COD-03)

**Hoy.** `aprendizaje/index.mjs`, `indices/embeddings.mjs` e
`indices/manuales.mjs` hacen `writeFile()` sobre el archivo definitivo. Un
corte a mitad —en una planta— lo deja truncado, y con él se van los hechos
confirmados, la caché de embeddings o el manifiesto de manuales. Y dos llamadas
concurrentes a `recordar_hecho` hacen leer-modificar-escribir sin candado: la
segunda pisa a la primera **sin error**.

**Qué se hace.** `backend/lib/jsonAtomico.mjs` con dos piezas:

- `escribirAtomico(ruta, contenido)` — escribe en un temporal hermano y
  `rename()`, que en el mismo volumen es atómico: o está el archivo viejo
  entero o el nuevo entero, nunca medio.
- `conCandado(ruta, tarea)` — serializa por ruta las secuencias
  leer-modificar-escribir. Es el mismo patrón que `pendingAuthentication` ya usa
  para los tokens, por la misma razón.

**Cómo se prueba.** Pruebas nuevas en `backend/test/`: que no queda ningún
temporal tras una escritura buena, que un fallo a mitad deja intacto el
contenido anterior, y que veinte escrituras concurrentes sobre el mismo archivo
terminan con las veinte aplicadas y no con la última.

## F4 · La CSP bloquea el módulo de Predicción (SEG-03)

**Hoy.** `seguridad.mjs` fija `connectSrc: ["'self'"]`, y
`modulos/prediccion/data/predictionApi.js` llama desde el navegador a
`http://10.10.17.13:8000`. Servido por el puente, ese `fetch` **lo bloquea el
navegador, y sin error visible en la página**. Con HTTPS delante es además
contenido mixto y se bloquea dos veces.

**Qué se hace.** `CONNECT_ORIGINS` en la configuración, con el mismo criterio
que `CORS_ORIGINS` y `FRAME_ANCESTORS`: **orígenes exactos, nunca comodín**,
vacío por defecto. Lo que declare entra en `connectSrc`. Y un aviso al arrancar
si un origen declarado es `http:` mientras el puente sirve HTTPS, porque eso el
navegador lo bloquea aunque la CSP lo permita.

**Cómo se prueba.** Pruebas de config (qué se admite y qué se rechaza) y de
cabecera (`connectSrc` contiene el origen declarado, y no lo contiene cuando no
se declara nada).

## F5 · Cerrar la lista de rutas con guarda (SEG-02)

**Hoy.** Declaran `fastify.autenticar`: control de bomba, chat, casos,
escrituras de ICONICS y de RAG. **No** lo declaran `/api/voz`,
`/api/reportes`, `/api/diagnostico`, `GET /api/rag/documentos` ni ninguna
lectura de `/api/iconics/*`.

**Qué se hace, y por qué no ruta por ruta.** La cabecera de
`autenticacion.mjs` dice que el trabajo caro es decidir qué rutas la exigen y
que esa decisión se toma peor a posteriori. Una lista que hay que acordarse de
ampliar en cada ruta nueva tiene el mismo fallo que `global: false` en el
limitador: olvidarla no rompe nada visible.

Así que la guarda pasa a ser un `onRequest` del ÁMBITO donde se registran las
rutas de API, con una excepción declarada y comentada para las sondas de salud.
`request.usuario` queda relleno siempre, en las treinta y tres. Lo que sigue
siendo ruta por ruta es `exigirRol`, que es donde de verdad hay criterio — y se
añade a las dos que no eran lectura de planta y lo llevaban en falta:
`/api/voz`, que quema GPU por petición, y `/api/reportes`, que entrega
documentos generados.

**Cómo se prueba.** Una prueba que recorre el árbol de rutas de la aplicación
ya construida y falla si alguna `/api/` queda sin la guarda salvo las de salud.
Es la única forma de que esto no se degrade en el commit número doscientos.

## F6 · Caché del histórico ya cerrado (ICO-02)

**Hoy.** `readHistory` no cachea nada. Un tramo cerrado del historiador —ayer,
la semana pasada— es inmutable por definición, y cada wallboard que abre la
vista de gráficas lo vuelve a pedir entero, con su paginación de hasta 20
páginas HTTP por señal. `POST /api/iconics/history/batch` multiplica eso por
señales y por tramos.

**Qué se hace.** Caché dentro de `readHistory`, con una condición que es toda la
decisión: **sólo se cachea la ventana cuyo `endDate` ya pasó**, con un margen de
seguridad para el borde. Lo que toca «ahora» no entra nunca. Se guarda la
promesa y no el resultado —mismo patrón que `batchCache` y que
`pendingAuthentication`— para que las peticiones que llegan en vuelo esperen a
la misma llamada. Una lectura truncada (`truncada: true`) no se cachea: sería
fijar un recorte accidental durante toda la vida de la entrada.

**Cómo se prueba.** Que dos lecturas iguales de una ventana pasada son una sola
llamada saliente; que una ventana que llega hasta ahora son dos; que un fallo no
se cachea; que una serie truncada tampoco.

## F7 · El prompt del sistema, generado desde el registro (IA-03)

**Hoy.** En `instrucciones()` hay dos reglas «10.», dos «11.», dos «12.», dos
«13.» y dos «14.». Y afirma «El servidor publica OCHO señales y nada más» y
«Sólo CUATRO de las ocho tienen historia» — cierto para el tanque, falso para la
planta desde que hay dos sistemas y un módulo de predicción. Las
contradicciones internas del prompt son de lo que más degrada a un modelo
pequeño, y aquí las hay contra el propio catálogo que se le pasa debajo.

**Qué se hace.** Numeración única y generada (nadie vuelve a escribir un
número a mano), y el párrafo de «qué es esta instalación» construido desde el
registro de sistemas, que ya sabe cuántas señales tiene cada máquina y cuáles
están historizadas. Ninguna regla cambia de contenido: cambia de dónde salen
sus datos.

**Cómo se prueba.** Un verificador que falla si dos reglas comparten número, si
el prompt nombra una cifra de catálogo que no coincide con el registro, o si un
sistema dado de alta no aparece en las instrucciones.

## F8 · Verificador de catálogo (ICO-08)

**Hoy.** Los puntos de cada sistema están declarados en código y `browse()`
existe para explorar el árbol, pero nada contrasta lo uno con lo otro. Un punto
renombrado en ICONICS aparece como «sin dato» permanente y hay que descubrirlo
mirando.

**Qué se hace.** `scripts/verificar-catalogo.mjs` con dos modos, separados a
propósito igual que `verificar-calibracion` y `medir-calibracion`:

- **Sin red (el que entra en CI).** Comprueba la coherencia del registro contra
  sí mismo: que ningún punto está declarado en dos sistemas, que todo punto
  cae bajo una `raiz` declarada, que `parse()` lo devuelve a su propio sistema,
  que `esHistorizada()` no promete serie de lo que el catálogo dice que no la
  tiene, y que el transporte falso sirve todo lo que el registro declara.
- **Con red (`--real`).** Recorre las raíces con `browse()` y lista lo que
  sobra, lo que falta y lo que cambió de nombre.

El modo sin red es el que atrapa el fallo que ya se dio dos veces en este
proyecto: una máquina nueva que el simulador no conoce y que contesta `null`
con calidad BUENA.

## F9 · Banco de evaluación del asistente (IA-01)

**Hoy.** Sólo existe `medir-narracion.mjs`, que mide una instrucción concreta y
no devuelve código de error a propósito. `verificar-chat.mjs` prueba el
mecanismo del bucle, no la calidad de la respuesta. No hay forma de saber si un
cambio en el prompt mejoró o empeoró.

**Qué se hace.** Tres piezas, y la separación es la misma que ya existe entre
medir y verificar:

- `backend/ia/evaluacion/banco.mjs` — los casos, con su pregunta, la
  herramienta que se espera, y las aserciones sobre la respuesta (que cite tal
  campo, que confiese la ausencia de dato, que no ponga plazo a una avería).
- `backend/ia/evaluacion/evaluador.mjs` — el que juzga un turno. La aserción
  central es **que ninguna cifra de la respuesta falte en el JSON de las
  herramientas de ese turno**.
- `scripts/medir-asistente.mjs` — corre el banco contra el modelo REAL. Es un
  instrumento de medida: informa, no falla.
- `scripts/verificar-evaluacion.mjs` — corre el evaluador contra respuestas
  guionizadas, incluidas las malas. Prueba el MECANISMO sin GPU, y ése sí entra
  en CI.

Separarlos es lo que impide ajustar el evaluador hasta que el modelo apruebe.

## F10 · Panel de salud del sistema (NUE-05)

**Hoy.** `/api/health` ya sabe si ICONICS responde, si el token es válido y si
el puente está en solo lectura. Nadie lo mira: cuando algo va raro, el primer
paso es leer logs por SSH.

**Qué se hace.**

- Se amplía `/api/health` con lo que hoy no cuenta y ya sabe: el asistente
  (configurado, modelo activo, cola), el dictado, el índice de documentación
  (cargado, fragmentos, indexando) y el modo de datos (`ICONICS_FAKE`), que es
  el estado más importante de todos porque es aquel en el que **ningún dato es
  real**.
- Una vista `SaludSistema` en `views/comunes/`, con una fila por servicio, su
  estado, el detalle accionable que ya escribe el backend y —cuando falta una
  variable— cuál es.

**Cómo se prueba.** Contrato de la ruta en `backend/test/`, y la vista en
`react-dashboard/src/test/` contra respuestas de ejemplo, incluida la de un
servidor a medio configurar, que es el caso para el que existe la pantalla.

---

## Orden de ejecución y commits

Un commit por fase, probado antes de pasar a la siguiente (`CLAUDE.md` §6).

| # | Fase | Toca |
|---|---|---|
| 1 | F1 · Linter y tipos | raíz, `jsconfig` |
| 2 | F2 · CI | `.github/`, `scripts/verificar-todo.mjs` |
| 3 | F3 · Escrituras atómicas | `backend/lib/`, tres almacenes |
| 4 | F4 · CSP y Predicción | `config.mjs`, `seguridad.mjs` |
| 5 | F5 · Guardas de ruta | `app.mjs`, `vozRoutes`, `reportesRoutes` |
| 6 | F6 · Caché de histórico | `iconics/client.mjs`, `config.mjs` |
| 7 | F7 · Prompt generado | `ia/conversacion/chat.mjs` |
| 8 | F8 · Verificador de catálogo | `scripts/` |
| 9 | F9 · Banco de evaluación | `backend/ia/evaluacion/`, `scripts/` |
| 10 | F10 · Panel de salud | `systemRoutes`, `views/comunes/` |

---

## Resultado (04-09-2026)

Las diez fases están hechas, cada una con su commit y su suite en verde.

| Antes | Después |
|---|---|
| sin linter ni tipos | `npm run lint` y `npm run types`, los dos en verde |
| sin CI | 4 trabajos, 20 verificadores descubiertos |
| 162 pruebas de backend | 196 |
| 544 pruebas de frontend | 550 |
| 17 verificadores | 20 |
| 22 vistas | 23 |

**Lo que encontró el andamiaje al entrar**, y que no estaba en el plan porque
no se sabía:

- **29 nombres importados y nunca usados** en `ia/conversacion/herramientas.mjs`
  — restos del reparto de agosto.
- **29 desajustes entre el JSDoc y el código** en `shared/`. El que importa:
  `estadoComun()` recibe `puntosPedidos` y `leidoA` desde agosto y su bloque
  `@param` no los mencionaba; son justo los dos campos que permiten decir
  «faltan 15 de 21» en vez de «faltan 15».
- **`leerAprendizaje()` compartía el arreglo `intervenciones`** con la constante
  `VACIO` del módulo. Un almacén «vacío» arrastraba las intervenciones del
  anterior. Lo destapó una prueba de F3 que fallaba por un motivo distinto del
  que se estaba probando.
- **`rename` falla en Windows** mientras alguien tenga abierto el destino, y el
  puente corre en Windows. Salió en la primera ejecución de las pruebas de F3.
- **Dos reglas «10.», «11.», «12.», «13.» y «14.»** en el prompt del sistema, y
  dos afirmaciones falsas sobre el catálogo que el propio catálogo desmentía en
  el mismo mensaje.

## Lo que queda abierto, y dónde está escrito

Nada de esto se ha escondido: cada punto está en el código que lo tiene.

1. **La auditoría de cifras no corre contra el modelo real.** El flujo SSE lleva
   qué herramienta se llamó y con qué argumentos, pero no su resultado — va al
   modelo, no a la pantalla, y es deliberado. En `medir-asistente.mjs` la
   auditoría queda desactivada en vez de aplicarse a medias, con el porqué y las
   dos salidas escritos en su cabecera. La buena: que el guion reejecute las
   herramientas con esos argumentos, sin tocar el camino de producción.
2. **`CONNECT_ORIGINS` no es la solución definitiva de Predicción.** Desbloquea
   el módulo; el proxy por el puente sigue siendo `PLAN-19` F4 y sigue bloqueado
   por la misma pregunta de red.
3. **`AUTH_HABILITADA` sigue en falso.** F5 cerró la lista de rutas, que era el
   trabajo caro. La implementación es SEG-01 de la auditoría y su propio plan.
4. **El candado de `jsonAtomico` es por proceso.** Dos puentes sobre el mismo
   `datos/` seguirían pisándose. No ocurre hoy —un puente por instalación— y el
   día que ocurra la respuesta no es un candado más listo, es dejar de guardar
   estado compartido en un JSON.
5. **`vendor` va a 206,85 KB de un techo de 210.** No lo tocó este plan y el
   margen se estrechó un poco. Es COD-07 de la auditoría.
