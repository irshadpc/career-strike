import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  type ApplicationSummary,
  api,
  type OutreachDraft,
  type OutreachState,
  type ProfessionalContact,
} from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { ErrorPanel, Loading } from '../../components/states';
import { Button } from '../../components/ui/button';
import { ContactForm } from './-components/ContactForm';
import { DraftCard } from './-components/DraftCard';
import { DraftForm } from './-components/DraftForm';

interface OutreachPayload {
  contacts: ProfessionalContact[];
  drafts: OutreachDraft[];
  summary: Record<OutreachState, number>;
}

const SUMMARY_ORDER: OutreachState[] = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT_MANUALLY', 'DISMISSED'];
const SUMMARY_LABEL: Record<OutreachState, string> = {
  DRAFT: 'Drafts',
  PENDING_APPROVAL: 'Awaiting approval',
  APPROVED: 'Approved, not sent',
  SENT_MANUALLY: 'Sent by you',
  DISMISSED: 'Dismissed',
};

export function Outreach() {
  const [data, setData] = useState<OutreachPayload | null>(null);
  const [applications, setApplications] = useState<ApplicationSummary[]>([]);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [outreach, apps] = await Promise.all([
        api<OutreachPayload>('/api/outreach'),
        api<{ applications: ApplicationSummary[] }>('/api/applications').catch(() => ({ applications: [] })),
      ]);
      setData(outreach);
      setApplications(apps.applications);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const removeContact = async (contact: ProfessionalContact): Promise<void> => {
    try {
      await api(`/api/outreach/contacts/${contact.id}`, { method: 'DELETE' });
      setMessage(`Removed ${contact.name}. Their drafts were removed with them.`);
      void load();
    } catch (err) {
      setMessage(err instanceof ApiError ? 'Could not remove that contact.' : 'Could not reach the service.');
    }
  };

  const replaceDraft = (draft: OutreachDraft): void => {
    setData((current) =>
      current
        ? {
            ...current,
            drafts: current.drafts.map((item) => (item.id === draft.id ? draft : item)),
            summary: current.summary,
          }
        : current,
    );
    void load();
  };

  if (error) return <ErrorPanel message="Outreach could not be loaded." onRetry={() => void load()} />;
  if (!data) return <Loading label="Loading outreach" />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Professional presence"
        title="Outreach you control"
        lede="Keep track of people you know, draft a message locally, and approve the exact words yourself. Career Strike never sends anything."
      />

      <section className="rounded-xl border border-border bg-card p-4 shadow-xs" aria-label="Outreach summary">
        <dl className="grid grid-cols-2 sm:grid-cols-5 gap-3 m-0">
          {SUMMARY_ORDER.map((state) => (
            <div key={state} className="rounded-lg border border-border/60 p-3">
              <dt className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                {SUMMARY_LABEL[state]}
              </dt>
              <dd className="text-xl font-bold font-serif text-foreground m-0 mt-1">{data.summary[state] ?? 0}</dd>
            </div>
          ))}
        </dl>
      </section>

      {message && (
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <section
          className="lg:col-span-1 rounded-xl border border-border bg-card p-6 shadow-xs"
          aria-labelledby="contacts-title"
        >
          <h2 id="contacts-title" className="text-lg font-semibold tracking-tight text-foreground mb-1">
            People
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            Names, employers and contact details stay in your local database. Nothing is looked up or enriched online.
          </p>
          {data.contacts.length > 0 ? (
            <ul className="space-y-2 list-none p-0 m-0 mb-4">
              {data.contacts.map((contact) => (
                <li key={contact.id} className="rounded-lg border border-border/60 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <strong className="text-foreground">{contact.name}</strong>
                      <span className="block text-xs text-muted-foreground">
                        {[contact.roleTitle, contact.employer].filter(Boolean).join(' · ') || 'No role recorded'}
                      </span>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => void removeContact(contact)}>
                      Remove<span className="sr-only"> {contact.name}</span>
                    </Button>
                  </div>
                  {contact.profileUrl && (
                    <a
                      className="text-xs text-primary hover:underline break-all"
                      href={contact.profileUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {contact.profileUrl}
                    </a>
                  )}
                  {contact.email && (
                    <span className="block text-xs text-muted-foreground break-all">{contact.email}</span>
                  )}
                  {contact.notes && <p className="text-xs text-muted-foreground mt-2 mb-0">{contact.notes}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground italic mb-4">No contacts yet.</p>
          )}
          <h3 className="text-sm font-semibold text-foreground mb-2">Add a person</h3>
          <ContactForm
            onSaved={(contact) => {
              setMessage(`Added ${contact.name}.`);
              void load();
            }}
          />
        </section>

        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-xl border border-border bg-card p-6 shadow-xs" aria-labelledby="new-draft-title">
            <h2 id="new-draft-title" className="text-lg font-semibold tracking-tight text-foreground mb-1">
              New local draft
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              A template is only a starting point. Edit every word, then request approval. Approval records the exact
              text; it does not send it.
            </p>
            {data.contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Add a contact first.</p>
            ) : (
              <DraftForm
                contacts={data.contacts}
                applications={applications}
                onSaved={(draft) => {
                  setMessage(`Saved a local draft for ${draft.contact.name}. Nothing was sent.`);
                  void load();
                }}
              />
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-6 shadow-xs" aria-labelledby="drafts-title">
            <h2 id="drafts-title" className="text-lg font-semibold tracking-tight text-foreground mb-1">
              Your drafts
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              An approved draft can still be edited, but editing revokes approval. Marking a message sent is your own
              record of an action you took outside Career Strike.
            </p>
            {data.drafts.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No drafts yet.</p>
            ) : (
              <ul className="space-y-3 list-none p-0 m-0">
                {data.drafts.map((draft) => (
                  <DraftCard key={draft.id} draft={draft} onChanged={replaceDraft} />
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default Outreach;
