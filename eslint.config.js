/**
 * Reglas de la casa, escritas para una maquina.
 *
 * ── POR QUE EXISTE ─────────────────────────────────────────────────
 *
 * Este proyecto tiene reglas no negociables muy claras (`CLAUDE.md` §2) y
 * hasta ahora las vigilaba entera la revision humana. Se notaba: hay tres
 * `// eslint-disable-next-line react-hooks/exhaustive-deps` en
 * `Demo-EVA/data/comunes/hooks.js` — supresiones escritas para un linter que
 * nadie ejecutaba. Una supresion sin linter no suprime nada; solo documenta
 * que alguien penso en la regla.
 *
 * ── QUE VIGILA, Y QUE NO ───────────────────────────────────────────
 *
 * La eleccion de reglas tiene un criterio y no es "las que trae recommended":
 * el arbol tiene que salir en VERDE desde el primer dia. Un linter que entra
 * con cuatrocientos avisos no es una puerta, es ruido que se aprende a
 * ignorar, y a la semana se corre con `--quiet`.
 *
 * Asi que aqui hay dos clases de regla:
 *
 *   1. Las que atrapan un fallo de verdad (variable no declarada, `case` que
 *      se cae al siguiente, promesa con `async` en un sitio que no la espera).
 *   2. Las que son de ESTE proyecto, y son las que justifican el archivo:
 *      la frontera de `shared/`.
 *
 * Lo que NO hay es estilo. Ni comillas, ni punto y coma, ni orden de imports:
 * el arbol mezcla las dos convenciones (`backend/` sin punto y coma,
 * `react-dashboard/` con el), esa mezcla no ha costado nunca un fallo, y
 * unificarla seria un diff de diez mil lineas que tapa el historial de
 * `git blame` a cambio de nada.
 *
 * ── LA FRONTERA DE `shared/` ───────────────────────────────────────
 *
 * `CLAUDE.md` §2.7: «`shared/` es dominio puro. Sin React, sin `fetch`, sin
 * nada que sepa de HTTP o de UI. Se prueba en Node sin arrancar nada.»
 *
 * Esa regla es la que sostiene que el backend y el frontend compartan dominio
 * sin duplicarlo, y es exactamente la clase de regla que se rompe sin querer:
 * alguien anade un `fetch` a `historia.js` porque «ya que estoy», y el modulo
 * deja de poder importarse desde Node sin red. No falla en el momento —falla
 * la proxima vez que alguien pruebe el dominio— y para entonces el import ya
 * tiene tres usuarios.
 *
 * Aqui deja de ser una regla de un documento y pasa a ser un error del linter,
 * con el mensaje diciendo a donde va ese codigo en su lugar.
 */
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import react from 'eslint-plugin-react'

/**
 * Lo que `shared/` no puede tocar, con el motivo pegado al mensaje.
 *
 * No es una lista de "cosas del navegador": es la lista de lo que hace que un
 * modulo deje de poder probarse en Node sin arrancar nada, que es la promesa
 * concreta que `shared/` hace a sus dos consumidores.
 */
const PROHIBIDO_EN_DOMINIO = [
  {
    name: 'fetch',
    message:
      'shared/ es dominio puro y no sale a la red (CLAUDE.md §2.7). Lo que necesita HTTP vive ' +
      'en Demo-EVA/data/ (frontend) o en backend/ia/indices/ y LLAMA al dominio, no al reves.',
  },
  {
    name: 'XMLHttpRequest',
    message: 'shared/ es dominio puro y no sale a la red (CLAUDE.md §2.7).',
  },
  {
    name: 'window',
    message:
      'shared/ se prueba en Node sin DOM (CLAUDE.md §2.7). Si hace falta algo del navegador, ' +
      'va en react-dashboard/src/ y recibe el dato ya resuelto.',
  },
  {
    name: 'document',
    message: 'shared/ se prueba en Node sin DOM (CLAUDE.md §2.7).',
  },
  {
    name: 'localStorage',
    message:
      'shared/ no persiste nada por su cuenta (CLAUDE.md §2.7). La persistencia del tablero vive ' +
      'en features/asistente/lib/persistencia.js; la del servidor, en backend/.',
  },
  {
    name: 'sessionStorage',
    message: 'shared/ no persiste nada por su cuenta (CLAUDE.md §2.7).',
  },
]

/** Reglas que atrapan un fallo real, comunes a las cuatro capas. */
const REGLAS_COMUNES = {
  ...js.configs.recommended.rules,

  /*
   * Un argumento sin usar suele ser una firma que cambio y alguien no
   * termino de seguir. Se perdonan los que empiezan por `_`, que es como se
   * escribe "lo recibo y no lo necesito" a proposito, y los que van DELANTE
   * de uno que si se usa: quitarlos cambiaria la posicion de los demas.
   */
  'no-unused-vars': ['error', {
    argsIgnorePattern: '^_',
    varsIgnorePattern: '^_',
    caughtErrors: 'none',
    args: 'after-used',
    /*
     * `const { clave, meta, ...resto } = x` es como se quita un campo de un
     * objeto en JS: los nombres de la izquierda existen PARA no viajar en
     * `resto`. Marcarlos obligaria a escribir `_clave`, que dice justo lo
     * contrario de lo que hace la linea. El arbol lo usa en las herramientas
     * y en las pruebas de contrato.
     */
    ignoreRestSiblings: true,
  }],

  /*
   * `case` que se cae al siguiente sin `break`. En este arbol hay switches por
   * sistema y por estado de senal, y ahi un fallo asi no da error: devuelve la
   * banda de OTRA maquina.
   */
  'no-fallthrough': 'error',

  /*
   * `if (a = b)`. Nunca es lo que se queria escribir, y en una comparacion de
   * umbrales pasa desapercibido porque el resultado es "verdad" casi siempre.
   *
   * Se deja en el modo por defecto (`except-parens`) y NO en `always`: el
   * arbol usa cuatro veces el idioma `while ((m = re.exec(texto)) !== null)`
   * para recorrer coincidencias, que es la forma canonica de hacerlo en JS y
   * declara la intencion con los propios parentesis. `always` obligaria a
   * reescribir esos cuatro bucles peor para callar una regla que ahi no esta
   * atrapando nada.
   */
  'no-cond-assign': 'error',

  /*
   * Un caracter de control dentro de una expresion regular es casi siempre un
   * error de escritura... salvo cuando se busca EXACTAMENTE eso. Aqui se busca:
   * `test/demo-eva/exportar.test.js` comprueba que la exportacion a CSV no deja
   * pasar un byte nulo. La regla no distingue los dos casos, y el que este
   * arbol tiene es el legitimo.
   */
  'no-control-regex': 'off',

  /*
   * Una promesa sin `await` en un sitio donde se esperaba el valor devuelve
   * `Promise { pending }`, que no es `null` ni un numero: es "verdadero" en un
   * `if` y se pinta como `[object Promise]`. Es el fallo que mas se parece a
   * los que este proyecto persigue —la ausencia de dato disfrazada de algo.
   */
  'require-atomic-updates': 'off',
  'no-async-promise-executor': 'error',
  'no-await-in-loop': 'off',

  /* `console` es la salida legitima de los verificadores; el servidor usa pino. */
  'no-console': 'off',

  /*
   * Un bloque `catch {}` que se traga el error a proposito es un patron
   * deliberado y documentado en este arbol (el parseo de un trozo SSE mal
   * formado, la carpeta de PDF que no existe). No se marca.
   */
  'no-empty': ['error', { allowEmptyCatch: true }],
}

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'react-dashboard/dist/**',
      'dist-release/**',
      'Documentos/**',
      'Documentacion/**',
      'datos/**',
      '.claude/**',
      '.agents/**',
      '.impeccable/**',
    ],
  },

  /* ── Dominio compartido: la capa con frontera propia ──────────────── */
  {
    files: ['shared/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      /*
       * Deliberadamente NO se declaran los globales del navegador NI los de
       * Node. Lo unico que hay es el nucleo del lenguaje, que es exactamente
       * la promesa de esta carpeta: si un archivo de aqui usa `process`,
       * `Buffer` o `window`, el linter lo marca como "no definido" — que es la
       * verdad desde el punto de vista de la mitad de sus consumidores.
       */
      globals: {
        ...globals.es2021,
        /*
         * `atob` y `btoa` son la excepcion, y se declaran una a una en vez de
         * abrir la puerta a los globales del navegador enteros.
         *
         * `vibraciones.js` codifica y descodifica en base64 el arreglo de
         * vigilancia que publica el modulo SM 1281. Las dos funciones existen
         * como global TANTO en el navegador COMO en Node desde la 16, asi que
         * usarlas no rompe la promesa de esta carpeta —se sigue pudiendo
         * importar desde los dos lados sin arrancar nada—, que es lo que la
         * regla protege. Lo que no se puede es dar por buenos `window` o
         * `fetch` por el mismo camino, y por eso van una a una.
         */
        atob: 'readonly',
        btoa: 'readonly',
      },
    },
    rules: {
      ...REGLAS_COMUNES,
      'no-restricted-globals': ['error', ...PROHIBIDO_EN_DOMINIO],
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['react', 'react-dom', 'react/*', '@/**'],
            message:
              'shared/ no conoce React ni el arbol del frontend (CLAUDE.md §2.7). La presentacion ' +
              'importa del dominio; el dominio no importa de la presentacion.',
          },
          {
            group: ['node:*', 'fs', 'path', 'crypto'],
            message:
              'shared/ tiene que poder importarse tambien desde el navegador (CLAUDE.md §2.7). Lo ' +
              'que necesita el sistema de archivos vive en backend/.',
          },
        ],
      }],
    },
  },

  /* ── Servidor puente ──────────────────────────────────────────────── */
  {
    files: ['backend/**/*.mjs', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: REGLAS_COMUNES,
  },

  /* ── Tablero ──────────────────────────────────────────────────────── */
  {
    files: ['react-dashboard/src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks, react },
    rules: {
      ...REGLAS_COMUNES,
      /*
       * Las dos que de verdad importan de react-hooks, y por que estan en el
       * nivel en el que estan:
       *
       *  - `rules-of-hooks` es ERROR: un hook dentro de un `if` no falla en la
       *    pantalla que lo estrena, falla en la que se monta despues.
       *  - `exhaustive-deps` es AVISO: este arbol tiene tres supresiones
       *    DELIBERADAS y razonadas en `hooks.js` (la marca de tiempo como
       *    dependencia real de un buffer mutable, y la clave por valor de un
       *    rango que es un objeto nuevo en cada render). Ponerlo en error
       *    obligaria a mantener esas supresiones para siempre; en aviso, sigue
       *    contando los casos nuevos sin bloquear.
       */
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      /*
       * La UNICA regla que se toma de `eslint-plugin-react`, y hace falta.
       *
       * El analizador de ambitos de ESLint no cuenta `<Vista />` como un uso
       * de `Vista`: para el, un `JSXIdentifier` no es una referencia. Sin
       * esto, cualquier componente que solo se use en JSX sale como "definido
       * y nunca usado" — y la salida obvia es apagar `no-unused-vars` en el
       * frontend, que es justo donde mas hace falta.
       *
       * El resto del plugin (las reglas de estilo de JSX, las de propTypes)
       * se queda fuera a proposito: este archivo no vigila estilo.
       */
      'react/jsx-uses-vars': 'error',
    },
  },

  /* ── Pruebas: mismas reglas, mas los globales de vitest ───────────── */
  {
    files: ['**/test/**/*.{js,jsx,mjs}', '**/*.test.{js,jsx,mjs}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser, ...globals.vitest },
    },
  },
]
