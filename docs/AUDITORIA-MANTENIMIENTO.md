# Revisión de documentación y código sin uso

Revisión de la rama Asistente realizada el 4 de septiembre de 2026.

## Cambios

- Actualizados los README principal, backend, frontend, dominio y pruebas.
- Revisadas la guía de mantenimiento, la plantilla del entorno y las descripciones de producto/diseño.
- Añadidos un índice documental y el inventario de dependencias directas.
- Identificados los planes y backlogs como antecedentes históricos; se conservan sus decisiones originales.
- Simplificados comentarios obsoletos de composición, herramientas, PDF, autenticación,
  configuración, accesibilidad y scripts.
- Retirados imports y constantes sin referencias, un estilo de interfaz sin consumidor,
  los rellenos de pruebas de las gráficas retiradas y el cálculo de versión frontend sin consumidor.
- Retirados shared/modulos.js y su verificador: sólo se referenciaban entre sí,
  sin integración en la aplicación. La separación de sistemas ICONICS sigue en el dominio.
- Retirada exigirRol, que devolvía una función vacía. Las guardas de sesión,
  solo lectura y carga documental siguen presentes; no existían roles locales efectivos.
- Retiradas opciones y mensajes de prototipos que scripts/dev.ps1 exportaba sin consumidores.
- Retirado el recorrido de chunks cuyo resultado no usaba verificar-bundle; se mantienen
  la inspección de librerías excluidas y los presupuestos efectivos.
- Corregida la liberación de respuestas de login y el cierre de conexiones del verificador HTTP,
  que demoraban su finalización después de completar las aserciones.

## Evidencia y límites

Se revisaron imports estáticos, imports dinámicos literales, reexports y referencias
léxicas mediante el parser de JavaScript/JSX. Se contrastaron consumidores en
aplicación, scripts y pruebas. Esto no prueba la ausencia de clientes externos:
por ese motivo se conservan las rutas HTTP compatibles, incluido /api/context.

Las librerías instaladas y las herramientas locales de terceros no se modificaron.
No se ejecutaron sondas contra la planta ni operaciones de escritura industrial.

## Validación

- Backend: 202 pruebas aprobadas en 13 archivos.
- Frontend: 189 pruebas aprobadas en 20 archivos.
- Compilación de producción y verificador de bundle aprobados.
- Verificador HTTP: 74 comprobaciones aprobadas.
- Verificadores de herramientas, sesión, chat, diagnóstico, documentos, casos,
  cierre de casos, temporal, calibración, riesgos de ambas instalaciones,
  pronóstico, aprendizaje, voz, manos libres y transporte simulado aprobados.
- Sintaxis de scripts/dev.ps1 comprobada con el parser de PowerShell, sin arrancar procesos.
- 42 enlaces locales de las guías vigentes comprobados.
- git diff --check sin errores.

Las suites emiten avisos de deprecación de Fastify/Vite y de APIs no implementadas
por jsdom; no impidieron las pruebas. No se actualizaron dependencias en esta limpieza.
