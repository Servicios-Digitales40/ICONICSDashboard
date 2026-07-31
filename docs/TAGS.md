# Catálogo de tags · Excel → punto ICONICS → campo de dominio

Tabla de referencia entre el export de configuración
`IcoUnifiedConfigSetIco_Assets_2026-07-28` y el modelo de datos del frontend.

La implementación vive en [`src/lib/iconics/tagCatalog.js`](../react-dashboard/src/lib/iconics/tagCatalog.js),
que es la **fuente única**: si el servidor cambia, se edita ese archivo y ningún otro.

> **Para comprobar que esta tabla coincide con el servidor real:**
> ```bash
> node backend/server.mjs               # backend puente
> node scripts/verificar-catalogo.mjs   # lee los 147 puntos y reporta
> ```
> Reejecutable en cualquier momento, no es un paso de puesta en marcha.

---

## Las 10 máquinas

| id de dominio | Ruta en ICONICS | Nombre visible | Clase de AssetWorX |
|---|---|---|---|
| `LIN/1` … `LIN/7` | `RESONAC\LIN\1` … `\7` | Lineal 1 … 7 | `[Resonac]\[Lineales]\Lineal` |
| `REC/10` | `RESONAC\REC\10` | Multi 10 | `[Resonac]\[Rectificadora 10]\Rectificadora` |
| `REC/11` | `RESONAC\REC\11` | Multi 11 | `[Resonac]\[Rectificadoras]\Rectificadora` |
| `REC/13` | `RESONAC\REC\13` | Multi 13 | `[Resonac]\[Rectificadoras]\Rectificadora` |

> No existen la REC 12 ni las REC 1–9. La numeración tiene huecos reales.

### Ramas del árbol que hay que ignorar

| Rama | Por qué |
|---|---|
| `EquipmentRoot\RESONAC_` | Árbol paralelo de navegación de pantallas. Duplica los nombres, nodos vacíos. |
| `EquipmentRoot\RESONAC\LIN_T\1..3` | Pruebas heredadas, propiedades sin fuente. |
| `EquipmentRoot\RESONAC\LIN\1\Test1` | Experimento de turnos día/noche, solo en la Lineal 1. |

---

## Prefijos de direccionamiento

| Prefijo | Forma | Uso |
|---|---|---|
| `ac:` | `ac:RESONAC/LIN/1/OEE` | **Tiempo real. Es el que usa el frontend.** |
| `hda:` | `hda:\Configuration\RESONAC\LIN\1:OEE` | Histórico (Hyper Historian), para tendencias. |
| `ae:` | `ae:/!ac/RESONAC/LIN/1.Stop@ActiveTime` | Alarmas y eventos. |
| `mel:` | `mel:R04_1:PLC_01_PL/Piezas_Ok` | Tag crudo del PLC Mitsubishi. **No consumir directo**: ICONICS ya lo escala. |
| `db:` | `db:Proceso_Data.Filtered_Receta_PLC<…>` | Base de datos SQL externa vía GridWorX. |

---

## Propiedades

| Campo de dominio | Propiedad en ICONICS | Unidad | Cadencia | Notas |
|---|---|---|---|---|
| `oee` | `OEE` | % | resumen | `= (Cal/100)×(Disp/100)×(Rend/100)×100` |
| `disponibilidad` | `OEE_Disp` | % | resumen | `= ((T_Disp_pot − T_Inac_plan − T_Muerto_Ico) / (T_Disp_pot − T_Inac_plan)) × 100` |
| `rendimiento` | `OEE_Rend` | % | resumen | LIN: `T_Ciclo_Teo/T_Ciclo_Calc` · REC: `T_Ciclo_Teo/T_Ciclo` |
| `calidad` | `OEE_Cal` | % | resumen | `= (Pz_OK / Prod_Real_Total) × 100`, acotado a 100 por arriba |
| `aprobadas` | `Pz_OK` | piezas | resumen | |
| `rechazadas` | `Pz_NOK` | piezas | resumen | |
| `producidas` | `Prod_Real_Total` | piezas | resumen | |
| `estado` | `Estado` | entero 0–4 | resumen | Ver enum abajo |
| `tMuerto` | `T_Muerto_Ico` | segundos | resumen | Tiempo muerto calculado por el SCADA |
| `modelo` | `Modelo` | texto | estático | Receta cargada en el PLC, no un SKU |
| `tCiclo` | `T_Ciclo` | segundos | detalle | |
| `tCicloCalc` | `T_Ciclo_Calc` | segundos | detalle | **Solo en LIN** |
| `tCicloTeo` | `T_Ciclo_Teo` | segundos | detalle | Viene de SQL (`Filtered_Receta_PLC`) |
| `tDispPot` | `T_Disp_pot` | segundos | estático | Constante: 86400 (24 h) |
| `tInacPlan` | `T_Inac_plan` | segundos | estático | Viene de SQL (`Filtered_Total_PlannedDowtime`) |

### Cadencias

| Nivel | Intervalo | Qué incluye |
|---|---|---|
| resumen | 15 s | Vista de planta y de área, las 10 máquinas |
| detalle | 5 s | Solo la máquina abierta, todas sus propiedades |
| estático | 5 min | `Modelo`, `T_Disp_pot`, `T_Inac_plan` |

---

## Enum de estados

Tomado de la expresión de la propiedad `Estado` en el Excel.

| Código | Clave de dominio | Etiqueta | Color |
|---|---|---|---|
| 0 | `standby` | Stand By | gris |
| 1 | `running` | Operando | verde |
| 2 | `setup` | Set-Up | azul |
| 3 | `commfail` | Sin comunicación | ámbar |
| 4 | `alarma` | Alarma | rojo |
| — | `unknown` | Sin dato | tenue |

`unknown` no lo emite el servidor: es la ausencia de lectura (mala calidad o
aún sin leer). Ver [`src/lib/domain/estado.js`](../react-dashboard/src/lib/domain/estado.js).

---

## Calidad

ICONICS acompaña cada valor con un código de calidad OPC. **192 (0xC0) es "good"** —
lo confirma la propia configuración, que detecta fallo de comunicación con
`quality({{…}}) != 192`.

Un valor con calidad ≠ 192 se convierte en `null` en la frontera y se pinta como
hueco, **nunca como 0**: un cero de mala calidad entrando en los agregados hunde
el OEE de toda la planta sin que nadie lo note.

---

## Huecos conocidos en la configuración del servidor

Detectados en el Excel. Afectan al frontend aunque no sean suyos.

| Hallazgo | Consecuencia |
|---|---|
| Servidor sin licencia (Tier `Demo`) | Se apaga cada 2 h; al caducar, toda lectura falla hasta reiniciar servicios. |
| Solo `LIN/1` tiene tags coleccionados en el historiador | Las otras 9 máquinas no tienen historia todavía. |
| `Prod_Teo` y `Operador` sin fuente de datos | Llegarán vacíos. Modelados como opcionales. |
| `OEE_Today` / `OEE_Yday` sin expresión ni punto | No se construye UI que dependa de ellos. |
| `T_Ciclo_Teo` y `T_Inac_plan` vienen de SQL externo | Si esa base no está poblada, D y R fallan aunque el PLC esté bien. |
| Rectificadoras sin `T_Ciclo_Calc` | Rendimiento no estrictamente comparable entre familias. |
| `OEE_Cal` de instancia sin acotar por abajo | `Infinity`/`NaN` con `Prod_Real_Total` = 0. Saneado en el dominio. |

---

## Lectura del histórico (`hda:`)

El comparativo del detalle de máquina lee del historiador, no del valor en vivo.
Una petición por tag y día, 24 puntos cada una:

```
GET /api/iconics/history
    ?pointName=hda:\Configuration\RESONAC\LIN\1:OEE
    &startDate=2026-07-30T00:00:00-06:00
    &endDate=2026-07-31T00:00:00-06:00
    &aggregate=Interpolative
    &interval=01:00:00
```

Las cinco decisiones de esa llamada, todas medidas contra el servidor real:

**1 · `Interpolative`, nunca `Average`.** `Average` funciona en cinco tags y
falla siempre, con 500, en `OEE` y `OEE_Cal` — los dos que pueden traer
`Infinity`, porque el servidor calcula `OEE_Cal = Pz_OK / Prod_Real_Total` sin
proteger la división y `OEE` lo multiplica. Promediar un bucket con un infinito
dentro revienta el cálculo del historiador. `Interpolative` no suma: toma el
valor interpolado en el instante. Verificado en los 7 tags.

**2 · Un día por petición.** Los rangos de varios días fallan de forma
intermitente con «Invalid Point Name», aunque el punto acabe de funcionar para
un solo día. El calendario, que necesita muchos días, hace una petición por día
de tres en tres.

**3 · Fechas con desplazamiento horario explícito** (`…T00:00:00-06:00`). En UTC
la frontera del día se corre seis horas y devolvería las últimas horas del día
anterior.

**4 · Los contadores se SUMAN por tramos, no se leen del final.** `Pz_OK`,
`Pz_NOK` y `T_Muerto_Ico` se reinician con el turno: el 28-jul suben de 727 a
1551 hasta las 06:00 y a las 07:00 arrancan de nuevo en 48. El último valor
(594) son las piezas del último turno, no las del día; el total se obtiene
sumando los saltos positivos y el arranque de cada tramo.

**5 · El día en curso se recorta en la hora actual.** `Interpolative` rellena
todos los buckets del rango repitiendo el último valor conocido, así que en un
día que aún no ha terminado dibujaría una recta desde ahora hasta las 23:00. En
un día pasado la meseta final sí es información y se conserva.

Otros dos límites del servidor, por si aparecen:

- **100 muestras por petición** (`"Maximum allowed number of samples in a single
  request is 100"`). Con agregado horario sobran (24), pero una lectura cruda de
  un día son ~7.000 muestras y exige paginar con `X-ICO-CONTINUATION`. El tope
  se sube en `OData.MaxTop`, en
  `C:\Program Files\ICONICS\GENESIS64\Services\WebAPI\appsettings.json`.
- **Cada tag necesita su casilla «Is Collected»** en la configuración del Data
  Historian, con el `Signal Name` apuntando a `ac:RESONAC/<área>/<máquina>/<propiedad>`.
  Un tag sin coleccionar responde 500 a `/History`, exactamente igual que un tag
  que no existe.

### Estado (2026-07-30): funciona en LIN/1, falta coleccionar el resto

Verificado en `user1690-pc`: los 7 tags de `LIN/1` devuelven 24 puntos por día.
Las otras 9 máquinas siguen sin coleccionar y responden 500 hasta que se les
marque «Is Collected».

Comprobación, reejecutable:

```
node backend/server.mjs                 # en una terminal
node scripts/verificar-historia.mjs     # en otra   (TODAS=1 para las 10 máquinas)
```

El script distingue los fallos que en pantalla se ven igual: backend caído,
lectura histórica rota de raíz (falla incluso un punto inventado) y tag sin
coleccionar. Cuando un tag no responde, el motivo exacto lo escribe el servidor
en `C:\ProgramData\ICONICS\11\Logs\IcoWebAPIService.log.xml`, buscando
«HistoryController: Historical read failed».

**Sobre el modo Demo.** El servidor corre sin licencia (`$info:Overview.Tier` =
`Demo`), lo que le da ventanas de 2 horas: al cumplirse, todo deja de responder
hasta reiniciar los servicios GENESIS. Durante la investigación esa caducidad se
confundió con una función deshabilitada —el log llegó a decir «Bad - Feature
Disabled» para cualquier punto—, pero con la ventana viva la lectura histórica
**sí funciona en Demo**. Instalar la licencia evita los cortes cada 2 h; no es
requisito para leer historia.

Mientras un día o un tag no tengan historia, el comparativo lo dice con
palabras y **no rellena con datos simulados**: una comparación creíble y falsa
es peor que un hueco.
