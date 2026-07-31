/**
 * Deriva el árbol del sidebar a partir del registro de rutas.
 *
 * Vive en su propio archivo, sin JSX ni imports con alias, para que sea JS
 * puro ejecutable en node y por tanto verificable: su modo de fallo es
 * silencioso, porque si el orden se altera el build pasa y la app funciona,
 * y lo único que cambia es cómo sale el sidebar.
 */

/**
 * @param routes  el array ROUTES (solo se leen `id` y `nav`)
 * @param groups  mapa id de grupo → { label, icon }
 * @returns array de items: `{ id, label, icon }` o
 *          `{ group, label, icon, children: [...] }`
 *
 * Reglas:
 *   1. Los items de primer nivel salen en orden de declaración.
 *   2. Un grupo se inserta en la posición de su primer hijo, y desde ahí
 *      absorbe al resto, estén donde estén en el array.
 *   3. Las rutas sin `nav` se omiten (rutas ocultas, como machine-detail).
 */
export function buildNav(routes, groups) {
  const items = [];
  const vistos = new Map(); // id de grupo → objeto ya insertado en `items`

  for (const r of routes) {
    if (!r.nav) continue;
    const { label, icon, group } = r.nav;

    if (!group) {
      items.push({ id: r.id, label, icon });
      continue;
    }

    if (!vistos.has(group)) {
      const meta = groups[group];
      if (!meta) {
        throw new Error(
          `routes: la ruta "${r.id}" referencia el grupo "${group}", que no está declarado en NAV_GROUPS.`
        );
      }
      const nuevo = { group, label: meta.label, icon: meta.icon, children: [] };
      vistos.set(group, nuevo);
      items.push(nuevo);
    }
    vistos.get(group).children.push({ id: r.id, label, icon });
  }

  return items;
}
