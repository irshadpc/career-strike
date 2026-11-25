import { PageHeader } from '../../components/PageHeader';
import { Link } from '../../router';
import { ImapSyncPanel } from '../Settings/-components/ImapSyncPanel';

export function ImapSync() {
  return (
    <div className="space-y-4">
      <div>
        <Link href="/settings" className="text-xs font-medium text-muted-foreground hover:text-foreground">
          ← Back to Settings
        </Link>
      </div>
      <PageHeader
        eyebrow="Inbox sync"
        title="Read-only inbox sync (IMAP)"
        lede="Optional, local-only. Polls an allowlisted set of ATS/employer domains over TLS."
      />
      <ImapSyncPanel />
    </div>
  );
}

export default ImapSync;
