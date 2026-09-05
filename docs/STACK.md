# Stack y dependencias directas

Inventario de los package.json de esta rama. Los rangos declarados no garantizan
la versión instalada; no se enumeran las dependencias transitivas.

## Frontend

### Ejecución

| Paquete | Rango declarado | Uso |
|---|---|---|
| @tanstack/react-query | ^5.102.8 | Consultas y caché de Assets |
| dompurify | ^3.4.14 | Saneamiento HTML |
| lucide-react | ^0.383.0 | Iconos |
| marked | ^18.0.10 | Markdown |
| react | ^18.3.1 | Componentes de interfaz |
| react-dom | ^18.3.1 | Renderizado DOM |

### Desarrollo

| Paquete | Rango declarado | Uso |
|---|---|---|
| @testing-library/react | ^16.3.2 | Pruebas de componentes |
| @vitejs/plugin-react | ^4.3.1 | JSX y Fast Refresh |
| axe-core | ^4.13.0 | Accesibilidad |
| jsdom | ^29.1.1 | DOM de pruebas |
| vite | ^5.4.21 | Desarrollo y build |
| vitest | ^4.1.10 | Pruebas |

## Backend

### Ejecución

| Paquete | Rango declarado | Uso |
|---|---|---|
| @fastify/cookie | ^11.1.2 | Cookies |
| @fastify/cors | ^11.3.0 | Orígenes HTTP |
| @fastify/helmet | ^13.1.1 | Cabeceras de seguridad |
| @fastify/rate-limit | ^11.2.0 | Límite de solicitudes |
| @fastify/static | ^10.1.3 | Archivos estáticos |
| @fastify/swagger | ^9.8.1 | OpenAPI |
| @fastify/swagger-ui | ^6.1.1 | Interfaz de API |
| fastify | ^5.12.1 | API HTTP |
| fastify-plugin | ^6.0.0 | Plugins |
| fastify-type-provider-zod | ^7.0.0 | Integración de esquemas |
| pdfjs-dist | ^6.3.289 | Extracción PDF |
| pdfkit | ^0.15.0 | Generación PDF |
| pino | ^10.3.1 | Logs estructurados |
| svg-to-pdfkit | ^0.1.8 | SVG en PDF |
| zod | ^4.5.4 | Validación |

### Desarrollo

| Paquete | Rango declarado | Uso |
|---|---|---|
| pino-pretty | ^13.1.3 | Logs en terminal |
| vitest | ^4.1.11 | Pruebas |

## Lenguajes y servicios

- JavaScript ESM y JSX; HTML y CSS para presentación. No hay TypeScript en el código de aplicación.
- Python con asyncua para la sonda OPC UA; PowerShell para operación local.
- Node.js y npm; shared/ es JavaScript puro sin dependencias.
- ICONICS FrameWorX REST, AssetWorX y Hyper Historian.
- OIDC + PKCE, cookies HttpOnly y SSE.
- llama.cpp/llama-server con modelos GGUF; embeddings opcionales.
- whisper.cpp/whisper-server y síntesis de voz del navegador.
- BM25 implementado en el proyecto; PDF.js para PDF y extracción propia para DOCX.
- Archivos JSON y PDF, sesiones en memoria y localStorage; no hay servidor de base de datos.
- Impeccable 3 se invoca con npx en los scripts design:detect, sin dependencia fijada en el manifiesto.

## Compatibilidad del entorno

La instalación revisada usa Node 22.16.0. PDF.js requiere Node >=22.13 o >=24;
jsdom admite ^20.19, ^22.13 o >=24, y Vitest ^20, ^22 o >=24.
Para todo el proyecto utiliza Node 22.13+ de la serie 22 o una serie compatible
posterior; no uses la antigua indicación Node 18 del tablero.

Los servicios de IA y la librería Python no tienen versión fijada por los
package.json. Comprueba sus contratos antes de actualizar binarios.
