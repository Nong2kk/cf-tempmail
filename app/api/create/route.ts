import { NextResponse } from "next/server";

function randomAlias() {
  return Math.random().toString(36).substring(2, 10);
}

function isValidAlias(alias: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/i.test(alias);
}

export async function POST(req: Request) {
  try {
    let alias: string;

    // Đọc body nếu có (custom alias)
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      if (body.alias) {
        alias = body.alias.trim().toLowerCase();
        if (!isValidAlias(alias)) {
          return NextResponse.json({
            success: false,
            error: "Tên không hợp lệ. Chỉ dùng chữ thường, số, dấu . _ -",
          });
        }
      } else {
        alias = randomAlias();
      }
    } else {
      alias = randomAlias();
    }

    const email = `${alias}@${process.env.DOMAIN}`;

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${process.env.CLOUDFLARE_ZONE_ID}/email/routing/rules`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: alias,
          enabled: true,
          priority: 0,
          matchers: [{ type: "literal", field: "to", value: email }],
          actions: [{ type: "worker", value: [process.env.WORKER_NAME] }],
        }),
      }
    );

    const data = await response.json();

    // Cloudflare trả về lỗi nếu rule đã tồn tại
    if (!data.success) {
      const msg = data.errors?.[0]?.message || "Tạo email thất bại";
      const isDuplicate = msg.toLowerCase().includes("already exist") || msg.toLowerCase().includes("duplicate");
      return NextResponse.json({
        success: false,
        error: isDuplicate ? "Tên này đã được sử dụng, thử tên khác" : msg,
      });
    }

    return NextResponse.json({ success: true, email });
  } catch (error) {
    return NextResponse.json({ success: false, error: "Lỗi server" });
  }
}
