/**
 * Compone el tema y la sesión; muestra la comprobación, el login o el asistente.
 * Los providers de consultas, avisos y modales se montan dentro de la sesión.
 * ErrorBoundary permite informar de un fallo de renderizado del asistente.
 */
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, useTheme } from "@/theme";
import { queryClient } from "@/lib/queryClient.js";
import { Asistente } from "@/features/asistente";
import { ESTADO, SesionProvider, useSesion } from "@/auth/SesionProvider.jsx";
import Login from "@/auth/Login.jsx";
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
  const { estado, usuario, salir } = useSesion();

  if (estado === ESTADO.comprobando) return <Comprobando />;
  if (estado === ESTADO.fuera) return <Login />;

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ModalProvider>
          {/*
            * La frontera envuelve al asistente y no al revés: si el chat
            * revienta, lo que tiene que quedar en pie es algo que diga qué
            * pasó. Ponerla por fuera de los providers dejaría la pantalla de
            * error sin tema y sin poder pintarse.
            */}
          <ErrorBoundary>
            <Asistente usuario={usuario} salir={salir} />
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
