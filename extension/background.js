import { createSplitController, supportsSplitView, webUrl } from "./split-controller.js";

const controller = createSplitController(chrome);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (message?.type === "GET_STATE") {
    chrome.storage.local.get("enabled").then(({ enabled = true }) => {
      sendResponse({ enabled, supported: supportsSplitView(chrome) });
    }).catch(() => sendResponse({ enabled: false, supported: false }));
    return true;
  }
  if (message?.type !== "OPEN_LINK") return false;
  if (!Number.isInteger(sender.tab?.id) || !webUrl(sender.url)) {
    sendResponse({ ok: false, reason: "invalid-sender" });
    return false;
  }
  controller.openLink(sender.tab.id, message.url).then(sendResponse).catch(error => {
    console.warn("Auto Split:", error);
    sendResponse({ ok: false, reason: "split-failed" });
  });
  return true;
});
