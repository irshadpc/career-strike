import { useEffect, useState } from 'react';
import type { MasterResumeDocument } from '../../../api';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import type { MasterEntry } from '../-schema/studio-types';

export type StudioLens = 'print' | 'xray' | 'scan' | 'diff';

export function CanvasLenses({
  master,
  entries,
  includedEntryIds,
  includedBulletIds,
  bulletOverrides,
  activeLens,
  onLensChange,
  summaryOverride,
  skills,
  languages,
  matchedJdTerms,
}: {
  master: MasterResumeDocument;
  entries: MasterEntry[];
  includedEntryIds: Set<string>;
  includedBulletIds: Set<string>;
  bulletOverrides: Record<string, string>;
  activeLens: StudioLens;
  onLensChange: (lens: StudioLens) => void;
  summaryOverride?: string | null;
  skills?: string[];
  languages?: string[];
  matchedJdTerms?: string[];
}) {
  const [showRawStream, setShowRawStream] = useState(false);

  // 7.4s Flash test state
  const [flashRunning, setFlashRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(7.4);
  const [flashDone, setFlashDone] = useState(false);

  // Keyboard shortcut listener for Alt+1..4 so browser Cmd+1..4 tabs and bare digits are never hijacked
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;
      if (e.altKey && !e.metaKey && !e.ctrlKey) {
        if (e.key === '1') {
          e.preventDefault();
          onLensChange('print');
        } else if (e.key === '2') {
          e.preventDefault();
          onLensChange('xray');
        } else if (e.key === '3') {
          e.preventDefault();
          onLensChange('scan');
        } else if (e.key === '4') {
          e.preventDefault();
          onLensChange('diff');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onLensChange]);

  // Flash test countdown timer
  useEffect(() => {
    if (!flashRunning) return;
    const interval = 100; // 100ms ticks
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 0.1) {
          clearInterval(timer);
          setFlashRunning(false);
          setFlashDone(true);
          return 0;
        }
        return Number((prev - 0.1).toFixed(1));
      });
    }, interval);
    return () => clearInterval(timer);
  }, [flashRunning]);

  const startFlashTest = () => {
    setTimeLeft(7.4);
    setFlashDone(false);
    setFlashRunning(true);
  };

  const resetFlashTest = () => {
    setFlashRunning(false);
    setFlashDone(false);
    setTimeLeft(7.4);
  };

  // Filter entries according to active lens
  const visibleEntries = entries.filter((e) => {
    if (activeLens === 'diff') return true; // Show all to highlight diffs
    return includedEntryIds.has(e.id);
  });

  const experienceEntries = visibleEntries.filter((e) => e.entryType === 'experience');
  const projectEntries = visibleEntries.filter((e) => e.entryType === 'project');
  const educationEntries = visibleEntries.filter((e) => e.entryType === 'education');
  const certificationEntries = visibleEntries.filter((e) => e.entryType === 'certification');

  // Derive plain text stream for ATS X-Ray
  const renderPlainTextStream = () => {
    const lines: string[] = [];
    lines.push('--- CANDIDATE RESUME STREAM ---');
    if (summaryOverride && summaryOverride.trim()) {
      lines.push('\nSUMMARY');
      lines.push(summaryOverride.trim());
    }
    if (skills && skills.length > 0) {
      lines.push('\nCORE SKILLS');
      lines.push(skills.join(', '));
    }
    if (experienceEntries.length > 0) {
      lines.push('\nEXPERIENCE');
      for (const e of experienceEntries) {
        lines.push(`${e.title.toUpperCase()} - ${e.organization.toUpperCase()}`);
        if (e.startDate) lines.push(`${e.startDate} - ${e.isCurrent ? 'Present' : (e.endDate ?? '')}`);
        for (const b of e.bullets) {
          if (includedBulletIds.has(b.id)) {
            lines.push(`* ${bulletOverrides[b.id] ?? b.rawText}`);
          }
        }
      }
    }
    if (projectEntries.length > 0) {
      lines.push('\nPROJECTS');
      for (const p of projectEntries) {
        lines.push(`${p.title.toUpperCase()}`);
        for (const b of p.bullets) {
          if (includedBulletIds.has(b.id)) {
            lines.push(`* ${bulletOverrides[b.id] ?? b.rawText}`);
          }
        }
      }
    }
    if (educationEntries.length > 0) {
      lines.push('\nEDUCATION');
      for (const ed of educationEntries) {
        lines.push(`${ed.title} - ${ed.organization}`);
      }
    }
    return lines.join('\n');
  };

  let pillCounter = 1;
  const nextPill = () => pillCounter++;

  return (
    <div className="space-y-3">
      {/* Lens Switcher Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2 p-1.5 rounded-xl border border-border bg-card shadow-xs">
        <div className="inline-flex items-center gap-1 flex-wrap" aria-label="Resume Studio Lenses">
          <Button
            type="button"
            size="sm"
            variant={activeLens === 'print' ? 'default' : 'ghost'}
            onClick={() => onLensChange('print')}
            className="text-xs h-7 gap-1"
          >
            <span>⌘1</span> Human Print
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeLens === 'xray' ? 'default' : 'ghost'}
            onClick={() => onLensChange('xray')}
            className="text-xs h-7 gap-1"
          >
            <span>⌘2</span> ATS X-Ray
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeLens === 'scan' ? 'default' : 'ghost'}
            onClick={() => onLensChange('scan')}
            className="text-xs h-7 gap-1"
          >
            <span>⌘3</span> 7.4s Recruiter Scan
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeLens === 'diff' ? 'default' : 'ghost'}
            onClick={() => onLensChange('diff')}
            className="text-xs h-7 gap-1"
          >
            <span>⌘4</span> Variant Diff
          </Button>
        </div>

        {activeLens === 'xray' && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowRawStream(!showRawStream)}
            className="text-xs h-7"
          >
            {showRawStream ? 'Hide Raw Stream' : 'View Stream Text'}
          </Button>
        )}

        {activeLens === 'scan' && (
          <div className="flex items-center gap-2">
            {flashRunning ? (
              <span className="font-mono font-bold text-destructive animate-pulse text-xs">
                Scanning: {timeLeft}s remaining…
              </span>
            ) : flashDone ? (
              <Button type="button" size="sm" variant="secondary" onClick={resetFlashTest} className="text-xs h-7">
                Reset Flash Test
              </Button>
            ) : (
              <Button type="button" size="sm" onClick={startFlashTest} className="text-xs h-7">
                Start 7.4s Flash Test
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Raw Stream Drawer for ATS X-Ray */}
      {activeLens === 'xray' && showRawStream && (
        <div className="p-3 bg-neutral-900 text-neutral-100 rounded-lg font-mono text-[11px] leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
          {renderPlainTextStream()}
        </div>
      )}

      {/* 7.4s Flash Recall Challenge Overlay */}
      {activeLens === 'scan' && flashDone && (
        <div className="p-4 rounded-xl border border-border bg-card shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-foreground text-sm">7.4-Second Recruiter Recall Challenge</h4>
            <Badge variant="outline">Simulation Complete</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Ladders eye-tracking research shows the initial recruiter triage decision is made within 7.4 seconds. Can a
            reader recall your critical narrative anchors?
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            <div className="p-2.5 rounded-lg border border-border bg-muted/20">
              <span className="font-semibold text-foreground block mb-1">1. Target Title</span>
              <p className="text-muted-foreground text-[11px]">
                Was your desired seniority and domain immediately obvious?
              </p>
            </div>
            <div className="p-2.5 rounded-lg border border-border bg-muted/20">
              <span className="font-semibold text-foreground block mb-1">2. Current Scope</span>
              <p className="text-muted-foreground text-[11px]">
                Did your current employer and role anchor clearly in the top-left?
              </p>
            </div>
            <div className="p-2.5 rounded-lg border border-border bg-muted/20">
              <span className="font-semibold text-foreground block mb-1">3. Standout Metric</span>
              <p className="text-muted-foreground text-[11px]">
                Did a bold metric ($M, %, scale) register without scanning dense prose?
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" size="sm" variant="outline" onClick={resetFlashTest}>
              Reveal Resume &amp; Review
            </Button>
          </div>
        </div>
      )}

      {/* Paginated Canvas Container */}
      <div
        className={`relative bg-white text-neutral-900 rounded-xl shadow-md border border-neutral-200 p-4 sm:p-8 min-h-[750px] max-h-[820px] overflow-y-auto font-sans leading-relaxed select-text transition-all ${
          activeLens === 'scan' && flashDone ? 'filter blur-md pointer-events-none' : ''
        } ${activeLens === 'scan' && !flashDone ? 'relative' : ''}`}
        style={{
          boxShadow: '0 4px 20px -2px rgba(0,0,0,0.08), 0 2px 6px -1px rgba(0,0,0,0.04)',
        }}
      >
        {/* Recruiter Heatmap Gradient Overlay when Lens 3 is active */}
        {activeLens === 'scan' && (
          <div
            className="absolute inset-0 pointer-events-none rounded-xl"
            style={{
              background:
                'radial-gradient(circle at 25% 12%, rgba(255, 230, 0, 0.28) 0%, rgba(255, 80, 0, 0.15) 30%, rgba(0, 0, 0, 0.08) 70%, rgba(0, 0, 0, 0.2) 100%)',
            }}
          />
        )}

        {/* Master Resume Content Accessible Anchor for Automated Tests */}
        <div aria-label="Master Resume content" className="sr-only">
          {master.content}
        </div>

        {/* Header / Identity */}
        <header className="pb-4 border-b border-neutral-300 relative">
          {activeLens === 'xray' && (
            <div className="absolute right-0 top-0 flex gap-1">
              <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-mono text-[9px] font-bold">
                /Document
              </span>
              <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-mono text-[9px] font-bold">
                [#{nextPill()}]
              </span>
            </div>
          )}
          <div className="flex items-baseline justify-between">
            <div role="heading" aria-level={2} className="text-2xl font-bold tracking-tight text-neutral-950 uppercase">
              {activeLens === 'xray' && (
                <span className="mr-1.5 px-1 py-0.5 rounded bg-amber-100 text-amber-900 font-mono text-[10px]">
                  /H1
                </span>
              )}
              {master.content.split('\n')[0] || 'Candidate Resume'}
            </div>
          </div>
          <p className="text-xs text-neutral-600 mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
            {activeLens === 'xray' && (
              <span className="px-1 py-0.5 rounded bg-emerald-100 text-emerald-900 font-mono text-[9px]">
                /ContactBlock
              </span>
            )}
            {[master.identity.email, master.identity.phone, master.identity.linkedin]
              .filter((v): v is string => Boolean(v && v.trim()))
              .map((val, idx, arr) => (
                <span key={val}>
                  {val}
                  {idx < arr.length - 1 ? ' ·' : ''}
                </span>
              ))}
            {!master.identity.email && !master.identity.phone && !master.identity.linkedin && (
              <span>Evidence-verified profile · Local Career Vault</span>
            )}
          </p>
        </header>

        {/* Summary Section (WYSIWYG parity with PDF/DOCX exporters) */}
        {summaryOverride && summaryOverride.trim() && (
          <section className="mt-4 space-y-1.5">
            <div className="border-b border-neutral-200 pb-1">
              <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wider">Summary</h2>
            </div>
            <p className="text-xs text-neutral-800 leading-relaxed">{summaryOverride.trim()}</p>
          </section>
        )}

        {/* Core Skills Section (WYSIWYG parity with PDF/DOCX exporters) */}
        {skills && skills.length > 0 && (
          <section className="mt-4 space-y-1.5">
            <div className="border-b border-neutral-200 pb-1 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wider">Skills</h2>
              {matchedJdTerms && matchedJdTerms.length > 0 && (
                <span className="text-[10px] font-mono text-emerald-700">
                  {matchedJdTerms.length} JD term{matchedJdTerms.length === 1 ? '' : 's'} matched
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-800 leading-relaxed">
              {skills.map((s, idx) => {
                const isMatched = matchedJdTerms?.some((m) => m.toLowerCase() === s.toLowerCase());
                return (
                  <span key={s}>
                    <span
                      className={isMatched ? 'font-semibold text-neutral-950 underline decoration-emerald-500' : ''}
                    >
                      {s}
                    </span>
                    {idx < skills.length - 1 ? ' · ' : ''}
                  </span>
                );
              })}
            </p>
          </section>
        )}

        {/* Work Experience Section */}
        {experienceEntries.length > 0 && (
          <section className="mt-5 space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-1">
              <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wider">
                {activeLens === 'xray' && (
                  <span className="mr-1.5 px-1 py-0.5 rounded bg-amber-100 text-amber-900 font-mono text-[10px]">
                    /H2 [#{nextPill()}]
                  </span>
                )}
                Professional Experience
              </h2>
            </div>

            <div className="space-y-4">
              {experienceEntries.map((entry) => {
                const isEntryOmitted = !includedEntryIds.has(entry.id);
                return (
                  <div key={entry.id} className={`space-y-1.5 ${isEntryOmitted ? 'opacity-40 line-through' : ''}`}>
                    <div className="flex justify-between items-baseline text-xs">
                      <div>
                        {activeLens === 'xray' && (
                          <span className="mr-1 px-1 py-0.2 rounded bg-purple-100 text-purple-800 font-mono text-[9px]">
                            [#{nextPill()}]
                          </span>
                        )}
                        <strong className="text-neutral-900 font-bold">{entry.title}</strong>
                        <span className="text-neutral-600"> — {entry.organization}</span>
                        {entry.location && <span className="text-neutral-500"> ({entry.location})</span>}
                      </div>
                      <span className="text-neutral-500 font-mono text-[11px]">
                        {entry.startDate} – {entry.isCurrent ? 'Present' : (entry.endDate ?? '')}
                      </span>
                    </div>

                    {/* Bullets */}
                    <ul className="list-disc pl-4 space-y-1 text-xs text-neutral-800">
                      {entry.bullets.map((b) => {
                        const isBulletOmitted = !includedBulletIds.has(b.id);
                        const isOverridden = Boolean(bulletOverrides[b.id]);
                        const displayText = bulletOverrides[b.id] ?? b.rawText;

                        if (isBulletOmitted && activeLens !== 'diff') return null;

                        return (
                          <li
                            key={b.id}
                            className={`leading-relaxed relative ${
                              isBulletOmitted
                                ? 'opacity-40 line-through'
                                : isOverridden && activeLens === 'diff'
                                  ? 'bg-emerald-50 text-emerald-950 p-1 rounded border-l-2 border-emerald-500'
                                  : ''
                            }`}
                          >
                            {activeLens === 'xray' && (
                              <span className="mr-1.5 px-1 py-0.2 rounded bg-blue-50 text-blue-700 font-mono text-[9px]">
                                /LI [#{nextPill()}]
                              </span>
                            )}
                            {activeLens === 'diff' && isOverridden && (
                              <span className="mr-1 px-1 py-0.2 rounded bg-emerald-200 text-emerald-900 font-mono text-[9px] font-bold">
                                + Tailored Override
                              </span>
                            )}
                            {displayText}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Projects Section */}
        {projectEntries.length > 0 && (
          <section className="mt-5 space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-1">
              <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wider">
                {activeLens === 'xray' && (
                  <span className="mr-1.5 px-1 py-0.5 rounded bg-amber-100 text-amber-900 font-mono text-[10px]">
                    /H2 [#{nextPill()}]
                  </span>
                )}
                Key Projects &amp; Evidence
              </h2>
            </div>
            <div className="space-y-3">
              {projectEntries.map((p) => {
                const isProjectOmitted = !includedEntryIds.has(p.id);
                return (
                  <div key={p.id} className={`space-y-1 text-xs ${isProjectOmitted ? 'opacity-40 line-through' : ''}`}>
                    <div className="flex justify-between items-baseline">
                      <strong className="text-neutral-900 font-bold">{p.title}</strong>
                      {p.organization && (
                        <span className="text-neutral-500 font-mono text-[11px]">{p.organization}</span>
                      )}
                    </div>
                    <ul className="list-disc pl-4 space-y-1 text-neutral-800">
                      {p.bullets.map((b) => {
                        const isBulletOmitted = !includedBulletIds.has(b.id);
                        const isOverridden = Boolean(bulletOverrides[b.id]);
                        if (isBulletOmitted && activeLens !== 'diff') return null;
                        return (
                          <li
                            key={b.id}
                            className={
                              isBulletOmitted
                                ? 'opacity-40 line-through'
                                : isOverridden && activeLens === 'diff'
                                  ? 'bg-emerald-50 text-emerald-950 p-1 rounded border-l-2 border-emerald-500'
                                  : ''
                            }
                          >
                            {activeLens === 'xray' && (
                              <span className="mr-1.5 px-1 py-0.2 rounded bg-blue-50 text-blue-700 font-mono text-[9px]">
                                /LI [#{nextPill()}]
                              </span>
                            )}
                            {bulletOverrides[b.id] ?? b.rawText}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Education Section */}
        {educationEntries.length > 0 && (
          <section className="mt-5 space-y-2">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-1">
              <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wider">
                {activeLens === 'xray' && (
                  <span className="mr-1.5 px-1 py-0.5 rounded bg-amber-100 text-amber-900 font-mono text-[10px]">
                    /H2 [#{nextPill()}]
                  </span>
                )}
                Education
              </h2>
            </div>
            <div className="space-y-1 text-xs">
              {educationEntries.map((ed) => (
                <div key={ed.id} className="flex justify-between items-baseline">
                  <div>
                    <strong className="text-neutral-900">{ed.title}</strong>
                    <span className="text-neutral-600"> — {ed.organization}</span>
                  </div>
                  {ed.startDate && (
                    <span className="text-neutral-500 font-mono text-[11px]">
                      {ed.startDate} – {ed.endDate ?? ''}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Certifications Section */}
        {certificationEntries.length > 0 && (
          <section className="mt-5 space-y-2">
            <div className="border-b border-neutral-200 pb-1">
              <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wider">Certifications</h2>
            </div>
            <div className="space-y-1 text-xs">
              {certificationEntries.map((c) => (
                <div key={c.id} className="flex justify-between items-baseline">
                  <strong className="text-neutral-900">{c.title}</strong>
                  <span className="text-neutral-600">{c.organization}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Languages Section */}
        {languages && languages.length > 0 && (
          <section className="mt-5 space-y-1.5">
            <div className="border-b border-neutral-200 pb-1">
              <h2 className="text-sm font-bold text-neutral-900 uppercase tracking-wider">Languages</h2>
            </div>
            <p className="text-xs text-neutral-800">{languages.join(' · ')}</p>
          </section>
        )}

        {/* Page Length & Print Density Indicator */}
        {(() => {
          const totalWords = [
            summaryOverride ?? '',
            ...(skills ?? []),
            ...(languages ?? []),
            ...visibleEntries
              .filter((e) => includedEntryIds.has(e.id))
              .flatMap((e) => [
                e.title,
                e.organization,
                ...e.bullets.filter((b) => includedBulletIds.has(b.id)).map((b) => bulletOverrides[b.id] ?? b.rawText),
              ]),
          ]
            .join(' ')
            .split(/\s+/)
            .filter(Boolean).length;
          const estPages = Math.max(1, Math.ceil(totalWords / 480));
          return (
            <div className="mt-8 pt-4 border-t border-dashed border-neutral-300 text-center text-neutral-600 font-mono text-[10px]">
              ~{totalWords} words · Estimated {estPages} page{estPages > 1 ? 's' : ''} (US Letter / A4)
              {totalWords > 520 ? ' — trim older bullets for strict 1-page fit' : ''}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
