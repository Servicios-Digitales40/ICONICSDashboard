/**
 * Barrera de errores de render.
 *
 * Sin ella, una excepción en cualquier subvista desmonta el árbol entero y
 * deja la pantalla EN BLANCO. En un monitor de planta eso no se recupera:
 * nadie recarga, porque no hay nadie delante ni teclado con el que hacerlo.
 *
 * Se usa en dos alturas y las dos hacen falta:
 *
 *  - Alrededor de la página (`resetKey={ruta}`), para que una vista rota se
 *    quede en su sitio y el resto del tablero —barra lateral, cabecera,
 *    indicador de origen— siga en pie y navegable.
 *  - En la raíz, como último recurso para lo que ocurra fuera de una página.
 *
 * `resetKey` es lo que la hace utilizable sin recargar: al cambiar de ruta,
 * la barrera se rearma sola. Sin eso, una vista que falló una vez dejaría la
 * barrera enganchada para siempre y navegar a otra página mostraría el mismo
 * error.
 *
 * Es una clase porque `componentDidCatch` no tiene equivalente en hooks; es
 * la única de la aplicación, y por este motivo.
 */
import { Component } from "react";
import { AlertTriangle } from "lucide-react";

export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // A la consola del navegador: es donde mira quien diagnostica una
    // pantalla de planta con las herramientas de desarrollo abiertas.
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return <PanelDeError error={this.state.error} etiqueta={this.props.etiqueta} />;
  }
}

/**
 * Lo que se ve cuando algo revienta.
 *
 * Dice qué se rompió y qué hacer, y **no** finge que hay datos. La misma
 * regla que el resto del tablero: un hueco se pinta como hueco.
 *
 * No usa `useTheme()` a propósito. Si lo que falló fuera el propio proveedor
 * de tema, la pantalla de error fallaría también y volveríamos al blanco.
 */
function PanelDeError({ error, etiqueta }) {
  return (
    <div
      role="alert"
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 10, minHeight: 240, padding: 28, borderRadius: 14,
        border: "1px solid #C2410C55", background: "#C2410C11",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", textAlign: "center",
      }}
    >
      <AlertTriangle size={26} color="#C2410C" />
      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#C2410C" }}>
        {etiqueta ? `No se pudo mostrar «${etiqueta}»` : "No se pudo mostrar esta sección"}
      </p>
      <p style={{ margin: 0, fontSize: 12.5, opacity: 0.75, maxWidth: 420 }}>
        El resto del tablero sigue funcionando. Cambia de vista y vuelve para reintentar.
      </p>
      <code style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", opacity: 0.6, marginTop: 4 }}>
        {String(error?.message ?? error).slice(0, 160)}
      </code>
    </div>
  );
}
