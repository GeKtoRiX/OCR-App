export function removeAndReselect<T extends { id: string }>(
  items: T[],
  removeId: string,
  activeId: string | null,
): { items: T[]; activeId: string | null } {
  const next = items.filter((item) => item.id !== removeId);

  return {
    items: next,
    activeId: activeId === removeId ? (next[0]?.id ?? null) : activeId,
  };
}
