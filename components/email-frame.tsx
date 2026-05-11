"use client";

import { useState, useEffect, useRef } from "react";

interface EmailFrameProps {
  html: string;
}

export function EmailFrame({ html }: EmailFrameProps) {
  const [blobUrl, setBlobUrl] = useState<string>("");
  const [height, setHeight] = useState(400);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const isFullDoc = /^\s*(<(!DOCTYPE|html))/i.test(html);
    const content = isFullDoc
      ? html
      : `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
          body{margin:0;padding:16px;font-family:-apple-system,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;word-break:break-word;}
          img{max-width:100%;height:auto;}
          table{max-width:100%!important;}
        </style></head><body>${html}</body></html>`;

    const blob = new Blob([content], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [html]);

  const handleLoad = () => {
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc?.body) setHeight(doc.body.scrollHeight + 40);
    } catch {
      // cross-origin safety
    }
  };

  if (!blobUrl) return (
    <div className="flex items-center justify-center p-8 text-amber-500/50 text-sm">
      Đang tải...
    </div>
  );

  return (
    <iframe
      ref={iframeRef}
      src={blobUrl}
      onLoad={handleLoad}
      style={{ width: "100%", height, border: "none", display: "block", borderRadius: "0 0 16px 16px" }}
      title="email-content"
    />
  );
}
