#!/usr/bin/env node
/**
 * scripts/verificar-textos.mjs
 * ------------------------------------------------------------------
 * Que no quede texto en español escrito a mano dentro de una vista.
 *
 * ── POR QUÉ EXISTE, HABIENDO YA `verificar-i18n.mjs` ───────────────
 *
 * Porque aquél comprueba el DICCIONARIO —que los dos idiomas digan las mismas
 * cosas— y no puede saber nada de una frase que nunca llegó al diccionario. Un
 * `<span>Requiere atención</span>` escrito en el JSX pasa las 19
 * comprobaciones sin despeinarse: no hay clave que comparar.
 *
 * Y ése resultó ser el modo de fallo real. La migración a i18n se hizo vista
 * por vista, con la suite en verde en cada paso, y aun así el 08-09-2026 el
 * tablero puesto en inglés seguía enseñando «En vivo», «Encendida», «Requiere
 * atención» y los ocho nombres de señal en español. No lo encontró ninguna
 * puerta: lo encontró una persona mirando la pantalla y mandando capturas.
 *
 * Una prueba por vista tampoco lo cubre —hay que acordarse de escribirla, y
 * sólo vale para la vista que cubre—. Esto mira el árbol entero de una vez.
 *
 * ── CÓMO DECIDE QUE UNA CADENA ES ESPAÑOL ──────────────────────────
 *
 * Dos señales, y basta con una:
 *
 *   1. Lleva un carácter que el inglés no usa: á é í ó ú ñ ¿ ¡ «.
 *   2. Tiene más de una palabra y alguna es de una lista corta de palabras
 *      españolas que no existen en inglés (de, la, que, para, con, una…).
 *
 * Es una heurística y no un analizador de idioma. Sigue fallando —conocido y
 * aceptado— con una palabra SUELTA en español sin tilde: «Actualizar» pasa, y
 * no hay forma de cazarla sin una lista de verbos que se desactualizaría sola.
 * A cambio no necesita un modelo ni una lista de 10.000 palabras.
 *
 * El listón estuvo en DOS partículas hasta el 09-09-2026, y ése fue el hueco
 * por el que se coló «Salud del sistema»: una partícula, sin tildes, siendo el
 * título de la pantalla.
 *
 * ── DÓNDE MIRA ─────────────────────────────────────────────────────
 *
 * Sólo donde el texto acaba en pantalla:
 *
 *   · El contenido de un nodo JSX: `>Requiere atención<`.
 *   · Los atributos que pintan texto: title, label, placeholder, alt,
 *     aria-label, sub, message, tip — tanto `message="…"` como
 *     `message={"…" + "…"}`.
 *
 * Lo segundo se añadió el 09-09-2026, y no de adorno: este guion daba el árbol
 * por limpio teniendo delante un párrafo entero en español en
 * `views/vibraciones/Vibraciones.jsx`, escrito como `message={ "…" + "…" }`. Un
 * verificador que da un falso verde es peor que no tenerlo, porque además
 * convence.
 *
 * NO mira comentarios —que van en español a propósito (CLAUDE.md §4.6)—, ni
 * los diccionarios, ni las pruebas, ni `shared/`, que es dominio y tiene su
 * propio plan pendiente. Los comentarios se quitan con una pasada que
 * distingue string de comentario, para que un `"https://…"` no se coma media
 * línea.
 *
 * ── LA LISTA DE PERDONADOS ─────────────────────────────────────────
 *
 * `PERDONADOS`, abajo, con el motivo de cada uno al lado. Un perdón sin
 * motivo escrito es deuda disfrazada: si no se puede explicar por qué esa
 * cadena puede seguir en español, es que hay que traducirla.
 *
 * ── USO ────────────────────────────────────────────────────────────
 *
 *   node scripts/verificar-textos.mjs
 *
 * Sin red, sin build. Entra solo en `npm run verificar` (Plan 20 F2).
 */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..', 'react-dashboard', 'src')

const c = {
  verde: '\x1b[32m', rojo: '\x1b[31m', gris: '\x1b[90m',
  negrita: '\x1b[1m', reset: '\x1b[0m',
}

/* ── Qué NO se mira ──────────────────────────────────────────────────── */

const CARPETAS_FUERA = new Set([
  'locales',  // los diccionarios: ahí el español es el contenido
  'test',     // las pruebas escriben español a propósito
  'theme',    // tokens de color, sin texto de pantalla
])

/**
 * Cadenas que pueden seguir en español, cada una con su motivo.
 *
 * Se comparan por igualdad exacta tras normalizar espacios, no por
 * subcadena: un perdón amplio perdona de más.
 */
const PERDONADOS = new Map([
  /* Nombres propios del producto y de la instalación. */
  ['Demo EVA', 'nombre del producto'],
  ['Assets · Demo EVA', 'nombre del producto'],
  ['Sistema de agua industrial', 'nombre propio de la máquina; se traduce por machines:systems'],

  /* Identificadores de ICONICS: no se traducen NUNCA (§ del encargo). */
  ['ac:TDCON/DEMO/SENSORES/', 'ruta de ICONICS'],
  ['ac:TDCON/DEMO/SEGURIDAD/CONTROL', 'tag de ICONICS'],
])

/* ── Detección de español ────────────────────────────────────────────── */

const DIACRITICOS = /[áéíóúÁÉÍÓÚñÑ¿¡«»]/

/**
 * Palabras españolas que NO son también palabras inglesas.
 *
 * «no», «son», «sin», «e», «a», «un» y «me» quedan fuera a propósito: existen
 * en inglés y marcarían frases inglesas correctas.
 */
const PARTICULAS = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'que', 'qué', 'para', 'por', 'con',
  'una', 'unos', 'unas', 'hay', 'su', 'sus', 'esta', 'este', 'esto', 'estos',
  'como', 'cuando', 'donde', 'pero', 'muy', 'todo', 'toda', 'todos', 'todas',
  'cada', 'otro', 'otra', 'entre', 'sobre', 'desde', 'hasta', 'porque',
  'mismo', 'misma', 'segun', 'tras', 'ante', 'bajo', 'ni', 'se', 'le', 'lo',
  'al', 'es', 'en', 'ya', 'aun', 'aunque', 'sino', 'tambien', 'nada', 'algo',
])

/**
 * ── POR QUÉ BASTA UNA PARTÍCULA, Y NO DOS ──────────────────────────
 *
 * Pedía dos para no marcar «Data del» ni un identificador suelto. El precio
 * resultó ser más caro que el problema: «Salud del sistema» —el título de una
 * pantalla entera— y «Este servidor» llevan una sola y sin tilde, así que
 * pasaban limpias. Las dos estuvieron en español dentro del tablero en inglés.
 *
 * Con una basta, siempre que la frase tenga MÁS DE UNA PALABRA: eso ya descarta
 * el identificador suelto, que era el caso que preocupaba. Y «Data del» ahora
 * se marca, que es lo correcto — es español a medias, no una excepción.
 */
function pareceEspanol(texto) {
  if (DIACRITICOS.test(texto)) return true
  const palabras = texto.toLowerCase().match(/[a-záéíóúñ]+/g) ?? []
  if (palabras.length < 2) return false
  return palabras.some(p => PARTICULAS.has(p))
}

/* ── Quitar comentarios sin romper las cadenas ───────────────────────── */

/**
 * Lo que puede haber justo ANTES de una barra que abre una expresión regular.
 *
 * Hace falta para no confundir `.replace(/'/g, "")` con el principio de una
 * cadena. Sin esto, esa comilla dentro de la expresión metía al recorrido en
 * estado «cadena» y se tragaba TODO lo que venía después —comentarios
 * incluidos—, así que un comentario de JSX se colaba entero como si fuera texto
 * de pantalla. Pasó de verdad en `EscrituraView.jsx`.
 *
 * (Este párrafo no escribe el comentario de JSX literal a propósito: cerraría
 * ESTE bloque. El primer intento lo esquivó con un carácter invisible en
 * medio, que el linter cazó al momento — con razón.)
 *
 * Después de un nombre, un número o un `)` una barra es una división; después
 * de un operador o de una apertura, es una expresión regular.
 */
const ANTES_DE_REGEX = new Set([
  '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>', 'return',
])

/**
 * Sustituye comentarios por espacios, conservando las posiciones para que el
 * número de línea del hallazgo siga siendo el de verdad.
 *
 * Es una máquina de estados y no un `replace` con expresión regular por un
 * motivo concreto: `"https://planta/x"` lleva un `//` dentro de una cadena, y
 * una expresión regular se comería el resto de la línea — incluido el texto
 * que se está buscando.
 */
function sinComentarios(fuente) {
  let salida = ''
  let i = 0
  let estado = 'codigo' // codigo | linea | bloque | cadena | plantilla
  let comilla = ''
  /** El último carácter significativo que se ha emitido. */
  let anterior = ''

  while (i < fuente.length) {
    const a = fuente[i]
    const b = fuente[i + 1]

    if (estado === 'codigo') {
      if (a === '/' && b === '/') { estado = 'linea'; salida += '  '; i += 2; continue }
      if (a === '/' && b === '*') { estado = 'bloque'; salida += '  '; i += 2; continue }

      /* Una expresión regular se copia entera y no se mira por dentro. */
      if (a === '/' && ANTES_DE_REGEX.has(anterior)) {
        let j = i + 1
        while (j < fuente.length && fuente[j] !== '\n') {
          if (fuente[j] === '\\') { j += 2; continue }
          if (fuente[j] === '/') { j += 1; break }
          j += 1
        }
        salida += fuente.slice(i, j)
        anterior = '/'
        i = j
        continue
      }

      if (a === '"' || a === "'") { estado = 'cadena'; comilla = a; salida += a; i += 1; continue }
      if (a === '`') { estado = 'plantilla'; salida += a; i += 1; continue }
      if (a.trim()) anterior = a
      salida += a; i += 1; continue
    }

    if (estado === 'linea') {
      if (a === '\n') { estado = 'codigo'; salida += a } else salida += ' '
      i += 1; continue
    }

    if (estado === 'bloque') {
      if (a === '*' && b === '/') { estado = 'codigo'; salida += '  '; i += 2; continue }
      salida += a === '\n' ? a : ' '
      i += 1; continue
    }

    /* Dentro de una cadena: se copia tal cual, respetando el escape. */
    if (a === '\\') { salida += a + (b ?? ''); i += 2; continue }
    if (estado === 'cadena' && a === comilla) { estado = 'codigo' }
    if (estado === 'plantilla' && a === '`') { estado = 'codigo' }
    salida += a; i += 1
  }

  return salida
}

/* ── Dónde buscar dentro del archivo ─────────────────────────────────── */

/** El contenido de un nodo JSX: `>  Requiere atención  <`. */
const NODO_JSX = />([^<>{}"'`]+)</g

/**
 * Lo que delata que un `>…<` no era un nodo JSX sino código.
 *
 * `a > b ? c : d` y `x && y` casan con el patrón de arriba porque llevan `>`
 * y `<` sueltos. Marcaron dos líneas reales de `tiles.jsx` y
 * `ActivoEnMaqueta.jsx` en la primera pasada. Nada de esto aparece en una
 * frase de pantalla; los paréntesis sí —«Predicción (Beta)»—, así que no
 * entran en la lista.
 */
const HUELE_A_CODIGO = /=>|&&|\|\||\?\?|\?\.|;|\s\?\s|\s:\s\w|=\s/

/**
 * Los nombres de atributo que acaban en pantalla.
 *
 * Los cuatro últimos son de este proyecto y no del HTML: `<Dato etiqueta valor>`
 * y `<Campo rotulo>` son las piezas con las que están escritas media docena de
 * pantallas. Faltaban `etiqueta` y `valor`, y por ese hueco pasaron once
 * rótulos en español de la pantalla de Salud —«Manuales», «Fragmentos»,
 * «Versión», «Última consulta»— con este guion diciendo que el árbol estaba
 * limpio.
 */
const NOMBRES =
  'title|label|placeholder|alt|aria-label|sub|message|tip|titulo|rotulo|etiqueta|valor|mensaje'

/** Escritos como cadena suelta: `title="…"`. */
const ATRIBUTO = new RegExp('\\b(' + NOMBRES + ')\\s*=\\s*"([^"]+)"', 'g')

/**
 * Y en llaves, que es la otra mitad: `message={"…" + "…"}` y `message={`…`}`.
 *
 * Basta con cazar el PRIMER trozo. Si ése está en español el resto también, y
 * lo que hace falta es señalar la línea, no reconstruir la frase entera.
 *
 * La forma con acento grave se añadió después de la de comillas, y por el mismo
 * motivo: el aviso de «no carga» de la pantalla de Salud estaba escrito
 * `message={`${error}. Si esta pantalla…`}` y seguía sin verse.
 */
const ATRIBUTO_EN_LLAVES = new RegExp(
  '\\b(' + NOMBRES + ')\\s*=\\s*\\{\\s*(?:"([^"]+)"|`([^`]+)`)',
  'g'
)

function hallazgosDe(fuente) {
  const limpio = sinComentarios(fuente)
  const encontrados = []

  const anotar = (indice, texto) => {
    const valor = texto.replace(/\s+/g, ' ').trim()
    if (valor.length < 4) return
    if (HUELE_A_CODIGO.test(valor)) return
    if (PERDONADOS.has(valor)) return
    if (!pareceEspanol(valor)) return
    encontrados.push({ linea: limpio.slice(0, indice).split('\n').length, valor })
  }

  for (const m of limpio.matchAll(NODO_JSX)) anotar(m.index, m[1])
  for (const m of limpio.matchAll(ATRIBUTO)) anotar(m.index, m[2])
  /* Dos grupos: el de comillas o el de acento grave, según cuál casara. */
  for (const m of limpio.matchAll(ATRIBUTO_EN_LLAVES)) anotar(m.index, m[2] ?? m[3])

  return encontrados
}

/* ── Recorrido ───────────────────────────────────────────────────────── */

function archivos(dir) {
  const salida = []
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) {
      if (CARPETAS_FUERA.has(nombre)) continue
      salida.push(...archivos(ruta))
    } else if (/\.jsx?$/.test(nombre)) {
      salida.push(ruta)
    }
  }
  return salida
}

/* ── Informe ─────────────────────────────────────────────────────────── */

console.log(`\n${c.negrita}Texto de pantalla sin traducir${c.reset}`)

const porArchivo = new Map()
let total = 0

for (const ruta of archivos(RAIZ)) {
  const encontrados = hallazgosDe(readFileSync(ruta, 'utf8'))
  if (!encontrados.length) continue
  porArchivo.set(relative(RAIZ, ruta).replaceAll('\\', '/'), encontrados)
  total += encontrados.length
}

/*
 * `--archivo <trozo>` filtra a un archivo y lo enseña ENTERO, sin recortar a
 * ocho. Es para trabajar sobre uno concreto sin leer el informe completo;
 * sin bandera, el informe sale resumido y ordenado por volumen.
 */
const filtro = process.argv.includes("--archivo")
  ? process.argv[process.argv.indexOf("--archivo") + 1]
  : null

for (const [archivo, encontrados] of [...porArchivo].sort((a, b) => b[1].length - a[1].length)) {
  if (filtro && !archivo.includes(filtro)) continue
  console.log(`\n  ${c.rojo}${archivo}${c.reset}  ${c.gris}(${encontrados.length})${c.reset}`)
  for (const { linea, valor } of (filtro ? encontrados : encontrados.slice(0, 8))) {
    const corto = !filtro && valor.length > 74 ? `${valor.slice(0, 74)}…` : valor
    console.log(`    ${c.gris}${String(linea).padStart(4)}${c.reset}  ${corto}`)
  }
  if (!filtro && encontrados.length > 8) {
    console.log(`    ${c.gris}… y ${encontrados.length - 8} más${c.reset}`)
  }
}

if (total === 0) {
  console.log(`\n  ${c.verde}✓${c.reset} ninguna cadena de pantalla en español fuera del diccionario`)
  console.log(`\n${c.verde}${c.negrita}Todo el texto de la interfaz pasa por i18n.${c.reset}\n`)
} else {
  console.log(
    `\n${c.rojo}${c.negrita}${total} cadena(s) de pantalla en español, en ${porArchivo.size} archivo(s).${c.reset}\n`
  )
}

assert.equal(total, 0, `${total} cadenas de pantalla sin traducir`)
