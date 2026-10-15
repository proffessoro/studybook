/** Moves the item at `index` by `delta` and returns the ids in their new order. */
export function moved(ids: string[], index: number, delta: number): string[] {
  const next = [...ids];
  const [item] = next.splice(index, 1);
  next.splice(index + delta, 0, item!);
  return next;
}
