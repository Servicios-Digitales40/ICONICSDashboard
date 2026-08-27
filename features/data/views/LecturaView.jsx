/**
 * Subsección "Lectura" de la vista Data. Agrupa todo lo que consume datos de
 * ICONICS en solo lectura a través del backend puente:
 *
 *   - Tarjetas en vivo (polling) de puntos individuales.
 *   - Lista de productos.
 *   - Tabla completa de productos.
 */
import { IconicsLiveCard, IconicsProductsList, IconicsProductsTable } from "../components/index.js";

export default function LecturaView() {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <IconicsLiveCard pointName="svrsim:sin" />

        <IconicsLiveCard pointName="db:Northwind.Products[ProductName][0]" />

        {/* Contador: número total de registros (ProductName) en la tabla Products.
            El agregado .@@Count devuelve la cantidad de filas directamente desde ICONICS. */}
        <IconicsLiveCard pointName="db:Northwind.Products.@@Count" />
      </div>

      <div style={{ marginTop: 16 }}>
        <IconicsProductsList />
      </div>

      <div style={{ marginTop: 16 }}>
        <IconicsProductsTable />
      </div>
    </>
  );
}
