import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  ApiError,
  api,
  type EvidenceConflict,
  type EvidenceRevision,
  type ProfileEvidence,
  type ProfileFact,
  type ValidationIssue,
} from '../../../api';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../../../components/ui/form';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { type EvidenceFormValues, evidenceSchema } from '../-schema/profile';

const describeEvidence = (item: ProfileEvidence): string => {
  if (item.kind === 'project') return `${String(item.value.name)} — ${String(item.value.summary ?? '')}`;
  if (item.kind === 'achievement') return String(item.value.text);
  if (item.kind === 'portfolio') return `${String(item.value.label)} — ${String(item.value.url)}`;
  return String(item.value.summary);
};

const describeChange = (revision: EvidenceRevision): string => {
  const value = revision.value;
  if (typeof value.name === 'string') return String(value.name);
  if (typeof value.label === 'string') return String(value.label);
  if (typeof value.text === 'string') return String(value.text).slice(0, 80);
  if (typeof value.summary === 'string') return String(value.summary).slice(0, 80);
  return `Revision ${revision.revision}`;
};

export function EvidenceSection({
  evidence,
  conflicts = [],
  roles,
  onChange,
}: {
  evidence: ProfileEvidence[];
  conflicts?: EvidenceConflict[];
  roles: ProfileFact[];
  onChange: () => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [history, setHistory] = useState<EvidenceRevision[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const form = useForm<EvidenceFormValues>({
    resolver: zodResolver(evidenceSchema),
    defaultValues: { kind: 'project', name: '', detail: '', skills: '', url: '', roleFactId: '' },
  });
  const kind = useWatch({ control: form.control, name: 'kind' });

  const submit = async (values: EvidenceFormValues): Promise<void> => {
    const value =
      values.kind === 'project'
        ? {
            name: values.name,
            summary: values.detail,
            skills: (values.skills ?? '')
              .split(',')
              .map((skill) => skill.trim())
              .filter(Boolean),
            url: values.url || null,
          }
        : values.kind === 'achievement'
          ? { text: values.detail, roleFactId: values.roleFactId || null }
          : values.kind === 'portfolio'
            ? { label: values.name, url: values.url }
            : { roleFactId: values.roleFactId, summary: values.detail };
    try {
      await api('/api/profile/evidence', { method: 'POST', body: { kind: values.kind, value } });
      form.reset({ kind: values.kind, name: '', detail: '', skills: '', url: '', roleFactId: '' });
      setStatus('Saved with an initial revision. Confirm it before tailored documents use it.');
      onChange();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? ((err.body as { issues?: ValidationIssue[] } | null)?.issues?.[0]?.message ??
            'Check the fields and try again.')
          : 'Could not save evidence.';
      setStatus(message);
    }
  };

  const showHistory = async (item: ProfileEvidence): Promise<void> => {
    if (historyFor === item.id) {
      setHistoryFor(null);
      return;
    }
    setHistoryFor(item.id);
    setHistoryError(null);
    try {
      const res = await api<{ revisions: EvidenceRevision[] }>(
        `/api/profile/evidence/${encodeURIComponent(item.id)}/revisions`,
      );
      setHistory(res.revisions);
    } catch {
      setHistory([]);
      setHistoryError('Could not load the revision history.');
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-xs" aria-labelledby="evidence-title">
      <h2 id="evidence-title" className="text-lg font-semibold tracking-tight text-foreground mb-1">
        Projects and evidence
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        Add only work, achievements, and links you can stand behind. Each edit and confirmation is kept in a local
        revision history. Tailored documents use confirmed evidence, never inferred claims.
      </p>

      {conflicts.length > 0 && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-200"
        >
          <strong className="block mb-1">
            {conflicts.length} possible evidence conflict{conflicts.length === 1 ? '' : 's'}
          </strong>
          <ul className="m-0 pl-4 space-y-1">
            {conflicts.map((conflict) => (
              <li key={`${conflict.evidenceId}-${conflict.otherId}`}>
                {conflict.message} <span className="font-mono text-[11px]">{conflict.kind}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {evidence.length > 0 && (
        <ul className="divide-y divide-border/60 text-sm mb-4">
          {evidence.map((item) => (
            <li key={item.id} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-foreground">{describeEvidence(item)}</span>
                  {!item.confirmed && <Badge variant="secondary">Suggested — not used until you confirm</Badge>}
                  <Badge variant="outline">v{item.revision}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!item.confirmed && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={async () => {
                        await api(`/api/profile/evidence/${item.id}/confirm`, { method: 'POST' });
                        setStatus(`Confirmed ${describeEvidence(item)}.`);
                        onChange();
                      }}
                    >
                      Confirm<span className="sr-only"> evidence</span>
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="sm" onClick={() => void showHistory(item)}>
                    {historyFor === item.id ? 'Hide history' : `History (${item.revision})`}
                    <span className="sr-only"> for {describeEvidence(item)}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      await api(`/api/profile/evidence/${item.id}`, { method: 'DELETE' });
                      setStatus(`Removed ${describeEvidence(item)}.`);
                      onChange();
                    }}
                  >
                    {item.confirmed ? 'Remove' : 'Discard'}
                    <span className="sr-only"> evidence</span>
                  </Button>
                </div>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Last confirmed:{' '}
                {item.lastConfirmedAt
                  ? `${new Date(item.lastConfirmedAt).toLocaleString()} by ${item.lastConfirmedBy}`
                  : 'never'}
              </p>
              {historyFor === item.id && (
                <div className="mt-2 rounded-md border border-border/60 bg-muted/20 p-2">
                  {historyError && <p className="text-xs text-destructive m-0">{historyError}</p>}
                  {!historyError && history.length === 0 && (
                    <p className="text-xs text-muted-foreground m-0">No revisions recorded.</p>
                  )}
                  <ol className="m-0 pl-4 space-y-1 text-[11px] text-muted-foreground">
                    {history.map((revision) => (
                      <li key={revision.id}>
                        <span className="font-medium text-foreground">v{revision.revision}</span> {revision.change} by{' '}
                        {revision.actor} on {new Date(revision.at).toLocaleString()} — {describeChange(revision)}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Form {...form}>
        <form
          className="rounded-lg border border-border/70 bg-card/60 p-4 space-y-3"
          onSubmit={form.handleSubmit(submit)}
          noValidate
        >
          <FormField
            control={form.control}
            name="kind"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel>Type</FormLabel>
                <FormControl>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    {...field}
                  >
                    <option value="project">Project</option>
                    <option value="achievement">Achievement</option>
                    <option value="portfolio">Portfolio or GitHub link</option>
                    <option value="employment_detail">Employment detail</option>
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {(kind === 'project' || kind === 'portfolio') && (
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel>{kind === 'project' ? 'Project name' : 'Label'}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          {(kind === 'project' || kind === 'achievement' || kind === 'employment_detail') && (
            <FormField
              control={form.control}
              name="detail"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel>{kind === 'achievement' ? 'Verified achievement' : 'Description'}</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          {kind === 'project' && (
            <FormField
              control={form.control}
              name="skills"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel>Skills used</FormLabel>
                  <FormControl>
                    <Input placeholder="TypeScript, Kubernetes" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          {(kind === 'project' || kind === 'portfolio') && (
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel>Link {kind === 'project' ? '(optional)' : ''}</FormLabel>
                  <FormControl>
                    <Input placeholder="https://…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          {(kind === 'achievement' || kind === 'employment_detail') && (
            <FormField
              control={form.control}
              name="roleFactId"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel>Related role {kind === 'achievement' ? '(optional)' : ''}</FormLabel>
                  <FormControl>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      {...field}
                    >
                      <option value="">—</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {String(role.value.title)}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <div className="pt-2 flex justify-end">
            <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Saving…' : 'Add confirmed evidence'}
            </Button>
          </div>
        </form>
      </Form>
      {status && (
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground mt-2">
          {status}
        </p>
      )}
    </section>
  );
}
