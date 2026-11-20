import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { canonicalSkill } from '../../../../matching/skills';
import { ApiError, api, type ProfileFact, type ValidationIssue } from '../../../api';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { useToast } from '../../../components/ui/toast';
import type { SECTIONS } from '../-helpers/profileHelpers';

export function FactSection({
  section,
  facts,
  onChange,
}: {
  section: (typeof SECTIONS)[number];
  facts: ProfileFact[];
  onChange: () => void;
}) {
  const { toast } = useToast();
  const empty = Object.fromEntries(
    section.fields.map((f) => [f.name, f.options && f.required ? f.options[0]![0] : '']),
  );
  const form = useForm<Record<string, string>>({ defaultValues: empty });
  const [status, setStatus] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  const singular = section.title.replace(/s$/, '');

  // Once the freshly added fact arrives from the server, bring it into view and flash it so the
  // change is obvious even at the bottom of a long list.
  useEffect(() => {
    if (!pendingId) return;
    if (!facts.some((f) => f.id === pendingId)) return;
    document.getElementById(`fact-${pendingId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashId(pendingId);
    setPendingId(null);
  }, [facts, pendingId]);

  useEffect(() => {
    if (!flashId) return;
    const timer = setTimeout(() => setFlashId(null), 3000);
    return () => clearTimeout(timer);
  }, [flashId]);

  const submit = async (values: Record<string, string>): Promise<void> => {
    form.clearErrors();
    const value = Object.fromEntries(
      section.fields.map((f) => {
        const raw = (values[f.name] ?? '').trim();
        if (raw === '') return [f.name, f.required ? '' : null];
        return [f.name, f.type === 'number' ? Number(raw) : raw];
      }),
    );
    if (section.kind === 'skill') {
      const typed = String(value.name ?? '').trim();
      const name = (canonicalSkill(typed) ?? typed).toLowerCase();
      if (facts.some((f) => String(f.value.name).toLowerCase() === name)) {
        const label = canonicalSkill(typed) ?? typed;
        setStatus(`${label} is already in your skills.`);
        toast({
          title: `${label} is already in your skills`,
          description: 'Discard the existing entry first if you want to change how it is recorded.',
        });
        return;
      }
    }
    setAdding(true);
    try {
      const res = await api<{ fact: ProfileFact }>('/api/profile/facts', {
        method: 'POST',
        body: { kind: section.kind, value },
      });
      form.reset(empty);
      const label = section.describe(value);
      setStatus(`Added ${label}.`);
      toast({ variant: 'success', title: `${singular} added`, description: label });
      setPendingId(res.fact.id);
      onChange();
    } catch (err) {
      const issues = err instanceof ApiError ? ((err.body as { issues?: ValidationIssue[] } | null)?.issues ?? []) : [];
      for (const issue of issues) {
        form.setError(String(issue.path.at(-1) ?? 'form'), { type: 'server', message: issue.message });
      }
      const message = issues.length
        ? 'Check the highlighted fields.'
        : 'Could not save. Check that the service is running.';
      setStatus(message);
      toast({ variant: 'destructive', title: `Could not add ${singular.toLowerCase()}`, description: message });
    } finally {
      setAdding(false);
    }
  };

  const approve = async (fact: ProfileFact): Promise<void> => {
    const label = section.describe(fact.value);
    setBusyId(fact.id);
    try {
      await api(`/api/profile/facts/${fact.id}/approve`, { method: 'POST' });
      setStatus(`Approved ${label}.`);
      toast({ variant: 'success', title: `${singular} approved`, description: `${label} now counts toward matching.` });
      onChange();
    } catch {
      setStatus('Could not approve. Try again.');
      toast({ variant: 'destructive', title: `Could not approve ${label}`, description: 'Try again in a moment.' });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (fact: ProfileFact): Promise<void> => {
    const label = section.describe(fact.value);
    setBusyId(fact.id);
    try {
      await api(`/api/profile/facts/${fact.id}`, { method: 'DELETE' });
      setStatus(`Removed ${label}.`);
      toast({ variant: 'success', title: `${singular} removed`, description: label });
      onChange();
    } catch {
      setStatus('Could not remove. Try again.');
      toast({ variant: 'destructive', title: `Could not remove ${label}`, description: 'Try again in a moment.' });
    } finally {
      setBusyId(null);
    }
  };

  const approveAll = async (): Promise<void> => {
    setApprovingAll(true);
    try {
      const res = await api<{ count: number }>('/api/profile/facts/approve-all', {
        method: 'POST',
        body: { kind: section.kind },
      });
      const count = res?.count ?? facts.filter((f) => !f.approved).length;
      setStatus(`Approved all suggested ${section.title.toLowerCase()}.`);
      toast({
        variant: 'success',
        title: `${count} ${singular.toLowerCase()}${count === 1 ? '' : 's'} approved`,
        description: 'They now count toward matching.',
      });
      onChange();
    } catch {
      setStatus('Could not approve. Try again.');
      toast({ variant: 'destructive', title: 'Could not approve suggestions', description: 'Try again in a moment.' });
    } finally {
      setApprovingAll(false);
    }
  };

  const headingId = `profile-${section.kind}`;
  return (
    <section
      className="rounded-xl border border-border bg-card p-6 shadow-xs"
      aria-labelledby={headingId}
      data-fact-kind={section.kind}
    >
      <h2 id={headingId} className="text-lg font-semibold tracking-tight text-foreground mb-1">
        {section.title}
      </h2>
      {section.intro && <p className="text-sm text-muted-foreground mb-4">{section.intro}</p>}
      {facts.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-2">None added yet.</p>
      ) : (
        <>
          {facts.filter((f) => !f.approved).length > 1 && (
            <div className="mb-3">
              <Button type="button" variant="ghost" size="sm" onClick={() => void approveAll()} disabled={approvingAll}>
                {approvingAll && <Loader2 className="h-3 w-3 animate-spin" />}
                {approvingAll
                  ? 'Approving…'
                  : `Approve all ${facts.filter((f) => !f.approved).length} suggested ${section.title.toLowerCase()}`}
              </Button>
            </div>
          )}
          <ul className="divide-y divide-border/60 text-sm mb-4">
            {facts.map((f) => {
              const label = section.describe(f.value);
              const busy = busyId === f.id;
              return (
                <li
                  key={f.id}
                  id={`fact-${f.id}`}
                  className={`flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0 transition-colors rounded-md ${
                    flashId === f.id ? 'bg-teal-500/10 ring-1 ring-teal-500/40 px-2 -mx-2' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-foreground">{label}</span>
                    {!f.approved && <Badge variant="secondary">Suggested — not used until you approve</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    {!f.approved && (
                      <Button type="button" size="sm" onClick={() => void approve(f)} disabled={busy}>
                        {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                        {busy ? 'Approving…' : 'Approve'}
                        <span className="sr-only"> {label}</span>
                      </Button>
                    )}
                    <Button type="button" variant="ghost" size="sm" onClick={() => void remove(f)} disabled={busy}>
                      {f.approved ? 'Remove' : 'Discard'}
                      <span className="sr-only"> {label}</span>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <form
        className="rounded-lg border border-border/70 bg-card/60 p-4 space-y-3"
        onSubmit={form.handleSubmit(submit)}
        noValidate
        aria-label={`Add to ${section.title.toLowerCase()}`}
      >
        {section.fields.map((f) => {
          const id = `${section.kind}-${f.name}`;
          const error = form.formState.errors[f.name]?.message;
          return (
            <div key={f.name} className="space-y-1">
              <label htmlFor={id} className="block text-xs font-medium text-foreground">
                {f.label}
                {!f.required && <span className="text-muted-foreground font-normal"> (optional)</span>}
              </label>
              {f.type === 'select' ? (
                <select
                  id={id}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  {...form.register(f.name)}
                >
                  {f.options!.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={id}
                  type={f.type}
                  inputMode={f.type === 'number' ? 'numeric' : undefined}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  {...form.register(f.name)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error || f.hint ? `${id}-note` : undefined}
                  autoComplete="off"
                />
              )}
              {(error || f.hint) && (
                <span
                  id={`${id}-note`}
                  className={`block text-xs mt-1 ${error ? 'text-destructive font-medium' : 'text-muted-foreground'}`}
                >
                  {error ?? f.hint}
                </span>
              )}
            </div>
          );
        })}
        <div className="pt-2 flex justify-end">
          <Button type="submit" size="sm" disabled={adding || form.formState.isSubmitting}>
            {adding && <Loader2 className="h-3 w-3 animate-spin" />}
            {adding ? 'Adding…' : 'Add'}
          </Button>
        </div>
      </form>
      {status && (
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground mt-2">
          {status}
        </p>
      )}
    </section>
  );
}
