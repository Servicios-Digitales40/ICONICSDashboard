import { defineConfig } from 'vitest/config'

/**
 * Pruebas del backend.
 *
 * Entorno `node` y no `jsdom`: aquí no hay DOM que simular, y montar uno por
 * archivo multiplicaría el tiempo de arranque sin que ninguna prueba lo use.
 * El frontend tiene su propia configuración en `react-dashboard/`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.mjs'],
    /*
     * Las pruebas montan la app entera con `inject()`, que no abre puertos
     * pero sí construye los índices y clientes. Un solo proceso evita que dos
     * archivos compitan por el mismo directorio temporal de reportes.
     */
    pool: 'forks',
    maxWorkers: 1,
  },
})
