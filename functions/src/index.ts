import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

type UserDoc = {
  role?: string;
  active?: boolean;
  storeId?: string | null;
};

async function assertAdmin(uid: string) {
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new HttpsError('permission-denied', '查無使用者資料');
  }

  const user = userSnap.data() as UserDoc;
  if (user.active === false || user.role !== 'admin') {
    throw new HttpsError('permission-denied', '只有 admin 可執行此操作');
  }
}

// 健康檢查
export const ping = onCall({ region: 'asia-east1' }, async () => {
  return { ok: true, time: Date.now() };
});

// ERP 單筆推送同步
export const syncOrderToERP = onCall({ region: 'asia-east1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '請先登入');
  }

  await assertAdmin(request.auth.uid);

  const orderId = String(request.data?.orderId || '').trim();
  if (!orderId) {
    throw new HttpsError('invalid-argument', '缺少 orderId');
  }

  const settingSnap = await db.collection('settings').doc('system').get();
  const webhookUrl = String(settingSnap.data()?.erpWebhookUrl || '').trim();
  if (!webhookUrl) {
    return { success: false, message: '尚未設定 ERP Webhook URL' };
  }

  const orderRef = db.collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    throw new HttpsError('not-found', '找不到叫貨單');
  }

  const order = orderSnap.data();
  const payload = {
    orderId,
    syncedAt: Date.now(),
    source: 'stockflow-web-pro',
    order
  };

  let success = false;
  let statusCode = 0;
  let bodyText = '';

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    statusCode = response.status;
    bodyText = await response.text();
    success = response.ok;
  } catch (error: any) {
    bodyText = String(error?.message || error);
    success = false;
  }

  await db.collection('erpSyncLogs').add({
    type: 'push',
    orderId,
    webhookUrl,
    success,
    statusCode,
    response: bodyText.slice(0, 2000),
    triggeredBy: request.auth.uid,
    createdAt: Date.now()
  });

  await orderRef.update({
    erpSyncedAt: Date.now(),
    erpSyncStatus: success ? 'success' : 'failed'
  });

  return {
    success,
    statusCode,
    message: success ? 'ok' : bodyText.slice(0, 300)
  };
});

// ERP 匯入（GET API）
// 預期回傳格式（JSON 陣列）：
// [
//   {
//     "externalOrderNo": "ERP-001",
//     "storeId": "storeDocId",
//     "storeName": "台北門市",
//     "status": "approved",
//     "items": [{"productId":"...","sku":"...","name":"...","unit":"件","quantity":3,"unitPrice":100}],
//     "note": "...",
//     "createdAt": 1726000000000
//   }
// ]
export const importERPOrders = onCall({ region: 'asia-east1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '請先登入');
  }

  await assertAdmin(request.auth.uid);

  const settingSnap = await db.collection('settings').doc('system').get();
  const importUrl = String(settingSnap.data()?.erpImportUrl || '').trim();
  if (!importUrl) {
    return {
      success: false,
      imported: 0,
      message: '尚未設定 ERP 匯入 API URL'
    };
  }

  let payload: any;
  let statusCode = 0;

  try {
    const response = await fetch(importUrl, { method: 'GET' });
    statusCode = response.status;
    payload = await response.json();
    if (!response.ok) {
      return {
        success: false,
        imported: 0,
        message: `ERP API 錯誤，HTTP ${statusCode}`
      };
    }
  } catch (error: any) {
    return {
      success: false,
      imported: 0,
      message: String(error?.message || error)
    };
  }

  if (!Array.isArray(payload)) {
    return {
      success: false,
      imported: 0,
      message: 'ERP API 回傳格式錯誤：必須為 JSON 陣列'
    };
  }

  let imported = 0;

  for (const row of payload) {
    const externalOrderNo = String(row?.externalOrderNo || '').trim();
    const storeId = String(row?.storeId || '').trim();
    const storeName = String(row?.storeName || '').trim();
    const status = String(row?.status || 'approved').trim();
    const items = Array.isArray(row?.items) ? row.items : [];

    if (!externalOrderNo || !storeId || !storeName || items.length === 0) {
      continue;
    }

    const orderId = `erp_${externalOrderNo.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    const normalizedItems = items.map((item: any) => {
      const qty = Number(item.quantity || 0);
      const unitPrice = Number(item.unitPrice || 0);
      return {
        productId: String(item.productId || ''),
        sku: String(item.sku || ''),
        name: String(item.name || ''),
        unit: String(item.unit || '件'),
        quantity: qty,
        approvedQuantity: qty,
        receivedQuantity: status === 'received' || status === 'closed' ? qty : 0,
        unitPrice,
        subtotal: qty * unitPrice
      };
    });

    const totalAmount = normalizedItems.reduce(
      (sum: number, item: { subtotal: number }) => sum + Number(item.subtotal || 0),
      0
    );

    await db.collection('orders').doc(orderId).set(
      {
        orderNo: externalOrderNo,
        storeId,
        storeName,
        status,
        items: normalizedItems,
        totalAmount,
        note: String(row?.note || 'ERP 匯入'),
        createdBy: 'erp-import',
        createdAt: Number(row?.createdAt || Date.now()),
        submittedAt: Number(row?.submittedAt || Date.now()),
        approvedBy: row?.approvedBy || 'erp',
        approvedAt: Number(row?.approvedAt || Date.now()),
        rejectedBy: null,
        rejectedAt: null,
        rejectedReason: '',
        shippedBy: row?.shippedBy || null,
        shippedAt: Number(row?.shippedAt || 0) || null,
        receivedAt: Number(row?.receivedAt || 0) || null,
        closedAt: Number(row?.closedAt || 0) || null,
        erpSyncedAt: Date.now(),
        erpSyncStatus: 'success'
      },
      { merge: true }
    );

    imported += 1;
  }

  await db.collection('erpSyncLogs').add({
    type: 'pull',
    importUrl,
    success: true,
    imported,
    statusCode,
    triggeredBy: request.auth.uid,
    createdAt: Date.now()
  });

  return {
    success: true,
    imported,
    message: 'ok'
  };
});
