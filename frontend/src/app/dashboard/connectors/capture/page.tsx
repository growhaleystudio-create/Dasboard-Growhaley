'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { useSession } from '@/lib/useSession';
import { AppError, fetchApi } from '@/lib/api';
import { useExtensionBridge } from '@/lib/extension/bridge';
import type { GoogleMapsScrapeSessionResponse } from '@/lib/types';

export default function GoogleMapsCapturePage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId');
  const captureToken = searchParams.get('captureToken');
  const from = searchParams.get('from');
  const { data: sessionData, isLoading: isSessionLoading } = useSession();
  const teamId = sessionData?.session.teamId;
  const { installed: extensionInstalled, sendCaptureSession } = useExtensionBridge();
  const [launcherCopied, setLauncherCopied] = useState(false);
  const [launcherError, setLauncherError] = useState<string | null>(null);
  const [googleOpened, setGoogleOpened] = useState(false);

  const sessionQuery = useQuery({
    queryKey: ['google-maps-scrape-capture', teamId, sessionId],
    queryFn: () =>
      fetchApi<GoogleMapsScrapeSessionResponse>(
        `/api/teams/${teamId}/connectors/scrape/session/${sessionId}`,
      ),
    enabled: !!teamId && !!sessionId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status) return 2000;
      return status === 'done' || status === 'failed' ? false : 2000;
    },
  });

  const session = sessionQuery.data;

  useEffect(() => {
    if (!session?.googleMapsUrl || googleOpened) return;
    window.open(session.googleMapsUrl, '_blank', 'noopener,noreferrer');
    setGoogleOpened(true);
  }, [googleOpened, session?.googleMapsUrl]);

  useEffect(() => {
    if (!session || !teamId || !sessionId || !captureToken) return;
    if (session.status !== 'waiting_browser') return;
    if (from !== 'extension') return;
    sendCaptureSession({
      sessionId,
      captureToken,
      teamId,
      googleMapsUrl: session.googleMapsUrl,
    });
  }, [captureToken, from, sendCaptureSession, session, sessionId, teamId]);

  const bookmarklet = useMemo(() => {
    if (!teamId || !sessionId || !captureToken) return '';
    return buildBookmarklet({ teamId, sessionId, captureToken });
  }, [captureToken, sessionId, teamId]);

  const copyLauncher = async () => {
    if (!bookmarklet) return;
    try {
      await navigator.clipboard.writeText(bookmarklet);
      setLauncherError(null);
      setLauncherCopied(true);
      window.setTimeout(() => setLauncherCopied(false), 2000);
    } catch (error) {
      const message = error instanceof AppError ? error.rawMessage : 'Tidak bisa copy launcher otomatis. Simpan link bookmark secara manual.';
      setLauncherError(message);
    }
  };

  if (isSessionLoading) {
    return <div className="p-6 text-sm text-text-soft-400">Loading capture session...</div>;
  }

  if (!teamId || !sessionId || !captureToken) {
    return <div className="p-6 text-sm text-[#fb3748]">Session tidak valid.</div>;
  }

  const useExtensionFlow = from === 'extension' || (extensionInstalled === true && from !== 'bookmarklet');
  const showBookmarkletFallback = from === 'bookmarklet' || (!extensionInstalled && from === 'extension');

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center p-6">
      <Card className="w-full rounded-3xl border border-stroke-soft-200 bg-bg-white-0 shadow-none">
        <CardHeader>
          <CardTitle>Capture Google Maps</CardTitle>
          <CardDescription>
            {useExtensionFlow
              ? 'Google Maps sudah dibuka di tab baru. Klik icon extension di toolbar browser untuk mulai capture otomatis.'
              : 'Gunakan bookmarklet di tab Google Maps untuk kirim hasil ke dashboard.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {useExtensionFlow ? (
            <div className="rounded-2xl border border-stroke-soft-200 bg-bg-weak-50 p-4 text-sm text-text-sub-600">
              <ol className="list-decimal space-y-2 pl-5">
                <li>Pastikan tab Google Maps hasil pencarian sudah aktif.</li>
                <li>Klik icon extension Lead Generator di toolbar Chrome.</li>
                <li>Extension akan membaca hasil, lalu mengirim ke dashboard secara otomatis.</li>
                <li>Status di bawah akan berubah menjadi selesai.</li>
              </ol>
            </div>
          ) : (
            <div className="rounded-2xl border border-stroke-soft-200 bg-bg-weak-50 p-4 text-sm text-text-sub-600">
              <ol className="list-decimal space-y-2 pl-5">
                <li>Tunggu halaman Google Maps hasil pencarian kebuka.</li>
                <li>Drag link launcher ke bookmark bar, atau copy bookmarklet lalu simpan sebagai bookmark.</li>
                <li>Klik bookmark itu saat tab Google Maps aktif.</li>
                <li>Hasil akan otomatis dikirim ke dashboard.</li>
              </ol>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => session?.googleMapsUrl && window.open(session.googleMapsUrl, '_blank', 'noopener,noreferrer')}>
              Buka Ulang Google Maps
            </Button>
            {!useExtensionFlow && (
              <Button variant="secondary" onClick={() => void copyLauncher()} disabled={!bookmarklet}>
                {launcherCopied ? 'Launcher Tercopy' : 'Copy Bookmarklet'}
              </Button>
            )}
          </div>

          {showBookmarkletFallback && (
            <div className="rounded-2xl border border-dashed border-stroke-soft-200 bg-bg-white-0 p-4">
              <p className="mb-2 text-sm font-medium text-text-strong-950">Drag ini ke bookmark bar:</p>
              <a
                href={bookmarklet || '#'}
                className="inline-flex rounded-full border border-stroke-soft-200 px-4 py-2 text-sm font-medium text-text-strong-950 hover:bg-bg-weak-50"
              >
                Capture Google Maps
              </a>
              {launcherError && (
                <p className="mt-3 text-sm text-[#fb3748]">{launcherError}</p>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-stroke-soft-200 bg-bg-weak-50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-text-strong-950">
              {(session?.status === 'waiting_browser' || session?.status === 'collecting_results' || session?.status === 'importing') && (
                <Loader2 size={16} className="animate-spin" />
              )}
              <span>Status: {renderStatus(session)}</span>
            </div>
            {session?.summary && session.status === 'done' && (
              <p className="mt-2 text-sm text-emerald-600">
                Import selesai. {session.summary.newLeads} lead baru, {session.summary.duplicateLeads} duplikat.
              </p>
            )}
            {session?.error && session.status === 'failed' && (
              <p className="mt-2 text-sm text-[#fb3748]">{session.error}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function renderStatus(session: GoogleMapsScrapeSessionResponse | undefined): string {
  if (!session) return 'Menunggu session...';
  switch (session.status) {
    case 'waiting_browser':
      return 'Menunggu extension / launcher dijalankan di tab Google Maps';
    case 'collecting_results':
      return 'Sedang membaca hasil dari tab Google Maps';
    case 'importing':
      return 'Sedang import hasil ke dashboard';
    case 'done':
      return 'Selesai';
    case 'failed':
      return 'Gagal';
    default:
      return session.status;
  }
}

function buildBookmarklet(input: { teamId: string; sessionId: string; captureToken: string }): string {
  const postUrl = `${window.location.origin}/api/teams/${input.teamId}/connectors/scrape/session/${input.sessionId}/results`;
  const collectingUrl = `${window.location.origin}/api/teams/${input.teamId}/connectors/scrape/session/${input.sessionId}/collecting`;

  return `javascript:(async()=>{const token='${input.captureToken}';const text=(v)=>typeof v==='string'?v.replace(/\\s+/g,' ').trim():'';const pick=(root,selectors)=>{for(const selector of selectors){const node=root.querySelector(selector);const value=text(node?.textContent||'');if(value)return value;}return'';};const pickHref=(root,selectors)=>{for(const selector of selectors){const href=root.querySelector(selector)?.getAttribute('href')?.trim();if(href)return href;}return'';};const wait=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));const findScroller=()=>document.querySelector('[role="feed"]')||document.querySelector('div.m6QErb[aria-label]')||document.querySelector('div[aria-label*="Results"]')||document.querySelector('div[aria-label*="results"]')||document.querySelector('div.m6QErb');const extract=(listSelector,limit)=>{const root=document.querySelector(listSelector);if(!root)return[];const candidates=[...Array.from(root.querySelectorAll('[data-local-attribute]')),...Array.from(root.querySelectorAll('div[role="article"]')),...Array.from(root.querySelectorAll('a[href*="/maps/place/"]'))];const seen=new Set();const unique=candidates.filter((card)=>{if(seen.has(card))return false;seen.add(card);return true;});return unique.slice(0,limit).map((card)=>{const fullText=text(card.textContent||'');const parts=fullText.split('·').map((part)=>text(part)).filter(Boolean);const phone=parts.find((part)=>/\+?\d[\d\s().-]{6,}/.test(part))||'';const address=parts.find((part)=>/\d/.test(part)||/(street|st\\b|road|rd\\b|avenue|ave\\b|jalan|jl\\b)/i.test(part))||'';const rating=parts.find((part)=>/^\d(?:[.,]\d)?(?:\s*\(.*\))?$/.test(part))||'';return{name:pick(card,['div[role="heading"]','h3','.dbg0pd','.rllt__details div:first-child'])||text(card.getAttribute('aria-label')||''),address:pick(card,['.rllt__details div:nth-child(2)','[data-local-attribute="d3adr"]'])||address,phone:pick(card,['[data-local-attribute="d3ph"]'])||phone,website:pickHref(card,['a[data-value="Website"]','a[href^="http"]']),rating:pick(card,['[aria-label*="stars"]','.yi40Hd'])||rating};}).filter((item)=>item.name);};const headers={'X-Google-Maps-Capture-Token':token};const scroller=findScroller();if(scroller){for(let index=0;index<5;index+=1){scroller.scrollBy({top:1400,behavior:'auto'});await wait(1200);}}const containers=['body','[role="feed"]','div[aria-label*="Results"]','div[aria-label*="results"]','div.Nv2PK','div.m6QErb'];let items=[];for(const selector of containers){const next=extract(selector,50);if(next.length>items.length)items=next;}if(!items.length){alert('Google Maps results tidak ketemu di halaman ini.');return;}const collectingResponse=await fetch('${collectingUrl}',{method:'POST',headers});if(!collectingResponse.ok){const payload=await collectingResponse.text();alert('Capture gagal mulai: '+payload);return;}const response=await fetch('${postUrl}',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({items})});if(!response.ok){const payload=await response.text();alert('Capture gagal: '+payload);return;}alert('Capture berhasil dikirim ke dashboard.');})();`;
}
