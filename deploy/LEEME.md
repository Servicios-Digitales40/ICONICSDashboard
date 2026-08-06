# Despliegue y operación

Runbook del tablero ICONICS en el servidor de planta. Destino decidido en el
[Plan 3 §3.2](../docs/PLAN-3-PRODUCCION.md): **Windows Server con IIS
delante**, Node como servicio.

El reparto es el mismo en todo: **se compila en desarrollo, se copia al
servidor**. El servidor no necesita git, ni `node_modules`, ni herramientas de
compilación — sólo Node.

| Guion | Dónde se ejecuta | Cuándo |
|---|---|---|
| `empaquetar.ps1` | máquina de desarrollo | cada vez que se libera una versión |
| `desplegar.ps1` | servidor, como admin | cada despliegue y cada reversión |
| `instalar-servicio.ps1` | servidor, como admin | una sola vez |
| `iis/web.config` | sitio de IIS | una sola vez |

---

## Lo que hace falta antes de empezar

Nada de esto se resuelve desde el repositorio, y es la parte lenta. Conviene
pedirlo con tiempo:

| # | Qué | Para qué |
|---|---|---|
| 1 | Un Windows Server con Node 18+ y acceso de red al servidor ICONICS | correr el tablero |
| 2 | Certificado corporativo para el nombre del sitio | TLS (P0-4) |
| 3 | Grupo de Active Directory con quién puede ver el tablero | autenticación (P0-1.2) |
| 4 | Cuenta ICONICS **dedicada y de solo lectura** | P0-5 |
| 5 | La CA que firma el certificado del servidor ICONICS, en PEM | P0-3 · D.7 |
| 6 | Cuenta de servicio de Windows sin sesión interactiva | P0-5 |
| 7 | [NSSM](https://nssm.cc) y los módulos **URL Rewrite** y **ARR** de IIS | servicio y proxy |

---

## Antes del primer `.\algo.ps1`: la política de ejecución

Windows bloquea por defecto la ejecución de guiones, y el mensaje —«la ejecución
de scripts está deshabilitada en este sistema»— no dice cómo salir de ahí. Tres
formas, de menos a más permanente:

```powershell
# a) Sólo para esta ejecución. No deja nada configurado.
powershell -ExecutionPolicy Bypass -File .\empaquetar.ps1

# b) Sólo para esta ventana.
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

# c) Para tu usuario, de forma permanente. No necesita administrador.
#    RemoteSigned permite los guiones locales y sigue exigiendo firma a los
#    descargados, que es el equilibrio razonable.
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

**La trampa:** *PowerShell 7 y Windows PowerShell 5.1 guardan esa política en
claves de registro distintas.* Configurarla en uno no la configura en el otro,
así que el mismo guion puede correr en `pwsh` y ser rechazado en
`powershell.exe` de la misma máquina. Si el rechazo aparece de la nada, es casi
siempre eso.

En un **Windows Server** suele no hacer falta: 5.1 viene con `RemoteSigned` de
fábrica en las ediciones de servidor, al contrario que en Windows cliente.

> Si alguien edita estos guiones, hay que **guardarlos en UTF-8 con BOM**.
> Windows PowerShell 5.1 lee los `.ps1` como ANSI cuando no hay BOM, y los
> acentos y los caracteres de los separadores se convierten en un error de
> sintaxis que no señala la causa. Los editores suelen ofrecer
> «UTF-8 with BOM» en el selector de codificación.

---

## Instalación, la primera vez

```powershell
# ── en desarrollo ────────────────────────────────────────────────
.\deploy\empaquetar.ps1
#   → dist-release\<version>.zip   (copia ese archivo al servidor)

# ── en el servidor, como administrador ───────────────────────────

# 1 · La release, con su humo previo
.\desplegar.ps1 -Paquete <ruta-al-zip-copiado>

# 2 · La configuración. Copia la plantilla y rellena credenciales.
copy env.production.example D:\IconicsDashboard\config\.env.production
notepad D:\IconicsDashboard\config\.env.production

# 3 · Permisos del secreto: sólo el servicio y los administradores
icacls D:\IconicsDashboard\config\.env.production /inheritance:r
icacls D:\IconicsDashboard\config\.env.production /grant "svc_dashboard:(R)"
icacls D:\IconicsDashboard\config\.env.production /grant "Administrators:(F)"

# 4 · La CA de ICONICS (sin esto el servicio NO arranca en producción)
certutil -encode ca.cer D:\IconicsDashboard\config\iconics-ca.pem

# 5 · El servicio
.\instalar-servicio.ps1 -Cuenta ".\svc_dashboard"

# 6 · IIS: copiar web.config al sitio y seguir sus comentarios
#     (habilitar el proxy de ARR, Windows Authentication, reglas de acceso)
```

**El orden importa.** El paso 1 antes que el 5 porque el servicio apunta a
`current`, que no existe hasta el primer despliegue. Y el 4 antes que el 5
porque con `NODE_ENV=production` el servicio se niega a arrancar si alguien
intentó salir del paso con `NODE_TLS_REJECT_UNAUTHORIZED=0`.

---

## Un despliegue normal

```powershell
# en desarrollo
.\deploy\empaquetar.ps1

# en el servidor
.\desplegar.ps1 -Paquete <ruta-al-zip-copiado>
```

Eso es todo. El guion extrae, **prueba la release en un puerto aparte antes de
darle tráfico**, cambia el junction, sincroniza `APP_VERSION` y reinicia. Si el
humo falla, no toca nada y la versión que estaba sirviendo sigue sirviendo.

Para confirmar qué build quedó, sin entrar al servidor: la versión se ve en la
esquina del Topbar y en `https://<host>/api/health`.

---

## Arrancar una release a mano

Para un ensayo, o para mirar qué hace una versión sin tocar el servicio:

```powershell
cd D:\IconicsDashboard\current
node --env-file=D:\IconicsDashboard\config\.env.production backend\server.mjs
```

No hace falta `STATIC_DIR`: sin esa variable el backend busca el tablero en
`public/`, que es donde lo deja el empaquetado, y sólo si no lo encuentra cae
al `react-dashboard/dist` del repositorio.

---

## Reversión

```powershell
.\desplegar.ps1 -Revertir                    # a la anterior
.\desplegar.ps1 -Revertir -Version 1a2b3c4   # a una concreta
```

Vuelve a la release indicada: **la prueba en un puerto aparte antes de cambiar
el puntero** —igual que al instalar—, rehace el junction, sincroniza
`APP_VERSION` y reinicia. Si esa release no arranca, no la activa y te dice
cuáles quedan: se revierte con prisa, y descubrir entonces que la reversión
tampoco sirve es el peor momento posible. **Medido en ensayo: 0,1 s** más el reinicio del servicio. No
recompila, no necesita red y no depende de que la máquina de desarrollo esté
encendida.

Las releases antiguas se quedan en `D:\IconicsDashboard\releases\`. Ocupan
poco (~0,25 MB cada una); conviene conservar al menos las tres últimas.

---

## Cuando algo va mal

**Lo primero, siempre:**

```powershell
Get-Service IconicsDashboard
Invoke-WebRequest http://127.0.0.1:3001/api/health -UseBasicParsing | Select -Expand Content
Get-Content D:\IconicsDashboard\logs\dashboard.err.log -Tail 40
```

`/api/health` distingue tres averías distintas, y cada una se arregla en un
sitio:

| `status` | Significa | Dónde mirar |
|---|---|---|
| `ok` | se llega a ICONICS y hay token | — |
| `degraded` | se llega, pero no autentica | credenciales o permisos de la cuenta ICONICS |
| `error` | no se llega | red, servicio ICONICS caído, o `ICONICS_API_BASE` |

**Síntomas concretos:**

| Lo que se ve | Causa habitual |
|---|---|
| El servicio no arranca y el log dice `NODE_TLS_REJECT_UNAUTHORIZED` | Esa variable está en el `.env.production`. Es deliberado: instala la CA y usa `NODE_EXTRA_CA_CERTS` (D.7). |
| 502 desde IIS | El servicio está parado, o falta habilitar el proxy en ARR. |
| El tablero se ve, pero todo son huecos «—» | No es el despliegue. Es que ICONICS no está entregando datos: ver [Plan 3 §2.5](../docs/PLAN-3-PRODUCCION.md). Confírmalo con `verificar-catalogo.mjs`. |
| Muchos 429 | El limitador cuenta a todas las pantallas como una: falta `TRUST_PROXY=true`, o las reglas de `X-Forwarded-For` del `web.config`. |
| Tras desplegar, la pantalla sigue en la versión vieja | El `index.html` se está cacheando. Revisa las reglas de salida del `web.config`. |
| El menú muestra «Sandbox» o «Planta · v2» | Se desplegó un build de **demo**. `desplegar.ps1` lo rechaza; si llegó, alguien copió a mano. Vuelve a empaquetar. |
| Las alarmas no coinciden con la hora de planta | Zona horaria del servidor: el rango se construye con la hora local del proceso. |

**Parar y arrancar a mano:**

```powershell
Restart-Service IconicsDashboard
Stop-Service IconicsDashboard
Start-Service IconicsDashboard
```

---

## Verificadores contra el servidor real

Viven en `scripts/` del repositorio y se lanzan desde una máquina con el
código, apuntando al backend que se quiera comprobar:

```powershell
node scripts\verificar-catalogo.mjs    # ¿existen los 147 puntos del catálogo?
node scripts\verificar-historia.mjs    # ¿el historiador entrega muestras?
```

Conviene pasarlos **cada vez que cambie la configuración de ICONICS** y ante
cualquier «falta un dato en el panel»: resuelven en una ejecución lo que si no
obliga a ir vista por vista.

---

## Lo que este runbook todavía no puede prometer

Los guiones de `empaquetar.ps1` y `desplegar.ps1` están **probados**: los tres
rechazos del primero y el ciclo completo de despliegue y reversión del segundo,
sobre una raíz de ensayo.

`instalar-servicio.ps1` y `iis/web.config` **no se han podido ejecutar**: hacen
falta NSSM, IIS y un Windows Server. Están escritos con cuidado y comentados,
pero la primera vez que se lancen habrá que leer su salida con atención y
corregir lo que la realidad del servidor imponga. Cuando eso pase, conviene
volver aquí y anotarlo.
