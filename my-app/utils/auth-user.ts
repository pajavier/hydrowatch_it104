export function getAuthenticatedUserId(user: unknown, accessToken?: string | null) {
  const objectId =
    typeof user === "object" &&
    user !== null &&
    "id" in user &&
    typeof user.id === "string"
      ? user.id
      : null;

  return objectId ?? getJwtSubject(accessToken);
}

function getJwtSubject(accessToken?: string | null) {
  if (!accessToken || typeof window === "undefined") return null;

  const [, payload] = accessToken.split(".");
  if (!payload) return null;

  try {
    const json = JSON.parse(window.atob(toBase64(payload))) as { sub?: unknown };
    return typeof json.sub === "string" ? json.sub : null;
  } catch {
    return null;
  }
}

function toBase64(base64Url: string) {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  return base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
}
