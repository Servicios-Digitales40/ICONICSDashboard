# Guía de mantenimiento del proyecto

Esta guía describe la rama Asistente. El código y sus pruebas son la referencia
de comportamiento; las discrepancias documentales deben corregirse al cambiarlo.

## Arquitectura y reglas

1. Los sensores de planta se leen mediante ICONICS FrameWorX, en
   `backend/iconics/client.mjs`. El script OPC UA es una herramienta de diagnóstico independiente.
2. Tanque y vibraciones son instalaciones separadas con PLC distintos.
   No se mezclan sus datos ni se incorporan fuentes externas al registro ICONICS.
3. El código calcula riesgos, bandas y puntuaciones; el modelo selecciona herramientas y redacta.
4. Una lectura ausente, mala calidad o histórico sin muestras se representa como hueco, nunca como cero.
5. Toda limitación de datos y todo umbral provisional debe declararse en el resultado.
6. Las reglas compartidas viven en `shared/`: JavaScript puro, sin red, React ni DOM.
7. La persistencia usa archivos locales y sesiones en memoria; no hay base de datos ni vector DB.
8. `ICONICS_FAKE` es exclusivo de desarrollo. Producción requiere HTTPS y certificados válidos.
9. CORS y frame-ancestors se configuran explícitamente; no se admiten comodines de despliegue.
10. La agrupación del tanque en cuatro activos es derivada por la aplicación, no publicada por ICONICS.
11. Las rutas de negocio requieren sesión. Salud, consulta/inicio/cierre de sesión
    y el intercambio de SSO tienen contratos propios en sus módulos de rutas.
12. La interfaz tiene una conversación y paneles Assets, Manuales y Casos, sin router de páginas.

ICONICS autoriza escrituras con el token de cada usuario. `ICONICS_READ_ONLY`
es una restricción adicional del puente. No hay roles locales; no se añaden
guardas vacías que aparenten aplicar permisos. La carga documental tiene su
propio interruptor `RAG_UPLOAD_ENABLED`.

## Estructura y convenciones

- `backend/`: Fastify, sesiones, cliente ICONICS, IA, documentos y rutas HTTP.
- `react-dashboard/src/`: app, autenticación, asistente, componentes, transporte y temas.
- `shared/eva/{tanque,vibraciones,comun}/`: catálogos y reglas de dominio.
- `scripts/`: operación, verificadores y sondas.
- `docs/`: referencias actuales y antecedentes históricos identificados.

Los comentarios se escriben en español y explican contratos, limitaciones o
decisiones no evidentes. Evita cronologías de refactorizaciones, listas de
archivos borrados y explicaciones que sólo repiten la instrucción siguiente.
Conserva la procedencia de límites industriales y las advertencias de series
incorrectas. Una cabecera breve basta para un módulo no trivial.

Usa alias `@` y `@shared` en el frontend según `vite.config.js` y
`jsconfig.json`; en el backend usa rutas relativas. No dupliques el dominio.
Antes de borrar una exportación comprueba consumidores, reexports, carga
dinámica, scripts, pruebas y contratos externos. Una ruta HTTP no está muerta
sólo porque el frontend no la llame.

## Verificación

Desde la raíz:

```powershell
npm --prefix backend test
npm --prefix react-dashboard test
npm --prefix react-dashboard run build
node scripts/verificar-bundle.mjs
```

Un cambio en `backend/ia/` ejecuta `verificar-herramientas.mjs` y los
verificadores del área afectada. Un cambio en dominio común verifica ambos
sistemas. Los verificadores y las sondas que requieren servicios reales se
distinguen en [docs/README.md](docs/README.md).

Los cambios visuales ejecutan además `npm --prefix react-dashboard run design:detect`.
No se cambian cifras esperadas ni umbrales para ocultar una regresión.

## Entrega

Documenta resultados, limitaciones y pruebas ejecutadas. No hagas push sin una
solicitud explícita. Las migraciones históricas están en los planes; no se usan
como inventario actual ni como requisito de restaurar pantallas retiradas.

Referencias: [README](README.md), [backend](backend/README.md),
[frontend](react-dashboard/README.md), [dominio](shared/README.md),
[producto](PRODUCT.md), [diseño](DESIGN.md), [índice documental](docs/README.md).
