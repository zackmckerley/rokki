"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AdminBadge,
  AdminEmpty,
  AdminFilterInput,
  AdminPanel,
  AdminTable,
  AdminTd,
  AdminTh,
} from "@/components/admin/primitives";
import { makeFuzzyFilter, useTableSort } from "@/lib/use-table-sort";

interface Row {
  token: string;
  password_attempts: number;
  magic_attempts: number;
  latest: string;
}

export function AdminFailedLoginsClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tableFilter, setTableFilter] = useState("");

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

  const fuzzy = useMemo(
    () => makeFuzzyFilter<Row>(tableFilter, (r) => [r.token]),
    [tableFilter],
  );

  const { sorted, onSortClick, arrow } = useTableSort<Row>({
    rows,
    filter: fuzzy,
    defaultSort: { key: "total", dir: "desc" },
    getValue: (r, key) => {
      switch (key) {
        case "token":
          return r.token;
        case "password_attempts":
          return r.password_attempts;
        case "magic_attempts":
          return r.magic_attempts;
        case "total":
          return r.password_attempts + r.magic_attempts;
        case "latest":
          return r.latest;
        case "status":
        default: {
          const total = r.password_attempts + r.magic_attempts;
          return total >= 10 ? "0-abuse" : total >= 5 ? "1-watch" : "2-low";
        }
      }
    },
  });

  if (error)
    return (
      <p className="rounded-sm border border-danger/40 bg-danger-subtle px-3 py-1.5 text-xs text-danger">
        {error}
      </p>
    );

  return (
    <>
      <div className="flex items-center justify-between gap-2 rounded border border-border bg-bg-1 p-2">
        <span className="text-xs text-text-3">
          {tableFilter ? `${sorted.length} / ${rows.length}` : rows.length} tokens (last 24h)
        </span>
        <AdminFilterInput
          value={tableFilter}
          onChange={setTableFilter}
          placeholder="Filter visible rows…"
        />
      </div>

      {sorted.length === 0 ? (
        <AdminEmpty>
          {tableFilter
            ? "No rows match the filter."
            : "No failed login attempts in the last 24h."}
        </AdminEmpty>
      ) : (
        <AdminPanel>
          <AdminTable className="border-0">
            <thead>
              <tr className="border-b border-border bg-bg-2">
                <AdminTh sortKey="token" sortDir={arrow("token")} onSort={onSortClick}>
                  Token (ip:email)
                </AdminTh>
                <AdminTh
                  align="right"
                  sortKey="password_attempts"
                  sortDir={arrow("password_attempts")}
                  onSort={onSortClick}
                >
                  Password attempts
                </AdminTh>
                <AdminTh
                  align="right"
                  sortKey="magic_attempts"
                  sortDir={arrow("magic_attempts")}
                  onSort={onSortClick}
                >
                  Magic-link attempts
                </AdminTh>
                <AdminTh
                  sortKey="latest"
                  sortDir={arrow("latest")}
                  onSort={onSortClick}
                >
                  Last attempt
                </AdminTh>
                <AdminTh
                  sortKey="status"
                  sortDir={arrow("status")}
                  onSort={onSortClick}
                >
                  Status
                </AdminTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((r) => {
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
      )}
    </>
  );
}
