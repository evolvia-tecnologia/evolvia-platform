/** A consulta posterior não pode transformar uma gravação confirmada em falha. */
export async function refreshAfterExhibitorAction(
  action: () => Promise<void>,
  refresh: () => Promise<void>,
): Promise<boolean> {
  await action();
  try {
    await refresh();
    return true;
  } catch {
    return false;
  }
}
