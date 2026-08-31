#!/usr/bin/env python
"""
Explorar un equipo Modbus TCP, que NO se puede navegar como uno OPC UA.

── LA DIFERENCIA QUE HAY QUE ENTENDER ANTES DE USAR ESTO ─────────────

En OPC UA los datos vienen con NOMBRE: se pide el árbol y el propio PLC
contesta «BMS-vRMS-S1 = 0.361». Por eso `plc_opcua.py` puede recorrerlo y
enseñar qué hay dentro sin saber nada del equipo.

Modbus no tiene nada de eso. Son registros NUMERADOS y punto: el 1000
vale 15494 y el equipo no sabe decir qué significa. Ni nombre, ni unidad,
ni tipo. Sólo el manual del fabricante dice que el 1000 es «tensión L1»
y que hay que leerlo como float de dos registros.

Así que esto NO descubre qué mide el equipo. Lo que hace es encontrar
DÓNDE hay algo, para que buscar en el manual sea rápido en vez de leerlo
entero. La otra mitad —qué es cada cosa— hay que traerla de fuera.

── LAS DOS TRAMPAS DE MODBUS, Y AMBAS DAN NÚMEROS CREÍBLES ───────────

Un registro son 16 bits, y casi ninguna medida cabe ahí. Los equipos
parten los valores en dos registros, y hay dos formas de juntarlos:

    alto-primero   la habitual
    bajo-primero   «word swap», que usan otros

Elegir mal no da error: da OTRO número. Por eso este script enseña las
dos lecturas de cada par y deja que quien mira decida cuál se parece a
una medida real. Un 0,0158 y un −5.356.274.115.936.256 salen del MISMO
par de registros.

La segunda trampa es el desplazamiento. Un manual que dice «40001» suele
querer decir el registro 0 en el cable. Si los números no cuadran con lo
que esperas, prueba restando 40001 o 30001.

── USO ───────────────────────────────────────────────────────────────

    pip install pymodbus

    python scripts/modbus_map.py 192.168.0.20
    python scripts/modbus_map.py 192.168.0.20 --bloque 1000 40
    python scripts/modbus_map.py 192.168.0.20 --vigilar 800 10
"""
import struct
import sys
import time

from pymodbus.client import ModbusTcpClient

# Dónde suelen colocar los fabricantes sus bloques de medidas. No es una
# lista exhaustiva ni pretende serlo: es por dónde empezar a mirar.
BLOQUES = [0, 100, 200, 500, 800, 1000, 1100, 1500, 2000, 3000, 4000,
           5000, 8000, 10000, 19000, 30000, 40000]


def f32(a, b, bajo_primero=False):
    """Dos registros como float de 32 bits."""
    hi, lo = (b, a) if bajo_primero else (a, b)
    return struct.unpack(">f", struct.pack(">HH", hi, lo))[0]


def plausible(v):
    """¿Se parece a una medida de planta?

    No hay forma de saberlo con certeza sin el manual, pero sí de
    descartar lo imposible: los órdenes absurdos que salen de juntar los
    dos registros al revés. Un valor así no es una medida, es una pista
    de que el orden elegido no era el bueno.
    """
    if v != v or v in (float("inf"), float("-inf")):  # NaN o infinito
        return False
    a = abs(v)
    return a == 0 or (1e-4 < a < 1e7)


def leer(cliente, base, cuantos, unidad):
    """Holding (03) y, si falla, input (04). Muchos equipos sólo tienen uno."""
    for nombre, fn in (("holding", cliente.read_holding_registers),
                       ("input", cliente.read_input_registers)):
        try:
            r = fn(address=base, count=cuantos, device_id=unidad)
            if not r.isError():
                return nombre, r.registers
        except Exception:
            pass
    return None, None


def barrido(cliente, unidad):
    print("\nDónde hay algo. Los bloques en blanco no se listan.\n")
    print(f"  {'registro':>8}  {'tipo':<8} {'crudo':<34} float alto-primero")
    encontrados = 0
    for base in BLOQUES:
        tipo, regs = leer(cliente, base, 10, unidad)
        if regs is None:
            continue
        if all(x in (0, 65535) for x in regs):
            continue  # Bloque vacío: no ocupa sitio en la salida.
        encontrados += 1
        flot = [f32(regs[i], regs[i + 1]) for i in range(0, len(regs) - 1, 2)]
        vistos = [f"{v:.4g}" for v in flot[:3] if plausible(v)]
        print(f"  {base:>8}  {tipo:<8} {str(regs[:6]):<34} {', '.join(vistos)}")

    if not encontrados:
        print("  (ningún bloque con datos entre los probados)")
    print(f"\nPara ver uno entero:  --bloque <registro> <cuántos>")


def bloque(cliente, base, cuantos, unidad):
    tipo, regs = leer(cliente, base, cuantos, unidad)
    if regs is None:
        print(f"  el equipo rechazó la lectura desde {base}")
        return

    print(f"\nDesde {base} ({tipo}), {cuantos} registros\n")
    print(f"  {'reg':>6}  {'crudo':>12}  {'alto-primero':>16}  {'bajo-primero':>16}")
    for i in range(0, len(regs) - 1, 2):
        a, b = regs[i], regs[i + 1]
        alto, bajo = f32(a, b), f32(a, b, bajo_primero=True)
        # Se marca cuál de las dos lecturas parece una medida. Es una
        # ayuda para elegir, no un veredicto: el manual manda.
        marca_a = "  <--" if plausible(alto) and not plausible(bajo) else ""
        marca_b = "  <--" if plausible(bajo) and not plausible(alto) else ""
        print(f"  {base + i:>6}  {a:>6} {b:>5}  {alto:>16.5f}{marca_a}  {bajo:>16.5f}{marca_b}")


def vigilar(cliente, base, cuantos, unidad):
    """Lee en bucle y marca lo que CAMBIA.

    Es la forma de averiguar qué es cada registro sin manual: se mueve
    algo en la máquina y se mira qué número se movió con ello.
    """
    print(f"\nVigilando desde {base}. Ctrl+C para parar.\n")
    previo = None
    try:
        while True:
            _, regs = leer(cliente, base, cuantos, unidad)
            if regs is None:
                print("  sin respuesta")
                time.sleep(2)
                continue
            marcas = []
            for i, v in enumerate(regs):
                cambio = previo is not None and previo[i] != v
                marcas.append(f"{'*' if cambio else ' '}{v:>6}")
            print(f"  {time.strftime('%H:%M:%S')}  {' '.join(marcas)}")
            previo = regs
            time.sleep(2)
    except KeyboardInterrupt:
        print("\n  (parado)")


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return

    ip = args[0]
    unidad = 1
    cliente = ModbusTcpClient(ip, port=502, timeout=5)
    if not cliente.connect():
        print(f"\nNo se pudo conectar a {ip}:502 — ¿está en red y habla Modbus TCP?\n")
        return

    print(f"\nConectado a {ip}:502 (unidad {unidad})")
    try:
        if "--bloque" in args:
            i = args.index("--bloque")
            base = int(args[i + 1])
            cuantos = int(args[i + 2]) if len(args) > i + 2 else 20
            bloque(cliente, base, cuantos, unidad)
        elif "--vigilar" in args:
            i = args.index("--vigilar")
            base = int(args[i + 1])
            cuantos = int(args[i + 2]) if len(args) > i + 2 else 10
            vigilar(cliente, base, cuantos, unidad)
        else:
            barrido(cliente, unidad)
    finally:
        cliente.close()
        print()


if __name__ == "__main__":
    main()
