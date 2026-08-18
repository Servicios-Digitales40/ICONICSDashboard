# Plan 10 · Vista SVG · Construida, comparada y retirada

> ⚠️ **DOCUMENTO HISTÓRICO (18-ago-2026).** La «Vista SVG» que este plan
> describe **ya no existe**: se construyó para compararla con la maqueta 3D, se
> comparó, y se decidió quedarse con la maqueta. Sus archivos —la vista, su
> carpeta `svg/`, el asset `assets/skid.svg` y el guion
> `scripts/agrupar-svg-eva.mjs`— se borraron el mismo día.
>
> Este documento se queda porque **la comparación dejó cosas en el código**, y
> sin él no se entiende de dónde salieron. Lo que sobrevive está en §4.

Apareció un dibujo vectorial del equipo real de la demo —el que se enseñó en la
expo de Monterrey, hoy en [`react-dashboard/img/`](../react-dashboard/img/)— y
con él dos posibilidades:

1. Una vista donde el fondo **es** la instalación, no una abstracción de ella.
2. Rehacer la maqueta 3D contra el equipo, en vez de contra coordenadas
   inventadas.

Se hicieron las dos, a propósito, para poder elegir mirándolas.

---

## 1. Lo que había, y por qué el dibujo cambió el argumento

`three-d/lib/layout.js` decía, antes de este plan:

> **Son inventadas** [...] De esta instalación no tenemos ni plano ni pantalla,
> sólo ocho tags. Lo que la disposición reproduce es el RECORRIDO DEL AGUA.

Era lo honesto entonces. El dibujo es el plano que faltaba, y enseña algo que la
maqueta no podía adivinar: **la instalación es un skid de dos niveles del tamaño
de una mesa**, con el depósito debajo de la bandeja y la bomba, el armario y la
columna encima. La maqueta la repartía por el suelo de una nave.

Eso vale con vista SVG o sin ella, y es lo primero que se rehízo.

---

## 2. Qué costaba la vista SVG

El dibujo venía de un trazador: **416 `<path>`, cero `<g>`, cero `id`** que no
fueran de gradiente, cero texto. Para que la pantalla pudiera decir «el tanque
está en crítico» había que saber qué paths eran el tanque, y eso no está en el
archivo.

Lo hacía un guion con seis rectángulos de zona, una regla de tamaño y trece
excepciones por índice. Funcionaba —el reparto se revisaba con un mapa de color
y quedó limpio— pero dejaba dos cargas permanentes:

- **Los índices de las excepciones eran de una exportación concreta.** Cualquier
  reexportación del dibujo obligaba a revisarlos a mano, mirando el mapa.
- **El orden de pintado no se podía tocar.** El dibujo depende de que cada path
  tape a los anteriores, así que no se podía agrupar por activo: había que
  emitir un `<g>` por racha consecutiva, 88 grupos, y colar el líquido del nivel
  detrás de una racha marcada a dedo para que la oclusión saliera bien.

Nada de eso era un fallo. Era el precio de trabajar sobre un calco.

---

## 3. La comparación, con la que se decidió

|  | Maqueta 3D | Vista SVG |
|---|---|---|
| Peso del trozo | 847 KB (`three`) | 211 KB (gzip 53 KB) |
| Arranque | Necesita WebGL | HTML y CSS |
| GPU en reposo | Cero (`frameloop="demand"`) | Cero |
| Se puede orbitar | Sí, tres encuadres | No, perspectiva fija |
| Se reconoce el equipo | Sí, aproximado | Sí, es el equipo |
| **Cambiar la instalación** | **Tres números en `LAYOUT`** | **Hay que volver a dibujar** |
| Añadir un activo | Un modelo y una fila | Reexportar, reclasificar, revisar |

La vista SVG ganaba en peso y en parecido. Perdió en lo que resultó pesar más:
**es configurable sólo por quien pueda editar el dibujo**. La maqueta se ajusta
cambiando números en una tabla, y esta demo va a seguir moviéndose.

---

## 4. Lo que la comparación dejó, y se queda

Casi todo el trabajo fue a parar a la maqueta, y sigue ahí:

- **`BastidorModel.jsx`**, el skid de perfil de aluminio con su bandeja. Sin él
  la maqueta eran cuatro objetos flotando.
- **`LAYOUT` con altura y `SKID` con las cotas**, leídas del dibujo: depósito
  abajo, bomba/armario/columna en la bandeja.
- **`ColumnaModel.jsx`** (era un colector horizontal inventado) y
  **`ValvulaModel.jsx`**, del reparto que impuso la regla de anclaje.
- **`DepositoModel.jsx`**: el bidón, sin estado ni baliza, porque no publica
  nada.
- **`Tuberias.jsx`** traza vertical–horizontal–vertical: la succión sube 2.4 m.
- **Las notas del catálogo se pintan.** `nota` existía en `domain/senales.js`,
  la verificaba una prueba y no la veía nadie; ahora sale en las fichas.
- **La paleta 3D** tiene el azul del depósito y el turquesa del sensor.

### La regla de anclaje, que es lo más valioso que salió de aquí

> **Un activo se ancla donde está el APARATO QUE MIDE sus señales, no donde
> está el recipiente que le da nombre.**

Se aprendió corrigiendo dos veces, y las dos correcciones vinieron de quien
conoce la instalación —el dibujo no lo dice—. Produce dos asignaciones que al
leer las tablas parecen erratas y no lo son:

| Activo | Dónde va su tarjeta | Por qué |
|---|---|---|
| `tanque` | La **columna**, arriba a la derecha | Ahí están el sensor de nivel y el de temperatura |
| `distribucion` | La **válvula** de media tubería | Ahí se miden caudal y presión |
| `bombeo` | La bomba | Carga del motor y modo del variador |
| `electrico` | El armario | Tensión y eficiencia |

El **bidón azul de abajo no es un activo**: no publica ni una señal. Se dibuja
como se dibuja el bastidor —presente, quieto, sin color de estado— y no tiene
tarjeta ni baliza. Ponérsela prometería que informa de algo.

Los dos intentos fallidos, por si el razonamiento vuelve:

1. El nivel se pintaba dentro del bidón. Es un dato medido en un recipiente,
   dibujado dentro de otro.
2. La tarjeta de `distribucion` estaba en la columna y la de `tanque` en el
   bidón. Las dos señalaban al recipiente equivocado.

Consecuencia: el manómetro se fue de `BombaModel` a `ValvulaModel` en la
maqueta (`manometro={false}`). En «Máquina 3D» sigue puesto, porque allí el
sujeto es el grupo de bombeo.

Lo protegen dos pruebas en `tres-d.test.js`: que el depósito no esté en
`LAYOUT`, y que la válvula esté a la altura del tramo que la sostiene —si
alguien mueve la tubería y no la válvula, queda colgada en el aire y es lo único
que lo cazaría.

---

## 5. Si alguna vez se quiere recuperar

Haría falta rehacer el guion de reparto y la vista. El dibujo de origen sigue en
`react-dashboard/img/`, y lo que costaba está en §2. La pregunta que habría que
responder antes es la misma que la retiró: **quién va a mantener el dibujo
cuando cambie la instalación.**
