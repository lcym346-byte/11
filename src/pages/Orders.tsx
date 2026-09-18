import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions as cfFunctions } from '@/lib/firebase';
import { Order, OrderItem, Product, Store } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { createNotification } from '@/lib/notifications';
import { formatDateTime, sortByCreatedAtDesc } from '@/lib/helpers';

type DraftRow = {
  productId: string;
  quantity: string;
};

type NewOrderForm = {
  storeId: string;
  note: string;
};

function genOrderNo() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `ORD-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function buildOrderItems(rows: DraftRow[], products: Product[]): OrderItem[] {
  const parsed = rows
    .map((row) => {
      const product = products.find((item) => item.id === row.productId);
      const qty = Number(row.quantity || 0);
      if (!product || qty <= 0) return null;

      const unitPrice = Number(product.transferPrice || product.salePrice || 0);
      return {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        unit: product.unit,
        quantity: qty,
        approvedQuantity: qty,
        receivedQuantity: 0,
        unitPrice,
        subtotal: unitPrice * qty
      } as OrderItem;
    })
    .filter(Boolean) as OrderItem[];

  return parsed;
}

export default function Orders() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<NewOrderForm>({
    storeId: user?.storeId || '',
    note: ''
  });
  const [rows, setRows] = useState<DraftRow[]>([{ productId: '', quantity: '1' }]);

  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editingRows, setEditingRows] = useState<DraftRow[]>([{ productId: '', quantity: '1' }]);
  const [editingNote, setEditingNote] = useState('');

  useEffect(() => {
    const unsubProducts = onSnapshot(query(collection(db, 'products')), (snapshot) => {
      const data = snapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Product, 'id'>)
      }));
      setProducts(data);
    });

    const unsubStores = onSnapshot(query(collection(db, 'stores')), (snapshot) => {
      const data = snapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Store, 'id'>)
      }));
      setStores(data);
    });

    const ordersQuery = isAdmin
      ? query(collection(db, 'orders'))
      : query(collection(db, 'orders'), where('storeId', '==', user?.storeId || '__no_store__'));

    const unsubOrders = onSnapshot(ordersQuery, (snapshot) => {
      const data = snapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Order, 'id'>)
      }));

      setOrders(sortByCreatedAtDesc(data as any) as Order[]);
    });

    return () => {
      unsubProducts();
      unsubStores();
      unsubOrders();
    };
  }, [isAdmin, user?.storeId]);

  useEffect(() => {
    if (!isAdmin && user?.storeId) {
      setForm((prev) => ({ ...prev, storeId: user.storeId as string }));
    }
  }, [isAdmin, user?.storeId]);

  const productOptions = useMemo(
    () => products.filter((item) => item.active !== false),
    [products]
  );

  const storeOptions = useMemo(() => stores.filter((item) => item.active !== false), [stores]);

  const createOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const targetStoreId = isAdmin ? form.storeId : user.storeId;
    const targetStore = stores.find((item) => item.id === targetStoreId);
    if (!targetStore) {
      alert('請先選擇分店');
      return;
    }

    const items = buildOrderItems(rows, products);
    if (items.length === 0) {
      alert('請至少加入一個有效商品（數量 > 0）');
      return;
    }

    setSubmitting(true);
    try {
      const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);

      await addDoc(collection(db, 'orders'), {
        orderNo: genOrderNo(),
        storeId: targetStore.id,
        storeName: targetStore.name,
        status: 'draft',
        items,
        totalAmount,
        note: form.note.trim(),
        createdBy: user.uid,
        createdAt: Date.now(),
        submittedAt: null,
        approvedBy: null,
        approvedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectedReason: '',
        shippedBy: null,
        shippedAt: null,
        receivedAt: null,
        closedAt: null,
        erpSyncedAt: null,
        erpSyncStatus: 'pending'
      });

      setRows([{ productId: '', quantity: '1' }]);
      setForm((prev) => ({ ...prev, note: '' }));
    } finally {
      setSubmitting(false);
    }
  };

  const updateDraftRows = (index: number, key: keyof DraftRow, value: string, mode: 'create' | 'edit') => {
    if (mode === 'create') {
      setRows((prev) => prev.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
    } else {
      setEditingRows((prev) => prev.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
    }
  };

  const addDraftRow = (mode: 'create' | 'edit') => {
    if (mode === 'create') {
      setRows((prev) => [...prev, { productId: '', quantity: '1' }]);
    } else {
      setEditingRows((prev) => [...prev, { productId: '', quantity: '1' }]);
    }
  };

  const removeDraftRow = (index: number, mode: 'create' | 'edit') => {
    if (mode === 'create') {
      setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
    } else {
      setEditingRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
    }
  };

  const submitOrder = async (order: Order) => {
    await updateDoc(doc(db, 'orders', order.id), {
      status: 'submitted',
      submittedAt: Date.now()
    });

    await createNotification({
      type: 'order_submitted',
      title: '新叫貨單待審核',
      message: `叫貨單 ${order.orderNo} 已送審（${order.storeName}）`,
      targetRole: 'admin',
      targetStoreId: null
    });
  };

  const approveOrder = async (order: Order) => {
    if (!user) return;
    await updateDoc(doc(db, 'orders', order.id), {
      status: 'approved',
      approvedBy: user.uid,
      approvedAt: Date.now()
    });

    await createNotification({
      type: 'order_approved',
      title: '叫貨單已核准',
      message: `叫貨單 ${order.orderNo} 已核准`,
      targetRole: 'manager',
      targetStoreId: order.storeId
    });
  };

  const rejectOrder = async (order: Order) => {
    if (!user) return;
    const reason = window.prompt('請輸入駁回原因') || '';
    await updateDoc(doc(db, 'orders', order.id), {
      status: 'rejected',
      rejectedBy: user.uid,
      rejectedAt: Date.now(),
      rejectedReason: reason
    });
  };

  const shipOrder = async (order: Order) => {
    if (!user) return;
    await updateDoc(doc(db, 'orders', order.id), {
      status: 'shipped',
      shippedBy: user.uid,
      shippedAt: Date.now()
    });
  };

  const receiveOrder = async (order: Order) => {
    if (!user) return;

    for (const item of order.items) {
      const inventoryId = `${order.storeId}_${item.productId}`;
      const inventoryRef = doc(db, 'inventory', inventoryId);
      const snapshot = await getDoc(inventoryRef);
      const beforeQty = snapshot.exists() ? Number(snapshot.data().quantity || 0) : 0;
      const incoming = Number(item.approvedQuantity || item.quantity || 0);
      const afterQty = beforeQty + incoming;

      await setDoc(
        inventoryRef,
        {
          storeId: order.storeId,
          storeName: order.storeName,
          productId: item.productId,
          productName: item.name,
          sku: item.sku,
          quantity: afterQty,
          safetyStock: Number(
            products.find((product) => product.id === item.productId)?.safetyStock || 0
          ),
          updatedAt: Date.now(),
          createdAt: snapshot.exists() ? snapshot.data().createdAt || Date.now() : Date.now()
        },
        { merge: true }
      );

      await addDoc(collection(db, 'stockMovements'), {
        storeId: order.storeId,
        productId: item.productId,
        orderId: order.id,
        type: 'order_receive',
        quantityChange: incoming,
        beforeQty,
        afterQty,
        note: `收貨入庫：${order.orderNo}`,
        createdBy: user.uid,
        createdAt: Date.now()
      });
    }

    await updateDoc(doc(db, 'orders', order.id), {
      status: 'received',
      receivedAt: Date.now(),
      items: order.items.map((item) => ({
        ...item,
        receivedQuantity: item.approvedQuantity || item.quantity
      }))
    });
  };

  const closeOrder = async (order: Order) => {
    await updateDoc(doc(db, 'orders', order.id), {
      status: 'closed',
      closedAt: Date.now()
    });
  };

  const beginEditDraft = (order: Order) => {
    setEditingOrderId(order.id);
    setEditingRows(
      order.items.map((item) => ({
        productId: item.productId,
        quantity: String(item.quantity)
      }))
    );
    setEditingNote(order.note || '');
  };

  const cancelEditDraft = () => {
    setEditingOrderId(null);
    setEditingRows([{ productId: '', quantity: '1' }]);
    setEditingNote('');
  };

  const saveDraftEdit = async (order: Order) => {
    const items = buildOrderItems(editingRows, products);
    if (items.length === 0) {
      alert('至少要保留一筆有效商品');
      return;
    }

    const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);
    await updateDoc(doc(db, 'orders', order.id), {
      items,
      totalAmount,
      note: editingNote.trim()
    });

    cancelEditDraft();
  };

  const syncToErp = async (order: Order) => {
    const callable = httpsCallable(cfFunctions, 'syncOrderToERP');
    try {
      const result = await callable({ orderId: order.id });
      const data = result.data as { success: boolean; statusCode?: number; message?: string };
      await updateDoc(doc(db, 'orders', order.id), {
        erpSyncedAt: Date.now(),
        erpSyncStatus: data.success ? 'success' : 'failed'
      });
      alert(data.success ? 'ERP 同步成功' : `ERP 同步失敗：${data.message || 'unknown error'}`);
    } catch (error: any) {
      await updateDoc(doc(db, 'orders', order.id), {
        erpSyncedAt: Date.now(),
        erpSyncStatus: 'failed'
      });
      alert(`ERP 同步失敗：${error?.message || 'unknown error'}`);
    }
  };

  return (
    <section className="space-y-4" id="orders-page">
      <div className="card">
        <h2 className="text-lg font-semibold">叫貨單</h2>
        <p className="text-sm text-gray-600 mt-1">
          完整流程：draft → submitted → approved → shipped → received → closed（或 rejected）
        </p>
      </div>

      <form onSubmit={createOrder} className="card space-y-3" id="order-form">
        <h3 className="font-medium">新增叫貨單（多品項）</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select
            className="input-field"
            value={isAdmin ? form.storeId : user?.storeId || ''}
            onChange={(e) => setForm((prev) => ({ ...prev, storeId: e.target.value }))}
            disabled={!isAdmin}
            required
          >
            <option value="">請選擇分店</option>
            {storeOptions.map((store) => (
              <option key={store.id} value={store.id}>
                {store.code} - {store.name}
              </option>
            ))}
          </select>

          <input
            className="input-field"
            placeholder="備註"
            value={form.note}
            onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
          />
        </div>

        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={index} className="grid grid-cols-1 md:grid-cols-[1fr_160px_100px] gap-2">
              <select
                className="input-field"
                value={row.productId}
                onChange={(e) => updateDraftRows(index, 'productId', e.target.value, 'create')}
                required
              >
                <option value="">請選擇商品</option>
                {productOptions.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.sku} - {product.name}
                  </option>
                ))}
              </select>

              <input
                className="input-field"
                type="number"
                min={1}
                value={row.quantity}
                onChange={(e) => updateDraftRows(index, 'quantity', e.target.value, 'create')}
                required
              />

              <button className="btn-secondary" type="button" onClick={() => removeDraftRow(index, 'create')}>
                刪除
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button className="btn-secondary" type="button" onClick={() => addDraftRow('create')}>
            + 新增品項
          </button>
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? '建立中...' : '建立草稿'}
          </button>
        </div>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm" id="orders-table">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-2">單號</th>
              <th className="py-2 pr-2">分店</th>
              <th className="py-2 pr-2">狀態</th>
              <th className="py-2 pr-2">品項數</th>
              <th className="py-2 pr-2">總額</th>
              <th className="py-2 pr-2">建立時間</th>
              <th className="py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const canSubmit = order.status === 'draft' && order.createdBy === user?.uid;
              const canEditDraft = order.status === 'draft' && order.createdBy === user?.uid;
              const canApprove = isAdmin && order.status === 'submitted';
              const canReject = isAdmin && order.status === 'submitted';
              const canShip = isAdmin && order.status === 'approved';
              const canReceive = order.status === 'shipped' && (isAdmin || order.storeId === user?.storeId);
              const canClose = order.status === 'received' && (isAdmin || order.createdBy === user?.uid);

              return (
                <tr key={order.id} className="border-b last:border-0 align-top">
                  <td className="py-2 pr-2">{order.orderNo}</td>
                  <td className="py-2 pr-2">{order.storeName}</td>
                  <td className="py-2 pr-2">{order.status}</td>
                  <td className="py-2 pr-2">{order.items?.length || 0}</td>
                  <td className="py-2 pr-2">{Number(order.totalAmount || 0).toLocaleString()}</td>
                  <td className="py-2 pr-2">{formatDateTime(order.createdAt)}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-2">
                      {canEditDraft && (
                        <button className="text-blue-600" onClick={() => beginEditDraft(order)}>
                          編輯草稿
                        </button>
                      )}
                      {canSubmit && (
                        <button className="text-indigo-700" onClick={() => submitOrder(order)}>
                          送出審核
                        </button>
                      )}
                      {canApprove && (
                        <button className="text-green-700" onClick={() => approveOrder(order)}>
                          核准
                        </button>
                      )}
                      {canReject && (
                        <button className="text-red-700" onClick={() => rejectOrder(order)}>
                          駁回
                        </button>
                      )}
                      {canShip && (
                        <button className="text-purple-700" onClick={() => shipOrder(order)}>
                          出貨
                        </button>
                      )}
                      {canReceive && (
                        <button className="text-emerald-700" onClick={() => receiveOrder(order)}>
                          收貨入庫
                        </button>
                      )}
                      {canClose && (
                        <button className="text-gray-700" onClick={() => closeOrder(order)}>
                          結單
                        </button>
                      )}
                      {isAdmin && (
                        <button className="text-orange-700" onClick={() => syncToErp(order)}>
                          同步 ERP
                        </button>
                      )}
                      {!canEditDraft &&
                        !canSubmit &&
                        !canApprove &&
                        !canReject &&
                        !canShip &&
                        !canReceive &&
                        !canClose && <span className="text-gray-400">-</span>}
                    </div>
                    {order.rejectedReason && (
                      <p className="text-xs text-red-600 mt-1">駁回原因：{order.rejectedReason}</p>
                    )}
                    {order.erpSyncStatus && (
                      <p className="text-xs text-gray-500 mt-1">ERP：{order.erpSyncStatus}</p>
                    )}
                  </td>
                </tr>
              );
            })}

            {orders.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-gray-500">
                  尚無叫貨單
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingOrderId && (
        <div className="card border-blue-200 bg-blue-50">
          <h3 className="font-medium mb-2">編輯草稿單</h3>
          <div className="space-y-2">
            {editingRows.map((row, index) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-[1fr_160px_100px] gap-2">
                <select
                  className="input-field"
                  value={row.productId}
                  onChange={(e) => updateDraftRows(index, 'productId', e.target.value, 'edit')}
                >
                  <option value="">請選擇商品</option>
                  {productOptions.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.sku} - {product.name}
                    </option>
                  ))}
                </select>
                <input
                  className="input-field"
                  type="number"
                  min={1}
                  value={row.quantity}
                  onChange={(e) => updateDraftRows(index, 'quantity', e.target.value, 'edit')}
                />
                <button className="btn-secondary" type="button" onClick={() => removeDraftRow(index, 'edit')}>
                  刪除
                </button>
              </div>
            ))}

            <input
              className="input-field"
              placeholder="備註"
              value={editingNote}
              onChange={(e) => setEditingNote(e.target.value)}
            />

            <div className="flex gap-2">
              <button className="btn-secondary" type="button" onClick={() => addDraftRow('edit')}>
                + 新增品項
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={() => {
                  const order = orders.find((item) => item.id === editingOrderId);
                  if (!order) return;
                  void saveDraftEdit(order);
                }}
              >
                儲存草稿
              </button>
              <button className="btn-secondary" type="button" onClick={cancelEditDraft}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
