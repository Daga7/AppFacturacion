import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";

interface Category {
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
  inventories?: { amount: number; branch: { name: string } }[];
}
interface StockItem {
  id: string;
  amount: number;
  product: Product;
  branch: { id: string; name: string };
}

type Tab = "productos" | "categorias" | "stock";

type ProductForm = { name: string; barcode: string; purchasePrice: string; salePrice: string; categoryId: string; isActive: boolean };
type CategoryForm = { name: string };

const emptyProduct: ProductForm = { name: "", barcode: "", purchasePrice: "0", salePrice: "0", categoryId: "", isActive: true };
const emptyCategory: CategoryForm = { name: "" };

export default function Inventario() {
  const [tab, setTab] = useState<Tab>("productos");
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState<ProductForm>(emptyProduct);

  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(emptyCategory);

  const [error, setError] = useState<string | null>(null);

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

  const loadStock = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<StockItem[]>("/inventory");
      setStock(data);
    } catch { setError("Error al cargar inventario"); }
    setLoading(false);
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (tab === "productos") { loadProducts(); loadCategories(); }
    else if (tab === "categorias") loadCategories();
    else if (tab === "stock") loadStock();
  }, [tab, loadProducts, loadCategories, loadStock]);
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

  const tabs: { key: Tab; label: string }[] = [
    { key: "productos", label: "Productos" },
    { key: "categorias", label: "Categorías" },
    { key: "stock", label: "Stock" },
  ];

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
            <h3 className="text-lg font-semibold text-white">{products.length} productos</h3>
            <button
              onClick={() => { setEditingProduct(null); setProductForm(emptyProduct); setShowProductForm(true); }}
              className="px-4 py-2 bg-brand/20 text-brand-light rounded-lg text-sm font-medium hover:bg-brand/30 transition-colors"
            >
              + Nuevo producto
            </button>
          </div>

          {showProductForm && (
            <div className="mb-4 p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
              <h4 className="text-white font-medium">{editingProduct ? "Editar producto" : "Nuevo producto"}</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input placeholder="Nombre" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" />
                <input placeholder="Código de barras" value={productForm.barcode} onChange={(e) => setProductForm({ ...productForm, barcode: e.target.value })} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" />
                <select value={productForm.categoryId} onChange={(e) => setProductForm({ ...productForm, categoryId: e.target.value })} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm">
                  <option value="">Seleccionar categoría</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input type="number" step="0.01" placeholder="Precio compra" value={productForm.purchasePrice} onChange={(e) => setProductForm({ ...productForm, purchasePrice: e.target.value })} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" />
                <input type="number" step="0.01" placeholder="Precio venta" value={productForm.salePrice} onChange={(e) => setProductForm({ ...productForm, salePrice: e.target.value })} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm" />
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
                  {products.map((p) => {
                    const totalStock = p.inventories?.reduce((s, i) => s + i.amount, 0) ?? 0;
                    return (
                      <tr key={p.id} className="border-b border-slate-800/50">
                        <td className="py-3 text-white">{p.name}</td>
                        <td className="py-3 text-slate-400 font-mono text-xs">{p.barcode}</td>
                        <td className="py-3 text-slate-400">{p.category.name}</td>
                        <td className="py-3 text-right text-slate-300">${p.purchasePrice}</td>
                        <td className="py-3 text-right text-slate-300">${p.salePrice}</td>
                        <td className="py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${totalStock > 5 ? "bg-emerald-900/30 text-emerald-400" : totalStock > 0 ? "bg-yellow-900/30 text-yellow-400" : "bg-red-900/30 text-red-400"}`}>
                            {totalStock}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <button onClick={() => editProduct(p)} className="text-slate-400 hover:text-white mr-2 text-xs">Editar</button>
                          <button onClick={() => handleDeleteProduct(p.id)} className="text-slate-400 hover:text-red-400 text-xs">Eliminar</button>
                        </td>
                      </tr>
                    );
                  })}
                  {products.length === 0 && (
                    <tr><td colSpan={7} className="py-8 text-center text-slate-500">No hay productos registrados</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "categorias" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">{categories.length} categorías</h3>
            <button
              onClick={() => { setEditingCategory(null); setCategoryForm(emptyCategory); setShowCategoryForm(true); }}
              className="px-4 py-2 bg-brand/20 text-brand-light rounded-lg text-sm font-medium hover:bg-brand/30 transition-colors"
            >
              + Nueva categoría
            </button>
          </div>

          {showCategoryForm && (
            <div className="mb-4 p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
              <h4 className="text-white font-medium">{editingCategory ? "Editar categoría" : "Nueva categoría"}</h4>
              <input placeholder="Nombre" value={categoryForm.name} onChange={(e) => setCategoryForm({ name: e.target.value })} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm w-full md:w-80" />
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
                <div className="flex gap-2">
                  <button onClick={() => editCategory(c)} className="text-xs text-slate-400 hover:text-white">Editar</button>
                  <button onClick={() => handleDeleteCategory(c.id)} className="text-xs text-slate-400 hover:text-red-400">Eliminar</button>
                </div>
              </div>
            ))}
            {categories.length === 0 && <p className="text-slate-500 text-sm">No hay categorías registradas</p>}
          </div>
        </div>
      )}

      {tab === "stock" && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">Estado de inventario</h3>
          {loading ? (
            <p className="text-slate-400">Cargando...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-800">
                    <th className="pb-3 font-medium">Producto</th>
                    <th className="pb-3 font-medium">Categoría</th>
                    <th className="pb-3 font-medium">Sucursal</th>
                    <th className="pb-3 font-medium text-right">Cantidad</th>
                    <th className="pb-3 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {stock.map((s) => (
                    <tr key={s.id} className="border-b border-slate-800/50">
                      <td className="py-3 text-white">{s.product.name}</td>
                      <td className="py-3 text-slate-400">{s.product.category.name}</td>
                      <td className="py-3 text-slate-400">{s.branch.name}</td>
                      <td className="py-3 text-right text-white font-mono">{s.amount}</td>
                      <td className="py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${s.amount > 5 ? "bg-emerald-900/30 text-emerald-400" : s.amount > 0 ? "bg-yellow-900/30 text-yellow-400" : "bg-red-900/30 text-red-400"}`}>
                          {s.amount > 5 ? "En stock" : s.amount > 0 ? "Stock bajo" : "Agotado"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {stock.length === 0 && (
                    <tr><td colSpan={5} className="py-8 text-center text-slate-500">No hay inventario registrado</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
