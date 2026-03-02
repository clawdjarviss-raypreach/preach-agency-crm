import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import {
  generateExport,
  generateCryptoCSV,
  validateForExport,
  type ExportItem,
  type ExportOptions,
} from "../../../../lib/export-engine";

/**
 * Validate session token and return chatter info.
 */
async function validateSession(sb: ReturnType<typeof createClient>, token: string) {
  const { data: session, error } = await sb
    .from("crm_sessions")
    .select("*, chatter:crm_chatters(*)")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error || !session) return null;
  return session;
}

/**
 * Fetch exportable pay run items with optional filters.
 */
async function getExportableItems(
  sb: ReturnType<typeof createClient>,
  opts: {
    payRunId?: string;
    paymentMethod?: string;
    itemIds?: string[];
  }
): Promise<any[]> {
  let query = sb
    .from("crm_pay_run_items")
    .select("*, pay_run:crm_pay_runs(period_start, period_end)");

  if (opts.payRunId) {
    query = query.eq("pay_run_id", opts.payRunId);
  }
  if (opts.paymentMethod) {
    query = query.eq("payment_method", opts.paymentMethod);
  }
  if (opts.itemIds && opts.itemIds.length > 0) {
    query = query.in("id", opts.itemIds);
  }

  const { data, error } = await query;
  if (error) {
    console.error("getExportableItems error:", error);
    return [];
  }

  // Map to ExportItem shape
  return (data || []).map((item: any) => ({
    itemId: item.id,
    payRunId: item.pay_run_id,
    periodStartDate: item.pay_run?.period_start || "",
    periodEndDate: item.pay_run?.period_end || "",
    chatterId: item.chatter_id,
    chatterName: item.chatter_name,
    netPay: item.net_pay,
    netPayFormatted: `$${(item.net_pay / 100).toFixed(2)}`,
    paymentMethod: item.payment_method,
    paymentAddress: item.payment_address,
    wiseEmail: undefined, // populated from payment_preferences if needed
    bankDetails: undefined,
    currency: "USD",
  }));
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get("token");
    const format = searchParams.get("format") || "csv";
    const payRunId = searchParams.get("payRunId");
    const paymentMethod = searchParams.get("method");
    const itemIdsParam = searchParams.get("itemIds");
    const skipValidation = searchParams.get("skipValidation") === "true";

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 401 });
    }

    const sb = createClient();
    const session = await validateSession(sb, token);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse item IDs if provided
    const itemIds = itemIdsParam ? itemIdsParam.split(",") : undefined;

    // Fetch exportable items
    const items = await getExportableItems(sb, {
      payRunId: payRunId || undefined,
      paymentMethod: paymentMethod || undefined,
      itemIds,
    });

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: "No items found for export" },
        { status: 404 }
      );
    }

    // Cast to ExportItem type
    const exportItems = items as ExportItem[];

    // Validate items unless skipped
    if (!skipValidation) {
      const validation = validateForExport(
        exportItems,
        paymentMethod || undefined
      );

      if (!validation.valid && validation.errors.length > 0) {
        return NextResponse.json(
          {
            error: "Validation failed",
            errors: validation.errors,
            validCount: validation.validItems.length,
            invalidCount: validation.invalidItems.length,
          },
          { status: 400 }
        );
      }
    }

    // Generate export based on format
    const options: ExportOptions = {
      format: format as any,
      includeHeaders: true,
      currency: "USD",
      batchName: payRunId ? `Pay Run Export` : `Payroll Export`,
    };

    let result;
    if (format === "usdc-csv") {
      result = generateCryptoCSV(exportItems, {
        ...options,
        tokenType: "usdc",
      });
    } else if (format === "usdt-csv") {
      result = generateCryptoCSV(exportItems, {
        ...options,
        tokenType: "usdt",
      });
    } else {
      result = generateExport(exportItems, options);
    }

    // Set appropriate headers for file download
    const headers = new Headers();
    headers.set("Content-Type", result.mimeType);
    headers.set(
      "Content-Disposition",
      `attachment; filename="${result.filename}"`
    );
    headers.set("X-Item-Count", result.itemCount.toString());
    headers.set("X-Total-Amount", result.totalAmountFormatted);

    return new NextResponse(result.content, { status: 200, headers });
  } catch (error: any) {
    console.error("Export error:", error);
    return NextResponse.json(
      { error: error.message || "Export failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, confirmations, payRunId, matchByChatter } = body;

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 401 });
    }

    const sb = createClient();
    const session = await validateSession(sb, token);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (
      !confirmations ||
      !Array.isArray(confirmations) ||
      confirmations.length === 0
    ) {
      return NextResponse.json(
        { error: "No confirmations provided" },
        { status: 400 }
      );
    }

    if (matchByChatter && payRunId) {
      // Match by chatter name and amount
      let matchedCount = 0;
      let unmatchedCount = 0;
      const unmatched: any[] = [];

      for (const c of confirmations) {
        const chatterName = c.chatterName || c.name;
        const amount =
          typeof c.amount === "string" ? parseFloat(c.amount) : c.amount;
        const paymentRef = c.paymentRef || c.transactionId || c.txHash;
        const paymentDate = c.paymentDate || c.date;
        const paymentNotes = c.paymentNotes || c.notes;

        // Find matching item by chatter name and pay run
        const { data: item } = await sb
          .from("crm_pay_run_items")
          .select("id, net_pay")
          .eq("pay_run_id", payRunId)
          .eq("chatter_name", chatterName)
          .single();

        if (item) {
          await sb
            .from("crm_pay_run_items")
            .update({
              payment_status: "paid",
              payment_ref: paymentRef,
              payment_date: paymentDate,
              payment_notes: paymentNotes,
              paid_at: new Date().toISOString(),
            })
            .eq("id", item.id);
          matchedCount++;
        } else {
          unmatchedCount++;
          unmatched.push({ chatterName, amount });
        }
      }

      return NextResponse.json({
        success: true,
        matched: matchedCount,
        unmatched: unmatchedCount,
        unmatchedItems: unmatched,
      });
    } else {
      // Match by item ID
      let successCount = 0;
      let failedCount = 0;
      let skipCount = 0;
      const errors: string[] = [];

      for (const c of confirmations) {
        const itemId = c.itemId as string;
        const paymentRef = (c.paymentRef ||
          c.transactionId ||
          c.txHash) as string;
        const paymentDate = (c.paymentDate || c.date) as string | undefined;
        const paymentNotes = (c.paymentNotes || c.notes) as string | undefined;
        const status =
          c.status === "failed" ? "failed" : ("paid" as string);

        if (!itemId) {
          skipCount++;
          continue;
        }

        const { error } = await sb
          .from("crm_pay_run_items")
          .update({
            payment_status: status,
            payment_ref: paymentRef,
            payment_date: paymentDate,
            payment_notes: paymentNotes,
            paid_at: status === "paid" ? new Date().toISOString() : undefined,
          })
          .eq("id", itemId);

        if (error) {
          failedCount++;
          errors.push(`Failed to update item ${itemId}: ${error.message}`);
        } else {
          successCount++;
        }
      }

      return NextResponse.json({
        success: true,
        imported: successCount,
        failed: failedCount,
        skipped: skipCount,
        errors,
      });
    }
  } catch (error: any) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: error.message || "Import failed" },
      { status: 500 }
    );
  }
}

// Endpoint to preview export without downloading
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, payRunId, paymentMethod, itemIds } = body;

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 401 });
    }

    const sb = createClient();
    const session = await validateSession(sb, token);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch items
    const exportItems = (await getExportableItems(sb, {
      payRunId: payRunId || undefined,
      paymentMethod: paymentMethod || undefined,
      itemIds,
    })) as ExportItem[];

    // Validate
    const validation = validateForExport(
      exportItems,
      paymentMethod || undefined
    );

    // Get summary: aggregate totals from the pay run
    let summary: any = null;
    if (payRunId) {
      const { data: payRun } = await sb
        .from("crm_pay_runs")
        .select("*")
        .eq("id", payRunId)
        .single();

      if (payRun) {
        // Count items by payment method
        const { data: methodCounts } = await sb
          .from("crm_pay_run_items")
          .select("payment_method, payment_status")
          .eq("pay_run_id", payRunId);

        const byMethod: Record<string, number> = {};
        const byStatus: Record<string, number> = {};
        for (const item of methodCounts || []) {
          byMethod[item.payment_method] =
            (byMethod[item.payment_method] || 0) + 1;
          byStatus[item.payment_status] =
            (byStatus[item.payment_status] || 0) + 1;
        }

        summary = {
          payRunId: payRun.id,
          status: payRun.status,
          totalGross: payRun.total_gross,
          totalNet: payRun.total_net,
          byMethod,
          byStatus,
        };
      }
    }

    return NextResponse.json({
      itemCount: exportItems.length,
      validCount: validation.validItems.length,
      invalidCount: validation.invalidItems.length,
      errors: validation.errors,
      warnings: validation.warnings,
      summary,
      preview: exportItems.slice(0, 10).map((item) => ({
        chatterName: item.chatterName,
        amount: item.netPayFormatted,
        method: item.paymentMethod,
        address: item.paymentAddress || null,
      })),
    });
  } catch (error: any) {
    console.error("Preview error:", error);
    return NextResponse.json(
      { error: error.message || "Preview failed" },
      { status: 500 }
    );
  }
}
