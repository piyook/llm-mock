import "clsx";
import { a1 as attr_class, a2 as bind_props, a3 as fallback, e as escape_html, a4 as ensure_array_like, a as attr } from "../../chunks/index.js";
function StatusIndicator($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let status = fallback($$props["status"], "checking");
    let dots = "";
    let interval;
    if (status === "online" && !interval) {
      interval = setInterval(
        () => {
          dots = dots.length < 3 ? dots + "." : "";
        },
        300
      );
    } else if (status !== "online" && interval) {
      clearInterval(interval);
      interval = null;
      dots = "";
    }
    $$renderer2.push(`<div${attr_class("status svelte-193vlpn", void 0, {
      "online": status === "online",
      "offline": status === "offline"
    })}><div class="status-icon svelte-193vlpn">`);
    if (status === "online") {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="10" fill="#2ecc40"></circle><path d="M6 10.5l3 3 5-6.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>`);
    } else if (status === "offline") {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" fill="#ff4136"></circle><path d="M15 9L9 15M9 9L15 15" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="checking svelte-193vlpn"></div>`);
    }
    $$renderer2.push(`<!--]--></div> <div class="status-text svelte-193vlpn">`);
    if (status === "online") {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`Running${escape_html(dots)}`);
    } else if (status === "offline") {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`Not Running`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`Checking...`);
    }
    $$renderer2.push(`<!--]--></div></div>`);
    bind_props($$props, { status });
  });
}
function EndpointList($$renderer, $$props) {
  let endpoints = fallback($$props["endpoints"], () => [], true);
  $$renderer.push(`<div class="endpoints svelte-dr2ghn"><!--[-->`);
  const each_array = ensure_array_like(endpoints);
  for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
    let endpoint = each_array[$$index];
    $$renderer.push(`<a${attr("href", endpoint.url)} class="endpoint-link svelte-dr2ghn" target="_blank">${escape_html(endpoint.url)}</a>`);
  }
  $$renderer.push(`<!--]--></div>`);
  bind_props($$props, { endpoints });
}
function ConfigSummary($$renderer, $$props) {
  let displayConfig;
  let config = fallback($$props["config"], () => ({}), true);
  let dbEntries = fallback($$props["dbEntries"], 0);
  const defaultConfig = {
    SERVER_PORT: "8001",
    LLM_URL_ENDPOINT: "chatgpt/chat/completions",
    LLM_NAME: "chatgpt",
    MOCK_LLM_RESPONSE_TYPE: "lorem",
    VALIDATE_REQUESTS: "ON",
    LOG_REQUESTS: "ON",
    RESPONSE_DELAY_MIN: "3000",
    RESPONSE_DELAY_MAX: "5000"
  };
  displayConfig = { ...defaultConfig, ...config };
  $$renderer.push(`<div class="config-list svelte-1q7k4ym"><div class="config-item svelte-1q7k4ym"><span class="label svelte-1q7k4ym">Server Address:</span> <span class="value svelte-1q7k4ym">localhost</span></div> <div class="config-item svelte-1q7k4ym"><span class="label svelte-1q7k4ym">Server Port:</span> <span class="value highlight svelte-1q7k4ym">${escape_html(displayConfig.SERVER_PORT)}</span></div> <div class="config-item svelte-1q7k4ym"><span class="label svelte-1q7k4ym">Server URL:</span> <span class="value highlight svelte-1q7k4ym">${escape_html(displayConfig.LLM_URL_ENDPOINT?.toUpperCase())}</span></div> <div class="config-item svelte-1q7k4ym"><span class="label svelte-1q7k4ym">LLM Template:</span> <span class="value highlight svelte-1q7k4ym">${escape_html(displayConfig.LLM_NAME?.toUpperCase())}</span></div> <div class="config-item svelte-1q7k4ym"><span class="label svelte-1q7k4ym">Response Type:</span> <span class="value highlight svelte-1q7k4ym">${escape_html(displayConfig.MOCK_LLM_RESPONSE_TYPE?.toUpperCase())}</span></div> `);
  if (displayConfig.MOCK_LLM_RESPONSE_TYPE === "lorem") {
    $$renderer.push("<!--[-->");
    $$renderer.push(`<div class="config-item svelte-1q7k4ym"><span class="label svelte-1q7k4ym">Maximum sentences:</span> <span class="value highlight svelte-1q7k4ym">${escape_html(displayConfig.MAX_LOREM_PARAS || "8")}</span></div>`);
  } else {
    $$renderer.push("<!--[!-->");
  }
  $$renderer.push(`<!--]--> `);
  if (displayConfig.MOCK_LLM_RESPONSE_TYPE === "stored") {
    $$renderer.push("<!--[-->");
    $$renderer.push(`<div class="config-item svelte-1q7k4ym"><span class="label svelte-1q7k4ym">Total Stored Responses:</span> <span class="value highlight svelte-1q7k4ym">${escape_html(dbEntries)}</span></div>`);
  } else {
    $$renderer.push("<!--[!-->");
  }
  $$renderer.push(`<!--]--> <div class="config-item svelte-1q7k4ym"><span class="label svelte-1q7k4ym">LLM Request Validation:</span> <span class="value highlight svelte-1q7k4ym">${escape_html(displayConfig.VALIDATE_REQUESTS?.toUpperCase())}</span></div> <div class="config-item svelte-1q7k4ym"><span class="label svelte-1q7k4ym">Http Request Log:</span> <span class="value highlight svelte-1q7k4ym">${escape_html(displayConfig.LOG_REQUESTS?.toUpperCase())}</span></div> <div class="config-item svelte-1q7k4ym"><span class="label svelte-1q7k4ym">Response Delay Min:</span> <span class="value svelte-1q7k4ym">${escape_html(displayConfig.RESPONSE_DELAY_MIN || "0")}ms</span></div> <div class="config-item svelte-1q7k4ym"><span class="label svelte-1q7k4ym">Response Delay Max:</span> <span class="value svelte-1q7k4ym">${escape_html(displayConfig.RESPONSE_DELAY_MAX || "0")}ms</span></div> <div class="config-item svelte-1q7k4ym"><span class="label svelte-1q7k4ym">Delay Status:</span> <span class="value highlight svelte-1q7k4ym">${escape_html(parseInt(displayConfig.RESPONSE_DELAY_MIN || "0") > 0 || parseInt(displayConfig.RESPONSE_DELAY_MAX || "0") > 0 ? "ENABLED" : "DISABLED")}</span></div></div>`);
  bind_props($$props, { config, dbEntries });
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let serverStatus = "checking";
    let config = {};
    let endpoints = [];
    let dbEntries = 0;
    $$renderer2.push(`<main class="svelte-1uha8ag"><div class="header svelte-1uha8ag"><h1 class="svelte-1uha8ag">Mock LLM Server Dashboard</h1> `);
    StatusIndicator($$renderer2, { status: serverStatus });
    $$renderer2.push(`<!----></div> <section class="config-section svelte-1uha8ag"><h2 class="svelte-1uha8ag">Server Configuration</h2> `);
    ConfigSummary($$renderer2, { config, dbEntries });
    $$renderer2.push(`<!----></section> <section class="endpoints-section svelte-1uha8ag"><h2 class="svelte-1uha8ag">API Endpoints</h2> `);
    EndpointList($$renderer2, { endpoints });
    $$renderer2.push(`<!----></section> <section class="links-section svelte-1uha8ag"><h2 class="svelte-1uha8ag">Quick Links</h2> <div class="links svelte-1uha8ag"><a href="/logs" class="link-button svelte-1uha8ag">View Request Logs</a> <a href="/config" class="link-button svelte-1uha8ag">Configuration Editor</a></div></section></main>`);
  });
}
export {
  _page as default
};
