/**
 * pages/Data.jsx
 * ------------------------------------------------------------------
 * Vista de datos crudos de ICONICS a través del backend puente
 * (backend/server.mjs). Se divide en dos subsecciones (Tabs, sin tocar
 * el router — el estado vive local, patrón igual a MachineDetail):
 *   - Lectura:   consumir puntos de ICONICS (solo-lectura).
 *   - Escritura: escribir valores hacia ICONICS (pendiente).
 */
import { useState } from "react";
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
  const [sub, setSub] = useState("lectura");

  return (
    <>
      <SectionLabel sub="Lectura y escritura de puntos ICONICS a través del backend puente">Data</SectionLabel>

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
