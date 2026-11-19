# Inventario

Sitio local para llevar el inventario del negocio, las horas del equipo y las comisiones.

## Abrir

Haz doble clic en `iniciar.bat` y deja esa ventana abierta. El sitio queda en [http://localhost:3000](http://localhost:3000).

La primera vez puedes entrar así:

- Gerencia: usuario `gerente`, contraseña `gerente123`
- Empleados de ejemplo: `ana` / `ana123` y `luis` / `luis123`

Cambia esas contraseñas en **Mi cuenta** y crea las cuentas reales en **Cuentas**.

## Qué ve cada quien

La gerencia ve el inventario, el registro de ventas, el 30% del día de cada empleado y cuánto falta por pagar. Desde Inventario y Registro de ventas puede exportar un Excel.

El empleado entra a otra pantalla. Ahí actualiza la tabla de inventario, registra las ventas y anota sus horas. No ve el pago del resto del equipo.

Los datos se guardan en `data/db.json` en esta computadora. Para empezar de cero, cierra el sitio y borra ese archivo. Al abrirlo de nuevo vuelven las cuentas de ejemplo.
