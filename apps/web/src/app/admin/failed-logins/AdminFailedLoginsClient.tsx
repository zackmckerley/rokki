"use client";

import { useEffect, useState } from "react";
import {
  AdminBadge,
  AdminEmpty,
  AdminMobileCard,
  AdminMobileField,
  AdminPanel,
  AdminTable,
  AdminTd,
  AdminTh,
} from "@/components/admin/primitives";

interface Row {
  token: string;
  password_attempts: number;
  magic_attempts: number;
  latest: string;
}

export function AdminFailedLoginsClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/admin/failed-logins?since_mins=1440", {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((b: { data?: Row[] }) => setRows(b.data ?? []))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "load failed"),
      );
  }, []);

  if (error)
    return (
      <p className="rounded-sm border border-danger/40 bg-danger-subtle px-3 py-1.5 text-xs text-danger">
        {error}
      </p>
    );
  if (rows.length === 0)
    return (
      <AdminEmpty
        panel
        body="Quiet so far. Failed sign-in attempts in the last 24 hours show here."
      >
        No failed login attempts.
      </AdminEmpty>
    );

  return (
    <>
      <div className="hidden sm:block">
        <AdminPanel>
          <AdminTable className="border-0">
            <thead>
              <tr className="border-b border-border bg-bg-2">
                <AdminTh>Token (ip:email)</AdminTh>
                <AdminTh align="right">Password attempts</AdminTh>
                <AdminTh align="right">Magic-link attempts</AdminTh>
                <AdminTh>Last attempt</AdminTh>
                <AdminTh>Status</AdminTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const total = r.password_attempts + r.magic_attempts;
                const tone =
                  total >= 10 ? "danger" : total >= 5 ? "warning" : "muted";
                return (
                  <tr key={r.token}>
                    <AdminTd mono>{r.token}</AdminTd>
                    <AdminTd align="right" mono>
                      {r.password_attempts}
                    </AdminTd>
                    <AdminTd align="right" mono>
                      {r.magic_attempts}
                    </AdminTd>
                    <AdminTd>
                      <span className="text-xs text-text-3">
                        {new Date(r.latest).toLocaleString()}
                      </span>
                    </AdminTd>
                    <AdminTd>
                      <AdminBadge variant={tone}>
                        {total >= 10 ? "abuse" : total >= 5 ? "watch" : "low"}
                      </AdminBadge>
                    </AdminTd>
                  </tr>
                );
              })}
            </tbody>
          </AdminTable>
        </AdminPanel>
      </div>

      <div className="flex flex-col gap-2 sm:hidden">
        {rows.map((r) => {
          const total = r.password_attempts + r.magic_attempts;
          const tone =
            total >= 10 ? "danger" : total >= 5 ? "warning" : "muted";
          return (
            <AdminMobileCard key={r.token}>
              <AdminMobileField label="Token" mono>
                <span className="break-all">{r.token}</span>
              </AdminMobileField>
              <AdminMobileField label="Password" mono>
                {r.password_attempts}
              </AdminMobileField>
              <AdminMobileField label="Magic link" mono>
                {r.magic_attempts}
              </AdminMobileField>
              <AdminMobileField label="Last">
                <span className="text-xs text-text-3">
                  {new Date(r.latest).toLocaleString()}
                </span>
              </AdminMobileField>
              <AdminMobileField label="Status">
                <AdminBadge variant={tone}>
                  {total >= 10 ? "abuse" : total >= 5 ? "watch" : "low"}
                </AdminBadge>
              </AdminMobileField>
            </AdminMobileCard>
          );
        })}
      </div>
    </>
  );
}
