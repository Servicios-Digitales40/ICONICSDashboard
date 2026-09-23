# Product

<!-- impeccable:product-schema 1 -->

> **Revisado el 22-09-2026.** Este documento nació cuando el proyecto era un
> tablero de demostración sobre ocho señales de un sistema de agua. Ya no es
> eso. Lo que sigue describe lo que el proyecto es hoy; lo que fue queda en
> «Evidencia» y en los planes de `docs/completados/`.

## Platform

web

## Users

**Quien configura** (rol `administrador`): un técnico o integrador que conoce
la instalación y el servidor ICONICS, y que da de alta una máquina marcando
sus señales en el árbol, comprueba que existen, sondea sus series, le asigna
documentación y declara lo que la instalación no permite. No programa: todo
lo hace desde `Planta › Configuración`.

**Quien opera o consulta** (roles `operador` y `visualizador`): mira la máquina
configurada —estado, gráficas, hallazgos, avisos—, pregunta al asistente por
su estado, por una señal, por un valor a una hora, pide una gráfica o un
reporte, y cierra un diagnóstico cuando se confirma una causa. No conoce los
nombres de los tags ni necesita conocerlos.

**El prospecto en una demo** sigue existiendo como usuario: alguien sin
contexto que tiene que entender, mirando, que sobre sus datos de ICONICS se
puede montar esto. Quien conduce la demo necesita que nada falle delante de él.

## Product Purpose

**Una plataforma de configuración de máquinas con ICONICS FrameWorX como
única fuente de verdad de planta.** El ciclo completo, en el orden en que lo
vive quien configura:

1. **Configurar la máquina** desde el árbol de ICONICS (`ac:` en vivo, `hda:`
   del historiador, `ae:` de alarmas): se marcan sus activos y señales, se les
   da un rol del **tipo** de máquina (hoy, «vigilancia de vibraciones» con un
   SIPLUS CMS SM 1281 y su variador), un nombre, un PLC. La configuración vive
   en `datos/maquinas.json` y el backend la registra sin reiniciar.
2. **Verificar** contra el servidor: que cada punto existe (`/verificar`) y
   que cada serie del historiador es la de su variable y no la de otra
   (`/sondear`). El historiador de esta planta ha servido una serie con dos
   nombres sin dar error; por eso ninguna serie promete historia hasta que el
   sondeo la comprueba, y las que no cambian se verifican por sus marcas de
   tiempo, no por sus valores.
3. **Documentar**: los manuales de la máquina (norma ISO 20816-3, manual del
   SM 1281, manual del variador…) se asignan al tipo o a la máquina en
   `Planta › Documentación`, y el asistente los consulta con búsqueda
   semántica y BM25 sobre índices JSON locales.
4. **Consultar** al asistente, en lenguaje natural y sobre la máquina que se
   tiene delante: estado de la máquina, estado y valor de una señal, valor a
   una hora, tendencia, comparación de periodos, correlación entre señales,
   gráfica, resumen de turno, reporte PDF, alarmas sostenidas, riesgos
   activos, diagnóstico de una falla y pronóstico. Veintiséis herramientas,
   todas leyendo de ICONICS o de los índices locales; el modelo redacta, no
   inventa.
5. **Diagnosticar y aprender**: el motor de diagnóstico (abajo) puntúa las
   causas posibles de un riesgo activo; quien opera cierra el diagnóstico con
   la causa real y una intervención, y ese caso queda para la próxima vez.

**El motor de diagnóstico** (`backend/ia/motor/`) es determinista y el modelo
de lenguaje no lo toca. Junta tres fuentes y puntúa: las **reglas de riesgo
del tipo** evaluadas sobre el dato en vivo (18 reglas para vibraciones,
declaradas por concepto —`vRMS`, `aRMS`, `DKW`, banderas del módulo,
variador— y no por tag, así que valen para cualquier máquina del tipo), los
**manuales** asignados, y los **casos previos** cerrados. Devuelve las causas
ordenadas con su puntuación y su evidencia; el asistente las narra en ese
orden y con instrucción de no reordenarlas. Desde los Planes 38 y 40 el motor
trabaja **sobre la máquina configurada**: las reglas, los alias con que una
persona nombra una señal, la simulación y el estado común salen del tipo, no
de una máquina escrita a mano. Lo que aún debe evolucionar está medido y
anotado: los umbrales de puntuación (`UMBRAL_*`) están calibrados con los
instrumentos `medir-*` y se recalibran con datos de planta; «Casos previos»
está vacío para vibraciones porque ningún caso cerrado es suyo todavía; el
tanque sigue con reglas escritas a mano y un `switch` que desaparece al
reabrirlo (B2 del backlog); y la vista de alarmas de la máquina configurada
espera a que una bandera cambie de verdad (F11).

**Éxito** es que dar de alta la siguiente máquina sea configurar, no
programar: sin tocar el asistente, sus herramientas, el motor ni el
transporte. Y que quien mira la pantalla entienda qué puede construir sobre
sus datos sin que nadie le explique la arquitectura.

## Positioning

**El dato es real y la plataforma no inventa lo que falta.** Cada número viene
de una lectura contra ICONICS con su calidad y su marca de tiempo. Una serie
sin verificar no se dibuja; un valor sin dato es un hueco, no un cero; un
umbral sin calibrar se declara provisional; una alarma que nunca sonó se
verifica como «registrada, no ha cambiado», no como «distinta de otra igual».
La máquina lleva escritas sus **limitaciones** —lo que la instalación no
permite y lo que la configuración todavía no ha comprobado— y el asistente las
cita al contestar. Eso es lo que una maqueta no puede copiar honestamente.

**Todo es local.** El modelo de lenguaje corre en un `llama-server` propio; no
sale ningún dato a una API de terceros. No hay base de datos ni motor de
vectores: la persistencia es JSON con escritura atómica, y se revisa con
medición, no por intuición.

## Operating Context

- Se usa en **portátil o monitor de escritorio**, en resoluciones de
  1440–1920 px. El responsive existe pero no es el escenario que manda.
- **Autenticación encendida** con tres roles jerárquicos: `administrador >
  operador > visualizador`. Configurar, sondear y accionar exige el rol que
  toca; la pantalla no ofrece lo que el backend va a negar.
- Dos despliegues: desarrollo (Vite con proxy al backend) y planta (el backend
  Fastify sirve el bundle desde el mismo origen). El backend que corre puede ir
  por detrás del código: es un proceso `node` arrancado a mano.
- Modos degradados para trabajar sin planta: `ICONICS_FAKE=true` levanta el
  backend entero sobre un transporte simulado que reproduce también los fallos
  documentados del servidor real; `scripts/sembrar-espejo.mjs` siembra la
  máquina de vibraciones de la demo. Ninguno debe llegar a producción.
- **La rama `Vibraciones1.0` es sólo de vibraciones** desde el 17-09-2026: la
  estación de llenado (tanque y grupo de bombeo) está cerrada por mantenimiento
  y su código no se toca. Todo lo que este documento describe del tanque es
  lo que vuelve al reabrir (Plan 33 F9).

## Capabilities and Constraints

- **ICONICS es la única fuente de datos de sensor de planta.** Sin MQTT, sin
  OPC-UA en el camino, sin event bus. Todo entra por `backend/iconics/client.mjs`
  (REST, OIDC, certificado autofirmado). El módulo de Predicción consume un
  compresor por una API externa, lo declara en `shared/modulos.js`, nunca
  mezcla su dato con el de planta, y hoy está oculto del menú.
- **Sistema ≠ módulo.** Un sistema es una máquina leída por ICONICS y vive en
  el registro (`shared/eva/comun/sistemas.js`), que no es una lista sino código
  ejecutable: `puntos()`, `parse()`, `modelo()`, `esHistorizada()`. Una máquina
  configurada entra en el registro construida desde su configuración y su
  tipo (`construirSistema`). Una que no se lee por ICONICS no entra.
- **El tipo es la unidad de reutilización.** Roles, umbrales, reglas de
  riesgo, alias, simulación, estado común, series equivalentes: todo lo que
  vale para cualquier motor con un SM 1281 vive en `shared/eva/tipos/`. Lo que
  es de la instalación concreta (qué apoyos tiene, con qué sensibilidad, qué
  no permite) vive en la configuración.
- **La verificación es una foto con fecha, no una lista blanca.** El sondeo
  se vuelve a correr; nunca baja a `false` lo que ya estaba verificado por un
  fallo de lectura; lo que no puede afirmar lo dice con su causa
  (`serie-propia`, `registrada-constante`, `registrada-equivalente`,
  `serie-compartida`, `sin-muestras`, `no-se-pudo-leer`).
- **Escritura a la planta deshabilitada por defecto** (`ICONICS_READ_ONLY`).
  Toda variable configurada entra como lectura; marcar una como escribible no
  se hace desde la pantalla. Los accionamientos, cuando se habilitan, se
  registran en un diario y exigen rol de operador.
- **Frontera de capas.** `shared/` es dominio puro, sin React ni `fetch`, y se
  prueba en Node. Una vista no calcula una banda de riesgo: la pide al
  dominio. Un dato que no llegó se representa como hueco, nunca como cero.
- **La vista de la máquina configurada**: Inicio, Planta (tendencias del
  historiador), Estado mecánico, Vista 3D, Detalle por activo, Hallazgos,
  Avisos, Casos previos y RAG, más Configuración y
  Documentación. Las rutas se declaran en `app/routes/routes.jsx`; el menú
  se deriva del registro.
- Stack fijado por el código: React + Vite, Recharts, three.js con
  @react-three/fiber, lucide-react, i18n es/en; backend Node 24 con Fastify,
  zod, pino y pdfkit, entre quince dependencias con su porqué. **Ninguna
  dependencia nueva sin pedirla antes.**

## Brand Commitments

Ninguno vinculante. La paleta y las tipografías (Plus Jakarta Sans, Inter, IBM
Plex Mono) son una decisión de implementación, no un requisito del cliente.
Existe un tema Mitsubishi Electric junto al claro y el oscuro. No hay
obligación de parecerse a ICONICS.

## Evidence on Hand

- Una máquina real configurada contra el `bms-server` de planta:
  `vib-motor-03` («Nuevo-Modor»), 86 variables, 6 activos, tres apoyos con
  SM 1281 y un variador V20. Su sondeo del 22-09-2026: 78 de 86 series
  verificadas (32 propias, 46 constantes registradas), 2 indistinguibles entre
  sí, 5 sin muestras, 1 sin leer. El motor gira sin carga acoplada; está
  declarado en sus limitaciones.
- Medidas contra el historiador real, con fecha, en `docs/completados/`
  (Planes 34, 41 y 42): el cruce de `aPeak_S1`, las nueve `QC_*` idénticas, el
  registro sólo al cambiar, las ventanas anchas vacías.
- Ocho señales reales del sistema de agua bajo `ac:TDCON/DEMO/SENSORES/`, con
  su histórico, hoy cerradas con la rama.
- Manuales asignados al tipo de vibraciones (ISO 20816-3, SM 1281, V20) en el
  índice documental local.
- `react-dashboard/IcoUnifiedConfigSetIco_Assets_2026-07-28_12.48.07.057.xlsx`:
  export de configuración del servidor.
- **No hay** testimonios, clientes nombrados, benchmarks, precios ni métricas
  de negocio. No deben fabricarse.
- Hasta agosto de 2026 la aplicación fue un tablero de OEE sobre diez máquinas
  de Resonac; se retiró entero y no debe citarse como parte del producto.

## Product Principles

1. **El código puntúa, el modelo redacta.** El motor de diagnóstico es
   determinista; el modelo narra un resultado ya calculado y jamás decide una
   banda, un orden o una causa.
2. **La ausencia de dato nunca se disfraza de cero**, ni la ausencia de
   variación de comprobación fallida. Hueco, motivo y cobertura viajan con el
   dato.
3. **No se inventa lo que falta.** Si algo exige un servidor que no está, un
   umbral sin calibrar o una verificación que no se hizo, el código lo dice
   (`fallo(...)`, `provisional: true`, limitaciones) en vez de simular.
4. **Configurar, no programar.** Una máquina nueva es una entrada del
   registro construida desde su configuración y su tipo. Si dar de alta la
   siguiente exige tocar el asistente o el motor, algo está en el sitio
   equivocado.
5. **Una sola fuente por concepto.** El dominio compartido vive una vez en
   `shared/`; una regla que necesitan backend y frontend no se duplica.
6. **Primero lo mínimo, y crecer con una medición delante.** Sin base de
   datos, sin enrutador, sin niveles de menú, hasta que una medida o un
   incidente lo justifique.
7. **La demo no puede fallar delante del cliente.** El transporte falso y la
   máquina espejo existen para que siempre haya algo que enseñar.
