import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { MonthlyBillRecord, UscHistoryEntry } from '../types/solar';
import { computeLatest12MonthSummary } from '../utils/monthlyAverage';

export const USC_HISTORY_COLLECTION = 'usc_history';
export const ADMIN_EMAIL = 'veera.official1997@gmail.com';

const ALLOWED_STATES = new Set(['telangana', 'andhra_pradesh', 'odissa', 'chandigarh']);

/**
 * Generates a deterministic Firestore document ID matching `^[a-zA-Z0-9_\-]+$` (<= 128 chars)
 * verbatim with firebase-blueprint.json & firestore.rules.
 */
export function toValidUscDocId(uscNumber: string, stateId: string): string {
  const cleanUsc = uscNumber
    .trim()
    .toUpperCase()
    .replace(/[^a-zA-Z0-9_\-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const cleanState = normalizeStateId(stateId);
  const raw = `${cleanUsc || 'USC'}_${cleanState}`;
  return raw.slice(0, 128);
}

function normalizeStateId(stateId: string | undefined): string {
  const normalized = (stateId || '').trim().toLowerCase();
  if (ALLOWED_STATES.has(normalized)) return normalized;
  return 'telangana';
}

function clampString(value: string | undefined, maxLen: number): string {
  return (value || '').trim().slice(0, maxLen);
}

function sanitizeUscNumber(value: string | undefined): string {
  const cleaned = (value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_\-/. ]+/g, '')
    .slice(0, 40);
  return cleaned;
}

function clampNumber(value: unknown, min: number, max: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, num));
}

function sanitizeMonthsArray(months: MonthlyBillRecord[] | undefined): MonthlyBillRecord[] {
  if (!Array.isArray(months) || months.length === 0) return [];
  return months.slice(-24).map((m, idx) => {
    const clean: MonthlyBillRecord = {
      month: clampString(m.month || `M${idx + 1}`, 30),
      unitsKwh: Math.round(clampNumber(m.unitsKwh, 0, 1_000_000)),
      billAmountInr: Math.round(clampNumber(m.billAmountInr, 0, 100_000_000) * 100) / 100,
    };
    if (m.shortLabel) clean.shortLabel = clampString(m.shortLabel, 20);
    if (typeof m.calendarMonth0 === 'number' && Number.isFinite(m.calendarMonth0)) {
      clean.calendarMonth0 = Math.round(clampNumber(m.calendarMonth0, 0, 11));
    }
    if (typeof m.year === 'number' && Number.isFinite(m.year)) {
      clean.year = Math.round(clampNumber(m.year, 2000, 2100));
    }
    if (typeof m.sequenceNo === 'number' && Number.isFinite(m.sequenceNo)) {
      clean.sequenceNo = Math.round(clampNumber(m.sequenceNo, 1, 24));
    }
    if (typeof m.isRunningMonth === 'boolean') clean.isRunningMonth = m.isRunningMonth;
    if (typeof m.isVerifiedPortalData === 'boolean') {
      clean.isVerifiedPortalData = m.isVerifiedPortalData;
    }
    if (typeof m.demandInr === 'number' && Number.isFinite(m.demandInr)) {
      clean.demandInr = Math.round(clampNumber(m.demandInr, 0, 100_000_000) * 100) / 100;
    }
    if (typeof m.paidInr === 'number' && Number.isFinite(m.paidInr)) {
      clean.paidInr = Math.round(clampNumber(m.paidInr, 0, 100_000_000) * 100) / 100;
    }
    if (m.receiptNo) clean.receiptNo = clampString(m.receiptNo, 60);
    if (m.paidDate) clean.paidDate = clampString(m.paidDate, 40);
    return clean;
  });
}

function buildSanitizedBaseFields(entry: UscHistoryEntry) {
  const uscNumber = sanitizeUscNumber(entry.uscNumber);
  const stateId = normalizeStateId(entry.stateId);
  const id = toValidUscDocId(uscNumber, stateId);
  const months = sanitizeMonthsArray(entry.months);
  const summary12 = months.length > 0 ? computeLatest12MonthSummary(months) : null;

  const avgMonthlyUnits = Math.round(
    clampNumber(summary12 && summary12.basisCount > 0 ? summary12.avgUnits : entry.avgMonthlyUnits, 0, 1_000_000)
  );
  const avgMonthlyBill = Math.round(
    clampNumber(summary12 && summary12.basisCount > 0 ? summary12.avgBill : entry.avgMonthlyBill, 0, 100_000_000)
  );

  const payload: Record<string, unknown> = {
    id,
    uscNumber,
    discomShortName: clampString(entry.discomShortName || 'DISCOM', 60) || 'DISCOM',
    stateId,
    stateName: clampString(entry.stateName || stateId, 60) || 'Telangana',
    avgMonthlyUnits,
    avgMonthlyBill,
    monthsCount: Math.round(clampNumber(months.length || entry.monthsCount, 0, 24)),
    verifiedMonthsCount: Math.round(clampNumber(entry.verifiedMonthsCount, 0, 24)),
    lastFetchedAtIst: clampString(entry.lastFetchedAtIst || new Date().toLocaleString(), 60),
    timestampIso: clampString(entry.timestampIso || new Date().toISOString(), 40),
    visibility: 'public',
  };

  const consumerName = clampString(entry.consumerName, 120);
  if (consumerName) payload.consumerName = consumerName;

  const discomId = clampString(entry.discomId, 60);
  if (discomId) payload.discomId = discomId;

  if (typeof entry.sanctionedLoadKw === 'number' && Number.isFinite(entry.sanctionedLoadKw) && entry.sanctionedLoadKw >= 0) {
    payload.sanctionedLoadKw = Math.round(clampNumber(entry.sanctionedLoadKw, 0, 10000) * 100) / 100;
  }

  if (months.length > 0) {
    payload.months = months;
  }

  return { id, uscNumber, stateId, payload };
}

export function canDeleteSharedUscEntry(entry: UscHistoryEntry, user: User | null): boolean {
  if (!entry.isCloudSynced) return true;
  if (!user || !user.emailVerified) return false;
  if (user.email === ADMIN_EMAIL) return true;
  return Boolean(entry.ownerId && entry.ownerId === user.uid);
}

/**
 * Real-time subscription to all shared public USC history records in Firestore.
 * Uses `where('visibility', '==', 'public')` without a composite orderBy index,
 * then sorts newest-first in memory for instant zero-config operation across all browsers.
 */
export function subscribeSharedUscHistory(
  onData: (entries: UscHistoryEntry[]) => void,
  onNonFatalError?: (message: string) => void
): () => void {
  const q = query(
    collection(db, USC_HISTORY_COLLECTION),
    where('visibility', '==', 'public'),
    limit(50)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: UscHistoryEntry[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: typeof data.id === 'string' && data.id ? data.id : docSnap.id,
          uscNumber: typeof data.uscNumber === 'string' ? data.uscNumber : undefined,
          consumerName: typeof data.consumerName === 'string' ? data.consumerName : undefined,
          discomShortName: typeof data.discomShortName === 'string' ? data.discomShortName : 'DISCOM',
          discomId: typeof data.discomId === 'string' ? data.discomId : undefined,
          stateId: typeof data.stateId === 'string' ? data.stateId : 'telangana',
          stateName: typeof data.stateName === 'string' ? data.stateName : 'Telangana',
          sanctionedLoadKw:
            typeof data.sanctionedLoadKw === 'number' ? data.sanctionedLoadKw : undefined,
          avgMonthlyUnits: Number(data.avgMonthlyUnits) || 0,
          avgMonthlyBill: Number(data.avgMonthlyBill) || 0,
          monthsCount: Number(data.monthsCount) || 0,
          verifiedMonthsCount: Number(data.verifiedMonthsCount) || 0,
          lastFetchedAtIst: typeof data.lastFetchedAtIst === 'string' ? data.lastFetchedAtIst : '',
          timestampIso:
            typeof data.timestampIso === 'string' ? data.timestampIso : new Date(0).toISOString(),
          months: Array.isArray(data.months) ? (data.months as MonthlyBillRecord[]) : undefined,
          ownerId: typeof data.ownerId === 'string' ? data.ownerId : undefined,
          isCloudSynced: true,
        };
      });

      items.sort((a, b) => (b.timestampIso || '').localeCompare(a.timestampIso || ''));
      onData(items);
    },
    (error) => {
      if (onNonFatalError) {
        onNonFatalError(error instanceof Error ? error.message : String(error));
      }
      handleFirestoreError(error, OperationType.LIST, USC_HISTORY_COLLECTION);
    }
  );
}

/**
 * Publishes or refreshes a shared USC history record in Firestore.
 * Requires a verified signed-in Google user (matching firestore.rules).
 */
export async function saveSharedUscHistoryEntry(
  entry: UscHistoryEntry
): Promise<{ saved: boolean; docId?: string; reason?: 'unauthenticated' | 'invalid' }> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) {
    return { saved: false, reason: 'unauthenticated' };
  }

  const { id, uscNumber, payload } = buildSanitizedBaseFields(entry);
  if (!uscNumber || !id) {
    return { saved: false, reason: 'invalid' };
  }

  const path = `${USC_HISTORY_COLLECTION}/${id}`;
  const docRef = doc(db, USC_HISTORY_COLLECTION, id);

  let existsAlready = false;
  let existingOwnerId: string | undefined;
  try {
    const existingSnap = await getDoc(docRef);
    existsAlready = existingSnap.exists();
    existingOwnerId = existingSnap.data()?.ownerId;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (!existsAlready) {
    try {
      await setDoc(docRef, {
        ...payload,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { saved: true, docId: id };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  } else {
    const isOwnerOrAdmin = existingOwnerId === user.uid || user.email === ADMIN_EMAIL;
    const updatePayload: Record<string, unknown> = {
      avgMonthlyUnits: payload.avgMonthlyUnits,
      avgMonthlyBill: payload.avgMonthlyBill,
      monthsCount: payload.monthsCount,
      verifiedMonthsCount: payload.verifiedMonthsCount,
      lastFetchedAtIst: payload.lastFetchedAtIst,
      timestampIso: payload.timestampIso,
      updatedAt: serverTimestamp(),
    };

    if (payload.consumerName !== undefined) updatePayload.consumerName = payload.consumerName;
    if (payload.sanctionedLoadKw !== undefined) {
      updatePayload.sanctionedLoadKw = payload.sanctionedLoadKw;
    }
    if (payload.months !== undefined) updatePayload.months = payload.months;

    if (isOwnerOrAdmin) {
      updatePayload.discomShortName = payload.discomShortName;
      updatePayload.stateName = payload.stateName;
      if (payload.discomId !== undefined) updatePayload.discomId = payload.discomId;
    }

    try {
      await updateDoc(docRef, updatePayload);
      return { saved: true, docId: id };
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }
}

/**
 * Deletes a shared USC history record from Firestore (owner or admin only).
 */
export async function deleteSharedUscHistoryEntry(docId: string): Promise<boolean> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return false;
  const safeId = docId.replace(/[^a-zA-Z0-9_\-]+/g, '_').slice(0, 128);
  if (!safeId) return false;
  const path = `${USC_HISTORY_COLLECTION}/${safeId}`;
  try {
    await deleteDoc(doc(db, USC_HISTORY_COLLECTION, safeId));
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
