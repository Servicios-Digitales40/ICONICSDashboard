# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

El usuario principal es un **técnico de mantenimiento delante del equipo**. Sabe
de la máquina más que de la aplicación, tiene las manos ocupadas o sucias, y
llega con una pregunta concreta: por qué vibra distinto, qué decía el manual
sobre esa presión, si esto ya pasó antes y cómo se resolvió. No viene a navegar
un tablero: viene a preguntar y a volver al trabajo.

Un usuario secundario es **quien mantiene el conocimiento del sistema**: el
responsable que sube los manuales nuevos y poda la bitácora de casos para que
los diagnósticos sigan valiendo. Es un uso ocasional pero decisivo — la calidad
de las respuestas depende de él.

El prospecto en demostración comercial dejó de ser el usuario principal cuando
esta rama nació. Los antecedentes de la demo se conservan, pero el producto ya no se diseña
para que alguien lo mire: se diseña para que alguien lo use con una avería
delante.

## Product Purpose

Contestar preguntas sobre una instalación real leyendo **ICONICS** (AssetWorX +
Hyper Historian) de verdad, y diagnosticar fallas cruzando cuatro fuentes: los
datos en vivo, los manuales de la máquina, los casos previos ya resueltos y la
tendencia de la señal en el tiempo.

Concretamente, el asistente sabe:

1. El valor actual de cualquier señal, con su calidad y su marca de tiempo.
2. Su histórico: evolución, extremos, comparación entre periodos, correlación.
3. Qué dicen los manuales (búsqueda documental sobre los PDF cargados).
4. Qué límites documenta el manual, y **por cuánto** los excede lo medido.
5. Qué causas puede tener un riesgo activo, ordenadas por respaldo.
6. Registrar qué se hizo para arreglarlo — y accionar la bomba, si hace falta.
7. Recibir manuales nuevos desde la propia interfaz.

Éxito es que el técnico obtenga en una conversación lo que antes exigía abrir
un historiador, buscar un PDF y preguntar a quien llevaba diez años allí.

## Positioning

El dato es real, no maquetado: cada número viene de una lectura contra ICONICS,
con su calidad y su marca de tiempo. **El asistente no describe la instalación
de memoria, la consulta.**

Y el diagnóstico no lo redacta un modelo de lenguaje: lo calcula código
determinista que puntúa las cuatro fuentes, y el modelo sólo narra un resultado
ya decidido. Esa frontera es el producto — es lo que permite enseñar la
evidencia detrás de cada respuesta en vez de pedir confianza.

## Operating Context

- Se usa en **portátil o tablet junto a la máquina**, y en monitor de
  escritorio. La sesión es corta y con una pregunta concreta detrás.
- **Como referencia de uso, una respuesta puede tardar entre 30 y 90 segundos según el modelo y el equipo.** Es la restricción que manda
  sobre la interfaz entera: el estado se dice con palabras y con los segundos
  que lleva, siempre se puede cancelar, y un turno que acaba en nada se puede
  repetir sin volver a teclear la pregunta.
- **Las manos pueden estar ocupadas.** Hay dictado y un modo manos libres que
  cierra el turno solo al dejar de hablar y contesta en voz alta.
- Se entra con **usuario y contraseña de ICONICS**. No hay directorio de
  usuarios propio: la sesión es la de esa persona en el servidor de planta, y
  sus permisos también.
- Dos despliegues: desarrollo (Vite en :5173 con proxy a :3001) y planta (el
  backend sirve el bundle desde el mismo origen). **En producción la aplicación
  debe servirse por HTTPS**: la cookie de sesión va `Secure` y sin TLS el login
  no funciona.
- `ICONICS_FAKE=true` permite trabajar sin red a planta. Nunca en producción.

## Capabilities and Constraints

- **Una sola vista.** El chat. No hay rutas, ni sidebar, ni navegación: lo que
  haya que enseñar se enseña dentro o en uno de sus tres cajones —Assets,
  Manuales y Casos—. Es una invariante declarada, no una etapa.
- Los tres cajones existen por un criterio único: **lo que alimenta al
  asistente se queda; lo que sólo lo pinta, se va.** Assets es la herramienta
  con la que se diagnostica «falta un dato»; Manuales es el único camino por el
  que entra conocimiento externo; Casos es la única fuente que se llena sola y
  por tanto la única que puede degradarse sin que nadie haga nada.
- **El asistente puede escribir en la planta** (`controlar_bomba`), con dos
  puertas: `ICONICS_READ_ONLY` a nivel de servidor, y los permisos que ICONICS
  aplica al usuario de la sesión.
- **No todas las señales traen unidad.** El servidor no las declara: algunas
  llevan `%`, `°C` o `V`, y las demás van sin sufijo a propósito, porque
  inventar «l/s» sería mentir. El diseño no puede asumir que todo valor lo
  tiene.
- **La ausencia de dato nunca se disfraza de cero.** Un hueco del historiador,
  una calidad OPC mala o una lectura que no llegó se representan como hueco y
  se cuentan aparte.
- Stack: React 18 + Vite 5, lucide-react para iconos, marked + dompurify para
  el markdown de las respuestas, TanStack Query para las consultas del cajón de
  Assets. **Sin librería de gráficas y sin 3D** — se retiraron con el tablero.
  Backend Node + Fastify.

## Brand Commitments

Ninguno vinculante. Los tres temas (claro, oscuro y Mitsubishi Electric) y las
tipografías (Plus Jakarta Sans, IBM Plex Mono) son decisiones de
implementación. No hay identidad corporativa externa que respetar.

Lo único que **no** es negociable por ser identidad estructural y no estética:
el trazo que se dibuja mientras la respuesta llega, derivado de los caracteres
que de verdad han llegado y nunca de una onda decorativa. Es la lectura de una
señal real, que es de lo que va este producto.

## Evidence on Hand

- Señales reales bajo `ac:TDCON/DEMO/SENSORES/` (sistema de agua) y el árbol de
  vibraciones, con histórico para las que el Hyper Historian entrega.
- Árbol de assets navegable de AssetWorX.
- Manuales en PDF indexados, y la bitácora de casos en `datos/aprendizaje.json`.
- **No hay** testimonios, clientes nombrados, benchmarks, precios ni métricas
  de negocio. No deben fabricarse.
- Hasta septiembre de 2026 esta aplicación fue un tablero de veintidós
  pantallas con vistas 3D y gráficas. Se retiró entero en la rama `Asistente`.
  Sigue existiendo en `Moises6`, pero no forma parte de este producto y no debe
  citarse como si lo fuera.

## Product Principles

1. **El dato manda sobre el adorno.** Si un valor no tiene unidad, calidad o
   marca de tiempo fiable, la interfaz lo dice; no lo rellena.
2. **La espera se cuenta, no se disimula.** Treinta a noventa segundos exigen
   decir en qué paso va, cuánto lleva y cómo cancelar. Una barra indeterminada
   girando un minuto no informa de nada.
3. **Cada respuesta enseña de dónde salió.** Qué herramienta se usó y con qué
   se preguntó. Es lo que permite detectar una respuesta recitada de memoria, o
   una consulta hecha sobre la señal equivocada.
4. **El código puntúa, el modelo redacta.** Un modelo de lenguaje no decide si
   algo puede reventar ni qué causa es más probable.
5. **Una sola vista.** Un segundo destino navegable es el primer paso para
   volver a tener veintidós.
6. **Nada se inventa.** Si falta un servidor, un manual o un umbral calibrado,
   se dice qué falta y cómo resolverlo, en vez de simular una respuesta.
