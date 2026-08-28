# Demo EVA · Frontend

Panel construido con **React + Vite**. Lee las ocho señales del sistema de agua
industrial (`ac:TDCON/DEMO/SENSORES/`) desde un servidor **ICONICS**
(AssetWorX y Hyper Historian), a través de un backend puente que resuelve la
autenticación.

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
> interruptor que sustituye la instalación entera por datos inventados sólo
> puede activarse por accidente, y una vez activado nadie lo desactiva. La cinta
> de aviso funciona con público delante, no en una pared. Con la bandera apagada
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

**El origen simulado cubre las DOS máquinas.** El tanque lo sirve
`Demo-EVA/data/simulador.js`; el sistema de vibraciones,
`Demo-EVA/data/simuladorVibracion.js`. Son dos archivos porque son dos
instalaciones sin un punto en común — la misma razón por la que tienen catálogos
y reglas separados. Durante un tiempo sólo existía el primero y `useVibracion`
salía a la red pasara lo que pasara: con «Simulado» puesto, esa sección se
quedaba entera muda. Lo cubre `test/demo-eva/vibraciones-simulada.test.jsx`, que
monta las vistas con `fetch` cortado.

### Por qué «Simulado» se anuncia tan insistentemente

Los valores del transporte falso son plausibles a propósito: el nivel del tanque
sube y baja con el consumo, la presión sigue a la bomba y las temperaturas
derivan despacio. No hay forma de distinguirlo de la instalación mirando la
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
│   ├── layout/               Sidebar, Topbar, cinta de origen
│   └── routes/               Registro ÚNICO de rutas (routes.jsx) + URL
│
├── Demo-EVA/                 TODO lo que sabe de las máquinas de la planta
│   ├── data/                 Transportes, simuladores, historia y hooks
│   ├── domain/               Reexports de @shared/eva/
│   ├── components/           Tiles y primitivas visuales de la sección
│   ├── three-d/              Modelos y comportamiento 3D de la instalación
│   └── views/                Las 14 vistas (rutas), hoy una familia por máquina
│
├── lib/                      Infraestructura compartida, sin dominio
│   ├── iconics/              Motor de polling, transporte real, caos, cliente HTTP
│   ├── datasource/           Qué origen está activo (no los datos)
│   ├── format.js             Formateo consciente de la ausencia de dato
│   └── motion.js             Animación respetuosa con `prefers-reduced-motion`
│
├── features/
│   ├── asistente/            El chat de lenguaje natural
│   ├── three-d/              Toolkit 3D genérico: Escena, Luces, Piso, Baliza…
│   └── data/                 Puntos sueltos — SIN RUTA (ver abajo)
│
├── components/               Átomos de UI reutilizables (ui/, charts/, assets/)
└── theme/                    Colores claro/oscuro + useTheme()
```

**`lib/` no es dueño de ninguna regla de negocio, y no debe serlo.** El catálogo
de señales, los umbrales, el estado derivado y la mecánica del historiador viven
en [`shared/`](../shared/README.md), en la raíz del repositorio, porque el
backend necesita exactamente las mismas reglas para las herramientas del
asistente.

Se importa con el alias `@shared`, el segundo del proyecto y la excepción a la
regla de tener uno solo: apunta fuera de `src/`, que es justo lo que `@` no
puede hacer. Está declarado a la vez en `vite.config.js` y en `jsconfig.json`.

### Qué queda fuera de la superficie

El registro de rutas (`app/routes/routes.jsx`) es el único sitio donde se decide
qué puede abrir un operador en un monitor sin teclado.

**`features/data/` sigue en el árbol pero nadie lo importa**, así que no entra
en ningún bundle. Hacía altas, escrituras y **borrados** de puntos sueltos
contra `db:Northwind`, la base de ejemplo de ICONICS; si vuelve, vuelve detrás
de autenticación y sin la pestaña de borrado.

> **Lo que se fue en agosto de 2026.** Este frontend era el tablero de OEE de
> Resonac, y la demo de agua una sección suya. La transición invirtió los
> papeles y se retiró el tablero entero: `features/dashboard/`,
> `features/machines/`, `features/sankey/`, las dos vistas 3D de máquinas, las
> doce propuestas de `src/prototypes/`, el kit heredado de `src/_deprecated/`,
> el simulador `fakeTransport.js`, la fuente `iconicsSource.js` con sus hooks
> de planta y todo el dominio de máquinas de `shared/`. Lo que sobrevivió es lo
> que nunca supo de máquinas.

### Flujo de datos

```
vistas  ──useSistemaAgua()──►  EvaProvider
                                   │
                              evaSource
                                   │
                              pollingEngine  ── 1 petición por ciclo
                                   │
                    ┌──────────────┴──────────────┐
              transporte real                transporte simulado
                    │                        (Demo-EVA/data/simulador.js)
              backend/server.mjs  ── OIDC + FWX REST
```

**Un solo camino, y la bifurcación abajo del todo.** La fuente y el motor son
los mismos en los dos casos; lo único que cambia es de dónde salen los bytes,
así que el simulador ejercita exactamente el mismo código que el servidor.

`DataSourceProvider` publica **qué transporte** está activo, no una fuente: cada
sección construye la suya. Antes creaba además un motor global para las máquinas
de Resonac, que seguía sondeando el servidor mucho después de que nadie pintara
esos datos.

---

## Cómo está pensado

- **Las vistas no saben de dónde vienen los datos.** Consumen hooks; el origen
  se decide en la raíz. Eso es lo que permite que el interruptor sea un solo
  `if` y no un flag repartido por toda la UI.

- **Un poller, una petición, muchos suscriptores.** Los componentes declaran qué
  puntos necesitan al montar y los liberan al desmontar; el motor agrupa la
  unión en una sola llamada en lote, frente a un intervalo por componente.

- **Un hueco se pinta como hueco, nunca como cero.** Cualquier medida puede
  faltar (mala calidad, punto ausente, división por cero en el servidor). Un
  `0.00` inventado en un tablero de planta se lee como una instalación parada.

- **Un solo lugar para los colores.** Todo componente lee de `useTheme()` y nunca
  escribe un color literal.

- **El vocabulario de estados vive en `@shared/eva/estado.js`**, no duplicado
  entre los tiles, el 3D y el asistente.

- **La ruta actual vive en la URL.** Una recarga vuelve donde estaba y el enlace
  de una vista se puede enviar. Antes era un `useState` y la barra de
  direcciones no cambiaba nunca: en un escritorio no se nota, pero obligaba a ir
  pantalla por pantalla a dejarlas en su vista, y cualquier reinicio las
  devolvía a la primera.

- **Una excepción de render no apaga el tablero.** `ErrorBoundary` envuelve
  cada página y la raíz; una vista rota se queda en su sitio con un panel que
  lo dice, y la barra lateral sigue navegable. En un monitor de planta nadie
  recarga, así que una pantalla en blanco se queda en blanco hasta que alguien
  sube a verla.

- **La pila 3D no se paga al arrancar.** Todas las vistas se registran con
  `lazy()`, y `../scripts/verificar-bundle.mjs` comprueba sobre el `dist` que
  `three` sigue en su propio trozo diferido. Hay que ejecutarlo tras cada build.

- **La pantalla dice qué build corre.** El Topbar muestra el `git describe` del
  build. Es lo primero que hace falta cuando alguien reporta que un número está
  mal: saber si esa pantalla concreta ya tiene el arreglo.

---

## Pruebas

```bash
npm test
```

Lo que cubren y por qué está en [`src/test/README.md`](src/test/README.md).

## Stack

- [React 18](https://react.dev)
- [Vite](https://vitejs.dev) — bundler y servidor de desarrollo
- [Vitest](https://vitest.dev) — pruebas
- [Recharts](https://recharts.org) — gráficas
- [three](https://threejs.org) + [@react-three/fiber](https://r3f.docs.pmnd.rs) + drei — 3D
- [Lucide React](https://lucide.dev) — iconos
