#!/usr/bin/env node
/**
 * scripts/frecuencias-rodamiento.mjs
 * ------------------------------------------------------------------
 * Las frecuencias de defecto de un rodamiento, para configurar el SM 1281.
 *
 * ── QUÉ SON ESTOS NÚMEROS ──────────────────────────────────────────
 *
 * Un rodamiento tiene cuatro piezas que se pueden picar, y cada una golpea a
 * su propia frecuencia cuando el eje gira:
 *
 *   BPFO  cada vez que un elemento rodante pasa sobre un punto de la PISTA
 *         EXTERIOR. Es el defecto más común, porque esa pista está quieta y
 *         siempre recibe la carga en la misma zona.
 *   BPFI  lo mismo sobre la PISTA INTERIOR, que gira con el eje.
 *   BSF   el giro del propio ELEMENTO RODANTE sobre sí mismo.
 *   FTF   la vuelta de la JAULA que los separa. Sale muy baja, por debajo de
 *         la velocidad de giro, y suele indicar falta de lubricación.
 *
 * El módulo mira el espectro de envolvente EXACTAMENTE en esas frecuencias.
 * Por eso no dice «vibra más», dice «la pista exterior está picada». Y por eso
 * necesita la geometría: sin ella no sabe dónde mirar, y las deja apagadas.
 *
 * ── POR QUÉ EN ÓRDENES Y NO EN HERCIOS ─────────────────────────────
 *
 * Un orden es un múltiplo de la velocidad de giro, y no cambia con ella. Esta
 * máquina va con variador —se midió a 604 rpm y su nominal son 3475—, así que
 * en hercios habría que reconfigurarlo cada vez que cambie el régimen. En
 * órdenes se configura una vez y vale para todas las velocidades.
 *
 * Se imprimen también los hercios, pero sólo para comprobar después: si el
 * módulo enseña un pico donde dice la tabla, la configuración es correcta.
 *
 * ── LO QUE HAY QUE CONFIRMAR ANTES DE FIARSE ───────────────────────
 *
 * La geometría de abajo es la de catálogo para esas designaciones. **Varía
 * ligeramente entre fabricantes**, y un 2 % de error en el diámetro medio
 * desplaza el BPFI lo bastante como para que el módulo mire al lado del pico.
 * Antes de dar por buena una alarma de rodamiento, contrasta estos cuatro
 * números con la hoja del rodamiento que hay montado de verdad.
 *
 * ── USO ───────────────────────────────────────────────────────────
 *
 *   node scripts/frecuencias-rodamiento.mjs            a 604 y 3475 rpm
 *   node scripts/frecuencias-rodamiento.mjs 1800       a la velocidad que digas
 */
const c = {
  verde: '\x1b[32m', ambar: '\x1b[33m', gris: '\x1b[90m',
  negrita: '\x1b[1m', reset: '\x1b[0m',
}

/**
 * Geometría de catálogo, en milímetros.
 *
 *   z      número de elementos rodantes
 *   bd     diámetro del elemento rodante
 *   pd     diámetro medio (primitivo) del rodamiento
 *   alfa   ángulo de contacto, en grados. En un rígido de bolas es 0.
 */
const RODAMIENTOS = [
  { ref: '6205 ZZ', donde: 'S1 · lado acople', z: 9, bd: 7.938, pd: 39.04, alfa: 0 },
  { ref: '6206 ZZ', donde: 'S2 · rodamiento intermedio', z: 9, bd: 9.525, pd: 46.0, alfa: 0 },
  { ref: '6204 ZZ', donde: 'S3 · lado libre', z: 8, bd: 7.938, pd: 33.5, alfa: 0 },
]

/**
 * Los cuatro órdenes, de las fórmulas clásicas.
 *
 * Todo cuelga de la relación `bd/pd`: es lo que decide cuánto se «adelanta» o
 * se «retrasa» el paso de los elementos respecto al giro del eje.
 */
function ordenes({ z, bd, pd, alfa }) {
  const r = (bd / pd) * Math.cos((alfa * Math.PI) / 180);
  return {
    BPFO: (z / 2) * (1 - r),
    BPFI: (z / 2) * (1 + r),
    BSF: (pd / (2 * bd)) * (1 - r * r),
    FTF: (1 / 2) * (1 - r),
  };
}

const rpms = process.argv.length > 2
  ? process.argv.slice(2).map(Number).filter(Number.isFinite)
  : [604, 3475];

console.log(`\n${c.negrita}Frecuencias de defecto de rodamiento${c.reset}`);
console.log(`${c.gris}Los ÓRDENES son lo que se configura: no cambian con la velocidad.`);
console.log(`Los hercios son para comprobar después, mirando dónde sale el pico.${c.reset}`);

for (const b of RODAMIENTOS) {
  const o = ordenes(b);
  console.log(`\n${c.negrita}${b.ref}${c.reset}  ${c.gris}${b.donde}${c.reset}`);
  console.log(`${c.gris}  geometría: ${b.z} elementos · bola ${b.bd} mm · medio ${b.pd} mm · contacto ${b.alfa}°${c.reset}`);
  console.log(`\n  ${'defecto'.padEnd(34)} ${'ORDEN'.padStart(8)}   ${rpms.map((r) => `${r} rpm`.padStart(11)).join('')}`);

  const filas = [
    ['BPFO · pista exterior picada', o.BPFO],
    ['BPFI · pista interior picada', o.BPFI],
    ['BSF  · elemento rodante dañado', o.BSF],
    ['FTF  · jaula o falta de lubricación', o.FTF],
  ];
  for (const [nombre, orden] of filas) {
    const hz = rpms.map((r) => `${(orden * (r / 60)).toFixed(1)} Hz`.padStart(11)).join('');
    console.log(`  ${nombre.padEnd(34)} ${c.verde}${orden.toFixed(4).padStart(8)}${c.reset}   ${c.gris}${hz}${c.reset}`);
  }
}

console.log(`\n${c.ambar}${c.negrita}Antes de fiarte de una alarma de rodamiento:${c.reset}`);
console.log('la geometría de arriba es de catálogo y varía algo entre fabricantes.');
console.log('Un 2 % de error en el diámetro medio desplaza el BPFI lo bastante');
console.log('como para que el módulo mire al lado del pico. Contrástala con la');
console.log('hoja del rodamiento que hay montado de verdad.\n');
