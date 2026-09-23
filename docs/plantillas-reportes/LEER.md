# Maquetas de los reportes del asistente (Plan 44)

Ocho documentos Word, uno por tipo de reporte que `generar_reporte` sabe
componer. Son la **especificación visual**: qué secciones lleva cada tipo, en
qué orden, con qué columnas y con qué portada. **El código no los lee**: el
PDF se dibuja con pdfkit desde `backend/ia/reportes/plantillas/<tipo>.mjs`,
que transcribe cada maqueta a bloques (Plan 44, D1 y D2). El arte de cada
portada vive aparte, en `backend/ia/marca/portadas/<tipo>.png`, porque ése sí
lo lee el compositor.

| `tipo` | Maqueta | Entregada como |
|---|---|---|
| `tecnico` | `tecnico.docx` | `02_Reporte_Tecnico_TDCON_Premium.docx` |
| `vibraciones` | `vibraciones.docx` | `04_Reporte_de_Vibraciones_CMS_TDCON_Premium.docx` |
| `lectura-de-sensores` | `lectura-de-sensores.docx` | `05_Reporte_de_Lectura_de_Sensores_TDCON_Premium_HQ.docx` |
| `riesgos` | `riesgos.docx` | `06_Reporte_de_Riesgos_TDCON_Premium.docx` |
| `alarmas` | `alarmas.docx` | `03_Reporte_de_Alarmas_TDCON_Premium.docx` |
| `ingenieria` | `ingenieria.docx` | `01_Reporte_de_Ingenieria_TDCON_Premium.docx` |
| `energias` | `energias.docx` | `08_Reporte_de_Energias_Flujo_y_Electricidad_TDCON_Premium.docx` |
| `predicciones` | `predicciones.docx` | `07_Reporte_de_Predicciones_Energia_y_Fallas_TDCON_Premium.docx` |

Los valores que traen («Nivel 78 %», «Bomba P-101», «12 críticas») son
**relleno de ejemplo**, no datos: ninguno se copia al PDF. Una sección cuya
fuente no exista en la máquina se dibuja diciendo por qué (Plan 44, D3).

Pesan 18,4 MB entre los ocho porque cada uno lleva dentro su arte a tamaño
completo (2,2–2,8 MB). Se versionan igual por decisión del usuario del
23-09-2026: son la plantilla de la que sale cada reporte y tienen que viajar
con el repo. Si alguien cambia una maqueta, cambia también el módulo
`plantillas/<tipo>.mjs` que la transcribe, en el mismo commit.
