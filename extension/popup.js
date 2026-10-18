const toggle = document.querySelector("#enabled");
const status = document.querySelector("#status");

function render(enabled) {
  toggle.checked = enabled;
  status.dataset.warning = "false";
  status.textContent = enabled ? "已开启 · 再次从左侧点击时，复用右侧页面。" : "已暂停 · 链接按网页原有方式打开。";
}

async function init() {
  try {
    const state = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    render(state.enabled);
    if (!state.supported) {
      status.dataset.warning = "true";
      status.textContent = "当前浏览器缺少原生分屏 API，请使用 Chrome 155 或更高版本。";
      return;
    }
    toggle.disabled = false;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    try {
      // Content-script matches do not grant the tabs permission to read URLs.
      // Ping the document instead of requesting access to browsing history.
      const page = await chrome.tabs.sendMessage(tab.id, { type: "PAGE_STATUS" }, { frameId: 0 });
      if (!page?.ready) throw new Error("Page not ready");
    } catch {
      status.dataset.warning = "true";
      status.textContent = "当前页面未就绪：普通网页请刷新；浏览器内置页和商店页不支持。";
    }
  } catch {
    status.dataset.warning = "true";
    status.textContent = "扩展连接失败，请在扩展管理页重新加载。";
  }
}

toggle.addEventListener("change", async () => {
  toggle.disabled = true;
  try {
    await chrome.storage.local.set({ enabled: toggle.checked });
    render(toggle.checked);
  } catch {
    toggle.checked = !toggle.checked;
    status.dataset.warning = "true";
    status.textContent = "设置保存失败，请重试。";
  } finally {
    toggle.disabled = false;
  }
});

init();
