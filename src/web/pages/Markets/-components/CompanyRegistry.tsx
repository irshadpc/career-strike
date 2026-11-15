import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  ApiError,
  api,
  type CompanyRegistryEntry,
  type CompanyRegistrySummary,
  type RegistrySignal,
} from '../../../api';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../../../components/ui/form';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { type CompanyFormValues, companySchema } from '../-schema/company';

const SIGNAL: Record<RegistrySignal, { label: string; variant: 'teal' | 'warning' | 'secondary' | 'outline' }> = {
  VERIFIED_OPEN_ROLES: { label: 'Locally verified open roles', variant: 'teal' },
  NO_CURRENT_ROLES_OBSERVED: { label: 'No current roles observed', variant: 'secondary' },
  EVIDENCE_STALE: { label: 'Evidence needs refresh', variant: 'warning' },
  REGISTRY_ONLY: { label: 'Registry only', variant: 'secondary' },
  CANDIDATE_ENTRY_UNVERIFIED: { label: 'Added by you, unverified', variant: 'outline' },
};

interface Payload {
  companies: CompanyRegistryEntry[];
  summary: CompanyRegistrySummary;
}

export function CompanyRegistry({ country }: { country: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [query, setQuery] = useState('');
  const [countryOnly, setCountryOnly] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (query.trim()) params.set('q', query.trim());
      if (countryOnly && country) params.set('country', country);
      setData(await api<Payload>(`/api/company-registry?${params.toString()}`));
    } catch {
      setMessage('The company registry could not be loaded.');
    }
  }, [country, countryOnly, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: { name: '', officialWebsite: '', careersUrl: '', notes: '' },
  });

  const submit = async (values: CompanyFormValues): Promise<void> => {
    try {
      await api('/api/company-registry', {
        method: 'POST',
        body: {
          name: values.name,
          officialWebsite: values.officialWebsite || null,
          careersUrl: values.careersUrl || null,
          notes: values.notes || null,
        },
      });
      form.reset();
      setShowForm(false);
      setMessage(`Added ${values.name}. No hiring signal is claimed until a public posting is retrieved.`);
      void load();
    } catch (err) {
      const text =
        err instanceof ApiError
          ? ((err.body as { message?: string } | null)?.message ?? 'Could not add that company.')
          : 'Could not add that company.';
      form.setError('name', { type: 'server', message: text });
    }
  };

  return (
    <section
      className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4"
      aria-labelledby="registry-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="registry-title" className="text-lg font-semibold tracking-tight text-foreground m-0">
            Company registry
          </h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
            An index of employers actually observed in public postings held by this installation, plus curated targets
            and companies you add yourself. Registry membership is not a vacancy claim: an employer with no local
            postings is shown as registry only, never as “not hiring”.
          </p>
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => setShowForm((open) => !open)}>
          {showForm ? 'Close form' : 'Add a company'}
        </Button>
      </div>

      {data && (
        <dl className="grid grid-cols-2 sm:grid-cols-5 gap-3 m-0">
          {[
            ['Companies', data.summary.total],
            ['Locally verified roles', data.summary.verifiedOpenRoles],
            ['Registry only', data.summary.registryOnly],
            ['Stale evidence', data.summary.stale],
            ['Monitored', data.summary.monitored],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-border/60 p-3">
              <dt className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</dt>
              <dd className="text-xl font-bold font-serif text-foreground m-0 mt-1">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="registry-query" className="block text-xs font-medium text-foreground">
            Search the registry
          </label>
          <Input
            id="registry-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Company name"
            autoComplete="off"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-foreground">
          <input type="checkbox" checked={countryOnly} onChange={(event) => setCountryOnly(event.target.checked)} />
          Only companies with evidence or targets in this market
        </label>
      </div>

      {showForm && (
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(submit)}
            noValidate
            className="rounded-lg border border-border/70 p-4 space-y-3"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel>Company name</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="officialWebsite"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>Official website (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="https://…" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="careersUrl"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>Careers page (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="https://…" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel>Private note (optional)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
                Add to registry
              </Button>
            </div>
          </form>
        </Form>
      )}

      {message && (
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground m-0">
          {message}
        </p>
      )}

      {data && data.companies.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">No companies match this filter.</p>
      ) : (
        <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3 list-none p-0 m-0">
          {data?.companies.map((company) => {
            const signal = SIGNAL[company.signal];
            return (
              <li key={company.id} className="rounded-lg border border-border/70 p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong className="text-sm font-semibold text-foreground">{company.name}</strong>
                    <span className="block text-[11px] text-muted-foreground">
                      {company.origin.replaceAll('_', ' ').toLowerCase()}
                      {company.markets.length ? ` · ${company.markets.join(', ')}` : ''}
                    </span>
                  </div>
                  <Badge variant={signal.variant}>{signal.label}</Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed m-0">{company.explanation}</p>
                {company.sampleRoles.length > 0 && (
                  <ul className="text-xs text-foreground m-0 pl-4 space-y-0.5">
                    {company.sampleRoles.slice(0, 3).map((role) => (
                      <li key={`${company.id}-${role.title}-${role.lastSeenAt}`}>
                        {role.title}
                        {role.location ? ` — ${role.location}` : ''}{' '}
                        <span className="text-muted-foreground">({role.status.toLowerCase()})</span>
                      </li>
                    ))}
                  </ul>
                )}
                <ul className="text-[11px] text-muted-foreground m-0 pl-4">
                  {company.evidence.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-3 text-xs">
                  {company.careersUrl && (
                    <a
                      className="text-primary hover:underline"
                      href={company.careersUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Careers page
                    </a>
                  )}
                  {company.officialWebsite && (
                    <a
                      className="text-primary hover:underline"
                      href={company.officialWebsite}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Official site
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
