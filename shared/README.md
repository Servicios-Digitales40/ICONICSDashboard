# Dominio compartido

Las reglas de negocio que necesitan **los dos programas** del repositorio:

```
react-dashboard/  ─┐
                   ├─► shared/
backend/           ─┘
```

Nació cuando el asistente de lenguaje natural entró en escena. Hasta entonces
todo esto vivía en `react-dashboard/src/lib/`, que era su sitio mientras el
frontend fuera el único que leía historia. Las herramientas que consulta el
modelo —`backend/ia/`— necesitan exactamente las mismas reglas, y había que
elegir.

**Por qué no se duplicó.** Es la lección que el backend ya había aprendido con
`request()` en `iconics/client.mjs`: *«antes cada operación repetía ese bloque, y
cada copia podía divergir —de hecho divergían»*. Dos copias de la regla de qué
señales tienen historia propia son dos oportunidades de que una se quede atrás,
y el síntoma sería que el chat y el tablero dan cifras distintas del mismo día.

**Por qué no se importa desde `react-dashboard/src`.** El empaquetado de la
release copia `backend/` y `react-dashboard/dist`, no el árbol de fuentes del
frontend. Un backend que importara de ahí funcionaría en desarrollo y fallaría al
desplegar.

## Qué hay

| Archivo | Qué contiene |
|---|---|
| `valores.js` | Saneamiento en la frontera: `toNumber`, `toText`, `hasValue`. Un `NaN` o un `Infinity` del servidor se convierten en hueco, nunca en cero |
| `quality.js` | Qué código de calidad OPC cuenta como bueno. Un valor malo es un hueco, nunca un cero |
| `periodo.js` | De «julio 2026» o «ayer a las 12» a un rango concreto. Lo usa el asistente |

### `eva/` · el sistema de agua industrial

El dominio de la instalación: `ac:TDCON/DEMO/SENSORES/`, ocho señales planas.
Ver [`docs/PLAN-8-DEMO-EVA.md`](../docs/PLAN-8-DEMO-EVA.md).

| Archivo | Qué contiene |
|---|---|
| `eva/senales.js` | Contrato con ICONICS: las 8 señales, sus tags y **cuáles tienen serie propia** |
| `eva/umbrales.js` | Las bandas y su declaración de procedencia (`PROVISIONALES`) |
| `eva/estado.js` | Los 5 estados DERIVADOS y su agregación |
| `eva/activos.js` | Los 4 activos, derivados del campo `activo` de las señales |
| `eva/sistema.js` | `createSistema()`: saneamiento y evaluación en la frontera |
| `eva/historia.js` | Mecánica del historiador de este árbol: `ac:` y no `hda:`, `Average` y no `Interpolative`, y el resumen de una serie |

Estos seis vivían en `react-dashboard/src/Demo-EVA/domain/` y subieron aquí
cuando el asistente pasó a responder sobre esta instalación. Es literalmente el
caso que abre este documento: las herramientas de `backend/ia/` necesitan
exactamente las mismas reglas que las vistas, y había que elegir entre duplicar
o compartir.

Y aquí duplicar sale especialmente caro. **A tres de las ocho señales el
historiador les devuelve la serie de otra, y responde `ok: true`.** La única
defensa es el campo `historizado` del catálogo; dos copias del catálogo son dos
oportunidades de que una se quede atrás, y el síntoma no sería una cifra
distinta entre el chat y el tablero —sería el chat contando la temperatura del
tanque bajo el nombre «carga del motor», con marcas de tiempo correctas y sin
un solo error en el log.

En `Demo-EVA/domain/` quedan cinco reexports de una línea, para que el módulo
conserve su regla de importar siempre como `@/Demo-EVA/…`.

> **Qué había aquí antes.** Hasta agosto de 2026 este directorio llevaba además
> el dominio del tablero de OEE de Resonac: `tagCatalog.js` (las 10 máquinas y
> sus 15 propiedades), `plantModel.js`, `historia.js`, `turno.js` y
> `domain/{machine,estado,history}.js`. Se fue entero con la transición al
> modelo de agua. Lo único que se conservó de ese bloque es el saneamiento de
> valores, que no sabía de máquinas y hoy es `valores.js`.

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
| `backend/` | `import { SENALES } from '../shared/eva/senales.js'` |
| `react-dashboard/` | `import { SENALES } from '@shared/eva/senales.js'` |

El alias `@shared` está declarado en `vite.config.js` y en `jsconfig.json`, y hay
que tocarlos a la vez. Es el segundo alias del frontend y la excepción a su regla
de tener uno solo: apunta fuera de `src/`, así que `@` no puede alcanzarlo.

## Al desplegar

`shared/` **tiene que viajar en la release**, junto a `backend/`. Un paquete que
solo lleve `backend/` y `dist/` arrancará y fallará en el primer `import`.
