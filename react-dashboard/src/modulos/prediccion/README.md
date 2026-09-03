# Módulo de Predicción

El segundo módulo de la demo, y **el único que no lee ICONICS**.

## Qué es

Un **compresor real**, con histórico de datos reales, servido por un backend
propio (Django) en **`10.10.17.13:8000`** — su propia máquina, distinta del
servidor de ICONICS, del de IA y del que sirve este tablero.

## Por qué esta carpeta existe

Porque `CLAUDE.md` §2.1 permite una segunda fuente de datos **sólo si el módulo
que la usa está separado y no mezcla su dato con el de planta**. Mientras estos
archivos vivieran dentro de `Demo-EVA/` —la carpeta que el propio CLAUDE.md
define como «todo lo que sabe de las dos máquinas de planta»— esa separación
era una intención, no una estructura.

La regla que hay que tener presente al tocar cualquier cosa de aquí:

> **Nada de este módulo se cruza con nada de planta.** Ni una correlación, ni
> una gráfica con dos ejes, ni una frase del asistente. No comparten
> instalación, ni fuente, ni reloj. Es la misma prohibición que ya separa el
> tanque de vibraciones (`NO_COMPARTEN`), un nivel más arriba.

## Estructura

```
prediccion/
├── data/predictionApi.js        La ÚNICA puerta hacia el backend predictivo
├── components/
│   └── PantallaPendiente.jsx     El placeholder honesto — lee su cabecera
└── views/
    ├── InicioCompresor.jsx        Estado del módulo y sus limitaciones  ← dato real
    ├── EventosCompresor.jsx       Reproducción de un evento             ← dato real
    ├── VariablesCompresor.jsx     pendiente
    ├── HistoricoCompresor.jsx     pendiente
    ├── CorrelacionCompresor.jsx   pendiente
    └── PronosticoCompresor.jsx    pendiente
```

## Qué funciona hoy, y qué no

**Funciona**: la salud del backend, y la reproducción histórica de uno de los
cuatro eventos documentados (`/api/v1/event-history/`).

**No funciona todavía** — y las pantallas lo dicen en vez de disimularlo: el
catálogo de variables, la serie libre de una variable, la correlación y el
pronóstico. Los cuatro dependen de endpoints que **aún no existen**.

Las pantallas pendientes **no dibujan datos de ejemplo**, a propósito. Una
curva plausible en un tablero de planta no se lee como un boceto: se lee como
una medida. Ver la cabecera de `components/PantallaPendiente.jsx`.

## Lo que falta saber

El detalle está en [`docs/PLAN-19-MODULARIZACION.md`](../../../../docs/PLAN-19-MODULARIZACION.md) §9.
Lo más urgente:

1. **El contrato de la API.** Hoy sólo conocemos dos endpoints.
2. **El inventario del histórico**: qué columnas trae exactamente la hoja de
   cálculo que alimenta la API, y con qué unidad cada una.
3. **El error validado del modelo.** Sin esa cifra no hay forma honesta de
   redactar una predicción, y `PronosticoCompresor` no se puede construir.

## Dos deudas conocidas

- **El navegador llama a Django directamente**, saltándose el puente `:3001`.
  En Monitoreo eso no pasa. La alternativa —proxy por el backend— es la F4 del
  plan, bloqueada hasta saber si Django es alcanzable desde el servidor del
  puente y no sólo desde la red del navegador.
- **`MONO`/`SANS` se importan de `Demo-EVA/components/base.jsx`.** Es el único
  hilo que queda hacia Demo-EVA, y es de presentación, no de datos: no cruza
  ninguna fuente. Su sitio natural es `@/theme`; moverlas toca quince archivos
  y va por su cuenta.
