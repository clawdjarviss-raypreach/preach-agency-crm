import { createClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const eventType = String(body?.eventType || body?.type || "unknown");
    const accountId = body?.accountId ? String(body.accountId) : null;

    const sb = createClient();
    const { error } = await sb.from("crm_of_webhook_events").insert({
      event_type: eventType,
      account_id: accountId,
      payload: body,
      processed: false,
    });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("OF webhook error", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
