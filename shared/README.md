# Dominio compartido

Las reglas de negocio que necesitan **los dos programas** del repositorio:

```
react-dashboard/  ─┐
                   ├─► shared/
backend/           ─┘
```

Nació con el [Plan 6](../docs/PLAN-6-IA-LOCAL.md). Hasta entonces todo esto vivía
en `react-dashboard/src/lib/`, que era su sitio mientras el frontend fuera el
único que leía historia. Las herramientas que consulta el modelo de lenguaje
—`backend/ia/`— necesitan exactamente las mismas reglas, y había que elegir.

**Por qué no se duplicó.** Es la lección que el backend ya había aprendido con
`request()` en `iconics/client.mjs`: *«antes cada operación repetía ese bloque, y
cada copia podía divergir —de hecho divergían»*. Dos copias de la regla de que
los contadores se suman por tramos son dos oportunidades de que una se quede
atrás, y el síntoma sería que el chat y el tablero dan cifras distintas del mismo
día.

**Por qué no se importa desde `react-dashboard/src`.** El empaquetado de la
release copia `backend/` y `react-dashboard/dist`, no el árbol de fuentes del
frontend. Un backend que importara de ahí funcionaría en desarrollo y fallaría al
desplegar.

## Qué hay

| Archivo | Qué contiene |
|---|---|
| `tagCatalog.js` | Contrato con ICONICS: las 10 máquinas, las 15 propiedades y cómo se nombra un punto en vivo (`ac:`) o histórico (`hda:`) |
| `historia.js` | Mecánica del historiador: qué agregado, cómo se formatean las fechas, cómo se totaliza un contador y cómo se unen varias series |
| `quality.js` | Qué código de calidad OPC cuenta como bueno. Un valor malo es un hueco, nunca un cero |
| `turno.js` | Aritmética del turno y metas por factor. El **formateo** se queda en el frontend |
| `periodo.js` | De «julio 2026» o «ayer a las 12» a un rango concreto. Lo usa el asistente |
| `plantModel.js` | Rollup de máquina → planta. El OEE de planta es D×R×C de los agregados, no la media de los OEE |
| `domain/machine.js` | La forma `Machine` y su saneamiento de calidad y aritmética |
| `domain/estado.js` | El enum de estados de ICONICS |
| `domain/history.js` | `daySummary()`: reduce un día del historiador a la forma de una `Machine` |

### `eva/` · el sistema de agua industrial

Lo de arriba describe la planta de Resonac. `eva/` es la otra instalación del
mismo servidor —`ac:TDCON/DEMO/SENSORES/`, ocho señales planas sin OEE, sin
máquinas y sin producción— y **no comparte ni un archivo con ella**: no es el
mismo dominio con otros nombres, es otra forma de datos. Ver
[`docs/PLAN-8-DEMO-EVA.md`](../docs/PLAN-8-DEMO-EVA.md).

| Archivo | Qué contiene |
|---|---|
| `eva/senales.js` | Contrato con ICONICS: las 8 señales, sus tags y **cuáles tienen serie propia** |
| `eva/umbrales.js` | Las bandas y su declaración de procedencia (`PROVISIONALES`) |
| `eva/estado.js` | Los 5 estados DERIVADOS y su agregación. Vocabulario distinto del de Resonac a propósito |
| `eva/activos.js` | Los 4 activos, derivados del campo `activo` de las señales |
| `eva/sistema.js` | `createSistema()`: saneamiento y evaluación en la frontera |
| `eva/historia.js` | Mecánica del historiador de este árbol: `ac:` y no `hda:`, `Average` y no `Interpolative`, y el resumen de una serie |

Estos seis vivían en `react-dashboard/src/Demo-EVA/domain/` y subieron aquí
cuando el asistente pasó a responder sobre esta instalación. Es literalmente el
caso que abre este documento: las herramientas de `backend/ia/` necesitan
exactamente las mismas reglas que las vistas, y había que elegir entre duplicar
o compartir.

Aquí duplicar habría sido peor que en Resonac. **A tres de las ocho señales el
historiador les devuelve la serie de otra, y responde `ok: true`.** La única
defensa es el campo `historizado` del catálogo; dos copias del catálogo son dos
oportunidades de que una se quede atrás, y el síntoma no sería una cifra
distinta entre el chat y el tablero —sería el chat contando la temperatura del
tanque bajo el nombre «carga del motor», con marcas de tiempo correctas y sin
un solo error en el log.

En `Demo-EVA/domain/` quedan cinco reexports de una línea, para que el módulo
conserve su regla de importar siempre como `@/Demo-EVA/…`. Es lo mismo que hace
`react-dashboard/src/lib/domain/index.js` con el dominio de Resonac.

## Reglas

**JavaScript puro.** Ni `fetch`, ni `import.meta.env`, ni DOM, ni React, ni
dependencias de npm. Cualquiera de esas cosas rompe uno de los dos consumidores,
y la que rompe al backend no se nota hasta desplegar.

**El `package.json` es solo `"type": "module"`.** No declara dependencias y no se
instala. Está para que Node trate estos archivos como ESM sin depender de su
detección de sintaxis por respaldo, que funciona pero avisa por consola en cada
arranque.

## Cómo se importa

| Desde | Forma |
|---|---|
| `backend/` | `import { listMachines } from '../shared/tagCatalog.js'` |
| `react-dashboard/` | `import { listMachines } from '@shared/tagCatalog.js'` |

El alias `@shared` está declarado en `vite.config.js` y en `jsconfig.json`, y hay
que tocarlos a la vez. Es el segundo alias del frontend y la excepción a su regla
de tener uno solo: apunta fuera de `src/`, así que `@` no puede alcanzarlo.

## Al desplegar

`shared/` **tiene que viajar en la release**, junto a `backend/`. Un paquete que
solo lleve `backend/` y `dist/` arrancará y fallará en el primer `import`.
