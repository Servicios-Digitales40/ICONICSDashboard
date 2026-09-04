/**
 * Punto de composición de la aplicación.
 *
 * ── UNA SOLA VISTA (PLAN 20 FASE 3) ────────────────────────────────
 *
 * Este archivo tenía un `Shell` con sidebar, topbar, dos banners de estado, un
 * modo muro que rotaba pantallas solo, y un registro de **veintidós rutas**
 * que decidía cuál pintar. Ya no hay ninguna: la rama `Asistente` es el chat y
 * nada más, y lo que haya que enseñar se enseña dentro de él o en uno de sus
 * cajones (`features/asistente/cajones/`).
 *
 * De ahí que no haya `useState('page')`, ni `lazy()` por vista, ni `Suspense`
 * de navegación. No es que se hayan simplificado: es que sin destinos no hay
 * nada que resolver. La invariante está escrita en `docs/PLAN-20-ASISTENTE.md`
 * §2.12 y la guarda una prueba (`test/app/una-sola-vista.test.jsx`), porque un
 * router con dos entradas es el primer paso para volver a tener nueve — y este
 * proyecto ya hizo ese camino una vez.
 *
 * ── EL ORDEN DE LOS PROVIDERS SIGUE SIENDO FUNCIONAL ───────────────
 *
 * Se deja visible aquí, y no escondido tras un `<AppProviders>`, por el mismo
 * motivo de siempre: un provider que consuma el hook de otro tiene que ir por
 * dentro. `QueryClientProvider` envuelve porque el cajón de Assets usa
 * TanStack Query; `ThemeProvider` porque todo lee su color de `useTheme()`.
 *
 * ── QUÉ FALTA TODAVÍA ──────────────────────────────────────────────
 *
 * El login. Desde la Fase 1 el backend exige sesión en toda ruta de `/api/`,
 * así que hasta la Fase 4 esta pantalla se monta y sus peticiones reciben 401.
 * Es un estado intermedio declarado, no un descuido: la Fase 4 añade
 * `auth/SesionProvider.jsx` y decide aquí entre login y asistente.
 */
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/theme";
import { queryClient } from "@/lib/queryClient.js";
import { Asistente } from "@/features/asistente";
import { ToastProvider, ModalProvider, Modal } from "./providers/index.js";
import { ErrorBoundary } from "./ErrorBoundary.jsx";

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ModalProvider>
            {/*
              * La frontera de errores envuelve al asistente y no al revés: si
              * el chat revienta, lo que tiene que quedar en pie es algo que
              * diga qué pasó. Envolver por fuera de los providers dejaría la
              * pantalla de error sin tema y sin poder pintarse.
              */}
            <ErrorBoundary>
              <Asistente />
            </ErrorBoundary>
            <Modal />
          </ModalProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
