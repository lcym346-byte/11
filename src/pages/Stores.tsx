import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Store } from '@/types';
import { useAuthStore } from '@/store/authStore';

type StoreForm = {
  code: string;
  name: string;
  address: string;
  phone: string;
};

const defaultForm: StoreForm = {
  code: '',
  name: '',
  address: '',
  phone: ''
};

export default function Stores() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const [stores, setStores] = useState<Store[]>([]);
  const [form, setForm] = useState<StoreForm>(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'stores'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Store, 'id'>)
      }));
      setStores(data);
    });
  }, []);

  const editingStore = useMemo(
    () => stores.find((item) => item.id === editingId) || null,
    [stores, editingId]
  );

  const resetForm = () => {
    setForm(defaultForm);
    setEditingId(null);
  };

  const startEdit = (store: Store) => {
    setEditingId(store.id);
    setForm({
      code: store.code,
      name: store.name,
      address: store.address,
      phone: store.phone
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    setSubmitting(true);
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        managerId: null,
        active: true
      };

      if (editingStore) {
        await updateDoc(doc(db, 'stores', editingStore.id), payload);
      } else {
        await addDoc(collection(db, 'stores'), {
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
    if (!window.confirm('確定刪除這間分店？')) return;
    await deleteDoc(doc(db, 'stores', id));
  };

  return (
    <section className="space-y-4" id="stores-page">
      <div className="card">
        <h2 className="text-lg font-semibold">分店管理</h2>
        <p className="text-sm text-gray-600 mt-1">目前共 {stores.length} 間分店</p>
      </div>

      {!isAdmin && (
        <div className="card bg-yellow-50 border-yellow-200 text-sm text-yellow-800">
          你目前為唯讀權限，可查看分店但不可新增/編輯/刪除。
        </div>
      )}

      {isAdmin && (
        <form className="card space-y-3" onSubmit={handleSubmit} id="store-form">
          <h3 className="font-medium">{editingId ? '編輯分店' : '新增分店'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              className="input-field"
              placeholder="分店代碼"
              value={form.code}
              onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
              required
            />
            <input
              className="input-field"
              placeholder="分店名稱"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
            <input
              className="input-field"
              placeholder="電話"
              value={form.phone}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              required
            />
            <input
              className="input-field"
              placeholder="地址"
              value={form.address}
              onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
              required
            />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" type="submit" disabled={submitting}>
              {submitting ? '儲存中...' : editingId ? '更新分店' : '新增分店'}
            </button>
            {editingId && (
              <button className="btn-secondary" type="button" onClick={resetForm}>
                取消編輯
              </button>
            )}
          </div>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm" id="stores-table">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-2">代碼</th>
              <th className="py-2 pr-2">名稱</th>
              <th className="py-2 pr-2">電話</th>
              <th className="py-2 pr-2">地址</th>
              {isAdmin && <th className="py-2">操作</th>}
            </tr>
          </thead>
          <tbody>
            {stores.map((item) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="py-2 pr-2">{item.code}</td>
                <td className="py-2 pr-2">{item.name}</td>
                <td className="py-2 pr-2">{item.phone}</td>
                <td className="py-2 pr-2">{item.address}</td>
                {isAdmin && (
                  <td className="py-2 flex gap-2">
                    <button className="text-blue-600" onClick={() => startEdit(item)}>
                      編輯
                    </button>
                    <button className="text-red-600" onClick={() => handleDelete(item.id)}>
                      刪除
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {stores.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 5 : 4} className="py-4 text-center text-gray-500">
                  尚無分店資料
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
