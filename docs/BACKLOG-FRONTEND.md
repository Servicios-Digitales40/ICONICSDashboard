> **Propuestas históricas.** Este documento conserva el análisis de su fecha; sus prioridades y estados no se asumen vigentes. El estado actual está en [el índice documental](README.md) y en el código. Las vistas del antiguo dashboard ya no forman parte de esta rama.

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

## Orden sugerido

1. **F4** — pequeño, aislado, y convierte «añadir una sección» en «no hacer nada»
2. **F7 (la prueba del sondeo)** — antes de tocar los motores, no después
3. **F2** — el `useMaquina` unificado, con la red ya puesta
4. **F3** — cae solo una vez F4 y F2 estén hechos
5. **F1** — el mayor, y el que más gana con hacerlo al final: con el sondeo
   unificado, parametrizar una vista es mucho menos trabajo
6. **F5** — decisión de una tarde, coordinada con B5

**F6 no es una tarea**: es algo que revisar cuando llegue la #3.
