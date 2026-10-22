import { handlers } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST } = handlers;
