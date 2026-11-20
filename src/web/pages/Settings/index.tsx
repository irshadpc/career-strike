import type { SettingDefinition, SettingsResponse } from '../../api';
import { PageHeader } from '../../components/PageHeader';
import { ErrorPanel, Loading } from '../../components/states';
import { UpdatesPanel } from '../../components/Updates';
import { useResource } from '../../hooks/useResource';
import { useHashFocus } from '../../router';
import { AiAssistants, AiRequests } from './-components/AiAssistants';
import { DataAndPrivacy } from './-components/DataAndPrivacy';
import { SettingField } from './-components/SettingField';
import { groupOf } from './-helpers/settingFields';

const GROUPS = [
  { id: 'search', title: 'What you are looking for' },
  { id: 'candidate', title: 'About you' },
  { id: 'identity', title: 'Contact details for applications' },
  { id: 'monitoring', title: 'Background monitoring' },
] as const;

export function Settings() {
  const settings = useResource<SettingsResponse>('/api/settings');
  useHashFocus(settings.state === 'ready');

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Your search, your rules"
        lede="Each setting is saved on this computer as soon as you press Save."
      />
      {settings.state === 'loading' && <Loading label="Loading settings" />}
      {settings.state === 'error' && <ErrorPanel message={settings.message} onRetry={settings.retry} />}
      {settings.state === 'ready' &&
        GROUPS.map((group) => (
          <section
            key={group.id}
            className="rounded-xl border border-border bg-card p-6 shadow-xs mb-6"
            aria-labelledby={`group-${group.id}`}
          >
            <h2 id={`group-${group.id}`} className="text-lg font-semibold tracking-tight text-foreground mb-4">
              {group.title}
            </h2>
            {settings.data.definitions
              .filter((d: SettingDefinition) => groupOf(d) === group.id)
              .map((def: SettingDefinition) => (
                <SettingField key={def.key} def={def} value={settings.data.settings[def.key]} />
              ))}
          </section>
        ))}
      {settings.state === 'ready' && <AiRequests />}
      {settings.state === 'ready' && <AiAssistants />}
      {settings.state === 'ready' && <UpdatesPanel />}
      {settings.state === 'ready' && <DataAndPrivacy />}
      {settings.state === 'ready' && (
        <section className="rounded-xl border border-border bg-card p-6 shadow-xs mb-6">
          <h2 className="text-lg font-semibold tracking-tight text-foreground mb-2">Read-only inbox sync (IMAP)</h2>
          <p className="text-xs text-muted-foreground mb-3">
            Optional, local-only inbox sync lives on its own page so it never mixes with declared settings.
          </p>
          <a
            href="/imap-sync"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3"
          >
            Open inbox sync
          </a>
        </section>
      )}
    </>
  );
}

export default Settings;
