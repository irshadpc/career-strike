import { useEffect, useState } from 'react';
import { api } from '../../../api';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Textarea } from '../../../components/ui/textarea';
import type { BulletLintResult, MasterBullet, MasterEntry } from '../-schema/studio-types';

export function XyzBulletEditor({
  bullet,
  entry,
  onSaveOverride,
}: {
  bullet: MasterBullet | null;
  entry: MasterEntry | null;
  onSaveOverride: (bulletId: string, newText: string) => void;
}) {
  const [text, setText] = useState('');
  const [lint, setLint] = useState<BulletLintResult | null>(null);
  const [loadingLint, setLoadingLint] = useState(false);
  const [savedStatus, setSavedStatus] = useState<string | null>(null);

  useEffect(() => {
    if (bullet) {
      setText(bullet.rawText);
      setSavedStatus(null);
    } else {
      setText('');
      setLint(null);
    }
  }, [bullet]);

  useEffect(() => {
    if (!text.trim()) {
      setLint(null);
      return;
    }
    const timer = setTimeout(() => {
      setLoadingLint(true);
      api<{ lint: BulletLintResult }>('/api/studio/lint-bullet', {
        method: 'POST',
        body: { text: text.trim() },
      })
        .then((res) => {
          setLint(res.lint);
        })
        .catch(() => {
          setLint(null);
        })
        .finally(() => {
          setLoadingLint(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [text]);

  if (!bullet || !entry) {
    return (
      <div className="p-6 text-center text-muted-foreground border border-dashed border-border rounded-xl">
        <p className="text-xs">
          Select any bullet in the vault outliner to open the Google XYZ &amp; Anti-Slop linter.
        </p>
      </div>
    );
  }

  const handleApplyActionVerb = (verb: string) => {
    if (!lint?.passiveOpenerMatch) return;
    const regex = new RegExp(`^${lint.passiveOpenerMatch}\\s*`, 'i');
    setText(text.replace(regex, `${verb} `));
  };

  const handleSave = () => {
    onSaveOverride(bullet.id, text.trim());
    setSavedStatus('Saved override to current variant.');
    setTimeout(() => setSavedStatus(null), 3000);
  };

  const scoreColor =
    (lint?.xyzScore ?? 0) >= 80
      ? 'text-teal-600 bg-teal-500/10 border-teal-500/30'
      : (lint?.xyzScore ?? 0) >= 50
        ? 'text-amber-600 bg-amber-500/10 border-amber-500/30'
        : 'text-destructive bg-destructive/10 border-destructive/30';

  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <div>
          <span className="font-semibold text-foreground text-sm">Google XYZ &amp; Anti-Slop Linter</span>
          <p className="text-muted-foreground text-[11px]">
            Targeting: <span className="font-medium text-foreground">{entry.title}</span> at {entry.organization}
          </p>
        </div>
        {lint && (
          <div className={`px-2 py-1 rounded border font-mono font-bold text-xs ${scoreColor}`}>
            XYZ Score: {lint.xyzScore}/100
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="xyz-bullet-text" className="block text-[11px] font-medium text-foreground">
          Bullet Text
        </label>
        <Textarea
          id="xyz-bullet-text"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Accomplished [X] as measured by [Y] by doing [Z]..."
          className="font-mono text-xs leading-relaxed"
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {loadingLint ? 'Auditing syntax…' : `${text.length} characters`}
          </span>
          <div className="flex gap-2 items-center">
            {savedStatus && <span className="text-teal-600 text-[11px] font-medium">{savedStatus}</span>}
            <Button type="button" size="sm" onClick={handleSave} disabled={text.trim() === bullet.rawText}>
              Apply Override
            </Button>
          </div>
        </div>
      </div>

      {lint && (
        <div className="space-y-3 pt-1">
          {/* Passive duty opener alert */}
          {lint.hasPassiveOpener && (
            <div className="p-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400 text-xs">
                <span>⚠ Passive Duty Opener Detected:</span>
                <span className="font-mono font-bold">"{lint.passiveOpenerMatch}"</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Recruiters skim past duties. Frame achievements with decisive executive verbs:
              </p>
              <div className="flex flex-wrap gap-1 pt-1">
                {['Architected', 'Engineered', 'Orchestrated', 'Accelerated', 'Delivered', 'Streamlined'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => handleApplyActionVerb(v)}
                    className="px-2 py-0.5 rounded bg-background border border-border text-[10px] font-medium hover:border-primary hover:text-primary transition-colors"
                  >
                    + Use "{v}"
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Clichés & AI buzzwords */}
          {lint.cliches.length > 0 && (
            <div className="p-2.5 rounded-lg border border-destructive/40 bg-destructive/10 space-y-1">
              <span className="font-semibold text-destructive text-xs block">
                ⚠ Cliché / AI Buzzword Alert ({lint.cliches.length})
              </span>
              <p className="text-[11px] text-muted-foreground">
                These terms trigger recruiter fatigue and sound like generative AI boilerplate:
              </p>
              <div className="flex flex-wrap gap-1 mt-1">
                {lint.cliches.map((c, i) => (
                  <Badge key={i} variant="destructive" className="text-[10px]">
                    {c}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Metric Quantification Status */}
          <div className="p-2.5 rounded-lg border border-border bg-card space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground text-xs">Quantified Scale &amp; Metrics:</span>
              <Badge variant={lint.isQuantified ? 'teal' : 'outline'}>
                {lint.isQuantified ? 'Quantified' : 'Unquantified'}
              </Badge>
            </div>
            {lint.metrics.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {lint.metrics.map((m, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-md font-mono text-[10px] bg-teal-500/15 text-teal-700 dark:text-teal-300 font-semibold"
                  >
                    ✓ {m}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                {lint.metricPrompt ?? 'No quantified numbers (%, $, latency, scale) detected. Add specific results.'}
              </p>
            )}
          </div>

          {/* Google XYZ Formula Breakdown */}
          <div className="p-2.5 rounded-lg border border-border bg-muted/20 space-y-1.5">
            <span className="font-semibold text-foreground text-xs block">Google XYZ Architecture:</span>
            <div className="grid grid-cols-3 gap-1.5 text-[10px]">
              <div
                className={`p-1.5 rounded border ${!lint.hasPassiveOpener ? 'border-teal-500/40 bg-teal-500/5' : 'border-border'}`}
              >
                <strong className="block text-foreground">[X] Accomplished</strong>
                <span className="text-muted-foreground">Active impact verb</span>
              </div>
              <div
                className={`p-1.5 rounded border ${lint.isQuantified ? 'border-teal-500/40 bg-teal-500/5' : 'border-border'}`}
              >
                <strong className="block text-foreground">[Y] Measured By</strong>
                <span className="text-muted-foreground">%, $, scale, time</span>
              </div>
              <div className="p-1.5 rounded border border-teal-500/40 bg-teal-500/5">
                <strong className="block text-foreground">[Z] By Doing</strong>
                <span className="text-muted-foreground">Technique / stack</span>
              </div>
            </div>
            {lint.recommendation && (
              <p className="text-[11px] text-muted-foreground italic pt-1">Tip: {lint.recommendation}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
