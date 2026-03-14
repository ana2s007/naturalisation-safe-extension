(() => {
  "use strict";

  const CONFIG = {
    HOST: "administration-etrangers-en-france.interieur.gouv.fr",
    PATH_PREFIXES: ["/demarches-en-ligne/naturalisation"],
    API_STEPPER_ENDPOINT: "https://administration-etrangers-en-france.interieur.gouv.fr/api/anf/dossier-stepper",
    API_DOSSIER_ENDPOINT: "https://administration-etrangers-en-france.interieur.gouv.fr/api/anf/usager/dossiers/",
    WAIT_TIME_MS: 150,
    MAX_WAIT_MS: 15000,
    VERSION: "1.1.0-hardened",
    SHOW_SENSITIVE: false
  };

  const IDS = {
    STYLE: "anf-safe-style",
    STATUS_CARD: "anf-safe-status-card",
    DECRET_CARD: "anf-safe-decret-card"
  };

  if (
    location.hostname !== CONFIG.HOST ||
    !CONFIG.PATH_PREFIXES.some(prefix => location.pathname.startsWith(prefix))
  ) return;

  const log = (...args) => console.log("[ANF Hardened]", ...args);

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function waitFor(predicate, maxWaitMs = CONFIG.MAX_WAIT_MS, intervalMs = CONFIG.WAIT_TIME_MS) {
    const started = Date.now();
    while (Date.now() - started < maxWaitMs) {
      const result = predicate();
      if (result) return result;
      await sleep(intervalMs);
    }
    return null;
  }

  function ensureStyle() {
    if (document.getElementById(IDS.STYLE)) return;
    const style = document.createElement("style");
    style.id = IDS.STYLE;
    style.textContent = `
      .anf-step-info {
        display: inline-flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 5px;
        background-color: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 2px 10px;
        margin: 2px 0 2px 6px;
        font-size: 11px;
        color: #475569;
        font-weight: 600;
        white-space: normal;
        line-height: 1.4;
        max-width: 98%;
      }
      .anf-safe-card {
        background: linear-gradient(165deg, #dbe2e9, #ffffff);
        border: 2px solid #255a99;
        border-radius: 8px;
      }
      .anf-safe-small {
        position: absolute;
        top: 1px;
        right: 3px;
        font-size: 8px;
        color: #888;
      }
    `;
    document.head.appendChild(style);
  }

  function formatDate(dateString) {
    if (typeof dateString !== "string") return "";
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return "";
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }

  function daysAgo(dateString) {
    if (typeof dateString !== "string") return "";
    const inputDate = new Date(dateString);
    if (Number.isNaN(inputDate.getTime())) return "";
    const diffInDays = Math.floor((Date.now() - inputDate.getTime()) / 86400000);
    if (diffInDays <= 0) return "aujourd'hui";
    if (diffInDays === 1) return "hier";
    return `il y a ${diffInDays} jrs`;
  }

  async function fetchJson(url) {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  function findDynamicAttr(activeStep) {
    return activeStep?.getAttributeNames().find(name => name.startsWith("_ngcontent-")) || null;
  }

  function maybePlainStatus(statusValue) {
    if (typeof statusValue !== "string") return null;
    const trimmed = statusValue.trim();
    return /^[a-z0-9_]+$/i.test(trimmed) ? trimmed.toLowerCase() : null;
  }

  function safeStatusDescription(status) {
    const map = {
      dossier_depose: "Dossier déposé",
      verification_formelle_en_cours: "Préfecture : Vérification formelle en cours",
      ea_en_attente_ea: "Préfecture : Attente convocation entretien",
      decret_publie: "Décret de naturalisation publié"
    };
    return map[status] || null;
  }

  function createBadge(text, dynamicAttr, className) {
    const span = document.createElement("span");
    if (dynamicAttr) span.setAttribute(dynamicAttr, "");
    span.className = `anf-step-info ${className || ""}`.trim();
    span.textContent = text;
    return span;
  }

  function createStatusCard(dynamicAttr, title, subtitle, note) {
    if (document.getElementById(IDS.STATUS_CARD)) return null;

    const li = document.createElement("li");
    li.id = IDS.STATUS_CARD;
    li.className = "itemFrise active ng-star-inserted anf-safe-card";
    if (dynamicAttr) li.setAttribute(dynamicAttr, "");

    const wrap = document.createElement("div");
    wrap.className = "itemFriseContent";
    wrap.style.position = "relative";
    if (dynamicAttr) wrap.setAttribute(dynamicAttr, "");

    const version = document.createElement("span");
    version.className = "anf-safe-small";
    version.textContent = `v${CONFIG.VERSION}`;

    const p = document.createElement("p");
    if (dynamicAttr) p.setAttribute(dynamicAttr, "");
    p.appendChild(document.createTextNode(title));
    if (subtitle) {
      const s = document.createElement("span");
      s.style.color = "#bf2626";
      s.textContent = ` (${subtitle})`;
      p.appendChild(s);
    }
    if (note) {
      p.appendChild(document.createElement("br"));
      p.appendChild(document.createTextNode(note));
    }

    wrap.appendChild(version);
    wrap.appendChild(p);
    li.appendChild(wrap);
    return li;
  }

  function findStepParagraphByLabel(labels) {
    const normalized = labels.map(v => v.trim().toLowerCase());
    const candidates = Array.from(document.querySelectorAll("li.itemFrise p"));
    return candidates.find(el => {
      const txt = (el.childNodes[0]?.textContent || el.textContent || "").trim().toLowerCase();
      return normalized.includes(txt);
    }) || null;
  }

  function appendInfo(labels, text, className, dynamicAttr, multiline = false) {
    const pEl = findStepParagraphByLabel(labels);
    if (!pEl || pEl.querySelector(`.${className}`)) return false;
    if (multiline) pEl.appendChild(document.createElement("br"));
    pEl.appendChild(createBadge(text, dynamicAttr, className));
    return true;
  }

  async function run() {
    ensureStyle();

    let activeStep = document.querySelector("li.itemFrise.active");
    if (!activeStep) {
      const tab = await waitFor(() =>
        Array.from(document.querySelectorAll('a[role="tab"]'))
          .find(el => (el.textContent || "").trim() === "Demande d'accès à la Nationalité Française")
      );
      if (tab) tab.click();
      activeStep = await waitFor(() => document.querySelector("li.itemFrise.active"));
    }

    if (!activeStep) return;

    const dynamicAttr = findDynamicAttr(activeStep);
    const stepper = await fetchJson(CONFIG.API_STEPPER_ENDPOINT);
    const dossier = stepper?.dossier;
    if (!dossier?.id) return;

    const plainStatus = maybePlainStatus(dossier.statut);
    const statusLabel = safeStatusDescription(plainStatus);

    const title = statusLabel || "Statut indisponible";
    const note = statusLabel
      ? `Depuis le ${formatDate(dossier.date_statut)}`
      : "Le statut retourné n'est pas exploité localement dans cette version.";

    const card = createStatusCard(dynamicAttr, title, daysAgo(dossier.date_statut), note);
    if (card && activeStep.parentNode) {
      activeStep.parentNode.insertBefore(card, activeStep.nextSibling);
    }

    appendInfo(["demande envoyée", "dossier déposé"], "Date disponible", "anf-demande-date", dynamicAttr);
  }

  run().catch(err => log("Erreur:", err));
})();