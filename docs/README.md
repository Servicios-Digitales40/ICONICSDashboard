# Documentación del proyecto

## Referencias vigentes

| Documento | Contenido |
|---|---|
| [README principal](../README.md) | Producto, arranque y despliegue. |
| [Backend](../backend/README.md) | Configuración, API, sesión y persistencia. |
| [Frontend](../react-dashboard/README.md) | Estructura, desarrollo y build. |
| [Dominio](../shared/README.md) | Sistemas y límites de cobertura. |
| [Stack](STACK.md) | Dependencias directas y tecnologías. |
| [Auditoría de mantenimiento](AUDITORIA-MANTENIMIENTO.md) | Limpieza realizada, evidencia y validación. |
| [Pruebas de frontend](../react-dashboard/src/test/README.md) | Organización de la suite. |
| [CLAUDE.md](../CLAUDE.md) | Reglas de mantenimiento. |
| [PRODUCT.md](../PRODUCT.md), [DESIGN.md](../DESIGN.md) | Producto y diseño. |
| [.env.example](../.env.example) | Plantilla del entorno sin secretos. |

## Verificación local

Desde la raíz, con las dependencias de ambos paquetes instaladas:

```powershell
npm --prefix backend test
npm --prefix react-dashboard test
npm --prefix react-dashboard run build
node scripts/verificar-bundle.mjs
```

Los siguientes verificadores usan datos o servicios simulados. Algunos abren
puertos de loopback, pero no requieren ICONICS, Whisper o un modelo reales:

- API y sesión: `verificar-backend`, `verificar-sesion`, `verificar-chat`.
- Herramientas y transporte: `verificar-herramientas`, `verificar-transporte-falso`.
- Diagnóstico: `verificar-diagnostico`, `verificar-casos`, `verificar-casos-cierre`,
  `verificar-temporal`, `verificar-calibracion`.
- Dominio: `verificar-riesgos`, `verificar-riesgos-vibracion`, `verificar-pronostico`.
- Documentación y memoria: `verificar-documentos`, `verificar-aprendizaje`.
- Voz: `verificar-voz`, `verificar-manos-libres`.

Cada nombre corresponde a `scripts/<nombre>.mjs`, ejecutable con Node.
`verificar-bundle.mjs` requiere haber compilado antes. No ejecutes todos los
archivos de scripts con un comodín: también hay sondas y mantenimiento de datos.

## Herramientas que requieren servicios o alteran datos

- `verificar-antiguedad-historico.mjs`, `comprobar-historia-vibraciones.mjs`,
  `comprobar-historial-alarmas.mjs` y `sondear-paginacion-historico.mjs`:
  sondas de la instalación; consulta su cabecera y carga el entorno requerido.
- `medir-calibracion.mjs`, `medir-narracion.mjs`, `comparar-modelos.mjs`:
  mediciones con servidores de IA, no pruebas unitarias.
- `plc_opcua.py`: lectura y exploración directa OPC UA con asyncua.
- `revisar-propuestas.mjs`, `purgar-casos-invalidos.mjs`:
  mantenimiento del conocimiento; revisa los argumentos antes de ejecutarlos.
- `generar-historia-simulada.mjs`: generación de datos de demostración.
- Scripts PowerShell: arranque/parada local, IA, Whisper y exposición de puertos.

## Límites pendientes comprobables en el código

- La resolución de señales de varias herramientas históricas sigue centrada en
  el tanque; historia básica de vibraciones no implica cobertura completa.
- Vibraciones no declara mecanismos de desgaste; sus limitaciones del catálogo
  deben aparecer en las respuestas.
- No existe OCR para documentos escaneados ni una base de datos persistente de sesiones.
- El frontend no incluye la antigua vista de predicción de compresor.
- Los gráficos SVG generados por el servidor tienen consideraciones visuales
  propias descritas al final de DESIGN.md.

## Planes y propuestas históricas

Los archivos `PLAN-*.md`, `BACKLOG-*.md`, `DEMO-MODULOS.md` y
`MEJORAS-ASISTENTE.md` conservan el contexto de sus fechas. Sus nombres de
archivos, estados y métricas pueden corresponder a código retirado; no son el
inventario actual ni una lista validada de pendientes.

El [Plan 20](PLAN-20-ASISTENTE.md) conserva las decisiones de la transición al
asistente y los detalles de integración SSO. Las guías vigentes prevalecen para
arranque y estructura. No se restauran capacidades antiguas por aparecer en un plan.
