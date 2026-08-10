import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  fetchSemakListPage,
  parseProducts,
  parseTotalPages,
} from "@/lib/semak/scrape";

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return { supabase: null, unauthorized: true };
  }

  return { supabase, unauthorized: false };
}

export async function GET() {
  const { unauthorized } = await requireUser();
  if (unauthorized) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  try {
    const html = await fetchSemakListPage(1);
    const totalPages = parseTotalPages(html);
    const previewCount = parseProducts(html, 1).length;

    return NextResponse.json({
      totalPages,
      previewCount,
      source: "https://www.semak.com.tr/Products?Type=Products&Stock=1",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Senkron meta bilgisi alınamadı" },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  const { supabase, unauthorized } = await requireUser();
  if (unauthorized) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const page = Number(body?.page);

    if (!Number.isInteger(page) || page < 1) {
      return NextResponse.json(
        { error: "Geçerli bir sayfa numarası gerekli" },
        { status: 400 },
      );
    }

    const html = await fetchSemakListPage(page);
    const totalPages = parseTotalPages(html);
    const products = parseProducts(html, page);

    if (products.length === 0) {
      return NextResponse.json({
        page,
        totalPages,
        upserted: 0,
        products: [],
      });
    }

    const { data, error } = await supabase
      .from("products")
      .upsert(products, { onConflict: "smk_code" })
      .select("smk_code");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      page,
      totalPages,
      upserted: data?.length ?? products.length,
      products,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Senkronizasyon başarısız" },
      { status: 500 },
    );
  }
}
