import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import { db } from '@/lib/firebase';
import { isToday } from '@/lib/helpers';

export default function Dashboard() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    pendingOrders: 0,
    todayOrders: 0,
    totalProducts: 0,
    totalStores: 0,
    lowStockCount: 0,
    unreadNotifications: 0
  });

  useEffect(() => {
    const loadStats = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const ordersQuery = isAdmin
          ? query(collection(db, 'orders'))
          : query(collection(db, 'orders'), where('storeId', '==', user.storeId || '__no_store__'));

        const [productsSnap, storesSnap, ordersSnap, inventorySnap, notificationsSnap] = await Promise.all([
          getDocs(collection(db, 'products')),
          getDocs(collection(db, 'stores')),
          getDocs(ordersQuery),
          getDocs(query(collection(db, 'inventory'))),
          getDocs(query(collection(db, 'notifications')))
        ]);

        const visibleOrders = ordersSnap.docs.map((docItem) => docItem.data());

        const inventory = inventorySnap.docs.map((docItem) => docItem.data());
        const visibleInventory = isAdmin
          ? inventory
          : inventory.filter((item) => item.storeId === user.storeId);

        const notifications = notificationsSnap.docs.map((docItem) => docItem.data());
        const visibleNotifications = notifications.filter((item) => {
          const roleOk = !item.targetRole || item.targetRole === 'all' || item.targetRole === user.role;
          const storeOk = !item.targetStoreId || item.targetStoreId === user.storeId;
          return roleOk && storeOk;
        });

        setStats({
          pendingOrders: visibleOrders.filter((item) => item.status === 'submitted').length,
          todayOrders: visibleOrders.filter((item) => isToday(item.createdAt)).length,
          totalProducts: productsSnap.size,
          totalStores: storesSnap.size,
          lowStockCount: visibleInventory.filter((item) => Number(item.quantity || 0) < Number(item.safetyStock || 0)).length,
          unreadNotifications: visibleNotifications.filter((item) => !(item.readBy || []).includes(user.uid)).length
        });
      } finally {
        setLoading(false);
      }
    };

    void loadStats();
  }, [isAdmin, user]);

  return (
    <div className="space-y-4" id="dashboard-page">
      <div className="card">
        <h2 className="text-lg font-semibold mb-2">{t('dashboard.welcome', { name: user?.displayName || '-' })}</h2>
        <p className="text-sm text-gray-600">{t('dashboard.intro')}</p>
      </div>

      {loading ? (
        <div className="card text-gray-500">載入統計中...</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="card text-center">
            <div className="text-2xl font-bold text-primary-700">{stats.pendingOrders}</div>
            <div className="text-sm text-gray-600 mt-1">{t('dashboard.pendingOrders')}</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-primary-700">{stats.todayOrders}</div>
            <div className="text-sm text-gray-600 mt-1">{t('dashboard.todayOrders')}</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-primary-700">{stats.totalProducts}</div>
            <div className="text-sm text-gray-600 mt-1">{t('dashboard.totalProducts')}</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-primary-700">{stats.totalStores}</div>
            <div className="text-sm text-gray-600 mt-1">{t('dashboard.totalStores')}</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-red-700">{stats.lowStockCount}</div>
            <div className="text-sm text-gray-600 mt-1">低庫存品項</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-amber-700">{stats.unreadNotifications}</div>
            <div className="text-sm text-gray-600 mt-1">未讀通知</div>
          </div>
        </div>
      )}
    </div>
  );
}
