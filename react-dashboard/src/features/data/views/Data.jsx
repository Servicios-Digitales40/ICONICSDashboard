/**
 * Vista de datos crudos de ICONICS a través del backend puente. Se divide en
 * subsecciones por pestañas, con estado local y sin tocar el router:
 *
 *   - Lectura:   consumir puntos de ICONICS (solo lectura).
 *   - Escritura: escribir valores hacia ICONICS.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, PenLine, Trash2 } from "lucide-react";
import { SectionLabel, Tabs } from "@/components/ui/index.js";
import LecturaView from "./LecturaView.jsx";
import EscrituraView from "./EscrituraView.jsx";
import EliminarView from "./EliminarView.jsx";

const SUBVIEWS = [
  { key: "lectura", label: "Lectura", icon: BookOpen },
  { key: "escritura", label: "Escritura", icon: PenLine },
  { key: "eliminar", label: "Eliminar", icon: Trash2 },
];

export default function Data() {
  /* `traducir` y no `t`: aquí `t` es el TEMA. Ver la cabecera de `@/i18n`. */
  const { t: traducir } = useTranslation("data");
  const [sub, setSub] = useState("lectura");

  return (
    <>
      <SectionLabel sub={traducir("sub")}>
        {traducir("title")}
      </SectionLabel>

      <div style={{ marginBottom: 16 }}>
        <Tabs items={SUBVIEWS} value={sub} onChange={setSub} />
      </div>

      <div role="tabpanel">
        {sub === "lectura" && <LecturaView />}
        {sub === "escritura" && <EscrituraView />}
        {sub === "eliminar" && <EliminarView />}
      </div>
    </>
  );
}
