// #34 — Microsoft sign-in via MSAL (msal-browser), for Microsoft To Do.
// Uses the REDIRECT flow (not popup): the page navigates to Microsoft and back,
// and handleRedirectPromise() processes the response on load. Redirect flow is
// robust (popup handoff was failing) and reuses the already-registered SPA
// redirect URI — no Azure changes. MSAL is dynamically imported so it
// code-splits and stays out of the main bundle + tests.
import { MS_CLIENT_ID } from "../config.js";

const SCOPES = ["Tasks.ReadWrite", "User.Read"];

// Redirect URI must match the SPA redirect registered in Entra exactly.
function redirectUri() {
  return window.location.origin + "/daymaster/";
}

let _msalPromise = null;
function getMsal() {
  if (!_msalPromise) {
    _msalPromise = (async () => {
      const { PublicClientApplication } = await import("@azure/msal-browser");
      const msal = new PublicClientApplication({
        auth: {
          clientId: MS_CLIENT_ID,
          // `common` supports both work/school and personal Microsoft accounts.
          authority: "https://login.microsoftonline.com/common",
          redirectUri: redirectUri(),
        },
        cache: { cacheLocation: "localStorage" },
      });
      await msal.initialize();
      // Process a returning redirect response (sets the signed-in account).
      await msal.handleRedirectPromise();
      return msal;
    })();
  }
  return _msalPromise;
}

export function msConfigured() {
  return !!MS_CLIENT_ID;
}

// Load MSAL (+ process any returning redirect) and return the cached account.
// Safe to call on tile mount; returns null when not configured or not signed in.
export async function msInit() {
  if (!msConfigured()) return null;
  const msal = await getMsal();
  return msal.getAllAccounts()[0] || null;
}

// Navigates the page to Microsoft. On return, msInit() picks up the account.
export async function msLogin() {
  const msal = await getMsal();
  await msal.loginRedirect({ scopes: SCOPES });
}

export async function msGetToken() {
  const msal = await getMsal();
  const account = msal.getAllAccounts()[0];
  if (!account) return null;
  try {
    const res = await msal.acquireTokenSilent({ scopes: SCOPES, account });
    return res.accessToken;
  } catch {
    // Token can't be refreshed silently — re-auth via redirect (navigates away).
    await msal.acquireTokenRedirect({ scopes: SCOPES, account });
    return null;
  }
}

export async function msLogout() {
  const msal = await getMsal();
  const account = msal.getAllAccounts()[0];
  if (account) await msal.logoutRedirect({ account });
}
