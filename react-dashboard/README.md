# Dashboard Resonac · OEE sobre ICONICS

Panel de planta construido con **React + Vite**. Lee el OEE, la producción y el
estado de las 10 máquinas de Resonac desde un servidor **ICONICS** (AssetWorX),
a través de un backend puente que resuelve la autenticación.

## Requisitos

- Node.js 18 o superior

## Puesta en marcha

```bash
npm install
npm run dev
```

Abre la URL que muestra Vite (normalmente `http://localhost:5173`).

Otros scripts:

```bash
npm run build       # compila a /dist
npm run preview     # sirve /dist localmente
npm test            # pruebas (vitest)
npm run test:watch  # pruebas en modo watch
```

---

## Los dos orígenes de datos

Hay **dos**, y conviene tenerlos claros porque los dos se ven igual de
plausibles en pantalla. El indicador del Topbar dice siempre cuál está activo,
y el que no es real lleva además una cinta permanente.

| Origen | De dónde salen los datos | Cómo se activa |
|---|---|---|
| 🟢 **En vivo** | Servidor ICONICS | **Por defecto** |
| 🟣 **Simulado** | Transporte falso, sin red | `VITE_ICONICS_FAKE=true`, o el botón del Topbar si se compiló con `VITE_ENABLE_SIMULATOR=true` |

```bash
npm run dev                                  # → En vivo (necesita el backend puente)
VITE_ICONICS_FAKE=true npm run dev           # → arranca en Simulado
VITE_ENABLE_SIMULATOR=true npm run dev       # → con el botón para cambiar en caliente
VITE_ICONICS_CHAOS=none npm run dev          # → simulador sin fallos, para enseñar
```

> En PowerShell el prefijo `VAR=valor comando` no funciona: usa
> `$env:VAR="valor"; comando`, o deja las variables fijas en `.env.local`.

> **El botón está apagado salvo que se pida, y se decide en el build.** El
> destino de esto son monitores de planta: sin teclado y sin nadie delante, un
> interruptor que sustituye la planta entera por datos inventados sólo puede
> activarse por accidente, y una vez activado nadie lo desactiva. La cinta de
> aviso funciona con público delante, no en una pared. Con la bandera apagada
> sobreviven el indicador de origen y su cinta —que siguen distinguiendo el
> servidor real del simulador—; lo que desaparece es el interruptor.
>
> Precisión sobre qué garantiza la bandera: `VITE_ENABLE_SIMULATOR` se resuelve
> en compilación y deja `SIMULADOR_CONMUTABLE` en `false`, así que el botón no
> se pinta y `setTransporte`/`alternarTransporte` no hacen nada aunque alguien
> los llame. Además, una preferencia de «simulado» guardada en `localStorage`
> **se ignora** sin la bandera: sin eso, una pantalla que quedó en simulado
> antes de apagarla arrancaría en simulado para siempre, y ya sin botón para
> sacarla. La garantía es de comportamiento, no de bytes.

> **Antes había un tercer origen, «Demo»,** con su propia fuente de datos
> fijos. Se retiró en agosto de 2026 porque se saltaba el motor de polling —y
> con él la calidad OPC, los reintentos y la marca de dato rancio—, que es
> justo lo que hacía falta ejercitar. Lo único valioso que aportaba, poder
> cambiar de origen en caliente, lo heredó el simulador; y su predecibilidad la
> recupera `VITE_ICONICS_CHAOS=none`. Ver
> [`../docs/PLAN-5-DOS-ORIGENES.md`](../docs/PLAN-5-DOS-ORIGENES.md).

### El grado de caos del simulador

| Valor | Para qué |
|---|---|
| `soft` *(defecto)* | Desarrollar. 2 % de calidad mala, 1 % de puntos ausentes, 1 % de no finitos |
| `none` | **Enseñar.** Cero fallos, cero latencia: la pantalla es predecible |
| `high` | Revisar a conciencia el comportamiento degradado, incluidos errores de petición |

Un valor desconocido cae en `soft`, no en `none`: importa la dirección del
fallo, porque un simulador que no ejercita nada pasaría inadvertido.

> El defecto estuvo invertido durante el desarrollo y se corrigió a
> propósito: la variable se resuelve en **build**, así que un `npm run build`
> sin configurar producía un bundle pegado al simulador para siempre —
> arrancaba, se veía perfecto y no estaba conectado a nada. Ahora una
> instalación limpia intenta el servidor real, y si el backend no está se ve
> un estado de error honesto (huecos «—» y aviso), no cifras plausibles.

**Ningún componente sabe en qué origen está**: se elige una sola vez en
`DataSourceProvider` y las vistas consumen hooks. Al cambiar de origen, el
motor de polling anterior **se detiene de verdad** y el árbol de datos se
remonta, para que no queden valores del origen anterior en pantalla.

### Por qué «Simulado» se anuncia tan insistentemente

Los valores del transporte falso son plausibles a propósito: el OEE es el
producto real de sus tres factores, las piezas crecen y los estados rotan entre
los cinco códigos reales. No hay forma de distinguirlo de la planta mirando la
pantalla — de ahí la cinta.

Además imita las respuestas de ICONICS **incluidos los fallos**: calidad mala,
puntos ausentes, valores no finitos y errores de petición. Es adversarial a
propósito: si solo devolviera datos buenos, la UI se escribiría dando por hecho
que todo llega siempre, y eso reventaría el día de la conexión real.

Para el origen real hace falta además levantar el backend puente
(`../backend/server.mjs`) con las credenciales en `../.env.local`.

---

## Estructura

```
src/
├── main.jsx                  Punto de entrada (StrictMode)
├── index.css                 Fuentes, variables CSS de tema, animaciones
│
├── app/                      Armazón: providers, layout y rutas
│   ├── App.jsx               Composición de providers + Shell
│   ├── ErrorBoundary.jsx     Barrera de render: raíz y por página
│   ├── layout/               Sidebar, Topbar, cinta de modo demo
│   └── routes/               Registro ÚNICO de rutas (routes.jsx) + URL
│
├── lib/                      Infraestructura compartida
│   ├── domain/               Forma `Machine`, estados, saneamiento
│   ├── iconics/              Catálogo de tags, motor de polling, transporte
│   ├── datasource/           Interfaz + fuente ICONICS + fuente demo + hooks
│   ├── format.js             Formateo consciente de la ausencia de dato
│   ├── machines.js           Datos de ejemplo (heredado; lo usa la demo)
│   └── shiftModel.js         Tiempos de turno y metas
│
├── features/                 Un módulo por área funcional
│   ├── dashboard/            Resumen de planta (rollup + tiles)
│   ├── machines/             Monitor de área y detalle de máquina
│   ├── assets/               Explorador del árbol de AssetWorX
│   ├── data/                 Puntos sueltos — SIN RUTA (ver abajo)
│   └── sankey/               Diagramas de flujo — SIN RUTA (ver abajo)
│
├── components/               Átomos de UI reutilizables (ui/, charts/)
├── theme/                    Colores claro/oscuro + useTheme()
└── prototypes/               Propuestas en evaluación — SOLO en el build de demo
```

### Qué ve cada build

En la Fase C del [Plan 3](../docs/PLAN-3-PRODUCCION.md) se acotó la superficie
de la aplicación a lo que un operador debe poder abrir en un monitor sin
teclado. El registro de rutas (`app/routes/routes.jsx`) es el único sitio donde
se decide:

| | Planta | Demo |
|---|---|---|
| Planta, Lineales, Rectificadoras, Detalle, Assets | ✅ | ✅ |
| Las 12 propuestas de `src/prototypes/` | — | ✅ |
| Interruptor de origen de datos | — | ✅ |

- **Las propuestas de diseño existen sólo en el build de demo.** No es que
  estén ocultas: en el build de planta **no se generan siquiera sus trozos**.
  Eso depende de dos detalles que conviene no «limpiar» sin leer el comentario
  de `routes.jsx` — se cargan con `import()` dinámico, y la condición es un
  ternario y no una función auxiliar. Con un import normal viajarían a planta
  aunque su ruta no se registrara; con una función auxiliar, el empaquetador no
  puede probar que la rama está muerta y los emite igual. Las dos cosas se
  descubrieron rompiéndolas, y `src/test/app/routes.test.jsx` las fija.
- **`features/data/` y `features/sankey/` siguen en el árbol pero nadie los
  importa**, así que no entran en ningún bundle. `Data` hacía altas, escrituras
  y **borrados** contra `db:Northwind`, la base de ejemplo de ICONICS; si
  vuelve, vuelve detrás de autenticación y sin la pestaña de borrado.
  `SankeyChart` sí sigue en producción: lo usa el detalle de máquina.

### Flujo de datos

```
vistas  ──usePlantData() / useMachineData()──►  DataSourceProvider
                                                   │
                                              iconicsSource
                                                   │
                                              pollingEngine  ── 1 petición por ciclo
                                                   │
                                    ┌──────────────┴──────────────┐
                              transporte real                transporte falso
                                    │                        (fakeTransport)
                              backend/server.mjs  ── OIDC + FWX REST
```

**Un solo camino, y la bifurcación abajo del todo.** Hasta el Plan 5 había una
segunda rama a la altura de la fuente —`demoSource`— que entregaba `Machine` ya
construidas y por tanto se saltaba el motor, la calidad OPC, los reintentos y la
marca de dato rancio. Ahora lo único que cambia es de dónde salen los bytes, así
que el simulador ejercita exactamente el mismo código que el servidor.

---

## Cómo está pensado

- **Las vistas no saben de dónde vienen los datos.** Consumen hooks; el origen
  se decide en la raíz. Eso es lo que permite que el botón de demo sea un solo
  `if` y no un flag repartido por toda la UI.

- **Un poller, una petición, muchos suscriptores.** Los componentes declaran qué
  tags necesitan al montar y los liberan al desmontar; el motor agrupa la unión
  en una sola llamada en lote. Son ~4 peticiones/min en la vista de planta y ~12
  en el detalle, frente a ~120 y ~168 con un intervalo por componente.

- **Un hueco se pinta como hueco, nunca como cero.** Cualquier métrica puede
  faltar (mala calidad, tag ausente, división por cero en el servidor). Un
  `0.00 %` inventado en un tablero de planta se lee como una máquina parada.

- **Un solo lugar para los colores.** Todo componente lee de `useTheme()` y nunca
  escribe un color literal.

- **El vocabulario de estados vive en `lib/domain/estado.js`**, no duplicado
  entre la tarjeta y el dashboard.

- **La ruta actual vive en la URL.** `/area-REC` abre las rectificadoras
  directamente, una recarga vuelve donde estaba y el enlace de una máquina se
  puede enviar. Antes era un `useState` y la barra de direcciones no cambiaba
  nunca: en un escritorio no se nota, pero obligaba a ir pantalla por pantalla
  a dejarlas en su vista, y cualquier reinicio las devolvía a Planta.

- **Una excepción de render no apaga el tablero.** `ErrorBoundary` envuelve
  cada página y la raíz; una vista rota se queda en su sitio con un panel que
  lo dice, y la barra lateral sigue navegable. En un monitor de planta nadie
  recarga, así que una pantalla en blanco se queda en blanco hasta que alguien
  sube a verla.

- **La pantalla dice qué build corre.** El Topbar muestra el `git describe` del
  build. Es lo primero que hace falta cuando alguien reporta que un número está
  mal: saber si esa pantalla concreta ya tiene el arreglo.

---

## Documentación

- [`docs/PLAN-1-CONEXION-ICONICS.md`](../docs/PLAN-1-CONEXION-ICONICS.md) — plan de conexión y riesgos
- [`docs/PLAN-2-MEJORAS.md`](../docs/PLAN-2-MEJORAS.md) — mejoras propuestas
- [`docs/TAGS.md`](../docs/TAGS.md) — tabla Excel → punto ICONICS → campo de dominio

## Pruebas

```bash
npm test
```

Cubren cuatro cosas:

- **Saneamiento del dominio** — calidad ≠ 192, `NaN`, `Infinity`.
- **Motor de polling** — presupuesto de red, ciclo de vida, backoff, troceado.
- **Referencia numérica congelada** — garantiza que la migración a ICONICS no
  movió ningún cálculo del rollup de planta.
- **Render de las vistas con datos incompletos** — las subvistas del detalle se
  montan de verdad con máquinas agujereadas, porque los dos fallos que llegaron
  a pantalla fueron de render, no de lógica.

Si un cambio deliberado altera los números del rollup, se regenera la referencia:

```bash
UPDATE_GOLDEN=1 npm test
```

### Verificar el catálogo contra el servidor

El catálogo de tags se derivó del Excel de configuración, no del servidor: son
dos artefactos que pueden divergir. Este script lee de una vez los 147 puntos
que la app puede pedir y reporta cuáles no existen o vuelven con mala calidad.

```bash
node backend/server.mjs               # en una terminal
node scripts/verificar-catalogo.mjs   # en otra
```

Conviene lanzarlo cada vez que cambie la configuración de ICONICS y ante
cualquier «falta un dato en el panel»: resuelve en una ejecución lo que si no
obliga a ir vista por vista.

## Stack

- [React 18](https://react.dev)
- [Vite](https://vitejs.dev) — bundler y servidor de desarrollo
- [Vitest](https://vitest.dev) — pruebas
- [Recharts](https://recharts.org) — gráficas
- [Lucide React](https://lucide.dev) — iconos
