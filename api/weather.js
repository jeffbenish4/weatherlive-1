const WEATHER_URL = "https://api.weatherapi.com/v1/current.json";
const MAX_CITY_LENGTH = 120;
const TIMEOUT_MS = 8000;

// Best-effort per-instance throttle. For strict global rate limits, add a shared
// store or edge/WAF rule; serverless instances do not share this Map.
const recentRequests = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(body));
}

function clientKey(req) {
  const forwarded = req.headers["x-forwarded-for"];
  return (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : "unknown").slice(0, 80);
}

function isRateLimited(key) {
  const now = Date.now();
  const existing = recentRequests.get(key);
  if (!existing || now - existing.start >= WINDOW_MS) {
    recentRequests.set(key, { start: now, count: 1 });
    return false;
  }
  existing.count += 1;
  return existing.count > MAX_REQUESTS_PER_WINDOW;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { error: "Method not allowed. Use GET." });
  }

  const ipKey = clientKey(req);
  if (isRateLimited(ipKey)) {
    return send(res, 429, { error: "Too many requests. Please wait a minute and try again." });
  }

  const city = typeof req.query.city === "string" ? req.query.city.trim() : "";
  if (!city) return send(res, 400, { error: "Enter a city to search." });
  if (city.length > MAX_CITY_LENGTH || /[\u0000-\u001f\u007f]/.test(city)) {
    return send(res, 400, { error: "Please enter a valid city name (120 characters or fewer)." });
  }

  const apiKey = process.env.WEATHERAPI_KEY;
  if (!apiKey) {
    return send(res, 500, { error: "Weather service is not configured. Add WEATHERAPI_KEY in Vercel project settings." });
  }

  const url = new URL(WEATHER_URL);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("q", city);
  url.searchParams.set("aqi", "no");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });

    const body = await upstream.text();
    // Forward the upstream status and body so the Inspector can show the
    // response received from WeatherAPI. Never forward request URLs or secrets.
    res.statusCode = upstream.status;
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(body);
  } catch (error) {
    const timedOut = error && error.name === "AbortError";
    return send(res, timedOut ? 504 : 502, {
      error: timedOut
        ? "The weather service took too long to respond. Please retry."
        : "Unable to reach the weather service. Check your connection and retry."
    });
  } finally {
    clearTimeout(timeout);
  }
};