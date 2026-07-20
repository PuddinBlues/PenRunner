import { NextRequest, NextResponse } from "next/server";

// BR-60: lingua iniziale dal dispositivo — it → italiano, altro → inglese.
// La scelta manuale (selettore) persiste via cookie.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname.startsWith("/it") ||
    pathname.startsWith("/en") ||
    pathname.startsWith("/scoreboard") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }
  const chosen = request.cookies.get("penrunner_locale")?.value;
  const device = request.headers
    .get("accept-language")
    ?.toLowerCase()
    .startsWith("it")
    ? "it"
    : "en";
  const locale = chosen === "it" || chosen === "en" ? chosen : device;
  return NextResponse.redirect(new URL(`/${locale}${pathname}`, request.url));
}

export const config = { matcher: ["/((?!api|_next/static|_next/image).*)"] };
