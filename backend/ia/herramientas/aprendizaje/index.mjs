/**
 * backend/ia/herramientas/aprendizaje/index.mjs
 * ------------------------------------------------------------------
 * Las tres herramientas de lo APRENDIDO: consultar los hechos confirmados de
 * la planta, anotar uno nuevo y proponer una regla de vigilancia.
 *
 * ── POR QUÉ SALEN JUNTAS Y POR QUÉ SALEN PRONTO ────────────────────
 *
 * Porque forman un grupo cerrado: las tres —y sólo ellas— hablan con el
 * almacén JSON de `datos/aprendizaje.json`, y ninguna toca el `client` de
 * ICONICS. No leen el servidor, no piden series y no evalúan reglas; su
 * materia prima es un archivo.
 *
 * Eso las hace de las primeras del reparto (Fase 1). Esta factoría no recibe
 * `client`, ni `turnos`, ni concurrencia: no recibe nada. Si algún día una de
 * ellas necesitara leer del servidor, la firma de abajo tendría que cambiar
 * —y ese cambio de firma es justo la señal de que el grupo dejó de ser cerrado.
 *
 * ── LA REGLA QUE ESTE GRUPO PROTEGE ────────────────────────────────
 *
 * Que el asistente APRENDE pero no DECIDE. `recordar_hecho` guarda algo que
 * alguien confirmó; `proponer_regla` deja una propuesta anotada que no vigila
 * nada hasta que una persona la revisa con `scripts/revisar-propuestas.mjs`.
 * Ninguna de las dos activa nada por su cuenta, y sus avisos lo dicen en el
 * texto que el modelo cita literal.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  VACIO as APRENDIZAJE_VACIO,
  crearHecho,
  crearPropuesta,
  hechosVigentes,
  normalizarAlmacen,
  pendientes,
  validarPropuesta,
} from '../../../../shared/eva/aprendizaje.js'
import { fallo } from '../lib/respuesta.mjs'

/**
 * Las tres herramientas de aprendizaje.
 *
 * No recibe nada a propósito: ver la cabecera. Devuelve el mismo objeto
 * `{ nombre: fn }` que el ensamblador mezcla con el de las demás familias.
 */
export function crearHerramientasDeAprendizaje() {

/**
 * ── EL ALMACÉN DE LO APRENDIDO ────────────────────────────────────
 *
 * Un JSON en `datos/`, al lado de los reportes. Se lee entero en cada
 * llamada y no se cachea: son unos kilobytes, y una caché aquí haría que dos
 * conversaciones simultáneas se pisaran los hechos que acaban de guardar.
 */
/*
 * Ruta FIJA, no derivada de la de reportes. Derivarla con un `..` dependía de
 * si `reportesDir` venía como `datos` o como `datos/reportes`, y el archivo
 * acabó en la raíz del repositorio mientras `revisar-propuestas.mjs` lo
 * buscaba en `datos/`: el asistente guardaba y el revisor no veía nada, sin
 * un solo error por ningún lado. Las dos puntas usan esta misma constante.
 */
const RUTA_APRENDIZAJE = join('datos', 'aprendizaje.json')

async function leerAprendizaje() {
  try {
    return normalizarAlmacen(JSON.parse(await readFile(RUTA_APRENDIZAJE, 'utf8')))
  } catch {
    /* Que no exista es lo normal la primera vez, y un archivo corrupto no
       puede tumbar el asistente entero: se parte de vacío y los hechos de
       fábrica siguen ahí, que viven en el código. */
    return { ...APRENDIZAJE_VACIO, hechos: [], propuestas: [] }
  }
}

async function guardarAprendizaje(almacen) {
  try {
    await mkdir(dirname(RUTA_APRENDIZAJE), { recursive: true })
    await writeFile(RUTA_APRENDIZAJE, JSON.stringify(almacen, null, 2), 'utf8')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e?.message ?? String(e) }
  }
}

  return {
    /**
     * ── LO QUE YA SE SABE DE ESTA PLANTA ──────────────────────────────
     *
     * El modelo no recuerda nada entre conversaciones. Esto es lo más parecido
     * a que recuerde: los hechos que alguien confirmó alguna vez, entregados
     * cada vez que hacen falta.
     *
     * Son cosas que costaron días de averiguar y que NO se deducen mirando el
     * servidor —que hay tres sensores y no dos, que el grupo del historiador
     * lleva un espacio en el nombre—. Sin esto, cada conversación las vuelve a
     * suponer, y suponerlas mal es gratis.
     */
    async hechos_de_la_planta({ sistema = null } = {}) {
      const almacen = await leerAprendizaje()
      const todos = hechosVigentes(almacen)
      const hechos = sistema ? todos.filter((h) => h.sistema === sistema || h.sistema === null) : todos

      return {
        ok: true,
        cuantos: hechos.length,
        hechos: hechos.map((h) => ({
          sobre: h.sistema ?? 'toda la planta',
          hecho: h.hecho,
          /* El origen viaja siempre: «lo confirmó quien opera la instalación»
             y «lo dedujo el modelo» no valen lo mismo, y leídos en la misma
             lista sin esta línea serían indistinguibles. */
          origen: h.origen,
        })),
        propuestas_pendientes: pendientes(almacen).length,
      }
    },

    /**
     * ── APRENDER ALGO NUEVO, CUANDO UNA PERSONA LO CONFIRMA ───────────
     *
     * Sólo se llama cuando el usuario AFIRMA un dato de la instalación. No
     * para guardar lo que el modelo deduzca: para eso está `proponer_regla`,
     * que pasa por revisión.
     *
     * La diferencia importa dentro de un mes, cuando alguien lea la lista y no
     * pueda distinguir un dato de planta de una conjetura bien redactada.
     */
    async recordar_hecho({ hecho, sistema = null, origen = null } = {}) {
      const texto = String(hecho ?? '').trim()
      if (texto.length < 10) {
        return fallo('Un hecho tiene que decir algo concreto sobre la instalación.')
      }
      if (!origen) {
        return fallo(
          'Falta el origen: quién lo confirmó y cuándo. Sin eso no se puede guardar, porque ' +
          'dentro de un mes nadie sabrá si lo dijo quien opera la planta o lo dedujo el asistente.'
        )
      }

      const almacen = await leerAprendizaje()
      const nuevo = crearHecho({ hecho: texto, sistema, origen }, new Date())
      almacen.hechos.push(nuevo)
      const guardado = await guardarAprendizaje(almacen)
      if (!guardado.ok) return fallo(`No se pudo guardar: ${guardado.error}`)

      return {
        ok: true,
        guardado: nuevo.hecho,
        sobre: nuevo.sistema ?? 'toda la planta',
        total_hechos: hechosVigentes(almacen).length,
        aviso:
          'Queda guardado, y estará disponible en las siguientes conversaciones. ' +
          'Se ha anotado junto con su origen, para que más adelante se sepa quién lo confirmó.',
      }
    },

    /**
     * ── PROPONER UNA REGLA, QUE NO ES LO MISMO QUE CREARLA ────────────
     *
     * Esto NO añade una regla al sistema. Deja una propuesta esperando a que
     * una persona la revise.
     *
     * Y es deliberado. Estas reglas deciden si una pantalla de planta dice
     * «riesgo de derrame»: una inventada que salta sin motivo se desactiva a
     * la semana y se lleva por delante la credibilidad de las que sí valen.
     * Contra este mismo servidor, el modelo local dijo tres veces seguidas
     * «velocidad eficaz 1,13 mm/s» leyendo la ACELERACIÓN. Quien confunde un
     * campo no firma el criterio con el que se para una bomba.
     *
     * Lo que sí aporta, y es mucho: mirar semanas de datos, ver un patrón que
     * a nadie se le había ocurrido, y dejarlo redactado con su evidencia para
     * que alguien lo juzgue en treinta segundos.
     */
    async proponer_regla(datos = {}) {
      const v = validarPropuesta(datos)
      if (!v.ok) {
        return fallo(
          `A la propuesta le faltan campos: ${v.faltan.join(', ')}. La evidencia tiene que ` +
          'llevar las cifras que la sostienen, no sólo la idea: sin ellas, quien la revise ' +
          'tendría que ir a buscar los datos él mismo y la propuesta no le ahorra nada.',
          { faltan: v.faltan }
        )
      }

      const almacen = await leerAprendizaje()
      const p = crearPropuesta(datos, new Date())
      almacen.propuestas.push(p)
      const guardado = await guardarAprendizaje(almacen)
      if (!guardado.ok) return fallo(`No se pudo guardar: ${guardado.error}`)

      return {
        ok: true,
        id: p.id,
        estado: p.estado,
        titulo: p.titulo,
        pendientes_de_revisar: pendientes(almacen).length,
        /*
         * `aviso` lo cita el modelo LITERAL en su respuesta —se comprobó—, así
         * que va escrito para quien lo lee. Las instrucciones al modelo viven
         * en las reglas de `chat.mjs`, no aquí: una frase como «dile al
         * usuario que…» acaba impresa en pantalla tal cual.
         */
        aviso:
          'Esto queda ANOTADO como propuesta y no vigila nada todavía: ninguna regla se ' +
          'aplica sin que una persona la revise. Para revisarla: ' +
          '`node scripts/revisar-propuestas.mjs`',
      }
    },
  }
}
