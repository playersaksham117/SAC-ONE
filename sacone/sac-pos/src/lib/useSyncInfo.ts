import { useShallow } from 'zustand/react/shallow';
import { pendingCount, pendingQty, useLedger } from '../store/ledger';
import { useSyncStatus } from '../sync/engine';

export function useSyncBadge() {
  const status = useSyncStatus((s) => s.status);
  const counts = useLedger(useShallow((s) => pendingCount(s)));
  const tone = counts.review ? 'danger' : status === 'offline' ? 'warning' : status === 'error' ? 'danger' : counts.pending ? 'warning' : 'success';
  const label = status === 'syncing' ? 'Syncing…'
    : counts.review ? `${counts.review} need review`
      : status === 'offline' ? `Offline${counts.pending ? ` · ${counts.pending} queued` : ''}`
        : counts.pending ? `${counts.pending} to sync` : 'Synced';
  return { status, counts, tone: tone as 'danger' | 'warning' | 'success', label };
}

/** Quantity sold/returned on this phone that the ERP stock doesn't reflect yet. */
export function usePendingQty(): Record<string, number> {
  return useLedger(useShallow((s) => pendingQty(s.sales, s.returns)));
}
