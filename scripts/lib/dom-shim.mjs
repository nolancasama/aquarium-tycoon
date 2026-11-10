// Adapted from esl-likes 169aab9: scripts/lib/dom-shim.mjs.
// FBX textures are replaced with the real embedded palette after export.
class StubImage {
  constructor() { this.width = 1; this.height = 1; }
  addEventListener(type, listener) { if (type === 'load') setTimeout(listener, 0); }
  removeEventListener() {}
  set src(value) { this._src = value; }
  get src() { return this._src; }
}
globalThis.document ??= {
  createElementNS(_namespace, tag) {
    if (tag === 'img') return new StubImage();
    throw new Error(`Unexpected DOM element in model pipeline: ${tag}`);
  },
};
globalThis.self ??= globalThis;
globalThis.window ??= globalThis;
globalThis.Image ??= StubImage;
globalThis.FileReader ??= class {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend?.();
  }
  async readAsDataURL(blob) {
    this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
    this.onloadend?.();
  }
};
