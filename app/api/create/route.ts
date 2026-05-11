import { NextResponse } from "next/server";

function randomEmail() {
  return Math.random().toString(36).substring(2, 10);
}

export async function POST() {
  try {
    const alias = randomEmail();
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
          matchers: [
            {
              type: "literal",
              field: "to",
              value: email,
            },
          ],
          actions: [
            {
              type: "worker",                          // ← đổi từ "forward" sang "worker"
              value: [process.env.WORKER_NAME],        // ← tên worker, ví dụ: "tempmail-inbox-worker"
            },
          ],
        }),
      }
    );

    const data = await response.json();
    return NextResponse.json({ success: true, email, data });
  } catch (error) {
    return NextResponse.json({ success: false, error });
  }
}
