import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { requireSupabase } from "../../lib/supabase/client";

const cache = new Map<string, { url: string; expires: number }>();
export function CampaignImage({ src, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const storedPath = Boolean(src && /^[0-9a-f-]{36}\/note-/i.test(src));
  const [resolved, setResolved] = useState<{ path: string; url: string } | null>(null);
  useEffect(() => {
    if (!storedPath || !src) return;
    let cancelled = false;
    const resolve = async () => {
      const cached = cache.get(src);
      if (cached && cached.expires > Date.now()) {
        setResolved({ path: src, url: cached.url }); return;
      }
      try {
        const { data, error } = await requireSupabase().storage.from("campaign-media").createSignedUrl(src, 3600);
        if (error || !data || cancelled) return;
        cache.set(src, { url: data.signedUrl, expires: Date.now() + 50 * 60_000 });
        setResolved({ path: src, url: data.signedUrl });
      } catch { /* 图片缺失不阻塞档案内容。 */ }
    };
    void resolve();
    const timer = window.setInterval(() => void resolve(), 50 * 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [src, storedPath]);
  const url = storedPath ? resolved && resolved.path === src ? resolved.url : undefined : src;
  return url ? <img {...props} src={url} /> : <span className="campaign-image-pending" role="status">图片加载中</span>;
}
