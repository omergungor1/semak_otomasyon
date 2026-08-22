import * as cheerio from "cheerio";
import {
  cleanCategoryLabel,
  resolveCategoryFromBreadcrumb,
} from "@/lib/categories/normalize";

const LIST_URL =
  "https://www.semak.com.tr/Products?Type=Products&Stock=1";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export class SemakPageError extends Error {
  constructor(message, { status, url } = {}) {
    super(message);
    this.name = "SemakPageError";
    this.status = status || null;
    this.url = url || null;
  }
}

export class SemakProductGoneError extends SemakPageError {
  constructor(message, opts = {}) {
    super(message, opts);
    this.name = "SemakProductGoneError";
    this.gone = true;
  }
}

export function isSemakPageError(error) {
  return (
    error instanceof SemakPageError ||
    error?.name === "SemakPageError" ||
    error?.name === "SemakProductGoneError" ||
    /Semak (ürün )?sayfas/i.test(error?.message || "")
  );
}

export function isSemakProductGoneError(error) {
  return (
    error instanceof SemakProductGoneError ||
    error?.name === "SemakProductGoneError" ||
    error?.gone === true
  );
}

function isSemakHomeUrl(url) {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)semak\.com\.tr$/i.test(parsed.hostname)) return false;
    const path = (parsed.pathname || "/").replace(/\/+$/, "") || "/";
    return path === "/";
  } catch {
    return false;
  }
}

function isSemakErrorHtml(html) {
  if (!html) return false;
  const hasErrorBanner = /Hata 500|Bir Hata Oluştu!/i.test(html);
  const hasProduct = /product-detail-holder/i.test(html);
  return hasErrorBanner && !hasProduct;
}

function looksLikeSemakHomepage(html) {
  if (!html || /product-detail-holder/i.test(html)) return false;
  if (isSemakErrorHtml(html)) return false;
  return /Haberler/i.test(html) && /Kategoriler/i.test(html);
}

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

async function fetchHtml(url, { expectProduct = false } = {}) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
    redirect: "follow",
  });

  const html = await response.text();
  const finalUrl = response.url || url;

  if (expectProduct) {
    const redirectedHome =
      isSemakHomeUrl(finalUrl) && !isSemakHomeUrl(url);
    const homepageHtml = looksLikeSemakHomepage(html);

    if (redirectedHome || (homepageHtml && !/product-detail-holder/i.test(html))) {
      throw new SemakProductGoneError(
        "Semak ürün sayfası yok, ana sayfaya yönlendirildi",
        { status: response.status, url: finalUrl },
      );
    }
  }

  if (!response.ok || isSemakErrorHtml(html)) {
    throw new SemakPageError(
      isSemakErrorHtml(html)
        ? `Semak ürün sayfası site hatası (${response.status})`
        : `Semak sayfası alınamadı (${response.status})`,
      { status: response.status, url: finalUrl },
    );
  }

  return html;
}

export async function fetchSemakListPage(page = 1) {
  return fetchHtml(`${LIST_URL}&page=${page}`);
}

export async function fetchSemakDetailPage(productUrl) {
  if (!productUrl) {
    throw new Error("Ürün URL'si gerekli");
  }

  return fetchHtml(productUrl, { expectProduct: true });
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
        description: typeof node.description === "string" ? node.description : null,
      };
    }
  }

  return null;
}

export function parseProductDescription(html) {
  const $ = cheerio.load(html);
  const $detail = $("#detail");

  if ($detail.length) {
    const htmlContent = ($detail.html() || "").trim();
    const textContent = $detail.text().replace(/\s+/g, " ").trim();
    if (htmlContent && textContent) {
      return {
        description_html: htmlContent,
        description_text: textContent,
      };
    }
  }

  const offer = parseProductOfferFromJsonLd(html);
  if (offer?.description) {
    return {
      description_html: `<p>${offer.description}</p>`,
      description_text: offer.description.replace(/\s+/g, " ").trim(),
    };
  }

  return {
    description_html: null,
    description_text: null,
  };
}

export function parseProductBreadcrumb(html) {
  const $ = cheerio.load(html);
  const items = [];

  $("nav[aria-label='breadcrumb'] ol.breadcrumb li.breadcrumb-item").each(
    (_, el) => {
      const text = cleanCategoryLabel($(el).text());
      if (text) items.push(text);
    },
  );

  return items;
}

export function parseProductCategory(html) {
  return resolveCategoryFromBreadcrumb(parseProductBreadcrumb(html));
}

export function parseProductSpecifications(html) {
  const $ = cheerio.load(html);
  const specs = [];

  $(".product-spec-table tr, table tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 2) return;

    const key = $(cells[0])
      .text()
      .replace(/\s+/g, " ")
      .replace(/:\s*$/, "")
      .trim();
    const value = $(cells[1]).text().replace(/\s+/g, " ").trim();

    if (!key) return;
    specs.push({ key, value });
  });

  return specs;
}

function specsUrlFromProductUrl(productUrl) {
  const url = String(productUrl || "").replace(/\/$/, "");
  return `${url}/specs`;
}

export async function fetchProductDetails(productUrl) {
  const html = await fetchSemakDetailPage(productUrl);
  const offer = parseProductOfferFromJsonLd(html);
  const description = parseProductDescription(html);
  const category = parseProductCategory(html);

  let specifications = [];
  try {
    const specsHtml = await fetchHtml(specsUrlFromProductUrl(productUrl));
    specifications = parseProductSpecifications(specsHtml);
  } catch {
    specifications = parseProductSpecifications(html);
  }

  return {
    offer,
    description_html: description.description_html,
    description_text: description.description_text,
    specifications,
    breadcrumb: category.crumbs,
    category,
  };
}

export async function fetchProductCategory(productUrl) {
  const html = await fetchSemakDetailPage(productUrl);
  return parseProductCategory(html);
}

export async function fetchProductOffer(productUrl) {
  const details = await fetchProductDetails(productUrl);
  return details.offer;
}
