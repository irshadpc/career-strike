import { PageHeader } from '../../components/PageHeader';
import { ImapSyncPanel } from '../Settings/-components/ImapSyncPanel';

export function ImapSync() {
  return (
    <div>
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
