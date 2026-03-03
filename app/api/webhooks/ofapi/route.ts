import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://hufcbxodgxinbvpqfaaw.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const eventType = String(body?.eventType || body?.type || "unknown");
    const accountId = body?.accountId ? String(body.accountId) : undefined;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/of-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        job: "webhook",
        eventType,
        accountId,
        payload: body,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase edge webhook failed (${res.status}): ${text}`);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("OF webhook error", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
