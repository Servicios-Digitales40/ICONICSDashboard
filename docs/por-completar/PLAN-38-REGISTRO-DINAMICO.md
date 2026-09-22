# PLAN 38 — El registro conoce las máquinas configuradas

**Estado:** F1–F3 completadas · F2 **pendiente de confirmarse en el navegador** tras la corrección del 21-09 (Plan 37) · F3 medida contra el modelo real
**Rama:** `Vibraciones1.0`
**Fecha:** 21-09-2026

> Sale del Plan 37 §2 D6, que lo dejó declarado: Hallazgos, Avisos, Casos y
> RAG de una máquina configurada «dependen de que el backend las conozca, y
> nadie registra las configuradas al arrancar». El usuario pidió cerrarlo:
>
> > «Entonces configura los hallazgos, avisos, casos y RAG para el tipo de
> > máquina.»

---

## 1. Lo que hay, medido el 21-09-2026

**`registrarSistema()` no lo llama nadie fuera de las pruebas.** Existe desde
el Plan 33 F3 con su validación —id repetido, raíz solapada— y
`construirSistema()` sabe producir la entrada. Pero el arranque del backend
crea el gestor de máquinas y **no construye ninguna entrada**: su propio
comentario decía «nadie lo consume todavía».

**Las consecuencias, una por pieza:**

| Pieza | Qué pasa con `vib-motor-03` |
|---|---|
| Asistente | `resolverSistema()` → «No hay ningún sistema llamado …» |
| Casos previos | `POST /api/casos` con `sistema: vib-motor-03` → 400 |
| Motor de diagnóstico | `REGLAS_POR_SISTEMA` va por id: `tanque`, `vibraciones`. Lanza `TypeError` |
| Riesgos por herramienta | `evaluarRiesgosDe` es un `switch` por id → `evaluadas: 0` |
| Manuales | `sistemaValido()` mira `SISTEMAS` → no se le puede asignar uno |

**Y aunque se registrara, tres validaciones no lo verían.** `z.enum(SISTEMA_IDS)`
copia la lista al construir el esquema: medido con zod 4, un id añadido
después de arrancar **no pasa**. Está en el contexto del chat, en el cuaderno,
en los casos y dos veces en `/api/diagnostico`.

**La raíz de la configurada se solapa con la escrita a mano.** `vib-motor-03`
apunta a `ac:TDCON/DEMO_VIBRACIONES/Vibraciones/`, que es `RAIZ_VIB`.
`registrarSistema` lanza por eso, y con razón en el caso general. Aquí las dos
son la misma instalación: retirar la escrita a mano es la F5 del Plan 34.

---

## 2. Decisiones

**D1. Sincronizar es rehacer.** La entrada del registro es una FOTO de la
configuración; editar la máquina, sondear sus series o quitarla la cambian.
En vez de mantener la entrada al día campo a campo, se quitan todas las
configuradas y se vuelven a registrar desde el archivo, al arrancar y tras
cada escritura (`conRegistroSincronizado(gestor)`). Son un puñado.

**D2. El solape con una escrita a mano se tolera, se declara y se registra en
el arranque.** `registrarSistema(entrada, { toleraSolapeConEscritas })`. El
solape entre dos configuradas sigue siendo error: `problemasDeMaquina` ya lo
impide al guardar. `sistemaDePunto()` sigue devolviendo la primera que encaja
—la escrita a mano—, y eso está escrito donde se decide.

**D3. Lo que valida `sistema` mira la lista al validar.** `sistemaConocido()`
en `esquemas.mjs` sustituye a `z.enum(SISTEMA_IDS)` en los cinco sitios, con
el mismo mensaje.

**D4. El motor y las herramientas caen al TIPO cuando el id no es de una
escrita a mano.** `reglasDe(sistema)` mira `REGLAS_POR_SISTEMA` y después
`tipoDe(SISTEMA[id].tipo).reglas`; `evaluarRiesgosDe` usa
`tipo.evaluarRiesgos` para una `configurada`. La convención de la frase de
evidencia («¿es de vibraciones?») sale del tipo, no del id.

**D5. Las pruebas no leen el `maquinas.json` de quien las corre.** Con el
registro sincronizado al arrancar, el valor por defecto de `MAQUINAS_RUTA`
metería en cada prueba las máquinas del disco de cada desarrollador.
`montarApp` y `verificar-chat` usan un archivo propio y vacío.

**D6. Las vistas de Diagnóstico y Documentación no se copian: leen la
máquina de la pantalla.** `BandejaEva`, `AvisosEva` y `CierreDiagnostico`
cambian `useVibracion()` por `useDominioVibracion()` y el `"vibraciones"`
literal por `maquina.id`; `CasosRag` y `DocumentacionRag` ya filtraban por
`useMaquina()`. Cuatro rutas `maq-*` más en la sección de cada máquina. El
badge de hallazgos del sidebar sigue contando sólo la escrita a mano: está
montado siempre y no puede abrir un motor por máquina.

---

## 3. Las fases

### F1 — El backend registra las configuradas ✅

**Completada el 21-09-2026.**

- `desregistrarSistema(id)` y `sistemasConfigurados()` en `sistemas.js`;
  `registrarSistema` con `toleraSolapeConEscritas`.
- `backend/ia/indices/registroConfigurado.mjs`: `sincronizarRegistroConfigurado`
  y `conRegistroSincronizado`. Cableado en `app.mjs`.
- `sistemaConocido()` en los cinco esquemas; `reglasDe` en el motor;
  `evaluarRiesgosDe` por tipo.
- Prueba de contrato: alta en caliente → `/api/diagnostico` y `/api/casos`
  la aceptan; baja → deja de aceptarla; solape tolerado y declarado.


#### Lo que de verdad pasó (F1)

**Registrar la configurada rompió la edición de la propia configurada.**
`problemasDeMaquina` rechazaba el id por «ya hay un sistema declarado en el
registro» —y era ella misma, recién registrada—. Cuatro pruebas de `PATCH` se
pusieron rojas a la vez. La comprobación mira ahora sólo las escritas a mano
(`configurada: false`); el choque entre dos configuradas lo sigue mirando
`otrosIds`.

**`z.enum` copia la lista: medido antes de tocar nada.** Con zod 4, un id
empujado a `SISTEMA_IDS` después de construir el esquema no pasa el enum; un
`refine` sobre la misma lista sí. De ahí `sistemaConocido()`.

**Las pruebas y los guiones dejan de leer el archivo de quien los corre.**
Con el registro sincronizado al arrancar, `montarApp` sin `MAQUINAS_RUTA`
habría metido en cada prueba las máquinas de `datos/maquinas.json` del
desarrollador. `montarApp` y `verificar-chat` usan un archivo propio y vacío.
Y el registro es un módulo: lo que una prueba registra lo ve la siguiente del
mismo archivo, así que cada prueba lo vacía al salir.

**Medido contra planta**, con el backend en un puerto propio y el
`datos/maquinas.json` real (dos configuradas): las dos entran al arrancar y el
arranque dice que comparten raíz con `vibraciones`; `GET /api/diagnostico?sistema=vib-motor-03`
contesta 200 con sus causas, `POST /api/casos` acepta el id, y `fantasma`
sigue siendo 400 «no reconozco».

### F2 — Las vistas, y sus rutas en la sección de la máquina ✅

**Completada el 21-09-2026.**

- `maq-hallazgos`, `maq-avisos`, `maq-casos`, `maq-rag`, con sus apartados.
- `BandejaEva`, `AvisosEva`, `CierreDiagnostico` leen la máquina de la
  pantalla; navegan con `?maquina=` cuando es configurada.
- `useDominio().sistema(id)` conoce el nombre de una configurada, y
  `sistemas()` la lista en los selectores de RAG.

---


#### Lo que de verdad pasó (F2)

**Cuatro rutas más por máquina**, en dos apartados: Hallazgos y Avisos
(Diagnóstico), Casos previos y RAG documental (Documentación). La sección de
una configurada tiene ahora siete entradas; Alarmas sigue siendo el Plan 37 F4.

**Tres vistas dejaron de decir `"vibraciones"` a mano.** `BandejaEva`,
`AvisosEva` y `CierreDiagnostico` leen `useDominioVibracion()` y usan
`maquina.id` para pedir el diagnóstico, narrar y navegar; cuando la máquina es
configurada, la navegación lleva `?maquina=`. Con la escrita a mano la llamada
es exactamente la de antes —sin segundo argumento—, y tres pruebas existentes
lo cazaron cuando no lo era.

**El nombre de una configurada llega a los rótulos.** `useDominio().sistema(id)`
cae al nombre del provider de máquinas configuradas cuando el id no está en el
diccionario, y `sistemas()` las lista en los selectores del RAG.

**Lo que cambió de sitio en las pruebas existentes**: los dobles de
`vibracion.js` que sólo sustituían `useVibracion` ahora sustituyen también
`useDominioVibracion`, devolviendo lo mismo con la máquina escrita a mano.

### F3 — El asistente sobre una máquina configurada ✅

**Completada el 21-09-2026.** La pidió el usuario en vez de seguir con las
vistas: «quiero ver si el asistente me puede contestar sobre ella y cómo
contesta». F1 había dejado el registro vivo y las rutas aceptando el id; nadie
había preguntado todavía al modelo.

**Objetivo.** Medir, contra el modelo real y la planta real, si una pregunta
sobre `Nuevo-Modor` (`vib-motor-03`) LLEGA a esa máquina —no a la escrita a
mano, que describe la misma instalación—, y corregir lo mínimo que la medición
justifique.

- `scripts/medir-asistente-configurada.mjs`: instrumento (`medir-`, no
  `verificar-`; mide, no afirma). Construye siete preguntas a partir de la
  máquina que hay —nombre, id, una señal con serie— y las hace por el mismo
  camino que el tablero, tres nombrándola sin contexto y cuatro con el
  `contexto.sistema` que manda su propia pantalla. Por caso dice a qué
  máquina fue cada herramienta: la suya, otra del registro, o un id que no
  existe (su nombre).
- El inventario del prompt imprime el id de cada sistema junto al nombre;
  el bloque de contexto de pantalla imprime el nombre junto al id y ordena
  pasar ese id tal cual; las doce descripciones del parámetro `sistema` en
  `definiciones.mjs` dejan de decir «"tanque" o "vibraciones"».
- `esDeVibraciones()` en `maquina/index.mjs`: el catálogo inglés de riesgos
  se elige por TIPO, no por `id === 'vibraciones'`.
- `verificar-instrucciones`: un check nuevo exige el id de cada sistema en el
  prompt. Se vio fallar con el `chat.mjs` anterior.

#### Lo que de verdad pasó (F3)

**Cómo se midió.** Backend montado en proceso contra ICONICS real y
`llama-server` real (`qwen-3.5-4B`, el modelo por defecto), con la
autenticación apagada sólo en ese proceso —las claves de `AUTH_USUARIOS` son
hashes, no hay con qué entrar—. `Nuevo-Modor` estaba parada (0 rpm, 64 de 94
puntos con lectura) durante toda la medición. Cada tanda dura unos seis
minutos; cada pregunta, entre 30 y 80 s.

**Lo que destapó la primera pregunta, antes del instrumento.** Desde la
pantalla de `Nuevo-Modor` (`contexto.sistema="vib-motor-03"`), «¿cómo está
esta máquina? ¿qué vibración tiene cada apoyo?» llamó a
`estado_del_sistema(sistema="vibraciones")` y contestó con las 73 señales de
la escrita a mano —«28 de 73 sin lectura», el motor WEG— como si fueran las
94 de la configurada. Ninguna cifra delataba el cambio: son la misma
instalación. Y por nombre, sin contexto, «¿cómo está Nuevo-Modor?» llamó a
`estado_del_sistema(sistema="Nuevo-Modor")`, falló, y llegó a `vib-motor-03`
porque el error de la herramienta trae la lista de ids. Una ronda de más por
pregunta.

**Por qué.** El inventario del prompt decía `Nuevo-Modor — Motor vigilado…`
sin el id, y las definiciones de las herramientas decían literalmente «Id
del sistema: "tanque" o "vibraciones"» en doce sitios. Con las escritas a
mano no se notaba: «tanque» y «vibraciones» son nombre corriente e id a la
vez. El modelo hacía lo que le decían.

**Antes, sobre `Nuevo-Modor` (sin tocar nada):**

| Caso | Contexto | Herramienta → `sistema` | Veredicto |
|---|---|---|---|
| ¿Qué máquinas hay? | no | `sistemas_de_la_planta` | ✓ la lista, con las 4 |
| ¿Cómo está Nuevo-Modor? | no | `"Nuevo-Modor"` → error → `"vib-motor-03"` | ~ llegó corrigiendo, 3 rondas |
| ¿Nuevo-Modor tiene riesgos? | no | `"Nuevo-Modor"` → error → `"vib-motor-03"` | ~ llegó corrigiendo, 3 rondas |
| ¿Cómo está esta máquina? | sí | `sistemas_de_la_planta`, `"vib-motor-03"` | ✓ pero «no he podido resumirlos» |
| ¿Hay algún riesgo activo? | sí | `"vibraciones"`, `"vibraciones-configurada"`, `"vib-motor-03"` | ✗ contesta sobre las tres |
| ¿Cómo ha ido Velocidad eficaz en 7 días? | sí | `historia_de_senal` **sin** `sistema` | ? el texto habla «del motor WEG, sistema de vibraciones»: leyó la escrita a mano |
| ¿Qué dice la documentación…? | sí | `consultar_documentacion` **sin** `sistema` | ? sin filtrar por máquina |

4 de 7 llegaron (2 corrigiendo el id) · 1 se fue a otra máquina · 2 sin decir
máquina. **Con el contexto de su pantalla: 1 de 4.** Nombrándola: 3 de 3.

Sobre `vibraciones-configurada` (la otra configurada, medida por error la
primera vez porque el instrumento tomaba la primera del registro) salió
parecido: 4 de 7 y 2 a otra máquina; `riesgos_activos` por nombre fue a
`"vibraciones"` directamente.

**Después (los cuatro cambios de arriba):**

| Caso | Contexto | Herramienta → `sistema` | Veredicto |
|---|---|---|---|
| ¿Qué máquinas hay? | no | `sistemas_de_la_planta` | ✓ |
| ¿Cómo está Nuevo-Modor? | no | `"vib-motor-03"` | ✓ 2 rondas |
| ¿Nuevo-Modor tiene riesgos? | no | `"vib-motor-03"` | ✓ 2 rondas: «2 informativos, 6 sin comprobar por falta de dato» |
| ¿Cómo está esta máquina? | sí | `sistemas_de_la_planta`, `"vib-motor-03"` | ✓ pero «no he podido resumirlos» |
| ¿Hay algún riesgo activo? | sí | `"tanque"`, `"vibraciones"`, `"vibraciones-configurada"`, `"vib-motor-03"` | ✗ barre las cuatro |
| ¿Cómo ha ido Velocidad eficaz en 7 días? | sí | `historia_de_senal(sistema="vib-motor-03")` | ✓ y pide desambiguar: hay tres «Velocidad eficaz» |
| ¿Qué dice la documentación…? | sí | `consultar_documentacion(sistema="vib-motor-03")`, `limites_del_manual` × 4 | ✓ 6 rondas, «no he podido resumirlos» |

**6 de 7 llegaron, ninguno corrigiendo el id · 1 a otra máquina · 0 sin decir
máquina. Con el contexto de su pantalla: 3 de 4.** Nombrándola: 3 de 3, una
ronda menos cada una.

**Lo que queda, y por qué no se forzó aquí.**

- **«¿Hay algún riesgo activo?» desde su pantalla barre las cuatro máquinas.**
  Antes y después. La pregunta no nombra máquina y el modelo la lee como «en
  la planta»: llama a `sistemas_de_la_planta` y luego a `riesgos_activos`
  por cada una, `Nuevo-Modor` incluida. No es la máquina equivocada, es
  todas; y la regla de `HANDOFF.md` §8 dice que una regla que importa va en
  el código, no en el prompt. Lo que se mediría antes de tocarlo: si con
  `contexto.sistema` y una pregunta sin máquina conviene que `intencion.mjs`
  quite `sistemas_de_la_planta` del catálogo de ese turno. Hoy es `SIEMPRE`.
- **«La consulta devolvió datos, pero no he podido resumirlos»** en dos de
  los siete, antes y después: `estado_del_sistema` de una máquina de 94
  variables, y la documentación tras seis rondas. El modelo de 4B no redacta
  sobre un resultado tan largo. Es **C6** de `MEJORAS-ASISTENTE.md`, no de
  esta fase; con la configurada se nota más porque trae 94 variables sin
  agrupar donde la escrita a mano trae un `resumen()`.
- **Las variables sin descripción comparten etiqueta.** `Velocidad eficaz` es
  la etiqueta de `vRMS_S1`, `vRMS_S2` y `vRMS_S3` a la vez, porque
  `Nuevo-Modor` se configuró sin descripciones y `etiquetaDe` cae al rótulo
  del rol. El asistente lo resolvió bien —pidió elegir—, pero la pregunta era
  ambigua por construcción. Que el configurador (Plan 36) proponga la
  descripción con la carpeta («Velocidad eficaz · S1») es lo que lo quita.
- **`medir-asistente.mjs` con `AUTH_HABILITADA=true` recibe 401** en cada
  `inject`; no se tocó porque no es de esta fase. El instrumento nuevo apaga
  la autenticación en su propio proceso y dice por qué en la cabecera.
- Leyendo el código de las herramientas salieron dos defectos que no son de
  la máquina configurada sino de la herramienta (`resumen_de_turno` y las
  unidades de `metaDe`); anotados en **B7** de `MEJORAS-ASISTENTE.md`.

**Verificación**: puerta (`verificar-herramientas` 169 · `verificar-chat` 68, los
recuentos de ese día; el Plan 39 F0 les añadió 9 y 3 sobre una configurada),
`verificar-instrucciones` 28 reglas con el check nuevo, los 41 verificadores,
backend 385, lint y tipos limpios. El frontend no se tocó.

## 4. Lo que queda fuera

**Retirar `vibraciones.js`.** Sigue siendo la F5 del Plan 34. Mientras, la
misma máquina existe dos veces y la escrita a mano manda sobre los puntos.

**Alarmas de la máquina configurada.** Plan 37 F4.

**El badge del sidebar por máquina configurada.** Exigiría un motor por
máquina montado en todas las pantallas. Se cuenta sólo la escrita a mano.
