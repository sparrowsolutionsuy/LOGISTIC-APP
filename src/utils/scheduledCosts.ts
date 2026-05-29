// DESACTIVADO: la auto-ejecución de costos programados fue deshabilitada
// para evitar la generación duplicada de costos al cargar la app.
// Los costos se registran manualmente desde el módulo de Costos.

export async function checkAndExecuteScheduledCosts(
  _definitions: unknown[],
  _existingCosts: unknown[],
  _onAddCost: unknown
): Promise<void> {
  // Desactivado intencionalmente — ver comentario en cabecera del archivo
  return;
}
