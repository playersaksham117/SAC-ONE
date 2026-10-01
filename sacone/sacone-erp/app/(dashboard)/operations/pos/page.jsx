import Link from 'next/link';

/**
 * POS billing is no longer part of the ERP web app — it runs only in the SAC-POS mobile app.
 * This route stays so old bookmarks explain where POS went instead of showing a 404.
 */
export default function PosMovedPage() {
  return (
    <div className="mx-auto max-w-xl py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-2xl ring-1 ring-blue-100">📱</div>
        <h2 className="mt-4 text-xl font-bold text-slate-900">POS runs on the SAC-POS mobile app</h2>
        <p className="mt-2 text-sm text-slate-500">
          Billing, returns and customer collections are done on phones with SAC-POS. Sales sync into SACONE automatically.
          Register a phone and watch the sync inbox in POS Devices &amp; Sync.
        </p>
        <Link href="/admin/pos-devices" className="btn-primary mt-6">Open POS Devices &amp; Sync</Link>
      </div>
    </div>
  );
}
