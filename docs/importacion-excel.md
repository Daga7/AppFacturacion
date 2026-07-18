# Importación masiva de inventario por Excel

> **Implementado (jul 2026)** en la pestaña Stock de Inventario: el botón
> "Subir Excel" dentro de Ingresar/Sacar/Transferir llena las filas del
> formulario desde un archivo con columnas `codigo` y `cantidad` (tolera
> `codigo_barras`, tildes y mayúsculas). Los códigos que no existen quedan
> marcados en rojo y bloquean el guardado hasta corregirlos. Se usa SheetJS
> con import dinámico (no pesa en el bundle inicial). Este documento conserva
> el diseño original.

## Resumen

La buena noticia: **el backend ya está listo**. Los endpoints masivos que se
crearon para el módulo de stock aceptan listas de productos:

| Operación | Endpoint | Body |
|---|---|---|
| Ingreso masivo | `POST /inventory/adjust-bulk` | `{ branchId, type: "STOCK_IN", items: [{ productId, quantity }], note? }` |
| Salida masiva | `POST /inventory/adjust-bulk` | `{ branchId, type: "STOCK_OUT", items: [...], note? }` |
| Transferencia masiva | `POST /inventory/transfer` | `{ fromBranchId, toBranchId, items: [...], note? }` |

Los tres son transaccionales: si una fila falla (p. ej. stock insuficiente),
no se aplica nada. Por eso implementar Excel es solo **leer el archivo en el
navegador, convertir filas a `items` y llamar al endpoint que ya existe**. No
hay que tocar el backend ni subir archivos al servidor.

## Librería recomendada: SheetJS (`xlsx`)

- Es el estándar para leer `.xlsx`/`.xls`/`.csv` en JavaScript, funciona 100%
  en el navegador (no necesita backend) y pesa poco.
- **Importante**: instalar desde el CDN oficial de SheetJS, no desde npm — la
  versión en npm (`0.18.5`) está abandonada y tiene vulnerabilidades conocidas
  (CVE-2023-30533, prototype pollution). La versión mantenida se instala así:

```bash
cd frontend
pnpm add https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

- Alternativa: `exceljs` — más completo para *escribir* Excel con estilos,
  pero más pesado y pensado para Node; para solo leer, SheetJS es más simple.

## Estructura del archivo Excel propuesta

Una plantilla mínima de **2 columnas** — lo demás (tipo de operación y sedes)
se elige en la interfaz, no en el archivo, para evitar errores de digitación:

| codigo_barras | cantidad |
|---|---|
| 7701234567890 | 10 |
| 7709876543210 | 5 |

Reglas:

- **Fila 1** = encabezados exactos: `codigo_barras`, `cantidad`.
- `codigo_barras`: debe existir en el sistema (se busca contra `GET /products`).
  Se usa el código de barras y no el nombre porque es único y el mismo lector
  de códigos puede ayudar a construir el archivo.
- `cantidad`: entero positivo (> 0).
- Formatear la columna `codigo_barras` como **texto** en Excel, para que no
  recorte ceros a la izquierda ni convierta a notación científica los códigos
  largos (es el error más común con EAN-13 en Excel).

El mismo archivo sirve para las tres operaciones; en la interfaz el usuario
elige: *Ingreso* (a qué sede), *Salida* (de qué sede) o *Transferencia*
(origen y destino).

## Flujo de la funcionalidad en la interfaz

1. En la pestaña **Stock**, botón "Importar Excel" junto a los tres botones
   actuales.
2. El usuario elige la operación y la(s) sede(s), y selecciona el archivo
   (`<input type="file" accept=".xlsx,.xls,.csv">`).
3. Se lee el archivo con SheetJS **en el navegador**:

```ts
import { read, utils } from "xlsx";

type ExcelRow = { codigo_barras: string; cantidad: number };

async function parseExcel(file: File): Promise<ExcelRow[]> {
  const data = await file.arrayBuffer();
  const workbook = read(data);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  // raw: false fuerza los códigos de barras a string
  return utils.sheet_to_json<ExcelRow>(sheet, { raw: false });
}
```

4. **Validación y vista previa** (el paso clave para que sea usable):
   - Cruzar cada `codigo_barras` contra los productos cargados
     (`GET /products` ya se consume en la página de Inventario).
   - Mostrar una tabla de vista previa: ✅ filas válidas, ❌ filas con error
     (código no existe, cantidad inválida o vacía, fila duplicada) y, para
     salidas/transferencias, ⚠️ si la cantidad supera el stock disponible.
   - El usuario confirma con un botón "Aplicar N movimientos" que solo se
     habilita si no hay errores ❌.
5. Al confirmar, se mapean las filas a `items` y se llama **una sola vez** al
   endpoint correspondiente. Como el backend es transaccional, o entra todo o
   no entra nada — nunca queda a medias.
6. Al terminar: recargar stock y mostrar el resumen ("Se ingresaron 25
   productos a Ocaña"). El movimiento queda registrado y visible/editables en
   la pestaña **Movimientos**.

## Qué NO se recomienda

- **Subir el archivo al backend** (multer + exceljs en NestJS): agrega
  complejidad (límites de tamaño, tipos MIME, almacenamiento temporal) sin
  beneficio real aquí, porque el volumen es pequeño (cientos de filas) y la
  validación necesita los datos que el frontend ya tiene cargados.
- **Poner el tipo de operación o la sede dentro del Excel**: multiplica los
  errores de digitación y las variantes de plantilla que hay que soportar.
- **Crear productos nuevos desde el Excel de inventario**: mejor mantenerlo
  separado (una futura plantilla de productos con nombre, precios y categoría)
  para que un código mal digitado no cree un producto fantasma en vez de
  reportar el error.

## Estimación de esfuerzo

| Parte | Esfuerzo |
|---|---|
| Instalar SheetJS + parseo del archivo | pequeño |
| UI de selección de operación/sede + vista previa con validaciones | mediano (es la mayor parte del trabajo) |
| Llamada a los endpoints existentes | trivial (ya existen) |
| Plantilla de ejemplo descargable (`.xlsx` en `frontend/public/`) | pequeño |

Total estimado: una sesión de trabajo. Backend: **cero cambios**.
