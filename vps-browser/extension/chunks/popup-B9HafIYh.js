var __defProp = Object.defineProperty;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
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
import { d as defineComponent, c as createElementBlock, a as createCommentVNode, o as openBlock, b as createBaseVNode, t as toDisplayString, F as Fragment, r as renderList, w as withModifiers, _ as _export_sfc, n as normalizeClass, e as createBlock, u as unref, f as createVNode, g as ref, h as computed, i as onMounted, j as onUnmounted, k as createStaticVNode, l as createTextVNode, m as withDirectives, v as vModelCheckbox, p as createApp } from "./_plugin-vue_export-helper-CQ0JawgV.js";
import { P as PREDEFINED_MODELS, g as getCacheStats, c as cleanupModelCache, b as clearModelCache, B as BACKGROUND_MESSAGE_TYPES, d as getModelInfo } from "./semantic-similarity-engine-CmNG8zfR.js";
const fallbackMessages = {
  // Extension metadata
  extensionName: "MCP Chrome Extension",
  extensionDescription: "Turn Chrome into an MCP server for AI browser control",
  // Section headers
  nativeServerConfigLabel: "Native Server Configuration",
  semanticEngineLabel: "Semantic Engine",
  embeddingModelLabel: "Embedding Model",
  indexDataManagementLabel: "Index Data Management",
  modelCacheManagementLabel: "Model Cache Management",
  // Status labels
  statusLabel: "Status",
  runningStatusLabel: "Running Status",
  connectionStatusLabel: "Connection Status",
  lastUpdatedLabel: "Last Updated:",
  // Connection states
  connectButton: "Connect",
  disconnectButton: "Disconnect",
  connectingStatus: "Connecting...",
  connectedStatus: "Connected",
  disconnectedStatus: "Disconnected",
  detectingStatus: "Detecting...",
  // Server states
  serviceRunningStatus: "Service Running (Port: {0})",
  serviceNotConnectedStatus: "Service Not Connected",
  connectedServiceNotStartedStatus: "Connected, Service Not Started",
  // Configuration labels
  mcpServerConfigLabel: "MCP Server Configuration",
  connectionPortLabel: "Connection Port",
  refreshStatusButton: "Refresh Status",
  copyConfigButton: "Copy Configuration",
  // Action buttons
  retryButton: "Retry",
  cancelButton: "Cancel",
  confirmButton: "Confirm",
  saveButton: "Save",
  closeButton: "Close",
  resetButton: "Reset",
  // Progress states
  initializingStatus: "Initializing...",
  processingStatus: "Processing...",
  loadingStatus: "Loading...",
  clearingStatus: "Clearing...",
  cleaningStatus: "Cleaning...",
  downloadingStatus: "Downloading...",
  // Semantic engine states
  semanticEngineReadyStatus: "Semantic Engine Ready",
  semanticEngineInitializingStatus: "Semantic Engine Initializing...",
  semanticEngineInitFailedStatus: "Semantic Engine Initialization Failed",
  semanticEngineNotInitStatus: "Semantic Engine Not Initialized",
  initSemanticEngineButton: "Initialize Semantic Engine",
  reinitializeButton: "Reinitialize",
  // Model states
  downloadingModelStatus: "Downloading Model... {0}%",
  switchingModelStatus: "Switching Model...",
  modelLoadedStatus: "Model Loaded",
  modelFailedStatus: "Model Failed to Load",
  // Model descriptions
  lightweightModelDescription: "Lightweight Multilingual Model",
  betterThanSmallDescription: "Slightly larger than e5-small, but better performance",
  multilingualModelDescription: "Multilingual Semantic Model",
  // Performance levels
  fastPerformance: "Fast",
  balancedPerformance: "Balanced",
  accuratePerformance: "Accurate",
  // Error messages
  networkErrorMessage: "Network connection error, please check network and retry",
  modelCorruptedErrorMessage: "Model file corrupted or incomplete, please retry download",
  unknownErrorMessage: "Unknown error, please check if your network can access HuggingFace",
  permissionDeniedErrorMessage: "Permission denied",
  timeoutErrorMessage: "Operation timed out",
  // Data statistics
  indexedPagesLabel: "Indexed Pages",
  indexSizeLabel: "Index Size",
  activeTabsLabel: "Active Tabs",
  vectorDocumentsLabel: "Vector Documents",
  cacheSizeLabel: "Cache Size",
  cacheEntriesLabel: "Cache Entries",
  // Data management
  clearAllDataButton: "Clear All Data",
  clearAllCacheButton: "Clear All Cache",
  cleanExpiredCacheButton: "Clean Expired Cache",
  exportDataButton: "Export Data",
  importDataButton: "Import Data",
  // Dialog titles
  confirmClearDataTitle: "Confirm Clear Data",
  settingsTitle: "Settings",
  aboutTitle: "About",
  helpTitle: "Help",
  // Dialog messages
  clearDataWarningMessage: "This operation will clear all indexed webpage content and vector data, including:",
  clearDataList1: "All webpage text content index",
  clearDataList2: "Vector embedding data",
  clearDataList3: "Search history and cache",
  clearDataIrreversibleWarning: "This operation is irreversible! After clearing, you need to browse webpages again to rebuild the index.",
  confirmClearButton: "Confirm Clear",
  // Cache states
  cacheDetailsLabel: "Cache Details",
  noCacheDataMessage: "No cache data",
  loadingCacheInfoStatus: "Loading cache information...",
  processingCacheStatus: "Processing cache...",
  expiredLabel: "Expired",
  // Browser integration
  bookmarksBarLabel: "Bookmarks Bar",
  newTabLabel: "New Tab",
  currentPageLabel: "Current Page",
  // Accessibility
  menuLabel: "Menu",
  navigationLabel: "Navigation",
  mainContentLabel: "Main Content",
  // Future features
  languageSelectorLabel: "Language",
  themeLabel: "Theme",
  lightTheme: "Light",
  darkTheme: "Dark",
  autoTheme: "Auto",
  advancedSettingsLabel: "Advanced Settings",
  debugModeLabel: "Debug Mode",
  verboseLoggingLabel: "Verbose Logging",
  // Notifications
  successNotification: "Operation completed successfully",
  warningNotification: "Warning: Please review before proceeding",
  infoNotification: "Information",
  configCopiedNotification: "Configuration copied to clipboard",
  dataClearedNotification: "Data cleared successfully",
  // Units
  bytesUnit: "bytes",
  kilobytesUnit: "KB",
  megabytesUnit: "MB",
  gigabytesUnit: "GB",
  itemsUnit: "items",
  pagesUnit: "pages",
  // Legacy keys for backwards compatibility
  nativeServerConfig: "Native Server Configuration",
  runningStatus: "Running Status",
  refreshStatus: "Refresh Status",
  lastUpdated: "Last Updated:",
  mcpServerConfig: "MCP Server Configuration",
  connectionPort: "Connection Port",
  connecting: "Connecting...",
  disconnect: "Disconnect",
  connect: "Connect",
  semanticEngine: "Semantic Engine",
  embeddingModel: "Embedding Model",
  retry: "Retry",
  indexDataManagement: "Index Data Management",
  clearing: "Clearing...",
  clearAllData: "Clear All Data",
  copyConfig: "Copy Configuration",
  serviceRunning: "Service Running (Port: {0})",
  connectedServiceNotStarted: "Connected, Service Not Started",
  serviceNotConnected: "Service Not Connected",
  detecting: "Detecting...",
  lightweightModel: "Lightweight Multilingual Model",
  betterThanSmall: "Slightly larger than e5-small, but better performance",
  multilingualModel: "Multilingual Semantic Model",
  fast: "Fast",
  balanced: "Balanced",
  accurate: "Accurate",
  semanticEngineReady: "Semantic Engine Ready",
  semanticEngineInitializing: "Semantic Engine Initializing...",
  semanticEngineInitFailed: "Semantic Engine Initialization Failed",
  semanticEngineNotInit: "Semantic Engine Not Initialized",
  downloadingModel: "Downloading Model... {0}%",
  switchingModel: "Switching Model...",
  networkError: "Network connection error, please check network and retry",
  modelCorrupted: "Model file corrupted or incomplete, please retry download",
  unknownError: "Unknown error, please check if your network can access HuggingFace",
  reinitialize: "Reinitialize",
  initializing: "Initializing...",
  initSemanticEngine: "Initialize Semantic Engine",
  indexedPages: "Indexed Pages",
  indexSize: "Index Size",
  activeTabs: "Active Tabs",
  vectorDocuments: "Vector Documents",
  confirmClearData: "Confirm Clear Data",
  clearDataWarning: "This operation will clear all indexed webpage content and vector data, including:",
  clearDataIrreversible: "This operation is irreversible! After clearing, you need to browse webpages again to rebuild the index.",
  confirmClear: "Confirm Clear",
  cancel: "Cancel",
  confirm: "Confirm",
  processing: "Processing...",
  modelCacheManagement: "Model Cache Management",
  cacheSize: "Cache Size",
  cacheEntries: "Cache Entries",
  cacheDetails: "Cache Details",
  noCacheData: "No cache data",
  loadingCacheInfo: "Loading cache information...",
  processingCache: "Processing cache...",
  cleaning: "Cleaning...",
  cleanExpiredCache: "Clean Expired Cache",
  clearAllCache: "Clear All Cache",
  expired: "Expired",
  bookmarksBar: "Bookmarks Bar"
};
function getMessage(key, substitutions) {
  try {
    if (typeof chrome !== "undefined" && chrome.i18n && chrome.i18n.getMessage) {
      const message = chrome.i18n.getMessage(key, substitutions);
      if (message) {
        return message;
      }
    }
  } catch (error) {
    console.warn(`Failed to get i18n message for key "${key}":`, error);
  }
  let fallback = fallbackMessages[key] || key;
  if (substitutions && substitutions.length > 0) {
    substitutions.forEach((value, index) => {
      fallback = fallback.replace(`{${index}}`, value);
    });
  }
  return fallback;
}
const _hoisted_1$3 = { class: "dialog-content" };
const _hoisted_2$3 = { class: "dialog-header" };
const _hoisted_3$2 = { class: "dialog-icon" };
const _hoisted_4$2 = { class: "dialog-title" };
const _hoisted_5$1 = { class: "dialog-body" };
const _hoisted_6$1 = { class: "dialog-message" };
const _hoisted_7$1 = {
  key: 0,
  class: "dialog-list"
};
const _hoisted_8$1 = {
  key: 1,
  class: "dialog-warning"
};
const _hoisted_9$1 = { class: "dialog-actions" };
const _hoisted_10$1 = ["disabled"];
const _sfc_main$a = /* @__PURE__ */ defineComponent({
  __name: "ConfirmDialog",
  props: {
    visible: { type: Boolean },
    title: {},
    message: {},
    items: {},
    warning: {},
    icon: { default: "⚠️" },
    confirmText: { default: getMessage("confirmButton") },
    cancelText: { default: getMessage("cancelButton") },
    confirmingText: { default: getMessage("processingStatus") },
    isConfirming: { type: Boolean, default: false }
  },
  emits: ["confirm", "cancel"],
  setup(__props) {
    return (_ctx, _cache) => {
      return _ctx.visible ? (openBlock(), createElementBlock("div", {
        key: 0,
        class: "confirmation-dialog",
        onClick: _cache[2] || (_cache[2] = withModifiers(($event) => _ctx.$emit("cancel"), ["self"]))
      }, [
        createBaseVNode("div", _hoisted_1$3, [
          createBaseVNode("div", _hoisted_2$3, [
            createBaseVNode("span", _hoisted_3$2, toDisplayString(_ctx.icon), 1),
            createBaseVNode("h3", _hoisted_4$2, toDisplayString(_ctx.title), 1)
          ]),
          createBaseVNode("div", _hoisted_5$1, [
            createBaseVNode("p", _hoisted_6$1, toDisplayString(_ctx.message), 1),
            _ctx.items && _ctx.items.length > 0 ? (openBlock(), createElementBlock("ul", _hoisted_7$1, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(_ctx.items, (item) => {
                return openBlock(), createElementBlock("li", { key: item }, toDisplayString(item), 1);
              }), 128))
            ])) : createCommentVNode("", true),
            _ctx.warning ? (openBlock(), createElementBlock("div", _hoisted_8$1, [
              createBaseVNode("strong", null, toDisplayString(_ctx.warning), 1)
            ])) : createCommentVNode("", true)
          ]),
          createBaseVNode("div", _hoisted_9$1, [
            createBaseVNode("button", {
              class: "dialog-button cancel-button",
              onClick: _cache[0] || (_cache[0] = ($event) => _ctx.$emit("cancel"))
            }, toDisplayString(_ctx.cancelText), 1),
            createBaseVNode("button", {
              class: "dialog-button confirm-button",
              disabled: _ctx.isConfirming,
              onClick: _cache[1] || (_cache[1] = ($event) => _ctx.$emit("confirm"))
            }, toDisplayString(_ctx.isConfirming ? _ctx.confirmingText : _ctx.confirmText), 9, _hoisted_10$1)
          ])
        ])
      ])) : createCommentVNode("", true);
    };
  }
});
const ConfirmDialog = /* @__PURE__ */ _export_sfc(_sfc_main$a, [["__scopeId", "data-v-a9d7431f"]]);
const _hoisted_1$2 = {
  key: 0,
  class: "progress-section"
};
const _hoisted_2$2 = { class: "progress-indicator" };
const _hoisted_3$1 = {
  key: 0,
  class: "spinner"
};
const _hoisted_4$1 = { class: "progress-text" };
const _sfc_main$9 = /* @__PURE__ */ defineComponent({
  __name: "ProgressIndicator",
  props: {
    visible: { type: Boolean, default: true },
    text: {},
    showSpinner: { type: Boolean, default: true }
  },
  setup(__props) {
    return (_ctx, _cache) => {
      return _ctx.visible ? (openBlock(), createElementBlock("div", _hoisted_1$2, [
        createBaseVNode("div", _hoisted_2$2, [
          _ctx.showSpinner ? (openBlock(), createElementBlock("div", _hoisted_3$1)) : createCommentVNode("", true),
          createBaseVNode("span", _hoisted_4$1, toDisplayString(_ctx.text), 1)
        ])
      ])) : createCommentVNode("", true);
    };
  }
});
const ProgressIndicator = /* @__PURE__ */ _export_sfc(_sfc_main$9, [["__scopeId", "data-v-47bf69ec"]]);
const _sfc_main$8 = /* @__PURE__ */ defineComponent({
  __name: "DocumentIcon",
  props: {
    className: { default: "icon-default" }
  },
  setup(__props) {
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "0 0 24 24",
        "stroke-width": "2",
        stroke: "currentColor",
        class: normalizeClass(_ctx.className)
      }, _cache[0] || (_cache[0] = [
        createBaseVNode("path", {
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          d: "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
        }, null, -1)
      ]), 2);
    };
  }
});
const _sfc_main$7 = /* @__PURE__ */ defineComponent({
  __name: "DatabaseIcon",
  props: {
    className: { default: "icon-default" }
  },
  setup(__props) {
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "0 0 24 24",
        "stroke-width": "2",
        stroke: "currentColor",
        class: normalizeClass(_ctx.className)
      }, _cache[0] || (_cache[0] = [
        createBaseVNode("path", {
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          d: "M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375"
        }, null, -1)
      ]), 2);
    };
  }
});
const _sfc_main$6 = /* @__PURE__ */ defineComponent({
  __name: "BoltIcon",
  props: {
    className: { default: "icon-default" }
  },
  setup(__props) {
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "0 0 24 24",
        "stroke-width": "1.5",
        stroke: "currentColor",
        class: normalizeClass(_ctx.className)
      }, _cache[0] || (_cache[0] = [
        createBaseVNode("path", {
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          d: "m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z"
        }, null, -1)
      ]), 2);
    };
  }
});
const _sfc_main$5 = /* @__PURE__ */ defineComponent({
  __name: "TrashIcon",
  props: {
    className: { default: "icon-default" }
  },
  setup(__props) {
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "0 0 24 24",
        "stroke-width": "1.5",
        stroke: "currentColor",
        class: normalizeClass(_ctx.className)
      }, _cache[0] || (_cache[0] = [
        createBaseVNode("path", {
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          d: "m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
        }, null, -1)
      ]), 2);
    };
  }
});
const _sfc_main$4 = /* @__PURE__ */ defineComponent({
  __name: "CheckIcon",
  props: {
    className: { default: "icon-small" }
  },
  setup(__props) {
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        viewBox: "0 0 20 20",
        fill: "currentColor",
        class: normalizeClass(_ctx.className)
      }, _cache[0] || (_cache[0] = [
        createBaseVNode("path", {
          "fill-rule": "evenodd",
          d: "M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.052-.143Z",
          "clip-rule": "evenodd"
        }, null, -1)
      ]), 2);
    };
  }
});
const _sfc_main$3 = /* @__PURE__ */ defineComponent({
  __name: "TabIcon",
  props: {
    className: { default: "icon-default" }
  },
  setup(__props) {
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "0 0 24 24",
        "stroke-width": "2",
        stroke: "currentColor",
        class: normalizeClass(_ctx.className)
      }, _cache[0] || (_cache[0] = [
        createBaseVNode("path", {
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          d: "M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-16.5 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Z"
        }, null, -1)
      ]), 2);
    };
  }
});
const _sfc_main$2 = /* @__PURE__ */ defineComponent({
  __name: "VectorIcon",
  props: {
    className: { default: "icon-default" }
  },
  setup(__props) {
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("svg", {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "0 0 24 24",
        "stroke-width": "2",
        stroke: "currentColor",
        class: normalizeClass(_ctx.className)
      }, _cache[0] || (_cache[0] = [
        createBaseVNode("path", {
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          d: "M9 4.5a4.5 4.5 0 0 1 6 0M9 4.5V3a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 3v1.5M9 4.5a4.5 4.5 0 0 0-4.5 4.5v7.5A1.5 1.5 0 0 0 6 18h12a1.5 1.5 0 0 0 1.5-1.5V9a4.5 4.5 0 0 0-4.5-4.5M12 12l2.25 2.25M12 12l-2.25-2.25M12 12v6"
        }, null, -1)
      ]), 2);
    };
  }
});
const _hoisted_1$1 = { class: "model-cache-section" };
const _hoisted_2$1 = { class: "section-title" };
const _hoisted_3 = { class: "stats-grid" };
const _hoisted_4 = { class: "stats-card" };
const _hoisted_5 = { class: "stats-header" };
const _hoisted_6 = { class: "stats-label" };
const _hoisted_7 = { class: "stats-icon orange" };
const _hoisted_8 = { class: "stats-value" };
const _hoisted_9 = { class: "stats-card" };
const _hoisted_10 = { class: "stats-header" };
const _hoisted_11 = { class: "stats-label" };
const _hoisted_12 = { class: "stats-icon purple" };
const _hoisted_13 = { class: "stats-value" };
const _hoisted_14 = {
  key: 0,
  class: "cache-details"
};
const _hoisted_15 = { class: "cache-details-title" };
const _hoisted_16 = { class: "cache-entries" };
const _hoisted_17 = { class: "entry-info" };
const _hoisted_18 = { class: "entry-url" };
const _hoisted_19 = { class: "entry-details" };
const _hoisted_20 = { class: "entry-size" };
const _hoisted_21 = { class: "entry-age" };
const _hoisted_22 = {
  key: 0,
  class: "entry-expired"
};
const _hoisted_23 = {
  key: 1,
  class: "no-cache"
};
const _hoisted_24 = {
  key: 2,
  class: "loading-cache"
};
const _hoisted_25 = { class: "cache-actions" };
const _hoisted_26 = ["disabled"];
const _hoisted_27 = { class: "stats-icon" };
const _hoisted_28 = ["disabled"];
const _hoisted_29 = { class: "stats-icon" };
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "ModelCacheManagement",
  props: {
    cacheStats: {},
    isManagingCache: { type: Boolean }
  },
  emits: ["cleanup-cache", "clear-all-cache"],
  setup(__props) {
    const getModelNameFromUrl = (url) => {
      const match = url.match(/huggingface\.co\/([^/]+\/[^/]+)/);
      if (match) {
        return match[1];
      }
      return url.split("/").pop() || url;
    };
    return (_ctx, _cache) => {
      var _a, _b;
      return openBlock(), createElementBlock("div", _hoisted_1$1, [
        createBaseVNode("h2", _hoisted_2$1, toDisplayString(unref(getMessage)("modelCacheManagementLabel")), 1),
        createBaseVNode("div", _hoisted_3, [
          createBaseVNode("div", _hoisted_4, [
            createBaseVNode("div", _hoisted_5, [
              createBaseVNode("p", _hoisted_6, toDisplayString(unref(getMessage)("cacheSizeLabel")), 1),
              createBaseVNode("span", _hoisted_7, [
                createVNode(unref(_sfc_main$7))
              ])
            ]),
            createBaseVNode("p", _hoisted_8, toDisplayString(((_a = _ctx.cacheStats) == null ? void 0 : _a.totalSizeMB) || 0) + " MB", 1)
          ]),
          createBaseVNode("div", _hoisted_9, [
            createBaseVNode("div", _hoisted_10, [
              createBaseVNode("p", _hoisted_11, toDisplayString(unref(getMessage)("cacheEntriesLabel")), 1),
              createBaseVNode("span", _hoisted_12, [
                createVNode(unref(_sfc_main$2))
              ])
            ]),
            createBaseVNode("p", _hoisted_13, toDisplayString(((_b = _ctx.cacheStats) == null ? void 0 : _b.entryCount) || 0), 1)
          ])
        ]),
        _ctx.cacheStats && _ctx.cacheStats.entries.length > 0 ? (openBlock(), createElementBlock("div", _hoisted_14, [
          createBaseVNode("h3", _hoisted_15, toDisplayString(unref(getMessage)("cacheDetailsLabel")), 1),
          createBaseVNode("div", _hoisted_16, [
            (openBlock(true), createElementBlock(Fragment, null, renderList(_ctx.cacheStats.entries, (entry) => {
              return openBlock(), createElementBlock("div", {
                key: entry.url,
                class: "cache-entry"
              }, [
                createBaseVNode("div", _hoisted_17, [
                  createBaseVNode("div", _hoisted_18, toDisplayString(getModelNameFromUrl(entry.url)), 1),
                  createBaseVNode("div", _hoisted_19, [
                    createBaseVNode("span", _hoisted_20, toDisplayString(entry.sizeMB) + " MB", 1),
                    createBaseVNode("span", _hoisted_21, toDisplayString(entry.age), 1),
                    entry.expired ? (openBlock(), createElementBlock("span", _hoisted_22, toDisplayString(unref(getMessage)("expiredLabel")), 1)) : createCommentVNode("", true)
                  ])
                ])
              ]);
            }), 128))
          ])
        ])) : _ctx.cacheStats && _ctx.cacheStats.entries.length === 0 ? (openBlock(), createElementBlock("div", _hoisted_23, [
          createBaseVNode("p", null, toDisplayString(unref(getMessage)("noCacheDataMessage")), 1)
        ])) : !_ctx.cacheStats ? (openBlock(), createElementBlock("div", _hoisted_24, [
          createBaseVNode("p", null, toDisplayString(unref(getMessage)("loadingCacheInfoStatus")), 1)
        ])) : createCommentVNode("", true),
        _ctx.isManagingCache ? (openBlock(), createBlock(ProgressIndicator, {
          key: 3,
          visible: _ctx.isManagingCache,
          text: _ctx.isManagingCache ? unref(getMessage)("processingCacheStatus") : "",
          showSpinner: true
        }, null, 8, ["visible", "text"])) : createCommentVNode("", true),
        createBaseVNode("div", _hoisted_25, [
          createBaseVNode("div", {
            class: "secondary-button",
            disabled: _ctx.isManagingCache,
            onClick: _cache[0] || (_cache[0] = ($event) => _ctx.$emit("cleanup-cache"))
          }, [
            createBaseVNode("span", _hoisted_27, [
              createVNode(unref(_sfc_main$7))
            ]),
            createBaseVNode("span", null, toDisplayString(_ctx.isManagingCache ? unref(getMessage)("cleaningStatus") : unref(getMessage)("cleanExpiredCacheButton")), 1)
          ], 8, _hoisted_26),
          createBaseVNode("div", {
            class: "danger-button",
            disabled: _ctx.isManagingCache,
            onClick: _cache[1] || (_cache[1] = ($event) => _ctx.$emit("clear-all-cache"))
          }, [
            createBaseVNode("span", _hoisted_29, [
              createVNode(unref(_sfc_main$5))
            ]),
            createBaseVNode("span", null, toDisplayString(_ctx.isManagingCache ? unref(getMessage)("clearingStatus") : unref(getMessage)("clearAllCacheButton")), 1)
          ], 8, _hoisted_28)
        ])
      ]);
    };
  }
});
const ModelCacheManagement = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-86f9f65f"]]);
const _hoisted_1 = { class: "popup-container" };
const _hoisted_2 = { class: "content" };
const _hoisted_65 = { class: "section" };
const _hoisted_66 = { class: "section-title" };
const _hoisted_67 = { class: "config-card" };
const _hoisted_68 = { class: "status-section" };
const _hoisted_69 = { class: "status-header" };
const _hoisted_70 = { class: "status-label" };
const _hoisted_71 = ["title"];
const _hoisted_72 = { class: "status-info" };
const _hoisted_73 = { class: "status-text" };
const _hoisted_74 = {
  key: 0,
  class: "status-timestamp"
};
const _hoisted_75 = {
  key: 0,
  class: "version-warning"
};
const _hoisted_76 = { class: "warning-content" };
const _hoisted_77 = { class: "warning-message" };
const _hoisted_78 = {
  key: 1,
  class: "version-info"
};
const _hoisted_79 = { class: "version-value" };
const _hoisted_80 = {
  key: 2,
  class: "mcp-config-section"
};
const _hoisted_81 = { class: "mcp-config-header" };
const _hoisted_82 = { class: "mcp-config-label" };
const _hoisted_83 = { class: "mcp-config-content" };
const _hoisted_84 = { class: "mcp-config-json" };
const _hoisted_85 = { class: "port-section" };
const _hoisted_86 = {
  for: "port",
  class: "port-label"
};
const _hoisted_87 = ["value"];
const _hoisted_88 = ["disabled"];
const _hoisted_89 = { class: "webmcp-option" };
const _hoisted_90 = { class: "checkbox-label" };
const _hoisted_91 = { class: "webmcp-option" };
const _hoisted_92 = { class: "checkbox-label" };
const _hoisted_93 = { class: "webmcp-option" };
const _hoisted_94 = { class: "checkbox-label" };
const _hoisted_95 = { class: "section" };
const _hoisted_96 = { class: "section-title" };
const _hoisted_97 = { class: "semantic-engine-card" };
const _hoisted_98 = { class: "semantic-engine-status" };
const _hoisted_99 = { class: "status-info" };
const _hoisted_100 = { class: "status-text" };
const _hoisted_101 = {
  key: 0,
  class: "status-timestamp"
};
const _hoisted_102 = ["disabled"];
const _hoisted_103 = { class: "section" };
const _hoisted_104 = { class: "section-title" };
const _hoisted_105 = {
  key: 1,
  class: "error-card"
};
const _hoisted_106 = { class: "error-content" };
const _hoisted_107 = { class: "error-details" };
const _hoisted_108 = { class: "error-title" };
const _hoisted_109 = { class: "error-message" };
const _hoisted_110 = { class: "error-suggestion" };
const _hoisted_111 = ["disabled"];
const _hoisted_112 = { class: "model-list" };
const _hoisted_113 = ["onClick"];
const _hoisted_114 = { class: "model-header" };
const _hoisted_115 = { class: "model-info" };
const _hoisted_116 = { class: "model-description" };
const _hoisted_117 = {
  key: 0,
  class: "check-icon"
};
const _hoisted_118 = { class: "model-tags" };
const _hoisted_119 = { class: "model-tag performance" };
const _hoisted_120 = { class: "model-tag size" };
const _hoisted_121 = { class: "model-tag dimension" };
const _hoisted_122 = { class: "section" };
const _hoisted_123 = { class: "section-title" };
const _hoisted_124 = { class: "stats-grid" };
const _hoisted_125 = { class: "stats-card" };
const _hoisted_126 = { class: "stats-header" };
const _hoisted_127 = { class: "stats-label" };
const _hoisted_128 = { class: "stats-icon violet" };
const _hoisted_129 = { class: "stats-value" };
const _hoisted_130 = { class: "stats-card" };
const _hoisted_131 = { class: "stats-header" };
const _hoisted_132 = { class: "stats-label" };
const _hoisted_133 = { class: "stats-icon teal" };
const _hoisted_134 = { class: "stats-value" };
const _hoisted_135 = { class: "stats-card" };
const _hoisted_136 = { class: "stats-header" };
const _hoisted_137 = { class: "stats-label" };
const _hoisted_138 = { class: "stats-icon blue" };
const _hoisted_139 = { class: "stats-value" };
const _hoisted_140 = { class: "stats-card" };
const _hoisted_141 = { class: "stats-header" };
const _hoisted_142 = { class: "stats-label" };
const _hoisted_143 = { class: "stats-icon green" };
const _hoisted_144 = { class: "stats-value" };
const _hoisted_145 = ["disabled"];
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "App",
  setup(__props) {
    const nativeConnectionStatus = ref("unknown");
    const isConnecting = ref(false);
    const nativeServerPort = ref(12306);
    const worldbookWebMCPEnabled = ref(true);
    const debugCoordinates = ref(false);
    const showLastClickOnScreenshot = ref(false);
    ref(null);
    const activeTabUrl = ref("");
    ref("");
    ref("");
    ref("");
    ref(false);
    ref(false);
    ref(false);
    ref("");
    ref("Copy Raw");
    ref("Copy Workflow");
    ref("Copy WebMCP");
    ref("");
    ref("");
    ref("");
    const activeWorkflowDoc = ref(null);
    ref("");
    ref("");
    ref(false);
    ref("");
    ref({});
    ref("");
    ref("");
    ref("");
    ref("");
    const recorderState = ref({
      isRecording: false,
      tabId: null,
      toolName: "",
      description: "",
      url: null,
      actionCount: 0,
      startedAt: null
    });
    ref([]);
    const serverStatus = ref({
      isRunning: false,
      lastUpdated: Date.now()
    });
    const nativeHostVersion = ref(null);
    const showMcpConfig = computed(() => {
      return nativeConnectionStatus.value === "connected" && serverStatus.value.isRunning;
    });
    const copyButtonText = ref(getMessage("copyConfigButton"));
    const mcpConfigJson = computed(() => {
      const port = serverStatus.value.port || nativeServerPort.value;
      const config = {
        mcpServers: {
          "mcp-chrome": {
            type: "http",
            url: `http://127.0.0.1:${port}/mcp`
          }
        }
      };
      return JSON.stringify(config, null, 2);
    });
    const currentModel = ref(null);
    const isModelSwitching = ref(false);
    const modelSwitchProgress = ref("");
    const modelDownloadProgress = ref(0);
    const isModelDownloading = ref(false);
    const modelInitializationStatus = ref(
      "idle"
    );
    const modelErrorMessage = ref("");
    const modelErrorType = ref("");
    const selectedVersion = ref("quantized");
    const storageStats = ref(null);
    const isRefreshingStats = ref(false);
    const isClearingData = ref(false);
    const showClearConfirmation = ref(false);
    const clearDataProgress = ref("");
    const semanticEngineStatus = ref("idle");
    const isSemanticEngineInitializing = ref(false);
    const semanticEngineInitProgress = ref("");
    const semanticEngineLastUpdated = ref(null);
    const isManagingCache = ref(false);
    const cacheStats = ref(null);
    const availableModels = computed(() => {
      return Object.entries(PREDEFINED_MODELS).map(([key, value]) => __spreadValues({
        preset: key
      }, value));
    });
    const isRecordableActiveTab = computed(() => /^https?:\/\//.test(activeTabUrl.value));
    computed(() => {
      if (recorderState.value.isRecording) {
        return `Recording ${recorderState.value.actionCount} actions`;
      }
      if (isRecordableActiveTab.value && activeTabUrl.value) {
        return "Ready to record on active tab";
      }
      return "Open an http(s) page to start recording";
    });
    computed(() => {
      const candidate = recorderState.value.url || activeTabUrl.value;
      if (!candidate) return "";
      try {
        return new URL(candidate).hostname;
      } catch (e) {
        return "";
      }
    });
    computed(() => {
      var _a;
      const schema = (_a = activeWorkflowDoc.value) == null ? void 0 : _a.input_schema;
      return Array.isArray(schema) ? schema : [];
    });
    const getStatusClass = () => {
      if (nativeConnectionStatus.value === "connected") {
        if (serverStatus.value.isRunning) {
          return "bg-emerald-500";
        } else {
          return "bg-yellow-500";
        }
      } else if (nativeConnectionStatus.value === "disconnected") {
        return "bg-red-500";
      } else {
        return "bg-gray-500";
      }
    };
    const getStatusText = () => {
      if (nativeConnectionStatus.value === "connected") {
        if (serverStatus.value.isRunning) {
          return getMessage("serviceRunningStatus", [
            (serverStatus.value.port || "Unknown").toString()
          ]);
        } else {
          return getMessage("connectedServiceNotStartedStatus");
        }
      } else if (nativeConnectionStatus.value === "disconnected") {
        return getMessage("serviceNotConnectedStatus");
      } else {
        return getMessage("detectingStatus");
      }
    };
    const formatIndexSize = () => {
      var _a;
      if (!((_a = storageStats.value) == null ? void 0 : _a.indexSize)) return "0 MB";
      const sizeInMB = Math.round(storageStats.value.indexSize / (1024 * 1024));
      return `${sizeInMB} MB`;
    };
    const getModelDescription = (model) => {
      switch (model.preset) {
        case "multilingual-e5-small":
          return getMessage("lightweightModelDescription");
        case "multilingual-e5-base":
          return getMessage("betterThanSmallDescription");
        default:
          return getMessage("multilingualModelDescription");
      }
    };
    const getPerformanceText = (performance) => {
      switch (performance) {
        case "fast":
          return getMessage("fastPerformance");
        case "balanced":
          return getMessage("balancedPerformance");
        case "accurate":
          return getMessage("accuratePerformance");
        default:
          return performance;
      }
    };
    const getSemanticEngineStatusText = () => {
      switch (semanticEngineStatus.value) {
        case "ready":
          return getMessage("semanticEngineReadyStatus");
        case "initializing":
          return getMessage("semanticEngineInitializingStatus");
        case "error":
          return getMessage("semanticEngineInitFailedStatus");
        case "idle":
        default:
          return getMessage("semanticEngineNotInitStatus");
      }
    };
    const getSemanticEngineStatusClass = () => {
      switch (semanticEngineStatus.value) {
        case "ready":
          return "bg-emerald-500";
        case "initializing":
          return "bg-yellow-500";
        case "error":
          return "bg-red-500";
        case "idle":
        default:
          return "bg-gray-500";
      }
    };
    const getActiveTabsCount = () => {
      var _a;
      return ((_a = storageStats.value) == null ? void 0 : _a.totalTabs) || 0;
    };
    const getProgressText = () => {
      if (isModelDownloading.value) {
        return getMessage("downloadingModelStatus", [modelDownloadProgress.value.toString()]);
      } else if (isModelSwitching.value) {
        return modelSwitchProgress.value || getMessage("switchingModelStatus");
      }
      return "";
    };
    const getErrorTypeText = () => {
      switch (modelErrorType.value) {
        case "network":
          return getMessage("networkErrorMessage");
        case "file":
          return getMessage("modelCorruptedErrorMessage");
        case "unknown":
        default:
          return getMessage("unknownErrorMessage");
      }
    };
    const getSemanticEngineButtonText = () => {
      switch (semanticEngineStatus.value) {
        case "ready":
          return getMessage("reinitializeButton");
        case "initializing":
          return getMessage("initializingStatus");
        case "error":
          return getMessage("reinitializeButton");
        case "idle":
        default:
          return getMessage("initSemanticEngineButton");
      }
    };
    const loadCacheStats = () => __async(null, null, function* () {
      try {
        cacheStats.value = yield getCacheStats();
      } catch (error) {
        console.error("Failed to get cache stats:", error);
        cacheStats.value = null;
      }
    });
    const cleanupCache = () => __async(null, null, function* () {
      if (isManagingCache.value) return;
      isManagingCache.value = true;
      try {
        yield cleanupModelCache();
        yield loadCacheStats();
      } catch (error) {
        console.error("Failed to cleanup cache:", error);
      } finally {
        isManagingCache.value = false;
      }
    });
    const clearAllCache = () => __async(null, null, function* () {
      if (isManagingCache.value) return;
      isManagingCache.value = true;
      try {
        yield clearModelCache();
        yield loadCacheStats();
      } catch (error) {
        console.error("Failed to clear cache:", error);
      } finally {
        isManagingCache.value = false;
      }
    });
    const saveSemanticEngineState = () => __async(null, null, function* () {
      try {
        const semanticEngineState = {
          status: semanticEngineStatus.value,
          lastUpdated: semanticEngineLastUpdated.value
        };
        yield chrome.storage.local.set({ semanticEngineState });
      } catch (error) {
        console.error("保存语义引擎状态失败:", error);
      }
    });
    const initializeSemanticEngine = () => __async(null, null, function* () {
      if (isSemanticEngineInitializing.value) return;
      const isReinitialization = semanticEngineStatus.value === "ready";
      console.log(
        `🚀 User triggered semantic engine ${isReinitialization ? "reinitialization" : "initialization"}`
      );
      isSemanticEngineInitializing.value = true;
      semanticEngineStatus.value = "initializing";
      semanticEngineInitProgress.value = isReinitialization ? getMessage("semanticEngineInitializingStatus") : getMessage("semanticEngineInitializingStatus");
      semanticEngineLastUpdated.value = Date.now();
      yield saveSemanticEngineState();
      try {
        chrome.runtime.sendMessage({
          type: BACKGROUND_MESSAGE_TYPES.INITIALIZE_SEMANTIC_ENGINE
        }).catch((error) => {
          console.error("❌ Error sending semantic engine initialization request:", error);
        });
        startSemanticEngineStatusPolling();
        semanticEngineInitProgress.value = isReinitialization ? getMessage("processingStatus") : getMessage("processingStatus");
      } catch (error) {
        console.error("❌ Failed to send initialization request:", error);
        semanticEngineStatus.value = "error";
        semanticEngineInitProgress.value = `Failed to send initialization request: ${(error == null ? void 0 : error.message) || "Unknown error"}`;
        yield saveSemanticEngineState();
        setTimeout(() => {
          semanticEngineInitProgress.value = "";
        }, 5e3);
        isSemanticEngineInitializing.value = false;
        semanticEngineLastUpdated.value = Date.now();
        yield saveSemanticEngineState();
      }
    });
    const checkSemanticEngineStatus = () => __async(null, null, function* () {
      try {
        const response = yield chrome.runtime.sendMessage({
          type: BACKGROUND_MESSAGE_TYPES.GET_MODEL_STATUS
        });
        if (response && response.success && response.status) {
          const status = response.status;
          if (status.initializationStatus === "ready") {
            semanticEngineStatus.value = "ready";
            semanticEngineLastUpdated.value = Date.now();
            isSemanticEngineInitializing.value = false;
            semanticEngineInitProgress.value = getMessage("semanticEngineReadyStatus");
            yield saveSemanticEngineState();
            stopSemanticEngineStatusPolling();
            setTimeout(() => {
              semanticEngineInitProgress.value = "";
            }, 2e3);
          } else if (status.initializationStatus === "downloading" || status.initializationStatus === "initializing") {
            semanticEngineStatus.value = "initializing";
            isSemanticEngineInitializing.value = true;
            semanticEngineInitProgress.value = getMessage("semanticEngineInitializingStatus");
            semanticEngineLastUpdated.value = Date.now();
            yield saveSemanticEngineState();
          } else if (status.initializationStatus === "error") {
            semanticEngineStatus.value = "error";
            semanticEngineLastUpdated.value = Date.now();
            isSemanticEngineInitializing.value = false;
            semanticEngineInitProgress.value = getMessage("semanticEngineInitFailedStatus");
            yield saveSemanticEngineState();
            stopSemanticEngineStatusPolling();
            setTimeout(() => {
              semanticEngineInitProgress.value = "";
            }, 5e3);
          } else {
            semanticEngineStatus.value = "idle";
            isSemanticEngineInitializing.value = false;
            yield saveSemanticEngineState();
          }
        } else {
          semanticEngineStatus.value = "idle";
          isSemanticEngineInitializing.value = false;
          yield saveSemanticEngineState();
        }
      } catch (error) {
        console.error("Popup: Failed to check semantic engine status:", error);
        semanticEngineStatus.value = "idle";
        isSemanticEngineInitializing.value = false;
        yield saveSemanticEngineState();
      }
    });
    const retryModelInitialization = () => __async(null, null, function* () {
      if (!currentModel.value) return;
      console.log("🔄 Retrying model initialization...");
      modelErrorMessage.value = "";
      modelErrorType.value = "";
      modelInitializationStatus.value = "downloading";
      modelDownloadProgress.value = 0;
      isModelDownloading.value = true;
      yield switchModel(currentModel.value);
    });
    const updatePort = (event) => __async(null, null, function* () {
      const target = event.target;
      const newPort = Number(target.value);
      nativeServerPort.value = newPort;
      yield savePortPreference(newPort);
    });
    const checkNativeConnection = () => __async(null, null, function* () {
      try {
        const response = yield chrome.runtime.sendMessage({ type: "ping_native" });
        nativeConnectionStatus.value = (response == null ? void 0 : response.connected) ? "connected" : "disconnected";
      } catch (error) {
        console.error("检测 Native 连接状态失败:", error);
        nativeConnectionStatus.value = "disconnected";
      }
    });
    const checkServerStatus = () => __async(null, null, function* () {
      try {
        const response = yield chrome.runtime.sendMessage({
          type: BACKGROUND_MESSAGE_TYPES.GET_SERVER_STATUS
        });
        if ((response == null ? void 0 : response.success) && response.serverStatus) {
          serverStatus.value = response.serverStatus;
        }
        if ((response == null ? void 0 : response.connected) !== void 0) {
          nativeConnectionStatus.value = response.connected ? "connected" : "disconnected";
        }
      } catch (error) {
        console.error("检测服务器状态失败:", error);
      }
    });
    const refreshServerStatus = () => __async(null, null, function* () {
      try {
        const response = yield chrome.runtime.sendMessage({
          type: BACKGROUND_MESSAGE_TYPES.REFRESH_SERVER_STATUS
        });
        if ((response == null ? void 0 : response.success) && response.serverStatus) {
          serverStatus.value = response.serverStatus;
        }
        if ((response == null ? void 0 : response.connected) !== void 0) {
          nativeConnectionStatus.value = response.connected ? "connected" : "disconnected";
        }
      } catch (error) {
        console.error("刷新服务器状态失败:", error);
      }
    });
    const checkNativeHostVersion = () => __async(null, null, function* () {
      try {
        const response = yield chrome.runtime.sendMessage({
          type: BACKGROUND_MESSAGE_TYPES.GET_NATIVE_HOST_VERSION
        });
        if ((response == null ? void 0 : response.success) && response.versionInfo) {
          nativeHostVersion.value = {
            version: response.versionInfo.version,
            isOutdated: response.versionInfo.isOutdated,
            minRequired: response.minRequired
          };
        }
      } catch (error) {
        console.error("获取 Native Host 版本失败:", error);
      }
    });
    const copyMcpConfig = () => __async(null, null, function* () {
      try {
        yield navigator.clipboard.writeText(mcpConfigJson.value);
        copyButtonText.value = "✅" + getMessage("configCopiedNotification");
        setTimeout(() => {
          copyButtonText.value = getMessage("copyConfigButton");
        }, 2e3);
      } catch (error) {
        console.error("复制配置失败:", error);
        copyButtonText.value = "❌" + getMessage("networkErrorMessage");
        setTimeout(() => {
          copyButtonText.value = getMessage("copyConfigButton");
        }, 2e3);
      }
    });
    const testNativeConnection = () => __async(null, null, function* () {
      if (isConnecting.value) return;
      isConnecting.value = true;
      try {
        if (nativeConnectionStatus.value === "connected") {
          yield chrome.runtime.sendMessage({ type: "disconnect_native" });
          nativeConnectionStatus.value = "disconnected";
        } else {
          console.log(`尝试连接到端口: ${nativeServerPort.value}`);
          const response = yield chrome.runtime.sendMessage({
            type: "connectNative",
            port: nativeServerPort.value
          });
          if (response && response.success) {
            nativeConnectionStatus.value = "connected";
            console.log("连接成功:", response);
            yield savePortPreference(nativeServerPort.value);
          } else {
            nativeConnectionStatus.value = "disconnected";
            console.error("连接失败:", response);
          }
        }
      } catch (error) {
        console.error("测试连接失败:", error);
        nativeConnectionStatus.value = "disconnected";
      } finally {
        isConnecting.value = false;
      }
    });
    const loadModelPreference = () => __async(null, null, function* () {
      try {
        const result = yield chrome.storage.local.get([
          "selectedModel",
          "selectedVersion",
          "modelState",
          "semanticEngineState"
        ]);
        if (result.selectedModel) {
          const storedModel = result.selectedModel;
          console.log("📋 Stored model from storage:", storedModel);
          if (PREDEFINED_MODELS[storedModel]) {
            currentModel.value = storedModel;
            console.log(`✅ Loaded valid model: ${currentModel.value}`);
          } else {
            console.warn(
              `⚠️ Stored model "${storedModel}" not found in PREDEFINED_MODELS, using default`
            );
            currentModel.value = "multilingual-e5-small";
            yield saveModelPreference(currentModel.value);
          }
        } else {
          console.log("⚠️ No model found in storage, using default");
          currentModel.value = "multilingual-e5-small";
          yield saveModelPreference(currentModel.value);
        }
        selectedVersion.value = "quantized";
        console.log("✅ Using quantized version (fixed)");
        yield saveVersionPreference("quantized");
        if (result.modelState) {
          const modelState = result.modelState;
          if (modelState.status === "ready") {
            modelInitializationStatus.value = "ready";
            modelDownloadProgress.value = modelState.downloadProgress || 100;
            isModelDownloading.value = false;
          } else {
            modelInitializationStatus.value = "idle";
            modelDownloadProgress.value = 0;
            isModelDownloading.value = false;
            yield saveModelState();
          }
        } else {
          modelInitializationStatus.value = "idle";
          modelDownloadProgress.value = 0;
          isModelDownloading.value = false;
        }
        if (result.semanticEngineState) {
          const semanticState = result.semanticEngineState;
          if (semanticState.status === "ready") {
            semanticEngineStatus.value = "ready";
            semanticEngineLastUpdated.value = semanticState.lastUpdated || Date.now();
          } else if (semanticState.status === "error") {
            semanticEngineStatus.value = "error";
            semanticEngineLastUpdated.value = semanticState.lastUpdated || Date.now();
          } else {
            semanticEngineStatus.value = "idle";
          }
        } else {
          semanticEngineStatus.value = "idle";
        }
      } catch (error) {
        console.error("❌ 加载模型偏好失败:", error);
      }
    });
    const saveModelPreference = (model) => __async(null, null, function* () {
      try {
        yield chrome.storage.local.set({ selectedModel: model });
      } catch (error) {
        console.error("保存模型偏好失败:", error);
      }
    });
    const saveVersionPreference = (version) => __async(null, null, function* () {
      try {
        yield chrome.storage.local.set({ selectedVersion: version });
      } catch (error) {
        console.error("保存版本偏好失败:", error);
      }
    });
    const savePortPreference = (port) => __async(null, null, function* () {
      try {
        yield chrome.storage.local.set({ nativeServerPort: port });
        console.log(`端口偏好已保存: ${port}`);
      } catch (error) {
        console.error("保存端口偏好失败:", error);
      }
    });
    const loadPortPreference = () => __async(null, null, function* () {
      try {
        const result = yield chrome.storage.local.get(["nativeServerPort"]);
        if (result.nativeServerPort) {
          nativeServerPort.value = result.nativeServerPort;
          console.log(`端口偏好已加载: ${result.nativeServerPort}`);
        }
      } catch (error) {
        console.error("加载端口偏好失败:", error);
      }
    });
    const saveWorldbookWebMCPPreference = () => __async(null, null, function* () {
      try {
        yield chrome.storage.local.set({ worldbookWebMCPEnabled: worldbookWebMCPEnabled.value });
        console.log(`Worldbook WebMCP preference saved: ${worldbookWebMCPEnabled.value}`);
      } catch (error) {
        console.error("Failed to save Worldbook WebMCP preference:", error);
      }
    });
    const loadWorldbookWebMCPPreference = () => __async(null, null, function* () {
      try {
        const result = yield chrome.storage.local.get(["worldbookWebMCPEnabled"]);
        if (result.worldbookWebMCPEnabled !== void 0) {
          worldbookWebMCPEnabled.value = result.worldbookWebMCPEnabled;
        } else {
          worldbookWebMCPEnabled.value = true;
        }
        console.log(`Worldbook WebMCP preference loaded: ${worldbookWebMCPEnabled.value}`);
      } catch (error) {
        console.error("Failed to load Worldbook WebMCP preference:", error);
      }
    });
    const toggleDebugCoordinates = () => __async(null, null, function* () {
      try {
        yield chrome.storage.local.set({ debugCoordinates: debugCoordinates.value });
        console.log(`Debug coordinates preference saved: ${debugCoordinates.value}`);
        const response = yield chrome.runtime.sendMessage({
          type: BACKGROUND_MESSAGE_TYPES.TOGGLE_COORDINATE_DISPLAY,
          enabled: debugCoordinates.value
        });
        if (response == null ? void 0 : response.success) {
          console.log(`Debug coordinates ${debugCoordinates.value ? "enabled" : "disabled"}`);
        } else {
          console.error("Failed to toggle debug coordinates:", response == null ? void 0 : response.error);
          debugCoordinates.value = !debugCoordinates.value;
          yield chrome.storage.local.set({ debugCoordinates: debugCoordinates.value });
        }
      } catch (error) {
        console.error("Failed to toggle debug coordinates:", error);
        debugCoordinates.value = !debugCoordinates.value;
      }
    });
    const loadDebugCoordinatesPreference = () => __async(null, null, function* () {
      try {
        const result = yield chrome.storage.local.get(["debugCoordinates"]);
        if (result.debugCoordinates !== void 0) {
          debugCoordinates.value = result.debugCoordinates;
        } else {
          debugCoordinates.value = false;
        }
        console.log(`Debug coordinates preference loaded: ${debugCoordinates.value}`);
      } catch (error) {
        console.error("Failed to load debug coordinates preference:", error);
      }
    });
    const saveShowLastClickPreference = () => __async(null, null, function* () {
      try {
        yield chrome.storage.local.set({ showLastClickOnScreenshot: showLastClickOnScreenshot.value });
        console.log(`Show last click preference saved: ${showLastClickOnScreenshot.value}`);
      } catch (error) {
        console.error("Failed to save show last click preference:", error);
      }
    });
    const loadShowLastClickPreference = () => __async(null, null, function* () {
      try {
        const result = yield chrome.storage.local.get(["showLastClickOnScreenshot"]);
        if (result.showLastClickOnScreenshot !== void 0) {
          showLastClickOnScreenshot.value = result.showLastClickOnScreenshot;
        } else {
          showLastClickOnScreenshot.value = false;
        }
        console.log(`Show last click preference loaded: ${showLastClickOnScreenshot.value}`);
      } catch (error) {
        console.error("Failed to load show last click preference:", error);
      }
    });
    const saveModelState = () => __async(null, null, function* () {
      try {
        const modelState = {
          status: modelInitializationStatus.value,
          downloadProgress: modelDownloadProgress.value,
          isDownloading: isModelDownloading.value,
          lastUpdated: Date.now()
        };
        yield chrome.storage.local.set({ modelState });
      } catch (error) {
        console.error("保存模型状态失败:", error);
      }
    });
    let statusMonitoringInterval = null;
    let semanticEngineStatusPollingInterval = null;
    const startModelStatusMonitoring = () => {
      if (statusMonitoringInterval) {
        clearInterval(statusMonitoringInterval);
      }
      statusMonitoringInterval = setInterval(() => __async(null, null, function* () {
        try {
          const response = yield chrome.runtime.sendMessage({
            type: "get_model_status"
          });
          if (response && response.success) {
            const status = response.status;
            modelInitializationStatus.value = status.initializationStatus || "idle";
            modelDownloadProgress.value = status.downloadProgress || 0;
            isModelDownloading.value = status.isDownloading || false;
            if (status.initializationStatus === "error") {
              modelErrorMessage.value = status.errorMessage || getMessage("modelFailedStatus");
              modelErrorType.value = status.errorType || "unknown";
            } else {
              modelErrorMessage.value = "";
              modelErrorType.value = "";
            }
            yield saveModelState();
            if (status.initializationStatus === "ready" || status.initializationStatus === "error") {
              stopModelStatusMonitoring();
            }
          }
        } catch (error) {
          console.error("获取模型状态失败:", error);
        }
      }), 1e3);
    };
    const stopModelStatusMonitoring = () => {
      if (statusMonitoringInterval) {
        clearInterval(statusMonitoringInterval);
        statusMonitoringInterval = null;
      }
    };
    const startSemanticEngineStatusPolling = () => {
      if (semanticEngineStatusPollingInterval) {
        clearInterval(semanticEngineStatusPollingInterval);
      }
      semanticEngineStatusPollingInterval = setInterval(() => __async(null, null, function* () {
        try {
          yield checkSemanticEngineStatus();
        } catch (error) {
          console.error("Semantic engine status polling failed:", error);
        }
      }), 2e3);
    };
    const stopSemanticEngineStatusPolling = () => {
      if (semanticEngineStatusPollingInterval) {
        clearInterval(semanticEngineStatusPollingInterval);
        semanticEngineStatusPollingInterval = null;
      }
    };
    const refreshStorageStats = () => __async(null, null, function* () {
      if (isRefreshingStats.value) return;
      isRefreshingStats.value = true;
      try {
        console.log("🔄 Refreshing storage statistics...");
        const response = yield chrome.runtime.sendMessage({
          type: "get_storage_stats"
        });
        if (response && response.success) {
          storageStats.value = {
            indexedPages: response.stats.indexedPages || 0,
            totalDocuments: response.stats.totalDocuments || 0,
            totalTabs: response.stats.totalTabs || 0,
            indexSize: response.stats.indexSize || 0,
            isInitialized: response.stats.isInitialized || false
          };
          console.log("✅ Storage stats refreshed:", storageStats.value);
        } else {
          console.error("❌ Failed to get storage stats:", response == null ? void 0 : response.error);
          storageStats.value = {
            indexedPages: 0,
            totalDocuments: 0,
            totalTabs: 0,
            indexSize: 0,
            isInitialized: false
          };
        }
      } catch (error) {
        console.error("❌ Error refreshing storage stats:", error);
        storageStats.value = {
          indexedPages: 0,
          totalDocuments: 0,
          totalTabs: 0,
          indexSize: 0,
          isInitialized: false
        };
      } finally {
        isRefreshingStats.value = false;
      }
    });
    const hideClearDataConfirmation = () => {
      showClearConfirmation.value = false;
    };
    const confirmClearAllData = () => __async(null, null, function* () {
      if (isClearingData.value) return;
      isClearingData.value = true;
      clearDataProgress.value = getMessage("clearingStatus");
      try {
        console.log("🗑️ Starting to clear all data...");
        const response = yield chrome.runtime.sendMessage({
          type: "clear_all_data"
        });
        if (response && response.success) {
          clearDataProgress.value = getMessage("dataClearedNotification");
          console.log("✅ All data cleared successfully");
          yield refreshStorageStats();
          setTimeout(() => {
            clearDataProgress.value = "";
            hideClearDataConfirmation();
          }, 2e3);
        } else {
          throw new Error((response == null ? void 0 : response.error) || "Failed to clear data");
        }
      } catch (error) {
        console.error("❌ Failed to clear all data:", error);
        clearDataProgress.value = `Failed to clear data: ${(error == null ? void 0 : error.message) || "Unknown error"}`;
        setTimeout(() => {
          clearDataProgress.value = "";
        }, 5e3);
      } finally {
        isClearingData.value = false;
      }
    });
    const switchModel = (newModel) => __async(null, null, function* () {
      console.log(`🔄 switchModel called with newModel: ${newModel}`);
      if (isModelSwitching.value) {
        console.log("⏸️ Model switch already in progress, skipping");
        return;
      }
      const isSameModel = newModel === currentModel.value;
      const currentModelInfo = currentModel.value ? getModelInfo(currentModel.value) : getModelInfo("multilingual-e5-small");
      const newModelInfo = getModelInfo(newModel);
      const isDifferentDimension = currentModelInfo.dimension !== newModelInfo.dimension;
      console.log(`📊 Switch analysis:`);
      console.log(`   - Same model: ${isSameModel} (${currentModel.value} -> ${newModel})`);
      console.log(
        `   - Current dimension: ${currentModelInfo.dimension}, New dimension: ${newModelInfo.dimension}`
      );
      console.log(`   - Different dimension: ${isDifferentDimension}`);
      if (isSameModel && !isDifferentDimension) {
        console.log("✅ Same model and dimension - no need to switch");
        return;
      }
      const switchReasons = [];
      if (!isSameModel) switchReasons.push("different model");
      if (isDifferentDimension) switchReasons.push("different dimension");
      console.log(`🚀 Switching model due to: ${switchReasons.join(", ")}`);
      console.log(
        `📋 Model: ${currentModel.value} (${currentModelInfo.dimension}D) -> ${newModel} (${newModelInfo.dimension}D)`
      );
      isModelSwitching.value = true;
      modelSwitchProgress.value = getMessage("switchingModelStatus");
      modelInitializationStatus.value = "downloading";
      modelDownloadProgress.value = 0;
      isModelDownloading.value = true;
      try {
        yield saveModelPreference(newModel);
        yield saveVersionPreference("quantized");
        yield saveModelState();
        modelSwitchProgress.value = getMessage("semanticEngineInitializingStatus");
        startModelStatusMonitoring();
        const response = yield chrome.runtime.sendMessage({
          type: "switch_semantic_model",
          modelPreset: newModel,
          modelVersion: "quantized",
          modelDimension: newModelInfo.dimension,
          previousDimension: currentModelInfo.dimension
        });
        if (response && response.success) {
          currentModel.value = newModel;
          modelSwitchProgress.value = getMessage("successNotification");
          console.log(
            "模型切换成功:",
            newModel,
            "version: quantized",
            "dimension:",
            newModelInfo.dimension
          );
          modelInitializationStatus.value = "ready";
          isModelDownloading.value = false;
          yield saveModelState();
          setTimeout(() => {
            modelSwitchProgress.value = "";
          }, 2e3);
        } else {
          throw new Error((response == null ? void 0 : response.error) || "Model switch failed");
        }
      } catch (error) {
        console.error("模型切换失败:", error);
        modelSwitchProgress.value = `Model switch failed: ${(error == null ? void 0 : error.message) || "Unknown error"}`;
        modelInitializationStatus.value = "error";
        isModelDownloading.value = false;
        const errorMessage = (error == null ? void 0 : error.message) || "未知错误";
        if (errorMessage.includes("network") || errorMessage.includes("fetch") || errorMessage.includes("timeout")) {
          modelErrorType.value = "network";
          modelErrorMessage.value = getMessage("networkErrorMessage");
        } else if (errorMessage.includes("corrupt") || errorMessage.includes("invalid") || errorMessage.includes("format")) {
          modelErrorType.value = "file";
          modelErrorMessage.value = getMessage("modelCorruptedErrorMessage");
        } else {
          modelErrorType.value = "unknown";
          modelErrorMessage.value = errorMessage;
        }
        yield saveModelState();
        setTimeout(() => {
          modelSwitchProgress.value = "";
        }, 8e3);
      } finally {
        isModelSwitching.value = false;
      }
    });
    const setupServerStatusListener = () => {
      chrome.runtime.onMessage.addListener((message) => {
        if (message.type === BACKGROUND_MESSAGE_TYPES.SERVER_STATUS_CHANGED && message.payload) {
          serverStatus.value = message.payload;
          console.log("Server status updated:", message.payload);
        }
      });
    };
    onMounted(() => __async(null, null, function* () {
      yield loadPortPreference();
      yield loadWorldbookWebMCPPreference();
      yield loadDebugCoordinatesPreference();
      yield loadShowLastClickPreference();
      yield loadModelPreference();
      yield checkNativeConnection();
      yield checkServerStatus();
      yield checkNativeHostVersion();
      yield refreshStorageStats();
      yield loadCacheStats();
      yield checkSemanticEngineStatus();
      setupServerStatusListener();
    }));
    onUnmounted(() => {
      stopModelStatusMonitoring();
      stopSemanticEngineStatusPolling();
    });
    return (_ctx, _cache) => {
      var _a, _b, _c;
      return openBlock(), createElementBlock("div", _hoisted_1, [
        _cache[29] || (_cache[29] = createStaticVNode('<div class="header" data-v-a8340e6d><div class="header-content" data-v-a8340e6d><div class="header-title-group" data-v-a8340e6d><h1 class="header-title" data-v-a8340e6d>MCP Chrome Extension</h1><span class="build-version" data-v-a8340e6d>Build: 2026-04-04 23:10</span></div></div></div>', 1)),
        createBaseVNode("div", _hoisted_2, [
          createCommentVNode("", true),
          createCommentVNode("", true),
          createBaseVNode("div", _hoisted_65, [
            createBaseVNode("h2", _hoisted_66, toDisplayString(unref(getMessage)("nativeServerConfigLabel")), 1),
            createBaseVNode("div", _hoisted_67, [
              createBaseVNode("div", _hoisted_68, [
                createBaseVNode("div", _hoisted_69, [
                  createBaseVNode("p", _hoisted_70, toDisplayString(unref(getMessage)("runningStatusLabel")), 1),
                  createBaseVNode("button", {
                    class: "refresh-status-button",
                    onClick: refreshServerStatus,
                    title: unref(getMessage)("refreshStatusButton")
                  }, " 🔄 ", 8, _hoisted_71)
                ]),
                createBaseVNode("div", _hoisted_72, [
                  createBaseVNode("span", {
                    class: normalizeClass(["status-dot", getStatusClass()])
                  }, null, 2),
                  createBaseVNode("span", _hoisted_73, toDisplayString(getStatusText()), 1)
                ]),
                serverStatus.value.lastUpdated ? (openBlock(), createElementBlock("div", _hoisted_74, toDisplayString(unref(getMessage)("lastUpdatedLabel")) + " " + toDisplayString(new Date(serverStatus.value.lastUpdated).toLocaleTimeString()), 1)) : createCommentVNode("", true)
              ]),
              ((_a = nativeHostVersion.value) == null ? void 0 : _a.isOutdated) ? (openBlock(), createElementBlock("div", _hoisted_75, [
                _cache[16] || (_cache[16] = createBaseVNode("div", { class: "warning-icon" }, "⚠️", -1)),
                createBaseVNode("div", _hoisted_76, [
                  _cache[14] || (_cache[14] = createBaseVNode("p", { class: "warning-title" }, "Native Host Outdated", -1)),
                  createBaseVNode("p", _hoisted_77, " Installed: v" + toDisplayString(nativeHostVersion.value.version) + " | Required: v" + toDisplayString(nativeHostVersion.value.minRequired), 1),
                  _cache[15] || (_cache[15] = createBaseVNode("p", { class: "warning-command" }, [
                    createTextVNode("Run: "),
                    createBaseVNode("code", null, "npm update -g mcp-chrome-bridger")
                  ], -1))
                ])
              ])) : nativeHostVersion.value && nativeConnectionStatus.value === "connected" ? (openBlock(), createElementBlock("div", _hoisted_78, [
                _cache[17] || (_cache[17] = createBaseVNode("span", { class: "version-label" }, "Native Host:", -1)),
                createBaseVNode("span", _hoisted_79, "v" + toDisplayString(nativeHostVersion.value.version), 1)
              ])) : createCommentVNode("", true),
              showMcpConfig.value ? (openBlock(), createElementBlock("div", _hoisted_80, [
                createBaseVNode("div", _hoisted_81, [
                  createBaseVNode("p", _hoisted_82, toDisplayString(unref(getMessage)("mcpServerConfigLabel")), 1),
                  createBaseVNode("button", {
                    class: "copy-config-button",
                    onClick: copyMcpConfig
                  }, toDisplayString(copyButtonText.value), 1)
                ]),
                createBaseVNode("div", _hoisted_83, [
                  createBaseVNode("pre", _hoisted_84, toDisplayString(mcpConfigJson.value), 1)
                ])
              ])) : createCommentVNode("", true),
              createBaseVNode("div", _hoisted_85, [
                createBaseVNode("label", _hoisted_86, toDisplayString(unref(getMessage)("connectionPortLabel")), 1),
                createBaseVNode("input", {
                  type: "text",
                  id: "port",
                  value: nativeServerPort.value,
                  onInput: updatePort,
                  class: "port-input"
                }, null, 40, _hoisted_87)
              ]),
              createBaseVNode("button", {
                class: "connect-button",
                disabled: isConnecting.value,
                onClick: testNativeConnection
              }, [
                createVNode(unref(_sfc_main$6)),
                createBaseVNode("span", null, toDisplayString(isConnecting.value ? unref(getMessage)("connectingStatus") : nativeConnectionStatus.value === "connected" ? unref(getMessage)("disconnectButton") : unref(getMessage)("connectButton")), 1)
              ], 8, _hoisted_88),
              createBaseVNode("div", _hoisted_89, [
                createBaseVNode("label", _hoisted_90, [
                  withDirectives(createBaseVNode("input", {
                    type: "checkbox",
                    "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => worldbookWebMCPEnabled.value = $event),
                    onChange: saveWorldbookWebMCPPreference
                  }, null, 544), [
                    [vModelCheckbox, worldbookWebMCPEnabled.value]
                  ]),
                  _cache[18] || (_cache[18] = createBaseVNode("span", { class: "checkbox-text" }, "Worldbook WebMCP", -1)),
                  _cache[19] || (_cache[19] = createBaseVNode("a", {
                    href: "https://worldbook.it.com/",
                    target: "_blank",
                    class: "help-icon",
                    title: "Worldbook is a community-driven registry of WebMCP site tools. When enabled, MCP Chrome Extension fetches tool configurations from the Worldbook API, giving you access to pre-configured tools for popular websites."
                  }, "?", -1))
                ]),
                _cache[20] || (_cache[20] = createBaseVNode("p", { class: "option-description" }, "Fetch site tools config from Worldbook API when enabled", -1))
              ]),
              createBaseVNode("div", _hoisted_91, [
                createBaseVNode("label", _hoisted_92, [
                  withDirectives(createBaseVNode("input", {
                    type: "checkbox",
                    "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => debugCoordinates.value = $event),
                    onChange: toggleDebugCoordinates
                  }, null, 544), [
                    [vModelCheckbox, debugCoordinates.value]
                  ]),
                  _cache[21] || (_cache[21] = createBaseVNode("span", { class: "checkbox-text" }, "Debug Coordinates", -1)),
                  _cache[22] || (_cache[22] = createBaseVNode("span", {
                    class: "help-icon",
                    title: "When enabled, shows a floating display with mouse coordinates as you move the cursor. Useful for debugging click positions."
                  }, "?", -1))
                ]),
                _cache[23] || (_cache[23] = createBaseVNode("p", { class: "option-description" }, "Show mouse coordinates on page (for debugging)", -1))
              ]),
              createBaseVNode("div", _hoisted_93, [
                createBaseVNode("label", _hoisted_94, [
                  withDirectives(createBaseVNode("input", {
                    type: "checkbox",
                    "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => showLastClickOnScreenshot.value = $event),
                    onChange: saveShowLastClickPreference
                  }, null, 544), [
                    [vModelCheckbox, showLastClickOnScreenshot.value]
                  ]),
                  _cache[24] || (_cache[24] = createBaseVNode("span", { class: "checkbox-text" }, "Show Last Click on Screenshot", -1)),
                  _cache[25] || (_cache[25] = createBaseVNode("span", {
                    class: "help-icon",
                    title: "When enabled, screenshots will show a red marker at the last click position. Useful for debugging coordinate conversions."
                  }, "?", -1))
                ]),
                _cache[26] || (_cache[26] = createBaseVNode("p", { class: "option-description" }, "Mark last click position on screenshots (for debugging)", -1))
              ])
            ])
          ]),
          createBaseVNode("div", _hoisted_95, [
            createBaseVNode("h2", _hoisted_96, toDisplayString(unref(getMessage)("semanticEngineLabel")), 1),
            createBaseVNode("div", _hoisted_97, [
              createBaseVNode("div", _hoisted_98, [
                createBaseVNode("div", _hoisted_99, [
                  createBaseVNode("span", {
                    class: normalizeClass(["status-dot", getSemanticEngineStatusClass()])
                  }, null, 2),
                  createBaseVNode("span", _hoisted_100, toDisplayString(getSemanticEngineStatusText()), 1)
                ]),
                semanticEngineLastUpdated.value ? (openBlock(), createElementBlock("div", _hoisted_101, toDisplayString(unref(getMessage)("lastUpdatedLabel")) + " " + toDisplayString(new Date(semanticEngineLastUpdated.value).toLocaleTimeString()), 1)) : createCommentVNode("", true)
              ]),
              isSemanticEngineInitializing.value ? (openBlock(), createBlock(ProgressIndicator, {
                key: 0,
                visible: isSemanticEngineInitializing.value,
                text: semanticEngineInitProgress.value,
                showSpinner: true
              }, null, 8, ["visible", "text"])) : createCommentVNode("", true),
              createBaseVNode("button", {
                class: "semantic-engine-button",
                disabled: isSemanticEngineInitializing.value,
                onClick: initializeSemanticEngine
              }, [
                createVNode(unref(_sfc_main$6)),
                createBaseVNode("span", null, toDisplayString(getSemanticEngineButtonText()), 1)
              ], 8, _hoisted_102)
            ])
          ]),
          createBaseVNode("div", _hoisted_103, [
            createBaseVNode("h2", _hoisted_104, toDisplayString(unref(getMessage)("embeddingModelLabel")), 1),
            isModelSwitching.value || isModelDownloading.value ? (openBlock(), createBlock(ProgressIndicator, {
              key: 0,
              visible: isModelSwitching.value || isModelDownloading.value,
              text: getProgressText(),
              showSpinner: true
            }, null, 8, ["visible", "text"])) : createCommentVNode("", true),
            modelInitializationStatus.value === "error" ? (openBlock(), createElementBlock("div", _hoisted_105, [
              createBaseVNode("div", _hoisted_106, [
                _cache[27] || (_cache[27] = createBaseVNode("div", { class: "error-icon" }, "⚠️", -1)),
                createBaseVNode("div", _hoisted_107, [
                  createBaseVNode("p", _hoisted_108, toDisplayString(unref(getMessage)("semanticEngineInitFailedStatus")), 1),
                  createBaseVNode("p", _hoisted_109, toDisplayString(modelErrorMessage.value || unref(getMessage)("semanticEngineInitFailedStatus")), 1),
                  createBaseVNode("p", _hoisted_110, toDisplayString(getErrorTypeText()), 1)
                ])
              ]),
              createBaseVNode("button", {
                class: "retry-button",
                onClick: retryModelInitialization,
                disabled: isModelSwitching.value || isModelDownloading.value
              }, [
                _cache[28] || (_cache[28] = createBaseVNode("span", null, "🔄", -1)),
                createBaseVNode("span", null, toDisplayString(unref(getMessage)("retryButton")), 1)
              ], 8, _hoisted_111)
            ])) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_112, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(availableModels.value, (model) => {
                return openBlock(), createElementBlock("div", {
                  key: model.preset,
                  class: normalizeClass([
                    "model-card",
                    {
                      selected: currentModel.value === model.preset,
                      disabled: isModelSwitching.value || isModelDownloading.value
                    }
                  ]),
                  onClick: ($event) => !isModelSwitching.value && !isModelDownloading.value && switchModel(model.preset)
                }, [
                  createBaseVNode("div", _hoisted_114, [
                    createBaseVNode("div", _hoisted_115, [
                      createBaseVNode("p", {
                        class: normalizeClass(["model-name", { "selected-text": currentModel.value === model.preset }])
                      }, toDisplayString(model.preset), 3),
                      createBaseVNode("p", _hoisted_116, toDisplayString(getModelDescription(model)), 1)
                    ]),
                    currentModel.value === model.preset ? (openBlock(), createElementBlock("div", _hoisted_117, [
                      createVNode(unref(_sfc_main$4), { class: "text-white" })
                    ])) : createCommentVNode("", true)
                  ]),
                  createBaseVNode("div", _hoisted_118, [
                    createBaseVNode("span", _hoisted_119, toDisplayString(getPerformanceText(model.performance)), 1),
                    createBaseVNode("span", _hoisted_120, toDisplayString(model.size), 1),
                    createBaseVNode("span", _hoisted_121, toDisplayString(model.dimension) + "D", 1)
                  ])
                ], 10, _hoisted_113);
              }), 128))
            ])
          ]),
          createBaseVNode("div", _hoisted_122, [
            createBaseVNode("h2", _hoisted_123, toDisplayString(unref(getMessage)("indexDataManagementLabel")), 1),
            createBaseVNode("div", _hoisted_124, [
              createBaseVNode("div", _hoisted_125, [
                createBaseVNode("div", _hoisted_126, [
                  createBaseVNode("p", _hoisted_127, toDisplayString(unref(getMessage)("indexedPagesLabel")), 1),
                  createBaseVNode("span", _hoisted_128, [
                    createVNode(unref(_sfc_main$8))
                  ])
                ]),
                createBaseVNode("p", _hoisted_129, toDisplayString(((_b = storageStats.value) == null ? void 0 : _b.indexedPages) || 0), 1)
              ]),
              createBaseVNode("div", _hoisted_130, [
                createBaseVNode("div", _hoisted_131, [
                  createBaseVNode("p", _hoisted_132, toDisplayString(unref(getMessage)("indexSizeLabel")), 1),
                  createBaseVNode("span", _hoisted_133, [
                    createVNode(unref(_sfc_main$7))
                  ])
                ]),
                createBaseVNode("p", _hoisted_134, toDisplayString(formatIndexSize()), 1)
              ]),
              createBaseVNode("div", _hoisted_135, [
                createBaseVNode("div", _hoisted_136, [
                  createBaseVNode("p", _hoisted_137, toDisplayString(unref(getMessage)("activeTabsLabel")), 1),
                  createBaseVNode("span", _hoisted_138, [
                    createVNode(unref(_sfc_main$3))
                  ])
                ]),
                createBaseVNode("p", _hoisted_139, toDisplayString(getActiveTabsCount()), 1)
              ]),
              createBaseVNode("div", _hoisted_140, [
                createBaseVNode("div", _hoisted_141, [
                  createBaseVNode("p", _hoisted_142, toDisplayString(unref(getMessage)("vectorDocumentsLabel")), 1),
                  createBaseVNode("span", _hoisted_143, [
                    createVNode(unref(_sfc_main$2))
                  ])
                ]),
                createBaseVNode("p", _hoisted_144, toDisplayString(((_c = storageStats.value) == null ? void 0 : _c.totalDocuments) || 0), 1)
              ])
            ]),
            isClearingData.value && clearDataProgress.value ? (openBlock(), createBlock(ProgressIndicator, {
              key: 0,
              visible: isClearingData.value,
              text: clearDataProgress.value,
              showSpinner: true
            }, null, 8, ["visible", "text"])) : createCommentVNode("", true),
            createBaseVNode("button", {
              class: "danger-button",
              disabled: isClearingData.value,
              onClick: _cache[5] || (_cache[5] = ($event) => showClearConfirmation.value = true)
            }, [
              createVNode(unref(_sfc_main$5)),
              createBaseVNode("span", null, toDisplayString(isClearingData.value ? unref(getMessage)("clearingStatus") : unref(getMessage)("clearAllDataButton")), 1)
            ], 8, _hoisted_145)
          ]),
          createVNode(ModelCacheManagement, {
            "cache-stats": cacheStats.value,
            "is-managing-cache": isManagingCache.value,
            onCleanupCache: cleanupCache,
            onClearAllCache: clearAllCache
          }, null, 8, ["cache-stats", "is-managing-cache"])
        ]),
        _cache[30] || (_cache[30] = createBaseVNode("div", { class: "footer" }, [
          createBaseVNode("p", { class: "footer-text" }, "chrome mcp server for ai")
        ], -1)),
        createVNode(ConfirmDialog, {
          visible: showClearConfirmation.value,
          title: unref(getMessage)("confirmClearDataTitle"),
          message: unref(getMessage)("clearDataWarningMessage"),
          items: [
            unref(getMessage)("clearDataList1"),
            unref(getMessage)("clearDataList2"),
            unref(getMessage)("clearDataList3")
          ],
          warning: unref(getMessage)("clearDataIrreversibleWarning"),
          icon: "⚠️",
          "confirm-text": unref(getMessage)("confirmClearButton"),
          "cancel-text": unref(getMessage)("cancelButton"),
          "confirming-text": unref(getMessage)("clearingStatus"),
          "is-confirming": isClearingData.value,
          onConfirm: confirmClearAllData,
          onCancel: hideClearDataConfirmation
        }, null, 8, ["visible", "title", "message", "items", "warning", "confirm-text", "cancel-text", "confirming-text", "is-confirming"])
      ]);
    };
  }
});
const App = /* @__PURE__ */ _export_sfc(_sfc_main, [["__scopeId", "data-v-a8340e6d"]]);
createApp(App).mount("#app");
