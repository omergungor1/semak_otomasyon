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

    if (body?.action === "deactivateMissing") {
      const smkCodes = Array.from(
        new Set(
          (Array.isArray(body.smkCodes) ? body.smkCodes : [])
            .map((code) => String(code || "").trim())
            .filter(Boolean),
        ),
      );

      const { count: total } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true });

      const minRequired = Math.max(20, Math.floor((total || 0) * 0.5));
      if (smkCodes.length < minRequired) {
        return NextResponse.json({
          deactivated: 0,
          skipped: true,
          reason: `Liste eksik göründüğü için pasife alma atlandı (${smkCodes.length}/${minRequired})`,
        });
      }

      const { data: activeRows, error: listError } = await supabase
        .from("products")
        .select("id, smk_code")
        .eq("is_active", true);

      if (listError) {
        return NextResponse.json({ error: listError.message }, { status: 500 });
      }

      const seen = new Set(smkCodes);
      const missing = (activeRows || []).filter((row) => !seen.has(row.smk_code));
      const now = new Date().toISOString();
      let deactivated = 0;

      for (let i = 0; i < missing.length; i += 80) {
        const chunk = missing.slice(i, i + 80).map((row) => row.id);
        const { error: updateError } = await supabase
          .from("products")
          .update({
            is_active: false,
            updated_at: now,
          })
          .in("id", chunk);

        if (updateError) {
          return NextResponse.json(
            { error: updateError.message, deactivated },
            { status: 500 },
          );
        }

        deactivated += chunk.length;
      }

      return NextResponse.json({
        deactivated,
        skipped: false,
        checked: activeRows?.length || 0,
        listed: smkCodes.length,
      });
    }

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
