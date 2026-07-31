# `prototypes/` — propuestas de diseño en evaluación

Esto **es código vivo**: se compila, entra en el bundle y es navegable desde el sidebar. No confundir con `src/_deprecated/`, que está desconectado. La diferencia de nombre es deliberada — sin guion bajo porque no es un archivo muerto, sino trabajo en curso.

Lo que hay aquí son **propuestas compitiendo entre sí**. Cuando se elija una ganadora en cada evaluación, se promueve al kit definitivo y esta carpeta desaparece entera.

---

## El invariante que hace esto desechable

> **`src/prototypes/` es una hoja del grafo de imports.**
> Puede importar de donde sea (`@/features/…`, `@/components/…`, `@/theme`).
> **Nadie importa de aquí**, salvo el registro de rutas.

Comprobable:

```bash
grep -rn "@/prototypes" src --exclude-dir=prototypes
# debe devolver solo el registro de rutas
```

Esto no era así antes: `pages/MachineDetail.jsx` importaba `getVariant` del registro de propuestas, así que **producción dependía del prototipo** y borrar esta carpeta rompía una vista real.

Se invirtió la dirección. Ahora `area-views/AreaVariantView.jsx` **empuja** la variante ya resuelta en los params de navegación:

```jsx
onNavigate("machine-detail", { machineId: e.id, from: pageId, cardVariant: { label, Comp, wide } })
```

y `MachineDetail` solo lee `params.cardVariant ?? null`, cayendo a `GaugeCard` cuando no hay nada. Por eso hoy borrar esta carpeta **no requiere tocar una sola línea de producción**.

---

## Las tres evaluaciones abiertas

### 1. Tarjeta de máquina — `machine-cards/`

Cinco maneras de representar el estado de OEE de un equipo:

| Clave | Archivo | Formato |
|---|---|---|
| `editorial` | `MachineCardEditorial.jsx` | compacto |
| `aurora` | `MachineCardAurora.jsx` | ancho |
| `aurora-v` | `MachineCardAuroraVertical.jsx` | compacto |
| `neon` | `MachineCardNeonHUD.jsx` | ancho |
| `neon-v` | `MachineCardNeonHUDVertical.jsx` | compacto |

Módulos de apoyo: `variants.js` (el registro), `cardShared.js` (semántica estado→color/icono, `useCountUp`) y `neonSkin.js` (el acabado visual que comparten las dos Neon).

Se ven de dos formas: en `area-views/` (cada una sola, en su contexto real de uso) y en `SandboxPage.jsx` (todas juntas, para compararlas).

### 2. Disposición del comparativo — `comparativo/`

Tres maneras de organizar la vista comparativa: `LayoutEspejo.jsx`, `LayoutBalanza.jsx`, `LayoutEditorial.jsx`, más `variants.js` (registro) y `scenarios.js` (generador de escenarios, JS puro y ejecutable en node).

Las tres consumen los átomos **reales** de la vista de producción (`comparativoUi.jsx`) en vez de duplicarlos, para que no puedan desincronizarse de lo que se está construyendo. Esa es una dependencia prototipo → producción, que es la dirección permitida.

### 3. Dashboard de planta — `dashboard-v2/`

Rediseño visual del dashboard de planta, para comparar contra el de producción. Ruta `dashboard-v2`, en el sidebar como **«Planta · v2»**, justo detrás de «Planta» para poder saltar de una a otra.

| Archivo | Qué contiene |
|---|---|
| `DashboardV2.jsx` | La vista: rejilla de 12 columnas por bandas y el orden de lectura |
| `tiles.jsx` | Las piezas, cada una anotada con la mejora que demuestra (M1…M10) |
| `model.js` | Las cuatro derivaciones nuevas (atención, áreas con máquinas, Pareto, scrap por área) |
| `palette.js` | Paleta de estado corregida, con el informe del validador en la cabecera |

Es **una sola propuesta**, no un juego de variantes: no compite contra otras cinco, compite contra la vista de producción.

`model.js` importa `buildPlantSummary`, `plantTrend` y `productionTrend` del modelo REAL (`@/features/dashboard/lib/plantModel.js`) en vez de reimplementarlos. Es deliberado: si las dos vistas se comparan, tienen que estar contando exactamente lo mismo y la única variable debe ser el diseño. Misma dirección permitida que el comparativo.

Dos hallazgos de esta evaluación aplican a **producción**, no solo al prototipo, y siguen sin corregirse allí:

- `ESTADO_TOKEN` (`@/lib/machines.js`) pone «Limpieza» y «Mant. Preventivo» a ΔE 0.9 bajo protanopía —indistinguibles— y usa `textSoft`, un token de TEXTO, como color de dato para «Receso».
- En `dashboardTiles.jsx`, `RechazosPie` cicla una paleta de 5 colores sobre 9 rebanadas (`paleta[i % 5]`) y asigna color por rango, no por entidad.

Ver la cabecera de `palette.js` para las cifras y el reemplazo validado.

---

## Cómo borrar esto cuando se cierre el rediseño

1. Promover la propuesta ganadora al kit definitivo (copiar el componente a donde corresponda y ajustar sus imports).
2. Borrar la carpeta `src/prototypes/` entera.
3. Quitar del registro de rutas las **13 entradas** de prototipo: `sandbox`, `dashboard-v2`, `area1-editorial`, `area1-aurora`, `area1-aurora-v`, `area1-neon`, `area1-neon-v`, y las cinco equivalentes de `area2`.
4. Borrar la clave `sandbox` de `MACHINES` en el módulo de datos de máquinas (lleva un `TODO(prototypes)` apuntando aquí). Es la máquina de muestra que consume `SandboxPage.jsx`, y duplica el id `a1-1` de `area1`.
5. **No hay paso 5.** `MachineDetail` no necesita ningún cambio: `params.cardVariant` pasa a ser siempre `undefined` y todo cae a `GaugeCard`.

Antes de empezar, conviene comprobar que el invariante de arriba sigue vigente.
