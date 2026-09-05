# Pruebas del frontend y dominio

Desde `react-dashboard/`, ejecuta `npm test` o `npm run test:watch`.
Vitest utiliza el entorno Node por defecto; los archivos que requieren DOM
declaran `// @vitest-environment jsdom`. No existe un setup global de
ResizeObserver o matchMedia: las vistas que lo requerían ya no forman parte
de la aplicación.

| Carpeta | Cobertura |
|---|---|
| `app/` | Una sola vista y ciclo de temas. |
| `auth/` | Login, caducidad de sesión y SSO silencioso. |
| `dominio/` | Reglas de shared/eva, registro, rangos y ausencia de datos. |
| `features/asistente/` | Conversación, cancelación, reintento, persistencia, traza, voz y paneles. |
| `lib/` | Saneamiento, concurrencia y contrato del cliente ICONICS. |

`a11y.js` ejecuta axe-core para detectar problemas graves de accesibilidad.
Cada prueba coloca sus dobles de servicios junto al comportamiento que verifica.
Las pruebas unitarias no requieren ICONICS, Whisper ni el modelo reales.

La suite del backend está en `backend/test/`; los verificadores que levantan
servidores simulados están descritos en [docs/README.md](../../../docs/README.md).
Para cambios de frontend, comprueba también el build y el presupuesto del bundle.
