'use client';

import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { Alert } from '../ui';

/**
 * Read an image file, scale it down (max 600 × 300 px) and optionally turn the white paper
 * background transparent, so a photo or scan of a signature / stamp prints cleanly. Returns a PNG data URL.
 */
function prepareImage(file, { clearWhite }) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { reject(new Error('Choose a PNG, JPG or WebP image')); return; }
    if (file.size > 8 * 1024 * 1024) { reject(new Error('That image is over 8 MB; choose a smaller photo')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 600 / img.width, 300 / img.height);
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      if (clearWhite) {
        const data = ctx.getImageData(0, 0, w, h);
        const px = data.data;
        for (let i = 0; i < px.length; i += 4) {
          const light = Math.min(px[i], px[i + 1], px[i + 2]);
          if (light > 225) px[i + 3] = 0; // paper
          else if (light > 190) px[i + 3] = Math.round(px[i + 3] * ((225 - light) / 35)); // soft edge
        }
        ctx.putImageData(data, 0, 0);
      }
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
    img.src = url;
  });
}

function ImageSlot({ label, hint, image, canEdit, busy, onPick, onRemove }) {
  const input = useRef(null);
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-slate-900">{label}</span>
        {image && canEdit && <button type="button" className="text-xs font-medium text-rose-600 hover:underline" disabled={busy} onClick={onRemove}>Remove</button>}
      </div>
      <button type="button" disabled={!canEdit || busy} onClick={() => input.current?.click()}
        className="flex h-32 w-full items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-[repeating-conic-gradient(#f1f5f9_0_25%,#fff_0_50%)] bg-[length:16px_16px] hover:border-brand-400 disabled:cursor-default">
        {image
          ? <img src={image} alt={label} className="max-h-28 max-w-[90%] object-contain" />
          : <span className="text-sm text-slate-500">{canEdit ? `Click to upload ${label.toLowerCase()}` : 'Not uploaded'}</span>}
      </button>
      <p className="mt-2 text-xs text-slate-500">{hint}</p>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f); }} />
    </div>
  );
}

/** Settings → Signature & stamp: printed in the "Authorised Signatory" box of bills (ERP and SAC-POS). */
export default function SignStampCard({ canEdit }) {
  const [state, setState] = useState(null);
  const [clearWhite, setClearWhite] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    apiRequest('/api/settings/invoice').then((s) => setState(s.signStamp || { print: true })).catch((e) => setError(e.message));
  }, []);

  const save = async (patch, done) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      setState(await apiRequest('/api/settings/invoice/sign-stamp', { method: 'PUT', body: JSON.stringify(patch) }));
      setMessage(done);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const upload = async (field, file, label) => {
    try {
      const image = await prepareImage(file, { clearWhite });
      await save({ [field]: image }, `${label} saved. It prints on new and reprinted bills.`);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!state) return error ? <Alert message={error} /> : null;
  return (
    <div className="mt-6 max-w-3xl space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h3 className="font-semibold text-slate-900">Signature &amp; stamp</h3>
        <p className="mt-1 text-sm text-slate-500">Printed above “Authorised Signatory” on invoices, quotations, credit / debit notes and purchase orders, in the ERP and on SAC-POS.</p>
      </div>
      <Alert message={error} />
      <Alert type="success" message={message} />
      <div className="grid gap-4 sm:grid-cols-2">
        <ImageSlot label="Signature" hint="Sign on plain white paper with a dark pen and take a photo or scan." image={state.signImage} canEdit={canEdit} busy={busy}
          onPick={(f) => upload('signImage', f, 'Signature')} onRemove={() => save({ signImage: '' }, 'Signature removed.')} />
        <ImageSlot label="Stamp" hint="Firm's rubber stamp on plain white paper; photo or scan." image={state.stampImage} canEdit={canEdit} busy={busy}
          onPick={(f) => upload('stampImage', f, 'Stamp')} onRemove={() => save({ stampImage: '' }, 'Stamp removed.')} />
      </div>
      {canEdit && (
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={clearWhite} onChange={(e) => setClearWhite(e.target.checked)} />
            Remove the white paper background when uploading (recommended)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={state.print !== false} disabled={busy}
              onChange={(e) => save({ print: e.target.checked }, e.target.checked ? 'Signature and stamp will print on bills.' : 'Signature and stamp will not print on bills.')} />
            Print signature and stamp on bills
          </label>
        </div>
      )}
    </div>
  );
}
