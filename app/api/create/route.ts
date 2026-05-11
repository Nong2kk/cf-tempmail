import { NextResponse } from "next/server";
import { generateRandomAlias, validateAlias } from "@/lib/email-generator";

export async function POST(req: Request) {
  try {
    let alias: string;

    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => ({})) as { alias?: string };
      if (body.alias) {
        alias = body.alias.trim().toLowerCase();
        const err = validateAlias(alias);
        if (err) return NextResponse.json({ success: false, error: err });
      } else {
        alias = generateRandomAlias();
      }
    } else {
      alias = generateRandomAlias();
    }

    const domain = process.env.EMAIL_DOMAIN;
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const workerName = process.env.WORKER_NAME;

    if (!domain || !zoneId || !apiToken || !workerName) {
      // Dev mode: return email without creating CF rule
      const email = `${alias}@${domain ?? "beeaistore.site"}`;
      return NextResponse.json({ success: true, email, mock: true });
    }

    const email = `${alias}@${domain}`;

    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/email/routing/rules`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: alias,
          enabled: true,
          priority: 0,
          matchers: [{ type: "literal", field: "to", value: email }],
          actions: [{ type: "worker", value: [workerName] }],
        }),
      }
    );

    const cfData = await cfRes.json() as { success: boolean; errors?: { message: string }[] };

    if (!cfData.success) {
      const msg = cfData.errors?.[0]?.message ?? "Tạo email thất bại";
      const isDuplicate =
        msg.toLowerCase().includes("already exist") ||
        msg.toLowerCase().includes("duplicate");
      return NextResponse.json({
        success: false,
        error: isDuplicate ? "Tên này đã được dùng, hãy thử tên khác" : msg,
      });
    }

    return NextResponse.json({ success: true, email });
  } catch {
    return NextResponse.json({ success: false, error: "Lỗi server, vui lòng thử lại" });
  }
}
