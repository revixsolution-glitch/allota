"use client";

import { Suspense } from "react";
import { GlobalNotificationBell } from "./GlobalNotificationBell";
import { GlobalDateFilter } from "./GlobalDateFilter";

export function GlobalTopBarActions() {
  return (
    <div className="flex items-center gap-2 sm:gap-2.5">
      {/* 1. Animated Notifications Icon (CRM Blue) on the LEFT */}
      <GlobalNotificationBell />

      {/* 2. Date Filter Pill on the RIGHT */}
      <Suspense
        fallback={
          <div className="h-8 w-32 rounded-full bg-slate-100 animate-pulse border border-line" />
        }
      >
        <GlobalDateFilter />
      </Suspense>
    </div>
  );
}
