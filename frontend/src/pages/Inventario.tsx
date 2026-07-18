import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../lib/api";
import { useAuthStore } from "../stores/auth";

interface Category {
  id: string;
  name: string;
}
interface BranchInfo {
  id: string;
  name: string;
}
interface Product {
  id: string;
  name: string;
  barcode: string;
  purchasePrice: number;
  salePrice: number;
  isActive: boolean;
  category: Category;
  inventories?: { amount: number; branchId: string; branch: { id: string; name: string } }[];
}
interface StockItem {
  id: string;
  amount: number;
  product: Product;
  branch: { id: string; name: string };
}
interface Movement {
  id: string;
  quantity: number;
  type: string;
  note?: string | null;
  createdAt: string;
  transferGroupId?: string | null;
  product: { id: string; name: string; barcode: string };
  branch: { id: string; name: string };
}

type Tab = "productos" | "categorias" | "stock" | "movimientos";
type StockAction = "in" | "out" | "transfer" | null;
type MovType = "STOCK_IN" | "STOCK_OUT" | "BRANCH_TRANSFER";

type ProductForm = { name: string; barcode: string; purchasePrice: string; salePrice: string; categoryId: string; isActive: boolean };
type CategoryForm = { name: string };
type ItemRow = { productId: string; barcode: string; quantity: string };
type MovementForm = { branchId: string; note: string; items: ItemRow[] };
type TransferForm = { fromBranchId: string; toBranchId: string; note: string; items: ItemRow[] };

// Fila resumida de la lista de movimientos; una transferencia agrupa sus dos
// lados (salida del origen + entrada al destino) en una sola fila.
type MovementRow = {
  id: string; // id del movimiento a editar vía PATCH
  type: MovType;
  productName: string;
  barcode: string;
  branchLabel: string;
  quantity: number; // siempre positiva para mostrar
  note: string;
  createdAt: string;
  editable: boolean;
};

const emptyProduct: ProductForm = { name: "", barcode: "", purchasePrice: "0", salePrice: "0", categoryId: "", isActive: true };
const emptyCategory: CategoryForm = { name: "" };
const emptyItemRow = (): ItemRow => ({ productId: "", barcode: "", quantity: "" });
const emptyMovement: MovementForm = { branchId: "", note: "", items: [emptyItemRow()] };
const emptyTransfer: TransferForm = { fromBranchId: "", toBranchId: "", note: "", items: [emptyItemRow()] };

const movTypeLabels: Record<MovType, string> = {
  STOCK_IN: "Ingreso",
  STOCK_OUT: "Salida",
  BRANCH_TRANSFER: "Transferencia",
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });

export default function Inventario() {
  // El supervisor solo consulta el inventario, sin crear/editar/mover nada.
  const readOnly = useAuthStore((s) => s.user)?.role === "SUPERVISOR";
  const [tab, setTab] = useState<Tab>("productos");
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [movType, setMovType] = useState<MovType>("STOCK_IN");
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [lastScan, setLastScan] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState<ProductForm>(emptyProduct);

  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(emptyCategory);

  const [stockAction, setStockAction] = useState<StockAction>(null);
  const [movementForm, setMovementForm] = useState<MovementForm>(emptyMovement);
  const [transferForm, setTransferForm] = useState<TransferForm>(emptyTransfer);
  const [saving, setSaving] = useState(false);

  const [selectedMovement, setSelectedMovement] = useState<MovementRow | null>(null);
  const [editQuantity, setEditQuantity] = useState("");
  const [editNote, setEditNote] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Product[]>("/products");
      setProducts(data);
    } catch { setError("Error al cargar productos"); }
    setLoading(false);
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const data = await api.get<Category[]>("/categories");
      setCategories(data);
    } catch { setError("Error al cargar categorías"); }
  }, []);

  const loadBranches = useCallback(async () => {
    try {
      const data = await api.get<BranchInfo[]>("/branches");
      setBranches(data);
    } catch { setError("Error al cargar sucursales"); }
  }, []);

  const loadStock = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<StockItem[]>("/inventory");
      setStock(data);
    } catch { setError("Error al cargar inventario"); }
    setLoading(false);
  }, []);

  const loadMovements = useCallback(async (type: MovType) => {
    setLoading(true);
    try {
      const data = await api.get<Movement[]>(`/inventory/movements?type=${type}&limit=100`);
      setMovements(data);
    } catch { setError("Error al cargar movimientos"); }
    setLoading(false);
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (tab === "productos") { loadProducts(); loadCategories(); loadBranches(); }
    else if (tab === "categorias") loadCategories();
    else if (tab === "stock") { loadStock(); loadProducts(); loadBranches(); }
    else if (tab === "movimientos") { loadMovements(movType); loadStock(); }
  }, [tab, movType, loadProducts, loadCategories, loadBranches, loadStock, loadMovements]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSaveProduct = async () => {
    try {
      const payload = { ...productForm, purchasePrice: +productForm.purchasePrice, salePrice: +productForm.salePrice };
      if (editingProduct) {
        await api.patch(`/products/${editingProduct.id}`, payload);
      } else {
        await api.post("/products", payload);
      }
      setShowProductForm(false);
      setEditingProduct(null);
      setProductForm(emptyProduct);
      loadProducts();
    } catch (err) { setError(err instanceof Error ? err.message : "Error"); }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("Eliminar producto?")) return;
    await api.delete(`/products/${id}`);
    loadProducts();
  };

  const handleSaveCategory = async () => {
    try {
      if (editingCategory) {
        await api.patch(`/categories/${editingCategory.id}`, categoryForm);
      } else {
        await api.post("/categories", categoryForm);
      }
      setShowCategoryForm(false);
      setEditingCategory(null);
      setCategoryForm(emptyCategory);
      loadCategories();
    } catch (err) { setError(err instanceof Error ? err.message : "Error"); }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm("Eliminar categoría?")) return;
    await api.delete(`/categories/${id}`);
    loadCategories();
  };

  const editProduct = (p: Product) => {
    setEditingProduct(p);
    setProductForm({
      name: p.name,
      barcode: p.barcode,
      purchasePrice: String(p.purchasePrice),
      salePrice: String(p.salePrice),
      categoryId: p.category.id,
      isActive: p.isActive,
    });
    setShowProductForm(true);
  };

  const editCategory = (c: Category) => {
    setEditingCategory(c);
    setCategoryForm({ name: c.name });
    setShowCategoryForm(true);
  };

  // Stock disponible por sucursal+producto, para validar y mostrar en los formularios.
  const stockOf = (branchId: string, productId: string) =>
    stock.find((s) => s.branch.id === branchId && s.product.id === productId)?.amount ?? 0;

  const openStockAction = (action: StockAction) => {
    setStockAction(action);
    setMovementForm(emptyMovement);
    setTransferForm(emptyTransfer);
    setError(null);
    setSuccess(null);
  };

  const parseItems = (items: ItemRow[]) =>
    items
      .filter((i) => i.productId)
      .map((i) => ({ productId: i.productId, quantity: parseInt(i.quantity, 10) }));

  // Filas con un código escrito que no corresponde a ningún producto.
  const hasUnknownCodes = (items: ItemRow[]) =>
    items.some((i) => i.barcode.trim() && !i.productId);

  // Lee un Excel con columnas "codigo" y "cantidad" (tolera codigo_barras y
  // tildes) y llena las filas del formulario; los códigos que no existen
  // quedan marcados en rojo para corregirlos antes de guardar.
  const importExcel = async (
    file: File,
    setItems: (updater: (items: ItemRow[]) => ItemRow[]) => void,
  ) => {
    try {
      const { read, utils } = await import("xlsx");
      const workbook = read(await file.arrayBuffer());
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const raw = utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false });

      const norm = (s: string) =>
        s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

      const items: ItemRow[] = [];
      let notFound = 0;
      for (const row of raw) {
        const cols: Record<string, string> = {};
        for (const [key, value] of Object.entries(row)) {
          cols[norm(String(key))] = String(value ?? "").trim();
        }
        const code = cols["codigo"] ?? cols["codigo_barras"] ?? cols["codigo de barras"] ?? "";
        if (!code) continue;
        const product = products.find((p) => p.barcode === code);
        if (!product) notFound++;
        items.push({ barcode: code, productId: product?.id ?? "", quantity: cols["cantidad"] ?? "" });
      }

      if (items.length === 0) {
        setError('El archivo no tiene filas válidas; usa las columnas "codigo" y "cantidad"');
        return;
      }
      setItems(() => items);
      setSuccess(
        `Excel cargado: ${items.length} fila(s)` +
          (notFound ? ` — ${notFound} código(s) no encontrados, márcalos en rojo y corrígelos` : ""),
      );
    } catch {
      setError("No se pudo leer el archivo; asegúrate de que sea un Excel válido (.xlsx)");
    }
  };

  const handleSubmitMovement = async () => {
    const parsedItems = parseItems(movementForm.items);
    if (!movementForm.branchId) {
      setError("Selecciona el punto");
      return;
    }
    if (hasUnknownCodes(movementForm.items)) {
      setError("Hay códigos no encontrados (en rojo); corrígelos o elimina esas filas");
      return;
    }
    if (parsedItems.length === 0 || parsedItems.some((i) => !i.quantity || i.quantity < 1)) {
      setError("Agrega al menos un producto con cantidad válida");
      return;
    }
    setSaving(true);
    try {
      await api.post("/inventory/adjust-bulk", {
        branchId: movementForm.branchId,
        type: stockAction === "in" ? "STOCK_IN" : "STOCK_OUT",
        items: parsedItems,
        note: movementForm.note.trim() || undefined,
      });
      const branchName = branches.find((b) => b.id === movementForm.branchId)?.name ?? "";
      setSuccess(
        stockAction === "in"
          ? `Ingreso de ${parsedItems.length} producto(s) registrado en ${branchName}`
          : `Salida de ${parsedItems.length} producto(s) registrada en ${branchName}`,
      );
      setStockAction(null);
      setMovementForm(emptyMovement);
      loadStock();
    } catch (err) { setError(err instanceof Error ? err.message : "Error"); }
    setSaving(false);
  };

  const handleSubmitTransfer = async () => {
    const { fromBranchId, toBranchId, items, note } = transferForm;
    if (!fromBranchId || !toBranchId) {
      setError("Selecciona la sucursal de origen y la de destino");
      return;
    }
    if (fromBranchId === toBranchId) {
      setError("El origen y el destino deben ser distintos");
      return;
    }
    if (hasUnknownCodes(items)) {
      setError("Hay códigos no encontrados (en rojo); corrígelos o elimina esas filas");
      return;
    }
    const parsedItems = parseItems(items);
    if (parsedItems.length === 0 || parsedItems.some((i) => !i.quantity || i.quantity < 1)) {
      setError("Agrega al menos un producto con cantidad válida");
      return;
    }
    setSaving(true);
    try {
      await api.post("/inventory/transfer", {
        fromBranchId,
        toBranchId,
        items: parsedItems,
        note: note.trim() || undefined,
      });
      const fromName = branches.find((b) => b.id === fromBranchId)?.name ?? "";
      const toName = branches.find((b) => b.id === toBranchId)?.name ?? "";
      setSuccess(`Transferencia de ${fromName} a ${toName} registrada`);
      setStockAction(null);
      setTransferForm(emptyTransfer);
      loadStock();
    } catch (err) { setError(err instanceof Error ? err.message : "Error"); }
    setSaving(false);
  };

  const openMovementDetail = (row: MovementRow) => {
    setSelectedMovement(row);
    setEditQuantity(String(row.quantity));
    setEditNote(row.note);
    setError(null);
    setSuccess(null);
  };

  const handleSaveMovement = async () => {
    if (!selectedMovement) return;
    const qty = parseInt(editQuantity, 10);
    if (!qty || qty < 1) {
      setError("La cantidad debe ser un número mayor a 0");
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/inventory/movements/${selectedMovement.id}`, {
        quantity: qty,
        note: editNote.trim(),
      });
      setSuccess("Movimiento actualizado");
      setSelectedMovement(null);
      loadMovements(movType);
      loadStock();
    } catch (err) { setError(err instanceof Error ? err.message : "Error"); }
    setSaving(false);
  };

  // Auto-foco en el buscador al entrar a la pestaña de productos para que
  // el lector de código de barras escriba directamente aquí.
  useEffect(() => {
    if (tab === "productos") searchRef.current?.focus();
  }, [tab]);

  // Al abrir el formulario de "Nuevo producto", enfocar el campo de código de
  // barras para poder escanear de inmediato sin hacer clic.
  useEffect(() => {
    if (showProductForm && !editingProduct) barcodeRef.current?.focus();
  }, [showProductForm, editingProduct]);

  // El lector envía un Enter al final del código. En vez de no hacer nada,
  // saltamos al siguiente campo (Nombre) para encadenar el llenado.
  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      nameRef.current?.focus();
    }
  };

  const normalizedSearch = search.trim().toLowerCase();
  const filteredProducts = normalizedSearch
    ? products.filter(
        (p) =>
          p.barcode.toLowerCase().includes(normalizedSearch) ||
          p.name.toLowerCase().includes(normalizedSearch),
      )
    : products;

  // Lista de productos dividida por sede: un producto pertenece a una sede si
  // tiene registro de inventario en ella. Los que no tienen inventario en
  // ninguna sede van en una sección aparte.
  const productsByBranch = branches.map((b) => ({
    branch: b,
    items: filteredProducts.flatMap((p) => {
      const inv = p.inventories?.find((i) => i.branchId === b.id);
      return inv ? [{ product: p, amount: inv.amount }] : [];
    }),
  }));
  const unassignedProducts = filteredProducts.filter(
    (p) => !p.inventories || p.inventories.length === 0,
  );

  // Filas resumidas de movimientos. Las transferencias vienen como dos
  // movimientos (negativo=origen, positivo=destino) unidos por transferGroupId
  // y se muestran como una sola fila "Origen → Destino".
  const movementRows: MovementRow[] = (() => {
    if (movType !== "BRANCH_TRANSFER") {
      return movements.map((m) => ({
        id: m.id,
        type: movType,
        productName: m.product.name,
        barcode: m.product.barcode,
        branchLabel: m.branch.name,
        quantity: Math.abs(m.quantity),
        note: m.note ?? "",
        createdAt: m.createdAt,
        editable: true,
      }));
    }
    const grouped = new Map<string, Movement[]>();
    const loose: Movement[] = [];
    for (const m of movements) {
      if (m.transferGroupId) {
        const list = grouped.get(m.transferGroupId) ?? [];
        list.push(m);
        grouped.set(m.transferGroupId, list);
      } else {
        loose.push(m);
      }
    }
    const rows: MovementRow[] = [];
    for (const pair of grouped.values()) {
      const out = pair.find((m) => m.quantity < 0);
      const into = pair.find((m) => m.quantity > 0);
      const ref = into ?? out;
      if (!ref) continue;
      rows.push({
        id: ref.id,
        type: "BRANCH_TRANSFER",
        productName: ref.product.name,
        barcode: ref.product.barcode,
        branchLabel: out && into ? `${out.branch.name} → ${into.branch.name}` : ref.branch.name,
        quantity: Math.abs(ref.quantity),
        note: ref.note ?? "",
        createdAt: ref.createdAt,
        editable: Boolean(out && into),
      });
    }
    for (const m of loose) {
      rows.push({
        id: m.id,
        type: "BRANCH_TRANSFER",
        productName: m.product.name,
        barcode: m.product.barcode,
        branchLabel: m.branch.name,
        quantity: Math.abs(m.quantity),
        note: m.note ?? "",
        createdAt: m.createdAt,
        editable: false,
      });
    }
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  })();

  // Un lector de códigos de barras normalmente envía un Enter al final.
  // Lo capturamos para registrar exactamente el valor recibido.
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setLastScan(search.trim());
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "productos", label: "Productos" },
    { key: "categorias", label: "Categorías" },
    { key: "stock", label: "Stock" },
    { key: "movimientos", label: "Movimientos" },
  ];

  const inputCls = "bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm";

  const renderItemRows = (
    items: ItemRow[],
    setItems: (updater: (items: ItemRow[]) => ItemRow[]) => void,
    availabilityBranchId?: string,
  ) => (
    <div className="space-y-2">
      <div className="hidden md:flex gap-2 text-xs text-slate-500">
        <span className="w-44">Código de barras</span>
        <span className="flex-1 min-w-40">Producto</span>
        <span className="w-28">Cantidad</span>
      </div>
      {items.map((item, i) => {
        const product = products.find((p) => p.id === item.productId);
        return (
          <div key={i} className="flex flex-wrap gap-2 items-center">
            <input
              value={item.barcode}
              onChange={(e) => {
                const barcode = e.target.value;
                const match = products.find((p) => p.barcode === barcode.trim());
                setItems((prev) => prev.map((it, j) => (j === i ? { ...it, barcode, productId: match?.id ?? "" } : it)));
              }}
              onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
              inputMode="numeric"
              placeholder="Escanea o escribe el código"
              className={`${inputCls} w-44 font-mono`}
            />
            <div className="flex-1 min-w-40 px-3 py-2 bg-slate-800/60 border border-slate-800 rounded-lg text-sm truncate">
              {product ? (
                <span className="text-white">
                  {product.name}
                  {availabilityBranchId && (
                    <span className="text-slate-500"> · disp: {stockOf(availabilityBranchId, product.id)}</span>
                  )}
                </span>
              ) : item.barcode.trim() ? (
                <span className="text-red-400">Código no encontrado</span>
              ) : (
                <span className="text-slate-500">Producto</span>
              )}
            </div>
            <input
              type="number"
              min="1"
              placeholder="Cantidad"
              value={item.quantity}
              onChange={(e) => setItems((prev) => prev.map((it, j) => (j === i ? { ...it, quantity: e.target.value } : it)))}
              className={`${inputCls} w-28`}
            />
            {items.length > 1 && (
              <button
                onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                className="text-slate-400 hover:text-red-400 text-sm px-2"
                aria-label="Quitar producto"
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={() => setItems((prev) => [...prev, emptyItemRow()])}
          className="text-sm text-brand-light hover:underline"
        >
          + Agregar otro producto
        </button>
        <label className="text-sm text-emerald-400 hover:underline cursor-pointer">
          ⇪ Subir Excel (codigo, cantidad)
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importExcel(file, setItems);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );

  const renderProductTable = (items: { product: Product; amount: number }[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-400 border-b border-slate-800">
            <th className="pb-3 font-medium">Producto</th>
            <th className="pb-3 font-medium">Código</th>
            <th className="pb-3 font-medium">Categoría</th>
            <th className="pb-3 font-medium text-right">P. Compra</th>
            <th className="pb-3 font-medium text-right">P. Venta</th>
            <th className="pb-3 font-medium">Stock</th>
            <th className="pb-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {items.map(({ product: p, amount }) => (
            <tr key={p.id} className="border-b border-slate-800/50">
              <td className="py-3 text-white">{p.name}</td>
              <td className="py-3 text-slate-400 font-mono text-xs">{p.barcode}</td>
              <td className="py-3 text-slate-400">{p.category.name}</td>
              <td className="py-3 text-right text-slate-300">${p.purchasePrice}</td>
              <td className="py-3 text-right text-slate-300">${p.salePrice}</td>
              <td className="py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full ${amount > 5 ? "bg-emerald-900/30 text-emerald-400" : amount > 0 ? "bg-yellow-900/30 text-yellow-400" : "bg-red-900/30 text-red-400"}`}>
                  {amount}
                </span>
              </td>
              <td className="py-3 text-right">
                {!readOnly && (
                  <>
                    <button onClick={() => editProduct(p)} className="text-slate-400 hover:text-white mr-2 text-xs">Editar</button>
                    <button onClick={() => handleDeleteProduct(p.id)} className="text-slate-400 hover:text-red-400 text-xs">Eliminar</button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={7} className="py-6 text-center text-slate-500">
              {normalizedSearch
                ? `Sin resultados para "${search.trim()}" en esta sede`
                : "No hay productos con inventario en esta sede"}
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Inventario</h2>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-3 underline">Cerrar</button>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-emerald-900/30 border border-emerald-800 rounded-lg text-emerald-300 text-sm">
          {success}
          <button onClick={() => setSuccess(null)} className="ml-3 underline">Cerrar</button>
        </div>
      )}

      <div className="flex gap-1 mb-6 bg-slate-900 rounded-lg p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.key ? "bg-brand/20 text-brand-light" : "text-slate-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "productos" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">
              {normalizedSearch ? `${filteredProducts.length} de ${products.length}` : products.length} productos
            </h3>
            {!readOnly && (
              <button
                onClick={() => { setEditingProduct(null); setProductForm(emptyProduct); setShowProductForm(true); }}
                className="px-4 py-2 bg-brand/20 text-brand-light rounded-lg text-sm font-medium hover:bg-brand/30 transition-colors"
              >
                + Nuevo producto
              </button>
            )}
          </div>

          <div className="mb-4">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">⌗</span>
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Escanea o escribe el código de barras (o nombre)…"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-9 py-2.5 text-white text-sm font-mono focus:outline-none focus:border-brand"
                autoFocus
              />
              {search && (
                <button
                  onClick={() => { setSearch(""); setLastScan(null); searchRef.current?.focus(); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-sm"
                  aria-label="Limpiar búsqueda"
                >
                  ✕
                </button>
              )}
            </div>
            {lastScan !== null && (
              <p className="mt-2 text-xs text-slate-400">
                Último código recibido:{" "}
                <span className="font-mono text-emerald-400">{lastScan || "(vacío)"}</span>
                <span className="text-slate-600"> · {lastScan.length} caracteres</span>
              </p>
            )}
          </div>

          {showProductForm && (
            <div className="mb-4 p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
              <h4 className="text-white font-medium">{editingProduct ? "Editar producto" : "Nuevo producto"}</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input ref={nameRef} placeholder="Nombre" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} className={inputCls} />
                <input ref={barcodeRef} onKeyDown={handleBarcodeKeyDown} inputMode="numeric" placeholder="Código de barras (escanear o escribir)" value={productForm.barcode} onChange={(e) => setProductForm({ ...productForm, barcode: e.target.value })} className={`${inputCls} font-mono`} />
                <select value={productForm.categoryId} onChange={(e) => setProductForm({ ...productForm, categoryId: e.target.value })} className={inputCls}>
                  <option value="">Seleccionar categoría</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input type="number" step="0.01" placeholder="Precio compra" value={productForm.purchasePrice} onChange={(e) => setProductForm({ ...productForm, purchasePrice: e.target.value })} className={inputCls} />
                <input type="number" step="0.01" placeholder="Precio venta" value={productForm.salePrice} onChange={(e) => setProductForm({ ...productForm, salePrice: e.target.value })} className={inputCls} />
              </div>
              <div className="flex gap-2">
                <button onClick={handleSaveProduct} className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium">Guardar</button>
                <button onClick={() => { setShowProductForm(false); setEditingProduct(null); }} className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg text-sm">Cancelar</button>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-slate-400">Cargando...</p>
          ) : (
            <div className="space-y-8">
              {productsByBranch.map(({ branch, items }) => (
                <div key={branch.id}>
                  <div className="flex items-center gap-2 mb-3">
                    <h4 className="text-white font-semibold">{branch.name}</h4>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">{items.length}</span>
                  </div>
                  {renderProductTable(items)}
                </div>
              ))}
              {unassignedProducts.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h4 className="text-white font-semibold">Sin inventario asignado</h4>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">{unassignedProducts.length}</span>
                  </div>
                  <p className="text-xs text-slate-500 mb-3">
                    Estos productos aún no tienen stock en ninguna sede. Usa "Ingresar mercancía" en la pestaña Stock para asignarlos.
                  </p>
                  {renderProductTable(unassignedProducts.map((p) => ({ product: p, amount: 0 })))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "categorias" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">{categories.length} categorías</h3>
            {!readOnly && (
              <button
                onClick={() => { setEditingCategory(null); setCategoryForm(emptyCategory); setShowCategoryForm(true); }}
                className="px-4 py-2 bg-brand/20 text-brand-light rounded-lg text-sm font-medium hover:bg-brand/30 transition-colors"
              >
                + Nueva categoría
              </button>
            )}
          </div>

          {showCategoryForm && (
            <div className="mb-4 p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
              <h4 className="text-white font-medium">{editingCategory ? "Editar categoría" : "Nueva categoría"}</h4>
              <input placeholder="Nombre" value={categoryForm.name} onChange={(e) => setCategoryForm({ name: e.target.value })} className={`${inputCls} w-full md:w-80`} />
              <div className="flex gap-2">
                <button onClick={handleSaveCategory} className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium">Guardar</button>
                <button onClick={() => { setShowCategoryForm(false); setEditingCategory(null); }} className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg text-sm">Cancelar</button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {categories.map((c) => (
              <div key={c.id} className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between">
                <span className="text-white text-sm">{c.name}</span>
                {!readOnly && (
                  <div className="flex gap-2">
                    <button onClick={() => editCategory(c)} className="text-xs text-slate-400 hover:text-white">Editar</button>
                    <button onClick={() => handleDeleteCategory(c.id)} className="text-xs text-slate-400 hover:text-red-400">Eliminar</button>
                  </div>
                )}
              </div>
            ))}
            {categories.length === 0 && <p className="text-slate-500 text-sm">No hay categorías registradas</p>}
          </div>
        </div>
      )}

      {tab === "stock" && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="text-lg font-semibold text-white">Estado de inventario</h3>
            {!readOnly && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => openStockAction("in")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${stockAction === "in" ? "bg-emerald-600 text-white" : "bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50"}`}
              >
                + Ingresar mercancía
              </button>
              <button
                onClick={() => openStockAction("out")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${stockAction === "out" ? "bg-red-600 text-white" : "bg-red-900/30 text-red-400 hover:bg-red-900/50"}`}
              >
                − Sacar mercancía
              </button>
              <button
                onClick={() => openStockAction("transfer")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${stockAction === "transfer" ? "bg-brand text-white" : "bg-brand/20 text-brand-light hover:bg-brand/30"}`}
              >
                ⇄ Transferir
              </button>
            </div>
            )}
          </div>

          {(stockAction === "in" || stockAction === "out") && (
            <div className="mb-4 p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
              <h4 className="text-white font-medium">
                {stockAction === "in" ? "Ingresar mercancía" : "Sacar mercancía"}
              </h4>
              <select
                value={movementForm.branchId}
                onChange={(e) => setMovementForm({ ...movementForm, branchId: e.target.value })}
                className={`${inputCls} w-full md:w-80`}
              >
                <option value="">{stockAction === "in" ? "¿A qué punto ingresa?" : "¿De qué punto sale?"}</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>

              {renderItemRows(
                movementForm.items,
                (updater) => setMovementForm((f) => ({ ...f, items: updater(f.items) })),
                stockAction === "out" ? movementForm.branchId || undefined : undefined,
              )}

              <input
                placeholder="Nota (opcional)"
                value={movementForm.note}
                onChange={(e) => setMovementForm({ ...movementForm, note: e.target.value })}
                className={`${inputCls} w-full`}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSubmitMovement}
                  disabled={saving}
                  className={`px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 ${stockAction === "in" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-red-600 hover:bg-red-500"}`}
                >
                  {saving ? "Guardando..." : stockAction === "in" ? "Registrar ingreso" : "Registrar salida"}
                </button>
                <button onClick={() => setStockAction(null)} className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg text-sm">Cancelar</button>
              </div>
            </div>
          )}

          {stockAction === "transfer" && (
            <div className="mb-4 p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
              <h4 className="text-white font-medium">Transferir mercancía entre sedes</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select
                  value={transferForm.fromBranchId}
                  onChange={(e) => setTransferForm({ ...transferForm, fromBranchId: e.target.value })}
                  className={inputCls}
                >
                  <option value="">Desde (origen)</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <select
                  value={transferForm.toBranchId}
                  onChange={(e) => setTransferForm({ ...transferForm, toBranchId: e.target.value })}
                  className={inputCls}
                >
                  <option value="">Hacia (destino)</option>
                  {branches
                    .filter((b) => b.id !== transferForm.fromBranchId)
                    .map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              {renderItemRows(
                transferForm.items,
                (updater) => setTransferForm((f) => ({ ...f, items: updater(f.items) })),
                transferForm.fromBranchId || undefined,
              )}

              <input
                placeholder="Nota (opcional)"
                value={transferForm.note}
                onChange={(e) => setTransferForm({ ...transferForm, note: e.target.value })}
                className={`${inputCls} w-full`}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSubmitTransfer}
                  disabled={saving}
                  className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {saving ? "Transfiriendo..." : "Transferir"}
                </button>
                <button onClick={() => setStockAction(null)} className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg text-sm">Cancelar</button>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-slate-400">Cargando...</p>
          ) : (
            // Estado de inventario dividido por sede (Aguachica primero, en el
            // orden alfabético que devuelve /branches), igual que en Productos.
            <div className="space-y-8">
              {branches.map((b) => {
                const items = stock.filter((s) => s.branch.id === b.id);
                return (
                  <div key={b.id}>
                    <div className="flex items-center gap-2 mb-3">
                      <h4 className="text-white font-semibold">{b.name}</h4>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">{items.length}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-400 border-b border-slate-800">
                            <th className="pb-3 font-medium">Producto</th>
                            <th className="pb-3 font-medium">Categoría</th>
                            <th className="pb-3 font-medium text-right">Cantidad</th>
                            <th className="pb-3 font-medium">Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((s) => (
                            <tr key={s.id} className="border-b border-slate-800/50">
                              <td className="py-3 text-white">{s.product.name}</td>
                              <td className="py-3 text-slate-400">{s.product.category.name}</td>
                              <td className="py-3 text-right text-white font-mono">{s.amount}</td>
                              <td className="py-3">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${s.amount > 5 ? "bg-emerald-900/30 text-emerald-400" : s.amount > 0 ? "bg-yellow-900/30 text-yellow-400" : "bg-red-900/30 text-red-400"}`}>
                                  {s.amount > 5 ? "En stock" : s.amount > 0 ? "Stock bajo" : "Agotado"}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {items.length === 0 && (
                            <tr><td colSpan={4} className="py-6 text-center text-slate-500">No hay inventario en esta sede</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "movimientos" && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="text-lg font-semibold text-white">Movimientos de inventario</h3>
            <div className="flex gap-1 bg-slate-900 rounded-lg p-1 w-fit">
              {(Object.keys(movTypeLabels) as MovType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setMovType(t)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    movType === t ? "bg-brand/20 text-brand-light" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {movTypeLabels[t]}s
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <p className="text-slate-400">Cargando...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-800">
                    <th className="pb-3 font-medium">Fecha</th>
                    <th className="pb-3 font-medium">Producto</th>
                    <th className="pb-3 font-medium">{movType === "BRANCH_TRANSFER" ? "Origen → Destino" : "Sucursal"}</th>
                    <th className="pb-3 font-medium text-right">Cantidad</th>
                    <th className="pb-3 font-medium">Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {movementRows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => openMovementDetail(row)}
                      className="border-b border-slate-800/50 cursor-pointer hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 text-slate-400 whitespace-nowrap">{formatDate(row.createdAt)}</td>
                      <td className="py-3 text-white">{row.productName}</td>
                      <td className="py-3 text-slate-400">{row.branchLabel}</td>
                      <td className="py-3 text-right text-white font-mono">{row.quantity}</td>
                      <td className="py-3 text-slate-400 max-w-48 truncate">{row.note || "—"}</td>
                    </tr>
                  ))}
                  {movementRows.length === 0 && (
                    <tr><td colSpan={5} className="py-8 text-center text-slate-500">
                      No hay movimientos de este tipo
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {selectedMovement && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setSelectedMovement(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-lg space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-white font-semibold text-lg">Detalle del movimiento</h4>
              <button onClick={() => setSelectedMovement(null)} className="text-slate-400 hover:text-white" aria-label="Cerrar">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <span className="text-slate-400">Tipo</span>
              <span className={`w-fit text-xs px-2 py-0.5 rounded-full ${
                selectedMovement.type === "STOCK_IN" ? "bg-emerald-900/30 text-emerald-400"
                : selectedMovement.type === "STOCK_OUT" ? "bg-red-900/30 text-red-400"
                : "bg-brand/20 text-brand-light"
              }`}>
                {movTypeLabels[selectedMovement.type]}
              </span>
              <span className="text-slate-400">Fecha</span>
              <span className="text-white">{formatDate(selectedMovement.createdAt)}</span>
              <span className="text-slate-400">Producto</span>
              <span className="text-white">{selectedMovement.productName}</span>
              <span className="text-slate-400">Código</span>
              <span className="text-white font-mono text-xs self-center">{selectedMovement.barcode}</span>
              <span className="text-slate-400">{selectedMovement.type === "BRANCH_TRANSFER" ? "Origen → Destino" : "Sucursal"}</span>
              <span className="text-white">{selectedMovement.branchLabel}</span>
            </div>

            {selectedMovement.editable && !readOnly ? (
              <div className="space-y-3 pt-2 border-t border-slate-800">
                <div>
                  <label className="block text-slate-400 text-xs mb-1">Cantidad</label>
                  <input
                    type="number"
                    min="1"
                    value={editQuantity}
                    onChange={(e) => setEditQuantity(e.target.value)}
                    className={`${inputCls} w-full`}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Al cambiar la cantidad, el stock se ajusta automáticamente
                    {selectedMovement.type === "BRANCH_TRANSFER" ? " en ambas sedes." : "."}
                  </p>
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1">Nota</label>
                  <input
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    placeholder="Sin nota"
                    className={`${inputCls} w-full`}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveMovement}
                    disabled={saving}
                    className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {saving ? "Guardando..." : "Guardar cambios"}
                  </button>
                  <button onClick={() => setSelectedMovement(null)} className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg text-sm">Cancelar</button>
                </div>
              </div>
            ) : (
              <p className="pt-2 border-t border-slate-800 text-xs text-slate-500">
                {readOnly
                  ? "Modo consulta: tu rol no permite editar movimientos."
                  : "Este movimiento no se puede editar (transferencia antigua sin vínculo entre sus dos lados)."}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
