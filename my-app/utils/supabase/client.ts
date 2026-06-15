type StoredSession = {
  access_token: string;
  expires_at?: number;
  refresh_token?: string;
  token_type?: string;
  user?: unknown;
};

type SignInResponse = StoredSession & {
  expires_in?: number;
};

type AuthPayload = {
  access_token?: string;
  expires_at?: number;
  expires_in?: number;
  refresh_token?: string;
  token_type?: string;
  user?: unknown;
};

type AuthChangeCallback = (event: "INITIAL_SESSION" | "SIGNED_IN" | "TOKEN_REFRESHED" | "SIGNED_OUT", session: StoredSession | null) => void;

const SESSION_KEY = "hydrowatch.supabase.session";

let supabaseClient: ReturnType<typeof createBrowserSupabaseClient> | null = null;

export function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  supabaseClient ??= createBrowserSupabaseClient(supabaseUrl, supabaseAnonKey);

  return supabaseClient;
}

function createBrowserSupabaseClient(supabaseUrl: string, supabaseAnonKey: string) {
  const authUrl = `${supabaseUrl.replace(/\/$/, "")}/auth/v1`;
  const listeners = new Set<AuthChangeCallback>();
  const headers = {
    apikey: supabaseAnonKey,
    "Content-Type": "application/json",
  };
  const notify = (event: Parameters<AuthChangeCallback>[0], session: StoredSession | null) => {
    listeners.forEach((listener) => listener(event, session));
  };
  const refreshStoredSession = async () => {
    const storedSession = readStoredSession();

    if (!storedSession?.refresh_token) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    const response = await fetch(`${authUrl}/token?grant_type=refresh_token`, {
      method: "POST",
      headers,
      body: JSON.stringify({ refresh_token: storedSession.refresh_token }),
    });
    const payload = (await response.json().catch(() => null)) as (AuthPayload & {
      error?: string;
      error_description?: string;
      msg?: string;
    }) | null;

    if (!response.ok || !payload?.access_token) {
      localStorage.removeItem(SESSION_KEY);
      notify("SIGNED_OUT", null);
      return null;
    }

    const session = normalizeSession({
      access_token: payload.access_token,
      expires_at: payload.expires_at,
      expires_in: payload.expires_in,
      refresh_token: payload.refresh_token ?? storedSession.refresh_token,
      token_type: payload.token_type,
      user: payload.user ?? storedSession.user,
    });

    writeSession(session);
    notify("TOKEN_REFRESHED", session);
    return session;
  };

  return {
    auth: {
      async getSession() {
        const session = readSession();

        if (!session) {
          const storedSession = readStoredSession();
          if (isExpiredSession(storedSession) && storedSession?.refresh_token) {
            return {
              data: {
                session: await refreshStoredSession(),
              },
            };
          }
        }

        return {
          data: {
            session,
          },
        };
      },
      async refreshSession() {
        return {
          data: {
            session: await refreshStoredSession(),
          },
          error: null,
        };
      },
      onAuthStateChange(callback: AuthChangeCallback) {
        listeners.add(callback);
        window.setTimeout(() => callback("INITIAL_SESSION", readSession()), 0);

        return {
          data: {
            subscription: {
              unsubscribe() {
                listeners.delete(callback);
              },
            },
          },
        };
      },
      async signInWithPassword({
        email,
        password,
      }: {
        email: string;
        password: string;
      }) {
        const response = await fetch(`${authUrl}/token?grant_type=password`, {
          method: "POST",
          headers,
          body: JSON.stringify({ email, password }),
        });
        const payload = await response.json();

        if (!response.ok) {
          return {
            data: { session: null },
            error: {
              message:
                payload.error_description ||
                payload.msg ||
                payload.error ||
                "Invalid login credentials.",
            },
          };
        }

        const session = normalizeSession(payload);
        writeSession(session);
        notify("SIGNED_IN", session);

        return {
          data: { session },
          error: null,
        };
      },
      async signUp({
        email,
        password,
      }: {
        email: string;
        password: string;
      }) {
        const response = await fetch(`${authUrl}/signup`, {
          method: "POST",
          headers,
          body: JSON.stringify({ email, password }),
        });
        const payload = (await response.json()) as AuthPayload & {
          error?: string;
          error_description?: string;
          msg?: string;
        };

        if (!response.ok) {
          return {
            data: { session: null, user: null },
            error: {
              message:
                payload.error_description ||
                payload.msg ||
                payload.error ||
                "Unable to create account.",
            },
          };
        }

        const session = payload.access_token
          ? normalizeSession({
              access_token: payload.access_token,
              expires_at: payload.expires_at,
              expires_in: payload.expires_in,
              refresh_token: payload.refresh_token,
              token_type: payload.token_type,
              user: payload.user,
            })
          : null;

        if (session) {
          writeSession(session);
          notify("SIGNED_IN", session);
        }

        return {
          data: {
            session,
            user: payload.user ?? null,
          },
          error: null,
        };
      },
      async signOut() {
        const session = readSession();

        if (session?.access_token) {
          await fetch(`${authUrl}/logout`, {
            method: "POST",
            headers: {
              ...headers,
              Authorization: `Bearer ${session.access_token}`,
            },
          }).catch(() => undefined);
        }

        localStorage.removeItem(SESSION_KEY);
        notify("SIGNED_OUT", null);

        return { error: null };
      },
    },
  };
}

function normalizeSession(payload: SignInResponse): StoredSession {
  const expiresAt =
    payload.expires_at ||
    (payload.expires_in
      ? Math.floor(Date.now() / 1000) + payload.expires_in
      : undefined);

  return {
    access_token: payload.access_token,
    expires_at: expiresAt,
    refresh_token: payload.refresh_token,
    token_type: payload.token_type,
    user: payload.user,
  };
}

function readSession() {
  const session = readStoredSession();

  if (!session?.access_token || isExpiredSession(session)) {
    return null;
  }

  return session;
}

function readStoredSession() {
  if (typeof window === "undefined") return null;

  const rawSession = localStorage.getItem(SESSION_KEY);
  if (!rawSession) return null;

  try {
    return JSON.parse(rawSession) as StoredSession;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function isExpiredSession(session: StoredSession | null) {
  return Boolean(session?.expires_at && session.expires_at <= Math.floor(Date.now() / 1000));
}

function writeSession(session: StoredSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}
