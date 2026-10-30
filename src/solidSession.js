import { Session } from "@inrupt/solid-client-authn-browser";
import { restoreLoginTarget } from "./navigationTarget";

const STORAGE_PREFIX = "solid-data-manager:";
const storageKey = (key) => `${STORAGE_PREFIX}${key}`;

const sessionStorageWrapper = {
  get: async (key) =>
    typeof window === "undefined"
      ? undefined
      : window.sessionStorage.getItem(storageKey(key)) ?? undefined,
  set: async (key, value) => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(storageKey(key), value);
    }
  },
  delete: async (key) => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(storageKey(key));
    }
  },
};

let currentSession = new Session({
  clientName: "Solid Data Manager",
  sessionId: "data-manager",
  secureStorage: sessionStorageWrapper,
  insecureStorage: sessionStorageWrapper,
});

const session = {
  get info() {
    return currentSession.info;
  },
  fetch: (...args) => currentSession.fetch(...args),
  login: (...args) => currentSession.login(...args),
  logout: (...args) => currentSession.logout(...args),
  handleIncomingRedirect: (...args) => currentSession.handleIncomingRedirect(...args),
};

export const setSession = (nextSession) => {
  if (nextSession) {
    currentSession = nextSession;
  }
};

export async function restoreSession() {
  const params = new URLSearchParams(window.location.search);
  const isCallback = params.has('code') && params.has('state');
  await session.handleIncomingRedirect({ restorePreviousSession: true });
  if (session.info.isLoggedIn) restoreLoginTarget(isCallback);
  return session;
}

export default session;
