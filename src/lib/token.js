// OAuth access-token holder. App's initGoogleAuth sets it; drive.js / calendar.js read it.
let _token = null;
export function getToken() { return _token; }
export function setToken(t) { _token = t; }
