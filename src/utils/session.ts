/**
 * Shared Client Tab Session ID
 * Isolates tabs and windows on the same machine/browser.
 */
export function getClientSessionId(): string {
  if (typeof window === 'undefined') return 'server_session';
  try {
    let sid = sessionStorage.getItem('wc_client_session_id');
    if (!sid) {
      sid = `tab_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
      sessionStorage.setItem('wc_client_session_id', sid);
    }
    return sid;
  } catch {
    return `tab_${Date.now().toString(36)}`;
  }
}
