export default {
  // ============ NHẬN MAIL (giữ nguyên logic cũ, chỉ đổi nơi cất) ============
  async email(message, env, ctx) {
    const raw = await new Response(message.raw).text();

    const subject = message.headers.get("subject") || "(No subject)";
    const from = message.headers.get("from") || "Unknown";
    const body = extractBody(raw);

    // Trước đây: fetch() gửi lên Supabase. Giờ: cất thẳng vào D1.
    await env.DB.prepare(
      `INSERT INTO emails (email, subject, from_email, body) VALUES (?, ?, ?, ?)`
    )
      .bind(message.to.toLowerCase(), subject, from, body)
      .run();
  },

  // ============ API CHO WEBSITE ĐỌC INBOX ============
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    // Website gọi: /api/inbox?email=abc@beeaistore.site
    if (url.pathname === "/api/inbox") {
      const addr = (url.searchParams.get("email") || "").toLowerCase().trim();
      if (!addr) {
        return Response.json({ error: "missing email" }, { status: 400, headers: cors });
      }

      const { results } = await env.DB.prepare(
        `SELECT id, email, subject, from_email, body, created_at
         FROM emails
         WHERE email = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 50`
      )
        .bind(addr)
        .all();

      return Response.json(results, { headers: cors });
    }

    return new Response("Not found", { status: 404, headers: cors });
  },

  // ============ TỰ DỌN MAIL CŨ HƠN 24 GIỜ ============
  async scheduled(event, env, ctx) {
    await env.DB.prepare(
      `DELETE FROM emails WHERE created_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day')`
    ).run();
  },
};

// ================================================================
// TỪ ĐÂY TRỞ XUỐNG: GIỮ NGUYÊN 100% CODE CŨ CỦA BẠN, KHÔNG SỬA GÌ
// ================================================================

function extractBody(raw) {
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const splitIndex = text.indexOf("\n\n");
  if (splitIndex === -1) return text.trim();

  const globalHeaders = text.slice(0, splitIndex);
  const rest = text.slice(splitIndex + 2);

  const contentType = getHeader(globalHeaders, "Content-Type") || "";
  const boundary = getBoundary(contentType);

  if (boundary) {
    const parts = splitParts(rest, boundary);
    let plainText = "";
    let htmlText = "";

    for (const part of parts) {
      const pSplit = part.indexOf("\n\n");
      if (pSplit === -1) continue;

      const pHeaders = part.slice(0, pSplit);
      const pBody = part.slice(pSplit + 2).trim();
      const pType = getHeader(pHeaders, "Content-Type") || "";
      const pEncoding = getHeader(pHeaders, "Content-Transfer-Encoding") || "";

      // Nested multipart (multipart/alternative bên trong multipart/mixed)
      const nestedBoundary = getBoundary(pType);
      if (nestedBoundary) {
        const nested = extractBody("Content-Type: " + pType + "\n\n" + pBody);
        if (nested && nested !== "(Không có nội dung)") {
          // Nếu nested trả về HTML, ưu tiên dùng
          if (/<[a-z][\s\S]*>/i.test(nested)) {
            htmlText = htmlText || nested;
          } else {
            plainText = plainText || nested;
          }
        }
        continue;
      }

      const decoded = decode(pBody, pEncoding);

      if (/text\/html/i.test(pType) && !htmlText) {
        htmlText = decoded; // GIỮ NGUYÊN HTML, không strip
      } else if (/text\/plain/i.test(pType) && !plainText) {
        plainText = decoded;
      }
    }

    // Ưu tiên HTML để hiển thị đẹp, fallback plain text
    return htmlText || plainText || "(Không có nội dung)";
  }

  // Single part
  const encoding = getHeader(globalHeaders, "Content-Transfer-Encoding") || "";
  const decoded = decode(rest.trim(), encoding);
  return decoded || "(Không có nội dung)";
}

function getHeader(headers, name) {
  const lines = headers.split("\n");
  let result = null;
  let capturing = false;

  for (const line of lines) {
    if (new RegExp(`^${name}:`, "i").test(line)) {
      result = line.replace(new RegExp(`^${name}:\\s*`, "i"), "");
      capturing = true;
    } else if (capturing && /^\s+/.test(line)) {
      result += " " + line.trim();
    } else if (capturing) {
      break;
    }
  }

  return result ? result.trim() : null;
}

function getBoundary(contentType) {
  const match = contentType.match(/boundary="?([^";\s]+)"?/i);
  return match ? match[1].trim() : null;
}

function splitParts(body, boundary) {
  const escaped = boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = body.split(new RegExp(`--${escaped}(?:--)?\\n?`));
  return parts.slice(1).filter((p) => p.trim() && !p.trim().startsWith("--"));
}

function decode(body, encoding) {
  const enc = (encoding || "").toLowerCase().trim();

  if (enc === "base64") {
    try {
      const clean = body.replace(/\s+/g, "");
      const bytes = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return body;
    }
  }

  if (enc === "quoted-printable") {
    const decoded = body
      .replace(/=\n/g, "")
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      );
    try {
      const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return decoded;
    }
  }

  return body;
}