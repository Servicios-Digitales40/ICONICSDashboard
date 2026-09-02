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

### `eva/` · las máquinas de la planta

Hay **dos instalaciones**, separadas a propósito, y un registro que las declara.
Ver [`docs/PLAN-8-DEMO-EVA.md`](../docs/PLAN-8-DEMO-EVA.md).

| Archivo | Qué contiene |
|---|---|
| `eva/comun/sistemas.js` | **El registro.** Qué máquinas hay, su PLC, sus raíces, y su comportamiento: `puntos()`, `parse()`, `modelo()`, `estado()`, `resumen()`, `series`, `desgaste` |
| `eva/comun/estadoMaquina.js` | **La forma común.** Cómo cuenta cualquier máquina cómo está: señales, grupos, recuento y —lo que más importa— los puntos que NO contestaron |

**El tanque** — `ac:TDCON/DEMO/SENSORES/`, ocho señales planas:

| Archivo | Qué contiene |
|---|---|
| `eva/tanque/senales.js` | Contrato con ICONICS: las 8 señales, sus tags y **cuáles tienen serie propia** |
| `eva/comun/umbrales.js` | Las bandas y su declaración de procedencia (`PROVISIONALES`) |
| `eva/tanque/estado.js` | Los 5 estados DERIVADOS y su agregación |
| `eva/tanque/activos.js` | Los 4 activos, derivados del campo `activo` de las señales |
| `eva/tanque/sistema.js` | `createSistema()`: saneamiento y evaluación en la frontera |
| `eva/comun/historia.js` | Mecánica del historiador de este árbol: `ac:` y no `hda:`, `Average` y no `Interpolative`, y el resumen de una serie |
| `eva/tanque/riesgos.js` | Las 10 reglas de riesgo de esta instalación |
| `eva/tanque/simulador.js` | Su física: `valorEn(clave, ms)` y `valorDePunto(punto, ms)` |
| `eva/comun/pronostico.js` | Sus 5 mecanismos de desgaste acumulado |
| `eva/tanque/estadoTanque.js` | Su proyección a la forma común, y cómo se narra al asistente |

**El sistema de vibraciones** — `ac:TDCON/Motors/01/` más `ae:/DEMO VIBRACIONES`,
73 puntos sobre tres apoyos:

| Archivo | Qué contiene |
|---|---|
| `eva/vibraciones/vibraciones.js` | Catálogo compuesto: canales × medidas, banderas, vigilancias, confianzas, variador y contadores de alarma. Incluye las erratas del servidor, respetadas |
| `eva/vibraciones/riesgosVibracion.js` | Las 18 reglas sobre los tres apoyos, con ISO 10816-1 Clase I |
| `eva/vibraciones/simuladorVibraciones.js` | Su física: `valorVibracionEn(punto, ms)` |
| `eva/vibraciones/sistemaVibraciones.js` | De puntos sueltos a `{ canales, variador, alarmas }` — el recorrido que antes estaba escrito dos veces |
| `eva/vibraciones/estadoVibraciones.js` | Su proyección a la forma común, y su narración (la frase viene hecha: ver su cabecera) |

Los dos catálogos **no se unifican**, y no es pendiente de nadie: son dos formas
de datos, no dos versiones de la misma. Lo que sí se comparte es el PUERTO que
ambos implementan, y eso es lo que declara `comun/sistemas.js`.

Lo que sí se unificó es **cómo se cuentan hacia afuera**. Cada máquina proyecta
su dominio a la forma de `comun/estadoMaquina.js`, y sobre esa forma se escriben una
sola vez el asistente, los informes y —cuando llegue— la predicción de fallos.
El dominio de cada una sigue intacto y viaja en `estado.dominio`, que es lo que
esperan sus motores de reglas.

> **Por qué importaba.** Sin forma común, el catálogo de herramientas del
> asistente tenía OCHO para el tanque y UNA para vibraciones — no porque
> faltaran por escribir, sino porque cada una estaba escrita contra la forma de
> una máquina concreta. Hoy `estado_del_sistema(sistema)` y
> `riesgos_activos(sistema)` sirven a las dos, y el número total de herramientas
> BAJÓ de veinte a diecinueve al ganar capacidad. Eso también es deliberado: con
> veinte descripciones parecidas en el contexto, un modelo local elige peor cuál
> llamar.

Los del tanque vivían en `react-dashboard/src/Demo-EVA/domain/` y subieron aquí
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

## Cómo se añade una máquina

Éste es el objetivo del registro, y la razón de que exista. Antes, dar de alta
una máquina obligaba a tocar doce sitios, y el que más dolía era
`backend/iconics/fakeClient.mjs`: una rama nueva en cinco funciones. El fallo
que eso produce **ya ha ocurrido dos veces** — la máquina nueva no está en las
ramas, cae en la de «punto de escritura» y sale con `value: null` y calidad
BUENA. La pantalla no ve un fallo; ve una máquina que contesta y no dice nada.

Hoy son **seis pasos**, y ninguno toca el transporte ni el asistente:

1. **Su catálogo** — `shared/eva/prensa/prensa.js`. Los tags, con sus irregularidades
   del servidor respetadas, y un `parsePunto` que sea el inverso exacto por
   construcción. Es el único archivo con nombres de tag de esa máquina.
2. **Su física** — `shared/eva/prensa/simuladorPrensa.js`, una función pura
   `(punto, ms) → valor | null | undefined`. Sin `Math.random()`: lo aleatorio
   es del transporte, no de la señal.
3. **Su proyección** — `shared/eva/prensa/estadoPrensa.js`, que la lleva a la forma de
   `comun/estadoMaquina.js` y declara cómo se narra al asistente. Aquí se decide una
   cosa que hay que decidir mirando la máquina y no copiando la de al lado: si
   los campos sueltos bastan (como el tanque) o si la frase tiene que venir
   hecha desde el código (como vibraciones, y está medido por qué).
4. **Sus reglas** — `shared/eva/prensa/riesgosPrensa.js`, si va a tener pantalla de
   riesgos, más su línea en `evaluarRiesgosDe` de `herramientas.mjs`.
5. **Una entrada en `comun/sistemas.js`** que enchufe todo lo anterior, con sus
   `raices`, su `cadenciaMs`, sus `series` y sus `limitaciones`.
6. **Sus vistas y su ruta**, más el hook de lectura — que para el origen
   simulado es una línea: `transporteDe("prensa", clase)`.

Lo que **no** hay que tocar: el transporte falso del backend, el transporte
simulado del frontend, el interruptor de origen, su cinta de aviso, el
remontaje al conmutar, ni las herramientas del asistente — `estado_del_sistema`,
`riesgos_activos` y `pronostico_de_desgaste` sirven a cualquier máquina del
registro, y las de historia se niegan solas citando `series.nota` si la nueva
todavía no tiene series.

> **Lo que el registro te obliga a declarar, y por qué.** `comun/sistemas.js` valida
> al cargarse y **lanza** si falta algo — el proceso no arranca. Entre lo
> obligatorio está `series.nota`: una máquina sin histórico es perfectamente
> válida, pero el silencio no, porque se lee como que sí lo tiene. Es el punto 3
> del alta, puesto en el código.

### Lo que ya está probado del alta

Dos tipos de prueba, y hacen cosas distintas:

**Las que recorren `SISTEMAS` en bucle** cubren la máquina nueva el día que se
añada, sin que nadie se acuerde de ir a escribirlas:
`src/test/demo-eva/sistemas.test.js`, `estado-maquina.test.js` y el bloque
«Todas las máquinas del registro» de `scripts/verificar-transporte-falso.mjs`.
Ninguna nombra una instalación.

**Las que dan de alta una máquina FICTICIA** cubren el momento anterior: qué
pasa mientras la máquina está a medio enchufar.
`scripts/verificar-herramientas.mjs` registra dos —una sin motor de reglas y
otra con histórico declarado— y comprueba lo único que de verdad importa de
ellas: **que no contesten en verde**. Una máquina a medias tiene que fallar de
forma visible, nunca contestar «sin riesgos» de algo que nadie ha mirado.

Esa distinción salió de un fallo real: las pruebas en bucle no podían encontrar
el problema, porque las dos máquinas dadas de alta ya funcionan. Lo que había
que probar era la que todavía no.

> **Un detalle del registro que conviene saber.** `SISTEMA` (el mapa por id) se
> construye con `Object.fromEntries` en el import: es una INSTANTÁNEA de
> `SISTEMAS`. En producción da igual —el registro es estático y las dos
> estructuras nacen a la vez— pero significa que **dar de alta una máquina en
> caliente no está soportado**: hay que declararla en el módulo, no inyectarla
> después.

> **Generalizar el código no es unificar el dato.** El registro hace más fácil
> escribir `SISTEMAS.flatMap(s => s.puntos())` y pedir un solo lote con todas
> las máquinas — y eso es exactamente lo que no debe pasar: dos instalaciones
> con PLC distinto no comparten nada por estar en la misma planta. Un motor de
> sondeo **por sistema**, y la identidad del sistema viajando pegada al punto
> (`parsePuntoDeSistema`). La cabecera de `eva/comun/sistemas.js` lo explica largo.

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
| `backend/` | `import { SENALES } from '../shared/eva/tanque/senales.js'` |
| `react-dashboard/` | `import { SENALES } from '@shared/eva/tanque/senales.js'` |

El alias `@shared` está declarado en `vite.config.js` y en `jsconfig.json`, y hay
que tocarlos a la vez. Es el segundo alias del frontend y la excepción a su regla
de tener uno solo: apunta fuera de `src/`, así que `@` no puede alcanzarlo.

## Al desplegar

`shared/` **tiene que viajar en la release**, junto a `backend/`. Un paquete que
solo lleve `backend/` y `dist/` arrancará y fallará en el primer `import`.
