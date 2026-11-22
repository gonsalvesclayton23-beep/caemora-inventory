'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { uploadInvoiceFile } from '@/lib/invoiceUpload';
import { recordInvoiceFile } from './actions';

/** Upload a file for an invoice that is already in the app. */
export function UploadButton({ company, vendorId, invoiceNo, invoiceDate, label = 'Upload' }: {
  company: string; vendorId: number; invoiceNo: string | null; invoiceDate: string | null; label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    start(async () => {
      try {
        const up = await uploadInvoiceFile(file, company, invoiceDate ?? new Date().toISOString().slice(0, 10));
        const res = await recordInvoiceFile({ ...up, company, vendorId, invoiceNo, invoiceDate });
        if (res.error) setError(res.error); else router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <input ref={input} type="file" accept="application/pdf,image/*" className="hidden" onChange={onFile} />
      <button type="button" className="btn-ghost border border-slate-300 py-1 dark:border-slate-700" disabled={pending} onClick={() => input.current?.click()}>
        {pending ? 'Uploading…' : label}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
