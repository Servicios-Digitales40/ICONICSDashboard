/**
 * Plantilla «Reporte de riesgos» (Plan 44 F4), transcrita de
 * `docs/plantillas-reportes/riesgos.docx`: matriz P×I, principales riesgos,
 * plan de mitigación, riesgo residual y aprobaciones.
 *
 * ── LA MATRIZ, Y POR QUÉ NO SALE ENTERA ─────────────────────────────
 *
 * La maqueta pone cada riesgo en una celda de una rejilla 5×5. El motor no
 * produce esos dos números: produce un nivel. Con D15 —confirmada por el
 * usuario el 23-09-2026— se llenan así, y el PDF lo dice al pie de la
 * sección para que nadie los lea como si fueran una medida de planta:
 *
 *   impacto        lo DECLARA la regla del tipo (`impacto: 1–5`). Si una no
 *                  lo declara, lo hereda de su nivel y el pie lo avisa.
 *   probabilidad   se OBSERVA en el período: la fracción del tiempo en que
 *                  la condición de la regla estuvo activa en el historiador.
 *
 * Un riesgo cuyas señales no están historizadas NO entra en la rejilla: sale
 * en una sección propia con el motivo. Es lo mismo que hace el dominio con
 * sus `noEvaluables`, y por la misma razón — una matriz que sitúa nueve de
 * once riesgos y calla los otros dos transmite una calma que no le toca.
 *
 * Lo de gestión de la maqueta (control, responsable, estado, riesgo
 * residual) no sale de planta y se deja para llenar a mano (D3).
 */
import { firmasDe, nombreDeGrupo, parrafosDeCierre } from './comun.mjs'
import { LADO_MATRIZ, claveDeRiesgo } from '../../../../shared/eva/comun/matrizRiesgo.js'

/** El nivel de un riesgo, con el rótulo del catálogo común. */
const nivelDe = (r, c) => c.nivel[r.nivel] ?? r.nivel

export default {
  id: 'riesgos',
  folioPrefijo: 'RIE',
  disponible: true,
  portada: { arte: 'riesgos', disposicion: 'lateral' },
  /* Enciende la observación de frecuencias en el recolector: es la única
     plantilla que la necesita, y cuesta una serie por señal de cada regla. */
  observaRiesgos: true,

  /** Sin gráficas propias: esta plantilla no dibuja tendencias. */
  claves: () => [],

  documento(d, { etq, idioma, entrada, ventana, generadoEl, explicacion, usuario }) {
    const t = etq.plantillas.riesgos
    const c = etq.plantillas.comun
    const activos = d.riesgos?.activos ?? []
    const matriz = d.matriz
    const celdas = matriz?.celdas ?? []
    const puntoDe = (r) => (r.canal ? nombreDeGrupo(d.grupos, r.canal, idioma) : c.todaLaMaquina)

    /* La fila de un riesgo situado: sus dos números y de dónde salieron. */
    const filaPrincipal = (celda) => {
      const riesgo = activos.find((r) => claveDeRiesgo(r) === celda.clave) ?? {}
      const pct = (celda.fraccion * 100).toFixed(celda.fraccion < 0.01 ? 2 : 0)
      return {
        color: celda.severidad,
        celdas: {
          riesgo: celda.titulo,
          punto: puntoDe(riesgo),
          probabilidad: `${celda.probabilidad} — ${t.fraccionDelPeriodo(pct, celda.cobertura?.evaluados ?? 0)}`,
          impacto: `${celda.impacto}${celda.impactoDeclarado ? '' : ' *'}`,
          nivel: nivelDe(riesgo, c),
          estado: t.activo,
        },
      }
    }

    /* Los que no se pueden situar: se listan con el motivo, nunca con un
       número inventado para que la tabla quede cuadrada. */
    const filasSinObservar = (matriz?.sinObservar ?? []).map((s) => {
      const riesgo = activos.find((r) => claveDeRiesgo(r) === s.clave) ?? {}
      return {
        color: riesgo.nivel ?? null,
        celdas: {
          riesgo: s.titulo,
          punto: puntoDe(riesgo),
          nivel: nivelDe(s, c),
          impacto: `${s.impacto}${s.impactoDeclarado ? '' : ' *'}`,
          motivo: s.motivo,
        },
      }
    })

    /* El plan de mitigación: una fila por riesgo activo con acción, en el
       orden del dominio (lo grave primero). Control y responsable en blanco. */
    const filasMitigacion = activos
      .filter((r) => r.accion)
      /* Con el PUNTO: una regla de apoyo produce tres riesgos con la misma
          acción, y sin decir de qué apoyo es cada uno las tres filas parecen
          un error de copiado (visto contra planta, F7). */
      .map((r, i) => ({
        color: r.nivel,
        celdas: { numero: String(i + 1), punto: puntoDe(r), accion: r.accion, control: r.norma ?? null, responsable: null, estado: null },
      }))

    const pieMatriz = [t.pieMatriz, matriz?.algunoHeredado ? t.pieHeredado : null].filter(Boolean).join(' ')

    return {
      titulo: t.titulo,
      lema: t.lema,
      instalacion: entrada.nombre,
      chips: [
        { etiqueta: c.chipSistema, valor: entrada.nombre },
        { etiqueta: c.chipPeriodo, valor: ventana.etiqueta },
        { etiqueta: c.chipGenerado, valor: generadoEl },
      ],
      generadoEl: null,
      secciones: [
        { id: 'matriz', titulo: t.secciones.matriz, bloque: 'matriz',
          celdas, lado: LADO_MATRIZ, ejeX: t.ejeProbabilidad, ejeY: t.ejeImpacto, pie: pieMatriz,
          /* El motivo es una FRASE, no el título de la sección de al lado:
             con riesgos activos pero ninguno observable, decirlo así. */
          ...(celdas.length ? {} : { ausente: activos.length ? t.ningunoObservable : t.sinRiesgos }) },

        { id: 'principales', titulo: t.secciones.principales, bloque: 'tabla',
          columnas: [
            { clave: 'riesgo', titulo: t.columnas.riesgo, ancho: 2.4 },
            /* El nombre de un apoyo («Rodamiento intermedio») es la palabra
               más larga de la columna: por debajo de esto se parte. */
            { clave: 'punto', titulo: t.columnas.punto, ancho: 1.5 },
            { clave: 'probabilidad', titulo: t.columnas.probabilidad, ancho: 2 },
            /* «Impacto» e «Informativo» son las dos palabras largas de esta
               tabla: sus columnas se miden por el título y por el rótulo de
               nivel más largo, no por el número que llevan dentro. */
            { clave: 'impacto', titulo: t.columnas.impacto, ancho: 1.1, align: 'right' },
            { clave: 'nivel', titulo: t.columnas.nivel, ancho: 1.5, estado: true },
            { clave: 'estado', titulo: t.columnas.estado, ancho: 0.9 },
          ],
          filas: celdas.map(filaPrincipal),
          /* Mismo reparto que la matriz: «no hay riesgos» y «los hay pero
             ninguno se puede observar» son dos cosas distintas, y decir la
             primera habiendo cinco activos sería tranquilizar sin motivo. */
          ...(celdas.length ? {} : { ausente: activos.length ? t.ningunoObservable : t.sinRiesgos }) },

        { id: 'sin-observar', titulo: t.secciones.sinObservar, bloque: 'tabla',
          columnas: [
            { clave: 'riesgo', titulo: t.columnas.riesgo, ancho: 2.2 },
            { clave: 'punto', titulo: t.columnas.punto, ancho: 1.5 },
            { clave: 'nivel', titulo: t.columnas.nivel, ancho: 1.5, estado: true },
            { clave: 'impacto', titulo: t.columnas.impacto, ancho: 1.1, align: 'right' },
            { clave: 'motivo', titulo: t.columnas.motivo, ancho: 3.2 },
          ],
          filas: filasSinObservar },

        { id: 'mitigacion', titulo: t.secciones.mitigacion, bloque: 'tabla',
          columnas: [
            { clave: 'numero', titulo: t.columnas.numero, ancho: 0.6, align: 'right' },
            { clave: 'punto', titulo: t.columnas.punto, ancho: 1.4 },
            { clave: 'accion', titulo: t.columnas.accion, ancho: 3 },
            { clave: 'control', titulo: t.columnas.control, ancho: 1.7 },
            { clave: 'responsable', titulo: t.columnas.responsable, ancho: 1.6 },
            { clave: 'estado', titulo: t.columnas.estado, ancho: 1 },
          ],
          filas: filasMitigacion,
          pie: t.pieMitigacion },

        { id: 'residual', titulo: t.secciones.residual, bloque: 'texto',
          parrafos: parrafosDeCierre({ sintesis: t.residualSinCriterio, explicacion, etq }) },

        { id: 'firmas', titulo: t.secciones.firmas, bloque: 'firmas', items: firmasDe(etq, usuario) },
      ],
    }
  },
}
