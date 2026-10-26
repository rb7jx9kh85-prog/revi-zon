import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Ni la landing ("/" et /landing/...), ni les fichiers statiques ne passent par Supabase.
  matcher: ["/((?!_next/static|_next/image|landing/|favicon.ico|icon.png|logo-mark.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|html)$).+)"],
};
