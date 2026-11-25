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
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { useToast } from '../../components/ui/toast';
import { Link } from '../../router';
import { DocumentReadinessCard } from './-components/AtsScorecard';
import { CanvasLenses, type StudioLens } from './-components/CanvasLenses';
import { ExportPanel } from './-components/ExportPanel';
import { StudioInspector } from './-components/StudioInspector';
import { TailoredResumeEditor } from './-components/TailoredResumeEditor';
import { VaultOutliner } from './-components/VaultOutliner';
import { XyzBulletEditor } from './-components/XyzBulletEditor';
import type { MasterBullet, MasterEntry, StudioVariant } from './-schema/studio-types';

export function ResumeStudio() {
  const { toast } = useToast();
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
  const [generatingTailored, setGeneratingTailored] = useState(false);
  const [variantSaveStatus, setVariantSaveStatus] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [viewMode, setViewMode] = useState<'master' | 'compare'>('master');

  // 3-Pane Studio Workspace State
  const [masterEntries, setMasterEntries] = useState<MasterEntry[]>([]);
  const [vaultLoaded, setVaultLoaded] = useState(false);
  const [studioVariants, setStudioVariants] = useState<StudioVariant[]>([]);
  const [activeStudioVariantId, setActiveStudioVariantId] = useState<string>('master');
  const [studioVariantName, setStudioVariantName] = useState<string>('Tailored Resume Variant');
  const [pageFormat, setPageFormat] = useState<'LETTER' | 'A4'>('LETTER');
  const [summaryOverride, setSummaryOverride] = useState<string>('');
  const [matchedJdTerms, setMatchedJdTerms] = useState<string[]>([]);
  const [missingMustHaves, setMissingMustHaves] = useState<string[]>([]);
  const [tailoringStudio, setTailoringStudio] = useState(false);
  const [confirmDeleteVariantId, setConfirmDeleteVariantId] = useState<string | null>(null);
  const [savingStudioVariant, setSavingStudioVariant] = useState(false);
  const [selectedBullet, setSelectedBullet] = useState<MasterBullet | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<MasterEntry | null>(null);
  const [includedEntryIds, setIncludedEntryIds] = useState<Set<string>>(new Set());
  const [includedBulletIds, setIncludedBulletIds] = useState<Set<string>>(new Set());
  const [bulletOverrides, setBulletOverrides] = useState<Record<string, string>>({});
  const [leftTab, setLeftTab] = useState<'vault' | 'xyz'>('vault');
  const [activeLens, setActiveLens] = useState<StudioLens>('print');
  const deepLinkAppliedRef = useRef(false);

  const loadMasterVault = useCallback(
    async (preserveSelection = false) => {
      try {
        const [res, variantsRes] = await Promise.all([
          api<{ entries: MasterEntry[] }>('/api/studio/master'),
          api<{ variants: StudioVariant[] }>('/api/studio/variants').catch(() => ({ variants: [] })),
        ]);
        setMasterEntries(res.entries);
        setStudioVariants(variantsRes.variants);
        if (!preserveSelection) {
          setIncludedEntryIds(new Set(res.entries.map((e) => e.id)));
          const allBullets: string[] = [];
          for (const e of res.entries) {
            for (const b of e.bullets) {
              allBullets.push(b.id);
            }
          }
          setIncludedBulletIds(new Set(allBullets));
        }
      } catch {
        toast({ variant: 'destructive', title: 'Could not load Master Vault entries' });
      } finally {
        setVaultLoaded(true);
      }
    },
    [toast],
  );

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
      setSelectedAppId((prev) => prev || appsRes.applications[0]?.id || '');
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void loadBase();
    void loadMasterVault(false);
  }, [loadBase, loadMasterVault]);

  // Apply deep-link query parameters (?variantId=...&appId=...&mode=compare) once base data AND vault load
  useEffect(() => {
    if (deepLinkAppliedRef.current || !facts || !vaultLoaded) return;
    deepLinkAppliedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const qMode = params.get('mode');
    const qAppId = params.get('appId');
    const qVariantId = params.get('variantId');
    if (qAppId) setSelectedAppId(qAppId);
    if (qMode === 'compare') setViewMode('compare');
    if (qVariantId) {
      const matchingStudio = studioVariants.find((v) => v.id === qVariantId);
      if (matchingStudio) {
        setActiveStudioVariantId(matchingStudio.id);
        setStudioVariantName(matchingStudio.name);
        setPageFormat(matchingStudio.pageFormat);
        setSummaryOverride(matchingStudio.summaryOverride ?? '');
        setIncludedEntryIds(new Set(matchingStudio.includedEntries.map((ie) => ie.entryId)));
        setIncludedBulletIds(new Set(matchingStudio.includedEntries.flatMap((ie) => ie.includedBulletIds)));
        setBulletOverrides(matchingStudio.bulletOverrides ?? {});
      } else {
        setViewMode('compare');
      }
    }
  }, [facts, vaultLoaded, studioVariants]);

  useEffect(() => {
    if (!selectedAppId) {
      setActiveApp(null);
      setPersonalization(null);
      return;
    }
    userEditedRef.current = false;
    setVariantSaveStatus(null);
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

  const handleResetBulletOverride = (bulletId: string) => {
    setBulletOverrides((prev) => {
      const next = { ...prev };
      delete next[bulletId];
      return next;
    });
  };

  const buildIncludedEntriesPayload = () =>
    masterEntries
      .filter((e) => includedEntryIds.has(e.id))
      .map((e) => ({
        entryId: e.id,
        includedBulletIds: e.bullets.filter((b) => includedBulletIds.has(b.id)).map((b) => b.id),
      }));

  const masterSkills = facts
    .filter((f) => f.kind === 'skill' && f.approved)
    .map((f) => String(f.value.name))
    .sort((a, b) => a.localeCompare(b));
  const masterLanguages = facts
    .filter((f) => f.kind === 'language' && f.approved)
    .map((f) => `${String(f.value.name)} (${String(f.value.level)})`);

  const hasCustomSelections =
    activeStudioVariantId !== 'master' ||
    pageFormat !== 'LETTER' ||
    summaryOverride.trim().length > 0 ||
    Object.keys(bulletOverrides).length > 0 ||
    includedEntryIds.size !== masterEntries.length ||
    includedBulletIds.size !== masterEntries.reduce((sum, e) => sum + e.bullets.length, 0);

  const saveCurrentStudioVariant = async (asNew = false): Promise<string> => {
    setSavingStudioVariant(true);
    try {
      const res = await api<{ variant: StudioVariant }>('/api/studio/variants', {
        method: 'POST',
        body: {
          id: !asNew && activeStudioVariantId !== 'master' ? activeStudioVariantId : undefined,
          jobApplicationId: selectedAppId || null,
          name: studioVariantName.trim() || 'Tailored Resume Variant',
          pageFormat,
          summaryOverride: summaryOverride.trim() || null,
          includedEntries: buildIncludedEntriesPayload(),
          bulletOverrides,
        },
      });
      setActiveStudioVariantId(res.variant.id);
      setStudioVariants((prev) => {
        const rest = prev.filter((v) => v.id !== res.variant.id);
        return [res.variant, ...rest];
      });
      toast({ variant: 'success', title: `Saved variant "${res.variant.name}"` });
      return res.variant.id;
    } finally {
      setSavingStudioVariant(false);
    }
  };

  const handleDeleteStudioVariant = async (id: string) => {
    try {
      await api(`/api/studio/variants/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setStudioVariants((prev) => prev.filter((v) => v.id !== id));
      setConfirmDeleteVariantId(null);
      if (activeStudioVariantId === id) {
        handleSelectStudioVariant('master');
      }
      toast({ variant: 'success', title: 'Variant deleted' });
    } catch {
      toast({ variant: 'destructive', title: 'Could not delete variant' });
    }
  };

  const handleTailorForSelectedJob = async () => {
    if (!selectedAppId) return;
    setTailoringStudio(true);
    try {
      const res = await api<{
        tailored: {
          includedEntries: { entryId: string; includedBulletIds: string[] }[];
          summaryOverride: string | null;
          matchedTerms: string[];
          missingMustHaves: string[];
          suggestedName: string;
        };
      }>('/api/studio/tailor', {
        method: 'POST',
        body: { applicationId: selectedAppId, targetPages: 1 },
      });
      setIncludedEntryIds(new Set(res.tailored.includedEntries.map((ie) => ie.entryId)));
      setIncludedBulletIds(new Set(res.tailored.includedEntries.flatMap((ie) => ie.includedBulletIds)));
      if (res.tailored.summaryOverride) setSummaryOverride(res.tailored.summaryOverride);
      setStudioVariantName(res.tailored.suggestedName);
      setMatchedJdTerms(res.tailored.matchedTerms);
      setMissingMustHaves(res.tailored.missingMustHaves);
      toast({
        variant: 'success',
        title: 'Tailored vault selection to job',
        description: `${res.tailored.matchedTerms.length} matched skills emphasized.`,
      });
    } catch {
      toast({ variant: 'destructive', title: 'Could not tailor variant for job' });
    } finally {
      setTailoringStudio(false);
    }
  };

  const handleSaveMasterBullet = async (bulletId: string, newText: string) => {
    const res = await api<{ bullet: MasterBullet }>(`/api/studio/master/bullets/${encodeURIComponent(bulletId)}`, {
      method: 'PATCH',
      body: { rawText: newText },
    });
    setMasterEntries((prev) =>
      prev.map((e) => ({
        ...e,
        bullets: e.bullets.map((b) => (b.id === bulletId ? res.bullet : b)),
      })),
    );
    setSelectedBullet(res.bullet);
    setBulletOverrides((prev) => {
      const next = { ...prev };
      delete next[bulletId];
      return next;
    });
    toast({ variant: 'success', title: 'Updated Master Vault bullet' });
  };

  const ensureStudioVariantForExport = async (): Promise<string> => {
    if (!hasCustomSelections) return 'master';
    return saveCurrentStudioVariant(false);
  };

  const handleSelectStudioVariant = (id: string) => {
    setActiveStudioVariantId(id);
    setConfirmDeleteVariantId(null);
    if (id === 'master') {
      setStudioVariantName('Tailored Resume Variant');
      setPageFormat('LETTER');
      setSummaryOverride('');
      setIncludedEntryIds(new Set(masterEntries.map((e) => e.id)));
      setIncludedBulletIds(new Set(masterEntries.flatMap((e) => e.bullets.map((b) => b.id))));
      setBulletOverrides({});
      return;
    }
    const found = studioVariants.find((v) => v.id === id);
    if (!found) return;
    setStudioVariantName(found.name);
    setPageFormat(found.pageFormat);
    setSummaryOverride(found.summaryOverride ?? '');
    setIncludedEntryIds(new Set(found.includedEntries.map((ie) => ie.entryId)));
    setIncludedBulletIds(new Set(found.includedEntries.flatMap((ie) => ie.includedBulletIds)));
    setBulletOverrides(found.bulletOverrides ?? {});
  };

  const handleGeneratePersonalization = async () => {
    if (!selectedAppId) return;
    setGeneratingTailored(true);
    try {
      const res = await api<{ personalization: PersonalizationView }>(
        `/api/applications/${encodeURIComponent(selectedAppId)}/personalize`,
        { method: 'POST' },
      );
      setPersonalization(res.personalization);
      const match = res.personalization.variants.find((v) => v.kind === selectedVariantKind);
      if (match) setVariantText(match.content);
      toast({ variant: 'success', title: 'Generated tailored draft from verified facts' });
    } catch {
      toast({ variant: 'destructive', title: 'Could not generate tailored draft' });
    } finally {
      setGeneratingTailored(false);
    }
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
          <ExportPanel onEnsureStudioVariant={ensureStudioVariantForExport} />

          {/* 3-Pane Studio Workspace */}
          <section className="space-y-3" aria-label="3-Pane Studio Workspace">
            <div className="flex items-center justify-between pb-2 border-b border-border flex-wrap gap-3">
              <h2 className="text-base font-semibold tracking-tight text-foreground m-0">
                Studio Workspace: ATS X-Ray, Recruiter Simulation &amp; Master Vault
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Active resume variant"
                  value={activeStudioVariantId}
                  onChange={(e) => handleSelectStudioVariant(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-2.5 text-xs text-foreground"
                >
                  <option value="master">Master Vault (All Entries)</option>
                  {studioVariants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.pageFormat})
                    </option>
                  ))}
                </select>
                <Input
                  value={studioVariantName}
                  onChange={(e) => setStudioVariantName(e.target.value)}
                  aria-label="Variant name"
                  placeholder="Variant name"
                  className="h-9 w-44 text-xs"
                />
                <select
                  aria-label="Page format"
                  value={pageFormat}
                  onChange={(e) => setPageFormat(e.target.value === 'A4' ? 'A4' : 'LETTER')}
                  className="h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                >
                  <option value="LETTER">US Letter</option>
                  <option value="A4">A4</option>
                </select>
                <Button
                  type="button"
                  size="sm"
                  disabled={savingStudioVariant || masterEntries.length === 0}
                  onClick={() => void saveCurrentStudioVariant(false)}
                >
                  {savingStudioVariant ? 'Saving…' : 'Save Variant'}
                </Button>
                {activeStudioVariantId !== 'master' && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={savingStudioVariant || masterEntries.length === 0}
                      onClick={() => void saveCurrentStudioVariant(true)}
                    >
                      Save as New
                    </Button>
                    {confirmDeleteVariantId === activeStudioVariantId ? (
                      <span className="inline-flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => void handleDeleteStudioVariant(activeStudioVariantId)}
                        >
                          Delete?
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDeleteVariantId(null)}>
                          Cancel
                        </Button>
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmDeleteVariantId(activeStudioVariantId)}
                      >
                        Delete Variant
                      </Button>
                    )}
                  </>
                )}
                {applications.length > 0 && (
                  <>
                    <select
                      aria-label="Target job application for 1-click tailoring"
                      value={selectedAppId}
                      onChange={(e) => setSelectedAppId(e.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground max-w-[200px]"
                    >
                      {applications.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.title} ({a.employer})
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={!selectedAppId || tailoringStudio || masterEntries.length === 0}
                      onClick={() => void handleTailorForSelectedJob()}
                    >
                      {tailoringStudio ? 'Tailoring…' : '1-Click Tailor for Job'}
                    </Button>
                  </>
                )}
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
                  className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-input bg-background hover:bg-muted hover:text-foreground px-3 py-1.5 transition-colors"
                >
                  Edit Facts in Profile
                </Link>
              </div>
            </div>

            <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label htmlFor="studio-summary-override" className="text-xs font-medium text-foreground">
                  Tailored Summary Override (optional)
                </label>
                {missingMustHaves.length > 0 && (
                  <span className="text-[11px] text-status-warn-fg">
                    JD Gaps in confirmed facts: {missingMustHaves.slice(0, 5).join(', ')}
                  </span>
                )}
              </div>
              <Textarea
                id="studio-summary-override"
                rows={2}
                value={summaryOverride}
                onChange={(e) => setSummaryOverride(e.target.value)}
                placeholder="Write or auto-tailor a concise 2-3 sentence summary tailored to this role..."
                className="text-xs bg-background"
              />
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
                    onRefresh={() => void loadMasterVault(true)}
                  />
                ) : (
                  <XyzBulletEditor
                    bullet={selectedBullet}
                    entry={selectedEntry}
                    currentOverride={selectedBullet ? bulletOverrides[selectedBullet.id] : undefined}
                    onSaveOverride={handleSaveBulletOverride}
                    onResetOverride={handleResetBulletOverride}
                    onSaveMasterBullet={handleSaveMasterBullet}
                    onBackToOutliner={() => setLeftTab('vault')}
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
                  summaryOverride={summaryOverride || null}
                  skills={masterSkills}
                  languages={masterLanguages}
                  matchedJdTerms={matchedJdTerms}
                />
              </div>

              {/* Right Pane (28% / 3 cols): Inspector & 7-Check Verification */}
              <div className="lg:col-span-3 min-w-0 w-full rounded-xl border border-border bg-card p-4 shadow-xs space-y-3">
                <StudioInspector
                  entries={masterEntries}
                  includedEntryIds={includedEntryIds}
                  includedBulletIds={includedBulletIds}
                  bulletOverrides={bulletOverrides}
                  applications={applications}
                  onEnsureStudioVariant={ensureStudioVariantForExport}
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
                  {!personalization && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={generatingTailored}
                      onClick={() => void handleGeneratePersonalization()}
                    >
                      {generatingTailored ? 'Generating…' : 'Generate Tailored Draft'}
                    </Button>
                  )}
                  <Link
                    href={`/applications/${activeApp.id}`}
                    className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-input bg-background hover:bg-muted hover:text-foreground px-3 py-1.5 transition-colors"
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
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

              {activeApp && activeVariant && <ExportPanel applicationId={activeApp.id} variantId={activeVariant.id} />}
            </>
          )}
        </section>
      )}
    </div>
  );
}

export default ResumeStudio;
