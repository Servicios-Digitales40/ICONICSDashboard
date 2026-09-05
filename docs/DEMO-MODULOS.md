> **Documento histórico.** Describe el alcance y las decisiones de su fecha, incluidas rutas y archivos posteriormente retirados. Para instalación, capacidades y estructura actuales consulta [el índice documental](README.md).

# Demo EVA — módulos y alcance

## Objetivo

Definir los módulos y submódulos de la demo de cara a la presentación: qué se
enseña, con qué se sostiene cada afirmación, y dónde están los límites.

## Qué es la demo

Un conjunto de máquinas instrumentadas sobre **una misma capa de datos** y **un
mismo asistente**. Hoy hay dos máquinas en planta:

- **Tanque de llenado** — sistema de agua (nivel, presión, caudal, bombeo)
- **Vibraciones** — bancada rotativa (canales de vibración por apoyo)

### Un solo origen de datos

Todo dato de sensor entra por **ICONICS FrameWorX**. Los PLC y los dispositivos
IoT llegan a ICONICS *aguas arriba*; el dashboard no habla con ninguno
directamente. No hay MQTT, no hay OPC-UA en el camino de datos, no hay broker
intermedio ni event bus.

> Decirlo así en la presentación convierte una lista de siglas en una respuesta
> de arquitectura: cada número en pantalla se rastrea hasta su tag
> (`ac:TDCON/DEMO/SENSORES/…`) y hasta la llamada REST que lo trajo.

Para enseñar la demo sin red a planta existe un transporte simulado
(`ICONICS_FAKE`), que sirve las dos máquinas completas.

---

## Módulo transversal — Asistente IA

No pertenece a un módulo: los atraviesa. Es un modelo local (llama.cpp) con
**22 herramientas** agrupadas por familia; el modelo no consulta nada por su
cuenta, sólo llama a herramientas que el servidor expone.

| Familia | Para qué |
|---|---|
| `maquina` | estado, riesgos activos, sistemas, control de bomba |
| `historicos` | historia de señal, gráficas, comparar periodos, correlación, perfil, análisis |
| `documentacion` | consultar manuales, límites del manual |
| `diagnostico` | cruzar las cuatro fuentes y proponer causas |
| `aprendizaje` | cerrar diagnóstico, registrar intervención, proponer regla |
| `registro` | hechos de la planta, recordar hecho |

Añadir un módulo nuevo al asistente = añadir una familia de herramientas. Eso es
exactamente lo que le falta a Predicción (ver más abajo).

---

## Módulo 1 — Monitoreo y Diagnóstico

**El presente y el pasado de una máquina que instrumentamos nosotros.**
Estado: en producción, con las dos máquinas.

### Ver

- Valores y variables actuales, con calidad OPC y **huecos declarados**: un dato
  que no llegó nunca se dibuja como cero
- Histórico: gráficas, comparación entre periodos, valor en un momento dado
- Estado de máquina reflejado en la UI en tiempo real (planta, activos, alarmas)
- Maqueta 3D por máquina
- Riesgos activos por reglas deterministas, propias de cada máquina

### Preguntar

- Preguntas en lenguaje natural sobre sensores, alarmas y estado
- Preguntas sobre los manuales anexados, **citando documento y página real**
- Correlación entre variables, perfil y análisis de señal
- Dictado por voz y modo manos libres

### Documentar

- Alta, reemplazo y archivado de manuales PDF desde la propia pantalla
- Indexación incremental: sólo se reprocesa el archivo que cambió
- Búsqueda híbrida BM25 + embeddings (0,6 coseno / 0,4 BM25)
- Reportes PDF de la conversación y de datos en tiempo real e históricos

### Diagnosticar — las cuatro fuentes

El motor cruza cuatro fuentes independientes y las puntúa:

| # | Fuente | Peso |
|---|---|---|
| 1 | Datos en vivo de ICONICS | 1 – 3 |
| 2 | Límites y procedimientos del manual | 0 – 2 |
| 3 | Casos previos similares | +2, o **−1** si ya se intentó y no funcionó |
| 4 | Tendencia temporal del historiador | 0 – 2 |

La suma cae en una banda **ALTO / MEDIO / BAJO**. La regla que sostiene todo el
módulo: **el código puntúa, el modelo redacta.** El motor es determinista y
reproducible; el modelo narra un resultado ya calculado y no decide ni una
banda, ni un orden, ni una causa.

### Cerrar el ciclo

- **Cierre de diagnóstico**: el técnico registra qué era en realidad y si quedó resuelto
- Ese cierre se convierte en un caso previo → **alimenta la fuente 3**
- Pantalla de revisión de casos, con **archivado** (nunca borrado): lo que se
  aprendió no se pierde, se retira de la búsqueda

Es el único bucle cerrado de la demo, y es el argumento más fuerte que tiene:
el sistema mejora con el uso sin reentrenar nada.

### Lo que se enseña a propósito

- **Conflicto entre fuentes**: si el manual apunta a una causa y el histórico a
  otra, se dice — no se elige ganador ni se suaviza. Enseñar el desacuerdo es
  el trabajo, no resolverlo.
- **Provisionalidad**: un umbral que todavía es estimación nuestra viaja marcado
  como tal, no disfrazado de rango confirmado.
- **Ausencia de dato**: hueco declarado, con su motivo y su cobertura.
- Si falta una pieza (un servidor, un umbral sin calibrar), el sistema **se
  niega y explica qué falta** en vez de degradar en silencio.

### Lo que NO hace

- No hace OCR: un PDF escaneado se marca «no se pudo leer», no se adivina
- No escribe al proceso salvo por los controles explícitos de cada máquina
- La autenticación está construida pero **desactivada** (`AUTH_HABILITADA=false`)
- Los umbrales de búsqueda hay que **re-medirlos** cuando crece la documentación

### Componentes clave

- Asistente IA (llama.cpp local) + servidor de embeddings
- Puente REST a ICONICS FrameWorX (Node / Fastify)
- Motor de diagnóstico determinista
- RAG de documentación (manuales) y RAG de casos (bitácora de intervenciones)
- Frontend React

### Qué tiene que estar arriba

ICONICS FrameWorX · servidor de narración · servidor de embeddings.
Sin red a planta, `ICONICS_FAKE` cubre la demo entera.

---

## Módulo 2 — Predicción

**El futuro de una máquina que no instrumentamos nosotros.**
Estado: beta, sobre API externa.

Alcance de primera instancia: la aplicación de **Leonardo Carrasco** sobre datos
históricos de un **compresor** (MetroPT-3), consumida por API.

**Hoy** existe la pantalla *Predicción (beta)*, que consulta la salud del backend
y el historial de eventos.

**Adónde queremos llevarlo**

- Consultar valores y variables historizadas
- Gráficas y reportes sobre esos valores
- Correlación entre variables
- Preguntas de predicción: «¿cómo se comportará esta variable en X días?»

### Qué falta para que sea un módulo y no una pantalla

1. **El asistente no tiene ninguna herramienta contra esa API.** Las 22 actuales
   hablan con ICONICS. Hace falta una familia nueva de herramientas y sus rutas:
   es trabajo acotado, y es exactamente el paso que convierte una pantalla en un
   módulo consultable en lenguaje natural.
2. **Cerrar el contrato de la API**: qué endpoints, qué variables, qué horizonte
   admite y qué devuelve como incertidumbre.
3. **Decidir cómo se declara la incertidumbre en pantalla.** El proyecto ya tiene
   un lenguaje para esto (`provisional`, huecos, cobertura). Conviene reusarlo y
   no inventar un segundo vocabulario para lo mismo.
4. **Separarlo del pronóstico que ya existe en Monitoreo.** El desgaste acumulado
   del tanque ya es una proyección. Si no se distingue en voz alta, en la
   presentación parecerán lo mismo:
   - *Monitoreo* proyecta sobre **reglas físicas** de una máquina que vemos en vivo
   - *Predicción* modela sobre **histórico** de una máquina que consumimos por API

---

## Preguntas abiertas

- ¿El compresor entra como tercera máquina de planta, o se queda como caso de
  estudio aparte con su propia navegación?
- ¿La demo se enseña contra ICONICS real o contra el transporte simulado? Cambia
  qué hay que tener arriba y qué se puede prometer en vivo.
- ¿Se activa la autenticación para la presentación, o se enseña como capacidad
  construida y desactivada?
