/**
 * El diario de accionamientos sobre planta: una línea por orden, en disco,
 * que sobrevive al reinicio del proceso.
 *
 * ── QUÉ FALTA HOY, Y POR QUÉ IMPORTA (Plan 22 F3 · SEG-08) ─────────
 *
 * `controlRoutes.mjs` ya registra cada orden con su IP y su usuario en pino, y
 * su propia cabecera dice que es «el único registro que queda fuera del
 * historiador de ICONICS». El problema es dónde acaba esa línea: si el log
 * rota, si el contenedor se reinicia, o si nadie configuró un destino
 * persistente —que es lo normal— no queda constancia de por qué arrancó la
 * bomba a las tres de la mañana.
 *
 * Esto no sustituye al log: lo duplica a propósito, en un archivo que se puede
 * abrir, leer entero y llevarse. Un log es para diagnosticar el servicio; un
 * diario de accionamientos es para responder a una pregunta sobre la
 * instalación, meses después, a alguien que no tiene acceso al servidor.
 *
 * ── EL RECHAZO SE ANOTA IGUAL QUE LA ORDEN CUMPLIDA ────────────────
 *
 * «No encendí la bomba porque el tanque estaba al 92 %» es tan interesante
 * como «la encendí»: las dos contestan a por qué la instalación está como
 * está. Un diario que sólo guardara los éxitos daría a entender que en esas
 * horas nadie intentó nada.
 *
 * ── POR QUÉ JSONL Y NO UN JSON ─────────────────────────────────────
 *
 * Porque un array JSON hay que reescribirlo entero para añadirle un elemento:
 * leer, parsear, empujar, serializar y volcar. Con eso, cada orden a la bomba
 * pagaría el coste del diario completo, y un corte a mitad se llevaría todo lo
 * anterior. Una línea por entrada se añade con un `appendFile` que no toca lo
 * que ya está escrito, y un archivo con la última línea a medias sigue siendo
 * legible hasta la penúltima — que es exactamente la propiedad que se quiere
 * de un diario.
 *
 * `escribirAtomico` (Plan 20 F3) sí entra, pero sólo en la PODA, que es la
 * única operación que reescribe el archivo entero y por tanto la única que
 * podría dejarlo a medias.
 *
 * ── LA PODA SE ANOTA, NO SE CALLA ──────────────────────────────────
 *
 * Cuando el archivo pasa del tope, las entradas viejas se van — y en su lugar
 * queda una línea que dice cuántas y hasta cuándo llegaban. Un diario que
 * adelgaza en silencio es peor que uno que no existe: quien lo lee cree tener
 * el registro completo de un periodo del que le faltan las primeras horas
 * (CLAUDE.md §2.4, la ausencia de dato no se disfraza).
 */
import { appendFile, mkdir, readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { conCandado, escribirAtomico } from './jsonAtomico.mjs'

/**
 * Dónde vive. En `datos/`, junto a lo aprendido y las cachés: es estado que el
 * backend genera en marcha, no código, y por eso está en `.gitignore`.
 */
export const RUTA_DIARIO = join('datos', 'diario-accionamientos.jsonl')

/**
 * Tope de tamaño, en bytes.
 *
 * Una entrada ronda los 250 bytes, así que 8 MB son del orden de 30 000
 * accionamientos. En una instalación donde la bomba se acciona unas cuantas
 * veces al día, eso es más de una década — el tope no está para acotar el uso
 * normal, sino para que un bucle de accionamientos por un fallo de software no
 * llene el disco de la planta.
 */
export const MAX_BYTES_DIARIO = 8 * 1024 * 1024

/**
 * Retención, en días. Dos años: lo bastante para cubrir cualquier
 * investigación posterior a un incidente, y una cifra declarada en vez de
 * «hasta que se llene», que es lo que pasa cuando nadie la escribe.
 */
export const DIAS_RETENCION = 730

/**
 * Crea el diario.
 *
 * `ruta`, `maxBytes` y `diasRetencion` son opciones para que el verificador
 * pueda provocar una poda con tres entradas en vez de treinta mil. `ahora` lo
 * es para poder fechar en el pasado sin tocar el reloj del sistema.
 */
export function crearDiario({
  ruta = RUTA_DIARIO,
  maxBytes = MAX_BYTES_DIARIO,
  diasRetencion = DIAS_RETENCION,
  ahora = () => new Date(),
} = {}) {
  /**
   * Anota una entrada. Devuelve `{ ok }` y NUNCA lanza.
   *
   * ── POR QUÉ NO LANZA, QUE ES UNA DECISIÓN Y NO UN DESCUIDO ─────────
   *
   * Porque quien llama ya accionó la bomba. Si el disco está lleno o el
   * archivo está bloqueado, dejar caer la petición HTTP con un 500 le diría al
   * operador que la orden falló cuando la máquina ya la ejecutó — mucho peor
   * que perder una línea de diario. El fallo se devuelve para que la ruta lo
   * registre en el log, que es el otro sitio donde queda constancia.
   */
  async function anotar(entrada) {
    const linea = JSON.stringify({ instante: ahora().toISOString(), ...entrada })

    try {
      return await conCandado(ruta, async () => {
        await mkdir(dirname(ruta), { recursive: true })
        await appendFile(ruta, linea + '\n', 'utf8')
        await podarSiHaceFalta()
        return { ok: true }
      })
    } catch (error) {
      return { ok: false, error: error.message }
    }
  }

  /**
   * Quita lo viejo si el archivo pasó del tope, y deja constancia de lo que
   * quitó. Se llama DENTRO del candado, desde `anotar`.
   *
   * El orden importa: primero se descarta por antigüedad —que es el criterio
   * declarado— y sólo si aún no cabe se recortan las más viejas de las que
   * quedan. Al revés, un mes de mucha actividad podría llevarse entradas
   * dentro de la retención mientras otras más viejas sobreviven.
   */
  async function podarSiHaceFalta() {
    const { size } = await stat(ruta)
    if (size <= maxBytes) return

    const lineas = (await readFile(ruta, 'utf8')).split('\n').filter(Boolean)
    const limite = new Date(ahora().getTime() - diasRetencion * 86_400_000)

    let vivas = lineas.filter((l) => {
      const instante = instanteDe(l)
      // Una línea sin fecha legible no se descarta por antigüedad: no se sabe
      // que sea vieja. La poda por tamaño se la llevará si toca, y ahí sí
      // queda contada.
      return instante === null || instante >= limite
    })

    // La mitad del tope, no el tope: podar hasta el borde haría que la
    // siguiente entrada volviera a disparar la poda, y el archivo se
    // reescribiría entero en cada accionamiento.
    while (vivas.length > 1 && Buffer.byteLength(vivas.join('\n'), 'utf8') > maxBytes / 2) {
      vivas.shift()
    }

    const descartadas = lineas.length - vivas.length
    if (!descartadas) return

    const hasta = instanteDe(lineas[descartadas - 1])
    const aviso = JSON.stringify({
      instante: ahora().toISOString(),
      tipo: 'poda',
      descartadas,
      hasta: hasta ? hasta.toISOString() : null,
      motivo: `el diario pasó de ${Math.round(maxBytes / 1048576)} MB`,
    })

    await escribirAtomico(ruta, [aviso, ...vivas].join('\n') + '\n')
  }

  /**
   * Las entradas, de la más reciente a la más antigua.
   *
   * Una línea ilegible —la última, cortada por un apagón a mitad de
   * `appendFile`— se salta sin tirar el resto. Es justo el caso para el que se
   * eligió JSONL, y abortar la lectura entera por él sería desperdiciarlo.
   */
  async function leer({ limite = 200 } = {}) {
    let contenido
    try {
      contenido = await readFile(ruta, 'utf8')
    } catch (error) {
      // Que no exista es lo normal antes del primer accionamiento; no es un
      // error que nadie tenga que ver.
      if (error.code === 'ENOENT') return []
      throw error
    }

    const entradas = []
    for (const linea of contenido.split('\n')) {
      if (!linea) continue
      try {
        entradas.push(JSON.parse(linea))
      } catch {
        // Línea a medias: se cuenta como lo que es, un hueco, y se sigue.
        entradas.push({ instante: null, tipo: 'ilegible', linea: linea.slice(0, 120) })
      }
    }

    return entradas.reverse().slice(0, limite)
  }

  return { anotar, leer, ruta }
}

/** El `instante` de una línea, o `null` si no se puede leer. */
function instanteDe(linea) {
  try {
    const fecha = new Date(JSON.parse(linea).instante)
    return Number.isNaN(fecha.getTime()) ? null : fecha
  } catch {
    return null
  }
}
