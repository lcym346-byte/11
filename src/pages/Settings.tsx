import { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions as cfFunctions } from '@/lib/firebase';
import { useAuthStore } from '@/store/authStore';
import { Category } from '@/types';

type CategoryForm = {
  name: string;
  sortOrder: string;
};

export default function Settings() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [categories, setCategories] = useState<Category[]>([]);
  const [erpWebhookUrl, setErpWebhookUrl] = useState('');
  const [erpImportUrl, setErpImportUrl] = useState('');
  const [lowStockEnabled, setLowStockEnabled] = useState(true);
  const [lowStockLeadDays, setLowStockLeadDays] = useState('3');
  const [categoryForm, setCategoryForm] = useState<CategoryForm>({ name: '', sortOrder: '1' });
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const unsubCategories = onSnapshot(query(collection(db, 'categories')), (snapshot) => {
      const rows = snapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Category, 'id'>)
      }));
      rows.sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
      setCategories(rows);
    });

    const loadSystem = async () => {
      const settingDoc = await getDoc(doc(db, 'settings', 'system'));
      if (settingDoc.exists()) {
        const data = settingDoc.data();
        setErpWebhookUrl(data.erpWebhookUrl || '');
        setErpImportUrl(data.erpImportUrl || '');
        setLowStockEnabled(data.lowStockEnabled ?? true);
        setLowStockLeadDays(String(data.lowStockLeadDays ?? 3));
      }
    };

    void loadSystem();

    return () => {
      unsubCategories();
    };
  }, []);

  const saveSystemSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !user) return;

    await setDoc(
      doc(db, 'settings', 'system'),
      {
        erpWebhookUrl: erpWebhookUrl.trim(),
        erpImportUrl: erpImportUrl.trim(),
        lowStockEnabled,
        lowStockLeadDays: Number(lowStockLeadDays || 3),
        updatedBy: user.uid,
        updatedAt: Date.now()
      },
      { merge: true }
    );

    alert('系統設定已儲存');
  };

  const importErpOrders = async () => {
    if (!isAdmin) return;
    setImporting(true);
    try {
      const callable = httpsCallable(cfFunctions, 'importERPOrders');
      const result = await callable({});
      const data = result.data as { success: boolean; imported?: number; message?: string };
      if (data.success) {
        alert(`ERP 匯入完成，新增/更新 ${data.imported || 0} 筆`);
      } else {
        alert(`ERP 匯入失敗：${data.message || 'unknown error'}`);
      }
    } catch (error: any) {
      alert(`ERP 匯入失敗：${error?.message || 'unknown error'}`);
    } finally {
      setImporting(false);
    }
  };

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    await addDoc(collection(db, 'categories'), {
      name: categoryForm.name.trim(),
      sortOrder: Number(categoryForm.sortOrder || 0),
      createdAt: Date.now()
    });

    setCategoryForm({ name: '', sortOrder: '1' });
  };

  const updateCategoryName = async (id: string, name: string) => {
    if (!isAdmin) return;
    await updateDoc(doc(db, 'categories', id), { name });
  };

  const updateCategorySort = async (id: string, sortOrder: number) => {
    if (!isAdmin) return;
    await updateDoc(doc(db, 'categories', id), { sortOrder });
  };

  const removeCategory = async (id: string) => {
    if (!isAdmin) return;
    if (!window.confirm('確定刪除此分類？')) return;
    await deleteDoc(doc(db, 'categories', id));
  };

  if (!isAdmin) {
    return <div className="card">只有 admin 可使用此頁</div>;
  }

  return (
    <section className="space-y-4" id="settings-page">
      <div className="card">
        <h2 className="text-lg font-semibold">系統設定</h2>
        <p className="text-sm text-gray-600 mt-1">分類主檔、低庫存參數、ERP 推送與匯入設定</p>
      </div>

      <form className="card space-y-3" onSubmit={saveSystemSettings}>
        <h3 className="font-medium">ERP / 系統參數</h3>
        <input
          className="input-field"
          placeholder="ERP 推送 Webhook URL (POST https://...)"
          value={erpWebhookUrl}
          onChange={(e) => setErpWebhookUrl(e.target.value)}
        />
        <input
          className="input-field"
          placeholder="ERP 匯入 API URL (GET https://... 回傳 JSON 陣列)"
          value={erpImportUrl}
          onChange={(e) => setErpImportUrl(e.target.value)}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={lowStockEnabled}
              onChange={(e) => setLowStockEnabled(e.target.checked)}
            />
            啟用低庫存提醒
          </label>
          <input
            className="input-field"
            type="number"
            min={1}
            placeholder="低庫存前置天數"
            value={lowStockLeadDays}
            onChange={(e) => setLowStockLeadDays(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button className="btn-primary" type="submit">儲存系統設定</button>
          <button className="btn-secondary" type="button" disabled={importing} onClick={importErpOrders}>
            {importing ? '匯入中...' : '立即匯入 ERP 訂單'}
          </button>
        </div>
      </form>

      <form className="card space-y-3" onSubmit={addCategory}>
        <h3 className="font-medium">新增商品分類</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            className="input-field"
            placeholder="分類名稱"
            value={categoryForm.name}
            onChange={(e) => setCategoryForm((p) => ({ ...p, name: e.target.value }))}
            required
          />
          <input
            className="input-field"
            type="number"
            placeholder="排序"
            value={categoryForm.sortOrder}
            onChange={(e) => setCategoryForm((p) => ({ ...p, sortOrder: e.target.value }))}
            required
          />
        </div>
        <button className="btn-primary" type="submit">新增分類</button>
      </form>

      <div className="card overflow-x-auto">
        <h3 className="font-medium mb-2">分類列表</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-2">分類名稱</th>
              <th className="py-2 pr-2">排序</th>
              <th className="py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <tr key={category.id} className="border-b last:border-0">
                <td className="py-2 pr-2">
                  <input
                    className="border rounded px-2 py-1 w-full"
                    defaultValue={category.name}
                    onBlur={(e) => updateCategoryName(category.id, e.target.value.trim())}
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    className="border rounded px-2 py-1 w-24"
                    type="number"
                    defaultValue={category.sortOrder}
                    onBlur={(e) => updateCategorySort(category.id, Number(e.target.value || 0))}
                  />
                </td>
                <td className="py-2">
                  <button className="text-red-600" onClick={() => removeCategory(category.id)}>刪除</button>
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr>
                <td colSpan={3} className="py-4 text-center text-gray-500">尚無分類</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
