# Frontend del asistente

React 18 y Vite 5. La aplicación presenta el estado de comprobación de sesión,
el login o una conversación. No usa un router de páginas. Assets, Manuales y
Casos se abren como paneles laterales cargados bajo demanda.

## Desarrollo

Instala las dependencias y arranca el backend según el [README principal](../README.md).
Desde esta carpeta:

```powershell
npm install
npm run dev
npm test
npm run build
npm run preview
```

Desarrollo usa el puerto 5173 y preview el 4173; ambos reenvían `/api` a
`http://127.0.0.1:3001`, escuchan en todas las interfaces y exigen su puerto.
El modo simulado se configura en el backend con `ICONICS_FAKE`.

## Estructura

| Carpeta | Responsabilidad |
|---|---|
| `src/app/` | Composición, límite de errores, modales y avisos. |
| `src/auth/` | Login, sesión y SSO silencioso. |
| `src/features/asistente/` | Conversación, audio, adjuntos, persistencia y paneles de manuales/casos. |
| `src/components/assets/` | Exploración del árbol de AssetWorX. |
| `src/components/ui/` | Componentes de presentación compartidos. |
| `src/lib/api/` | Peticiones al puente y APIs de manuales/casos. |
| `src/lib/iconics/` | Lecturas de puntos y exploración para Assets. |
| `src/theme/` | Temas claro, oscuro y Mitsubishi Electric; tipografía. |
| `src/test/` | Pruebas de interfaz, autenticación, transporte y dominio. |

Los alias `@` y `@shared` se declaran en `vite.config.js` y
`jsconfig.json`; deben mantenerse sincronizados.

## Datos y presentación

TanStack Query gestiona las consultas de Assets. El chat consume eventos SSE
del backend. Markdown se procesa con marked y DOMPurify; la conversación se
conserva en localStorage. La sesión usa cookie HttpOnly y se consulta mediante
la API. El cliente no almacena el token OIDC.

El audio se convierte a WAV antes de enviarlo a `/api/voz`; la salida usa la
síntesis del navegador. La extracción de manuales y la generación PDF ocurren
en el servidor. No se usan Three.js, Recharts ni XLSX en este frontend.

## Build y comprobaciones

`npm run build` genera `dist/`. `VITE_BASE_PATH` permite compilar para una
subruta. Configura también `VITE_API_BASE` con esa subruta para las llamadas HTTP;
la base de la API se resuelve en `src/lib/api/apiBase.js`.
Después de compilar ejecuta, desde la raíz, `node scripts/verificar-bundle.mjs`.

`npm run design:detect` ejecuta Impeccable mediante npx y puede requerir red.
La organización de pruebas está en [src/test/README.md](src/test/README.md).
Las dependencias están en [package.json](package.json) y en el
[inventario del stack](../docs/STACK.md).
