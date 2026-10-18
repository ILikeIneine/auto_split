import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../extension/content.js", import.meta.url), "utf8");

async function page({ enabled = true, supported = true, result = { ok: true }, baseTarget = null, failure = null } = {}) {
  let click, changed;
  const messages = [], navigations = [];
  const notices = [];
  const element = () => ({
    children: [],
    append(...nodes) { this.children.push(...nodes); },
    attachShadow() { this.shadow = element(); return this.shadow; },
    setAttribute() {}, addEventListener() {}, remove() {}
  });
  const location = { href: "https://example.com/list", assign: url => navigations.push(url) };
  const api = {
    runtime: { onMessage: { addListener() {} }, sendMessage: message => {
      messages.push(message);
      if (message.type === "GET_STATE") return Promise.resolve({ enabled, supported });
      if (failure === "sync") throw new Error("Extension context invalidated");
      if (failure === "async") return Promise.reject(new Error("Message port closed"));
      return Promise.resolve(result);
    } },
    storage: { onChanged: { addListener: fn => { changed = fn; } } }
  };
  const context = vm.createContext({
    URL, location, chrome: api,
    document: {
      querySelector: () => baseTarget === null ? null : { getAttribute: () => baseTarget },
      createElement: element,
      body: { append: node => notices.push(node) }
    },
    window: { addEventListener: (name, fn) => { if (name === "click") click = fn; } }
  });
  vm.runInContext(source, context);
  await Promise.resolve();
  function event(attrs = {}, overrides = {}) {
    const attributes = { href: "/article", ...attrs };
    const link = {
      nodeType: 1, localName: "a", isContentEditable: false,
      baseURI: "https://example.com/list",
      hasAttribute: name => name in attributes,
      getAttribute: name => attributes[name] ?? null,
      closest: () => null
    };
    return {
      isTrusted: true, defaultPrevented: false, button: 0,
      ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
      prevented: false, stopped: false,
      preventDefault() { this.prevented = true; },
      stopImmediatePropagation() { this.stopped = true; },
      composedPath: () => [{ nodeType: 3 }, link], ...overrides
    };
  }
  return { click, changed, event, messages, navigations, notices };
}

test("ordinary click is synchronously intercepted before sending the absolute link", async () => {
  const p = await page();
  const e = p.event();
  p.click(e);
  assert.equal(e.prevented, true);
  assert.equal(e.stopped, true);
  assert.equal(p.messages[1].url, "https://example.com/article");
});

test("modified, middle, synthetic, and already-cancelled clicks remain native", async () => {
  const p = await page();
  for (const flags of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { isTrusted: false }, { defaultPrevented: true }]) {
    const e = p.event({}, flags);
    p.click(e);
    assert.equal(e.prevented, false);
  }
  assert.equal(p.messages.length, 1);
});

test("anchors, downloads, non-web schemes and named-frame targets remain native", async () => {
  const p = await page();
  for (const attrs of [
    { href: "#part" }, { href: "https://example.com/list#part" }, { href: "" },
    { href: "mailto:a@b.com" }, { href: "javascript:void(0)" },
    { download: "file.pdf" }, { target: "_top" }, { target: "_parent" }, { target: "frame" }
  ]) {
    const e = p.event(attrs);
    p.click(e);
    assert.equal(e.prevented, false, JSON.stringify(attrs));
  }
});

test("_blank links split too; <base target> is respected", async () => {
  const p = await page({ baseTarget: "frame" });
  const named = p.event();
  p.click(named);
  assert.equal(named.prevented, false);
  const blank = p.event({ target: "_blank" });
  p.click(blank);
  assert.equal(blank.prevented, true);
});

test("disabled/unsupported pages don't swallow a click", async () => {
  for (const state of [{ enabled: false }, { supported: false }]) {
    const p = await page(state);
    const e = p.event();
    p.click(e);
    assert.equal(e.prevented, false);
  }
});

test("toggle takes effect in already injected documents", async () => {
  const p = await page();
  p.changed({ enabled: { newValue: false } }, "local");
  const paused = p.event();
  p.click(paused);
  assert.equal(paused.prevented, false);
  p.changed({ enabled: { newValue: true } }, "local");
  const resumed = p.event();
  p.click(resumed);
  assert.equal(resumed.prevented, true);
});

test("split failure preserves the source and offers an explicit new-tab link", async () => {
  const p = await page({ result: { ok: false, reason: "split-failed" } });
  p.click(p.event());
  await Promise.resolve();
  assert.deepEqual(p.navigations, []);
  assert.equal(p.notices.length, 1);
  const box = p.notices[0].shadow.children[1];
  assert.equal(box.children[0].href, "https://example.com/article");
  assert.equal(box.children[0].target, "_blank");
});

test("lost message ports and invalidated extension contexts never navigate the source", async () => {
  for (const failure of ["sync", "async"]) {
    const p = await page({ failure });
    p.click(p.event());
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(p.navigations, []);
    assert.equal(p.notices.length, 1);
  }
});

test("pausing in between interception and handling still permits normal navigation", async () => {
  const p = await page({ result: { ok: false, reason: "disabled" } });
  p.click(p.event());
  await Promise.resolve();
  assert.deepEqual(p.navigations, ["https://example.com/article"]);
});
