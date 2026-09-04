/**
 * Punto de composición de la aplicación.
 *
 * ── UNA SOLA VISTA (PLAN 20 FASE 3) ────────────────────────────────
 *
 * Este archivo tenía un `Shell` con sidebar, topbar, dos banners de estado, un
 * modo muro que rotaba pantallas solo, y un registro de **veintidós rutas** que
 * decidía cuál pintar. Ya no hay ninguna: la rama `Asistente` es el chat y nada
 * más, y lo que haya que enseñar se enseña dentro de él o en uno de sus cajones
 * (`features/asistente/cajones/`).
 *
 * De ahí que no haya `useState('page')`, ni `lazy()` por vista, ni `Suspense`
 * de navegación. No es que se hayan simplificado: es que sin destinos no hay
 * nada que resolver. La invariante está en `docs/PLAN-20-ASISTENTE.md` §2.12 y
 * la guarda `test/app/una-sola-vista.test.jsx`, porque un router con dos
 * entradas es el primer paso para volver a tener nueve — y este proyecto ya
 * hizo ese camino una vez.
 *
 * ── LO ÚNICO QUE SE DECIDE AQUÍ (PLAN 20 FASE 4) ───────────────────
 *
 * Login o asistente. Y no son dos rutas: son dos estados de la misma
 * aplicación, sin URL propia. Quien no ha entrado no puede llegar a ninguna
 * parte —el backend le respondería 401 a todo— así que no hay nada que
 * enrutar.
 *
 * El tercer estado, `comprobando`, existe porque la cookie de sesión es
 * `httpOnly` y JavaScript no puede leerla: hay que preguntarle al servidor.
 * Pintar el login mientras tanto y sustituirlo medio segundo después es el
 * parpadeo que hace que una aplicación parezca rota nada más abrirla.
 *
 * ── EL ORDEN DE LOS PROVIDERS SIGUE SIENDO FUNCIONAL ───────────────
 *
 * Se deja visible aquí, y no escondido tras un `<AppProviders>`, por el mismo
 * motivo de siempre: un provider que consuma el hook de otro tiene que ir por
 * dentro. `SesionProvider` va DENTRO de `ThemeProvider` porque el login se
 * pinta con el tema, y FUERA de todo lo que hace peticiones, porque es quien
 * recoge el aviso de que la sesión caducó.
 */
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, useTheme } from "@/theme";
import { queryClient } from "@/lib/queryClient.js";
import { Asistente } from "@/features/asistente";
import { ESTADO, SesionProvider, useSesion } from "@/auth/SesionProvider.jsx";
import Login from "@/auth/Login.jsx";
import BarraSesion from "@/auth/BarraSesion.jsx";
import { ToastProvider, ModalProvider, Modal } from "./providers/index.js";
import { ErrorBoundary } from "./ErrorBoundary.jsx";

/**
 * Mientras se pregunta al servidor si hay sesión.
 *
 * Deliberadamente callado: son milisegundos en el caso normal, y un texto de
 * «cargando…» que aparece y desaparece es más ruidoso que un fondo liso. Lo
 * que sí hace es reservar la pantalla completa, para que lo que venga después
 * no dé un salto.
 */
function Comprobando() {
  const { theme: t } = useTheme();
  return <div style={{ minHeight: "100dvh", background: t.page }} aria-busy="true" />;
}

function Aplicacion() {
  const { estado } = useSesion();

  if (estado === ESTADO.comprobando) return <Comprobando />;
  if (estado === ESTADO.fuera) return <Login />;

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ModalProvider>
          {/*
            * Fuera de la frontera de errores a propósito: si el asistente
            * revienta, salir de la sesión tiene que seguir funcionando. Es la
            * única acción que no puede depender de que el chat esté sano —en un
            * equipo compartido de planta, quedarse dentro sin poder salir es
            * peor que una pantalla rota.
            *
            * Provisional: la Fase 5 la absorbe en la cabecera del chat.
            */}
          <BarraSesion />

          {/*
            * La frontera envuelve al asistente y no al revés: si el chat
            * revienta, lo que tiene que quedar en pie es algo que diga qué
            * pasó. Ponerla por fuera de los providers dejaría la pantalla de
            * error sin tema y sin poder pintarse.
            */}
          <ErrorBoundary>
            <Asistente />
          </ErrorBoundary>
          <Modal />
        </ModalProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <SesionProvider>
        <Aplicacion />
      </SesionProvider>
    </ThemeProvider>
  );
}
