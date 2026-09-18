import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { NotificationItem } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { formatDateTime, sortByCreatedAtDesc } from '@/lib/helpers';

type FilterType = 'all' | NotificationItem['type'];

export default function Notifications() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [rows, setRows] = useState<NotificationItem[]>([]);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [onlyUnread, setOnlyUnread] = useState(false);

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetRole, setTargetRole] = useState<'all' | 'admin' | 'manager' | 'staff'>('all');

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'notifications')), (snapshot) => {
      const data = snapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<NotificationItem, 'id'>)
      }));
      setRows(sortByCreatedAtDesc(data as any) as NotificationItem[]);
    });
    return () => unsub();
  }, []);

  const visibleRows = useMemo(() => {
    if (!user) return [];

    return rows
      .filter((item) => {
        const roleOk = !item.targetRole || item.targetRole === 'all' || item.targetRole === user.role;
        const storeOk = !item.targetStoreId || item.targetStoreId === user.storeId;
        return roleOk && storeOk;
      })
      .filter((item) => (filterType === 'all' ? true : item.type === filterType))
      .filter((item) => (onlyUnread ? !(item.readBy || []).includes(user.uid) : true));
  }, [rows, user, filterType, onlyUnread]);

  const markAsRead = async (id: string) => {
    if (!user) return;
    await updateDoc(doc(db, 'notifications', id), {
      readBy: arrayUnion(user.uid)
    });
  };

  const markAllVisibleRead = async () => {
    if (!user) return;

    const targets = visibleRows.filter((item) => !(item.readBy || []).includes(user.uid));
    await Promise.all(
      targets.map((item) =>
        updateDoc(doc(db, 'notifications', item.id), {
          readBy: arrayUnion(user.uid)
        })
      )
    );
  };

  const createBroadcast = async (e: FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !title.trim() || !message.trim()) return;

    await addDoc(collection(db, 'notifications'), {
      type: 'system',
      title: title.trim(),
      message: message.trim(),
      targetRole,
      targetStoreId: null,
      readBy: [],
      createdAt: Date.now()
    });

    setTitle('');
    setMessage('');
    setTargetRole('all');
  };

  return (
    <section className="space-y-4" id="notifications-page">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">通知中心</h2>
            <p className="text-sm text-gray-600 mt-1">顯示低庫存、待審核等系統通知</p>
          </div>
          <button className="btn-secondary" onClick={markAllVisibleRead}>
            全部標示已讀
          </button>
        </div>
      </div>

      {isAdmin && (
        <form className="card space-y-3" onSubmit={createBroadcast}>
          <h3 className="font-medium">管理員廣播通知</h3>
          <input
            className="input-field"
            placeholder="標題"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <textarea
            className="input-field min-h-[90px]"
            placeholder="內容"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
          />
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">通知對象：</label>
            <select
              className="input-field max-w-[220px]"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value as any)}
            >
              <option value="all">全部</option>
              <option value="admin">admin</option>
              <option value="manager">manager</option>
              <option value="staff">staff</option>
            </select>
            <button className="btn-primary" type="submit">送出廣播</button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-gray-600">篩選類型：</label>
          <select
            className="input-field max-w-[220px]"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as FilterType)}
          >
            <option value="all">全部</option>
            <option value="system">系統</option>
            <option value="low_stock">低庫存</option>
            <option value="order_submitted">送審通知</option>
            <option value="order_approved">核准通知</option>
          </select>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyUnread}
              onChange={(e) => setOnlyUnread(e.target.checked)}
            />
            只看未讀
          </label>
        </div>
      </div>

      <div className="space-y-3">
        {visibleRows.map((item) => {
          const isRead = Boolean(user && item.readBy?.includes(user.uid));
          return (
            <article key={item.id} className={`card ${isRead ? 'opacity-70' : ''}`}>
              <header className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{item.message}</p>
                </div>
                <span className="text-xs text-gray-500">{formatDateTime(item.createdAt)}</span>
              </header>

              <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                <span>類型：{item.type}</span>
                <span>對象：{item.targetRole || 'all'}</span>
                {item.targetStoreId && <span>分店：{item.targetStoreId}</span>}
              </div>

              {!isRead && (
                <button className="text-blue-600 text-sm mt-2" onClick={() => markAsRead(item.id)}>
                  標記為已讀
                </button>
              )}
            </article>
          );
        })}

        {visibleRows.length === 0 && <div className="card text-gray-500">目前沒有通知</div>}
      </div>
    </section>
  );
}
