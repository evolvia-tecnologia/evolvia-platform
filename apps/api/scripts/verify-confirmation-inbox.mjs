import { pathToFileURL } from 'node:url';
import { runInboxVerification } from '../dist/verify-confirmation-inbox.js';
export { verifyConfirmationInbox } from '../dist/verify-confirmation-inbox.js';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runInboxVerification();
