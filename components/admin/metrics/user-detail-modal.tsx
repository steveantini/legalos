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
import type { InteractionRow, Period } from "@/lib/metrics/types";

interface UserDetailModalProps {
  /** Email of the user whose interactions are shown; null = closed. */
  user: string | null;
  /** Lookup function — returns rows for this user/period. */
  rowsFor: (userEmail: string, period: Period) => InteractionRow[];
  onClose: () => void;
}

const ROW_CAP = 50;

/**
 * Mirrors the source's user detail modal (admin.html lines 1182–1214).
 * Period selector inside the modal (defaults to 'week' on each open),
 * total interactions count above the table, table capped at 50 rows
 * with an italicized "Showing 50 of N interactions..." overflow row.
 */
export function UserDetailModal({ user, rowsFor, onClose }: UserDetailModalProps) {
  const [period, setPeriod] = useState<Period>("week");

  // Reset period each time the modal opens (matches the source's
  // `userTimePeriod.value = 'week';` reset at line 2106). This is the
  // canonical "reset internal state when prop changes" pattern; the
  // alternative is keying the component on `user`, which would force
  // a full remount and disrupt the Dialog's open/close transition.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPeriod("week");
  }, [user]);

  const rows = user ? rowsFor(user, period) : [];
  const total = rows.length;
  const visibleRows = rows.slice(0, ROW_CAP);
  const overflow = total > ROW_CAP;

  return (
    <Dialog open={user !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{user ?? "User Interactions"}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <label htmlFor="user-modal-period" className="text-sm">
            Time Period:
          </label>
          <Select
            value={period}
            onValueChange={(v) => setPeriod(v as Period)}
          >
            <SelectTrigger id="user-modal-period" className="w-40">
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
          <div className="text-sm text-muted-foreground">Total Interactions</div>
        </div>

        <div className="max-h-96 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Agent Used</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {total === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    No interactions found for this period.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {visibleRows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>{row.date}</TableCell>
                      <TableCell>{row.time}</TableCell>
                      <TableCell>{row.agent}</TableCell>
                    </TableRow>
                  ))}
                  {overflow ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="text-center text-xs italic text-muted-foreground"
                      >
                        Showing {ROW_CAP} of {total.toLocaleString()} interactions...
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
