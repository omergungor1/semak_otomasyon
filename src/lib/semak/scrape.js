import * as cheerio from "cheerio";

const LIST_URL =
  "https://www.semak.com.tr/Products?Type=Products&Stock=1";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export function parseTotalPages(html) {
  const $ = cheerio.load(html);
  const pages = [];

  $(".pagination .page-link").each((_, el) => {
    const text = $(el).text().trim();
    if (/^\d+$/.test(text)) pages.push(Number(text));

    const href = $(el).attr("href") || "";
    const match = href.match(/[?&]page=(\d+)/);
    if (match) pages.push(Number(match[1]));
  });

  return pages.length ? Math.max(...pages) : 1;
}

export function parseProducts(html, sourcePage) {
  const $ = cheerio.load(html);
  const products = [];

  $(".product-holder.product-grid-view .product-item").each((_, el) => {
    const $el = $(el);
    const titleLink = $el.find(".product-item-title a").first();
    const name = titleLink.text().replace(/\s+/g, " ").trim();
    if (!name) return;

    const productUrl = titleLink.attr("href") || null;
    const img = $el.find(".product-item-image img").first();
    const imageUrl = img.attr("src") || img.attr("data-src") || null;
    const brand = $el.find(".product-item-brand").text().replace(/\s+/g, " ").trim() || null;

    let smkCode = null;
    let materialCode = null;

    $el.find(".product-item-code").each((__, codeEl) => {
      const label = $(codeEl).text().replace(/\s+/g, " ").trim();
      const value = $(codeEl).find("span").first().text().replace(/\s+/g, " ").trim();
      if (/SMK/i.test(label)) smkCode = value || null;
      if (/Malzeme/i.test(label)) materialCode = value || null;
    });

    if (!smkCode) return;

    products.push({
      smk_code: smkCode,
      material_code: materialCode,
      name,
      brand,
      image_url: imageUrl,
      product_url: productUrl,
      source_page: sourcePage,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  return products;
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Semak sayfası alınamadı (${response.status})`);
  }

  return response.text();
}

export async function fetchSemakListPage(page = 1) {
  return fetchHtml(`${LIST_URL}&page=${page}`);
}

export async function fetchSemakDetailPage(productUrl) {
  if (!productUrl) {
    throw new Error("Ürün URL'si gerekli");
  }

  return fetchHtml(productUrl);
}

function normalizeJsonLdNodes(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data.flatMap((item) => normalizeJsonLdNodes(item));
  if (Array.isArray(data["@graph"])) return data["@graph"];
  return [data];
}

export function parseProductOfferFromJsonLd(html) {
  const $ = cheerio.load(html);
  const scripts = $('script[type="application/ld+json"]')
    .map((_, el) => $(el).html())
    .get();

  for (const raw of scripts) {
    if (!raw) continue;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    const nodes = normalizeJsonLdNodes(parsed);
    for (const node of nodes) {
      if (!node || node["@type"] !== "Product") continue;

      const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
      if (!offers) continue;

      const priceRaw = offers.price ?? offers.lowPrice ?? null;
      const price =
        priceRaw === null || priceRaw === undefined || priceRaw === ""
          ? null
          : Number(priceRaw);

      if (!Number.isFinite(price)) continue;

      return {
        price,
        currency: offers.priceCurrency || "TRY",
        sku: node.sku || null,
        name: node.name || null,
        availability: offers.availability || null,
      };
    }
  }

  return null;
}

export async function fetchProductOffer(productUrl) {
  const html = await fetchSemakDetailPage(productUrl);
  return parseProductOfferFromJsonLd(html);
}
