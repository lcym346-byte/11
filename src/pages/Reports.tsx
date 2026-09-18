import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { InventoryRecord, Order } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { isToday, sortByCreatedAtDesc, toMillis } from '@/lib/helpers';

type TrendRow = {
  date: string;
  count: number;
  amount: number;
};

function formatDay(ms: number) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escapeCell = (value: string | number) => {
    const text = String(value ?? '');
    const escaped = text.split('"').join('""');
    return `"${escaped}"`;
  };

  const csv = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    orderCount: 0,
    draftCount: 0,
    submittedCount: 0,
    approvedCount: 0,
    shippedCount: 0,
    receivedCount: 0,
    closedCount: 0,
    rejectedCount: 0,
    totalAmount: 0,
    todayOrders: 0,
    totalProducts: 0,
    totalStores: 0,
    lowStockCount: 0,
    erpSuccessCount: 0,
    erpFailedCount: 0
  });

  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [allVisibleOrders, setAllVisibleOrders] = useState<Order[]>([]);
  const [lowStockRows, setLowStockRows] = useState<InventoryRecord[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const ordersQuery = isAdmin
          ? query(collection(db, 'orders'))
          : query(collection(db, 'orders'), where('storeId', '==', user.storeId || '__no_store__'));

        const [productsSnap, storesSnap, orderSnap, inventorySnap] = await Promise.all([
          getDocs(collection(db, 'products')),
          getDocs(collection(db, 'stores')),
          getDocs(ordersQuery),
          getDocs(query(collection(db, 'inventory')))
        ]);

        const visibleOrders = orderSnap.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<Order, 'id'>)
        }));

        const inventory = inventorySnap.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<InventoryRecord, 'id'>)
        }));

        const visibleInventory = isAdmin
          ? inventory
          : inventory.filter((row) => row.storeId === user.storeId);

        const lowStock = visibleInventory.filter(
          (row) => Number(row.quantity || 0) < Number(row.safetyStock || 0)
        );

        const sortedOrders = sortByCreatedAtDesc(visibleOrders);
        setAllVisibleOrders(sortedOrders);
        setLowStockRows(lowStock);
        setRecentOrders(sortedOrders.slice(0, 10));

        setStats({
          orderCount: visibleOrders.length,
          draftCount: visibleOrders.filter((o) => o.status === 'draft').length,
          submittedCount: visibleOrders.filter((o) => o.status === 'submitted').length,
          approvedCount: visibleOrders.filter((o) => o.status === 'approved').length,
          shippedCount: visibleOrders.filter((o) => o.status === 'shipped').length,
          receivedCount: visibleOrders.filter((o) => o.status === 'received').length,
          closedCount: visibleOrders.filter((o) => o.status === 'closed').length,
          rejectedCount: visibleOrders.filter((o) => o.status === 'rejected').length,
          totalAmount: visibleOrders.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0),
          todayOrders: visibleOrders.filter((o) => isToday(o.createdAt)).length,
          totalProducts: productsSnap.size,
          totalStores: storesSnap.size,
          lowStockCount: lowStock.length,
          erpSuccessCount: visibleOrders.filter((o) => o.erpSyncStatus === 'success').length,
          erpFailedCount: visibleOrders.filter((o) => o.erpSyncStatus === 'failed').length
        });
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [isAdmin, user]);

  const amountText = useMemo(() => stats.totalAmount.toLocaleString(), [stats.totalAmount]);

  const trendRows = useMemo<TrendRow[]>(() => {
    const map = new Map<string, { count: number; amount: number }>();

    allVisibleOrders.forEach((order) => {
      const ms = toMillis(order.createdAt);
      if (!ms) return;
      const day = formatDay(ms);
      const current = map.get(day) || { count: 0, amount: 0 };
      current.count += 1;
      current.amount += Number(order.totalAmount || 0);
      map.set(day, current);
    });

    return Array.from(map.entries())
      .map(([date, value]) => ({ date, ...value }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14);
  }, [allVisibleOrders]);

  const maxTrendCount = useMemo(
    () => Math.max(1, ...trendRows.map((item) => item.count)),
    [trendRows]
  );

  const exportOrdersCsv = () => {
    downloadCsv(
      'orders-report.csv',
      ['orderNo', 'storeName', 'status', 'itemsCount', 'totalAmount', 'createdAt', 'erpSyncStatus'],
      allVisibleOrders.map((order) => [
        order.orderNo,
        order.storeName,
        order.status,
        order.items?.length || 0,
        Number(order.totalAmount || 0),
        new Date(toMillis(order.createdAt)).toISOString(),
        order.erpSyncStatus || ''
      ])
    );
  };

  const exportLowStockCsv = () => {
    downloadCsv(
      'low-stock-report.csv',
      ['storeName', 'sku', 'productName', 'quantity', 'safetyStock', 'updatedAt'],
      lowStockRows.map((row) => [
        row.storeName,
        row.sku,
        row.productName,
        Number(row.quantity || 0),
        Number(row.safetyStock || 0),
        new Date(toMillis(row.updatedAt)).toISOString()
      ])
    );
  };

  return (
    <section className="space-y-4" id="reports-page">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">報表分析</h2>
            <p className="text-sm text-gray-600 mt-1">訂單狀態、低庫存、ERP 同步狀態整合報表</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={exportOrdersCsv}>
              匯出叫貨單 CSV
            </button>
            <button className="btn-secondary" onClick={exportLowStockCsv}>
              匯出低庫存 CSV
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card text-gray-500">載入報表中...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="card text-center"><div className="text-2xl font-bold text-primary-700">{stats.orderCount}</div><div className="text-sm text-gray-600 mt-1">總叫貨單</div></div>
            <div className="card text-center"><div className="text-2xl font-bold text-primary-700">{stats.submittedCount}</div><div className="text-sm text-gray-600 mt-1">待審核</div></div>
            <div className="card text-center"><div className="text-2xl font-bold text-primary-700">{stats.approvedCount}</div><div className="text-sm text-gray-600 mt-1">已核准</div></div>
            <div className="card text-center"><div className="text-2xl font-bold text-primary-700">{stats.todayOrders}</div><div className="text-sm text-gray-600 mt-1">今日單數</div></div>
            <div className="card text-center"><div className="text-2xl font-bold text-primary-700">{stats.shippedCount}</div><div className="text-sm text-gray-600 mt-1">已出貨</div></div>
            <div className="card text-center"><div className="text-2xl font-bold text-primary-700">{stats.receivedCount}</div><div className="text-sm text-gray-600 mt-1">已收貨</div></div>
            <div className="card text-center"><div className="text-2xl font-bold text-primary-700">{stats.closedCount}</div><div className="text-sm text-gray-600 mt-1">已結單</div></div>
            <div className="card text-center"><div className="text-2xl font-bold text-red-700">{stats.rejectedCount}</div><div className="text-sm text-gray-600 mt-1">已駁回</div></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="card"><div className="text-sm text-gray-500">總叫貨金額</div><div className="text-2xl font-bold mt-1">{amountText}</div></div>
            <div className="card"><div className="text-sm text-gray-500">商品總數</div><div className="text-2xl font-bold mt-1">{stats.totalProducts}</div></div>
            <div className="card"><div className="text-sm text-gray-500">分店總數</div><div className="text-2xl font-bold mt-1">{stats.totalStores}</div></div>
            <div className="card"><div className="text-sm text-gray-500">低庫存品項</div><div className="text-2xl font-bold mt-1 text-red-700">{stats.lowStockCount}</div></div>
            <div className="card"><div className="text-sm text-gray-500">ERP 同步成功</div><div className="text-2xl font-bold mt-1 text-green-700">{stats.erpSuccessCount}</div></div>
            <div className="card"><div className="text-sm text-gray-500">ERP 同步失敗</div><div className="text-2xl font-bold mt-1 text-red-700">{stats.erpFailedCount}</div></div>
          </div>

          <div className="card">
            <h3 className="font-medium mb-3">近 14 天叫貨單趨勢</h3>
            <div className="space-y-2">
              {trendRows.map((row) => (
                <div key={row.date} className="grid grid-cols-[96px_1fr_80px_120px] items-center gap-2 text-sm">
                  <span className="text-gray-600">{row.date}</span>
                  <div className="h-3 bg-gray-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-primary-600"
                      style={{ width: `${(row.count / maxTrendCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-gray-700 text-right">{row.count} 單</span>
                  <span className="text-gray-500 text-right">{row.amount.toLocaleString()}</span>
                </div>
              ))}
              {trendRows.length === 0 && <div className="text-gray-500 text-sm">尚無趨勢資料</div>}
            </div>
          </div>

          <div className="card overflow-x-auto">
            <h3 className="font-medium mb-2">最近叫貨單</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-2">單號</th>
                  <th className="py-2 pr-2">分店</th>
                  <th className="py-2 pr-2">狀態</th>
                  <th className="py-2 pr-2">ERP</th>
                  <th className="py-2 pr-2">金額</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id} className="border-b last:border-0">
                    <td className="py-2 pr-2">{order.orderNo}</td>
                    <td className="py-2 pr-2">{order.storeName}</td>
                    <td className="py-2 pr-2">{order.status}</td>
                    <td className="py-2 pr-2">{order.erpSyncStatus || '-'}</td>
                    <td className="py-2 pr-2">{Number(order.totalAmount || 0).toLocaleString()}</td>
                  </tr>
                ))}
                {recentOrders.length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-center text-gray-500">尚無叫貨單資料</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="card overflow-x-auto">
            <h3 className="font-medium mb-2">低庫存清單</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-2">分店</th>
                  <th className="py-2 pr-2">SKU</th>
                  <th className="py-2 pr-2">商品</th>
                  <th className="py-2 pr-2">目前庫存</th>
                  <th className="py-2 pr-2">安全庫存</th>
                </tr>
              </thead>
              <tbody>
                {lowStockRows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="py-2 pr-2">{row.storeName}</td>
                    <td className="py-2 pr-2">{row.sku}</td>
                    <td className="py-2 pr-2">{row.productName}</td>
                    <td className="py-2 pr-2 text-red-700">{row.quantity}</td>
                    <td className="py-2 pr-2">{row.safetyStock}</td>
                  </tr>
                ))}
                {lowStockRows.length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-center text-gray-500">目前沒有低庫存項目</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
