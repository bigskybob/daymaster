// #34 — Microsoft sign-in via MSAL (msal-browser), for Microsoft To Do.
// MSAL is dynamically imported so it only loads when the user actually has the
// To Do tile / clicks Connect — keeping it out of the main bundle and the tests.
import { MS_CLIENT_ID } from "../config.js";

const SCOPES = ["Tasks.ReadWrite", "User.Read"];

let _msal = null;

// Redirect URI must match the SPA redirect registered in Entra exactly.
function redirectUri() {
  return window.location.origin + "/daymaster/";
}

async function getMsal() {
  if (!_msal) {
    const { PublicClientApplication } = await import("@azure/msal-browser");
    _msal = new PublicClientApplication({
      auth: {
        clientId: MS_CLIENT_ID,
        // `common` supports both work/school and personal Microsoft accounts.
        authority: "https://login.microsoftonline.com/common",
        redirectUri: redirectUri(),
      },
      cache: { cacheLocation: "localStorage" },
    });
    await _msal.initialize();
  }
  return _msal;
}

export function msConfigured() {
  return !!MS_CLIENT_ID;
}

// Load MSAL + return the cached account (if the user signed in before). Safe to
// call on tile mount; returns null when not configured or not signed in.
export async function msInit() {
  if (!msConfigured()) return null;
  const msal = await getMsal();
  return msal.getAllAccounts()[0] || null;
}

export async function msLogin() {
  const msal = await getMsal();
  const res = await msal.loginPopup({ scopes: SCOPES });
  return res.account;
}

export async function msGetToken() {
  const msal = await getMsal();
  const account = msal.getAllAccounts()[0];
  if (!account) return null;
  try {
    const res = await msal.acquireTokenSilent({ scopes: SCOPES, account });
    return res.accessToken;
  } catch {
    const res = await msal.acquireTokenPopup({ scopes: SCOPES });
    return res.accessToken;
  }
}

export async function msLogout() {
  const msal = await getMsal();
  const account = msal.getAllAccounts()[0];
  if (account) await msal.logoutPopup({ account });
}
