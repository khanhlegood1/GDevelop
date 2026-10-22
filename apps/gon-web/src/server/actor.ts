import { auth } from "./auth";
import { readConfig } from "./config";
import { unauthorized } from "./errors";
import { DEV_SESSION_COOKIE_NAME, parseCookies } from "./http";
import { getGonService } from "./runtime";
import type { Actor } from "./types";

export async function getOptionalActor(request: Request, requestId: string): Promise<Actor | null> {
  const service = getGonService();
  const config = readConfig();

  if (config.devAuthEnabled) {
    const cookies = parseCookies(request.headers.get("cookie"));
    const devActor = service.resolveDevSession(cookies[DEV_SESSION_COOKIE_NAME]);
    if (devActor) return { ...devActor, requestId };
  }

  const session = await auth();
  const gonUserId = session?.user?.gonUserId;
  if (!gonUserId) return null;
  const user = service.store.users.get(gonUserId);
  if (!user || user.status === "deleted") return null;
  return {
    userId: user.id,
    roles: user.roles,
    authProvider: "google",
    requestId,
  };
}

export async function requireActor(request: Request, requestId: string): Promise<Actor> {
  const actor = await getOptionalActor(request, requestId);
  if (!actor) throw unauthorized();
  return actor;
}
