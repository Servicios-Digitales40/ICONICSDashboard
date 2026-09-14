/**
 * Escritura de archivos que no se puede quedar a medias, y el candado que
 * serializa las secuencias leer-modificar-escribir.
 *
 * ── EL FALLO QUE ESTO EVITA, Y NO ES TEÓRICO ───────────────────────
 *
 * `writeFile(ruta, JSON.stringify(x))` **trunca el archivo antes de escribir**.
 * Entre ese truncado y el último byte hay una ventana en la que el archivo
 * existe y está incompleto, y cualquier cosa que corte el proceso ahí —un
 * corte de luz en la planta, un reinicio del servicio, un `docker stop` que
 * agota su plazo— lo deja como un JSON roto.
 *
 * Los tres almacenes de este backend estaban así, y los tres son cosas que
 * cuesta recuperar:
 *
 *   · `datos/aprendizaje.json` — los hechos que una PERSONA confirmó sobre
 *     esta instalación y las intervenciones registradas. No se regeneran: son
 *     días de averiguar cosas que el servidor no publica.
 *   · `backend/datos/embeddings-cache-*.json` — se regenera, pero cuesta una
 *     reindexación entera contra el servidor de embeddings.
 *   · el manifiesto de manuales — qué archivo es qué manual y de qué máquina.
 *     Perderlo deja los PDF en disco sin saber a quién pertenecen.
 *
 * El arreglo es viejo y conocido: escribir en un archivo temporal y `rename()`
 * encima. En el mismo volumen, `rename` es atómico — o está el contenido viejo
 * entero o el nuevo entero, nunca la mitad de uno.
 *
 * ── Y EL SEGUNDO FALLO, QUE ES MÁS SUTIL ───────────────────────────
 *
 * `recordar_hecho` lee el almacén, le añade un hecho y lo escribe. Dos
 * llamadas a la vez —dos pantallas, o el asistente y el cierre de diagnóstico—
 * leen las dos el MISMO estado de partida, y la segunda escritura pisa la
 * primera. No hay error: el hecho simplemente no está, y quien lo dictó vio
 * «guardado» en la pantalla.
 *
 * `conCandado()` serializa por ruta. Es el mismo patrón que
 * `pendingAuthentication` en `iconics/authenticator.mjs` —una promesa
 * compartida que hace esperar al que llega— y por la misma razón: hay un
 * recurso que no admite dos usuarios a la vez.
 *
 * ── LO QUE ESTO NO ES ──────────────────────────────────────────────
 *
 * No es una base de datos, y no la sustituye (`CLAUDE.md` §2.2: aquí no hay
 * ninguna, y es una decisión). El candado es POR PROCESO: dos servidores
 * apuntando al mismo `datos/` seguirían pisándose. Ese escenario no existe hoy
 * —un puente por instalación— y el día que exista, la respuesta no es un
 * candado más listo, es dejar de guardar el estado compartido en un JSON.
 *
 * Y tampoco es infalible en Windows, que es donde corre el puente en planta:
 * `rename` falla mientras alguien tenga abierto el archivo de destino. Se
 * reintenta —ver `renombrarConReintento`— y eso cubre los lectores de este
 * backend, que abren y cierran en microsegundos. Lo que NO cubre es que
 * alguien deje el JSON abierto en un editor o un antivirus lo esté
 * escaneando: entonces la escritura FALLA, con su código de error. Falla
 * ruidosamente y no corrompe nada, que es el intercambio que se quiere.
 */
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * Escrituras en curso, por ruta.
 *
 * Se guarda la PROMESA de la última operación encolada: quien llega se engancha
 * al final de esa cadena. Cuando la cadena termina, la entrada se borra para
 * que el mapa no crezca con una entrada por archivo tocado en toda la vida del
 * proceso.
 *
 * @type {Map<string, Promise<unknown>>}
 */
const enCurso = new Map()

/**
 * Serializa las operaciones que tocan la MISMA ruta.
 *
 * Dos rutas distintas no se estorban: el candado es por archivo, no global.
 * Una tarea que lanza no rompe la cadena — la siguiente corre igual, y el
 * error se propaga sólo a quien lo pidió.
 *
 * @template T
 * @param {string} ruta   el archivo que la tarea va a leer y escribir
 * @param {() => Promise<T>} tarea
 * @returns {Promise<T>}
 */
export function conCandado(ruta, tarea) {
  const anterior = enCurso.get(ruta) ?? Promise.resolve()

  // `.then(tarea, tarea)` y no `.then(tarea)`: si la anterior falló, la
  // siguiente TIENE que correr igual. Encadenar sólo el camino feliz dejaría
  // la cola entera colgada del primer error.
  const mia = anterior.then(tarea, tarea)

  /*
   * Lo que se guarda en el mapa es una versión que NO puede rechazar. Si se
   * guardara `mia` tal cual, el siguiente en llegar heredaría su fallo por el
   * mero hecho de encadenarse detrás, y además quedaría un rechazo sin
   * atender que Node registra como `unhandledRejection`. El error sí llega a
   * quien lo pidió: `mia` es lo que se devuelve.
   */
  const encolada = mia.catch(() => {})
  enCurso.set(ruta, encolada)

  encolada.then(() => {
    // Sólo la borra quien la puso: si mientras tanto llegó otra, la entrada ya
    // no es la mía y borrarla soltaría el candado con alguien dentro.
    if (enCurso.get(ruta) === encolada) enCurso.delete(ruta)
  })

  return mia
}

/**
 * Escribe un archivo entero, o no lo escribe.
 *
 * El temporal es hermano del destino —y no del directorio temporal del
 * sistema— porque `rename()` sólo es atómico dentro del mismo sistema de
 * archivos. Un `/tmp` que resulte estar en otro volumen convertiría el
 * `rename` en copiar y borrar, que es justo lo que se venía a evitar.
 *
 * El nombre lleva el PID y un contador para que dos procesos que escriban el
 * mismo archivo a la vez no se lleven por delante el temporal del otro. No es
 * el caso hoy (ver la cabecera) pero el coste de evitarlo es un sufijo.
 *
 * @param {string} ruta
 * @param {string|Buffer|Uint8Array} contenido
 */
let contador = 0

/**
 * Cuántas veces se reintenta el `rename`, y cuánto se espera entre intentos.
 *
 * ── ESTO ES UNA CONCESIÓN A WINDOWS, Y HACE FALTA ──────────────────
 *
 * En POSIX, `rename` sobre un archivo que otro proceso tiene abierto funciona:
 * el que lee se queda con el inodo viejo y sigue leyéndolo entero. En Windows
 * no — falla con `EPERM` o `EBUSY` mientras haya un handle abierto sobre el
 * destino, aunque sea de sólo lectura.
 *
 * No es teórico y salió en la primera prueba: un lector en bucle sobre
 * `aprendizaje.json` hace fallar la escritura de golpe. Y el servidor de
 * planta corre en Windows, con varias pantallas pidiendo a la vez.
 *
 * Los handles de lectura de este backend duran microsegundos (un `readFile` y
 * ya), así que unos pocos reintentos con espera creciente cubren de sobra la
 * colisión sin esconder un fallo real: si el archivo está bloqueado de verdad
 * —otro programa lo tiene abierto, un antivirus lo está escaneando— los cinco
 * intentos fallan y el error sale tal cual, con su código.
 *
 * Cinco y no tres: con tres (60 ms de margen total) la prueba del lector
 * concurrente falla de vez en cuando cuando la máquina va cargada, y un
 * margen que depende de lo ocupada que esté la máquina no es un margen. Con
 * la escala creciente son 300 ms, que sigue siendo imperceptible para quien
 * guarda un hecho y sobra para un `readFile` que pasaba por ahí.
 */
const REINTENTOS_RENAME = 5
const ESPERA_RENAME_MS = 20

const BLOQUEADO = new Set(['EPERM', 'EBUSY', 'EACCES'])

const esperar = ms => new Promise(r => setTimeout(r, ms))

async function renombrarConReintento(temporal, ruta) {
  for (let intento = 1; ; intento++) {
    try {
      await rename(temporal, ruta)
      return
    } catch (error) {
      if (!BLOQUEADO.has(error?.code) || intento >= REINTENTOS_RENAME) throw error
      await esperar(ESPERA_RENAME_MS * intento)
    }
  }
}

export async function escribirAtomico(ruta, contenido) {
  await mkdir(dirname(ruta), { recursive: true })

  const temporal = `${ruta}.${process.pid}.${contador++}.tmp`
  try {
    await writeFile(temporal, contenido)
    await renombrarConReintento(temporal, ruta)
  } catch (error) {
    /*
     * Si algo falló, el temporal se queda huérfano y hay que quitarlo: dejar
     * `aprendizaje.json.4812.0.tmp` en `datos/` después de un disco lleno
     * confunde a quien vaya a mirar por qué no se guardó, y encima ocupa. El
     * borrado se hace en su propio `catch` porque puede fallar por lo mismo
     * que falló la escritura, y ese segundo error no debe sustituir al
     * primero, que es el que explica lo que pasó.
     */
    await unlink(temporal).catch(() => {})
    throw error
  }
}

/**
 * Serializa un valor a JSON y lo escribe atómicamente.
 *
 * `espacios` por defecto 2 porque estos archivos se abren a mano: el de
 * aprendizaje se revisa con `scripts/revisar-propuestas.mjs` y a veces con un
 * editor. Las cachés de embeddings pasan `0`, que son megabytes de números y
 * ahí la indentación es sólo tamaño.
 *
 * @param {string} ruta
 * @param {unknown} valor
 * @param {number} [espacios]
 */
export async function escribirJsonAtomico(ruta, valor, espacios = 2) {
  /*
   * `async` y no una función normal que devuelve la promesa: `JSON.stringify`
   * LANZA ante una estructura cíclica, y en una función normal ese fallo sale
   * como excepción síncrona mientras el resto de los fallos de esta función
   * salen como rechazo. Quien la llama tendría que atrapar de las dos formas
   * para el mismo error —«no se pudo guardar»— y el `try/catch` de
   * `guardarAprendizaje`, que es `await`, sólo atrapa una.
   */
  await escribirAtomico(ruta, JSON.stringify(valor, null, espacios))
}
