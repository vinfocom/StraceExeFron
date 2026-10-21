import test from "node:test";
import assert from "node:assert/strict";
import { installElectronFocusRecovery } from "./electronFocus.js";

function windowStub() {
  const calls = [];
  const listeners = new Map();
  const win = {
    alert: () => undefined,
    confirm: (message) => { calls.push(message); return false; },
    prompt: () => null,
    electronWindow: { recoverFocus: () => calls.push("recover") },
    document: {
      hasFocus: () => false,
      addEventListener: (name, listener) => listeners.set(name, listener),
      removeEventListener: (name, listener) => {
        assert.equal(listeners.get(name), listener);
        listeners.delete(name);
      },
    },
  };
  return { win, calls, listeners };
}

test("consecutive confirmations recover synchronously and preserve Cancel", () => {
  const { win, calls } = windowStub();
  installElectronFocusRecovery(win);
  assert.equal(win.confirm("first"), false);
  assert.equal(win.confirm("second"), false);
  assert.deepEqual(calls, ["first", "recover", "second", "recover"]);
  assert.equal(win.alert("message"), undefined);
  assert.equal(win.prompt("message"), null);
});

test("dialog arguments, this, results and errors survive the wrapper", () => {
  const { win, calls } = windowStub();
  win.prompt = function (...args) {
    assert.equal(this, win);
    assert.deepEqual(args, ["question", "default"]);
    return "answer";
  };
  const error = new Error("unsupported dialog");
  win.alert = () => { throw error; };
  installElectronFocusRecovery(win);
  assert.equal(win.prompt("question", "default"), "answer");
  assert.throws(() => win.alert(), (actual) => actual === error);
  assert.deepEqual(calls, ["recover", "recover"]);
});

test("IPC failure does not change the confirmation result", () => {
  const { win } = windowStub();
  win.electronWindow.recoverFocus = () => { throw new Error("closed"); };
  installElectronFocusRecovery(win);
  assert.equal(win.confirm("cancel"), false);
});

test("only a trusted click on an unfocused editable field requests recovery", () => {
  const { win, calls, listeners } = windowStub();
  installElectronFocusRecovery(win);
  const click = listeners.get("pointerdown");
  const event = { isTrusted: true, target: { closest: () => ({}) } };
  click({ ...event, isTrusted: false });
  click({ ...event, target: { closest: () => null } });
  win.document.hasFocus = () => true;
  click(event);
  assert.deepEqual(calls, []);
  win.document.hasFocus = () => false;
  click(event);
  assert.deepEqual(calls, ["recover"]);
});

test("cleanup restores dialogs and removes the click listener", () => {
  const { win, listeners } = windowStub();
  const original = win.confirm;
  const cleanup = installElectronFocusRecovery(win);
  cleanup();
  assert.equal(win.confirm, original);
  assert.equal(listeners.size, 0);
});

test("ordinary browser sessions retain their existing dialogs", () => {
  const { win, listeners } = windowStub();
  delete win.electronWindow;
  const original = win.confirm;
  installElectronFocusRecovery(win)();
  assert.equal(win.confirm, original);
  assert.equal(listeners.size, 0);
});
