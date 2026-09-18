import { addDoc, collection } from 'firebase/firestore';
import { db } from './firebase';
import { UserRole } from '@/types';

export async function createNotification(params: {
  type: 'low_stock' | 'order_submitted' | 'order_approved' | 'system';
  title: string;
  message: string;
  targetRole?: UserRole | 'all';
  targetStoreId?: string | null;
}) {
  await addDoc(collection(db, 'notifications'), {
    ...params,
    targetRole: params.targetRole || 'all',
    targetStoreId: params.targetStoreId ?? null,
    readBy: [],
    createdAt: Date.now()
  });
}
