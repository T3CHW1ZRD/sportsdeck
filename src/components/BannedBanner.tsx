"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";

export default function BannedBanner() {
  const { user } = useAuth();

  if (!user?.isBanned) return null;

  return (
    <Link href="/profile#settings" className="block bg-red-600 text-white text-center py-1.5 px-4 text-xs font-semibold hover:bg-red-700 transition-colors sticky top-14 z-40">
      Account Suspended — Check Profile Settings to Appeal
    </Link>
  );
}
