import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Category, Product, Supplier } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { sortByCreatedAtDesc } from '@/lib/helpers';

type ProductForm = {
  sku: string;
  name: string;
  unit: string;
  categoryId: string;
  supplierId: string;
  costPrice: string;
  transferPrice: string;
  salePrice: string;
  safetyStock: string;
  active: boolean;
};

const defaultForm: ProductForm = {
  sku: '',
  name: '',
  unit: '件',
  categoryId: '',
  supplierId: '',
  costPrice: '0',
  transferPrice: '0',
  salePrice: '0',
  safetyStock: '0',
  active: true
};

export default function Products() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState<ProductForm>(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const unsubProducts = onSnapshot(query(collection(db, 'products')), (snapshot) => {
      const data = snapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Product, 'id'>)
      }));
      setProducts(sortByCreatedAtDesc(data as any) as Product[]);
    });

    const unsubCategories = onSnapshot(query(collection(db, 'categories')), (snapshot) => {
      const data = snapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Category, 'id'>)
      }));
      data.sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
      setCategories(data);
    });

    const unsubSuppliers = onSnapshot(query(collection(db, 'suppliers')), (snapshot) => {
      const data = snapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Supplier, 'id'>)
      }));
      setSuppliers(data);
    });

    return () => {
      unsubProducts();
      unsubCategories();
      unsubSuppliers();
    };
  }, []);

  const editingProduct = useMemo(
    () => products.find((item) => item.id === editingId) || null,
    [products, editingId]
  );

  const categoryMap = useMemo(
    () => Object.fromEntries(categories.map((item) => [item.id, item.name])),
    [categories]
  );

  const supplierMap = useMemo(
    () => Object.fromEntries(suppliers.map((item) => [item.id, item.name])),
    [suppliers]
  );

  const resetForm = () => {
    setForm(defaultForm);
    setEditingId(null);
  };

  const startEdit = (product: Product) => {
    setEditingId(product.id);
    setForm({
      sku: product.sku,
      name: product.name,
      unit: product.unit,
      categoryId: product.categoryId || '',
      supplierId: product.supplierId || '',
      costPrice: String(product.costPrice ?? 0),
      transferPrice: String(product.transferPrice ?? 0),
      salePrice: String(product.salePrice ?? 0),
      safetyStock: String(product.safetyStock ?? 0),
      active: product.active !== false
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    setSubmitting(true);
    try {
      const payload = {
        sku: form.sku.trim(),
        barcode: '',
        name: form.name.trim(),
        categoryId: form.categoryId || '',
        unit: form.unit.trim() || '件',
        costPrice: Number(form.costPrice) || 0,
        transferPrice: Number(form.transferPrice) || 0,
        salePrice: Number(form.salePrice) || 0,
        supplierId: form.supplierId || null,
        safetyStock: Number(form.safetyStock) || 0,
        active: form.active
      };

      if (editingProduct) {
        await updateDoc(doc(db, 'products', editingProduct.id), payload);
      } else {
        await addDoc(collection(db, 'products'), {
          ...payload,
          createdAt: Date.now()
        });
      }
      resetForm();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
    if (!window.confirm('確定刪除這筆商品？')) return;
    await deleteDoc(doc(db, 'products', id));
  };

  return (
    <section className="space-y-4" id="products-page">
      <div className="card">
        <h2 className="text-lg font-semibold">商品管理</h2>
        <p className="text-sm text-gray-600 mt-1">目前共 {products.length} 筆商品資料</p>
      </div>

      {!isAdmin && (
        <div className="card bg-yellow-50 border-yellow-200 text-sm text-yellow-800">
          你目前為唯讀權限，可查看商品但不可新增/編輯/刪除。
        </div>
      )}

      {isAdmin && (
        <form className="card space-y-3" onSubmit={handleSubmit} id="product-form">
          <h3 className="font-medium">{editingId ? '編輯商品' : '新增商品'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input className="input-field" placeholder="商品編號 (SKU)" value={form.sku} onChange={(e) => setForm((prev) => ({ ...prev, sku: e.target.value }))} required />
            <input className="input-field" placeholder="商品名稱" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} required />
            <input className="input-field" placeholder="單位 (例: 件/箱)" value={form.unit} onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))} required />
            <select className="input-field" value={form.categoryId} onChange={(e) => setForm((prev) => ({ ...prev, categoryId: e.target.value }))}>
              <option value="">不指定分類</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
            <select className="input-field" value={form.supplierId} onChange={(e) => setForm((prev) => ({ ...prev, supplierId: e.target.value }))}>
              <option value="">不指定供應商</option>
              {suppliers.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
            <input type="number" className="input-field" placeholder="成本價" value={form.costPrice} onChange={(e) => setForm((prev) => ({ ...prev, costPrice: e.target.value }))} required />
            <input type="number" className="input-field" placeholder="調撥價" value={form.transferPrice} onChange={(e) => setForm((prev) => ({ ...prev, transferPrice: e.target.value }))} required />
            <input type="number" className="input-field" placeholder="售價" value={form.salePrice} onChange={(e) => setForm((prev) => ({ ...prev, salePrice: e.target.value }))} required />
            <input type="number" className="input-field" placeholder="安全庫存" value={form.safetyStock} onChange={(e) => setForm((prev) => ({ ...prev, safetyStock: e.target.value }))} required />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))} />
              啟用商品
            </label>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" type="submit" disabled={submitting}>{submitting ? '儲存中...' : editingId ? '更新商品' : '新增商品'}</button>
            {editingId && <button className="btn-secondary" type="button" onClick={resetForm}>取消編輯</button>}
          </div>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm" id="products-table">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-2">SKU</th>
              <th className="py-2 pr-2">名稱</th>
              <th className="py-2 pr-2">分類</th>
              <th className="py-2 pr-2">供應商</th>
              <th className="py-2 pr-2">售價</th>
              <th className="py-2 pr-2">安全庫存</th>
              <th className="py-2 pr-2">狀態</th>
              {isAdmin && <th className="py-2">操作</th>}
            </tr>
          </thead>
          <tbody>
            {products.map((item) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="py-2 pr-2">{item.sku}</td>
                <td className="py-2 pr-2">{item.name}</td>
                <td className="py-2 pr-2">{categoryMap[item.categoryId] || '-'}</td>
                <td className="py-2 pr-2">{item.supplierId ? supplierMap[item.supplierId] || '-' : '-'}</td>
                <td className="py-2 pr-2">{item.salePrice}</td>
                <td className="py-2 pr-2">{item.safetyStock}</td>
                <td className="py-2 pr-2">{item.active === false ? '停用' : '啟用'}</td>
                {isAdmin && (
                  <td className="py-2 flex gap-2">
                    <button className="text-blue-600" onClick={() => startEdit(item)}>編輯</button>
                    <button className="text-red-600" onClick={() => handleDelete(item.id)}>刪除</button>
                  </td>
                )}
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 8 : 7} className="py-4 text-center text-gray-500">尚無商品資料</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
