export function syncLog(scope, message, extra) {
  if (extra === undefined) {
    console.log(`[semak:${scope}]`, message);
    return;
  }
  console.log(`[semak:${scope}]`, message, extra);
}

export function formatSupabaseError(error) {
  if (!error) return "Bilinmeyen Supabase hatası";
  return [error.message, error.details, error.hint, error.code]
    .filter(Boolean)
    .join(" | ");
}
