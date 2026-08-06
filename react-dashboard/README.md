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

## Los tres orígenes de datos

Hay **tres**, y conviene tenerlos claros porque los tres se ven igual de
plausibles en pantalla. El indicador del Topbar dice siempre cuál está activo,
y los dos que no son reales llevan además una cinta permanente.

| Origen | De dónde salen los datos | Cómo se activa |
|---|---|---|
| 🟢 **En vivo** | Servidor ICONICS | **Por defecto** |
| 🟣 **Simulado** | Transporte falso, sin red | `VITE_ICONICS_FAKE=true` |
| 🟠 **Demo** | Datos de ejemplo fijos | Botón del Topbar, si `VITE_ENABLE_DEMO=true` |

```bash
npm run dev                            # → En vivo (necesita el backend puente)
VITE_ICONICS_FAKE=true npm run dev     # → Simulado (desarrollo sin servidor)
VITE_ENABLE_DEMO=true npm run dev      # → con el interruptor de demo disponible
```

> **El botón de demo se compila bajo bandera y está apagado por defecto.** El
> destino de esto son monitores de planta: sin teclado y sin nadie delante, un
> interruptor que sustituye la planta entera por datos inventados sólo puede
> activarse por accidente, y una vez activado nadie lo desactiva. La cinta de
> aviso funciona con público delante, no en una pared. Con la bandera apagada
> sobreviven el indicador de origen y su cinta —que siguen distinguiendo el
> servidor real del simulador—; lo que desaparece es el interruptor.

> El defecto estuvo invertido durante el desarrollo y se corrigió a
> propósito: la variable se resuelve en **build**, así que un `npm run build`
> sin configurar producía un bundle pegado al simulador para siempre —
> arrancaba, se veía perfecto y no estaba conectado a nada. Ahora una
> instalación limpia intenta el servidor real, y si el backend no está se ve
> un estado de error honesto (huecos «—» y aviso), no cifras plausibles.

**Ningún componente sabe en qué origen está**: se elige una sola vez en
`DataSourceProvider` y las vistas consumen hooks. Al pasar a demo, el motor de
polling **se detiene de verdad** y el árbol de datos se remonta, para que no
queden valores del modo anterior en pantalla.

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
└── theme/                    Colores claro/oscuro + useTheme()
```

### Qué se retiró para producción

En la Fase C del [Plan 3](../docs/PLAN-3-PRODUCCION.md) se acotó la superficie
de la aplicación a lo que un operador debe poder abrir en un monitor sin
teclado:

- **`src/prototypes/` se borró entera** — las 13 rutas de propuestas de diseño
  en evaluación (Sandbox, «Planta · v2» y las diez variantes de área). Su
  invariante de hoja del grafo hizo que retirarlas no tocara una sola línea de
  producción, que era exactamente para lo que estaba puesto.
- **`features/data/` y `features/sankey/` siguen en el árbol pero nadie los
  importa**, así que no entran en el bundle. `Data` hacía altas, escrituras y
  **borrados** contra `db:Northwind`, la base de ejemplo de ICONICS; si vuelve,
  vuelve detrás de autenticación y sin la pestaña de borrado. `SankeyChart` sí
  sigue en producción: lo usa el detalle de máquina.

El registro de rutas (`app/routes/routes.jsx`) es el único sitio donde se
decide esto.

### Flujo de datos

```
vistas  ──usePlantData() / useMachineData()──►  DataSourceProvider
                                                   │
                                    ┌──────────────┴──────────────┐
                              iconicsSource                  demoSource
                                    │
                              pollingEngine  ── 1 petición por ciclo
                                    │
                              transporte (falso | real)
                                    │
                              backend/server.mjs  ── OIDC + FWX REST
```

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
