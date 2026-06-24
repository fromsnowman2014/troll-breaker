// Phase 2: floating button injection for Sword mode

let lastFocusedTextarea: HTMLTextAreaElement | HTMLElement | null = null;

function getTextValue(el: HTMLTextAreaElement | HTMLElement): string {
  if (el instanceof HTMLTextAreaElement) return el.value;
  return el.textContent ?? "";
}

function setTextValue(el: HTMLTextAreaElement | HTMLElement, text: string): void {
  if (el instanceof HTMLTextAreaElement) {
    el.value = text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    el.textContent = text;
    el.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }
}

function createButton(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = "✦ Strike";
  btn.setAttribute("data-troll-breaker", "1");
  btn.style.cssText = [
    "position:absolute",
    "bottom:6px",
    "right:6px",
    "z-index:2147483647",
    "padding:3px 8px",
    "font-size:11px",
    "line-height:1.4",
    "border-radius:4px",
    "border:none",
    "cursor:pointer",
    "background:#1e40af",
    "color:#e0e7ff",
    "opacity:0.85",
    "pointer-events:auto",
    "font-family:sans-serif",
    "user-select:none",
  ].join(";");
  btn.addEventListener("mouseenter", () => { btn.style.opacity = "1"; });
  btn.addEventListener("mouseleave", () => { btn.style.opacity = "0.85"; });
  return btn;
}

function getWrapper(el: HTMLElement): HTMLElement | null {
  const parent = el.parentElement;
  if (!parent) return null;
  const pos = getComputedStyle(parent).position;
  if (pos === "relative" || pos === "absolute" || pos === "sticky" || pos === "fixed") {
    return parent;
  }
  return null;
}

function ensureWrapper(el: HTMLElement): HTMLElement {
  const existing = getWrapper(el);
  if (existing) return existing;

  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-troll-breaker-wrapper", "1");
  wrapper.style.cssText = "position:relative;display:inline-block;width:100%;";
  el.parentElement!.insertBefore(wrapper, el);
  wrapper.appendChild(el);
  return wrapper;
}

function attachButton(el: HTMLTextAreaElement | HTMLElement): void {
  // Don't inject twice.
  const wrapper = el.parentElement;
  if (wrapper?.querySelector('[data-troll-breaker="1"]')) return;

  const container = ensureWrapper(el);
  const btn = createButton();

  el.addEventListener("focus", () => {
    lastFocusedTextarea = el;
  });

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    lastFocusedTextarea = el;
    const draft = getTextValue(el).trim();
    if (!draft) return;
    chrome.runtime.sendMessage({
      kind: "sword/request",
      draft,
      page_url: location.href,
    });
  });

  container.appendChild(btn);
}

function scanAndInject(): void {
  // textareas
  document.querySelectorAll<HTMLTextAreaElement>("textarea").forEach((el) => {
    attachButton(el);
  });
  // contenteditable
  document.querySelectorAll<HTMLElement>("[contenteditable='true'],[contenteditable='']").forEach((el) => {
    attachButton(el);
  });
}

// Listen for insert_back from service worker / side panel.
chrome.runtime.onMessage.addListener((msg: { kind: string; text?: string }) => {
  if (msg.kind !== "insert_back") return;
  if (!msg.text || !lastFocusedTextarea) return;
  setTextValue(lastFocusedTextarea, msg.text);
});

// Initial scan.
scanAndInject();

// Watch for dynamically added textareas.
const observer = new MutationObserver(() => {
  scanAndInject();
});

observer.observe(document.body, { childList: true, subtree: true });
