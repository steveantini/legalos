"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Period, TopUserRow } from "@/lib/metrics/types";

import {
  buildTopUsersCsv,
  topUsersFilename,
  triggerDownload,
} from "./csv";
import type { DataSourceMode } from "./data-source-toggle";

interface TopUsersTableProps {
  rowsFor: (period: Period) => TopUserRow[];
  onUserClick: (userEmail: string) => void;
  mode: DataSourceMode;
}

const REAL_MODE_EMPTY_COPY =
  "User identity is not currently tracked in localStorage events; this becomes available in Phase 2 when events move to Supabase (D-010).";
const SAMPLE_MODE_EMPTY_COPY =
  "No user activity recorded for this period.";

function rankBadgeClass(rank: number): string {
  // Gold / silver / bronze for ranks 1–3; default neutral for 4+.
  // Mirrors the source's `rank-1` / `rank-2` / `rank-3` / `rank-default`.
  if (rank === 1) return "bg-yellow-400 text-yellow-950 hover:bg-yellow-400";
  if (rank === 2) return "bg-zinc-300 text-zinc-900 hover:bg-zinc-300";
  if (rank === 3) return "bg-amber-600 text-white hover:bg-amber-600";
  return "";
}

/**
 * Top Users table — mirrors source admin.html lines 968–1024.
 * - Header: <h3> + week/month/year period select (default 'month').
 * - Columns: Rank | User | Interactions | Most Used Agent.
 * - Rank badges: 1/2/3 styled as gold/silver/bronze.
 * - Clickable user emails open the User Detail Modal.
 * - Footer: instruction text + Create Report CSV button.
 *
 * Empty states (real mode): renders the "tracked in Phase 2" copy
 * spanning all four columns. Sample mode is always populated, so the
 * empty-state branch never fires there.
 *
 * The Create Report button is disabled when there are no rows, with
 * `aria-label` indicating the no-data state (Q5 of the Session 6 plan).
 */
export function TopUsersTable({ rowsFor, onUserClick, mode }: TopUsersTableProps) {
  const [period, setPeriod] = useState<Period>("month");
  const rows = rowsFor(period);
  const empty = rows.length === 0;
  const emptyCopy = mode === "real" ? REAL_MODE_EMPTY_COPY : SAMPLE_MODE_EMPTY_COPY;

  function handleExport() {
    if (empty) return;
    const csv = buildTopUsersCsv(rows, period, mode);
    triggerDownload(csv, topUsersFilename(period, mode));
  }

  return (
    <section aria-labelledby="top-users-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h3 id="top-users-heading" className="text-lg font-semibold">
          Top Users
        </h3>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-40" aria-label="Top Users time period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Last Week</SelectItem>
            <SelectItem value="month">Last Month</SelectItem>
            <SelectItem value="year">Last Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Rank</TableHead>
              <TableHead>User</TableHead>
              <TableHead className="text-right">Interactions</TableHead>
              <TableHead>Most Used Agent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {empty ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  {emptyCopy}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.user}>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={rankBadgeClass(row.rank)}
                    >
                      {row.rank}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => onUserClick(row.user)}
                      className="text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {row.user}
                    </button>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.interactions.toLocaleString()}
                  </TableCell>
                  <TableCell>{row.agent}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
        <p className="text-xs text-muted-foreground">
          Click on a user&apos;s name to view their interaction history
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={empty}
          aria-label={empty ? "Create Report — no data to export" : "Create Report"}
          onClick={handleExport}
        >
          Create Report
        </Button>
      </div>
    </section>
  );
}
