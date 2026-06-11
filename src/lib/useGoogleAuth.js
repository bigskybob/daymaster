// Google OAuth (token-client) lifecycle, extracted from the App shell so the
// auth state machine lives behind a clear boundary. Owns authState / authEpoch
// and the connect / sign-out actions; the post-auth data load is injected via
// `onAuthed` so this hook stays free of store/sync concerns.
import { useState, useRef } from "react";
import { CLIENT_ID, SCOPES } from "../config.js";
import { getToken, setToken } from "./token.js";

// authState: idle | authing | authed | error | no-config
// authEpoch: bumps after each successful auth (and on sign-out) so tiles that
//   cache fetched data (e.g. the calendar tile) can re-fetch on a fresh consent.
export function useGoogleAuth({ onAuthed } = {}) {
  const [authState, setAuthState] = useState("idle");
  const [authEpoch, setAuthEpoch] = useState(0);
  // Keep the latest onAuthed callback so the async token callback always invokes
  // the current syncDown closure (the callback fires long after requestAccessToken).
  const onAuthedRef = useRef(onAuthed);
  onAuthedRef.current = onAuthed;

  // `force` = true means we want the consent dialog to actually appear
  // (e.g. user clicked "Re-authorize" because a needed scope is missing).
  // Without `prompt: "consent"`, Google will silently return whatever scopes
  // it already has on file, even if that's an incomplete subset of what we asked for.
  function initGoogleAuth(force = false) {
    if (!CLIENT_ID || CLIENT_ID === "YOUR_GOOGLE_CLIENT_ID_HERE") {
      setAuthState("no-config");
      return;
    }
    setAuthState("authing");
    try {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: async (resp) => {
          if (resp.error) {
            console.error("Google auth error:", resp.error, resp.error_description);
            setAuthState("error");
            return;
          }
          setToken(resp.access_token);
          // Surface any missing scopes so the calendar tile can show a real error
          // instead of silently looping on 403.
          const granted = (resp.scope || "").split(" ").filter(Boolean);
          const requested = SCOPES.split(" ").filter(Boolean);
          const missing = requested.filter(s => !granted.includes(s));
          if (missing.length) {
            console.warn("OAuth token issued without requested scopes:", missing,
              "— check Google Cloud Console: enable the API and add the scope to your OAuth consent screen.");
          }
          window.__daymasterGrantedScopes = granted;
          setAuthState("authed");
          setAuthEpoch(e => e + 1);
          await onAuthedRef.current?.();
        }
      });
      client.requestAccessToken({ prompt: force ? "consent" : "" });
    } catch(e) {
      console.error("Auth error", e);
      setAuthState("error");
    }
  }

  // Sign out of Google/Drive sync. Revoking the access token clears Google's
  // record of the granted scopes, so the next "Connect Drive" shows a fresh
  // consent screen — which is what you want after the scope set changes (#62).
  // Local data is left untouched; only the live session token is dropped.
  function signOut() {
    const tok = getToken();
    try {
      if (tok && window.google?.accounts?.oauth2?.revoke) {
        google.accounts.oauth2.revoke(tok, () => {});
      }
    } catch(e) { console.warn("Token revoke failed", e); }
    setToken(null);
    window.__daymasterGrantedScopes = undefined;
    setAuthState("idle");
    setAuthEpoch(e => e + 1);
  }

  const isAuthed = authState === "authed";
  return { authState, authEpoch, isAuthed, setAuthState, initGoogleAuth, signOut };
}
