import "fake-indexeddb/auto";

// crypto.randomUUID in jsdom
if (!globalThis.crypto?.randomUUID) {
  // @ts-expect-error test shim
  globalThis.crypto = {
    ...globalThis.crypto,
    randomUUID: () =>
      "00000000-0000-4000-8000-" +
      Math.floor(Math.random() * 1e12)
        .toString(16)
        .padStart(12, "0"),
  };
}
