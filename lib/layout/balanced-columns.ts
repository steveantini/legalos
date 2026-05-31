/**
 * Order-preserving balanced two-column split (D-073).
 *
 * Lays an ordered list of variable-height items into two columns WITHOUT
 * reordering them. The first column holds a contiguous prefix of the list and
 * the second holds the remainder, so a reader scanning down column one and then
 * down column two encounters every item in its original sequence. The split
 * point is chosen to minimize the difference in summed weight between the two
 * columns, but order is the hard constraint and balance is optimized only within
 * it: a minor height imbalance (one column ending higher, with trailing
 * whitespace) is the accepted trade-off for never scrambling order.
 *
 * `weight(item)` estimates an item's rendered height in any consistent unit. The
 * split is derived entirely from these weights, so adding or removing an item
 * re-flows automatically with zero hand-tuning and no placement code changes.
 *
 * Built as a portable layout primitive: the settings Connections page is the
 * first consumer; the Admin arc's multi-group surfaces are the intended next.
 *
 * @returns `[first, second]` — two in-order slices. For zero or one item the
 *   second column is empty (a single item never benefits from a second column).
 */
export function balancedOrderedSplit<T>(
  items: readonly T[],
  weight: (item: T) => number,
): [T[], T[]] {
  if (items.length <= 1) return [items.slice(), []];

  const total = items.reduce((sum, item) => sum + weight(item), 0);

  // Walk every interior split point (1..length-1, both columns non-empty),
  // tracking the running weight of the prefix. The best point is the one whose
  // prefix weight sits closest to half the total.
  let bestSplit = 1;
  let bestImbalance = Infinity;
  let prefix = 0;
  for (let k = 1; k < items.length; k++) {
    prefix += weight(items[k - 1]);
    const imbalance = Math.abs(prefix - (total - prefix));
    if (imbalance < bestImbalance) {
      bestImbalance = imbalance;
      bestSplit = k;
    }
  }

  return [items.slice(0, bestSplit), items.slice(bestSplit)];
}
