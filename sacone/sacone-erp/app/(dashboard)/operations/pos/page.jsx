'use client';

import { useCallback, useEffect, useState } from 'react';
import ModuleHub from '../../../../components/ModuleHub';
import PosBillingFrame from '../../../../components/pos/PosBillingFrame';
import PosDevicesSync from '../../../../components/pos/PosDevicesSync';
import NotesWorkspace from '../../../../components/notes/NotesWorkspace';
import { apiRequest } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth-context';
import { useLiveRefresh } from '../../../../lib/live';

/**
 * POS Billing, Terminals & Sync and Credit & Debit Notes in one module.
 * Old addresses /admin/pos-devices (?view=sync) and /operations/notes (?view=notes) open here.
 */
export default function PosHubPage() {
  const { checkPermission } = useAuth();
  const canSync = checkPermission('pos.devices.view');
  const [attention, setAttention] = useState(0);

  // Failed / awaiting-review sync records, shown as a badge on the Terminals & Sync tab.
  const loadAttention = useCallback(() => {
    if (!canSync) return;
    apiRequest('/api/pos-devices/inbox/summary')
      .then((rows) => setAttention((rows || []).filter((r) => r.status === 'failed' || r.status === 'pending_review').reduce((s, r) => s + r.count, 0)))
      .catch(() => {});
  }, [canSync]);
  useEffect(() => { loadAttention(); }, [loadAttention]);
  useLiveRefresh(loadAttention, { tables: ['pos_sync_inbox'] });

  return (
    <ModuleHub
      title="POS Billing, Sync & Notes"
      icon="🧾"
      views={[
        { id: 'billing', label: 'POS Billing', icon: '🛒', description: 'SAC-POS web: bills, quotations, returns, collections', allowed: checkPermission('pos.sales.view'), render: () => <PosBillingFrame /> },
        { id: 'sync', label: 'Terminals & Sync', icon: '📲', description: 'SAC-POS phones, device keys and the sync inbox', allowed: canSync, badge: attention, render: () => <PosDevicesSync /> },
        { id: 'notes', label: 'Credit & Debit Notes', icon: '↩️', description: 'Customer returns (credit) and supplier returns (debit)', allowed: checkPermission('pos.returns.view') || checkPermission('purchases.returns.view'), render: () => <NotesWorkspace /> },
      ]}
    />
  );
}
