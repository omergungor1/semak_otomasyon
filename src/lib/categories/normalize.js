export function normalizeCategoryName(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/[’'`´]/g, "")
    .replace(/[–—−]/g, "-")
    .replace(/[.,;:!?()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/İ/g, "i")
    .replace(/I/g, "i")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i");
}

export function buildPathKey(anaKategori, altKategori) {
  const ana = normalizeCategoryName(anaKategori);
  if (!ana) return null;
  return `${ana}|${normalizeCategoryName(altKategori)}`;
}

export function categoryDisplayLabel(row) {
  if (row?.alt_kategori) {
    return `${row.ana_kategori} / ${row.alt_kategori}`;
  }
  return row?.ana_kategori || row?.name || "";
}

export function cleanCategoryLabel(value) {
  const text = String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

export function resolveCategoryFromBreadcrumb(items) {
  const crumbs = Array.isArray(items) ? items.filter(Boolean) : [];

  if (crumbs.length < 4) {
    return {
      ana_kategori: null,
      alt_kategori: null,
      crumbs,
    };
  }

  const middle = crumbs.slice(2, -1).map(cleanCategoryLabel).filter(Boolean);
  const ana_kategori = middle[0] || null;
  const rest = middle.slice(1);
  const alt_kategori = rest.length ? rest.join(" ") : null;

  return {
    ana_kategori,
    alt_kategori,
    crumbs,
  };
}
