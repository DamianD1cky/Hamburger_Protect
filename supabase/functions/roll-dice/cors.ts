const productionOrigins = [
  "https://hamburger.damiandicky.site",
  "https://hamburger-protect.vercel.app",
];
const previewOrigins = ["localhost", "127.0.0.1"].flatMap((hostname) =>
  [5173, 5174, 4173].map((port) => `http://${hostname}:${port}`)
);

export function diceAllowedOrigins(configured?: string): Set<string> {
  return new Set(
    configured === undefined
      ? [...productionOrigins, ...previewOrigins]
      : configured.split(",").map((origin) => origin.trim()).filter(Boolean),
  );
}

export function diceCorsHeaders(
  origin: string | null,
  allowedOrigins: Set<string>,
  sdkHeaders: Record<string, string>,
): Record<string, string> {
  return {
    ...sdkHeaders,
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
    "Access-Control-Allow-Origin":
      origin && allowedOrigins.has(origin) ? origin : "",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
  };
}
