import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (Next.js build artifacts)
     * - _next/image (image optimization)
     * - favicon / manifest / sw / robots
     * - public static media (images, video, audio, fonts)
     *
     * Anything with a known media extension is treated as public so the
     * auth gate doesn't 307 the login background video, sound files, or
     * web fonts to /login (which is what was happening before).
     */
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|sw\\.js|robots\\.txt|sitemap\\.xml|icon-[\\w-]+\\.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|mp4|webm|mov|mp3|wav|ogg|woff|woff2|ttf|eot|css|map)$).*)",
  ],
};
