/**
 * Copyright 2026 Daniela Petruzalek
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

(() => {
  const COUNSELOR_IDS = ["plato", "descartes", "machiavelli"];
  const COUNSELOR_SET = new Set(COUNSELOR_IDS);

  const COUNSELOR_META = {
    plato: {
      name: "Plato",
      subtitle: "Athens · Idealism",
      avatarSrc: "/static/avatars/plato.jpg",
    },
    descartes: {
      name: "Rene Descartes",
      subtitle: "Touraine · Rationalism",
      avatarSrc: "/static/avatars/descartes.jpg",
    },
    machiavelli: {
      name: "Niccolo Machiavelli",
      subtitle: "Florence · Political Realism",
      avatarSrc: "/static/avatars/machiavelli.jpg",
    },
    facilitator: {
      name: "The Facilitator",
      subtitle: "Master of Ceremonies",
      avatarSrc: "/static/avatars/facilitator.jpg",
    },
  };

  const SANITIZER_ELEMENTS = [
    "p",
    "strong",
    "em",
    "code",
    "pre",
    "ul",
    "ol",
    "li",
    "blockquote",
    "br",
  ];
  const SANITIZER_ELEMENT_SET = new Set(SANITIZER_ELEMENTS);
  const SANITIZER_ATTRIBUTES = ["class"];

  // DOM References
  const armorShieldEl = document.getElementById("armor-shield");
  const armorShieldTextEl = document.getElementById("armor-shield-text");
  const apiTargetPillEl = document.getElementById("api-target-pill");
  const toggleAccordionsBtn = document.getElementById("toggle-accordions-btn");
  const newSessionBtn = document.getElementById("new-session-btn");
  const devUiLinkEl = document.getElementById("dev-ui-link");

  const stageEl = document.getElementById("amphitheater-stage");
  const wave3LabelEl = document.getElementById("wave-3-label");
  const sessionBadgeEl = document.getElementById("session-badge");
  const elapsedTimerEl = document.getElementById("elapsed-timer");

  const seatEls = {
    plato: document.getElementById("seat-plato"),
    descartes: document.getElementById("seat-descartes"),
    machiavelli: document.getElementById("seat-machiavelli"),
    facilitator: document.getElementById("seat-facilitator"),
  };

  const formEl = document.getElementById("council-form");
  const promptInputEl = document.getElementById("prompt-input");
  const submitBtnEl = document.getElementById("submit-btn");
  const submitBtnTextEl = document.getElementById("submit-btn-text");

  const errorBannerEl = document.getElementById("error-banner");
  const errorBannerMsgEl = document.getElementById("error-banner-message");
  const errorDismissBtn = document.getElementById("error-dismiss-btn");

  const streamEl = document.getElementById("deliberation-stream");
  const emptyChamberEl = document.getElementById("empty-chamber");

  // Runtime State
  const userId = createUserId();
  let apiBase = "";
  let activeSessionId = null;
  let isStreaming = false;
  let activeAbortController = null;
  let timerIntervalId = null;
  let turnStartPerfMs = 0;

  function createUserId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return "chamber-" + window.crypto.randomUUID().slice(0, 8);
    }
    return "chamber-" + Math.random().toString(36).slice(2, 10);
  }

  function resolveApiBase() {
    const params = new URLSearchParams(window.location.search);
    const rawApi = params.get("api");
    if (!rawApi) {
      return "";
    }
    const trimmed = rawApi.trim().replace(/\/+$/, "");
    if (!/^https?:\/\/[^/\s]+/i.test(trimmed)) {
      throw new Error(
        `Invalid ?api query parameter "${rawApi}". Expected an explicit http:// or https:// origin.`
      );
    }
    return trimmed;
  }

  // Strict HTML Sanitization & Markdown Rendering
  function escapeHtmlEntities(raw) {
    return String(raw)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatInlineMarkdown(escapedLine) {
    const codeTokens = [];
    let processed = escapedLine.replace(/`([^`]+)`/g, (_match, codeBody) => {
      const idx = codeTokens.length;
      codeTokens.push(`<code>${codeBody}</code>`);
      return `\u0000CODE${idx}\u0000`;
    });

    processed = processed.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    processed = processed.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    processed = processed.replace(
      /(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g,
      "$1<em>$2</em>"
    );

    processed = processed.replace(/\u0000CODE(\d+)\u0000/g, (_m, idxStr) => {
      return codeTokens[Number(idxStr)] ?? "";
    });
    return processed;
  }

  function markdownToHtml(markdownText) {
    const normalized = String(markdownText ?? "").replace(/\r\n/g, "\n").trim();
    if (!normalized) {
      return "<p></p>";
    }

    const lines = normalized.split("\n");
    const blocks = [];
    let idx = 0;

    while (idx < lines.length) {
      const rawLine = lines[idx];
      const trimmed = rawLine.trim();

      if (!trimmed) {
        idx += 1;
        continue;
      }

      if (trimmed.startsWith("```")) {
        idx += 1;
        const codeLines = [];
        while (idx < lines.length && !lines[idx].trim().startsWith("```")) {
          codeLines.push(escapeHtmlEntities(lines[idx]));
          idx += 1;
        }
        if (idx < lines.length) {
          idx += 1;
        }
        blocks.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
        continue;
      }

      const headingMatch = trimmed.match(/^#{1,6}\s+(.+)$/);
      if (headingMatch) {
        const cleanHeading = headingMatch[1].replace(/^\*\*(.+)\*\*$/, "$1");
        blocks.push(
          `<p class="prose-heading"><strong>${formatInlineMarkdown(
            escapeHtmlEntities(cleanHeading)
          )}</strong></p>`
        );
        idx += 1;
        continue;
      }

      if (trimmed.startsWith(">")) {
        const quoteLines = [];
        while (idx < lines.length && lines[idx].trim().startsWith(">")) {
          const stripped = lines[idx].trim().replace(/^>\s?/, "");
          quoteLines.push(formatInlineMarkdown(escapeHtmlEntities(stripped)));
          idx += 1;
        }
        blocks.push(`<blockquote><p>${quoteLines.join("<br>")}</p></blockquote>`);
        continue;
      }

      if (/^[-*]\s+/.test(trimmed)) {
        const items = [];
        while (idx < lines.length && /^[-*]\s+/.test(lines[idx].trim())) {
          const itemBody = lines[idx].trim().replace(/^[-*]\s+/, "");
          items.push(`<li>${formatInlineMarkdown(escapeHtmlEntities(itemBody))}</li>`);
          idx += 1;
        }
        blocks.push(`<ul>${items.join("")}</ul>`);
        continue;
      }

      if (/^\d+\.\s+/.test(trimmed)) {
        const items = [];
        while (idx < lines.length && /^\d+\.\s+/.test(lines[idx].trim())) {
          const itemBody = lines[idx].trim().replace(/^\d+\.\s+/, "");
          items.push(`<li>${formatInlineMarkdown(escapeHtmlEntities(itemBody))}</li>`);
          idx += 1;
        }
        blocks.push(`<ol>${items.join("")}</ol>`);
        continue;
      }

      const paraLines = [];
      while (
        idx < lines.length &&
        lines[idx].trim() !== "" &&
        !lines[idx].trim().startsWith("```") &&
        !lines[idx].trim().startsWith(">") &&
        !/^#{1,6}\s+/.test(lines[idx].trim()) &&
        !/^[-*]\s+/.test(lines[idx].trim()) &&
        !/^\d+\.\s+/.test(lines[idx].trim())
      ) {
        paraLines.push(formatInlineMarkdown(escapeHtmlEntities(lines[idx].trim())));
        idx += 1;
      }
      blocks.push(`<p>${paraLines.join("<br>")}</p>`);
    }

    return blocks.join("");
  }

  function setSafeHTML(targetEl, htmlString) {
    if ("setHTML" in Element.prototype && typeof targetEl.setHTML === "function") {
      targetEl.setHTML(htmlString, {
        sanitizer: {
          elements: SANITIZER_ELEMENTS,
          attributes: SANITIZER_ATTRIBUTES,
        },
      });
      return;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");
    const fragment = document.createDocumentFragment();

    function sanitizeNode(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        return document.createTextNode(node.textContent ?? "");
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return null;
      }
      const tag = node.tagName.toLowerCase();
      if (!SANITIZER_ELEMENT_SET.has(tag)) {
        return null;
      }
      const cleanEl = document.createElement(tag);
      if (node.hasAttribute("class")) {
        const cls = node.getAttribute("class");
        if (cls) {
          cleanEl.setAttribute("class", cls);
        }
      }
      for (const child of node.childNodes) {
        const sanitizedChild = sanitizeNode(child);
        if (sanitizedChild !== null) {
          cleanEl.appendChild(sanitizedChild);
        }
      }
      return cleanEl;
    }

    for (const child of doc.body.childNodes) {
      const sanitizedChild = sanitizeNode(child);
      if (sanitizedChild !== null) {
        fragment.appendChild(sanitizedChild);
      }
    }
    targetEl.replaceChildren(fragment);
  }

  function updateRichProseElement(proseEl, markdownText) {
    setSafeHTML(proseEl, markdownToHtml(markdownText));
  }

  function createRichProseElement(markdownText) {
    const container = document.createElement("div");
    container.className = "rich-prose";
    updateRichProseElement(container, markdownText);
    return container;
  }

  function createAvatarImg(counselorKey) {
    const meta = COUNSELOR_META[counselorKey] ?? COUNSELOR_META.facilitator;
    const img = document.createElement("img");
    img.className = "card-avatar";
    img.src = meta.avatarSrc;
    img.alt = `${meta.name} portrait`;
    img.width = 32;
    img.height = 32;
    img.decoding = "async";
    return img;
  }

  // Error Banner Helpers
  function showError(message) {
    errorBannerMsgEl.textContent = String(message);
    errorBannerEl.hidden = false;
  }

  function clearError() {
    errorBannerEl.hidden = true;
    errorBannerMsgEl.textContent = "";
  }

  // Timer Helpers
  function startElapsedTimer() {
    stopElapsedTimer();
    turnStartPerfMs = performance.now();
    elapsedTimerEl.textContent = "0.0s";
    timerIntervalId = window.setInterval(() => {
      const elapsedSec = (performance.now() - turnStartPerfMs) / 1000;
      elapsedTimerEl.textContent = `${elapsedSec.toFixed(1)}s`;
    }, 100);
  }

  function stopElapsedTimer() {
    if (timerIntervalId !== null) {
      window.clearInterval(timerIntervalId);
      timerIntervalId = null;
    }
  }

  function currentElapsedLabel() {
    if (!turnStartPerfMs) {
      return "0.0s";
    }
    const sec = (performance.now() - turnStartPerfMs) / 1000;
    return `${sec.toFixed(1)}s`;
  }

  // Amphitheater Stage State Helpers
  function setArmorShieldState(isBlocked) {
    if (isBlocked) {
      armorShieldEl.dataset.armorState = "blocked";
      armorShieldTextEl.textContent = "Model Armor: Threat Intercepted";
    } else {
      armorShieldEl.dataset.armorState = "active";
      armorShieldTextEl.textContent = "Model Armor: Fail-Closed Active";
    }
  }

  function setSeatState(seatKey, stateKind, statusLabel, spotlight = false) {
    const seatEl = seatEls[seatKey];
    if (!seatEl) {
      return;
    }
    seatEl.dataset.state = stateKind;
    seatEl.dataset.spotlight = spotlight ? "true" : "false";
    const pill = seatEl.querySelector('[data-role="seat-status"]');
    if (pill) {
      pill.textContent = statusLabel;
    }
  }

  function clearAllSpotlights() {
    for (const key of Object.keys(seatEls)) {
      seatEls[key].dataset.spotlight = "false";
    }
  }

  function setWaveStepState(waveNum, stepState) {
    const stepEl = stageEl.querySelector(`.wave-step[data-wave="${waveNum}"]`);
    if (stepEl) {
      stepEl.dataset.stepState = stepState;
    }
  }

  function resetStageToIdle() {
    stageEl.dataset.stagePhase = "idle";
    wave3LabelEl.textContent = "3. Cross-Rebuttals";
    for (let w = 1; w <= 4; w += 1) {
      setWaveStepState(w, "idle");
    }
    for (const key of Object.keys(seatEls)) {
      setSeatState(key, "idle", "Idle", false);
    }
  }

  function setFormBusy(busy) {
    isStreaming = busy;
    submitBtnEl.disabled = busy;
    promptInputEl.disabled = busy;
    submitBtnTextEl.textContent = busy ? "Deliberating..." : "Convene Council";
  }

  // Accordion Synchronization
  function getDebateAccordions() {
    return Array.from(document.querySelectorAll("details.debate-accordion"));
  }

  function syncAccordionButton() {
    const accordions = getDebateAccordions();
    if (accordions.length === 0) {
      toggleAccordionsBtn.setAttribute("aria-expanded", "true");
      toggleAccordionsBtn.textContent = "Collapse All";
      return;
    }
    const anyOpen = accordions.some((item) => item.open);
    toggleAccordionsBtn.setAttribute("aria-expanded", anyOpen ? "true" : "false");
    toggleAccordionsBtn.textContent = anyOpen ? "Collapse All" : "Expand All";
  }

  // Card Builders
  function createAccordionSection(labelText, initialMetaText) {
    const detailsEl = document.createElement("details");
    detailsEl.className = "debate-accordion stream-card";
    detailsEl.open = true;

    const summaryEl = document.createElement("summary");
    const labelSpan = document.createElement("span");
    labelSpan.className = "summary-label";
    labelSpan.textContent = labelText;

    const metaSpan = document.createElement("span");
    metaSpan.className = "summary-meta";
    metaSpan.textContent = initialMetaText;

    summaryEl.append(labelSpan, metaSpan);

    const contentEl = document.createElement("div");
    contentEl.className = "accordion-content";

    detailsEl.append(summaryEl, contentEl);
    return { detailsEl, contentEl, metaSpan };
  }

  function buildFacilitatorFramingCard(framingText, arrivalTime) {
    const card = document.createElement("div");
    card.className = "framed-card stream-card";

    const headerRow = document.createElement("div");
    headerRow.className = "card-header-row";

    const badge = document.createElement("span");
    badge.className = "speaker-badge";
    badge.appendChild(createAvatarImg("facilitator"));
    const badgeName = document.createElement("span");
    badgeName.textContent = "The Facilitator · Dilemma Framing";
    badge.appendChild(badgeName);

    const timePill = document.createElement("span");
    timePill.className = "arrival-pill";
    timePill.textContent = `+${arrivalTime}`;
    headerRow.append(badge, timePill);

    card.append(headerRow, createRichProseElement(framingText));
    return card;
  }

  function ordinalLabel(n) {
    if (n === 1) {
      return "1st";
    }
    if (n === 2) {
      return "2nd";
    }
    if (n === 3) {
      return "3rd";
    }
    return `${n}th`;
  }

  function createStreamingCounselorCard({ counselor, speechNum, orderIndex, arrivalTime, streaming }) {
    const key = COUNSELOR_META[counselor] ? counselor : "plato";
    const meta = COUNSELOR_META[key];

    const cardEl = document.createElement("article");
    cardEl.className = streaming
      ? "counselor-card stream-card is-streaming"
      : "counselor-card stream-card";
    cardEl.dataset.counselor = key;

    const headerRow = document.createElement("div");
    headerRow.className = "card-header-row";

    const badge = document.createElement("span");
    badge.className = "speaker-badge";
    badge.appendChild(createAvatarImg(key));
    const nameText = document.createElement("span");
    nameText.textContent = meta.name;
    badge.appendChild(nameText);

    const arrivalPill = document.createElement("span");
    arrivalPill.className = "arrival-pill";
    arrivalPill.textContent = streaming
      ? `${ordinalLabel(orderIndex)} · Streaming...`
      : `${ordinalLabel(orderIndex)} · +${arrivalTime}`;

    headerRow.append(badge, arrivalPill);

    const proseEl = createRichProseElement("");
    cardEl.append(headerRow, proseEl);

    return {
      cardEl,
      proseEl,
      arrivalPill,
      counselor: key,
      speechNum,
      orderIndex,
      buffer: "",
      finalized: !streaming,
    };
  }

  function createStreamingDirectCard(arrivalTime, streaming) {
    const cardEl = document.createElement("div");
    cardEl.className = streaming
      ? "direct-card stream-card is-streaming"
      : "direct-card stream-card";

    const headerRow = document.createElement("div");
    headerRow.className = "card-header-row";

    const badge = document.createElement("span");
    badge.className = "speaker-badge";
    badge.appendChild(createAvatarImg("facilitator"));
    const label = document.createElement("span");
    label.textContent = "The Facilitator · Master of Ceremonies";
    badge.appendChild(label);

    const metaPill = document.createElement("span");
    metaPill.className = "arrival-pill";
    metaPill.textContent = streaming ? "Streaming..." : `Direct Reply · +${arrivalTime}`;

    headerRow.append(badge, metaPill);

    const proseEl = createRichProseElement("");
    cardEl.append(headerRow, proseEl);

    return {
      kind: "direct",
      cardEl,
      proseEl,
      metaPill,
      headlineEl: null,
      buffer: "",
      finalized: !streaming,
    };
  }

  function parseVerdictHeadlineAndBody(markdownText) {
    const normalized = String(markdownText ?? "").replace(/\r\n/g, "\n").trim();
    const lines = normalized.split("\n");
    if (lines.length === 0) {
      return { headline: "Council Verdict", body: "" };
    }

    const firstLine = lines[0].trim();
    const headingMatch = firstLine.match(
      /^#{1,3}\s*(?:Council\s+(?:Synthesis|Verdict)\s*:\s*)?(.+)$/i
    );
    if (headingMatch) {
      const headline = headingMatch[1].replace(/^\*\*(.+)\*\*$/, "$1").trim();
      const body = lines.slice(1).join("\n").trim();
      return {
        headline: headline || "Council Verdict",
        body,
      };
    }

    return {
      headline: "Council Synthesis Verdict",
      body: normalized,
    };
  }

  function createStreamingVerdictCard(arrivalTime, streaming) {
    const cardEl = document.createElement("section");
    cardEl.className = streaming
      ? "verdict-card stream-card is-streaming"
      : "verdict-card stream-card";
    cardEl.setAttribute("aria-label", "Council Synthesis Verdict");

    const topRow = document.createElement("div");
    topRow.className = "card-header-row";

    const kicker = document.createElement("span");
    kicker.className = "verdict-kicker";
    kicker.appendChild(createAvatarImg("facilitator"));
    const kickerText = document.createElement("span");
    kickerText.textContent = "Council Synthesis Verdict";
    kicker.appendChild(kickerText);

    const metaPill = document.createElement("span");
    metaPill.className = "arrival-pill";
    metaPill.textContent = streaming ? "Synthesizing..." : `Completed in ${arrivalTime}`;
    topRow.append(kicker, metaPill);

    const headlineEl = document.createElement("h2");
    headlineEl.className = "verdict-headline";
    headlineEl.textContent = "Synthesizing Council Verdict...";

    const verdictBox = document.createElement("div");
    verdictBox.className = "verdict-body-box";
    const proseEl = createRichProseElement("");
    verdictBox.appendChild(proseEl);

    cardEl.append(topRow, headlineEl, verdictBox);

    return {
      kind: "verdict",
      cardEl,
      proseEl,
      metaPill,
      headlineEl,
      buffer: "",
      finalized: !streaming,
    };
  }

  function renderFacilitatorCardBuffer(fCard, timeLabel, finalize) {
    if (fCard.kind === "verdict") {
      const { headline, body } = parseVerdictHeadlineAndBody(fCard.buffer);
      fCard.headlineEl.textContent = headline;
      updateRichProseElement(fCard.proseEl, body || (finalize ? headline : ""));
      fCard.metaPill.textContent = finalize ? `Completed in ${timeLabel}` : "Synthesizing...";
    } else {
      updateRichProseElement(fCard.proseEl, fCard.buffer);
      fCard.metaPill.textContent = finalize ? `Direct Reply · +${timeLabel}` : "Streaming...";
    }

    if (finalize) {
      fCard.cardEl.classList.remove("is-streaming");
      fCard.finalized = true;
    }
  }

  function buildBlockedCard(refusalText, arrivalTime) {
    const card = document.createElement("div");
    card.className = "armor-blocked-card stream-card";

    const header = document.createElement("div");
    header.className = "armor-blocked-header";
    const blockedTpl = document.getElementById("tpl-emblem-blocked");
    if (blockedTpl instanceof HTMLTemplateElement) {
      header.appendChild(blockedTpl.content.cloneNode(true));
    }
    const titleSpan = document.createElement("span");
    titleSpan.textContent = `Model Armor Shield Alert (+${arrivalTime})`;
    header.appendChild(titleSpan);

    const refusalProse = createRichProseElement(
      refusalText || "Request or response blocked by Google Cloud Model Armor fail-closed screening."
    );

    const note = document.createElement("p");
    note.className = "armor-blocked-note";
    note.textContent =
      "Google Cloud Model Armor intercepted unsafe or adversarial content and halted the deliberation.";

    card.append(header, refusalProse, note);
    return card;
  }

  // ADK Session & SSE Client
  async function ensureAdkSession(signal) {
    if (activeSessionId) {
      return activeSessionId;
    }

    const endpoint = `${apiBase}/apps/council_of_ancients/users/${encodeURIComponent(userId)}/sessions`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: "{}",
      signal,
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(
        `Failed to create ADK session (HTTP ${response.status}): ${errBody || response.statusText}`
      );
    }

    const sessionData = await response.json();
    if (!sessionData || typeof sessionData.id !== "string" || !sessionData.id.trim()) {
      throw new Error("ADK session endpoint returned payload without a valid session id.");
    }

    activeSessionId = sessionData.id;
    sessionBadgeEl.textContent = `Session: ${activeSessionId.slice(0, 8)}`;
    return activeSessionId;
  }

  function inspectEventParts(adkEvent) {
    const parts = Array.isArray(adkEvent?.content?.parts) ? adkEvent.content.parts : [];
    const functionCalls = [];
    const functionResponses = [];
    const rawTextChunks = [];

    for (const part of parts) {
      if (!part || typeof part !== "object") {
        continue;
      }
      const fc = part.functionCall ?? part.function_call;
      if (fc && typeof fc === "object" && typeof fc.name === "string") {
        functionCalls.push(fc);
      }
      const fr = part.functionResponse ?? part.function_response;
      if (fr && typeof fr === "object" && typeof fr.name === "string") {
        functionResponses.push(fr);
      }
      if (typeof part.text === "string" && !part.thought && part.text.length > 0) {
        rawTextChunks.push(part.text);
      }
    }

    return {
      functionCalls,
      functionResponses,
      rawText: rawTextChunks.join(""),
    };
  }

  function createTurnDom(promptText) {
    emptyChamberEl.hidden = true;

    const turnEl = document.createElement("article");
    turnEl.className = "deliberation-turn stream-card";

    const qBar = document.createElement("div");
    qBar.className = "user-question-bar";

    const qCopy = document.createElement("div");
    const qTag = document.createElement("span");
    qTag.className = "user-question-tag";
    qTag.textContent = "Question Before the Council";
    const qText = document.createElement("p");
    qText.className = "user-question-text";
    qText.textContent = promptText;
    qCopy.append(qTag, qText);

    qBar.appendChild(qCopy);

    const verdictSlot = document.createElement("div");
    verdictSlot.className = "turn-verdict-slot";

    const wavesStack = document.createElement("div");
    wavesStack.className = "turn-waves-stack";

    turnEl.append(qBar, verdictSlot, wavesStack);
    streamEl.appendChild(turnEl);

    return {
      turnEl,
      verdictSlot,
      wavesStack,
      seenFunctionCallKeys: new Set(),
      seenFunctionResponseKeys: new Set(),
      callCount: { plato: 0, descartes: 0, machiavelli: 0 },
      speechCount: { plato: 0, descartes: 0, machiavelli: 0 },
      pendingCallsCount: 0,
      totalCounselorSpeeches: 0,
      counselorStreamCards: new Map(),
      openUnbranchedKey: { plato: null, descartes: null, machiavelli: null },
      facilitatorStreamCard: null,
      framingRendered: false,
      openingAccordion: null,
      openingGrid: null,
      openingCount: 0,
      rebuttalAccordions: new Map(),
      rebuttalCounts: new Map(),
      handledEventsCount: 0,
      blockedHalted: false,
    };
  }

  function cleanupUnfinalizedStreamsOnBlock(turnCtx) {
    for (const [key, cardState] of turnCtx.counselorStreamCards.entries()) {
      if (!cardState.finalized) {
        cardState.cardEl.remove();
        turnCtx.counselorStreamCards.delete(key);
      } else {
        cardState.cardEl.classList.remove("is-streaming");
      }
    }
    if (turnCtx.facilitatorStreamCard) {
      if (!turnCtx.facilitatorStreamCard.finalized) {
        turnCtx.facilitatorStreamCard.cardEl.remove();
        turnCtx.facilitatorStreamCard = null;
      } else {
        turnCtx.facilitatorStreamCard.cardEl.classList.remove("is-streaming");
      }
    }
  }

  function ensureCounselorCardState(turnCtx, { streamKey, counselor, arrivalTime, isPartial }) {
    const existing = turnCtx.counselorStreamCards.get(streamKey);
    if (existing) {
      return existing;
    }

    turnCtx.speechCount[counselor] = (turnCtx.speechCount[counselor] ?? 0) + 1;
    turnCtx.totalCounselorSpeeches += 1;
    const speechNum = turnCtx.speechCount[counselor];

    let targetGrid;
    let orderIndex;

    if (speechNum === 1) {
      setWaveStepState(1, "complete");
      setWaveStepState(2, "active");

      if (!turnCtx.openingAccordion) {
        const acc = createAccordionSection("Wave 2 · Opening Statements", "0 / 3 Spoke");
        const grid = document.createElement("div");
        grid.className = "counselor-cards-grid";
        acc.contentEl.appendChild(grid);
        turnCtx.openingAccordion = acc;
        turnCtx.openingGrid = grid;
        turnCtx.wavesStack.appendChild(acc.detailsEl);
      }

      turnCtx.openingCount += 1;
      orderIndex = turnCtx.openingCount;
      turnCtx.openingAccordion.metaSpan.textContent = `${orderIndex} / 3 Spoke`;
      targetGrid = turnCtx.openingGrid;
    } else {
      const rebuttalRound = speechNum - 1;
      setWaveStepState(2, "complete");
      setWaveStepState(3, "active");

      if (!turnCtx.rebuttalAccordions.has(rebuttalRound)) {
        const title =
          rebuttalRound === 1
            ? "Wave 3 · Cross-Rebuttals"
            : `Wave 3 · Cross-Rebuttals (Round ${rebuttalRound})`;
        const acc = createAccordionSection(title, "0 / 3 Spoke");
        const grid = document.createElement("div");
        grid.className = "counselor-cards-grid";
        acc.contentEl.appendChild(grid);
        turnCtx.rebuttalAccordions.set(rebuttalRound, { acc, grid });
        turnCtx.wavesStack.appendChild(acc.detailsEl);
      }

      orderIndex = (turnCtx.rebuttalCounts.get(rebuttalRound) ?? 0) + 1;
      turnCtx.rebuttalCounts.set(rebuttalRound, orderIndex);
      const bundle = turnCtx.rebuttalAccordions.get(rebuttalRound);
      bundle.acc.metaSpan.textContent = `${orderIndex} / 3 Spoke`;
      targetGrid = bundle.grid;
    }

    const cardState = createStreamingCounselorCard({
      counselor,
      speechNum,
      orderIndex,
      arrivalTime,
      streaming: isPartial,
    });

    targetGrid.appendChild(cardState.cardEl);
    turnCtx.counselorStreamCards.set(streamKey, cardState);
    syncAccordionButton();
    return cardState;
  }

  function handleStreamEvent(adkEvent, turnCtx) {
    if (!adkEvent || typeof adkEvent !== "object") {
      throw new Error("Received empty or non-object event payload from /run_sse.");
    }

    if (turnCtx.blockedHalted) {
      return;
    }

    if (adkEvent.error) {
      const detail =
        typeof adkEvent.error === "string" ? adkEvent.error : JSON.stringify(adkEvent.error);
      throw new Error(`ADK stream error: ${detail}`);
    }

    const errCode = adkEvent.errorCode ?? adkEvent.error_code;
    const errMsg = adkEvent.errorMessage ?? adkEvent.error_message;
    if (errCode || errMsg) {
      throw new Error(
        `Agent execution error (${errCode || "ERROR"}): ${errMsg || "Unknown failure"}`
      );
    }

    const meta = adkEvent.customMetadata ?? adkEvent.custom_metadata ?? {};
    const author = typeof adkEvent.author === "string" ? adkEvent.author : "";
    const isPartial = adkEvent.partial === true;
    const { functionCalls, functionResponses, rawText } = inspectEventParts(adkEvent);
    const trimmedText = rawText.trim();
    const arrivalTime = currentElapsedLabel();

    // 1. Model Armor Fail-Closed Block on Prompt or Sub-Agent Response
    if (meta.model_armor_blocked === true) {
      turnCtx.blockedHalted = true;
      turnCtx.handledEventsCount += 1;
      stopElapsedTimer();
      cleanupUnfinalizedStreamsOnBlock(turnCtx);
      setArmorShieldState(true);
      clearAllSpotlights();

      if (author && seatEls[author]) {
        for (const key of Object.keys(seatEls)) {
          if (key === author) {
            setSeatState(key, "blocked", "Blocked by Model Armor", true);
          } else if (seatEls[key].dataset.state === "working") {
            setSeatState(key, "idle", "Idle", false);
          }
        }
      } else {
        let marked = false;
        for (const key of Object.keys(seatEls)) {
          if (seatEls[key].dataset.state === "working") {
            setSeatState(key, "blocked", "Blocked by Model Armor", true);
            marked = true;
          }
        }
        if (!marked) {
          setSeatState("facilitator", "blocked", "Blocked by Model Armor", true);
        }
      }

      for (let w = 1; w <= 4; w += 1) {
        const stepEl = stageEl.querySelector(`.wave-step[data-wave="${w}"]`);
        if (stepEl && stepEl.dataset.stepState === "active") {
          stepEl.dataset.stepState = "blocked";
        }
      }

      turnCtx.verdictSlot.appendChild(buildBlockedCard(trimmedText, arrivalTime));
      syncAccordionButton();
      return;
    }

    const isFacilitator = author === "facilitator" || author === "council_of_ancients";

    // 2. Facilitator Invoking Counselor Sub-Agents in Parallel (deduplicated by fc.id)
    const counselorCalls = functionCalls.filter((fc) => COUNSELOR_SET.has(fc.name));
    if (isFacilitator && counselorCalls.length > 0) {
      turnCtx.handledEventsCount += 1;

      let priorStreamedIntro = "";
      if (turnCtx.facilitatorStreamCard && !turnCtx.facilitatorStreamCard.finalized) {
        priorStreamedIntro = turnCtx.facilitatorStreamCard.buffer.trim();
        turnCtx.facilitatorStreamCard.cardEl.remove();
        turnCtx.facilitatorStreamCard = null;
      }

      const newCounselorCalls = [];
      let firstOpeningRequest = "";

      for (const fc of counselorCalls) {
        const reqText =
          typeof fc.args?.request === "string" ? fc.args.request.trim() : "";
        if (reqText && !firstOpeningRequest && (turnCtx.callCount[fc.name] ?? 0) <= 1) {
          firstOpeningRequest = reqText;
        }

        const fcKey =
          typeof fc.id === "string" && fc.id
            ? fc.id
            : `${author}:${fc.name}:${JSON.stringify(fc.args ?? {})}`;
        if (turnCtx.seenFunctionCallKeys.has(fcKey)) {
          continue;
        }
        turnCtx.seenFunctionCallKeys.add(fcKey);
        newCounselorCalls.push(fc);
      }

      if (newCounselorCalls.length > 0) {
        clearAllSpotlights();
        setSeatState("facilitator", "spoke", "Spoke", false);

        for (const fc of newCounselorCalls) {
          const name = fc.name;
          turnCtx.callCount[name] = (turnCtx.callCount[name] ?? 0) + 1;
          turnCtx.pendingCallsCount += 1;
          const roundNum = turnCtx.callCount[name];

          if (roundNum === 1) {
            setWaveStepState(1, "complete");
            setWaveStepState(2, "active");
            setSeatState(name, "working", "Writing Opening...", false);
          } else {
            const rebuttalRound = roundNum - 1;
            if (rebuttalRound > 1) {
              wave3LabelEl.textContent = `3. Cross-Rebuttals (R${rebuttalRound})`;
            }
            setWaveStepState(1, "complete");
            setWaveStepState(2, "complete");
            setWaveStepState(3, "active");
            setWaveStepState(4, "idle");
            setSeatState(name, "working", "Crafting Rebuttal...", false);
          }
        }
      }

      const maxCallsSoFar = Math.max(0, ...Object.values(turnCtx.callCount));
      const framingSource = priorStreamedIntro || trimmedText || firstOpeningRequest;
      if (!turnCtx.framingRendered && maxCallsSoFar <= 1 && framingSource) {
        const acc = createAccordionSection("Wave 1 · Facilitator Framing", "Screened");
        acc.contentEl.appendChild(buildFacilitatorFramingCard(framingSource, arrivalTime));
        turnCtx.wavesStack.appendChild(acc.detailsEl);
        turnCtx.framingRendered = true;
        syncAccordionButton();
      }
      return;
    }

    // 3. Individual Counselor Live Token Stream & Final Speech
    if (COUNSELOR_SET.has(author) && rawText.length > 0) {
      const explicitBranch =
        typeof adkEvent.branch === "string" && adkEvent.branch.trim()
          ? adkEvent.branch.trim()
          : "";

      let streamKey = explicitBranch;
      if (!streamKey) {
        if (turnCtx.openUnbranchedKey[author]) {
          streamKey = turnCtx.openUnbranchedKey[author];
        } else {
          const nextIdx = (turnCtx.speechCount[author] ?? 0) + 1;
          streamKey = `${author}:${nextIdx}`;
        }
      }

      let cardState = turnCtx.counselorStreamCards.get(streamKey);
      if (!cardState && !trimmedText) {
        return;
      }

      turnCtx.handledEventsCount += 1;
      if (!cardState) {
        cardState = ensureCounselorCardState(turnCtx, {
          streamKey,
          counselor: author,
          arrivalTime,
          isPartial,
        });
        if (!explicitBranch && isPartial) {
          turnCtx.openUnbranchedKey[author] = streamKey;
        }
      }

      if (isPartial) {
        cardState.buffer += rawText;
        updateRichProseElement(cardState.proseEl, cardState.buffer);
        const liveLabel =
          cardState.speechNum === 1 ? "Writing Opening..." : "Crafting Rebuttal...";
        setSeatState(author, "working", liveLabel, true);
      } else {
        cardState.buffer = rawText;
        updateRichProseElement(cardState.proseEl, cardState.buffer);
        cardState.cardEl.classList.remove("is-streaming");
        cardState.arrivalPill.textContent = `${ordinalLabel(
          cardState.orderIndex
        )} · +${arrivalTime}`;
        cardState.finalized = true;
        if (turnCtx.openUnbranchedKey[author] === streamKey) {
          turnCtx.openUnbranchedKey[author] = null;
        }
        clearAllSpotlights();
        setSeatState(author, "spoke", "Spoke", true);
      }
      return;
    }

    // 4. Counselor Function Responses Returning to Facilitator (deduplicated by fr.id)
    const counselorResponses = functionResponses.filter((fr) => COUNSELOR_SET.has(fr.name));
    if (isFacilitator && counselorResponses.length > 0) {
      turnCtx.handledEventsCount += 1;
      let newlyReturned = 0;
      for (const fr of counselorResponses) {
        const frKey =
          typeof fr.id === "string" && fr.id
            ? fr.id
            : `${fr.name}:${turnCtx.callCount[fr.name] ?? 1}`;
        if (!turnCtx.seenFunctionResponseKeys.has(frKey)) {
          turnCtx.seenFunctionResponseKeys.add(frKey);
          newlyReturned += 1;
        }
      }

      turnCtx.pendingCallsCount = Math.max(0, turnCtx.pendingCallsCount - newlyReturned);

      if (turnCtx.pendingCallsCount === 0 && newlyReturned > 0) {
        clearAllSpotlights();
        const maxCalls = Math.max(0, ...Object.values(turnCtx.callCount));
        if (maxCalls === 1) {
          setWaveStepState(2, "complete");
          setWaveStepState(3, "active");
          setSeatState("facilitator", "working", "Preparing Rebuttals...", true);
        } else if (maxCalls >= 2) {
          setWaveStepState(3, "complete");
          setWaveStepState(4, "active");
          setSeatState("facilitator", "working", "Synthesizing Verdict...", true);
        }
      }
      return;
    }

    // 5. Facilitator Live Streaming Verdict or Direct Greeting Reply
    if (isFacilitator && rawText.length > 0 && functionCalls.length === 0) {
      const kind = turnCtx.totalCounselorSpeeches > 0 ? "verdict" : "direct";
      let fCard = turnCtx.facilitatorStreamCard;
      if (fCard && (fCard.kind !== kind || fCard.finalized)) {
        fCard = null;
      }

      if (!fCard && !trimmedText) {
        return;
      }

      turnCtx.handledEventsCount += 1;

      if (!fCard) {
        if (kind === "verdict") {
          setWaveStepState(3, "complete");
          setWaveStepState(4, "active");
          setSeatState("facilitator", "working", "Synthesizing Verdict...", true);
          fCard = createStreamingVerdictCard(arrivalTime, isPartial);
        } else {
          setWaveStepState(1, "active");
          setSeatState("facilitator", "working", "Responding...", true);
          fCard = createStreamingDirectCard(arrivalTime, isPartial);
        }
        turnCtx.verdictSlot.appendChild(fCard.cardEl);
        turnCtx.facilitatorStreamCard = fCard;
      }

      if (isPartial) {
        fCard.buffer += rawText;
        renderFacilitatorCardBuffer(fCard, arrivalTime, false);
      } else {
        fCard.buffer = rawText;
        stopElapsedTimer();
        const finalElapsed = currentElapsedLabel();
        renderFacilitatorCardBuffer(fCard, finalElapsed, true);
        clearAllSpotlights();

        if (kind === "verdict") {
          for (let w = 1; w <= 4; w += 1) {
            setWaveStepState(w, "complete");
          }
          for (const cId of COUNSELOR_IDS) {
            setSeatState(cId, "spoke", "Spoke", false);
          }
          setSeatState("facilitator", "spoke", "Complete", true);
          syncAccordionButton();
        } else {
          setWaveStepState(1, "complete");
          for (const cId of COUNSELOR_IDS) {
            setSeatState(cId, "idle", "Idle", false);
          }
          setSeatState("facilitator", "spoke", "Complete", true);
        }
      }
    }
  }

  async function runCouncilDeliberation(promptText) {
    const trimmedPrompt = promptText.trim();
    if (!trimmedPrompt || isStreaming) {
      return;
    }

    clearError();
    setArmorShieldState(false);
    setFormBusy(true);

    stageEl.dataset.stagePhase = "active";
    wave3LabelEl.textContent = "3. Cross-Rebuttals";
    setWaveStepState(1, "active");
    setWaveStepState(2, "idle");
    setWaveStepState(3, "idle");
    setWaveStepState(4, "idle");

    setSeatState("facilitator", "working", "Framing Question...", true);
    for (const cId of COUNSELOR_IDS) {
      setSeatState(cId, "idle", "Idle", false);
    }

    startElapsedTimer();
    const turnCtx = createTurnDom(trimmedPrompt);
    turnCtx.turnEl.scrollIntoView({ behavior: "smooth", block: "nearest" });

    const abortController = new AbortController();
    activeAbortController = abortController;

    try {
      const sessionId = await ensureAdkSession(abortController.signal);
      const sseResponse = await fetch(`${apiBase}/run_sse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          appName: "council_of_ancients",
          userId,
          sessionId,
          newMessage: {
            role: "user",
            parts: [{ text: trimmedPrompt }],
          },
          streaming: true,
        }),
        signal: abortController.signal,
      });

      if (!sseResponse.ok) {
        const errBody = await sseResponse.text();
        throw new Error(
          `ADK /run_sse failed (HTTP ${sseResponse.status}): ${errBody || sseResponse.statusText}`
        );
      }

      if (!sseResponse.body) {
        throw new Error("ADK /run_sse response did not expose a readable stream body.");
      }

      const reader = sseResponse.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let lineBuffer = "";

      const processLine = (rawLine) => {
        const line = rawLine.trim();
        if (!line || line.startsWith(":")) {
          return;
        }
        if (!line.startsWith("data:")) {
          return;
        }
        const jsonPayload = line.slice(5).trim();
        if (!jsonPayload) {
          return;
        }
        let parsedEvent;
        try {
          parsedEvent = JSON.parse(jsonPayload);
        } catch (parseErr) {
          throw new Error(
            `Malformed SSE JSON payload from /run_sse: ${parseErr.message} (raw: ${jsonPayload.slice(0, 200)})`
          );
        }
        handleStreamEvent(parsedEvent, turnCtx);
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split(/\r?\n/);
        lineBuffer = lines.pop() ?? "";
        for (const line of lines) {
          processLine(line);
        }
      }

      lineBuffer += decoder.decode();
      if (lineBuffer.trim()) {
        for (const line of lineBuffer.split(/\r?\n/)) {
          processLine(line);
        }
      }

      if (turnCtx.handledEventsCount === 0) {
        throw new Error("Stream closed without emitting any Council of Ancients events.");
      }
    } catch (err) {
      stopElapsedTimer();
      if (err && err.name === "AbortError") {
        return;
      }
      resetStageToIdle();
      showError(err instanceof Error ? err.message : String(err));
      errorBannerEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } finally {
      stopElapsedTimer();
      if (activeAbortController === abortController) {
        activeAbortController = null;
      }
      setFormBusy(false);
    }
  }

  function resetSession() {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    stopElapsedTimer();
    activeSessionId = null;
    turnStartPerfMs = 0;
    elapsedTimerEl.textContent = "0.0s";
    sessionBadgeEl.textContent = "Session: Ready";

    clearError();
    setArmorShieldState(false);
    resetStageToIdle();
    setFormBusy(false);

    for (const child of Array.from(streamEl.children)) {
      if (child !== emptyChamberEl) {
        child.remove();
      }
    }
    emptyChamberEl.hidden = false;
    syncAccordionButton();
    promptInputEl.value = "";
    promptInputEl.focus();
  }

  function init() {
    try {
      apiBase = resolveApiBase();
      if (apiBase) {
        apiTargetPillEl.textContent = `API: ${apiBase}`;
        apiTargetPillEl.hidden = false;
        devUiLinkEl.href = `${apiBase}/dev-ui`;
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    }

    formEl.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = promptInputEl.value;
      if (!text.trim()) {
        promptInputEl.focus();
        return;
      }
      promptInputEl.value = "";
      void runCouncilDeliberation(text);
    });

    promptInputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        formEl.requestSubmit();
      }
    });

    newSessionBtn.addEventListener("click", () => {
      resetSession();
    });

    errorDismissBtn.addEventListener("click", () => {
      clearError();
    });

    toggleAccordionsBtn.addEventListener("click", () => {
      const accordions = getDebateAccordions();
      const isExpanded = toggleAccordionsBtn.getAttribute("aria-expanded") === "true";
      const nextOpen = !isExpanded;
      for (const detailsEl of accordions) {
        detailsEl.open = nextOpen;
      }
      toggleAccordionsBtn.setAttribute("aria-expanded", nextOpen ? "true" : "false");
      toggleAccordionsBtn.textContent = nextOpen ? "Collapse All" : "Expand All";
    });

    document.addEventListener(
      "toggle",
      (event) => {
        if (
          event.target instanceof HTMLDetailsElement &&
          event.target.classList.contains("debate-accordion")
        ) {
          syncAccordionButton();
        }
      },
      { capture: true }
    );

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("details.debate-accordion > summary")) {
        window.setTimeout(syncAccordionButton, 0);
      }
    });

    syncAccordionButton();
  }

  init();
})();
