"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * "← Dashboard" link in the admin TopBar. Hidden when the user is
 * already on the admin overview (/admin) since "back to dashboard" is
 * meaningless when you're at the root of admin.
 *
 * Pathname check is also strictly less-than-or-equal — anywhere deeper
 * than /admin (like /admin/users), the link is useful again.
 */
export function AdminBackLink() {
  const pathname = usePathname();
  if (pathname === "/admin") return null;
  return (
    <Link href="/admin" className="text-text-3 hover:text-text-1">
      ← Admin overview
    </Link>
  );
}
