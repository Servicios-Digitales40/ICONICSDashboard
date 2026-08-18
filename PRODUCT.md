# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

El usuario principal es un **prospecto en una demostración comercial**: alguien
a quien se le enseña el tablero para que entienda, en minutos y sin formación
previa, que las señales de una instalación real de ICONICS pueden leerse,
representarse y consultarse en lenguaje natural desde una interfaz propia. No
opera la planta ni conoce los nombres de los tags; llega sin contexto y decide
mirando.

Quien conduce la demo (el equipo que la presenta) es un usuario secundario:
necesita llegar rápido a la vista que quiere enseñar y que nada falle delante
del cliente.

## Product Purpose

Demostrar la integración con un servidor **ICONICS** (AssetWorX + Hyper
Historian) sobre un caso concreto: un sistema de agua industrial con ocho
señales bajo `ac:TDCON/DEMO/SENSORES/`. El tablero las presenta de cuatro
formas —estado de planta con histórico, grupo de bombeo en 3D, maqueta 3D de la
instalación, y árbol de assets con valor y calidad en crudo— más un asistente
de chat opcional que responde consultando ICONICS de verdad.

Éxito es que el prospecto entienda qué se puede construir sobre sus datos sin
que nadie tenga que explicarle la arquitectura.

## Positioning

El dato es real, no maquetado: cada número que se ve en pantalla viene de una
lectura contra el servidor ICONICS, con su calidad y su marca de tiempo. El
asistente no describe la instalación de memoria, la consulta. Eso es lo que un
mockup de la competencia no puede copiar honestamente.

## Operating Context

- Se enseña en **portátil o monitor de escritorio**, a distancia normal de
  lectura, en resoluciones de 1440–1920 px. El responsive móvil existe pero no
  es el escenario que manda.
- La sesión de demo es corta y guiada: se navega entre las cuatro vistas desde
  el sidebar, empezando en `eva-planta` (`DEFAULT_ROUTE`).
- Hay dos despliegues: desarrollo (Vite en :5173 con proxy a :3001) y planta
  (el backend sirve el bundle desde el mismo origen).
- Existen modos degradados para enseñar la demo sin servidor de planta:
  `VITE_ICONICS_FAKE` (transporte falso), `VITE_ENABLE_SIMULATOR` (origen
  simulado en el selector) y `VITE_ICONICS_CHAOS` (latencia y fallos
  provocados). Ninguno debe llegar a producción.

## Capabilities and Constraints

- Cuatro vistas registradas en `react-dashboard/src/app/routes/routes.jsx`:
  Planta, Máquina 3D, Maqueta 3D y Assets. El registro es la superficie
  completa de la aplicación; añadir una página es una sola edición ahí.
- El **Asistente** es opcional: sin `IA_BASE` no aparece la sección.
- **Escritura deshabilitada.** El backend bloquea escrituras
  (`ICONICS_READ_ONLY`), y el módulo `features/data/` —altas, escrituras y
  borrados de puntos— existe en el árbol pero nadie lo importa, así que no
  entra en el bundle. Criterio documentado en `routes.jsx`: un botón
  «Eliminar» no debe existir en un tablero de planta aunque no funcione.
- **Criterio de superficie heredado del código** (no reabierto en esta
  entrevista): toda ruta debe poder abrirse en un monitor sin teclado. Nace de
  la etapa en que el destino era planta; sigue vigente en el código y acota
  cualquier interacción que dependa de escribir.
- `shared/eva/senales.js` es el único archivo que contiene nombres de tag. El
  resto del frontend no sabe cómo se llama un punto en el servidor.
- **No todas las señales traen unidad.** El servidor no las declara: cuatro de
  las ocho llevan `%`, `°C` o `V`, y las demás van con `unidad: ""` a
  propósito, porque inventar «l/s» sería mentir sobre el dato. El diseño no
  puede asumir que todo valor tiene sufijo.
- La calidad de la señal (`shared/quality.js`) es parte del dato y se muestra
  en crudo en la vista de Assets.
- Stack fijado por el código existente: React 18 + Vite 5, Recharts para
  gráficas, three.js / @react-three/fiber para 3D, lucide-react para iconos.
  Backend Node sin dependencias.

## Brand Commitments

Ninguno vinculante. La paleta azul actual y las tipografías (Plus Jakarta Sans,
Inter, IBM Plex Mono) son una decisión de implementación, no un requisito del
cliente: pueden cambiarse. No hay identidad corporativa externa que respetar ni
obligación de parecerse a ICONICS.

## Evidence on Hand

- Ocho señales reales bajo `ac:TDCON/DEMO/SENSORES/`, con histórico para las
  que el Hyper Historian entrega.
- Árbol de assets navegable de AssetWorX.
- `react-dashboard/IcoUnifiedConfigSetIco_Assets_2026-07-28_12.48.07.057.xlsx`:
  export de configuración del servidor.
- Capturas en `react-dashboard/img/` y planes en `docs/`.
- **No hay** testimonios, clientes nombrados, benchmarks, precios ni métricas
  de negocio. No deben fabricarse.
- Hasta agosto de 2026 la aplicación fue un tablero de OEE sobre diez máquinas
  de Resonac; se retiró entero. Ese material no está disponible y no debe
  citarse como parte del producto actual.

## Product Principles

1. **El dato manda sobre el adorno.** Si un valor no tiene unidad, calidad o
   marca de tiempo fiable, la interfaz lo dice; no lo rellena.
2. **Comprensible en frío.** El prospecto llega sin contexto: cada vista debe
   explicarse sola, sin vocabulario de planta ni nombres de tag a la vista
   salvo donde el crudo es el punto (Assets).
3. **Nada que escriba en el servidor.** La demo es de lectura; cualquier
   affordance de edición es una promesa que el backend no cumple.
4. **Una sola fuente por concepto.** Los tags viven en `shared/eva/senales.js`,
   los colores en `theme/themes.js`, las rutas en `routes.jsx`. Duplicarlos es
   como diverge la demo.
5. **La demo no puede fallar delante del cliente.** Los modos degradados
   (falso, simulado, caos) existen para que haya algo que enseñar cuando el
   servidor de planta no responde.
