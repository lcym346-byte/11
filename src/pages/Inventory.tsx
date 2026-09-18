import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { InventoryRecord, Product, Store, StockMovement } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { createNotification } from '@/lib/notifications';
import { formatDateTime, sortByCreatedAtDesc } from '@/lib/helpers';

type AdjustForm = {
  storeId: string;
  productId: string;
  delta: string;
  note: string;
};

export default function Inventory() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [inventoryRows, setInventoryRows] = useState<InventoryRecord[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [adjustForm, setAdjustForm] = useState<AdjustForm>({
    storeId: user?.storeId || '',
    productId: '',
    delta: '0',
    note: ''
  });

  useEffect(() => {
    const unsubProducts = onSnapshot(query(collection(db, 'products')), (snapshot) => {
      const rows = snapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Product, 'id'>)
      }));
      setProducts(rows);
    });

    const unsubStores = onSnapshot(query(collection(db, 'stores')), (snapshot) => {
      const rows = snapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Store, 'id'>)
      }));
      setStores(rows);
    });

    const unsubInventory = onSnapshot(query(collection(db, 'inventory')), (snapshot) => {
      const rows = snapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<InventoryRecord, 'id'>)
      }));
      setInventoryRows(sortByCreatedAtDesc(rows as any) as InventoryRecord[]);
    });

    const unsubMovements = onSnapshot(query(collection(db, 'stockMovements')), (snapshot) => {
      const rows = snapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<StockMovement, 'id'>)
      }));
      setMovements(sortByCreatedAtDesc(rows as any) as StockMovement[]);
    });

    return () => {
      unsubProducts();
      unsubStores();
      unsubInventory();
      unsubMovements();
    };
  }, []);

  useEffect(() => {
    if (!isAdmin && user?.storeId) {
      setAdjustForm((prev) => ({ ...prev, storeId: user.storeId as string }));
    }
  }, [isAdmin, user?.storeId]);

  const visibleInventory = useMemo(() => {
    if (isAdmin) return inventoryRows;
    return inventoryRows.filter((item) => item.storeId === user?.storeId);
  }, [inventoryRows, isAdmin, user?.storeId]);

  const visibleMovements = useMemo(() => {
    if (isAdmin) return movements.slice(0, 30);
    return movements.filter((item) => item.storeId === user?.storeId).slice(0, 30);
  }, [movements, isAdmin, user?.storeId]);

  const saveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const storeId = isAdmin ? adjustForm.storeId : user.storeId;
    const store = stores.find((item) => item.id === storeId);
    const product = products.find((item) => item.id === adjustForm.productId);
    const delta = Number(adjustForm.delta || 0);

    if (!store || !product || !delta) {
      alert('請選擇分店、商品並填寫異動數量（不可為 0）');
      return;
    }

    const inventoryId = `${store.id}_${product.id}`;
    const inventoryRef = doc(db, 'inventory', inventoryId);
    const snapshot = await getDoc(inventoryRef);

    const currentQty = snapshot.exists() ? Number(snapshot.data().quantity || 0) : 0;
    const newQty = currentQty + delta;

    await setDoc(
      inventoryRef,
      {
        storeId: store.id,
        storeName: store.name,
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        quantity: newQty,
        safetyStock: Number(product.safetyStock || 0),
        updatedAt: Date.now(),
        createdAt: snapshot.exists() ? snapshot.data().createdAt || Date.now() : Date.now()
      },
      { merge: true }
    );

    await addDoc(collection(db, 'stockMovements'), {
      storeId: store.id,
      productId: product.id,
      orderId: null,
      type: 'manual_adjustment',
      quantityChange: delta,
      beforeQty: currentQty,
      afterQty: newQty,
      note: adjustForm.note.trim() || '手動異動',
      createdBy: user.uid,
      createdAt: Date.now()
    });

    if (newQty < Number(product.safetyStock || 0)) {
      await createNotification({
        type: 'low_stock',
        title: '低庫存提醒',
        message: `${store.name} / ${product.name} 庫存 ${newQty} 低於安全庫存 ${product.safetyStock}`,
        targetRole: 'manager',
        targetStoreId: store.id
      });
    }

    setAdjustForm((prev) => ({ ...prev, productId: '', delta: '0', note: '' }));
  };

  return (
    <section className="space-y-4" id="inventory-page">
      <div className="card">
        <h2 className="text-lg font-semibold">庫存管理</h2>
        <p className="text-sm text-gray-600 mt-1">支援手動異動、庫存台帳與近 30 筆異動紀錄</p>
      </div>

      <form className="card space-y-3" onSubmit={saveAdjustment}>
        <h3 className="font-medium">手動調整庫存</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select
            className="input-field"
            value={isAdmin ? adjustForm.storeId : user?.storeId || ''}
            onChange={(e) => setAdjustForm((p) => ({ ...p, storeId: e.target.value }))}
            disabled={!isAdmin}
            required
          >
            <option value="">請選擇分店</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>{store.code} - {store.name}</option>
            ))}
          </select>
          <select
            className="input-field"
            value={adjustForm.productId}
            onChange={(e) => setAdjustForm((p) => ({ ...p, productId: e.target.value }))}
            required
          >
            <option value="">請選擇商品</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>
            ))}
          </select>
          <input
            className="input-field"
            type="number"
            placeholder="異動數量（正數=入庫、負數=出庫）"
            value={adjustForm.delta}
            onChange={(e) => setAdjustForm((p) => ({ ...p, delta: e.target.value }))}
            required
          />
          <input
            className="input-field"
            placeholder="異動原因"
            value={adjustForm.note}
            onChange={(e) => setAdjustForm((p) => ({ ...p, note: e.target.value }))}
          />
        </div>
        <button className="btn-primary" type="submit">送出異動</button>
      </form>

      <div className="card overflow-x-auto">
        <h3 className="font-medium mb-2">庫存台帳</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-2">分店</th>
              <th className="py-2 pr-2">SKU</th>
              <th className="py-2 pr-2">商品</th>
              <th className="py-2 pr-2">目前庫存</th>
              <th className="py-2 pr-2">安全庫存</th>
              <th className="py-2 pr-2">狀態</th>
              <th className="py-2">更新時間</th>
            </tr>
          </thead>
          <tbody>
            {visibleInventory.map((item) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="py-2 pr-2">{item.storeName}</td>
                <td className="py-2 pr-2">{item.sku}</td>
                <td className="py-2 pr-2">{item.productName}</td>
                <td className="py-2 pr-2">{item.quantity}</td>
                <td className="py-2 pr-2">{item.safetyStock}</td>
                <td className="py-2 pr-2">
                  {item.quantity < item.safetyStock ? (
                    <span className="text-red-700 font-medium">低庫存</span>
                  ) : (
                    <span className="text-green-700">正常</span>
                  )}
                </td>
                <td className="py-2">{formatDateTime(item.updatedAt)}</td>
              </tr>
            ))}
            {visibleInventory.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-gray-500">尚無庫存資料</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <h3 className="font-medium mb-2">最近異動紀錄</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-2">分店</th>
              <th className="py-2 pr-2">商品</th>
              <th className="py-2 pr-2">異動量</th>
              <th className="py-2 pr-2">前庫存</th>
              <th className="py-2 pr-2">後庫存</th>
              <th className="py-2 pr-2">原因</th>
              <th className="py-2">時間</th>
            </tr>
          </thead>
          <tbody>
            {visibleMovements.map((item) => {
              const productName = products.find((p) => p.id === item.productId)?.name || item.productId;
              const storeName = stores.find((s) => s.id === item.storeId)?.name || item.storeId;
              return (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="py-2 pr-2">{storeName}</td>
                  <td className="py-2 pr-2">{productName}</td>
                  <td className={`py-2 pr-2 ${item.quantityChange >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {item.quantityChange >= 0 ? `+${item.quantityChange}` : item.quantityChange}
                  </td>
                  <td className="py-2 pr-2">{item.beforeQty}</td>
                  <td className="py-2 pr-2">{item.afterQty}</td>
                  <td className="py-2 pr-2">{item.note}</td>
                  <td className="py-2">{formatDateTime(item.createdAt)}</td>
                </tr>
              );
            })}
            {visibleMovements.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-gray-500">尚無異動紀錄</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
