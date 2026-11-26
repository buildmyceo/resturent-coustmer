import React from 'react';
import { Globe, AlertTriangle } from 'lucide-react';

export default async function DomainNotConfiguredPage({
  searchParams,
}: {
  searchParams: Promise<{ host?: string }>;
}) {
  const resolved = await searchParams;
  const host = resolved?.host || 'this domain';

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm space-y-4">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Domain Not Configured</h1>
        <p className="text-sm text-slate-600 leading-relaxed">
          <span className="font-mono font-semibold text-slate-800">{host}</span> is not yet
          connected to an active restaurant menu on Ceova.
        </p>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left text-xs text-slate-600 space-y-1.5">
          <p className="font-semibold text-slate-800 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5" />
            Restaurant Owner?
          </p>
          <p>
            Log in to your Admin Portal → <strong>Settings → Custom Domains</strong>, add{' '}
            <span className="font-mono">{host}</span>, and verify your DNS TXT &amp; CNAME records.
          </p>
        </div>
      </div>
    </main>
  );
}
