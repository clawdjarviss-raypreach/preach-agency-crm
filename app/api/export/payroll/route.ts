import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import {
  generateExport,
  generateCryptoCSV,
  validateForExport,
  type ExportItem,
  type ExportOptions,
} from "../../../../lib/export-engine";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

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

    // Parse item IDs if provided
    const itemIds = itemIdsParam ? itemIdsParam.split(",") : undefined;

    // Fetch exportable items from Convex
    const items = await convex.query(api.crm.export.getExportableItems, {
      token,
      payRunId: payRunId ? (payRunId as Id<"crm_pay_runs">) : undefined,
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
      result = generateCryptoCSV(exportItems, { ...options, tokenType: "usdc" });
    } else if (format === "usdt-csv") {
      result = generateCryptoCSV(exportItems, { ...options, tokenType: "usdt" });
    } else {
      result = generateExport(exportItems, options);
    }

    // Set appropriate headers for file download
    const headers = new Headers();
    headers.set("Content-Type", result.mimeType);
    headers.set("Content-Disposition", `attachment; filename="${result.filename}"`);
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

    if (!confirmations || !Array.isArray(confirmations) || confirmations.length === 0) {
      return NextResponse.json(
        { error: "No confirmations provided" },
        { status: 400 }
      );
    }

    let result;

    if (matchByChatter && payRunId) {
      // Match by chatter name and amount
      result = await convex.mutation(api.crm.export.matchConfirmationsByChatter, {
        token,
        payRunId: payRunId as Id<"crm_pay_runs">,
        confirmations: confirmations.map((c: any) => ({
          chatterName: c.chatterName || c.name,
          amount: typeof c.amount === "string" ? parseFloat(c.amount) : c.amount,
          paymentRef: c.paymentRef || c.transactionId || c.txHash,
          paymentDate: c.paymentDate || c.date,
          paymentNotes: c.paymentNotes || c.notes,
        })),
      });

      return NextResponse.json({
        success: true,
        matched: result.matchedCount,
        unmatched: result.unmatchedCount,
        unmatchedItems: result.unmatched,
      });
    } else {
      // Match by item ID
      result = await convex.mutation(api.crm.export.importConfirmations, {
        token,
        confirmations: confirmations.map((c: any) => ({
          itemId: c.itemId as string,
          paymentRef: (c.paymentRef || c.transactionId || c.txHash) as string,
          paymentDate: (c.paymentDate || c.date) as string | undefined,
          paymentNotes: (c.paymentNotes || c.notes) as string | undefined,
          status: (c.status === "failed" ? "failed" : "success") as "success" | "failed",
        })),
      });

      return NextResponse.json({
        success: true,
        imported: result.successCount,
        failed: result.failedCount,
        skipped: result.skipCount,
        errors: result.errors,
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

    // Fetch items
    const items = await convex.query(api.crm.export.getExportableItems, {
      token,
      payRunId: payRunId ? (payRunId as Id<"crm_pay_runs">) : undefined,
      paymentMethod: paymentMethod || undefined,
      itemIds,
    });

    const exportItems = (items || []) as ExportItem[];

    // Validate
    const validation = validateForExport(
      exportItems,
      paymentMethod || undefined
    );

    // Get summary
    const summary = await convex.query(api.crm.export.getExportSummary, {
      token,
      payRunId: payRunId ? (payRunId as Id<"crm_pay_runs">) : undefined,
    });

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
        address: item.paymentAddress || item.wiseEmail || null,
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
