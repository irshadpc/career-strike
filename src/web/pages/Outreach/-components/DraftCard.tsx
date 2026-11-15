import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError, api, type OutreachDraft, type OutreachState } from '../../../api';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Textarea } from '../../../components/ui/textarea';
import { PURPOSE_LABEL } from './DraftForm';

const STATE: Record<OutreachState, { label: string; variant: 'secondary' | 'warning' | 'teal' | 'outline' }> = {
  DRAFT: { label: 'Local draft', variant: 'secondary' },
  PENDING_APPROVAL: { label: 'Awaiting your approval', variant: 'warning' },
  APPROVED: { label: 'Approved, not sent', variant: 'teal' },
  SENT_MANUALLY: { label: 'Sent by you', variant: 'outline' },
  DISMISSED: { label: 'Dismissed', variant: 'outline' },
};

export function DraftCard({ draft, onChanged }: { draft: OutreachDraft; onChanged: (draft: OutreachDraft) => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);
  const { register, handleSubmit, reset, formState } = useForm<{ body: string }>({
    defaultValues: { body: draft.body },
  });
  useEffect(() => reset({ body: draft.body }), [draft.body, reset]);

  const act = async (path: string, body?: unknown, note?: string): Promise<void> => {
    try {
      const res = await api<{ draft: OutreachDraft }>(`/api/outreach/${draft.id}/${path}`, {
        method: 'POST',
        ...(body === undefined ? {} : { body }),
      });
      onChanged(res.draft);
      setMessage(note ?? 'Updated.');
    } catch (err) {
      setMessage(
        err instanceof ApiError
          ? ((err.body as { message?: string } | null)?.message ?? 'That did not work.')
          : 'That did not work.',
      );
    }
  };

  const save = async (values: { body: string }): Promise<void> => {
    try {
      const res = await api<{ draft: OutreachDraft }>(`/api/outreach/${draft.id}`, {
        method: 'PUT',
        body: { body: values.body },
      });
      onChanged(res.draft);
      setMessage(
        res.draft.state === 'DRAFT' && draft.state === 'APPROVED'
          ? 'Edit saved. Approval was revoked.'
          : 'Draft saved.',
      );
    } catch (err) {
      setMessage(
        err instanceof ApiError
          ? ((err.body as { message?: string } | null)?.message ?? 'Could not save the draft.')
          : 'Could not save the draft.',
      );
    }
  };

  const state = STATE[draft.state];
  const editable = draft.state !== 'SENT_MANUALLY' && draft.state !== 'DISMISSED';

  return (
    <li className="rounded-lg border border-border/70 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <strong className="text-sm font-semibold text-foreground">{draft.contact.name}</strong>
          <span className="block text-xs text-muted-foreground">
            {draft.contact.employer ? `${draft.contact.employer} · ` : ''}
            {PURPOSE_LABEL[draft.purpose]} · {draft.channel}
            {draft.application ? ` · ${draft.application.title}` : ''}
          </span>
        </div>
        <Badge variant={state.variant}>{state.label}</Badge>
      </div>

      {draft.subject && <p className="text-xs font-medium text-foreground m-0">Subject: {draft.subject}</p>}

      {editable ? (
        <form onSubmit={handleSubmit(save)} className="space-y-2">
          <label className="block text-xs font-medium text-foreground" htmlFor={`outreach-body-${draft.id}`}>
            Exact message
          </label>
          <Textarea id={`outreach-body-${draft.id}`} rows={6} {...register('body')} />
          <div className="flex justify-end">
            <Button type="submit" variant="ghost" size="sm" disabled={formState.isSubmitting}>
              Save edit
            </Button>
          </div>
        </form>
      ) : (
        <p className="whitespace-pre-wrap text-sm text-foreground m-0">{draft.body}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {draft.state === 'DRAFT' && (
          <>
            <Button type="button" size="sm" onClick={() => void act('request-approval')}>
              Request approval
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => void act('dismiss')}>
              Dismiss
            </Button>
          </>
        )}
        {draft.state === 'PENDING_APPROVAL' && (
          <>
            <Button
              type="button"
              size="sm"
              onClick={() => void act('approve', undefined, 'Approved. Nothing has been sent.')}
            >
              Approve exact text
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => void act('dismiss')}>
              Dismiss
            </Button>
          </>
        )}
        {draft.state === 'APPROVED' && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void act('revoke', undefined, 'Approval revoked.')}
            >
              Revoke approval
            </Button>
            <label className="inline-flex items-center gap-2 text-xs text-foreground">
              <input type="checkbox" checked={confirmSent} onChange={(event) => setConfirmSent(event.target.checked)} />
              I sent this message myself
            </label>
            <Button
              type="button"
              size="sm"
              disabled={!confirmSent}
              onClick={() => void act('mark-sent', { confirmed: true }, 'Recorded that you sent this yourself.')}
            >
              Mark sent manually
            </Button>
          </>
        )}
        {draft.state === 'DISMISSED' && (
          <Button type="button" variant="ghost" size="sm" onClick={() => void act('restore')}>
            Restore to draft
          </Button>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground m-0">
        Career Strike never sends messages. This is a local draft; only you can send it and then record that you did.
      </p>

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">State history ({draft.events.length})</summary>
        <ol className="mt-2 pl-4 space-y-1">
          {draft.events.map((event) => (
            <li key={`${event.at}-${event.to}-${event.actor}`}>
              {event.from ? `${event.from} → ` : ''}
              <span className="font-medium text-foreground">{event.to}</span> by {event.actor} on{' '}
              {new Date(event.at).toLocaleString()}
              {event.note ? ` — ${event.note}` : ''}
            </li>
          ))}
        </ol>
      </details>

      {message && (
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground m-0">
          {message}
        </p>
      )}
    </li>
  );
}
