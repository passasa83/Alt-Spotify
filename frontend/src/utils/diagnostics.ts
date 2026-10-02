/**
 * Recent errors kept in memory, attached to bug reports when the user agrees.
 * Nothing leaves the browser otherwise. No imports: the API client uses it.
 */

const MAX_ENTRIES = 15;

interface DiagnosticEntry {
  at: string;
  message: string;
}

const entries: DiagnosticEntry[] = [];
let installed = false;

// Query strings can carry the ?token= of media URLs: never keep them.
export const stripQuery = (url: string): string => url.split('?')[0]!;

export const recordError = (message: string) => {
  entries.push({ at: new Date().toISOString(), message: message.slice(0, 300) });
  if (entries.length > MAX_ENTRIES) entries.shift();
};

export const recentErrors = (): DiagnosticEntry[] => [...entries];

/** Catch uncaught errors and rejected promises (call once at startup). */
export const installDiagnostics = () => {
  if (installed) return;
  installed = true;
  window.addEventListener('error', (event) => {
    recordError(`JS: ${event.message}${event.filename ? ` (${stripQuery(event.filename)}:${event.lineno})` : ''}`);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    recordError(`Promise: ${reason instanceof Error ? reason.message : String(reason)}`);
  });
};
