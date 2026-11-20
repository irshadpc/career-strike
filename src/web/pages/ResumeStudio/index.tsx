import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  type ApplicationSummary,
  type ApplicationView,
  api,
  type DocumentReadinessReport,
  type MasterResumeDocument,
  type PersonalizationView,
  type ProfileFact,
  type ProfileReadinessReport,
} from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { ErrorPanel, Loading } from '../../components/states';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Link } from '../../router';
import { DocumentReadinessCard } from './-components/AtsScorecard';
import { CanvasLenses, type StudioLens } from './-components/CanvasLenses';
import { ExportPanel } from './-components/ExportPanel';
import { StudioInspector } from './-components/StudioInspector';
import { TailoredResumeEditor } from './-components/TailoredResumeEditor';
import { VaultOutliner } from './-components/VaultOutliner';
import { XyzBulletEditor } from './-components/XyzBulletEditor';
import type { MasterBullet, MasterEntry } from './-schema/studio-types';

export function ResumeStudio() {
  const [facts, setFacts] = useState<ProfileFact[] | null>(null);
  const [master, setMaster] = useState<MasterResumeDocument | null>(null);
  const [documentReadiness, setDocumentReadiness] = useState<DocumentReadinessReport | null>(null);
  const [readiness, setReadiness] = useState<ProfileReadinessReport | null>(null);
  const [applications, setApplications] = useState<ApplicationSummary[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string>('');
  const [activeApp, setActiveApp] = useState<ApplicationView | null>(null);
  const [personalization, setPersonalization] = useState<PersonalizationView | null>(null);
  const [selectedVariantKind, setSelectedVariantKind] = useState<'resume' | 'cover_letter'>('resume');
  const [variantText, setVariantText] = useState<string>('');
  const userEditedRef = useRef(false);
  const [savingVariant, setSavingVariant] = useState(false);
  const [variantSaveStatus, setVariantSaveStatus] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [viewMode, setViewMode] = useState<'master' | 'compare'>('master');

  // 3-Pane Studio Workspace State
  const [masterEntries, setMasterEntries] = useState<MasterEntry[]>([]);
  const [selectedBullet, setSelectedBullet] = useState<MasterBullet | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<MasterEntry | null>(null);
  const [includedEntryIds, setIncludedEntryIds] = useState<Set<string>>(new Set());
  const [includedBulletIds, setIncludedBulletIds] = useState<Set<string>>(new Set());
  const [bulletOverrides, setBulletOverrides] = useState<Record<string, string>>({});
  const [leftTab, setLeftTab] = useState<'vault' | 'xyz'>('vault');
  const [activeLens, setActiveLens] = useState<StudioLens>('print');

  const loadMasterVault = useCallback(async () => {
    try {
      const res = await api<{ entries: MasterEntry[] }>('/api/studio/master');
      setMasterEntries(res.entries);
      setIncludedEntryIds(new Set(res.entries.map((e) => e.id)));
      const allBullets: string[] = [];
      for (const e of res.entries) {
        for (const b of e.bullets) {
          allBullets.push(b.id);
        }
      }
      setIncludedBulletIds(new Set(allBullets));
    } catch {
      // ignore
    }
  }, []);

  const loadBase = useCallback(async () => {
    try {
      const [profileRes, masterRes, readinessRes, appsRes] = await Promise.all([
        api<{ facts: ProfileFact[] }>('/api/profile'),
        api<{ master: MasterResumeDocument; readiness: DocumentReadinessReport }>('/api/documents/master'),
        api<{ readiness: ProfileReadinessReport }>('/api/profile/readiness').catch(() => null),
        api<{ applications: ApplicationSummary[] }>('/api/applications').catch(() => ({ applications: [] })),
      ]);
      setFacts(profileRes.facts);
      setMaster(masterRes.master);
      setDocumentReadiness(masterRes.readiness);
      if (readinessRes?.readiness) setReadiness(readinessRes.readiness);
      setApplications(appsRes.applications);
      if (!selectedAppId && appsRes.applications.length > 0) {
        setSelectedAppId(appsRes.applications[0]!.id);
      }
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [selectedAppId]);

  useEffect(() => {
    void loadBase();
    void loadMasterVault();
  }, [loadBase, loadMasterVault]);

  useEffect(() => {
    if (!selectedAppId) {
      setActiveApp(null);
      setPersonalization(null);
      return;
    }
    let cancelled = false;
    Promise.all([
      api<{ application: ApplicationView }>(`/api/applications/${encodeURIComponent(selectedAppId)}`),
      api<{ personalization: PersonalizationView }>(
        `/api/applications/${encodeURIComponent(selectedAppId)}/personalization`,
      ).catch(() => null),
    ])
      .then(([appRes, persRes]) => {
        if (cancelled) return;
        setActiveApp(appRes.application);
        if (persRes?.personalization) {
          setPersonalization(persRes.personalization);
          const match = persRes.personalization.variants.find((v) => v.kind === selectedVariantKind);
          if (match && !userEditedRef.current) {
            setVariantText(match.content);
          }
          userEditedRef.current = false;
        } else {
          setPersonalization(null);
          if (!userEditedRef.current) setVariantText('');
          userEditedRef.current = false;
        }
      })
      .catch(() => {
        if (!cancelled) {
          setActiveApp(null);
          setPersonalization(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAppId, selectedVariantKind]);

  if (loadError) return <ErrorPanel message="Could not load your Resume Studio." onRetry={() => void loadBase()} />;
  if (!facts || !master || !documentReadiness) return <Loading label="Loading Resume Studio" />;

  const masterResumeContent = master.content;
  const activeVariant = personalization?.variants.find((v) => v.kind === selectedVariantKind);
  const isCandidateEdited = activeVariant?.status === 'CANDIDATE_EDITED';
  const isDirty = activeVariant ? variantText !== activeVariant.content : false;

  const saveVariantEdit = async () => {
    if (!selectedAppId || !activeVariant) return;
    setSavingVariant(true);
    setVariantSaveStatus(null);
    try {
      await api(
        `/api/applications/${encodeURIComponent(selectedAppId)}/personalization/${encodeURIComponent(activeVariant.id)}`,
        {
          method: 'PUT',
          body: { content: variantText },
        },
      );
      userEditedRef.current = false;
      setVariantSaveStatus('Saved document edit.');
      const updated = await api<{ personalization: PersonalizationView }>(
        `/api/applications/${encodeURIComponent(selectedAppId)}/personalization`,
      );
      setPersonalization(updated.personalization);
    } catch (err) {
      setVariantSaveStatus(
        err instanceof ApiError
          ? ((err.body as { message?: string } | null)?.message ?? 'Could not save edit.')
          : 'Could not save edit.',
      );
    } finally {
      setSavingVariant(false);
    }
  };

  const downloadText = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleToggleEntry = (entryId: string) => {
    setIncludedEntryIds((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  };

  const handleToggleBullet = (bulletId: string) => {
    setIncludedBulletIds((prev) => {
      const next = new Set(prev);
      if (next.has(bulletId)) next.delete(bulletId);
      else next.add(bulletId);
      return next;
    });
  };

  const handleSelectBullet = (bullet: MasterBullet, entry: MasterEntry) => {
    setSelectedBullet(bullet);
    setSelectedEntry(entry);
    setLeftTab('xyz');
  };

  const handleSaveBulletOverride = (bulletId: string, newText: string) => {
    setBulletOverrides((prev) => ({
      ...prev,
      [bulletId]: newText,
    }));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Document Workspace"
        title="Resume Studio"
        lede="Evidence-backed tailoring: your confirmed career facts organized in one truthful master profile, tailored with zero fabrication and verified against role requirements."
        actions={
          <div
            className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-1 gap-1"
            role="group"
            aria-label="Studio View Mode"
          >
            <Button
              type="button"
              variant={viewMode === 'master' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('master')}
            >
              Master Resume
            </Button>
            <Button
              type="button"
              variant={viewMode === 'compare' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('compare')}
            >
              Job Comparison
            </Button>
          </div>
        }
      />

      {readiness && (
        <section
          className="p-4 bg-card border border-border rounded-xl shadow-xs"
          aria-labelledby="readiness-studio-title"
        >
          <div className="flex justify-between items-center flex-wrap gap-3">
            <div>
              <Badge variant={documentReadiness.state === 'READY_TO_TAILOR' ? 'teal' : 'warning'} className="mr-2">
                {readiness.title}
              </Badge>
              <strong id="readiness-studio-title" className="text-foreground">
                Profile Status:
              </strong>{' '}
              <span className="text-muted-foreground text-sm">{readiness.summary}</span>
            </div>
            <Link
              href={readiness.actionHref}
              className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground px-3 py-1.5 transition-colors"
            >
              {readiness.actionLabel}
            </Link>
          </div>
        </section>
      )}

      {/* Deterministic document readiness */}
      <section aria-labelledby="document-readiness-title">
        <DocumentReadinessCard readiness={documentReadiness} />
      </section>

      {viewMode === 'master' ? (
        <>
          {/* Export Panel */}
          <ExportPanel />

          {/* 3-Pane Studio Workspace */}
          <section className="space-y-3" aria-label="3-Pane Studio Workspace">
            <div className="flex items-center justify-between pb-1 border-b border-border">
              <h2 className="text-base font-semibold tracking-tight text-foreground m-0">
                Studio Workspace: ATS X-Ray, Recruiter Simulation &amp; Master Vault
              </h2>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => downloadText('master-resume.txt', masterResumeContent)}
                >
                  Download Plain Text (.txt)
                </Button>
                <Link
                  href="/profile"
                  className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground px-3 py-1.5 transition-colors"
                >
                  Edit Facts in Profile
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start w-full max-w-full">
              {/* Left Pane (30% / 4 cols): Outliner & Focused XYZ Editor */}
              <div className="lg:col-span-4 min-w-0 w-full rounded-xl border border-border bg-card p-4 shadow-xs space-y-3">
                <div className="flex border-b border-border pb-1 gap-1 flex-wrap">
                  <Button
                    type="button"
                    size="sm"
                    variant={leftTab === 'vault' ? 'default' : 'ghost'}
                    onClick={() => setLeftTab('vault')}
                    className="text-xs h-7"
                  >
                    Vault Outliner
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={leftTab === 'xyz' ? 'default' : 'ghost'}
                    onClick={() => setLeftTab('xyz')}
                    className="text-xs h-7"
                  >
                    Focused XYZ Editor
                  </Button>
                </div>

                {leftTab === 'vault' ? (
                  <VaultOutliner
                    entries={masterEntries}
                    selectedBulletId={selectedBullet?.id ?? null}
                    includedEntryIds={includedEntryIds}
                    includedBulletIds={includedBulletIds}
                    onSelectBullet={handleSelectBullet}
                    onToggleEntry={handleToggleEntry}
                    onToggleBullet={handleToggleBullet}
                    onRefresh={() => void loadMasterVault()}
                  />
                ) : (
                  <XyzBulletEditor
                    bullet={selectedBullet}
                    entry={selectedEntry}
                    onSaveOverride={handleSaveBulletOverride}
                  />
                )}
              </div>

              {/* Center Pane (42% / 5 cols): Paginated Canvas & 4 Lenses */}
              <div className="lg:col-span-5 min-w-0 w-full space-y-3">
                <CanvasLenses
                  master={master}
                  entries={masterEntries}
                  includedEntryIds={includedEntryIds}
                  includedBulletIds={includedBulletIds}
                  bulletOverrides={bulletOverrides}
                  activeLens={activeLens}
                  onLensChange={setActiveLens}
                />
              </div>

              {/* Right Pane (28% / 3 cols): Inspector & 7-Check Verification */}
              <div className="lg:col-span-3 min-w-0 w-full rounded-xl border border-border bg-card p-4 shadow-xs space-y-3">
                <StudioInspector
                  entries={masterEntries}
                  includedBulletIds={includedBulletIds}
                  bulletOverrides={bulletOverrides}
                  applications={applications}
                />
              </div>
            </div>
          </section>
        </>
      ) : (
        <section className="rounded-xl border border-border bg-card p-6 shadow-xs" aria-labelledby="compare-title">
          <div className="flex justify-between items-center flex-wrap gap-4 mb-4">
            <div>
              <h2 id="compare-title" className="text-lg font-semibold tracking-tight text-foreground m-0">
                Side-by-Side Tailored Document Comparison
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Compare your canonical Master Resume with job-specific tailored documents.
              </p>
            </div>
            {applications.length > 0 && (
              <div className="flex items-center gap-2">
                <label htmlFor="select-app" className="text-xs font-medium text-foreground m-0">
                  Application:
                </label>
                <select
                  id="select-app"
                  value={selectedAppId}
                  onChange={(e) => setSelectedAppId(e.target.value)}
                  className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {applications.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title} at {a.employer}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {applications.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-4">
              No applications prepared yet. Open any role in{' '}
              <Link href="/opportunities" className="text-primary hover:underline">
                Opportunities
              </Link>{' '}
              and click “Prepare an application”.
            </p>
          ) : (
            <>
              {activeApp && (
                <div className="mb-4 flex gap-3 items-center flex-wrap">
                  <div
                    className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-1 gap-1"
                    role="group"
                    aria-label="Variant kind selector"
                  >
                    <Button
                      type="button"
                      variant={selectedVariantKind === 'resume' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => {
                        setSelectedVariantKind('resume');
                        userEditedRef.current = false;
                        const r = personalization?.variants.find((v) => v.kind === 'resume');
                        if (r) setVariantText(r.content);
                      }}
                    >
                      Tailored Resume
                    </Button>
                    <Button
                      type="button"
                      variant={selectedVariantKind === 'cover_letter' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => {
                        setSelectedVariantKind('cover_letter');
                        userEditedRef.current = false;
                        const c = personalization?.variants.find((v) => v.kind === 'cover_letter');
                        if (c) setVariantText(c.content);
                      }}
                    >
                      Tailored Cover Letter
                    </Button>
                  </div>
                  <Link
                    href={`/applications/${activeApp.id}`}
                    className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground px-3 py-1.5 transition-colors"
                  >
                    Open Full Application →
                  </Link>
                </div>
              )}

              {personalization?.requirements && personalization.requirements.length > 0 && (
                <details className="mb-4 p-4 bg-muted/30 border border-border rounded-xl">
                  <summary className="cursor-pointer font-semibold text-sm text-foreground">
                    Evidence Mapping for this Job ({personalization.requirements.length} requirements inspected)
                  </summary>
                  <ul className="divide-y divide-border/60 text-sm mt-3">
                    {personalization.requirements.map((req) => (
                      <li key={req.requirement} className="flex flex-col gap-1 py-2.5 first:pt-1 last:pb-0">
                        <div className="flex items-center gap-2">
                          <strong className="text-foreground">{req.requirement}</strong>
                          <Badge variant="secondary">{req.classification.replaceAll('_', ' ')}</Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">{req.explanation}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left: Master Reference */}
                <div className="bg-card border border-border rounded-xl p-5 shadow-xs">
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground m-0">Master Reference (Canonical Facts)</h3>
                      <span className="block text-xs text-muted-foreground">Truthful source of truth</span>
                    </div>
                    <Badge variant="outline">Ground Truth</Badge>
                  </div>
                  <div
                    tabIndex={0}
                    role="region"
                    aria-label="Canonical Master Profile content"
                    className="font-mono text-xs leading-relaxed bg-background border border-border rounded-md p-3 whitespace-pre-wrap max-h-[500px] overflow-y-auto"
                  >
                    {masterResumeContent}
                  </div>
                </div>

                {/* Right: Tailored Editor */}
                <TailoredResumeEditor
                  selectedVariantKind={selectedVariantKind}
                  variantText={variantText}
                  isDirty={isDirty}
                  savingVariant={savingVariant}
                  variantSaveStatus={variantSaveStatus}
                  isCandidateEdited={isCandidateEdited}
                  onVariantTextChange={(t) => {
                    setVariantText(t);
                    userEditedRef.current = true;
                  }}
                  onSave={() => void saveVariantEdit()}
                  onDownload={() => downloadText(`tailored-${selectedVariantKind}.txt`, variantText)}
                />
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

export default ResumeStudio;
