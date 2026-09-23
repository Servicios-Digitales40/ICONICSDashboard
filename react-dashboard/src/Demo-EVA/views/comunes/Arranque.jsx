/**
 * La pantalla de arranque: un DESVÍO, no una vista (Plan 42.5 F6, D19).
 *
 * ── POR QUÉ EXISTE ────────────────────────────────────────────────────
 *
 * El tablero arrancaba en el muro de planta, que el usuario no encontró útil
 * y pidió borrar. La pantalla que sí quiere ver al entrar es el Inicio de SU
 * máquina configurada, pero `DEFAULT_ROUTE` es un id fijo y las rutas de
 * máquina (`maq-*`) necesitan `?maquina=<id>`, que sólo se sabe cuando la
 * lista de configuradas ha llegado del servidor. Esta ruta espera esa lista
 * y redirige con `replace` al Inicio de la primera en servicio: quien pulse
 * «atrás» no vuelve a un desvío.
 *
 * ── LO QUE DICE CUANDO NO HAY MÁQUINA ─────────────────────────────────
 *
 * Sin ninguna configurada no cae en una pantalla de consuelo: lo dice, y a
 * quien puede configurar le ofrece el botón; a quien no, le dice a quién
 * pedírselo. Si la lista no se pudo leer, eso también se dice, con el error
 * delante. Y mientras la lista no ha llegado (`listo` en falso), un
 * «buscando…»: distinguir «aún no cargó» de «no hay ninguna» es justo lo que
 * el proveedor de configuradas gana en esta fase.
 *
 * No hay `if` por máquina ni por tipo: la primera de la lista es la primera
 * que el servidor devuelve, en el orden de `maquinas.json`.
 */
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Cog } from "lucide-react";

import { AlertBanner, Button } from "@/components/ui/index.js";
import { usePermisos } from "@/app/providers/usePermisos.js";
import { useMensajeDeError } from "@/i18n/useMensajeDeError.js";

import { useMaquinasConfiguradas } from "../../data/comunes/MaquinasConfiguradas.jsx";

/** Adónde va el desvío, y adónde se manda a quien puede dar de alta una máquina. */
const RUTA_INICIO_DE_MAQUINA = "maq-inicio";
const RUTA_CONFIGURACION = "eva-configuracion";

export default function Arranque({ onNavigate }) {
  /* `traducir` y no `t`: en este tablero `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation("machines");
  const mensajeDeError = useMensajeDeError();
  const { maquinas, listo, error } = useMaquinasConfiguradas();
  const { esAdministrador } = usePermisos();
  const primera = maquinas[0] ?? null;

  useEffect(() => {
    if (listo && primera) onNavigate?.(RUTA_INICIO_DE_MAQUINA, { maquina: primera.id }, { replace: true });
  }, [listo, primera, onNavigate]);

  if (!listo || primera) {
    return <p style={{ fontSize: 13, opacity: 0.7 }}>{traducir("arranque.buscando")}</p>;
  }

  if (error) {
    const m = mensajeDeError(error);
    return <AlertBanner type="error" title={traducir("arranque.error.title")} message={m.titulo} detalle={m.detalle} accion={m.accion} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 14, maxWidth: 640 }}>
      <AlertBanner
        type="info"
        title={traducir("arranque.sinMaquinas.title")}
        message={traducir(esAdministrador ? "arranque.sinMaquinas.message" : "arranque.sinMaquinas.messageSinPermiso")}
      />
      {esAdministrador && (
        <Button variant="primary" icon={<Cog size={14} />} onClick={() => onNavigate?.(RUTA_CONFIGURACION)}>
          {traducir("arranque.sinMaquinas.configurar")}
        </Button>
      )}
    </div>
  );
}
