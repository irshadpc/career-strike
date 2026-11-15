import { useId, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import type { Proposal } from '../-helpers/rates';

type Decision = 'accept' | 'reject' | 'dismiss' | 'edit' | 'snooze' | 'undo';

interface ProposalListProps {
  proposals: Proposal[];
  onDecide: (id: string, how: Decision, title: string, body?: unknown) => void;
}

function ActionEditor({ proposal, onSave }: { proposal: Proposal; onSave: (body: unknown) => void }) {
  const action = proposal.effectiveAction;
  const id = useId();
  const [value, setValue] = useState(
    action.type === 'set-monitoring'
      ? (action.hours ?? '24')
      : action.type === 'add-preferred-role'
        ? (action.role ?? '')
        : (action.skill ?? ''),
  );
  return (
    <div className="flex flex-wrap items-end gap-2 pt-2">
      <div className="text-xs text-foreground space-y-1">
        <label className="block font-medium" htmlFor={id}>
          {action.type === 'set-monitoring'
            ? 'New interval'
            : action.type === 'add-preferred-role'
              ? 'Role family'
              : 'Skill'}
        </label>
        {action.type === 'set-monitoring' ? (
          <select
            id={id}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          >
            <option value="6">Every 6 hours</option>
            <option value="12">Every 12 hours</option>
            <option value="24">Once a day</option>
          </select>
        ) : (
          <input
            id={id}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        )}
      </div>
      <Button
        type="button"
        size="sm"
        onClick={() =>
          onSave({
            action:
              action.type === 'set-monitoring'
                ? { type: 'set-monitoring', hours: value }
                : action.type === 'add-preferred-role'
                  ? { type: 'add-preferred-role', role: value }
                  : { type: 'study-skill', skill: value },
          })
        }
      >
        Save edit
      </Button>
    </div>
  );
}

export function ProposalList({ proposals, onDecide }: ProposalListProps) {
  const [editing, setEditing] = useState<string | null>(null);
  if (proposals.length === 0) {
    return <p className="text-muted-foreground text-sm italic py-2">No suggestions right now.</p>;
  }

  return (
    <ul className="space-y-3" data-testid="proposals">
      {proposals.map((p) => (
        <li key={p.id}>
          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-base font-semibold text-foreground m-0">{p.title}</h3>
              <p className="text-xs text-muted-foreground m-0">{p.rationale}</p>
              <p className="text-[11px] text-muted-foreground m-0">
                Status: <strong className="text-foreground">{p.status.toLowerCase()}</strong>
                {p.snoozedUntil ? ` until ${new Date(p.snoozedUntil).toLocaleDateString()}` : ''}
                {p.editedAction ? ' · edited from the original suggestion' : ''}
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button type="button" size="sm" onClick={() => onDecide(p.id, 'accept', p.title)}>
                  Accept<span className="sr-only"> {p.title}</span>
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => onDecide(p.id, 'reject', p.title)}>
                  Reject<span className="sr-only"> {p.title}</span>
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => onDecide(p.id, 'dismiss', p.title)}>
                  Dismiss<span className="sr-only"> {p.title}</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onDecide(p.id, 'snooze', p.title, { days: 7 })}
                >
                  Snooze 7 days<span className="sr-only"> {p.title}</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(editing === p.id ? null : p.id)}
                >
                  {editing === p.id ? 'Cancel edit' : 'Edit'}
                  <span className="sr-only"> {p.title}</span>
                </Button>
              </div>
              {editing === p.id && (
                <ActionEditor proposal={p} onSave={(body) => onDecide(p.id, 'edit', p.title, body)} />
              )}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
