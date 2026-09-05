# Dominio compartido

Reglas y catálogos JavaScript ESM consumidos por el backend y las pruebas del
frontend. No usa React, DOM, fetch ni dependencias npm. El package.json sólo
declara el paquete como módulo; no requiere instalación.

## Organización

| Ubicación | Contenido |
|---|---|
| `valores.js`, `quality.js` | Valores válidos y calidad OPC. Un dato ausente o inválido no se convierte en cero. |
| `periodo.js` | Resolución de fechas, periodos y turnos. |
| `concurrencia.js` | Ejecución de tareas con concurrencia acotada. |
| `eva/tanque/` | Señales, activos derivados, estado, riesgos y simulación del tanque. |
| `eva/vibraciones/` | Catálogo de vibraciones, estado, riesgos y simulación. |
| `eva/comun/sistemas.js` | Registro de instalaciones y resolución de señales. |
| `eva/comun/estadoMaquina.js` | Forma común del estado y datos faltantes. |
| `eva/comun/historia.js`, `rango.js`, `estadistica.js`, `graficos.js` | Reglas de histórico, ventanas, análisis y gráficos SVG. |
| `eva/comun/pronostico.js` | Mecanismos de desgaste del tanque. |
| `eva/comun/umbrales.js`, `causas.js` | Bandas y catálogo de causas. |
| `eva/comun/manuales.js`, `casos.js`, `aprendizaje.js` | Contratos de documentos, casos y conocimiento. |

## Instalaciones disponibles

**Tanque:** ocho señales bajo `ac:TDCON/DEMO/SENSORES/`, agrupadas en
cuatro activos derivados por la aplicación. Nivel, temperatura, caudal,
presión y tensión tienen serie propia declarada. Carga del motor, modo del
variador y eficiencia no deben consultarse como históricos propios.
El dominio incluye diez reglas de riesgo y cinco mecanismos de desgaste.

**Vibraciones:** 73 puntos del motor, tres apoyos, variador y contadores del
área de alarmas. El registro declara 40 puntos con serie propia; excluye
`aPeak_S1`, cuya serie duplica otra medida, y estados no historizados.
Contiene 18 reglas de riesgo y no declara mecanismos de desgaste.
Las fechas y limitaciones de captura consignadas en el catálogo son evidencia
de puesta en marcha, no una verificación automática de la disponibilidad actual.

Cada sistema tiene su PLC. No se mezclan sus señales ni se infiere que
comparten equipos. Las herramientas históricas avanzadas todavía tienen
resolución de nombres centrada en el tanque; admitir historia básica en
vibraciones no implica cobertura completa de análisis, correlación y reportes.

Los límites provisionales y la falta de vigilancias/series se incluyen en las
respuestas. El registro es estático: añadir una máquina requiere modificar
código y reiniciar, no inyectarla en caliente.

## Añadir un sistema

1. Declara su catálogo de puntos, unidades y qué señales tienen historia propia.
2. Implementa parseo, simulación y proyección a estado común.
3. Añade la entrada a `eva/comun/sistemas.js`, con raíces, series y limitaciones.
4. Implementa y conecta riesgos y desgaste sólo si existen reglas verificables.
5. Ejecuta las pruebas de dominio y los verificadores de herramientas y transporte.

La validación del registro exige los campos de su contrato. El transporte falso
recorre ese registro; no debe crecer con ramas duplicadas por máquina.

## Importación y despliegue

El frontend usa `@shared/...`; el backend usa rutas relativas hacia `shared/`.
Esta carpeta debe viajar junto con `backend/` en la distribución.
Las pruebas están en `react-dashboard/src/test/dominio/` y `scripts/verificar-*.mjs`.
El antiguo registro de módulos de predicción se retiró porque ninguna ruta,
herramienta ni interfaz de esta rama lo consumía.
