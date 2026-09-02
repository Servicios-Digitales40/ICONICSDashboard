/**
 * El catálogo de manuales: subir, reemplazar y archivar. Plan 16 Fase 1.
 *
 * ── LO QUE ESTE MÓDULO NO HACE ──────────────────────────────────────
 *
 * No indexa. `backend/ia/documentos.mjs` lee `carpeta` a ciegas y construye
 * BM25/embeddings sobre lo que encuentra; este módulo sólo decide QUÉ hay en
 * esa carpeta y de dónde salió. Subir un manual lo deja ahí escrito y deja que
 * el índice —que ya vigila la carpeta cada `MS_ENTRE_COMPROBACIONES`— lo
 * recoja solo; `subir`/`reemplazar`/`archivar` además disparan un
 * `recargar()` de fondo, sin esperarlo, para que no haga falta aguantar diez
 * segundos a que aparezca.
 *
 * ── POR QUÉ NO HAY `borrar` ──────────────────────────────────────────
 *
 * Mismo criterio que el resto del tablero (ver la cabecera de
 * `react-dashboard/src/app/routes/routes.jsx`): un botón «Eliminar» no debe
 * existir en un tablero de planta, funcione o no. `archivar` MUEVE el archivo
 * a `<carpeta>/.archivados/` —fuera de lo que el índice recorre, así que deja
 * de contestar preguntas— pero nunca lo borra. `.archivados` empieza por
 * punto para dos cosas a la vez: queda fuera de `SOPORTADAS` sin necesitar un
 * caso especial (`extname('.archivados')` no es ninguna extensión conocida) y
 * no aparece al navegar la carpeta con un explorador normal.
 *
 * ── LA DEFENSA CONTRA UN NOMBRE DE ARCHIVO HOSTIL ────────────────────
 *
 * El nombre que manda quien sube el archivo NUNCA se usa tal cual para
 * construir una ruta: `sanearNombreArchivo` se queda sólo con su
 * `basename()` —así que un `../../etc/passwd` se convierte en `passwd`— y
 * además sustituye cualquier carácter que no sea letra, número, punto, guión
 * o espacio. Sin esto, un nombre como `../../../fuera-de-la-carpeta.txt`
 * escribiría fuera de `carpeta` sin que nada lo impidiera.
 */
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { logger } from '../logger.mjs'
import {
  crearManual,
  EXTENSIONES_MANUAL,
  NOMBRE_MANIFIESTO,
  normalizarManifiesto,
  sistemaValido,
  VACIO as MANIFIESTO_VACIO,
} from '../../shared/eva/manuales.js'
import { MAX_BYTES } from './documentos.mjs'

/*
 * `NOMBRE_MANIFIESTO` vive en `shared/eva/manuales.js` —no aquí— desde el
 * Plan 17 Fase 3a: `documentos.mjs` también necesita leerlo (para aislar el
 * RAG documental por sistema, G7) y no puede importarlo de este archivo sin
 * crear un ciclo, porque este archivo ya importa `MAX_BYTES` DE
 * `documentos.mjs`. Sigue siendo DENTRO de `carpeta` —a diferencia de
 * `RUTA_APRENDIZAJE`, que es fija en `datos/`—: puede haber tantas
 * `carpeta` como instalaciones se levanten a la vez con distinto
 * `IA_DOCS_DIR`, y un manifiesto compartido mezclaría los manuales de una
 * con los de otra sin que nada lo avisara.
 */

/** La subcarpeta donde `archivar` mueve un manual. Ver la cabecera. */
const CARPETA_ARCHIVADOS = '.archivados'

const EXTENSIONES_VALIDAS = new Set(EXTENSIONES_MANUAL)

async function leerManifiesto(ruta) {
  try {
    return normalizarManifiesto(JSON.parse(await readFile(ruta, 'utf8')))
  } catch {
    return { ...MANIFIESTO_VACIO }
  }
}

async function guardarManifiesto(ruta, manifiesto) {
  await mkdir(dirname(ruta), { recursive: true })
  await writeFile(ruta, JSON.stringify(manifiesto, null, 2), 'utf8')
}

/**
 * Sólo el nombre, nunca la ruta. `basename()` descarta cualquier segmento de
 * directorio —`..`, `/`, `\`— antes incluso de mirar los caracteres; lo que
 * queda se limpia para que sólo sobrevivan letras, números, punto, guión,
 * guión bajo y espacio. Un nombre que se queda vacío tras la limpieza (era
 * sólo símbolos) cae a `documento` en vez de producir una ruta rara.
 */
function sanearNombreArchivo(nombre) {
  const solo = basename(String(nombre ?? '').trim())
  const limpio = solo.replace(/[^\w.\- ]+/g, '_').replace(/^\.+/, '')
  return limpio || 'documento'
}

/** Añade `-2`, `-3`… antes de la extensión hasta encontrar un nombre que no
 *  exista ya en `carpeta`. Dos manuales llamados `manual.pdf` no pueden
 *  compartir archivo: el segundo perdería silenciosamente al primero. */
async function nombreDisponible(carpeta, nombreSaneado) {
  const ext = extname(nombreSaneado)
  const base = nombreSaneado.slice(0, nombreSaneado.length - ext.length)

  let candidato = nombreSaneado
  let intento = 1
  while (await existe(join(carpeta, candidato))) {
    intento++
    candidato = `${base}-${intento}${ext}`
  }
  return candidato
}

async function existe(ruta) {
  try {
    await stat(ruta)
    return true
  } catch {
    return false
  }
}

/**
 * @param {object} opciones
 * @param {string} opciones.carpeta        la misma que lee `createIndiceDocumentos`
 * @param {string} [opciones.rutaManifiesto] por defecto `<carpeta>/.manifiesto.json`;
 *                                          se puede pisar para pruebas que quieran
 *                                          mirar el archivo por su cuenta
 * @param {{recargar: () => Promise<void>}} [opciones.indiceDocumentos] para
 *   disparar la reindexación tras subir/reemplazar/archivar sin esperarla
 */
export function createGestorManuales({
  carpeta,
  rutaManifiesto = join(carpeta, NOMBRE_MANIFIESTO),
  indiceDocumentos = null,
}) {
  /** Dispara una reindexación de fondo. Un fallo aquí no debe tirar la
   *  respuesta HTTP: el manifiesto ya quedó bien escrito, y el índice se
   *  puede poner al día en la siguiente comprobación periódica igualmente. */
  function reindexarDeFondo() {
    indiceDocumentos?.recargar().catch(error => {
      logger.warn('La reindexación tras un cambio en los manuales falló', { error: error.message })
    })
  }

  async function listar() {
    const manifiesto = await leerManifiesto(rutaManifiesto)
    return manifiesto.manuales
  }

  /**
   * Da de alta un manual nuevo: lo escribe en `carpeta` y añade su entrada al
   * manifiesto. Devuelve `{ ok: false, error }` en vez de lanzar ante
   * cualquier rechazo —extensión, tamaño, sistema desconocido— para que la
   * ruta HTTP no tenga que adivinar el código de estado a partir del mensaje.
   */
  async function subir({ bytes, nombreOriginal, sistema = null, titulo = null, subidoPor = 'desconocido' }) {
    const nombreSaneado = sanearNombreArchivo(nombreOriginal)
    const ext = extname(nombreSaneado).toLowerCase()

    if (!EXTENSIONES_VALIDAS.has(ext)) {
      return {
        ok: false,
        error: `Extensión no admitida (${ext || 'sin extensión'}). Se aceptan: ${EXTENSIONES_MANUAL.join(', ')}.`,
      }
    }
    if (bytes.length > MAX_BYTES) {
      return { ok: false, error: `El archivo pasa de ${Math.round(MAX_BYTES / 1048576)} MB.` }
    }
    if (!sistemaValido(sistema)) {
      return { ok: false, error: `"${sistema}" no es un sistema de la planta declarado.` }
    }

    await mkdir(carpeta, { recursive: true })
    const nombreFinal = await nombreDisponible(carpeta, nombreSaneado)
    await writeFile(join(carpeta, nombreFinal), bytes)

    const manifiesto = await leerManifiesto(rutaManifiesto)
    const entrada = crearManual({
      id: randomUUID(),
      archivo: nombreFinal,
      sistema,
      titulo,
      subidoPor,
    })
    manifiesto.manuales.push(entrada)
    await guardarManifiesto(rutaManifiesto, manifiesto)

    reindexarDeFondo()
    return { ok: true, manual: entrada }
  }

  /**
   * Sustituye el CONTENIDO de un manual ya dado de alta —misma entrada, mismo
   * archivo en disco, `version` incrementada— por una revisión nueva. No se
   * puede reemplazar uno archivado: si hace falta reactivarlo, es una entrada
   * nueva.
   */
  async function reemplazar({ id, bytes, subidoPor = 'desconocido' }) {
    if (bytes.length > MAX_BYTES) {
      return { ok: false, error: `El archivo pasa de ${Math.round(MAX_BYTES / 1048576)} MB.` }
    }

    const manifiesto = await leerManifiesto(rutaManifiesto)
    const entrada = manifiesto.manuales.find(m => m.id === id)
    if (!entrada) return { ok: false, error: `No hay ningún manual con id "${id}".` }
    if (entrada.estado === 'archivado') {
      return { ok: false, error: 'Este manual está archivado; no se puede reemplazar. Sube una entrada nueva.' }
    }

    await writeFile(join(carpeta, entrada.archivo), bytes)

    entrada.version += 1
    entrada.subidoPor = subidoPor
    entrada.fecha = new Date().toISOString()
    await guardarManifiesto(rutaManifiesto, manifiesto)

    reindexarDeFondo()
    return { ok: true, manual: entrada }
  }

  /**
   * Archiva: mueve el archivo a `.archivados/` y marca la entrada. El archivo
   * NO se borra —ver la cabecera— así que esto siempre se puede deshacer a
   * mano copiándolo de vuelta, aunque hoy no haya un botón para eso.
   */
  async function archivar({ id }) {
    const manifiesto = await leerManifiesto(rutaManifiesto)
    const entrada = manifiesto.manuales.find(m => m.id === id)
    if (!entrada) return { ok: false, error: `No hay ningún manual con id "${id}".` }
    if (entrada.estado === 'archivado') return { ok: true, manual: entrada }

    await mkdir(join(carpeta, CARPETA_ARCHIVADOS), { recursive: true })
    await rename(
      join(carpeta, entrada.archivo),
      join(carpeta, CARPETA_ARCHIVADOS, entrada.archivo)
    ).catch(error => {
      // El archivo pudo haberse movido ya a mano, o borrado del disco por
      // fuera del sistema. La entrada se archiva igual: mentir sobre el
      // manifiesto porque el disco ya no coincide sería peor que archivar un
      // registro cuyo archivo ya no está donde se esperaba.
      logger.warn('No se pudo mover el archivo al archivar un manual', {
        archivo: entrada.archivo, error: error.message,
      })
    })

    entrada.estado = 'archivado'
    await guardarManifiesto(rutaManifiesto, manifiesto)

    reindexarDeFondo()
    return { ok: true, manual: entrada }
  }

  return { listar, subir, reemplazar, archivar }
}
