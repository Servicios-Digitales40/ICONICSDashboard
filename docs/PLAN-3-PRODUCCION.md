# Plan 3 · Paso a producción

> **ESTADO (6-ago-2026)**
>
> **Fases B y C ejecutadas y verificadas.**
>
> - **Fase B** (endurecer el puente): los siete puntos en el código, cada uno
>   con su comprobación en `scripts/verificar-backend.mjs`, que pasa de 30 a
>   **51 comprobaciones**. Cierra **P0-1.1**, **P0-2**, **P0-3** y **P0-7**,
>   más P1-2, P1-11, P1-12 y P1-13.
> - **Fase C** (recortar el frontend): superficie acotada a operación +
>   Assets, modo demo bajo bandera, `ErrorBoundary`, versión en el Topbar,
>   navegación en la URL y bundle partido. Cierra **P0-6**, P1-7, P1-9 y
>   P1-10. La suite de frontend queda en **141 pruebas**. Las 12 propuestas de
>   diseño se conservan y viven **sólo en el build de demo** (C.2·bis).
>
> **Fase A · hallazgo de O-1.** El servidor ICONICS **sí responde** —la
> premisa de que la Fase A estaba bloqueada era falsa— y el verificador de
> catálogo ya se ha ejecutado contra él. Resultado: **116 de 147 puntos
> vuelven con calidad mala**. Los assets existen y las propiedades están
> dadas de alta; lo que no llega es el dato. Sólo LIN/1 entrega valores, y su
> última marca de tiempo era de **dos días antes**. Detalle en §2.5.
>
> **Decisión de despliegue tomada:** Windows Server con IIS delante (§3.2,
> opción B). El §4 está reescrito para ese destino.
>
> **Fase D escrita, a medio verificar.** `empaquetar.ps1` y `desplegar.ps1`
> están **probados** —los tres rechazos del primero, y el ciclo completo de
> despliegue y reversión del segundo, con la reversión medida en 0,1 s—.
> `instalar-servicio.ps1` y el `web.config` de IIS están escritos pero **sin
> ejecutar**: necesitan NSSM, IIS y el servidor. Runbook en
> [`deploy/LEEME.md`](../deploy/LEEME.md).
>
> **Siguiente, y por este orden:**
>
> 1. El diagnóstico de **O-1** con quien configura ICONICS. Bloquea la Fase A
>    y, con ella, la validación de planta: hoy no hay números que enseñar.
> 2. Los **siete accesos** que pide el runbook (máquina, certificado, grupo de
>    AD, cuenta ICONICS de solo lectura, CA, cuenta de servicio, NSSM+IIS).
>    Son la parte lenta y no dependen de este repositorio.

Tercer plan. **Subordinado al [Plan 1](PLAN-1-CONEXION-ICONICS.md)** en lo funcional —las
Fases 7 y 8 siguen abiertas— e **independiente del [Plan 2](PLAN-2-MEJORAS.md)**, que es
estética y funcionalidad nueva y no bloquea un despliegue.

Aquí no se propone funcionalidad. Se responde a una sola pregunta: **qué le falta a esto para
poder estar encendido en la planta sin que nadie lo vigile.**

**Convención de esfuerzo:** ▁ bajo (horas) · ▄ medio (días) · █ alto (semanas).
**Prioridad:** **P0** bloquea el despliegue · **P1** antes de un mes en producción · **P2** deuda aceptable.

---

## 1. Estado actual, medido

Lo que hay funciona y está bien construido. El punto de partida es bueno, y conviene decirlo
antes de la lista de lo que falta.

| Comprobación | Resultado |
|---|---|
| `npm test` (react-dashboard) | 127 pruebas correctas, 6 saltadas, 14 archivos |
| `node scripts/verificar-backend.mjs` | 30 comprobaciones correctas, sin red ni configuración |
| Dependencias del backend | **cero** — solo Node ≥18 |
| Dependencias del frontend | 6 de runtime, 5 de desarrollo |
| Bundle actual (`dist/`, 31-jul) | 868 KB de JS en **un solo chunk** + 5 KB de CSS |
| Node en la máquina de desarrollo | v22.13.1 (el README pide ≥18; no hay pin) |

Y tres decisiones de arquitectura que ya juegan a favor del despliegue:

- **El backend sirve el frontend desde el mismo origen.** No hace falta un segundo servidor
  para los estáticos: un proceso, un puerto, cero CORS. Esto es lo que hace que la
  contenerización sea trivial (§3).
- **La configuración se lee una sola vez y se valida** (`backend/config.mjs`). Una variable mal
  puesta impide el arranque con un mensaje que dice cuál — que es exactamente lo que quieres
  en un despliegue automatizado.
- **`/api/health` ya distingue tres averías** (`ok` / `degraded` / `error`). La sonda del
  orquestador no hay que inventarla.

---

## 2. Lo que falta

### 2.1 Bloqueantes · P0

| # | Hueco | Dónde | Esfuerzo |
|---|---|---|---|
| P0-1 | El puente no autentica a *sus* clientes | `backend/app.mjs` | ▄ |
| P0-2 | `Access-Control-Allow-Origin: *` en todas las respuestas | `backend/http/responses.mjs:15` | ▁ |
| P0-3 | `NODE_TLS_REJECT_UNAUTHORIZED=0` en el `.env.local` actual | raíz | ▁ |
| P0-4 | Sin HTTPS: el tablero viaja en claro | despliegue | ▄ |
| P0-5 | Credenciales en archivo plano, cuenta de servicio sin acotar | `.env.local` | ▄ |
| P0-6 | Superficie de desarrollo dentro del bundle de producción | `app/routes/routes.jsx` | ▄ |
| P0-7 | Ninguna llamada saliente tiene *timeout* | `backend/iconics/client.mjs:60` | ▁ |
| P0-8 | Fases 7–8 del Plan 1 sin cerrar: tendencia y Comparativo aún sobre serie simulada | `plantModel.js` | ▄ |

**P0-1 · El puente no autentica a sus clientes.**
Es el hueco más grande, y no es un detalle de configuración. El backend mantiene una sesión
OIDC **privilegiada** contra ICONICS y expone sin ninguna barrera:

- `POST /api/iconics/write` y `/write/batch` — escritura de cualquier punto que pase la lista
  blanca de `validation.mjs`, que es deliberadamente amplia (admite parámetros de Data
  Manipulators).
- `PUT /api/iconics/alarms/acknowledge` — reconocimiento de alarmas sin trazabilidad de quién.
- `GET /api/iconics/browse`, `/points` — el árbol completo de configuración de la planta.

Cualquiera que alcance el puerto 3001 hace eso, desde `curl`, sin credenciales. En una red de
planta esto no es teórico.

*Arreglo, en dos capas y por ese orden:*
1. **Interruptor de solo lectura** (`ICONICS_READ_ONLY=true` por defecto en producción): las
   rutas de escritura y de *ack* no se registran siquiera. Es una tarde de trabajo y elimina
   de un golpe todo el riesgo de escritura. Si el tablero es de consulta —que es lo que
   describe el README— esto no quita nada.
2. **Autenticación de usuario** delante de todo. La opción barata y correcta es resolverla en
   el proxy inverso (§3): autenticación de Windows/AD si el despliegue es en IIS, o
   `forward_auth`/OIDC si es Caddy o Traefik. Meter sesiones en el backend es escribir un
   servidor de identidad propio, y no hay razón.

**P0-2 · CORS abierto a todo el mundo.**
`Access-Control-Allow-Origin: *` viaja en **todas** las respuestas, no solo en el preflight. El
comentario del código explica bien por qué se puso —el dev server de Vite es otro origen— pero
en producción el bundle se sirve del mismo origen y ese comodín solo sirve para que cualquier
página web abierta en un navegador de la planta pueda llamar a la API por la espalda del
usuario. Debe pasar a una lista de orígenes por variable (`CORS_ORIGINS`), vacía por defecto.

**P0-3 · TLS relajado.**
El `.env.local` de la raíz trae hoy `NODE_TLS_REJECT_UNAUTHORIZED=0`. Desactiva la verificación
de certificados **de todo el proceso**, no solo hacia ICONICS. Ya está marcado como R-13 en el
Plan 1 y documentado en `backend/README.md`; aquí solo se hace ejecutable: en producción se
instala la CA del servidor ICONICS y se usa `NODE_EXTRA_CA_CERTS`. Y el `.env` de producción
debe fallar el despliegue si contiene esa variable — una comprobación de una línea en el
script de arranque.

**P0-4 · Sin HTTPS.** El proceso escucha HTTP plano en `0.0.0.0:3001`. Con autenticación
delante (P0-1) eso significa credenciales en claro por la red de planta. Se resuelve en el
proxy inverso, no en Node.

**P0-5 · Credenciales.** Contraseña de la cuenta de servicio en texto plano en un archivo. Se
necesita: (a) una **cuenta ICONICS dedicada y de mínimo privilegio** —solo lectura si se activa
P0-1.1—, no una de administrador; (b) el secreto fuera del archivo de configuración general
(secreto de Docker, Credential Manager de Windows o el gestor que use IT); (c) una rotación
acordada; (d) confirmar que el histórico de git no contiene credenciales de ninguna versión
anterior. Hoy `.env.local` **no está versionado** —comprobado— pero el histórico no se ha
auditado.

**P0-6 · Superficie de desarrollo en el bundle.**
El build de producción incluye hoy, visibles en el menú lateral:

- **11 rutas de prototipo** (`src/prototypes/`) más el Sandbox y «Planta · v2», que son
  propuestas en evaluación. Son también la razón principal de que el bundle sea un solo chunk
  de 868 KB.
- **La vista «Data»**, que hace altas, escrituras y **borrados** contra `db:Northwind` — la
  base de ejemplo de ICONICS. Un botón «Eliminar» con `window.confirm` en un tablero de planta
  es un accidente esperando fecha.
- **El botón de modo demo** del Topbar, que sustituye la planta entera por datos inventados
  plausibles. La cinta de aviso está bien hecha, pero en un wallboard sin teclado nadie lo va a
  desactivar.

Decisión necesaria antes de compilar: qué rutas existen en producción. Mi recomendación es
dejar Planta, Lineales, Rectificadoras, Detalle de máquina y Assets; sacar prototipos, Sandbox,
Sankey y Data; y compilar el modo demo bajo bandera (`VITE_ENABLE_DEMO`, apagada). La receta
para retirar los prototipos ya está escrita en `src/prototypes/README.md`.

**P0-7 · Ninguna llamada saliente tiene timeout.**
`request()` en `client.mjs:60` es la única salida del backend hacia ICONICS y no lleva
`signal`. Solo `ping()` tiene corte. Si el servidor ICONICS acepta la conexión y no responde
—que es el modo de fallo típico de un servidor saturado, no el de uno caído— la petición se
queda colgada indefinidamente, y con varios wallboards sondeando eso acumula sockets hasta
tumbar el puente. Un `AbortSignal.timeout(config.limits.upstreamTimeoutMs)` en esa única
función lo cierra todo, porque toda salida pasa por ahí.

**P0-8 · Datos aún simulados en dos vistas.**
El propio Plan 1 lo deja anotado: la tendencia del Dashboard (`plantModel.js`) y el Comparativo
siguen sobre serie simulada. Publicar un tablero de OEE donde una gráfica es inventada es el
riesgo más caro de esta lista, porque no falla — convence. O se conectan al histórico `hda:`
real, o se retiran de la vista de producción hasta que lo estén.

### 2.2 Antes de un mes en producción · P1

| # | Hueco | Esfuerzo |
|---|---|---|
| P1-1 | Nada supervisa el proceso: sin arranque automático ni reinicio | ▁ |
| P1-2 | El build no lleva versión; `/api/health` no dice qué build corre | ▁ |
| P1-3 | Sin pipeline: nada ejecuta las 157 comprobaciones que ya existen | ▄ |
| P1-4 | Sin recolección ni retención de logs | ▄ |
| P1-5 | Nadie vigila `/api/health`; sin alerta | ▄ |
| P1-6 | Sin compresión ni `cache-control` en los estáticos (Plan 2 · B-10) | ▁ |
| P1-7 | Un solo chunk de 868 KB, sin *code-splitting* (Plan 2 · B-09) | ▄ |
| P1-8 | Sin cabeceras de seguridad (CSP, `X-Content-Type-Options`, `frame-ancestors`) | ▁ |
| P1-9 | Sin `ErrorBoundary`: una excepción de render deja la pantalla en blanco | ▁ |
| P1-10 | La navegación no está en la URL: no hay enlaces profundos ni kiosco por vista | ▄ |
| P1-11 | `/api/health` llama a ICONICS en cada petición | ▁ |
| P1-12 | Sin límite de peticiones por cliente | ▁ |
| P1-13 | La carga sobre ICONICS crece linealmente con cada pantalla encendida | ▄ |
| P1-14 | Zona horaria del host no fijada | ▁ |
| P1-15 | Versión de Node sin fijar; `package-lock.json` de la raíz es un resto vacío | ▁ |

Los que no se explican solos:

**P1-2 · Versión del build.** Hoy, mirando una pantalla de planta, no hay forma de saber qué
build está corriendo. Es lo primero que se necesita cuando alguien reporta «el número está
mal»: saber si esa pantalla tiene el arreglo. Se resuelve con `git describe` inyectado como
`VITE_APP_VERSION` en el build y `APP_VERSION` en el backend, expuesto en `/api/health` y en
un rincón del Topbar.

**P1-9 · Sin ErrorBoundary.** `App.jsx` protege el caso de ruta desconocida —hay un comentario
que lo explica— pero no hay ninguna barrera de error de React en el árbol. Una excepción en
cualquier subvista deja la pantalla en blanco hasta que alguien recargue, y en un wallboard
nadie recarga. Es una tarde de trabajo y es lo que separa «una tarjeta rota» de «la planta se
quedó sin tablero».

**P1-10 · La navegación es estado, no URL.** `App.jsx` guarda `{ page, params }` en
`useState`; la barra de direcciones nunca cambia. Consecuencias operativas concretas: no se
puede configurar un kiosco para que abra directamente «Rectificadoras», F5 devuelve siempre a
Planta, y no se puede pasar un enlace a una máquina concreta por correo. Para un tablero
pensado para monitores fijos, esto es funcional, no cosmético. (El backend ya sirve el
`index.html` en cualquier ruta, así que el trabajo es solo del lado del cliente.)

**P1-11 · `/api/health` es cara.** Cada llamada dispara un `ping` real a ICONICS. Una sonda de
contenedor cada 10 s son 8 640 pings diarios contra el servidor de planta solo para preguntar
si el proceso vive. Hay que partirla: `/api/health/live` (¿respira el proceso?) para el
orquestador y `/api/health/ready` —la actual— para el diagnóstico y el monitor.

**P1-13 · La carga crece con cada pantalla.** El motor de sondeo agrupa muy bien *dentro* de un
navegador (~4 peticiones/min en Planta), pero son ~4 por **cada** pantalla encendida. Diez
wallboards son diez veces el tráfico contra ICONICS pidiendo exactamente los mismos tags. Una
caché de 2–3 s en `readPoints()` del backend colapsa las N en una, y es una de las mejoras con
mejor relación esfuerzo/beneficio de toda la lista. Además, las pantallas de planta nunca están
ocultas, así que la pausa por visibilidad que ya existe no ayuda aquí.

**P1-14 · Zona horaria.** `formatLocalTimestamp()` en `iconicsRoutes.mjs:13` construye el rango
de alarmas con la hora **local del proceso**. Un contenedor Alpine arranca en UTC: seis horas
de desfase y las alarmas consultadas no son las que el operador ve. `TZ=America/Mexico_City` no
es opcional, es correctitud.

**P1-15 · Reproducibilidad.** No hay `.nvmrc` ni campo `engines`, y el `package-lock.json` de
la raíz es un archivo vacío con el nombre equivocado (`"name": "react-dashboard"`, cero
paquetes) — un resto que confunde a cualquier `npm ci` lanzado en la raíz. Borrarlo y fijar la
versión de Node.

### 2.3 Deuda aceptable · P2

| # | Hueco |
|---|---|
| P2-1 | Sin ESLint ni formateador: nada impide que el estilo derive |
| P2-2 | Sin `ETag`/`Last-Modified` en `staticFiles.mjs` |
| P2-3 | El `.xlsx` de configuración (1.1 MB) vive dentro de `react-dashboard/` |
| P2-4 | Todo el trabajo en `main`, sin etiquetas de versión ni ramas de release |
| P2-5 | Sin pruebas de extremo a extremo sobre la UI ya compilada |
| P2-6 | `src/_deprecated/` sigue en el repositorio (no entra al bundle: nadie lo importa) |

**Dos hallazgos de color heredados.** Salieron de la evaluación de `dashboard-v2` y estaban
anotados sólo en `src/prototypes/README.md`. Aplican a la vista de **producción** —no al
prototipo— y siguen sin corregir, así que se recogen también aquí, donde se leen junto al resto
de lo pendiente:

- `ESTADO_TOKEN` (`src/lib/machines.js`) deja «Limpieza» y «Mant. Preventivo» a ΔE 0.9 bajo
  protanopía —indistinguibles entre sí— y usa `textSoft`, que es un token de **texto**, como
  color de dato para «Receso».
- En `dashboardTiles.jsx`, `RechazosPie` cicla una paleta de 5 colores sobre 9 rebanadas
  (`paleta[i % 5]`) y asigna el color por posición en el rango, no por entidad: dos rebanadas
  distintas comparten color y la misma categoría cambia de color al reordenarse.

El reemplazo ya validado está en la cabecera de `prototypes/dashboard-v2/palette.js`. Enlaza
con Plan 2 · A-09.

### 2.4 Lo que no es código

Esto suele ser lo que retrasa un despliegue de planta, no la técnica:

| # | Pendiente |
|---|---|
| O-1 | **Ejecutar `verificar-catalogo.mjs` contra el servidor de producción.** Los 147 puntos salieron del Excel, no del servidor: son dos artefactos que pueden divergir (R-10). |
| O-2 | **Validar los números con planta.** Que el OEE del tablero sea el OEE que la planta reconoce como suyo. Sin esta firma, el tablero no se usa. |
| O-3 | **Confirmar los umbrales de `shiftModel.js`**, que el propio código marca como «confirmar con planta» (Plan 2 · C-08). |
| O-4 | **Confirmar la nomenclatura** `LIN`/`REC` y «Multi 10/11/13» (Plan 1 §5.3). |
| O-5 | **Decidir quién opera esto**: dónde vive el servidor, quién lo reinicia, a quién se llama. |
| O-6 | **Navegadores y pantallas de destino**: resolución, versión de navegador del HMI, si hay teclado. |
| O-7 | **Runbook**: arrancar, parar, actualizar, revertir, dónde están los logs. |
| O-8 | **Auditar el histórico de git** en busca de credenciales de versiones anteriores. |

---

### 2.5 Hallazgo de O-1 · el dato no está llegando

Ejecución del 6-ago-2026 de `verificar-catalogo.mjs` contra el servidor real:

```
✓ correctos            31
⚠ MALA CALIDAD        116   de 147 puntos
```

Lo que **no** es el problema, comprobado punto por punto:

- Los assets existen. `ac:RESONAC/LIN/` lista las siete líneas, y `LIN/2`
  tiene sus 37 propiedades dadas de alta (`OEE`, `Pz_OK`, `T_Muerto_Ico`…).
- El catálogo del frontend no ha divergido del servidor: los nombres de punto
  que pide son los que existen.
- La regla de calidad del frontend es correcta: `quality.js` ya acepta las dos
  convenciones que conviven (192 de OPC-DA y **0** de OPC-UA, que es la que
  devuelve la REST API). No hay valores buenos descartados por error.

Lo que sí pasa:

| Síntoma | Lectura |
|---|---|
| `LIN/2..7` y `REC/*` devuelven `quality` con el bit alto puesto (`0x8000100C`) y **sin campo `value`** | El tag existe y no tiene dato detrás |
| `T_Muerto_Ico` falla con otro código (`0x80000035`) | Es una avería distinta de las demás |
| `LIN/1` sí entrega valor (`OEE = 37.9`) pero con marca de tiempo de **hace dos días** | Su origen también está parado, sólo que retiene el último valor |
| `T_Ciclo_Calc` y `T_Ciclo_Teo` fallan incluso en `LIN/1` | Coincide con el hallazgo del Plan 1 §8: salen de SQL externo (`Proceso_Data`) |

**Esto no se arregla desde este repositorio.** Es configuración del lado de
ICONICS: la conexión con los PLC, o la base `Proceso_Data` que alimenta los
tiempos de ciclo. Hasta que se resuelva, el tablero mostrará huecos honestos
—que es exactamente lo que se diseñó para hacer— pero no se puede validar con
planta (O-2) ni cerrar la Fase A.

Es también la confirmación empírica de por qué **P0-8** es un bloqueante: con
los datos reales caídos, una tendencia simulada sería lo único que se vería
lleno en toda la pantalla.

---

## 3. Arquitectura de despliegue

### 3.1 Sobre la idea de «el front y el back en dos contenedores»

Es la decomposición natural en la mayoría de proyectos, pero **aquí no aplica**, y por una
razón concreta: en este proyecto *el frontend no es un servicio*. Es un directorio de archivos
estáticos, y el backend ya los sirve desde el mismo origen — es una decisión deliberada de la
arquitectura, documentada en ambos README, y es la que elimina el CORS y el segundo despliegue.

Poner un nginx delante solo para servir `dist/` añadiría un contenedor, una red interna y una
configuración de proxy para conseguir exactamente lo que ya se tiene. El frontend pertenece a
la **etapa de build**, no a la de runtime:

```
etapa build (node:22)  ──►  react-dashboard/dist  ──┐
                                                     ├──►  imagen final: 1 proceso Node
backend/ (cero dependencias)  ───────────────────────┘      sirve API + estáticos
```

Lo que **sí** merece un segundo contenedor es un **proxy inverso**, pero no por los estáticos:
por TLS (P0-4), autenticación (P0-1), compresión (P1-6) y cabeceras de seguridad (P1-8). Eso es
infraestructura, y ahí sí gana estar separado del código de la aplicación.

### 3.2 Las tres opciones reales

| | A · Docker | B · Servicio de Windows | C · Docker + proxy |
|---|---|---|---|
| Reproducibilidad | Alta | Baja (copiar carpeta) | Alta |
| Reversión | `docker run` con la etiqueta anterior | Restaurar carpeta y reiniciar servicio | Igual que A |
| TLS y autenticación | Hay que añadirlos | **IIS los da hechos** (cert corporativo + Windows Auth/AD) | Los da el proxy |
| Encaja con IT de planta | Solo si ya hay host de contenedores | Siempre: es un Windows Server más | Si hay host |
| Coste de arranque | ▄ | ▁ | ▄ |
| Riesgo | Docker Desktop en Windows Server es incómodo y tiene licencia | Despliegue manual → deriva entre entornos | — |

**Decidido (6-ago-2026): opción B.** La única máquina disponible es un Windows Server, así que
no hay host de contenedores donde poner una imagen.

No es el peor resultado, y conviene decir por qué: se pierde la reproducibilidad del artefacto
—el despliegue pasa a ser copiar una carpeta— pero se **gana** lo más caro de toda la lista de
bloqueantes. IIS resuelve TLS con el certificado corporativo y la autenticación contra Active
Directory **sin escribir una línea de código de sesión**: P0-1.2 y P0-4 de un golpe, con
infraestructura que IT ya sabe operar y ya tiene monitorizada. Escribir eso en la aplicación
habría sido semanas de trabajo y un sistema de identidad propio que mantener.

Lo que se pierde por el camino —artefacto inmutable, reversión por etiqueta— hay que
reconstruirlo a mano en la Fase D: carpetas versionadas por release y un guion de reversión
ensayado (§5, D.7 y E.4).

El código de la aplicación no cambia: un proceso Node, cero dependencias, la configuración por
entorno. Esa portabilidad es el activo que conviene preservar; si mañana aparece un host de
contenedores, el mismo árbol se empaqueta sin tocar nada.

---

## 4. El artefacto de build

Destino decidido: **Windows Server con IIS delante** (§3.2, opción B). El artefacto no es una
imagen sino una **carpeta versionada**, y eso obliga a reconstruir a mano dos cosas que un
registro de contenedores daba gratis: que cada release sea inmutable y que revertir sea un
gesto y no una reconstrucción.

### 4.1 Lo que cambia respecto al build de desarrollo

1. **`VITE_ICONICS_FAKE` no debe existir en el entorno de build.** Se resuelve en compilación:
   un bundle compilado con ella queda **pegado al simulador para siempre**, enseñando datos
   inventados con aspecto de reales. El guion de empaquetado lo comprueba, no lo confía.
2. **`VITE_ENABLE_DEMO` tampoco.** Mismo mecanismo: hornea el interruptor que sustituye la
   planta por datos de ejemplo. Un bundle de planta no lo lleva.
3. **`VITE_API_BASE` vacía.** El backend sirve el bundle desde su mismo origen y las rutas
   relativas `/api/...` funcionan solas ([apiClient.js:9](../react-dashboard/src/lib/iconics/apiClient.js#L9)).
   Vacía significa además que **el mismo build sirve para cualquier servidor**.
4. **La versión se estampa sola.** `vite.config.js` resuelve `git describe --always --dirty
   --tags` en la compilación y lo inyecta como `VITE_APP_VERSION`. Se hace ahí, y no en el
   despliegue, porque si dependiera de que alguien exporte una variable, el día que se olvide
   la pantalla mostraría una versión que no es la suya — y una versión equivocada es peor que
   ninguna. `APP_VERSION` se pasa además al backend para que `/api/health` diga lo mismo.

### 4.2 La estructura en el servidor

```
D:\IconicsDashboard\
├── releases\
│   ├── v1.4.0-a1b2c3d\          ← una carpeta por release, NO se toca tras copiarla
│   │   ├── backend\
│   │   ├── public\              ← el contenido de react-dashboard\dist
│   │   └── VERSION
│   └── v1.3.0-9f8e7d6\          ← la anterior, intacta: es la reversión
├── current  →  junction a releases\v1.4.0-a1b2c3d
├── config\
│   └── .env.production          ← ACL: sólo la cuenta del servicio y los administradores
└── logs\
```

`current` es un *junction* de NTFS (`mklink /J`) y el servicio apunta siempre ahí. Revertir es
rehacer el enlace y reiniciar el servicio: dos comandos, sin recompilar y sin red. Es la pieza
que sustituye a «cambiar la etiqueta de la imagen», y sin ella una reversión a las 3 de la
mañana implica volver a compilar en una máquina que no tiene Node de desarrollo.

El `.env.production` vive **fuera** de las releases a propósito: sobrevive a los despliegues y
sus permisos se auditan una vez.

### 4.3 Empaquetado

Se compila en una máquina de desarrollo —el servidor de planta no necesita Node de desarrollo,
ni git, ni `node_modules`— y se copia el resultado.

```powershell
# deploy\empaquetar.ps1   (a escribir en D.1)
$ErrorActionPreference = "Stop"

# 1 · Las banderas que no deben viajar al bundle
foreach ($v in "VITE_ICONICS_FAKE", "VITE_ENABLE_DEMO") {
  if (Test-Path "env:$v") { throw "$v está definida: ese bundle no puede ir a planta." }
}

# 2 · Las dos suites. Si no pasan, no hay paquete.
node scripts\verificar-backend.mjs
Push-Location react-dashboard; npm ci; npm test; npm run build; Pop-Location

# 3 · La carpeta de release
$tag = (git describe --always --dirty --tags).Trim()
if ($tag -like "*-dirty") { throw "El árbol tiene cambios sin confirmar: la versión mentiría." }

$dest = "dist-release\$tag"
New-Item -ItemType Directory -Force $dest | Out-Null
Copy-Item backend $dest\backend -Recurse
Copy-Item react-dashboard\dist\* $dest\public -Recurse
Set-Content "$dest\VERSION" $tag

Compress-Archive "$dest\*" "dist-release\$tag.zip"
```

Tres cosas que hace este guion y que conviene no perder al retocarlo: **comprueba las banderas
antes de compilar**, **corre las dos suites** —las 51 comprobaciones del backend y las 125 del
frontend— y **se niega a empaquetar un árbol sucio**, porque una versión con `-dirty` no
identifica nada y es exactamente la que acaba en la pantalla que nadie sabe reproducir.

### 4.4 El servicio de Windows

Node se registra como servicio con [NSSM](https://nssm.cc/) para que arranque solo tras un
reinicio del equipo (P1-1) y se reinicie si el proceso muere:

```powershell
nssm install IconicsDashboard "C:\Program Files\nodejs\node.exe"
nssm set IconicsDashboard AppParameters "--env-file=D:\IconicsDashboard\config\.env.production backend\server.mjs"
nssm set IconicsDashboard AppDirectory  "D:\IconicsDashboard\current"
nssm set IconicsDashboard AppExit Default Restart
nssm set IconicsDashboard AppStdout "D:\IconicsDashboard\logs\dashboard.log"
nssm set IconicsDashboard AppStderr "D:\IconicsDashboard\logs\dashboard.err.log"

# Rotación: sin esto el log crece hasta llenar el disco (P1-4)
nssm set IconicsDashboard AppRotateFiles 1
nssm set IconicsDashboard AppRotateBytes 10485760

# Cuenta de servicio dedicada, sin sesión interactiva ni permisos de admin
nssm set IconicsDashboard ObjectName ".\svc_dashboard" "<contraseña>"
```

Fuera de un TTY el logger ya escribe **una línea JSON por evento**, que es lo que un recolector
sabe indexar. No hay que cambiar nada para eso.

### 4.5 IIS delante

Es lo que resuelve los dos bloqueantes más caros, y por eso el proxy no es opcional:

| Qué aporta | Cierra |
|---|---|
| TLS con el certificado corporativo | **P0-4** |
| Autenticación de Windows / AD | **P0-1.2** |
| Compresión estática y dinámica | P1-6 |
| `Cache-Control: immutable` en `/assets/*` y `no-cache` en `index.html` | P1-6 |
| Cabeceras de seguridad (CSP, `X-Content-Type-Options`, `frame-ancestors`) | P1-8 |

Montaje: **URL Rewrite + Application Request Routing**, con el sitio publicando `https://` y
reenviando a `http://127.0.0.1:3001`. El backend sigue escuchando sólo en local, así que el
único camino hacia él pasa por IIS y su autenticación.

Dos detalles que hay que acertar o el resultado engaña:

- **`TRUST_PROXY=true`** en el `.env.production`. Sin esto, todas las pantallas llegan al
  limitador con la IP de IIS y se cuentan como un solo cliente: la primera que se pase corta a
  todas las demás.
- **`Cache-Control: no-cache` en `index.html`**. Los chunks llevan hash en el nombre y se
  pueden cachear para siempre; el `index.html` no, o una pantalla seguirá pidiendo los chunks
  de la release anterior después de un despliegue.

### 4.6 Variables del entorno de producción

| Variable | Valor | Nota |
|---|---|---|
| `ICONICS_API_BASE` | `https://servidor/fwxapi/rest/v1` | |
| `ICONICS_USERNAME` / `ICONICS_PASSWORD` | cuenta de servicio | **de solo lectura** (P0-5) |
| `ICONICS_POINT_NAME` | punto por defecto | |
| `ICONICS_READ_ONLY` | *(no ponerla)* | ✅ ya vale `true` por defecto |
| `CORS_ORIGINS` | *(no ponerla)* | ✅ ya está vacía por defecto |
| `TRUST_PROXY` | `true` | obligatorio con IIS delante |
| `NODE_ENV` | `production` | activa las comprobaciones de arranque |
| `APP_VERSION` | la del `VERSION` de la release | lo pone el guion de despliegue |
| `STATIC_DIR` | `D:\IconicsDashboard\current\public` | |
| `NODE_EXTRA_CA_CERTS` | ruta a la CA de ICONICS | sustituye a `NODE_TLS_REJECT_UNAUTHORIZED` |
| `LOG_LEVEL` | `INFO` | JSON automático fuera de TTY |
| `NODE_TLS_REJECT_UNAUTHORIZED` | **ausente** | ✅ con `NODE_ENV=production` el arranque falla si aparece |

Los cuatro ✅ ya no son trabajo pendiente: los defectos del backend son los seguros desde la
Fase B. La plantilla comentada de todo esto está en [`.env.example`](../.env.example).

La zona horaria (P1-14) la hereda del sistema, que en un Windows Server de planta ya es la
correcta. Es la única ventaja real de este destino frente a un contenedor, donde había que
declararla.

### 4.7 El despliegue, paso a paso

```powershell
# En desarrollo
.\deploy\empaquetar.ps1                    # suites + build + dist-release\<tag>.zip

# En el servidor, como administrador
Expand-Archive dashboard-<tag>.zip -DestinationPath D:\IconicsDashboard\releases\<tag>

# Humo ANTES de dirigir tráfico: arranca en un puerto aparte y comprueba que
# sirve el tablero y que responde la salud. No necesita ICONICS.
$env:PORT=3999; $env:STATIC_DIR="D:\IconicsDashboard\releases\<tag>\public"
node D:\IconicsDashboard\releases\<tag>\backend\server.mjs
curl.exe -fsS http://localhost:3999/api/health/live
curl.exe -fsS http://localhost:3999/ | Select-String '<div id="root">'

# Cambiar el puntero y reiniciar
Remove-Item D:\IconicsDashboard\current -Force
cmd /c mklink /J D:\IconicsDashboard\current D:\IconicsDashboard\releases\<tag>
Restart-Service IconicsDashboard

# Verificar contra el servidor real
node scripts\verificar-catalogo.mjs        # los 147 puntos existen
node scripts\verificar-historia.mjs        # el historiador entrega muestras
curl.exe -fsS https://tablero/api/health   # debe decir status ok y la versión nueva
```

**Revertir** es el mismo cambio de junction apuntando a la release anterior, más un
`Restart-Service`. Eso es lo que hay que ensayar y cronometrar (E.4), no dejarlo escrito.

Los verificadores de los pasos finales **ya existen en el repositorio**: no hay que escribir el
arnés de pruebas del despliegue, hay que conectarlo.

---

## 5. Fases de ejecución

### Fase A · Cerrar el Plan 1 `requiere servidor` ▄

No se empaqueta lo que aún no lee datos reales.

- **A.1** Fase 7 del Plan 1: verificación del catálogo contra el servidor de producción (O-1).
- **A.2** Fase 8: calibrar cadencias con la latencia medida y recorrer los escenarios de fallo.
- **A.3** Conectar o retirar la tendencia del Dashboard y el Comparativo (P0-8).

*Criterio de salida:* ningún número en pantalla procede de una serie simulada.

### Fase B · Endurecer el puente `sin servidor` ▄ · **HECHA**

Todo esto es código del backend, se prueba con `verificar-backend.mjs` y no necesita ICONICS.

- **B.1** ✅ `ICONICS_READ_ONLY`, **`true` por defecto** (P0-1.1). Corrección sobre lo
  planeado: las rutas **sí se registran** y responden 403. Sin registrarlas no habría ruta, la
  petición caería al respaldo de la SPA y un `POST /write` devolvería el `index.html` con un
  **200** — el cliente no escribiría nada y creería que sí.
- **B.2** ✅ `CORS_ORIGINS` con lista explícita, vacía por defecto (P0-2). El CORS sale de
  `responses.mjs` a `http/cors.mjs` y se aplica una vez por petición con `setHeader()`, antes
  del despacho: deja de estar duplicado entre el preflight y las respuestas —que es lo que ya
  había divergido una vez— y lo heredan también los estáticos y el 405 del router.
- **B.3** ✅ `AbortSignal.timeout` en `request()` (P0-7). El corte se distingue como **504**,
  no como el 502 genérico: "tardó demasiado" y "no se pudo conectar" se arreglan en sitios
  distintos.
- **B.4** ✅ `/api/health/live` (no consulta a ICONICS) y `/api/health/ready` (sí); `/api/health`
  se mantiene como alias de `ready`. Ambas informan de `version` (P1-2, P1-11).
- **B.5** ✅ Límite por IP con `TRUST_PROXY` (P1-12). Sin esa variable, detrás del proxy inverso
  del §3 todas las pantallas llegan con la IP del proxy y el límite las corta a la vez.
- **B.6** ✅ `NODE_TLS_REJECT_UNAUTHORIZED=0` impide el arranque con `NODE_ENV=production`; fuera
  de producción arranca y lo avisa por el log (P0-3).
- **B.7** ✅ Caché de 2 s en `readPoints()` (P1-13). Guarda la promesa, no el resultado, así que
  las peticiones que llegan con la llamada en vuelo esperan a esa misma —mismo patrón que
  `pendingAuthentication`—. Un fallo no se cachea, para no retrasar la recuperación.

Añadido de paso: `UPSTREAM_TIMEOUT_MS`, `BATCH_CACHE_TTL_MS`, `RATE_LIMIT_MAX` y
`RATE_LIMIT_WINDOW_MS` son ajustables por entorno. Son los cuatro valores que dependen de cómo
se comporte *esta* planta, y no tiene sentido que obliguen a recompilar.

*Criterio de salida:* **cumplido.** `verificar-backend.mjs` pasa de 30 a **51 comprobaciones**,
con un bloque por cada punto de la fase.

### Fase C · Recortar el frontend a lo que va a producción `sin servidor` ▄ · **HECHA**

- **C.1** ✅ Decidido: **operación + Assets**. Assets se queda porque es la herramienta con la
  que se diagnostica un «falta un dato en el panel», que es justo lo que §2.5 anticipa.
- **C.2** ✅ `Data` y `Sankey` se quedan en el árbol **sin ruta**: nadie los importa, así que no
  entran en el bundle, y son reversibles si Data vuelve detrás de autenticación. `SankeyChart`
  sí sigue en producción: lo usa el detalle de máquina.
- **C.2·bis** ✅ **Las 12 propuestas de `src/prototypes/` vuelven, pero sólo al build de demo.**
  Primero se borraron y después se recuperaron por decisión de producto: son útiles para
  enseñar y comparar diseños, y no tienen por qué estar en la pared de la planta para eso. Se
  cargan con `import()` dinámico dentro de un ternario sobre `DEMO_HABILITADO`, así que en el
  build de planta **ni siquiera se generan sus trozos**.

  Las dos condiciones son frágiles y las dos se descubrieron rompiéndolas: con un `import`
  normal el módulo viaja al bundle aunque su ruta no se registre, y con una función auxiliar
  —que leía mejor— el empaquetador ya no puede probar que la rama está muerta y emitía los doce
  `import()` igualmente. Por eso `DEMO_HABILITADO` se escribe sin `?.` y la condición es un
  ternario literal. `src/test/app/routes.test.jsx` fija el lado observable.

  De paso: el README de `src/prototypes/` decía «13 entradas» y su propia lista enumeraba doce.
  Son **12**.
- **C.3** ✅ Modo demo bajo `VITE_ENABLE_DEMO`, apagado por defecto. El cierre está en el
  modelo y no sólo en que el Topbar oculte el botón: `setMode`/`toggleMode` ignoran la demo, y
  la preferencia guardada se descarta al arrancar —si no, una pantalla que quedó en demo antes
  de apagar la bandera volvería a arrancar en demo, y ya sin botón para sacarla—. Sobrevive el
  **indicador** de origen, que sigue distinguiendo servidor real de simulador.
- **C.4** ✅ `ErrorBoundary` por página (con `resetKey`, para que se rearme al navegar) y en la
  raíz. No usa `useTheme()` a propósito: si lo que falla fuera el proveedor de tema, la
  pantalla de error fallaría con él (P1-9).
- **C.5** ✅ Versión en el Topbar y en `/api/health`, estampada por `vite.config.js` desde
  `git describe` (P1-2).
- **C.6** ✅ Navegación en la URL con la History API —el backend ya servía el `index.html` en
  cualquier ruta, así que no hizo falta ni configuración ni un enrutador nuevo—. Seis pruebas
  cubren enlace profundo, recarga, botón «atrás», ruta desconocida y rutas reservadas del
  build (P1-10).
- **C.7** ✅ Bundle partido en cuatro por origen del módulo (P1-7).

*Criterio de salida:* **cumplido en lo que importa, con una corrección.** El menú sólo contiene
vistas que un operador debe ver. El presupuesto de «bundle principal por debajo de 350 KB» que
fijaba este plan **era irreal y se corrige aquí**: recharts pesa 382 KB por sí solo y lo usa la
vista de Planta, que es la ruta por defecto, así que ninguna partición lo saca del primer
arranque. Lo que sí se consiguió:

| | Antes | Ahora (build de planta) |
|---|---|---|
| Archivos | 1 | 4 |
| Código de la aplicación | — | **153 KB** (44 KB gzip) |
| `charts` (recharts + d3) | — | 382 KB |
| `react` | — | 142 KB |
| `vendor` | — | 77 KB |
| **Total** | **868 KB** | **755 KB** |

El total baja poco; lo que cambia de verdad es que **un despliegue normal invalida 153 KB en
vez de 868 KB**, porque las librerías conservan su hash. En un wallboard, que recarga tras cada
despliegue y poco más, ese es el número que se nota.

El build de **demo** añade sobre eso 12 trozos con las propuestas (~80 KB en total, ninguno
mayor de 38 KB) que se descargan sólo al abrir cada una. Pruebas del frontend: **141**.

### Fase D · Empaquetar y desplegar ▄ · **Windows Server** · escrita, a medio verificar

Todo lo que no necesita el servidor delante está hecho y probado. Lo que sí lo necesita está
escrito y comentado, pero **sin ejecutar ni una vez**, y conviene tratarlo como tal.

| | Estado |
|---|---|
| **D.1** `deploy\empaquetar.ps1` | ✅ **probado** — los tres rechazos y el camino feliz |
| **D.2** `deploy\desplegar.ps1` | ✅ **probado** — despliegue, cambio de versión y reversión |
| **D.3** `deploy\instalar-servicio.ps1` | ⚠️ escrito, sin ejecutar (necesita NSSM y admin) |
| **D.4/D.5** `deploy\iis\web.config` | ⚠️ escrito, sin ejecutar (necesita IIS) |
| **D.6/D.7** `deploy\env.production.example` | ⚠️ plantilla lista; los valores dependen de accesos |
| **D.8** Staging | ⛔ bloqueada: no hay servidor |

**Lo probado, y con qué resultado.**
`empaquetar.ps1` se niega a producir un paquete en los tres casos que lo justifican: con una
bandera de demo en el entorno, con el árbol de git sucio, y —el que de verdad importa— con la
bandera colada por `react-dashboard\.env.local`, que ninguna revisión del entorno detecta. Ese
tercer guarda inspecciona el bundle **ya compilado**; se comprobó ensuciando el `.env.local` a
propósito y cazó los 13 trozos de propuesta.

`desplegar.ps1` se ejecutó completo contra una raíz de ensayo: extrae, prueba la release **en
un puerto aparte antes de darle tráfico** —arrancando Node de verdad—, cambia el junction,
sincroniza `APP_VERSION` y reinicia. La **reversión tardó 0,1 s** más el reinicio del servicio,
con las dos releases intactas en disco y las credenciales del `.env.production` sin tocar. Eso
cubre **E.4** salvo por hacerlo una vez sobre el servidor real.

**Dos decisiones que salieron de escribirlo.**

- Los guiones del servidor están escritos para **Windows PowerShell 5.1**, no para el 7. Es el
  que trae un Windows Server de fábrica, y no compensa exigir una instalación más sólo para
  desplegar. Eso descartó `Start-Process -Environment` y obligó a desempaquetar el `.Target`
  del junction, que en 5.1 es una colección y no una cadena — un fallo que habría dejado la
  reversión sin saber a dónde volver, justo cuando hace falta.
- `desplegar.ps1` exige privilegios **sólo si hay un servicio que reiniciar**, que es lo único
  que los necesita. Así un ensayo sobre una raíz de prueba se puede lanzar sin elevar, y la
  comprobación sigue protegiendo el caso real. Y se hace antes de tocar nada: fallar a mitad,
  con `current` ya borrado, deja el tablero caído por una razón evitable.

*Criterio de salida:* **no cumplido todavía.** Falta levantarlo desde cero en una máquina
limpia siguiendo el runbook ([`deploy/LEEME.md`](../deploy/LEEME.md)). Lo que ese runbook pide
por adelantado son siete accesos, no siete tareas: la máquina, el certificado corporativo, el
grupo de AD, la cuenta ICONICS de solo lectura, la CA del servidor, la cuenta de servicio, y
NSSM con los módulos de IIS.

### Fase E · Operación ▄

- **E.1** Monitor sobre `/api/health/ready` con alerta a un destinatario **que existe** (P1-5).
- **E.2** Runbook: arrancar, parar, actualizar, revertir, dónde están los logs (O-7).
- **E.3** Etiquetas de versión y notas de release (P2-4).
- **E.4** Ensayo de reversión: volver a la etiqueta anterior y cronometrarlo. Una reversión que
  no se ha ensayado no es una reversión, es una esperanza.
- **E.5** Firma de planta sobre los números (O-2, O-3, O-4).

*Criterio de salida:* alguien que no escribió este código puede desplegarlo y revertirlo
siguiendo el runbook.

**Camino crítico:** A → B → C → D → E. B y C son independientes entre sí y pueden ir en
paralelo. Con una persona a tiempo completo, del orden de tres a cuatro semanas; la Fase A
depende de la disponibilidad del servidor y es la que más puede estirarse.

---

## 6. Checklist de Go / No-Go

Ninguna de estas líneas es opinable. Si una está sin marcar, no se despliega.

**Seguridad**
- [x] **La escritura está cerrada por defecto** en el puente (P0-1.1 · Fase B)
- [ ] Ninguna ruta accesible sin autenticación de usuario (P0-1.2 · D.5)
- [x] **El arranque falla con `NODE_TLS_REJECT_UNAUTHORIZED` en producción** (P0-3 · Fase B)
- [ ] CA de ICONICS instalada y `NODE_EXTRA_CA_CERTS` apuntando a ella (P0-3 · D.7)
- [ ] Tablero servido por HTTPS (P0-4 · D.4)
- [ ] Cuenta de servicio ICONICS de mínimo privilegio, secreto fuera del repositorio (P0-5 · D.6)
- [x] **CORS restringido**, y vacío por defecto (P0-2 · Fase B)
- [ ] Histórico de git auditado, sin credenciales (O-8)

**Correctitud**
- [ ] Ningún dato en pantalla procede de una serie simulada (P0-8)
- [ ] `verificar-catalogo.mjs` en verde contra el servidor de producción (O-1) — **hoy: 116 de
      147 puntos en mala calidad, ver §2.5**
- [ ] Zona horaria del proceso = zona horaria de la planta (P1-14 · la hereda del servidor)
- [ ] Los números validados y firmados por planta (O-2)

**Operación**
- [ ] El proceso arranca solo tras un reinicio de la máquina (P1-1 · D.3)
- [x] **`/api/health` dice qué versión corre**, y también el Topbar (P1-2 · Fases B y C)
- [ ] Hay un monitor y una alerta con destinatario real (P1-5)
- [ ] La reversión está ensayada y cronometrada (E-4)
- [ ] Existe un runbook y alguien que sepa aplicarlo (O-5, O-7)

**Superficie**
- [x] **Sin prototipos, Sandbox ni escrituras a `db:Northwind` en el bundle** (P0-6 · Fase C)
- [x] **Modo demo no alcanzable desde la interfaz de producción** (P0-6 · Fase C)

---

## 7. Dónde estamos

De los ocho bloqueantes, **cinco están cerrados** y son todos los que dependían únicamente de
este repositorio: el puente ya no escribe salvo que se le pida, no acepta CORS de nadie, no
arranca con el TLS relajado en producción, no puede colgarse esperando a ICONICS, y el bundle
ya no lleva prototipos, borrados sobre `db:Northwind` ni un interruptor de datos inventados.

Los tres que quedan no son de código:

- **P0-1.2, P0-4, P0-5** son la Fase D, y salen casi gratis porque IIS ya trae la
  autenticación y el TLS que habría que haber escrito a mano. Necesitan accesos, no trabajo.
- **P0-8** —y con él la Fase A entera— está bloqueado por algo que este proyecto no puede
  arreglar: **el dato no está llegando desde ICONICS**. 116 de 147 puntos vuelven vacíos y la
  única máquina que responde lleva dos días sin actualizarse (§2.5).

Ese último es ahora el camino crítico. Todo lo demás se puede terminar, pero un tablero de OEE
no se despliega hasta que los números que enseña sean los de la planta — y hoy no hay números
que enseñar.
