"use client";

import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { Period, UsageRow } from "@/lib/metrics/types";

interface AgentDetailModalProps {
  /** Name of the agent whose usage is shown; null = closed. */
  agent: string | null;
  /** Lookup function — returns rows for this agent/period. */
  rowsFor: (agentName: string, period: Period) => UsageRow[];
  onClose: () => void;
}

const ROW_CAP = 50;

/**
 * Mirrors the source's agent detail modal (admin.html lines 1217–1249).
 * Symmetric to the User Detail Modal — period selector inside the modal
 * (defaults to 'week' on each open), total uses count above the table,
 * table capped at 50 rows with overflow row.
 *
 * Real mode: User column shows "—" because user identity isn't tracked
 * in localStorage events (see Q1 of the Session 6 plan, D-021).
 */
export function AgentDetailModal({ agent, rowsFor, onClose }: AgentDetailModalProps) {
  const [period, setPeriod] = useState<Period>("week");

  // Reset period each time the modal opens (matches the source's
  // `agentTimePeriod.value = 'week';` reset at line 2210). Reset-on-
  // prop-change pattern; see user-detail-modal.tsx for the same
  // rationale.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPeriod("week");
  }, [agent]);

  const rows = agent ? rowsFor(agent, period) : [];
  const total = rows.length;
  const visibleRows = rows.slice(0, ROW_CAP);
  const overflow = total > ROW_CAP;

  return (
    <Dialog open={agent !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{agent ?? "Agent Usage Details"}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <label htmlFor="agent-modal-period" className="text-sm">
            Time Period:
          </label>
          <Select
            value={period}
            onValueChange={(v) => setPeriod(v as Period)}
          >
            <SelectTrigger id="agent-modal-period" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Last Week</SelectItem>
              <SelectItem value="month">Last Month</SelectItem>
              <SelectItem value="year">Last Year</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col items-center gap-1 py-2">
          <div className="text-3xl font-semibold tabular-nums">
            {total.toLocaleString()}
          </div>
          <div className="text-sm text-muted-foreground">Total Uses</div>
        </div>

        <div className="max-h-96 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>User</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {total === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    No usage data found for this period.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {visibleRows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>{row.date}</TableCell>
                      <TableCell>{row.time}</TableCell>
                      <TableCell>{row.user}</TableCell>
                    </TableRow>
                  ))}
                  {overflow ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="text-center text-xs italic text-muted-foreground"
                      >
                        Showing {ROW_CAP} of {total.toLocaleString()} uses...
                      </TableCell>
                    </TableRow>
                  ) : null}
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
