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
          actions: [
            {
              type: "forward",
              value: [process.env.DESTINATION_EMAIL],
            },
          ],
          enabled: true,
          matchers: [
            {
              type: "literal",
              field: "to",
              value: email,
            },
          ],
          name: alias,
          priority: 0,
        }),
      }
    );

    const data = await response.json();

    return NextResponse.json({
      success: true,
      email,
      data,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error,
    });
  }
}