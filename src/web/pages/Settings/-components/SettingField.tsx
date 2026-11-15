import { useState } from 'react';
import { type Control, Controller, useForm } from 'react-hook-form';
import { ApiError, api, type SettingDefinition, type ValidationIssue } from '../../../api';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { type Draft, type FieldKind, fieldKind, fromDraft, toDraft } from '../-helpers/settingFields';

type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved' }
  | { status: 'error'; messages: string[] };

interface SettingForm {
  value: Draft;
}

export function SettingField({ def, value }: { def: SettingDefinition; value: unknown }) {
  const kind = fieldKind(def.schema);
  const [save, setSave] = useState<SaveState>({ status: 'idle' });
  const form = useForm<SettingForm>({
    defaultValues: { value: kind ? toDraft(kind, value) : '' },
  });

  if (!kind) {
    return (
      <div className="space-y-2 py-4 border-b border-border/60 last:border-0" data-setting={def.key} id={def.key}>
        <p className="p-3 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-sm">
          This dashboard cannot edit “{def.label}” yet. Update Career Strike.
        </p>
      </div>
    );
  }

  const dirty = form.formState.isDirty;
  const helpId = `${def.key}-help`;
  const statusId = `${def.key}-status`;

  const submit = form.handleSubmit(async ({ value: draft }) => {
    setSave({ status: 'saving' });
    try {
      const res = await api<{ value: unknown }>(`/api/settings/${encodeURIComponent(def.key)}`, {
        method: 'PUT',
        body: { value: fromDraft(kind, draft) },
      });
      form.reset({ value: toDraft(kind, res.value) });
      setSave({ status: 'saved' });
    } catch (err) {
      const issues = err instanceof ApiError ? ((err.body as { issues?: ValidationIssue[] } | null)?.issues ?? []) : [];
      setSave({
        status: 'error',
        messages:
          issues.length > 0
            ? issues.map(describeIssue)
            : ['Could not save. Check that the service is running and try again.'],
      });
    }
  });

  return (
    <form
      className="space-y-2 py-4 border-b border-border/60 last:border-0"
      data-setting={def.key}
      id={def.key}
      onSubmit={(e) => {
        setSave({ status: 'idle' });
        void submit(e);
      }}
      noValidate
    >
      <FieldControl def={def} kind={kind} control={form.control} describedBy={`${helpId} ${statusId}`} />
      <p className="text-sm text-muted-foreground mt-1" id={helpId}>
        {def.help}
        {def.classification === 'SENSITIVE' && (
          <Badge variant="secondary" className="ml-2">
            Sensitive · stays on this device
          </Badge>
        )}
      </p>
      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" disabled={!dirty || save.status === 'saving'}>
          {save.status === 'saving' ? 'Saving…' : 'Save'}
        </Button>
        {dirty && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              form.reset();
              setSave({ status: 'idle' });
            }}
          >
            Discard changes
          </Button>
        )}
        <span
          id={statusId}
          role="status"
          aria-live="polite"
          className={`text-xs font-medium ${
            save.status === 'saved'
              ? 'text-teal-600 dark:text-teal-400'
              : save.status === 'error'
                ? 'text-destructive'
                : 'text-muted-foreground'
          }`}
        >
          {save.status === 'saved' && 'Saved'}
          {save.status === 'error' && save.messages.join(' ')}
        </span>
      </div>
    </form>
  );
}

function describeIssue(issue: ValidationIssue): string {
  return issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message;
}

interface ControlProps {
  def: SettingDefinition;
  kind: FieldKind;
  control: Control<SettingForm>;
  describedBy: string;
}

function FieldControl({ def, kind, control, describedBy }: ControlProps) {
  const label = (value: string): string => def.options[value] ?? value;
  const inputId = `${def.key}-input`;

  switch (kind.kind) {
    case 'choice':
      return (
        <Controller
          name="value"
          control={control}
          render={({ field }) => (
            <fieldset aria-describedby={describedBy}>
              <legend className="text-sm font-medium text-foreground block mb-2">{def.label}</legend>
              <div className="flex flex-wrap gap-4">
                {kind.values.map((v) => (
                  <label key={v} className="inline-flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input
                      type="radio"
                      name={def.key}
                      value={v}
                      checked={field.value === v}
                      onChange={() => field.onChange(v)}
                      onBlur={field.onBlur}
                      className="accent-primary"
                    />
                    <span>{label(v)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        />
      );
    case 'multi-choice':
      return (
        <Controller
          name="value"
          control={control}
          render={({ field }) => {
            const selected = (field.value as string[]) ?? [];
            return (
              <fieldset aria-describedby={describedBy}>
                <legend className="text-sm font-medium text-foreground block mb-2">{def.label}</legend>
                <div className="flex flex-wrap gap-4">
                  {kind.values.map((v) => (
                    <label key={v} className="inline-flex items-center gap-2 text-sm text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        value={v}
                        checked={selected.includes(v)}
                        onChange={(e) =>
                          field.onChange(
                            e.target.checked
                              ? kind.values.filter((x) => x === v || selected.includes(x))
                              : selected.filter((x) => x !== v),
                          )
                        }
                        onBlur={field.onBlur}
                        className="accent-primary rounded"
                      />
                      <span>{label(v)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          }}
        />
      );
    case 'lines':
      return (
        <Controller
          name="value"
          control={control}
          render={({ field }) => (
            <>
              <label htmlFor={inputId} className="block text-sm font-medium text-foreground mb-1">
                {def.label}
              </label>
              <textarea
                id={inputId}
                rows={4}
                className="flex min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={field.value as string}
                onChange={(e) => field.onChange(e.target.value)}
                onBlur={field.onBlur}
                aria-describedby={describedBy}
              />
            </>
          )}
        />
      );
    case 'country-authorizations':
      return (
        <Controller
          name="value"
          control={control}
          render={({ field }) => (
            <>
              <label htmlFor={inputId} className="block text-sm font-medium text-foreground mb-1">
                {def.label}
              </label>
              <textarea
                id={inputId}
                rows={4}
                className="flex min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={field.value as string}
                onChange={(e) => field.onChange(e.target.value)}
                onBlur={field.onBlur}
                aria-describedby={describedBy}
                placeholder="IN=authorised\nDE=needs_sponsorship"
              />
            </>
          )}
        />
      );
    case 'optional-text':
      return (
        <Controller
          name="value"
          control={control}
          render={({ field }) => (
            <>
              <label htmlFor={inputId} className="block text-sm font-medium text-foreground mb-1">
                {def.label}
              </label>
              <input
                id={inputId}
                type="text"
                className={`flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  kind.pattern && /^\^\[A-Z\]\{\d\}\$$/.test(kind.pattern) ? 'max-w-[120px]' : ''
                }`}
                value={field.value as string}
                onChange={(e) => field.onChange(e.target.value)}
                onBlur={field.onBlur}
                aria-describedby={describedBy}
                autoComplete="off"
              />
            </>
          )}
        />
      );
    case 'optional-record':
      return (
        <Controller
          name="value"
          control={control}
          render={({ field }) => {
            const record = (field.value as Record<string, string>) ?? {};
            const set = (name: string, v: string): void => field.onChange({ ...record, [name]: v });
            return (
              <fieldset aria-describedby={describedBy}>
                <legend className="text-sm font-medium text-foreground block mb-2">{def.label}</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                  {kind.properties.map(([name, schema]) => {
                    const id = `${def.key}-${name}`;
                    return (
                      <div key={name} className="space-y-1">
                        <label htmlFor={id} className="block text-xs font-medium text-foreground">
                          {recordLabel(name)}
                        </label>
                        {schema.enum ? (
                          <select
                            id={id}
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            value={record[name] ?? ''}
                            onChange={(e) => set(name, e.target.value)}
                            onBlur={field.onBlur}
                          >
                            <option value="">—</option>
                            {schema.enum.map((v) => (
                              <option key={v} value={v}>
                                {label(v)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            id={id}
                            type={schema.type === 'integer' ? 'number' : 'text'}
                            inputMode={schema.type === 'integer' ? 'numeric' : undefined}
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            value={record[name] ?? ''}
                            onChange={(e) => set(name, e.target.value)}
                            onBlur={field.onBlur}
                            autoComplete="off"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            );
          }}
        />
      );
  }
}

function recordLabel(name: string): string {
  return (
    name.charAt(0).toUpperCase() +
    name
      .slice(1)
      .replace(/([A-Z])/g, ' $1')
      .toLowerCase()
  );
}
