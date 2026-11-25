import { useEffect, useMemo, useState } from 'react';
import { type ApplicationSummary, api, type ExportResult, type ExportVerification } from '../../../api';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Textarea } from '../../../components/ui/textarea';
import type { AlignmentResult, MasterEntry, RoleBulletAudit } from '../-schema/studio-types';

export function StudioInspector({
  entries,
  includedEntryIds,
  includedBulletIds,
  bulletOverrides,
  applications,
  onEnsureStudioVariant,
}: {
  entries: MasterEntry[];
  includedEntryIds: Set<string>;
  includedBulletIds: Set<string>;
  bulletOverrides: Record<string, string>;
  applications: ApplicationSummary[];
  onEnsureStudioVariant?: () => Promise<string>;
}) {
  const [activeTab, setActiveTab] = useState<'verify' | 'align' | 'impact'>('verify');

  // Verification state
  const [verification, setVerification] = useState<ExportVerification | null>(null);
  const [verifyingFormat, setVerifyingFormat] = useState<'pdf' | 'docx' | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  // Alignment state
  const [selectedAppId, setSelectedAppId] = useState<string>(applications[0]?.id ?? '');
  const [customJdText, setCustomJdText] = useState<string>('');
  const [alignmentResult, setAlignmentResult] = useState<AlignmentResult | null>(null);
  const [alignError, setAlignError] = useState<string | null>(null);
  const [aligning, setAligning] = useState(false);
  const [impactAudit, setImpactAudit] = useState<RoleBulletAudit | null>(null);

  useEffect(() => {
    if (!selectedAppId && applications.length > 0) {
      setSelectedAppId(applications[0]!.id);
    }
  }, [applications, selectedAppId]);

  const handleExport = async (format: 'pdf' | 'docx') => {
    setVerifyingFormat(format);
    setExportMessage(null);
    try {
      const targetVariantId = onEnsureStudioVariant ? await onEnsureStudioVariant() : 'master';
      const res = await api<ExportResult>(`/api/resume/${encodeURIComponent(targetVariantId)}/export/${format}`, {
        method: 'POST',
      });
      setVerification(res.verification);
      const payload = (res[format] ?? '') as string;
      const blob = new Blob([Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))], {
        type:
          format === 'pdf'
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = res.filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setExportMessage(
        res.verification.failures.length === 0
          ? `Generated ${res.filename}. 7-Check Round-Trip Verification passed cleanly.`
          : `Generated ${res.filename}, with ${res.verification.failures.length} verification issues. Inspect details below.`,
      );
    } catch {
      setExportMessage('Export failed. Ensure the local service is running.');
    } finally {
      setVerifyingFormat(null);
    }
  };

  const handleRunAlignment = async () => {
    setAligning(true);
    setAlignError(null);
    try {
      // Gather resume text strictly from included entries & bullets
      const resumeParts: string[] = [];
      for (const e of entries) {
        if (!includedEntryIds.has(e.id)) continue;
        resumeParts.push(`${e.title} at ${e.organization}`);
        for (const b of e.bullets) {
          if (includedBulletIds.has(b.id)) {
            resumeParts.push(bulletOverrides[b.id] ?? b.rawText);
          }
        }
      }
      const resumeText = resumeParts.join('\n');
      if (!resumeText.trim()) {
        setAlignError('Include at least one resume entry or bullet to analyze alignment.');
        return;
      }

      let jd = customJdText.trim();
      if (!jd && selectedAppId) {
        const app = applications.find((a) => a.id === selectedAppId);
        if (app?.jobId) {
          const jobRes = await api<{
            job: {
              title?: string;
              description?: Array<{ type?: string; text?: string }>;
              requirements?: {
                skills?: Array<{ skill: string; importance: string }>;
                urgency?: string[];
                locationConstraints?: string[];
              };
            };
          }>(`/api/jobs/${encodeURIComponent(app.jobId)}`).catch(() => null);
          const descText = (jobRes?.job?.description ?? [])
            .map((b) => b.text?.trim() ?? '')
            .filter(Boolean)
            .join('\n');
          const reqSkills = (jobRes?.job?.requirements?.skills ?? [])
            .map((s) => `${s.skill} (${s.importance})`)
            .join(', ');
          jd =
            [jobRes?.job?.title ?? app.title, reqSkills ? `Requirements: ${reqSkills}` : '', descText]
              .filter(Boolean)
              .join('\n\n')
              .trim() || `${app.title} at ${app.employer}`;
        }
      }

      if (!jd) {
        setAlignError('Please select an application or paste a job description.');
        return;
      }

      const res = await api<{ alignment: AlignmentResult }>('/api/studio/align', {
        method: 'POST',
        body: { resumeText, jdText: jd },
      });
      setAlignmentResult(res.alignment);
    } catch {
      setAlignmentResult(null);
      setAlignError('Could not evaluate job alignment. Ensure the local service is running.');
    } finally {
      setAligning(false);
    }
  };

  // Derive Impact Scorecard metrics per-entry from included entries & bullets
  const activeRoleBulletGroups = useMemo(() => {
    const groups: string[][] = [];
    for (const e of entries) {
      if (!includedEntryIds.has(e.id)) continue;
      const roleBullets = e.bullets
        .filter((b) => includedBulletIds.has(b.id))
        .map((b) => bulletOverrides[b.id] ?? b.rawText);
      if (roleBullets.length > 0) groups.push(roleBullets);
    }
    return groups;
  }, [entries, includedEntryIds, includedBulletIds, bulletOverrides]);

  const activeBullets = useMemo(() => activeRoleBulletGroups.flat(), [activeRoleBulletGroups]);

  useEffect(() => {
    if (activeTab !== 'impact' || activeRoleBulletGroups.length === 0) {
      if (activeRoleBulletGroups.length === 0) setImpactAudit(null);
      return;
    }
    let cancelled = false;
    Promise.all(
      activeRoleBulletGroups.map((bullets) =>
        api<{ audit: RoleBulletAudit }>('/api/studio/lint-bullet', {
          method: 'POST',
          body: { bullets },
        }),
      ),
    )
      .then((results) => {
        if (cancelled) return;
        const allBullets = results.flatMap((r) => r.audit.bullets);
        const total = allBullets.length;
        const quantified = allBullets.filter((b) => b.isQuantified).length;
        const avgXyz = total > 0 ? Math.round(allBullets.reduce((sum, b) => sum + b.xyzScore, 0) / total) : 0;
        const totalCliches = results.reduce((sum, r) => sum + r.audit.totalCliches, 0);
        const hasVisualSymmetryTell = results.some((r) => r.audit.hasVisualSymmetryTell);
        const duplicateVerbs = [...new Set(results.flatMap((r) => r.audit.duplicateVerbs ?? []))];
        setImpactAudit({
          bullets: allBullets,
          averageXyzScore: avgXyz,
          quantifiedRate: total > 0 ? quantified / total : 0,
          totalCliches,
          hasVisualSymmetryTell,
          duplicateVerbs,
          feedbackSummary: results.map((r) => r.audit.feedbackSummary).join(' '),
        });
      })
      .catch(() => {
        if (!cancelled) setImpactAudit(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, activeRoleBulletGroups]);

  const quantifiedRate = impactAudit ? Math.round(impactAudit.quantifiedRate * 100) : 0;
  const quantifiedCount = impactAudit ? impactAudit.bullets.filter((b) => b.isQuantified).length : 0;
  const clicheCount = impactAudit ? impactAudit.totalCliches : 0;

  return (
    <div className="space-y-4 text-xs">
      {/* Tab Navigation */}
      <div className="flex border-b border-border pb-1 gap-1 flex-wrap">
        <Button
          type="button"
          size="sm"
          variant={activeTab === 'verify' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('verify')}
          className="text-xs h-7"
        >
          7-Check Verification
        </Button>
        <Button
          type="button"
          size="sm"
          variant={activeTab === 'align' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('align')}
          className="text-xs h-7"
        >
          3-Tier JD Alignment
        </Button>
        <Button
          type="button"
          size="sm"
          variant={activeTab === 'impact' ? 'default' : 'ghost'}
          onClick={() => setActiveTab('impact')}
          className="text-xs h-7"
        >
          Impact Scorecard
        </Button>
      </div>

      {/* TAB 1: 7-Check Binary Verification Gate */}
      {activeTab === 'verify' && (
        <div className="space-y-3">
          <div>
            <span className="font-semibold text-foreground text-sm block">Round-Trip Binary Verification Gate</span>
            <p className="text-muted-foreground text-[11px] mt-0.5">
              Audits observable structural invariants across PDF and DOCX: vector text recall, ligature safety, PDF/UA
              tags, and body-only PII.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={verifyingFormat !== null}
              onClick={() => void handleExport('pdf')}
              className="text-xs h-8"
            >
              {verifyingFormat === 'pdf' ? 'Verifying PDF…' : 'Export Verified PDF'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={verifyingFormat !== null}
              onClick={() => void handleExport('docx')}
              className="text-xs h-8"
            >
              {verifyingFormat === 'docx' ? 'Verifying DOCX…' : 'Export Clean DOCX'}
            </Button>
          </div>

          {exportMessage && (
            <p className="text-[11px] text-muted-foreground bg-muted/40 p-2 rounded">{exportMessage}</p>
          )}

          {verification ? (
            <div className="space-y-2 pt-1 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground text-xs">
                  Binary Gate Results ({verification.checks.length} checks)
                </span>
                <Badge variant={verification.passed ? 'teal' : 'destructive'}>
                  {verification.passed ? 'Pass' : 'Fix Needed'}
                </Badge>
              </div>

              {verification.checks.map((check) => {
                const statusUpper = check.status.toUpperCase();
                return (
                  <div
                    key={check.id}
                    className={`p-2.5 rounded-lg border text-xs space-y-1 ${
                      statusUpper === 'PASS'
                        ? 'border-status-success-border bg-status-success-bg'
                        : statusUpper === 'WARN'
                          ? 'border-status-warn-border bg-status-warn-bg'
                          : 'border-destructive/30 bg-destructive/5'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">{check.label}</span>
                      <span
                        className={`font-mono text-[10px] font-bold uppercase ${
                          statusUpper === 'PASS'
                            ? 'text-status-success-fg'
                            : statusUpper === 'WARN'
                              ? 'text-status-warn-fg'
                              : 'text-destructive'
                        }`}
                      >
                        {statusUpper}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{check.explanation}</p>
                  </div>
                );
              })}

              {verification.failures.length > 0 && (
                <div className="p-2.5 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-[11px] space-y-1">
                  <strong>Critical ATS Failure Points:</strong>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {verification.failures.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-lg border border-dashed border-border text-center text-muted-foreground">
              Click “Export Verified PDF” or “Export Clean DOCX” to execute the round-trip binary inspection.
            </div>
          )}
        </div>
      )}

      {/* TAB 2: 3-Tier JD Alignment Matrix */}
      {activeTab === 'align' && (
        <div className="space-y-3">
          <div>
            <span className="font-semibold text-foreground text-sm block">Three-Tier Local Alignment Engine</span>
            <p className="text-muted-foreground text-[11px] mt-0.5">
              Deterministic Lexical &amp; Boolean Gate + Local Skills Taxonomy with Synonyms + Counterfactual Lift
              Queue.
            </p>
          </div>

          <div className="space-y-2">
            {applications.length > 0 && (
              <div>
                <label htmlFor="inspector-target-app" className="block text-[11px] font-medium text-foreground mb-1">
                  Target Application
                </label>
                <select
                  id="inspector-target-app"
                  value={selectedAppId}
                  onChange={(e) => setSelectedAppId(e.target.value)}
                  className="w-full text-xs rounded border border-input bg-background p-1.5"
                >
                  {applications.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title} at {a.employer}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="inspector-custom-jd" className="block text-[11px] font-medium text-foreground mb-1">
                Or Paste Job Description / Requirements
              </label>
              <Textarea
                id="inspector-custom-jd"
                rows={3}
                value={customJdText}
                onChange={(e) => setCustomJdText(e.target.value)}
                placeholder="Paste role requirements here..."
                className="font-mono text-xs"
              />
            </div>

            <Button
              type="button"
              size="sm"
              onClick={() => void handleRunAlignment()}
              disabled={aligning}
              className="w-full text-xs"
            >
              {aligning ? 'Evaluating 3-Tier Alignment…' : 'Run Alignment Analysis'}
            </Button>
          </div>

          {alignError && (
            <p
              role="alert"
              className="text-[11px] text-status-danger-fg bg-status-danger-bg border border-status-danger-border p-2 rounded"
            >
              {alignError}
            </p>
          )}

          {alignmentResult && (
            <div className="space-y-3 pt-2 max-h-[calc(100vh-380px)] overflow-y-auto pr-1">
              {/* Score Badges */}
              <div className="grid grid-cols-3 gap-1.5 text-center">
                <div className="p-2 rounded border border-border bg-card">
                  <span className="text-[10px] text-muted-foreground block">Must-Have</span>
                  <strong className="text-sm font-mono text-foreground">{alignmentResult.mustHaveScore}%</strong>
                </div>
                <div className="p-2 rounded border border-border bg-card">
                  <span className="text-[10px] text-muted-foreground block">Preferred</span>
                  <strong className="text-sm font-mono text-foreground">{alignmentResult.preferredScore}%</strong>
                </div>
                <div className="p-2 rounded border border-status-success-border bg-status-success-bg">
                  <span className="text-[10px] text-status-success-fg block">Composite</span>
                  <strong className="text-sm font-mono text-status-success-fg">
                    {alignmentResult.compositeScore}%
                  </strong>
                </div>
              </div>

              {/* Counterfactual Lift Queue */}
              {alignmentResult.counterfactualFixes.length > 0 && (
                <div className="p-2.5 rounded-lg border border-status-warn-border bg-status-warn-bg space-y-1.5">
                  <span className="font-semibold text-status-warn-fg text-xs block">
                    Counterfactual Priority Queue (Top Marginal Lifts):
                  </span>
                  <div className="space-y-1">
                    {alignmentResult.counterfactualFixes.map((fix, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-[11px] bg-background/80 p-1.5 rounded border border-border/60"
                      >
                        <span className="text-foreground">{fix.action}</span>
                        <Badge variant="teal" className="text-[10px] shrink-0 font-mono">
                          +{fix.marginalLiftPercent}%
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ashby Evidence Rubric */}
              <div className="space-y-1.5">
                <span className="font-semibold text-foreground text-xs block">
                  Ashby-Style Evidence Rubric ({alignmentResult.rubric.length} inspected)
                </span>
                <div className="space-y-1">
                  {alignmentResult.rubric.map((r) => (
                    <div
                      key={r.id}
                      className="p-2 rounded border border-border/80 bg-card/60 flex items-start justify-between gap-2"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <strong className="text-foreground text-xs">{r.term}</strong>
                          <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-muted text-muted-foreground">
                            {r.category}
                          </span>
                        </div>
                        {r.matchedResumeText && (
                          <p className="text-[10px] text-muted-foreground italic">Matched: "{r.matchedResumeText}"</p>
                        )}
                        {r.aliasUsed && (
                          <span className="text-[9px] text-teal-600 block">
                            Taxonomy alias: {r.aliasUsed} → {r.canonicalSkill}
                          </span>
                        )}
                      </div>
                      <Badge
                        variant={
                          r.status === 'MEETS_EXACT'
                            ? 'teal'
                            : r.status === 'MEETS_SYNONYM'
                              ? 'secondary'
                              : r.status === 'PARTIAL_SEMANTIC'
                                ? 'outline'
                                : 'destructive'
                        }
                        className="text-[9px] shrink-0"
                      >
                        {r.status.replaceAll('_', ' ')}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Impact & Anti-Slop Scorecard */}
      {activeTab === 'impact' && (
        <div className="space-y-3">
          <div>
            <span className="font-semibold text-foreground text-sm block">Impact &amp; Anti-Slop Scorecard</span>
            <p className="text-muted-foreground text-[11px] mt-0.5">
              Metrics on {activeBullets.length} active bullets in current variant.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-xl border border-border bg-card space-y-1">
              <span className="text-muted-foreground text-[11px] block">Quantification Rate</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold font-mono text-foreground">{quantifiedRate}%</span>
                <span className="text-[10px] text-muted-foreground">
                  ({quantifiedCount}/{activeBullets.length})
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">Target ≥60% for technical &amp; leadership roles.</p>
            </div>

            <div className="p-3 rounded-xl border border-border bg-card space-y-1">
              <span className="text-muted-foreground text-[11px] block">Clichés / Buzzwords</span>
              <div className="flex items-baseline gap-1">
                <span
                  className={`text-2xl font-bold font-mono ${clicheCount > 0 ? 'text-destructive' : 'text-teal-600'}`}
                >
                  {clicheCount}
                </span>
                <span className="text-[10px] text-muted-foreground">flagged</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Target 0 clichés to eliminate LLM boilerplate.</p>
            </div>
          </div>

          <div className="p-3 rounded-xl border border-border bg-muted/20 space-y-2">
            <span className="font-semibold text-foreground text-xs block">
              Google XYZ Formula Adoption{impactAudit ? ` · Avg ${impactAudit.averageXyzScore}/100` : ''}
            </span>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Every bullet should answer: <em>"Accomplished [X] as measured by [Y] by doing [Z]"</em>. Use the Focused
              XYZ Editor in the left pane to audit duty openers and insert verified metrics.
            </p>
            {impactAudit?.hasVisualSymmetryTell && (
              <p className="text-[11px] text-status-warn-fg bg-status-warn-bg border border-status-warn-border p-2 rounded">
                Visual symmetry warning: bullets have near-identical lengths (common AI output tell). Vary sentence
                rhythm.
              </p>
            )}
            {impactAudit?.duplicateVerbs && impactAudit.duplicateVerbs.length > 0 && (
              <p className="text-[11px] text-status-warn-fg bg-status-warn-bg border border-status-warn-border p-2 rounded">
                Repeated opening verbs: {impactAudit.duplicateVerbs.join(', ')}. Diversify action openers.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
