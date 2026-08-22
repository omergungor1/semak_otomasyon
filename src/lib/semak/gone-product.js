export function goneProductFields(now = new Date().toISOString()) {
  return {
    is_active: false,
    details_synced_at: now,
    category_synced_at: now,
    updated_at: now,
  };
}
