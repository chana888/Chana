var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};
import "./_virtual_wxt-html-plugins-1gpIhnxt.js";
import { d as defineComponent, g as ref, h as computed, q as reactive, i as onMounted, c as createElementBlock, o as openBlock, b as createBaseVNode, k as createStaticVNode, l as createTextVNode, t as toDisplayString, _ as _export_sfc, p as createApp } from "./_plugin-vue_export-helper-CQ0JawgV.js";
const _hoisted_1 = { class: "page" };
const _hoisted_2 = { class: "main" };
const _hoisted_3 = { class: "card" };
const _hoisted_4 = { class: "cmd primary" };
const _hoisted_5 = { class: "cmd-grid" };
const _hoisted_6 = { class: "cmd alt" };
const _hoisted_7 = { class: "cmd alt" };
const _hoisted_8 = { class: "cmd primary" };
const _hoisted_9 = { class: "cmd primary" };
const _hoisted_10 = { class: "card trouble" };
const _hoisted_11 = { class: "cmd primary compact" };
const PACKAGE = "mcp-chrome-bridger";
const TROUBLESHOOTING_URL = "https://github.com/femto/mcp-chrome/blob/master/docs/TROUBLESHOOTING.md";
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "App",
  setup(__props) {
    const installCmds = {
      npm: `npm install -g ${PACKAGE}`,
      pnpm: `pnpm add -g ${PACKAGE}`,
      yarn: `yarn global add ${PACKAGE}`
    };
    const registerCmd = `${PACKAGE} register`;
    const doctorCmd = `${PACKAGE} doctor`;
    const port = ref(12306);
    const mcpUrl = computed(() => `http://127.0.0.1:${port.value}/mcp`);
    const copied = reactive({});
    const label = (key) => copied[key] ? "Copied" : "Copy";
    function copy(key, text) {
      return __async(this, null, function* () {
        try {
          yield navigator.clipboard.writeText(text);
          copied[key] = true;
          setTimeout(() => copied[key] = false, 1500);
        } catch (error) {
          console.warn("Welcome: copy failed", error);
        }
      });
    }
    onMounted(() => __async(null, null, function* () {
      try {
        const result = yield chrome.storage.local.get(["nativeServerPort"]);
        if (typeof result.nativeServerPort === "number") port.value = result.nativeServerPort;
      } catch (e) {
      }
    }));
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1, [
        createBaseVNode("header", { class: "header" }, [
          _cache[6] || (_cache[6] = createStaticVNode('<div class="brand" data-v-162148b2><div class="logo" data-v-162148b2><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-v-162148b2><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" data-v-162148b2></path></svg></div><div data-v-162148b2><h1 data-v-162148b2>Chrome MCP Server</h1><p class="muted" data-v-162148b2>After the extension is installed, this is the only required step.</p></div></div>', 1)),
          createBaseVNode("a", {
            class: "docs-btn",
            href: TROUBLESHOOTING_URL,
            target: "_blank",
            rel: "noopener"
          }, "Troubleshooting Docs")
        ]),
        createBaseVNode("main", _hoisted_2, [
          createBaseVNode("section", _hoisted_3, [
            createBaseVNode("h2", null, [
              _cache[7] || (_cache[7] = createTextVNode("Install ")),
              createBaseVNode("code", { class: "title-code" }, toDisplayString(PACKAGE))
            ]),
            _cache[10] || (_cache[10] = createBaseVNode("p", { class: "muted" }, "The Chrome extension uses this local bridge to expose MCP tools to your client.", -1)),
            createBaseVNode("div", _hoisted_4, [
              createBaseVNode("code", null, toDisplayString(installCmds.npm), 1),
              createBaseVNode("button", {
                onClick: _cache[0] || (_cache[0] = ($event) => copy("npm", installCmds.npm))
              }, toDisplayString(label("npm")), 1)
            ]),
            createBaseVNode("div", _hoisted_5, [
              createBaseVNode("div", _hoisted_6, [
                createBaseVNode("div", null, [
                  _cache[8] || (_cache[8] = createBaseVNode("div", { class: "cmd-tag" }, "PNPM", -1)),
                  createBaseVNode("code", null, toDisplayString(installCmds.pnpm), 1)
                ]),
                createBaseVNode("button", {
                  onClick: _cache[1] || (_cache[1] = ($event) => copy("pnpm", installCmds.pnpm))
                }, toDisplayString(label("pnpm")), 1)
              ]),
              createBaseVNode("div", _hoisted_7, [
                createBaseVNode("div", null, [
                  _cache[9] || (_cache[9] = createBaseVNode("div", { class: "cmd-tag" }, "YARN", -1)),
                  createBaseVNode("code", null, toDisplayString(installCmds.yarn), 1)
                ]),
                createBaseVNode("button", {
                  onClick: _cache[2] || (_cache[2] = ($event) => copy("yarn", installCmds.yarn))
                }, toDisplayString(label("yarn")), 1)
              ])
            ]),
            _cache[11] || (_cache[11] = createBaseVNode("p", { class: "muted step" }, "Then register the native host with Chrome:", -1)),
            createBaseVNode("div", _hoisted_8, [
              createBaseVNode("code", null, toDisplayString(registerCmd)),
              createBaseVNode("button", {
                onClick: _cache[3] || (_cache[3] = ($event) => copy("register", registerCmd))
              }, toDisplayString(label("register")), 1)
            ]),
            _cache[12] || (_cache[12] = createBaseVNode("div", { class: "note" }, [
              createTextVNode("Requires Node.js 18.19+. Check your version with "),
              createBaseVNode("code", { class: "inline" }, "node -v"),
              createTextVNode(".")
            ], -1)),
            _cache[13] || (_cache[13] = createBaseVNode("hr", null, null, -1)),
            _cache[14] || (_cache[14] = createBaseVNode("h3", null, "MCP client URL (streamable HTTP)", -1)),
            _cache[15] || (_cache[15] = createBaseVNode("p", { class: "muted" }, "Use this URL in your MCP client (e.g., Claude Desktop, Claude Code, CherryStudio).", -1)),
            createBaseVNode("div", _hoisted_9, [
              createBaseVNode("code", null, toDisplayString(mcpUrl.value), 1),
              createBaseVNode("button", {
                onClick: _cache[4] || (_cache[4] = ($event) => copy("url", mcpUrl.value))
              }, toDisplayString(label("url")), 1)
            ]),
            _cache[16] || (_cache[16] = createBaseVNode("p", { class: "tip" }, 'Tip: You can also open the extension popup and click "Connect" to copy a full client config snippet.', -1))
          ]),
          createBaseVNode("section", _hoisted_10, [
            _cache[17] || (_cache[17] = createBaseVNode("div", null, [
              createBaseVNode("h3", null, "Troubleshooting"),
              createBaseVNode("p", { class: "muted" }, "Use this only if the bridge fails to register or connect.")
            ], -1)),
            createBaseVNode("div", _hoisted_11, [
              createBaseVNode("code", null, toDisplayString(doctorCmd)),
              createBaseVNode("button", {
                onClick: _cache[5] || (_cache[5] = ($event) => copy("doctor", doctorCmd))
              }, toDisplayString(label("doctor")), 1)
            ])
          ])
        ])
      ]);
    };
  }
});
const App = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-162148b2"]]);
createApp(App).mount("#app");
