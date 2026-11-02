import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { classifyRoute } from "@/lib/route-access";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key || url.includes("your-project")) {
    return supabaseResponse;
  }

  const pathname = request.nextUrl.pathname;
  const access = classifyRoute(pathname);

  // Information pages, browser files and the scheduler need no session. (The
  // scheduler's route checks its own secret.) Skipping the sign-in lookup also
  // keeps these requests fast.
  if (access === "public" || access === "file" || access === "scheduler") {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // API routes answer with a clear 401, never a redirect to an HTML page. Demo
  // mode is only for the app's screens and never unlocks an API.
  if (access === "api") {
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return supabaseResponse;
  }

  // The "demo" flag is set by the visitor's own browser, so it only lets the
  // app's screens load. Real data is protected by the database's row-level
  // security and by the checks in every API route, not by this flag.
  const demoMode = request.cookies.get("mywitness-demo")?.value === "1";

  if (!user && !demoMode && access === "app") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  if (user && pathname === "/login") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/today";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
