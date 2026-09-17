import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/auth";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? verifySession(token) : null;

  const isAuthPage = pathname === "/login";

  if (isAuthPage) {
    if (session) {
      if (session.role === "SUPER_ADMIN") {
        return NextResponse.redirect(new URL("/super-admin", request.url));
      }
      const home = session.role === "ADMIN" ? "/admin" : "/employee";
      return NextResponse.redirect(new URL(home, request.url));
    }
    return NextResponse.next();
  }

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Super Admin Portal Gate
  if (pathname.startsWith("/super-admin")) {
    if (session.role !== "SUPER_ADMIN") {
      const home = session.role === "ADMIN" ? "/admin" : "/employee";
      return NextResponse.redirect(new URL(home, request.url));
    }
    return NextResponse.next();
  }

  // Admin CRM Gate
  if (pathname.startsWith("/admin")) {
    // Super Admins can enter Admin CRM if and only if they are in support impersonation mode
    if (session.role === "SUPER_ADMIN") {
      if (!session.impersonatedCompanyId) {
        return NextResponse.redirect(new URL("/super-admin", request.url));
      }
      return NextResponse.next();
    }
    if (session.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/employee", request.url));
    }
  }

  // Employee Portal Gate
  if (pathname.startsWith("/employee") && session.role !== "EMPLOYEE") {
    if (session.role === "SUPER_ADMIN") {
      return NextResponse.redirect(new URL("/super-admin", request.url));
    }
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/employee/:path*", "/super-admin/:path*", "/login"],
};
