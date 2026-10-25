(() => {
  "use strict";

  const CITIES = ["New Delhi", "Mumbai", "Bengaluru", "Hyderabad", "Chennai", "Kolkata", "Pune", "Patna", "Jaipur", "London"];
  const MOODS = {
    scorching: { title: "Scorching", description: "The heat is in charge today. Take it slow and seek some shade." },
    freezing: { title: "Freezing", description: "A sharp chill in the air. Layer up before heading out." },
    muggy: { title: "Muggy", description: "Warm and moisture-heavy. Expect the air to feel a little sticky." },
    windy: { title: "Windy", description: "The air is moving with purpose. Secure loose layers and enjoy the breeze." },
    pleasant: { title: "Pleasant", description: "A sweet spot for being outside. The elements are playing nicely." },
    comfortable: { title: "Comfortable", description: "Fairly balanced conditions. A good day to get on with things." },
    mixed: { title: "Mixed", description: "A little of everything in the air. Dress for changing conditions." }
  };

  // Priority is intentional: extreme heat, extreme cold, humid heat, strong wind,
  // pleasant sweet spot, broader comfortable band, then the fallback.
  function calculateMood({ tempC, humidity, windKph }) {
    if (tempC >= 38) return "scorching";
    if (tempC <= 5) return "freezing";
    if (humidity >= 80 && tempC >= 28) return "muggy";
    if (windKph >= 30) return "windy";
    if (tempC >= 20 && tempC <= 30 && humidity <= 60 && windKph <= 20) return "pleasant";
    if (tempC >= 15 && tempC <= 30 && humidity <= 75 && windKph <= 30) return "comfortable";
    return "mixed";
  }

  const $ = (id) => document.getElementById(id);
  const form = $("search-form");
  const input = $("city-input");
  const searchButton = $("search-button");
  const status = $("status");
  const weatherSection = $("weather-section");
  const chipsRoot = $("city-chips");
  const rawTab = $("raw-tab");
  const formattedTab = $("formatted-tab");
  const jsonCode = $("json-code");
  const jsonView = $("json-view");
  const copyButton = $("copy-button");
  const responseMeta = $("response-meta");
  const jsonSize = $("json-size");

  let requestSequence = 0;
  let latestRaw = "";
  let latestParsed = null;
  let currentMode = "raw";
  let selectedCity = "";

  function renderChips() {
    chipsRoot.replaceChildren();
    CITIES.forEach((city) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "city-chip";
      button.textContent = city;
      button.setAttribute("aria-pressed", String(city.toLowerCase() === selectedCity.toLowerCase()));
      button.addEventListener("click", () => {
        input.value = city;
        loadWeather(city);
      });
      chipsRoot.appendChild(button);
    });
  }

  function setStatus(message, kind = "") {
    status.textContent = message;
    status.className = `status${kind ? ` ${kind}` : ""}`;
  }

  function safeNumber(value, digits = 0) {
    return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";
  }

  function renderWeather(data) {
    const location = data && data.location;
    const current = data && data.current;
    if (!location || !current) throw new Error("The response did not contain current weather data.");

    $("location-name").textContent = location.name || "Unknown location";
    $("location-subtitle").textContent = [location.region, location.country].filter(Boolean).join(" · ") || "Location details unavailable";
    $("local-time").textContent = location.localtime ? `LOCAL TIME  /  ${location.localtime}` : "LOCAL TIME UNAVAILABLE";
    $("temperature").textContent = safeNumber(current.temp_c);
    $("feels-like").textContent = `${safeNumber(current.feelslike_c)}°C`;
    $("humidity").innerHTML = `${safeNumber(current.humidity)}<small>%</small>`;
    $("wind").innerHTML = `${safeNumber(current.wind_kph)}<small> km/h</small>`;
    $("uv").textContent = safeNumber(current.uv, 1);
    $("cloud").innerHTML = `${safeNumber(current.cloud)}<small>%</small>`;
    $("condition-text").textContent = current.condition && current.condition.text ? current.condition.text : "Condition unavailable";

    const icon = $("condition-icon");
    const iconUrl = current.condition && typeof current.condition.icon === "string" ? current.condition.icon : "";
    if (iconUrl && /^\/\//.test(iconUrl)) {
      icon.src = `https:${iconUrl}`;
      icon.hidden = false;
      icon.alt = current.condition.text || "Weather condition";
    } else {
      icon.removeAttribute("src");
      icon.alt = "";
    }

    const moodKey = calculateMood({
      tempC: current.temp_c,
      humidity: current.humidity,
      windKph: current.wind_kph
    });
    const mood = MOODS[moodKey] || MOODS.mixed;
    $("mood-panel").dataset.mood = moodKey;
    $("mood-title").textContent = mood.title;
    $("mood-description").textContent = mood.description;
    $("updated-at").textContent = current.last_updated ? `UPDATED ${current.last_updated}` : "LIVE FROM WEATHERAPI";
    weatherSection.hidden = false;
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[ch]);
  }

  function highlightJson(source) {
    const escaped = escapeHtml(source);
    return escaped.replace(/("(?:\\.|[^"\\])*"\\s*:)|("(?:\\.|[^"\\])*")|\\b(true|false)\\b|\\b(null)\\b|(-?\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b)/g,
      (token, key, string, bool, nil, number) => {
        if (key) return `<span class="json-key">${key}</span>`;
        if (string) return `<span class="json-string">${string}</span>`;
        if (bool) return `<span class="json-boolean">${bool}</span>`;
        if (nil) return `<span class="json-null">${nil}</span>`;
        if (number) return `<span class="json-number">${number}</span>`;
        return token;
      });
  }

  function renderInspector() {
    if (!latestRaw) return;
    const display = currentMode === "formatted" && latestParsed !== null
      ? JSON.stringify(latestParsed, null, 2)
      : latestRaw;
    jsonCode.innerHTML = latestParsed !== null && currentMode === "formatted"
      ? highlightJson(display)
      : escapeHtml(display);
    responseMeta.textContent = `${latestParsed !== null ? "JSON" : "TEXT"} · ${currentMode.toUpperCase()}`;
    jsonSize.textContent = `${new TextEncoder().encode(latestRaw).length} BYTES`;
    copyButton.disabled = false;
  }

  function setInspectorMode(mode) {
    currentMode = mode;
    rawTab.classList.toggle("active", mode === "raw");
    formattedTab.classList.toggle("active", mode === "formatted");
    rawTab.setAttribute("aria-selected", String(mode === "raw"));
    formattedTab.setAttribute("aria-selected", String(mode === "formatted"));
    renderInspector();
  }

  async function loadWeather(city) {
    const trimmed = String(city || "").trim();
    if (!trimmed) {
      setStatus("Enter a city name before searching.", "error");
      input.focus();
      return;
    }
    if (trimmed.length > 120) {
      setStatus("City names must be 120 characters or fewer.", "error");
      return;
    }

    const sequence = ++requestSequence;
    selectedCity = trimmed;
    renderChips();
    searchButton.disabled = true;
    searchButton.querySelector("span:first-child").textContent = "Searching…";
    setStatus(`Finding current conditions for ${trimmed}…`, "loading");
    responseMeta.textContent = "REQUEST IN PROGRESS";
    try {
      const response = await fetch(`/api/weather?city=${encodeURIComponent(trimmed)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store"
      });
      const raw = await response.text();
      if (sequence !== requestSequence) return;

      latestRaw = raw;
      try { latestParsed = JSON.parse(raw); } catch { latestParsed = null; }
      renderInspector();

      if (!response.ok) {
        const apiMessage = latestParsed && latestParsed.error && latestParsed.error.message;
        const proxyMessage = latestParsed && latestParsed.error && typeof latestParsed.error === "string" ? latestParsed.error : "";
        const message = apiMessage || proxyMessage || `Weather request failed (HTTP ${response.status}).`;
        throw new Error(message);
      }
      if (!latestParsed || !latestParsed.current || !latestParsed.location) {
        throw new Error("The service returned an unexpected response. Inspect the JSON below and retry.");
      }
      renderWeather(latestParsed);
      setStatus(`Showing current conditions for ${latestParsed.location.name || trimmed}.`, "");
    } catch (error) {
      if (sequence !== requestSequence) return;
      setStatus(error instanceof Error ? error.message : "Something went wrong. Please retry.", "error");
    } finally {
      if (sequence === requestSequence) {
        searchButton.disabled = false;
        searchButton.querySelector("span:first-child").textContent = "Find weather";
      }
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    loadWeather(input.value);
  });
  rawTab.addEventListener("click", () => setInspectorMode("raw"));
  formattedTab.addEventListener("click", () => setInspectorMode("formatted"));
  copyButton.addEventListener("click", async () => {
    if (!latestRaw) return;
    const copyText = currentMode === "formatted" && latestParsed !== null
      ? JSON.stringify(latestParsed, null, 2)
      : latestRaw;
    try {
      await navigator.clipboard.writeText(copyText);
      copyButton.innerHTML = "<span aria-hidden='true'>✓</span> Copied";
      window.setTimeout(() => { copyButton.innerHTML = "<span aria-hidden='true'>▢</span> Copy JSON"; }, 1400);
    } catch {
      setStatus("Clipboard access was blocked by your browser. Select the response text and copy it manually.", "error");
    }
  });

  renderChips();
})();