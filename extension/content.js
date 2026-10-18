(() => {
  let enabled = false;
  let supported = false;
  let settingsRevision = 0;

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.enabled) {
      settingsRevision++;
      enabled = changes.enabled.newValue !== false;
    }
  });
  chrome.runtime.sendMessage({ type: "GET_STATE" }).then(state => {
    supported = state?.supported === true;
    if (settingsRevision === 0) enabled = state?.enabled === true;
  }).catch(() => { });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id === chrome.runtime.id && message?.type === "PAGE_STATUS") {
      sendResponse({ ready: true });
    }
    return false;
  });

  function getLink(event) {
    // composedPath also finds anchors inside open shadow roots.
    return event.composedPath().find(node =>
      node?.nodeType === 1 && node.localName === "a" && node.hasAttribute("href")
    );
  }

  function eligibleUrl(event) {
    if (!enabled || !supported || !event.isTrusted || event.defaultPrevented ||
      event.button !== 0 || event.ctrlKey || event.metaKey ||
      event.shiftKey || event.altKey) return null;

    const link = getLink(event);
    if (!link || link.hasAttribute("download") || link.isContentEditable ||
      link.closest('[contenteditable="true"], [role="button"]')) return null;

    // Respect named-frame, _parent, and _top navigation and <base target>.
    const target = (link.getAttribute("target") ??
      document.querySelector("base[target]")?.getAttribute("target") ?? "").toLowerCase();
    if (target && target !== "_self" && target !== "_blank") return null;

    try {
      const raw = link.getAttribute("href").trim();
      if (!raw || raw.startsWith("#")) return null;
      const url = new URL(raw, link.baseURI);
      if (!["http:", "https:"].includes(url.protocol)) return null;
      const current = new URL(location.href);
      // Anchor jumps stay within the current document, including absolute ones.
      if (url.hash && url.origin === current.origin &&
        url.pathname === current.pathname && url.search === current.search) return null;
      return url.href;
    } catch { return null; }
  }

  function showRecovery(url, message = "Auto Split 连接已中断，请刷新网页后重试。") {
    // Never replace the left page on a split error. A transport error may also
    // happen after a successful split, so recovery must be an explicit action.
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = ':host { all: initial; position: fixed; bottom: 24px; right: 24px; z-index: 2147483647; } div { font: 14px/1.5 system-ui,sans-serif; background: #172039; color: white; padding: 16px; border-radius: 12px; box-shadow: 0 6px 28px #0004; } a { color: #b5d1ff; margin: 0 12px; } button { cursor: pointer; border: 0; border-radius: 4px; padding: 4px 8px; }';
    const box = document.createElement("div");
    box.setAttribute("role", "alert");
    box.textContent = message;
    const retry = document.createElement("a");
    retry.href = url;
    retry.target = "_blank";
    retry.rel = "noopener noreferrer";
    retry.textContent = "在新标签页打开链接";
    retry.addEventListener("click", event => event.stopPropagation());
    const close = document.createElement("button");
    close.textContent = "关闭";
    close.addEventListener("click", () => host.remove());
    box.append(retry, close);
    shadow.append(style, box);
    (document.body ?? document.documentElement).append(host);
  }

  window.addEventListener("click", event => {
    const url = eligibleUrl(event);
    if (!url) return;
    // Cancel synchronously, before the site router or native navigation runs.
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      chrome.runtime.sendMessage({ type: "OPEN_LINK", url }).then(result => {
        if (result?.ok) return;
        if (result?.reason === "disabled") {
          // The user paused the extension after this click was intercepted.
          location.assign(url);
          return;
        }
        showRecovery(url, "Auto Split 未能打开分屏，原页面已保留。");
      }).catch(() => showRecovery(url));
    } catch {
      // Extension reloaded/uninstalled while this page was still open.
      showRecovery(url);
    }
  }, { capture: true, passive: false });
})();
