import type { SyncMeta } from '../domain/types';
import { Badge } from './components';

export function DocSyncBadge({ doc }: { doc: SyncMeta }) {
  if (doc.sync === 'synced') return <Badge tone="success" icon="cloud-done-outline" label={doc.syncWarnings?.length ? 'Synced · note' : 'Synced'} />;
  if (doc.sync === 'review') return <Badge tone="danger" icon="alert-circle-outline" label="Needs review" />;
  return <Badge tone="warning" icon="cloud-upload-outline" label="Waiting to sync" />;
}
