import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AppUser, Store, UserRole } from '@/types';
import { useAuthStore } from '@/store/authStore';

type UserForm = {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  storeId: string;
  active: boolean;
};

const defaultForm: UserForm = {
  uid: '',
  email: '',
  displayName: '',
  role: 'staff',
  storeId: '',
  active: true
};

export default function Users() {
  const { user: currentUser } = useAuthStore();
  const isAdmin = currentUser?.role === 'admin';

  const [users, setUsers] = useState<AppUser[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [form, setForm] = useState<UserForm>(defaultForm);

  useEffect(() => {
    const unsubUsers = onSnapshot(query(collection(db, 'users')), (snapshot) => {
      const rows = snapshot.docs.map((item) => ({
        uid: item.id,
        ...(item.data() as Omit<AppUser, 'uid'>)
      }));
      setUsers(rows);
    });

    const unsubStores = onSnapshot(query(collection(db, 'stores')), (snapshot) => {
      const rows = snapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Store, 'id'>)
      }));
      setStores(rows);
    });

    return () => {
      unsubUsers();
      unsubStores();
    };
  }, []);

  const createOrUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    const uid = form.uid.trim();
    if (!uid) {
      alert('請填入 UID');
      return;
    }

    await setDoc(
      doc(db, 'users', uid),
      {
        email: form.email.trim(),
        displayName: form.displayName.trim(),
        role: form.role,
        storeId: form.storeId || null,
        active: form.active,
        updatedAt: Date.now(),
        createdAt: Date.now()
      },
      { merge: true }
    );

    setForm(defaultForm);
  };

  const toggleActive = async (target: AppUser) => {
    if (!isAdmin) return;
    await updateDoc(doc(db, 'users', target.uid), { active: !target.active, updatedAt: Date.now() });
  };

  const changeRole = async (target: AppUser, role: UserRole) => {
    if (!isAdmin) return;
    await updateDoc(doc(db, 'users', target.uid), { role, updatedAt: Date.now() });
  };

  const changeStore = async (target: AppUser, storeId: string) => {
    if (!isAdmin) return;
    await updateDoc(doc(db, 'users', target.uid), {
      storeId: storeId || null,
      updatedAt: Date.now()
    });
  };

  if (!isAdmin) {
    return <div className="card">只有 admin 可使用此頁</div>;
  }

  return (
    <section className="space-y-4" id="users-page">
      <div className="card">
        <h2 className="text-lg font-semibold">使用者管理</h2>
        <p className="text-sm text-gray-600 mt-1">可新增/維護 users 文件；Auth 帳號請先於 Firebase Console 建立</p>
      </div>

      <form className="card space-y-3" onSubmit={createOrUpdateProfile}>
        <h3 className="font-medium">新增/更新使用者資料</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input className="input-field" placeholder="UID（必填）" value={form.uid} onChange={(e) => setForm((p) => ({ ...p, uid: e.target.value }))} required />
          <input className="input-field" placeholder="Email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} required />
          <input className="input-field" placeholder="顯示名稱" value={form.displayName} onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))} required />
          <select className="input-field" value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as UserRole }))}>
            <option value="admin">admin</option>
            <option value="manager">manager</option>
            <option value="staff">staff</option>
          </select>
          <select className="input-field" value={form.storeId} onChange={(e) => setForm((p) => ({ ...p, storeId: e.target.value }))}>
            <option value="">不指定分店</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>{store.code} - {store.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))} />
            帳號啟用
          </label>
        </div>
        <button className="btn-primary" type="submit">儲存使用者資料</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-2">UID</th>
              <th className="py-2 pr-2">姓名</th>
              <th className="py-2 pr-2">Email</th>
              <th className="py-2 pr-2">角色</th>
              <th className="py-2 pr-2">分店</th>
              <th className="py-2 pr-2">狀態</th>
            </tr>
          </thead>
          <tbody>
            {users.map((row) => (
              <tr key={row.uid} className="border-b last:border-0">
                <td className="py-2 pr-2 text-xs break-all">{row.uid}</td>
                <td className="py-2 pr-2">{row.displayName}</td>
                <td className="py-2 pr-2">{row.email}</td>
                <td className="py-2 pr-2">
                  <select
                    className="border rounded px-2 py-1"
                    value={row.role}
                    onChange={(e) => changeRole(row, e.target.value as UserRole)}
                  >
                    <option value="admin">admin</option>
                    <option value="manager">manager</option>
                    <option value="staff">staff</option>
                  </select>
                </td>
                <td className="py-2 pr-2">
                  <select
                    className="border rounded px-2 py-1"
                    value={row.storeId || ''}
                    onChange={(e) => changeStore(row, e.target.value)}
                  >
                    <option value="">不指定</option>
                    {stores.map((store) => (
                      <option key={store.id} value={store.id}>{store.code} - {store.name}</option>
                    ))}
                  </select>
                </td>
                <td className="py-2 pr-2">
                  <button className={row.active ? 'text-green-700' : 'text-red-700'} onClick={() => toggleActive(row)}>
                    {row.active ? '啟用中（點擊停用）' : '已停用（點擊啟用）'}
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-gray-500">尚無使用者資料</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
