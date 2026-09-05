import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";


/** Configura JSX y los alias @ y @shared, sincronizados con jsconfig.json. */
export default defineConfig({
  plugins: [react()],

  /**
 * Base pública del bundle. Para un HMI bajo /asistente/, define
 * VITE_BASE_PATH al compilar y configura el proxy de esa subruta.
 */
  base: process.env.VITE_BASE_PATH || "/",

  /**
 * Expone desarrollo en la red y conserva el puerto conocido.
 * El proxy mantiene API y frontend bajo el mismo origen. Se usa IPv4
 * explícita para evitar resolver localhost a un backend IPv6 inexistente.
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
    /**
 * Separa las dependencias para conservar su caché entre cambios de aplicación.
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
  // Las pruebas con DOM declaran @vitest-environment jsdom en su archivo.

});
