/**
 * Quién está dentro, y cómo salir. Plan 35 F5.
 *
 * ── POR QUÉ HACÍA FALTA ────────────────────────────────────────────
 *
 * Porque hasta el 21-09-2026 el tablero **no decía en ningún sitio quién
 * eras, ni permitía salir**. Se notó la primera vez que alguien usó la
 * autenticación encendida de verdad: para cambiar de rol había que abrir la
 * consola del navegador y vaciar `localStorage`.
 *
 * Y el problema no es sólo la incomodidad. Con tres roles, **una acción que
 * falla con 403 no se explica sola**: quien la intenta no sabe si le falta
 * permiso o si algo está roto. Ver «Moisés · Operador» arriba contesta esa
 * pregunta antes de que se haga.
 *
 * ── POR QUÉ NO SE PINTA CON LA AUTENTICACIÓN APAGADA ───────────────
 *
 * Porque entonces no hay sesión que mostrar ni de la que salir. Un «Salir»
 * que no lleva a ninguna parte, o un rol inventado para rellenar el hueco,
 * dirían algo falso sobre cómo está configurado el tablero.
 *
 * Es el mismo criterio que `usePermisos` aplica a los permisos: **la pantalla
 * refleja lo que hay, y con la autenticación apagada lo que hay es nada**.
 *
 * ── SALIR ES LOCAL, Y ESO HAY QUE SABERLO ──────────────────────────
 *
 * `borrarSesion()` tira el token de este navegador; **no lo revoca en el
 * servidor**. Un JWT vale hasta que caduca, y esa es su naturaleza: no hay
 * lista de tokens vivos que tachar. Para una sesión de planta con caducidad
 * corta es el compromiso razonable, y conviene tenerlo escrito en vez de
 * suponer que «salir» desconecta a alguien que ya copió su token.
 */
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { LogOut, UserRound } from "lucide-react";

import { HoverTip } from "@/components/ui/index.js";
import { borrarSesion } from "@/lib/api/sesion.js";
import { useTheme } from "@/theme";

import { usePermisos } from "../providers/usePermisos.js";
import { CtxSesion } from "../providers/SesionProvider.jsx";

export function SesionActual() {
  const { t: traducir } = useTranslation("layout");
  const { theme: t } = useTheme();
  /*
   * El contexto directo y no `useSesion()`, que lanza sin proveedor. El
   * Topbar se monta en pruebas y en vistas aisladas fuera del árbol completo,
   * y reventar ahí convierte un montaje sin sesión en una pantalla en blanco.
   *
   * Mismo criterio que `usePermisos`, `useSesionResuelta()` y
   * `useEsSimulado()`. Aquí el lado seguro es **no pintar nada**: sin
   * proveedor no hay sesión que enseñar.
   */
  const ctx = useContext(CtxSesion);
  const habilitada = ctx?.habilitada ?? false;
  const usuario = ctx?.usuario ?? null;
  const { rol } = usePermisos();

  /* Sin autenticación no hay nada que enseñar. Ver la cabecera. */
  if (!habilitada || !usuario?.autenticado) return null;

  const salir = () => {
    borrarSesion();
    /*
     * Recarga entera en vez de reponer el estado del proveedor: al salir
     * cambia lo que el tablero puede pedir, y media docena de vistas tienen
     * datos en memoria de la sesión anterior. Una recarga los tira todos de
     * golpe, que es más simple y más honesto que confiar en que cada una se
     * entere.
     */
    globalThis.location?.reload();
  };

  const nombreDelRol = rol
    ? traducir(`roles.${rol}`, { defaultValue: rol })
    : traducir("sesion.sinRol");

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          borderRadius: 9,
          background: t.panel,
          border: `1px solid ${t.border}`,
          minHeight: 32,
        }}
      >
        <UserRound size={14} style={{ color: t.textSoft, flexShrink: 0 }} />
        <span
          style={{
            fontSize: 12.5,
            color: t.text,
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
          }}
        >
          {usuario.id}
        </span>
        {/* El rol en monoespaciada: es identidad del sistema, no un nombre que
            haya escrito una persona (`DESIGN.md`, la regla de la máquina). */}
        <span
          style={{
            fontSize: 11,
            color: t.textFaint,
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          {nombreDelRol}
        </span>
      </div>

      <HoverTip label={traducir("sesion.salirTip")}>
        <button
          type="button"
          onClick={salir}
          aria-label={traducir("sesion.salirAria", { usuario: usuario.id })}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            /* 32×32: es un control de chrome, no acciona la instalación, así
               que le aplica el mínimo de 32 y no el de 44 (`DESIGN.md`). */
            width: 32,
            height: 32,
            borderRadius: 9,
            background: t.panel,
            border: `1px solid ${t.border}`,
            color: t.textSoft,
            cursor: "pointer",
          }}
        >
          <LogOut size={14} />
        </button>
      </HoverTip>
    </div>
  );
}
