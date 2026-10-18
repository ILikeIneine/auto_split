import assert from "node:assert/strict";
import test from "node:test";
import { createSplitController, webUrl } from "../extension/split-controller.js";

function browser({ split = false, enabled = true, supported = true } = {}) {
  const tabs = new Map([[1, { id: 1, windowId: 7, index: 0, active: true, splitViewId: split ? 10 : -1 }]]);
  if (split) tabs.set(2, { id: 2, windowId: 7, index: 1, active: false, splitViewId: 10 });
  const calls = [];
  const api = {
    storage: { local: { get: async () => ({ enabled }) } },
    tabs: {
      get: async id => {
        if (!tabs.has(id)) throw new Error("Tab closed");
        return { ...tabs.get(id) };
      },
      query: async filter => [...tabs.values()].filter(tab =>
        tab.windowId === filter.windowId && tab.splitViewId === filter.splitViewId
      ).reverse().map(tab => ({ ...tab })),
      create: async options => {
        calls.push(["create", options]);
        const source = tabs.get(options.splitWithTabId);
        assert.equal(source.splitViewId, -1, "must not create twice for an already split tab");
        source.splitViewId = 10;
        const tab = { id: 2, windowId: 7, index: 1, splitViewId: 10, url: options.url, active: options.active };
        if (tab.active) for (const existing of tabs.values()) existing.active = false;
        tabs.set(2, tab);
        return tab;
      },
      update: async (id, options) => {
        calls.push(["update", id, options]);
        if (options.active) for (const existing of tabs.values()) existing.active = false;
        Object.assign(tabs.get(id), options);
        return tabs.get(id);
      }
    }
  };
  if (supported) api.tabs.createSplit = () => {};
  return { api, tabs, calls, controller: createSplitController(api) };
}

test("first link opens a native split in the source window, right by default", async () => {
  const b = browser();
  const result = await b.controller.openLink(1, "https://example.com/article");
  assert.equal(result.ok, true);
  assert.equal(result.reused, false);
  assert.deepEqual(b.calls, [["create", {
    url: "https://example.com/article", active: true, windowId: 7, splitWithTabId: 1
  }]]);
  assert.equal(b.tabs.get(2).active, true);
  assert.equal(b.tabs.get(1).active, false);
});

test("existing native split reuses the right pane even if query order is reversed", async () => {
  const b = browser({ split: true });
  await b.controller.openLink(1, "https://example.com/next");
  assert.deepEqual(b.calls, [
    ["update", 2, { url: "https://example.com/next", active: true }]
  ]);
  assert.equal(b.tabs.get(1).url, undefined);
  assert.equal(b.tabs.get(2).active, true);
  assert.equal(b.tabs.get(1).active, false);
});

test("clicking inside the right pane navigates right and preserves left", async () => {
  const b = browser({ split: true });
  const result = await b.controller.openLink(2, "https://example.com/deeper");
  assert.equal(result.tabId, 2);
  assert.equal(b.tabs.get(1).url, undefined);
});

test("concurrent first clicks create one split and then reuse it", async () => {
  const b = browser();
  await Promise.all([
    b.controller.openLink(1, "https://example.com/one"),
    b.controller.openLink(1, "https://example.com/two")
  ]);
  assert.equal(b.calls.filter(call => call[0] === "create").length, 1);
  assert.equal(b.tabs.get(2).url, "https://example.com/two");
});

test("worker restart discovers the existing split without persisted tab IDs", async () => {
  const b = browser();
  await b.controller.openLink(1, "https://example.com/one");
  const restarted = createSplitController(b.api);
  assert.equal((await restarted.openLink(1, "https://example.com/two")).reused, true);
});

test("closing right/unsplitting allows a new native split", async () => {
  const b = browser({ split: true });
  b.tabs.delete(2);
  b.tabs.get(1).splitViewId = -1;
  assert.equal((await b.controller.openLink(1, "https://example.com/")).reused, false);
});

test("pause and unsupported browsers do not mutate tabs", async () => {
  for (const options of [{ enabled: false }, { supported: false }]) {
    const b = browser(options);
    assert.equal((await b.controller.openLink(1, "https://example.com/")).ok, false);
    assert.equal(b.calls.length, 0);
  }
});

test("opening, reusing, and recreating a split activate the destination and preserve the source", async () => {
  const b = browser();
  await b.controller.openLink(1, "https://example.com/one");
  await b.controller.openLink(1, "https://example.com/two");
  b.tabs.delete(2);
  b.tabs.get(1).splitViewId = -1;
  await b.controller.openLink(1, "https://example.com/three");
  assert.equal(b.calls.filter(call => call[0] === "create").length, 2);
  assert.ok(b.calls.every(call => call[0] === "create" ? call[1].active === true : call[2].active === true));
  assert.ok(b.calls.every(call => call[0] !== "update" || call[1] !== 1));
  assert.equal(b.tabs.get(2).active, true);
  assert.equal(b.tabs.get(1).url, undefined);
});

test("clicking in an already active right pane preserves its activation and the left page", async () => {
  const b = browser({ split: true });
  b.tabs.get(1).active = false;
  b.tabs.get(2).active = true;
  assert.equal((await b.controller.openLink(2, "https://example.com/")).ok, true);
  assert.deepEqual(b.calls, [["update", 2, { url: "https://example.com/", active: true }]]);
  assert.equal(b.tabs.get(2).active, true);
  assert.equal(b.tabs.get(1).active, false);
  assert.equal(b.tabs.get(1).url, undefined);
});

test("an API rejection does not poison the next click's queue", async () => {
  const b = browser();
  const create = b.api.tabs.create;
  b.api.tabs.create = async () => { throw new Error("Transient split error"); };
  await assert.rejects(b.controller.openLink(1, "https://example.com/one"));
  b.api.tabs.create = create;
  assert.equal((await b.controller.openLink(1, "https://example.com/two")).ok, true);
});

test("malformed URLs and non-web schemes never reach tab APIs", async () => {
  const b = browser();
  for (const url of [null, {}, "relative", "javascript:alert(1)", "file:///a", "chrome://settings", "data:text/html,hi", "mailto:a@b.com"]) {
    assert.equal(webUrl(url), null);
    assert.equal((await b.controller.openLink(1, url)).ok, false);
  }
  assert.equal(b.calls.length, 0);
});
