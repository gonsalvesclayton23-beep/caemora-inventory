import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** Opens an invoice file through a short-lived signed link (the bucket is private). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: file } = await supabase.from('invoice_files').select('storage_path').eq('id', Number(id)).maybeSingle();
  if (!file) return new NextResponse('Not found', { status: 404 });
  const { data, error } = await supabase.storage.from('invoices').createSignedUrl(file.storage_path, 300);
  if (error || !data) return new NextResponse('Could not open the file.', { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
