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
import { Supplier } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { sortByCreatedAtDesc } from '@/lib/helpers';

type SupplierForm = {
  name: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
};

const defaultForm: SupplierForm = {
  name: '',
  contact: '',
  phone: '',
  email: '',
  address: ''
};

export default function Suppliers() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState<SupplierForm>(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'suppliers'));
    return onSnapshot(q, (snapshot) => {
      const rows = snapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Supplier, 'id'>)
      }));
      rows.sort((a: any, b: any) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
      setSuppliers(rows as Supplier[]);
    });
  }, []);

  const editingSupplier = useMemo(
    () => suppliers.find((item) => item.id === editingId) || null,
    [suppliers, editingId]
  );

  const resetForm = () => {
    setForm(defaultForm);
    setEditingId(null);
  };

  const startEdit = (supplier: Supplier) => {
    setEditingId(supplier.id);
    setForm({
      name: supplier.name,
      contact: supplier.contact,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address
    });
  };

  const saveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    const payload = {
      name: form.name.trim(),
      contact: form.contact.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      active: true,
      createdAt: Date.now()
    };

    if (editingSupplier) {
      await updateDoc(doc(db, 'suppliers', editingSupplier.id), {
        ...payload,
        createdAt: (editingSupplier as any).createdAt || Date.now()
      });
    } else {
      await addDoc(collection(db, 'suppliers'), payload);
    }

    resetForm();
  };

  const removeSupplier = async (id: string) => {
    if (!isAdmin) return;
    if (!window.confirm('確定刪除供應商？')) return;
    await deleteDoc(doc(db, 'suppliers', id));
  };

  return (
    <section className="space-y-4" id="suppliers-page">
      <div className="card">
        <h2 className="text-lg font-semibold">供應商管理</h2>
        <p className="text-sm text-gray-600 mt-1">供應商主檔維護與聯絡資訊管理</p>
      </div>

      {isAdmin && (
        <form className="card space-y-3" onSubmit={saveSupplier}>
          <h3 className="font-medium">{editingId ? '編輯供應商' : '新增供應商'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input className="input-field" placeholder="供應商名稱" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
            <input className="input-field" placeholder="聯絡人" value={form.contact} onChange={(e) => setForm((p) => ({ ...p, contact: e.target.value }))} required />
            <input className="input-field" placeholder="電話" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} required />
            <input className="input-field" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} required />
            <input className="input-field md:col-span-2" placeholder="地址" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} required />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" type="submit">{editingId ? '更新' : '新增'}</button>
            {editingId && <button className="btn-secondary" type="button" onClick={resetForm}>取消</button>}
          </div>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-2">名稱</th>
              <th className="py-2 pr-2">聯絡人</th>
              <th className="py-2 pr-2">電話</th>
              <th className="py-2 pr-2">Email</th>
              <th className="py-2 pr-2">地址</th>
              {isAdmin && <th className="py-2">操作</th>}
            </tr>
          </thead>
          <tbody>
            {suppliers.map((item) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="py-2 pr-2">{item.name}</td>
                <td className="py-2 pr-2">{item.contact}</td>
                <td className="py-2 pr-2">{item.phone}</td>
                <td className="py-2 pr-2">{item.email}</td>
                <td className="py-2 pr-2">{item.address}</td>
                {isAdmin && (
                  <td className="py-2 flex gap-2">
                    <button className="text-blue-600" onClick={() => startEdit(item)}>編輯</button>
                    <button className="text-red-600" onClick={() => removeSupplier(item.id)}>刪除</button>
                  </td>
                )}
              </tr>
            ))}
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={isAdmin ? 6 : 5} className="py-4 text-center text-gray-500">尚無供應商資料</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
