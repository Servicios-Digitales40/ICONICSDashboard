import { execSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Qué build es este. Se resuelve aquí, en la compilación, y no en el
 * despliegue: si dependiera de que alguien exporte una variable antes de
 * `npm run build`, el día que se olvide la pantalla dirá una versión que no
 * es la suya — y una versión equivocada es peor que ninguna.
 *
 * Se admite `VITE_APP_VERSION` del entorno para que un empaquetado desde CI
 * pueda imponer su propia etiqueta. Sin git (compilando desde un zip) queda
 * vacío y el Topbar no pinta nada, que es lo honesto.
 */
function versionDelBuild() {
  if (process.env.VITE_APP_VERSION) return process.env.VITE_APP_VERSION;
  try {
    return execSync("git describe --always --dirty --tags", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

// Configuración mínima de Vite: el plugin de React para JSX/Fast Refresh,
// más dos alias: "@" -> src/ y "@shared" -> ../shared/.
//
// Los alias se mantienen al mínimo a propósito: cada uno es un segundo
// sistema de nombres que hay que sincronizar entre este archivo Y
// jsconfig.json Y el árbol de carpetas.
//
// "@shared" es la excepción que justifica la regla, y por eso son dos y no
// tres: apunta FUERA de src/, así que "@" no puede alcanzarlo por mucho que
// se estire. `shared/` vive en la raíz del repositorio porque lo importan dos
// programas distintos —este frontend y el backend de Node—, y ninguno de los
// dos puede ser su dueño. La alternativa era un relativo de tres niveles
// (`../../../shared/...`) que se rompe al mover cualquier archivo.
//
// Regla de uso: alias para cruzar de módulo, relativo dentro del propio
// módulo. Ver jsconfig.json para el equivalente que consume el editor.
export default defineConfig({
  plugins: [react()],

  /*
   * Vacío por defecto ("/"): el bundle vive en la raíz del origen que lo
   * sirve, que es el caso normal (el backend sirve su propio "dist/").
   *
   * `VITE_BASE_PATH` existe para el caso contrario y deliberado: montar el
   * Asistente bajo una SUBRUTA de un sitio que ya sirve OTRA cosa en la raíz
   * — el HMI nativo de ICONICS, con un proxy inverso de IIS reenviando
   * `/asistente/*` hacia este backend (ver docs/PLAN-20-ASISTENTE.md, SSO
   * silencioso). Sin esto, el HTML compilado referenciaría `/assets/...` en
   * vez de `/asistente/assets/...`, y el navegador pediría esos archivos a
   * la raíz del dominio de ICONICS en vez de a nuestro proxy.
   */
  base: process.env.VITE_BASE_PATH || "/",

  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(versionDelBuild()),
  },

  /*
   * ── EL TABLERO SE VE DESDE LA RED, NO SÓLO DESDE ESTA MÁQUINA ──────
   *
   * `host: true` ata el dev server a todas las interfaces. El defecto de Vite
   * es `localhost`, que en Windows resuelve a 127.0.0.1: el puerto quedaba
   * abierto pero ningún otro equipo lo alcanzaba, aunque hiciera ping. El
   * backend ya escuchaba en 0.0.0.0 (ver backend/server.mjs), así que esto es
   * lo que faltaba para que las dos mitades estuvieran expuestas por igual.
   *
   * `strictPort` porque la URL se reparte a mano: si 5173 está ocupado
   * preferimos que falle a que Vite se mude a 5174 en silencio y el resto de
   * la planta abra un puerto donde no hay nada.
   *
   * `proxy` es lo que quita el host del código de la aplicación. El frontend
   * pide `/api/...` al origen de la página y el dev server lo reenvía al
   * backend; así el mismo bundle sirve para localhost y para 10.10.17.x sin
   * ninguna IP escrita en ningún sitio, y el navegador no ve dos orígenes,
   * luego no hay CORS que configurar. Ver src/lib/apiBase.js.
   *
   * El destino es 127.0.0.1 y no localhost a propósito: con localhost, Node
   * puede resolver a ::1 y encontrarse el puerto cerrado si el backend sólo
   * escucha en IPv4.
   */
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },

  // `npm run preview` sirve el build compilado; se expone igual, porque es la
  // forma de que otro equipo vea exactamente lo que verá la planta.
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },

  build: {
    /*
     * Separar las librerías del código de la aplicación: cambiar una etiqueta
     * no debe obligar al navegador a descargarse React otra vez. Un despliegue
     * normal sólo invalida la parte pequeña.
     *
     * ── QUÉ SE FUE EN LA FASE 3 DEL PLAN 20 ────────────────────────────
     *
     * Tres reglas de reparto y una lista de veinte paquetes. `three` apartaba
     * la pila 3D —del orden de 840 KB entre three, r3f y drei— para que la
     * pantalla de Planta no la pagara al arrancar; `charts` hacía lo propio
     * con recharts y d3; `xlsx`, con el exportador a Excel del detalle.
     *
     * Ninguna de esas librerías sigue instalada, así que las reglas ya no
     * separaban nada: eran el mapa de un edificio demolido. Lo que queda es lo
     * único que esta aplicación carga, y por eso el reparto vuelve a caber en
     * tres líneas.
     */
    rollupOptions: {
      output: {
        /*
         * Se reparte por la RUTA del módulo y no por una lista de nombres de
         * paquete: listar `react-dom` no captura `react-dom/client`, que es lo
         * que importa `main.jsx`, y el resultado era un trozo de React vacío
         * con React entero dentro de otro.
         */
        manualChunks(id) {
          /*
           * El ayudante de precarga de Vite (`__vitePreload`) no vive en
           * `node_modules`, así que sin esta línea lo coloca Rollup donde le
           * parece. Va a `vendor`, que es de carga inmediata igualmente.
           */
          if (id.includes("vite/preload-helper")) return "vendor";

          if (!id.includes("node_modules")) return;
          if (/[\/]node_modules[\/](react|react-dom|scheduler)[\/]/.test(id)) return "react";
          return "vendor";
        },
      },
    },
  },

  resolve: {
    // fileURLToPath y no __dirname: package.json declara "type": "module".
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("../shared", import.meta.url)),
    },
  },

  // Vitest hereda de aquí el alias "@", así que las pruebas importan igual
  // que la app y no hace falta un segundo mapa de rutas que sincronizar.
  // Eso es lo que permite que TODA la suite viva en src/test/ (en un árbol
  // que espeja src/) sin que ninguna prueba dependa de su propia ubicación.
  // Ver src/test/README.md para el índice de qué cubre cada carpeta.
  //
  // El entorno por defecto es `node`, que es lo que quiere la mayoría de la
  // suite (dominio, motor de polling, rollup): JS puro y rápido. Los pocos
  // archivos que necesitan DOM lo piden por sí mismos con la directiva
  //     // @vitest-environment jsdom
  // en su primera línea. Es más explícito que un glob en la configuración:
  // se ve al abrir el archivo, y no queda escondido aquí.
  test: {
    // Rellena ResizeObserver y matchMedia, que jsdom no trae y Recharts sí
    // usa. Es inocuo en las pruebas de node: comprueba antes de definir.
    setupFiles: ["./src/test/setup.js"],
  },
});
