# PLAN 38 — El registro conoce las máquinas configuradas

**Estado:** F1–F2 completadas · **pendiente de verse en el navegador**
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

## 4. Lo que queda fuera

**Retirar `vibraciones.js`.** Sigue siendo la F5 del Plan 34. Mientras, la
misma máquina existe dos veces y la escrita a mano manda sobre los puntos.

**Alarmas de la máquina configurada.** Plan 37 F4.

**El badge del sidebar por máquina configurada.** Exigiría un motor por
máquina montado en todas las pantallas. Se cuenta sólo la escrita a mano.
