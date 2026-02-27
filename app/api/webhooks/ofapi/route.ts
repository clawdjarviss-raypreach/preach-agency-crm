import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";
import { api } from "../../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const eventType = String(body?.eventType || body?.type || "unknown");
    const accountId = body?.accountId ? String(body.accountId) : undefined;

    await convex.mutation((api as any).crm.ofIntegration.ingestWebhookEvent, {
      eventType,
      accountId,
      payload: body,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("OF webhook error", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
