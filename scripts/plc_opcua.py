#!/usr/bin/env python
"""
Hablar con los PLC por OPC UA, sin pasar por ICONICS.

── PARA QUÉ SIRVE ESTO SI YA ESTÁ ICONICS ────────────────────────────

Para saber de qué lado está un problema. Cuando una señal no llega al
tablero, hay tres sospechosos —el PLC, ICONICS y el puente— y desde el
tablero no se distinguen: los tres se ven igual, como un hueco.

Este script se salta ICONICS entero y habla con el PLC directamente. Si
el dato está aquí y no en el tablero, el PLC está bien y el problema es
de ICONICS para arriba. Si tampoco está aquí, es del PLC o de la red.

Esa distinción costó horas de esta puesta en marcha, y se resolvía en
diez segundos con esto.

── LA RED, QUE TIENE UNA TRAMPA ──────────────────────────────────────

Esta máquina tiene DOS interfaces en la misma subred 192.168.0.x:

    Ethernet 2   192.168.0.199
    Wi-Fi        192.168.0.100

Windows elige por su tabla de rutas, no por lo que uno piense. Medido el
31-08-2026, la conexión salió por **Wi-Fi**, aunque `Find-NetRoute`
anunciaba Ethernet 2. Si algún día un PLC responde a ping y no a OPC UA,
mirar por dónde está saliendo es de las primeras cosas que comprobar:

    Test-NetConnection 192.168.0.1 -Port 4840 -InformationLevel Detailed

Y ojo con `Test-NetConnection` a secas: dio `TcpTestSucceeded: False` con
el puerto ABIERTO. Un socket a pelo —como el de este script— es más de
fiar que su diagnóstico.

── LOS DOS PLC ───────────────────────────────────────────────────────

    192.168.0.1   PLC_1   el sistema del tanque      (ua:DEMO2 en ICONICS)
    192.168.0.5   PLC_2   el de vibraciones          (ua:DEMO3 en ICONICS)

Son instalaciones SEPARADAS: distinto motor, distinto variador, distinto
PLC. No se cruzan sus señales.

── USO ───────────────────────────────────────────────────────────────

    pip install asyncua

    python scripts/plc_opcua.py                      los dos, resumen
    python scripts/plc_opcua.py --arbol 192.168.0.5  recorrer sus nodos
    python scripts/plc_opcua.py --leer 192.168.0.5 'ns=3;s="DB".Var'
"""
import asyncio
import sys

from asyncua import Client

PLCS = {
    "192.168.0.1": "PLC_1 · sistema del tanque",
    "192.168.0.5": "PLC_2 · sistema de vibraciones",
}

TIEMPO_ESPERA = 8


async def conectar(ip):
    """Cliente conectado, o `None` con el motivo ya impreso.

    No se deja escapar la excepción: quien ejecuta esto suele estar
    diagnosticando una caída, y un traceback de asyncua no dice si el
    problema es la red, el puerto o el servidor.
    """
    url = f"opc.tcp://{ip}:4840"
    try:
        cliente = Client(url=url, timeout=TIEMPO_ESPERA)
        await cliente.connect()
        return cliente
    except asyncio.TimeoutError:
        print(f"  sin respuesta en {TIEMPO_ESPERA} s — ¿el PLC está encendido y en red?")
    except ConnectionRefusedError:
        print("  conexión rechazada — el PLC responde pero su servidor OPC UA no está activo")
    except Exception as e:
        print(f"  {type(e).__name__}: {str(e)[:150]}")
    return None


async def resumen(ip, etiqueta):
    """Qué publica este PLC en su raíz. Es la comprobación de vida."""
    print(f"\n=== {ip}  {etiqueta} ===")
    cliente = await conectar(ip)
    if cliente is None:
        return
    try:
        objetos = cliente.get_objects_node()
        for hijo in await objetos.get_children():
            nombre = await hijo.read_browse_name()
            print(f"  {nombre.Name:<18} {hijo.nodeid.to_string()}")
    finally:
        await cliente.disconnect()


async def arbol(ip, nodo_id=None, profundidad=3):
    """Recorre los nodos y enseña el VALOR de los que lo tienen.

    Es lo que hace falta para averiguar cómo se llama un tag: en ICONICS
    los nombres llegan ya traducidos —`ua:DEMO3\\[http://BMS_1]i=460`— y
    aquí se ven como los publica el PLC.
    """
    print(f"\n=== árbol de {ip} ===")
    cliente = await conectar(ip)
    if cliente is None:
        return
    try:
        raiz = cliente.get_node(nodo_id) if nodo_id else cliente.get_objects_node()
        await _recorrer(raiz, 0, profundidad)
    finally:
        await cliente.disconnect()


async def _recorrer(nodo, nivel, tope):
    if nivel > tope:
        return
    for hijo in await nodo.get_children():
        try:
            nombre = (await hijo.read_browse_name()).Name
        except Exception:
            continue

        valor = ""
        try:
            v = await hijo.read_value()
            # Un valor se enseña recortado: un espectro completo llenaría
            # la pantalla y aquí sólo interesa saber que está.
            valor = f"  = {str(v)[:60]}"
        except Exception:
            pass  # No todos los nodos tienen valor; una carpeta no lo tiene.

        print(f"{'  ' * nivel}  {nombre:<28}{hijo.nodeid.to_string():<34}{valor}")
        await _recorrer(hijo, nivel + 1, tope)


async def leer(ip, nodo_id):
    """El valor de UN nodo, con su tipo y su calidad."""
    cliente = await conectar(ip)
    if cliente is None:
        return
    try:
        nodo = cliente.get_node(nodo_id)
        dv = await nodo.read_data_value()
        print(f"\n  nodo    {nodo_id}")
        print(f"  valor   {dv.Value.Value}")
        print(f"  tipo    {dv.Value.VariantType.name}")
        # La calidad importa tanto como el valor: un `Bad` con un número
        # dentro se lee igual que un dato bueno si nadie la mira.
        print(f"  calidad {dv.StatusCode}")
        print(f"  hora    {dv.SourceTimestamp}")
    except Exception as e:
        print(f"  no se pudo leer: {type(e).__name__}: {str(e)[:150]}")
    finally:
        await cliente.disconnect()


async def main():
    args = sys.argv[1:]

    if not args:
        for ip, etiqueta in PLCS.items():
            await resumen(ip, etiqueta)
        print("\nPara ver los nodos de uno:")
        print("  python scripts/plc_opcua.py --arbol 192.168.0.5")
        return

    if args[0] == "--arbol":
        ip = args[1] if len(args) > 1 else "192.168.0.1"
        await arbol(ip, args[2] if len(args) > 2 else None)
        return

    if args[0] == "--leer":
        if len(args) < 3:
            print("uso: --leer <ip> <nodeid>")
            return
        await leer(args[1], args[2])
        return

    print(__doc__)


if __name__ == "__main__":
    asyncio.run(main())
