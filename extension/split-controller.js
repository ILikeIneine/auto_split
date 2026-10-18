// No tab IDs are cached: querying Chrome also works after a worker restart,
// a manual unsplit, closing a pane, or moving the pair to another window.
export function supportsSplitView(api) {
  return typeof api.tabs.createSplit === "function";
}

export function webUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function createSplitController(api) {
  const queues = new Map();

  async function open(sourceId, url) {
    const { enabled = true } = await api.storage.local.get("enabled");
    if (!enabled) return { ok: false, reason: "disabled" };
    if (!supportsSplitView(api)) return { ok: false, reason: "unsupported" };

    const source = await api.tabs.get(sourceId);
    if (Number.isInteger(source.splitViewId) && source.splitViewId >= 0) {
      const pair = await api.tabs.query({
        windowId: source.windowId,
        splitViewId: source.splitViewId
      });
      pair.sort((a, b) => a.index - b.index);
      if (pair.length !== 2 || !pair.some(tab => tab.id === sourceId)) {
        throw new Error("分屏状态已变化，请重试。");
      }
      // Clicking in either pane navigates the right pane; the left stays put.
      const right = pair[1];
      // Navigate and activate the destination together so subsequent keyboard
      // input goes to the page the user just opened.
      await api.tabs.update(right.id, { url, active: true });
      return { ok: true, tabId: right.id, reused: true };
    }

    // Chrome inherits the split partner's group and pinned state. Omitting
    // index uses the native default: the new tab is on the right.
    const right = await api.tabs.create({
      url,
      active: true,
      windowId: source.windowId,
      splitWithTabId: source.id
    });
    return { ok: true, tabId: right.id, reused: false };
  }

  return {
    async openLink(sourceId, value) {
      const url = webUrl(value);
      if (!url) return { ok: false, reason: "invalid-url" };
      const source = await api.tabs.get(sourceId);
      const key = source.windowId;
      // Two fast clicks must not both try to create a split with the same tab.
      const previous = queues.get(key) ?? Promise.resolve();
      const task = previous.catch(() => { }).then(() => open(sourceId, url));
      queues.set(key, task);
      try {
        return await task;
      } finally {
        if (queues.get(key) === task) queues.delete(key);
      }
    }
  };
}
