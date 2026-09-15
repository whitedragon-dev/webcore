// ============================================
// Webcore AI Worker — Full Regeneration Support
// Cloudflare Workers + D1 + Workers AI
//
// Regeneration model: messages form a tree (each row has a parent_id).
// Regenerating an assistant message creates a sibling branch rather than
// overwriting anything, and each parent remembers which child is the
// "active" one (active_child_id) — the same branching model claude.ai
// uses, so every regenerated variant stays in the database and is
// reachable again later, from any device.
// ============================================

// ===== CONFIGURATION =====
var CONFIG = {
  MODEL: '@cf/meta/llama-4-scout-17b-16e-instruct',
  TEMPERATURE: 0.7,
  MAX_TOKENS: 1000,
  MAX_PROMPT_LENGTH: 2000,
  MAX_HISTORY: 20,
  DAILY_NEURON_LIMIT: 10000,
  CORS_ORIGIN: '*',
  MAX_SEARCH_RESULTS: 5,
  SEARCH_TIMEOUT_MS: 8000,
  MAX_PAGE_LINKS: 2,
  PAGE_FETCH_TIMEOUT_MS: 8000,
  MAX_PAGE_TEXT_LENGTH: 6000,
  // Agent loop: how many tool-calling rounds before we force a final
  // answer. Each round is a full model call, so this is the main cost
  // and latency knob.
  MAX_AGENT_STEPS: 5,
  MAX_TOOL_RESULT_LENGTH: 4000,
  // Long-conversation memory: the most recent MEMORY_RECENT_VERBATIM
  // messages are always sent to the model word-for-word. Anything older
  // gets folded into a running summary instead of being dropped, so
  // nothing is silently forgotten even in very long conversations.
  MEMORY_RECENT_VERBATIM: 30,
  MEMORY_SUMMARY_TRIGGER: 20,
  MEMORY_SUMMARY_MAX_TOKENS: 300
};

// ===== FREE MODELS ALLOWLIST =====
var FREE_MODELS = {
  '@cf/meta/llama-4-scout-17b-16e-instruct': { name: 'Llama 4 17B', maxTokens: 1000 },
  '@cf/openai/gpt-oss-120b': { name: 'GPT-OSS 120B', maxTokens: 1000 },
  '@cf/google/gemma-4-26b-a4b-it': { name: 'Gemma 4 26B', maxTokens: 800 },
  '@cf/zai-org/glm-4.7-flash': { name: 'GLM 4.7 Flash', maxTokens: 800 },
  '@cf/qwen/qwen3.8-27b': { name: 'Qwen 3.8 27B', maxTokens: 1000 }
};

// ===== HTML UI =====
var UI_HTML = '<!DOCTYPE html><html lang="en" data-theme="light"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" /><title>Webcore AI</title><style>' +
':root{--bg:#fff;--surface:#F7F7F6;--border:#EAEAE7;--text:#1F1F22;--text-dim:#73737A;--accent:#C76646;--accent-dim:#FAF1EC;--warn:#C7431E;--user-bg:#F0EFEC;--user-text:#1F1F22;--radius:14px}' +
'html[data-theme="dark"]{--bg:#141413;--surface:#1E1E1C;--border:#2E2E2B;--text:#F0EEE6;--text-dim:#9A9A93;--accent:#D68B6B;--accent-dim:#2A211C;--warn:#FF8A63;--user-bg:#262623;--user-text:#F0EEE6;--radius:14px}' +
'*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}' +
'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Ubuntu,sans-serif;background:var(--bg);color:var(--text);height:100dvh;overflow:hidden;display:flex;flex-direction:column;position:relative;transition:background .2s ease,color .2s ease;overscroll-behavior:none}' +
'.app{display:flex;height:100dvh;width:100vw;overflow:hidden;position:relative}' +
'.sidebar{position:fixed;top:0;left:0;width:280px;height:100dvh;background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;transform:translateX(-100%);transition:transform .3s cubic-bezier(.4,0,.2,1);z-index:1000;padding-bottom:env(safe-area-inset-bottom)}' +
'.sidebar.open{transform:translateX(0)}' +
'.sidebar-header{padding:16px 20px;border-bottom:1px solid var(--border);flex-shrink:0}' +
'.sidebar-header h2{font-size:16px;font-weight:600}' +
'.sidebar-header .sub{font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:10px;color:var(--text-dim);margin-top:3px;letter-spacing:.03em}' +
'.sidebar-actions{padding:10px 20px;border-bottom:1px solid var(--border);display:flex;gap:6px;flex-shrink:0}' +
'.sidebar-actions button{flex:1;padding:8px 10px;background:var(--accent);color:#fff;border:none;border-radius:10px;font-size:11px;cursor:pointer;touch-action:manipulation;transition:opacity .15s ease}' +
'.sidebar-actions button:hover{opacity:.88}' +
'html[data-theme="dark"] .sidebar-actions button{color:var(--bg)}' +
'.sidebar-actions button.secondary{background:var(--bg);color:var(--text-dim);border:1px solid var(--border);flex:0 0 40px}' +
'.conversation-list{flex:1;overflow-y:auto;padding:8px 0;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}' +
'.conversation-item{padding:9px 14px;margin:1px 8px;border-radius:10px;cursor:pointer;transition:background .15s ease;position:relative;touch-action:manipulation;min-height:44px}' +
'.conversation-item.active{background:var(--accent-dim)}' +
'.conversation-item:hover:not(.active){background:var(--border)}' +
'.conversation-item .title{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:50px}' +
'.conversation-item .meta{font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:10px;color:var(--text-dim);margin-top:1px}' +
'.conversation-item .actions{position:absolute;right:6px;top:50%;transform:translateY(-50%);display:flex;gap:2px}' +
'.conversation-item .actions button{background:none;border:none;cursor:pointer;font-size:12px;padding:2px 4px;border-radius:4px;color:var(--text-dim);touch-action:manipulation}' +
'.conversation-item .actions .rename-btn:hover{color:var(--accent)}' +
'.conversation-item .actions .delete-btn:hover{color:var(--warn)}' +
'.main-area{flex:1;display:flex;flex-direction:column;height:100dvh;min-width:0;position:relative;background:var(--bg)}' +
'.header{padding:8px 12px;border-bottom:1px solid var(--border);flex-shrink:0;display:flex;justify-content:space-between;align-items:center;background:var(--bg);z-index:10;min-height:48px;gap:8px}' +
'.header-left{display:flex;align-items:center;gap:6px;min-width:0}' +
'.header-right{display:flex;align-items:center;gap:6px;flex-shrink:0}' +
'.hamburger{background:none;border:none;font-size:20px;cursor:pointer;padding:4px;touch-action:manipulation;color:var(--text);display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:4px;flex-shrink:0}' +
'.hamburger:active{background:var(--surface)}' +
'.header h1{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px}' +
'.header .subtitle{font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:10px;color:var(--text-dim);display:inline;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80px}' +
'.header .model-badge{font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:9px;color:var(--text-dim);background:var(--surface);border:1px solid var(--border);padding:2px 8px;border-radius:4px;white-space:nowrap;flex-shrink:0}' +
'.theme-toggle{width:28px;height:28px;border-radius:4px;border:1px solid var(--border);background:var(--surface);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text);flex-shrink:0;transition:border-color .15s ease}' +
'.theme-toggle:hover{border-color:var(--text-dim)}' +
'.theme-toggle svg{width:14px;height:14px}' +
'.content-area{flex:1;display:flex;flex-direction:column;min-height:0;position:relative}' +
'.content-area.is-empty{justify-content:center}' +
'.content-area.is-empty .chat-container{display:none}' +
'.content-area.is-empty .typing-indicator{display:none!important}' +
'.content-area.is-empty .input-area{border-top:none;max-width:640px;width:100%;margin:0 auto;padding-left:16px;padding-right:16px}' +
'.welcome-heading{display:none;text-align:center;padding:0 20px 20px;max-width:480px;margin:0 auto}' +
'.welcome-heading h2{font-size:29px;font-weight:500;letter-spacing:-0.02em;color:var(--text);margin-bottom:8px}' +
'.welcome-heading p{font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:12px;color:var(--text-dim);line-height:1.5}' +
'.content-area.is-empty .welcome-heading{display:block}' +
'.chat-container{flex:1;overflow-y:auto;padding:10px 12px 8px;display:flex;flex-direction:column;gap:8px;-webkit-overflow-scrolling:touch;scroll-behavior:smooth;background:var(--bg);overscroll-behavior:contain}' +
'.message{max-width:88%;padding:9px 14px;border-radius:var(--radius);line-height:1.62;font-size:14px;word-wrap:break-word;animation:fadeIn .25s ease;position:relative}' +
'.message .version-nav{display:flex;align-items:center;gap:3px;margin-top:4px;padding-top:4px;border-top:1px solid var(--border);justify-content:center;flex-wrap:wrap}' +
'.message .version-nav button{background:none;border:1px solid var(--border);border-radius:3px;padding:2px 6px;font-size:10px;cursor:pointer;color:var(--text-dim);min-width:24px;touch-action:manipulation;height:22px}' +
'.message .version-nav button:disabled{opacity:.3;cursor:not-allowed}' +
'.message .version-nav .version-info{font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:10px;color:var(--text-dim);min-width:28px;text-align:center}' +
'.message .version-nav .regenerate-btn{background:none;border:none;cursor:pointer;font-size:12px;color:var(--accent);padding:2px 4px;height:22px}' +
'.message.user{align-self:flex-end;background:var(--user-bg);color:var(--user-text);border-radius:var(--radius)}' +
'.message.assistant{align-self:flex-start;background:var(--surface);color:var(--text);border:1px solid var(--border);border-bottom-left-radius:2px}' +
'.message .label{font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:9px;font-weight:500;letter-spacing:.04em;opacity:.65;margin-bottom:2px}' +
'.message.user .label{color:var(--user-text)}' +
'.message.assistant .label{color:var(--text-dim)}' +
'.message pre{background:var(--bg);border:1px solid var(--border);padding:4px 8px;border-radius:4px;overflow-x:auto;margin:3px 0;font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:11px}' +
'.message code{font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:11px;background:var(--accent-dim);color:var(--accent);padding:1px 4px;border-radius:3px}' +
'.message pre code{background:none;color:inherit;padding:0}' +
'.message p{margin:0 0 9px}' +
'.message p:last-child{margin-bottom:0}' +
'.message ul,.message ol{padding-left:16px;margin:2px 0}' +
'.message li{margin:1px 0;list-style-position:inside}' +
'.message ul li{list-style-type:disc}' +
'.message ol li{list-style-type:decimal}' +
'.message blockquote{border-left:2px solid var(--border);padding-left:8px;margin:3px 0;opacity:.8}' +
'.message a{color:var(--accent);text-decoration:underline;word-break:break-word}' +
'.message h1,.message h2,.message h3,.message h4{margin:4px 0 2px 0;font-weight:600}' +
'.message h1{font-size:16px}.message h2{font-size:14px}.message h3{font-size:13px}' +
'.message table{border-collapse:collapse;width:100%;margin:3px 0;font-size:11px}' +
'.message table th,.message table td{border:1px solid var(--border);padding:2px 5px;text-align:left}' +
'.message table th{background:var(--bg);font-weight:600}' +
'.typing-indicator{align-self:flex-start;background:var(--surface);border:1px solid var(--border);padding:6px 12px;border-radius:var(--radius);border-bottom-left-radius:2px;display:none;align-items:center;gap:8px}.typing-dots{display:flex;gap:3px}.typing-indicator .typing-dots span{width:5px;height:5px;background:var(--text-dim);border-radius:50%;display:inline-block;animation:bounce 1.4s infinite ease-in-out both}.typing-dots span:nth-child(1){animation-delay:-0.32s}.typing-dots span:nth-child(2){animation-delay:-0.16s}.typing-dots span:nth-child(3){animation-delay:0s}.typing-label{font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:11px;color:var(--text-dim)}' +
'@keyframes bounce{0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}' +
'@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}' +
'.input-area{padding:6px 10px 8px;border-top:1px solid var(--border);flex-shrink:0;display:flex;gap:6px;align-items:flex-end;background:var(--bg);padding-bottom:calc(8px + env(safe-area-inset-bottom))}' +
'.input-area select{padding:0 6px;border:1px solid var(--border);border-radius:4px;font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:11px;background:var(--surface);color:var(--text-dim);cursor:pointer;outline:none;height:34px;flex-shrink:0;max-width:88px}' +
'.input-area button.search-toggle{width:40px;height:40px;padding:0;border:1px solid var(--border);border-radius:11px;background:var(--surface);color:var(--text-dim);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:border-color .15s ease,color .15s ease,background .15s ease}' +
'.search-toggle svg{width:15px;height:15px;flex-shrink:0}' +
'.input-area button.search-toggle:hover{border-color:var(--text-dim)}' +
'.input-area button.search-toggle.active{background:var(--accent-dim);border-color:var(--accent);color:var(--accent)}' +
'.input-area button.thinking-toggle{width:40px;height:40px;padding:0;border:1px solid var(--border);border-radius:11px;background:var(--surface);color:var(--text-dim);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:border-color .15s ease,color .15s ease,background .15s ease}' +
'.input-area button.thinking-toggle svg{width:15px;height:15px}' +
'.input-area button.thinking-toggle:hover{border-color:var(--text-dim)}' +
'.input-area button.thinking-toggle.active{background:var(--accent-dim);border-color:var(--accent);color:var(--accent)}' +
'.input-area button.agent-toggle{width:40px;height:40px;padding:0;border:1px solid var(--border);border-radius:11px;background:var(--surface);color:var(--text-dim);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:border-color .15s ease,color .15s ease,background .15s ease}' +
'.input-area button.agent-toggle svg{width:15px;height:15px}' +
'.input-area button.agent-toggle:hover{border-color:var(--text-dim)}' +
'.input-area button.agent-toggle.active{background:var(--accent-dim);border-color:var(--accent);color:var(--accent)}' +
'.thinking-block{border:1px solid var(--border);border-radius:10px;margin-bottom:6px;background:var(--bg);font-size:12px}' +
'.thinking-block summary{cursor:pointer;font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:11px;color:var(--text-dim);padding:5px 8px;user-select:none}' +
'.thinking-block[open] summary{border-bottom:1px solid var(--border)}' +
'.thinking-content{padding:6px 8px;color:var(--text-dim)}' +
'.html-block{border:1px solid var(--border);border-radius:12px;overflow:hidden;margin:4px 0;background:var(--bg)}' +
'.html-block summary{cursor:pointer;list-style:none;padding:6px 10px;font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:11px;color:var(--text-dim);background:var(--surface);user-select:none}' +
'.html-block summary::-webkit-details-marker{display:none}' +
'.html-block[open] summary{border-bottom:1px solid var(--border)}' +
'.html-block-body{background:var(--bg)}' +
'.html-block-tabs{display:flex;align-items:center;border-bottom:1px solid var(--border);background:var(--bg);padding:0 4px}' +
'.html-tab{padding:6px 10px;font-size:11px;background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;color:var(--text-dim)}' +
'.html-tab.active{color:var(--accent);border-bottom-color:var(--accent)}' +
'.html-block-spacer{flex:1}' +
'.html-action{padding:4px 8px;margin:3px 2px;font-size:10px;background:var(--surface);border:1px solid var(--border);border-radius:3px;cursor:pointer;color:var(--text-dim)}' +
'.html-action:hover{color:var(--text);border-color:var(--text-dim)}' +
'.html-code{margin:0;border:none;border-radius:0}' +
'.html-preview{display:none}' +
'.html-preview iframe{width:100%;height:320px;border:none;background:#fff;display:block}' +
'.input-area textarea{flex:1;padding:9px 14px;border:1px solid var(--border);border-radius:12px;font-size:16px;font-family:inherit;resize:none;min-height:40px;max-height:120px;outline:none;transition:border-color .18s ease,box-shadow .18s ease,background .18s ease;line-height:1.45;background:var(--surface);color:var(--text)}' +
'.input-area textarea:focus{border-color:var(--accent);background:var(--bg);box-shadow:0 0 0 3px var(--accent-dim)}' +
'.input-area textarea::placeholder{color:var(--text-dim)}' +
'.input-area button{padding:6px 16px;background:var(--accent);color:#fff;border:none;border-radius:11px;font-size:13px;font-weight:500;cursor:pointer;height:40px;white-space:nowrap;touch-action:manipulation;flex-shrink:0;transition:opacity .15s ease}' +
'.input-area button:hover:not(:disabled){opacity:.88}' +
'html[data-theme="dark"] .input-area button{color:var(--bg)}' +
'.input-area button:disabled{opacity:.4;cursor:not-allowed}' +
'.error-toast{position:fixed;bottom:60px;left:50%;transform:translateX(-50%);background:var(--surface);color:var(--warn);padding:6px 14px;border-radius:4px;font-size:11px;border:1px solid var(--warn);display:none;max-width:90%;z-index:2000}' +
'.error-toast.show{display:block}' +
'.neuron-dashboard{position:absolute;bottom:0;left:0;right:0;padding:6px 12px;background:var(--surface);border-top:1px solid var(--border);flex-shrink:0}' +
'.neuron-dashboard .neuron-label{font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:8px;color:var(--text-dim);margin-bottom:2px;letter-spacing:.03em}' +
'.neuron-dashboard .neuron-bar{width:100%;height:3px;background:var(--border);border-radius:2px;overflow:hidden;margin-bottom:2px}' +
'.neuron-dashboard .neuron-bar .neuron-fill{height:100%;border-radius:2px;transition:width .5s ease}' +
'.neuron-dashboard .neuron-fill.low{background:#22c55e}.neuron-dashboard .neuron-fill.medium{background:#eab308}.neuron-dashboard .neuron-fill.high{background:#ef4444}' +
'.neuron-dashboard .neuron-stats{display:flex;justify-content:space-between;font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:8px;color:var(--text-dim)}' +
'.neuron-dashboard .neuron-stats .used{color:var(--text);font-weight:500}' +
'.neuron-dashboard .neuron-stats .remaining{color:#22c55e;font-weight:500}' +
'.neuron-dashboard .neuron-stats .warning{color:var(--warn);font-weight:600}' +
'.sidebar-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.3);z-index:999;display:none}' +
'.sidebar-overlay.show{display:block}' +
'.modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);display:none;align-items:center;justify-content:center;z-index:3000;animation:fadeIn .15s ease}' +
'.modal-overlay.show{display:flex}' +
'.modal-box{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:16px 20px;max-width:360px;width:90%;color:var(--text)}' +
'.modal-box h3{font-size:15px;font-weight:600;margin-bottom:3px}' +
'.modal-box p{font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:11px;color:var(--text-dim);margin-bottom:10px}' +
'.modal-box input{width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:4px;font-size:13px;outline:none;margin-bottom:10px;background:var(--surface);color:var(--text)}' +
'.modal-box input:focus{border-color:var(--accent)}' +
'.modal-box .modal-actions{display:flex;gap:6px;justify-content:flex-end}' +
'.modal-box .modal-actions button{padding:5px 12px;border-radius:4px;font-size:12px;font-weight:500;cursor:pointer;border:none;touch-action:manipulation}' +
'.modal-box .modal-actions .cancel-btn{background:var(--surface);color:var(--text-dim);border:1px solid var(--border)}' +
'.modal-box .modal-actions .confirm-btn{background:var(--accent);color:#fff}' +
'html[data-theme="dark"] .modal-box .modal-actions .confirm-btn{color:var(--bg)}' +
'.modal-box .modal-actions .danger-btn{background:var(--warn);color:#fff}' +
'.scroll-to-bottom{position:fixed;bottom:70px;right:16px;background:var(--bg);border:1px solid var(--border);border-radius:50%;width:36px;height:36px;display:none;align-items:center;justify-content:center;font-size:18px;cursor:pointer;z-index:50;touch-action:manipulation;color:var(--text)}' +
'.scroll-to-bottom.show{display:flex}' +
'.scroll-to-bottom:active{transform:scale(.95)}' +
'@media(min-width:768px){.sidebar{position:relative;transform:translateX(0);width:280px;border-right:1px solid var(--border);padding-bottom:0}.sidebar-overlay{display:none!important}.hamburger{display:none}.main-area{flex:1}.header h1{font-size:18px;max-width:none}.header .subtitle{font-size:12px;max-width:none}.message{max-width:80%;font-size:15px;padding:10px 16px}.message .version-nav button{font-size:12px;padding:3px 10px;height:auto}.input-area textarea{font-size:16px;min-height:44px;padding:8px 14px}.input-area button{font-size:14px;height:44px;padding:8px 24px}.input-area select{font-size:12px;max-width:120px;height:44px}.input-area button.search-toggle{width:44px;height:44px;border-radius:12px}.input-area button.thinking-toggle{width:44px;height:44px;border-radius:12px}.chat-container{padding:16px 24px}.header{padding:12px 24px}}' +
'@media(max-width:767px){.sidebar{position:fixed;width:280px}.sidebar-overlay{display:none}.sidebar-overlay.show{display:block}.hamburger{display:flex}.header h1{font-size:14px;max-width:90px}.header .subtitle{display:none}.message{max-width:92%;font-size:12px;padding:6px 10px}.input-area{padding:4px 8px 6px}.input-area textarea{font-size:16px;min-height:36px;padding:7px 12px}.input-area button{font-size:12px;height:36px;padding:4px 12px;border-radius:10px}.input-area select{font-size:9px;max-width:64px;height:30px}.input-area button.search-toggle{width:36px;height:36px;border-radius:10px}.input-area button.thinking-toggle{width:36px;height:36px;border-radius:10px}.neuron-dashboard{padding:4px 8px}.chat-container{padding:6px 8px 4px}.scroll-to-bottom{bottom:60px;right:12px;width:32px;height:32px;font-size:16px}}' +
'@media(max-width:480px){.sidebar{width:85%;max-width:280px}.message{max-width:95%;font-size:11px;padding:5px 8px}.message .label{font-size:7px}.message pre{font-size:10px;padding:3px 6px}.message code{font-size:10px}.message .version-nav button{font-size:9px;padding:1px 5px;min-width:20px;height:18px}.message .version-nav .version-info{font-size:9px;min-width:24px}.message .version-nav .regenerate-btn{font-size:11px;height:18px}.header h1{font-size:13px;max-width:70px}.header .model-badge{font-size:8px;padding:1px 6px}.input-area textarea{font-size:16px;min-height:36px;padding:7px 10px}.input-area button{font-size:11px;height:36px;padding:3px 10px;border-radius:10px}.input-area select{max-width:56px}.modal-box{padding:14px 16px}.modal-box h3{font-size:14px}.modal-box input{font-size:11px;padding:4px 8px}.neuron-dashboard .neuron-stats{font-size:7px}.scroll-to-bottom{bottom:54px;right:10px;width:28px;height:28px;font-size:14px}}' +
'.no-scrollbar::-webkit-scrollbar{width:0;height:0}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}' +
'.message.assistant{background:transparent;border:none;padding:2px 2px;max-width:100%;border-radius:0}' +
'.message.assistant .version-nav{justify-content:flex-start;border-top:none;padding-top:2px}' +
'</style></head><body>' +
'<div class="sidebar-overlay" id="sidebarOverlay"></div>' +
'<div class="modal-overlay" id="modalOverlay"><div class="modal-box"><h3 id="modalTitle">New Chat</h3><p id="modalSubtitle">Enter a name for this conversation</p><input type="text" id="modalInput" placeholder="Conversation name..." maxlength="100" /><div class="modal-actions"><button class="cancel-btn" id="modalCancel">Cancel</button><button class="confirm-btn" id="modalConfirm">Create</button></div></div></div>' +
'<div class="modal-overlay" id="deleteModalOverlay"><div class="modal-box"><h3 id="deleteModalTitle">Delete Conversation</h3><p id="deleteModalSubtitle">Are you sure you want to delete this conversation?</p><div class="modal-actions"><button class="cancel-btn" id="deleteModalCancel">Cancel</button><button class="danger-btn" id="deleteModalConfirm">Delete</button></div></div></div>' +
'<div class="app"><div class="sidebar" id="sidebar"><div class="sidebar-header"><h2>Conversations</h2><div class="sub">your chat history</div></div><div class="sidebar-actions"><button id="newChatBtn">+ New Chat</button><button class="secondary" id="refreshBtn">&#8635;</button></div><div class="conversation-list" id="conversationList"></div>' +
'<div class="neuron-dashboard" id="neuronDashboard"><div class="neuron-label">neurons today</div><div class="neuron-bar"><div class="neuron-fill low" id="neuronFill" style="width:0%"></div></div><div class="neuron-stats"><span>used <span class="used" id="neuronUsed">0</span></span><span>left <span class="remaining" id="neuronRemaining">10,000</span></span></div></div></div>' +
'<div class="main-area"><div class="header"><div class="header-left"><button class="hamburger" id="hamburgerBtn">&#9776;</button><div><h1 id="chatTitle">Webcore AI</h1><div class="subtitle" id="chatSubtitle">Select or start</div></div></div><div class="header-right"><span class="model-badge" id="modelBadge">Llama 4</span><button class="theme-toggle" id="themeToggle" aria-label="Switch theme" type="button"><svg id="themeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="4.6"></circle><path d="M12 2.4v2.4M12 19.2v2.4M4.4 12H2M22 12h-2.4M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M5.6 18.4l1.7-1.7M16.7 7.3l1.7-1.7"></path></svg></button></div></div>' +
'<div class="content-area" id="contentArea"><div class="welcome-heading" id="welcomeHeading"><h2>What can I help with?</h2><p>Type a message below to get started.</p></div><div class="chat-container no-scrollbar" id="chatContainer"></div><div class="typing-indicator" id="typingIndicator"><span class="typing-dots"><span></span><span></span><span></span></span><span class="typing-label" id="typingLabel">Thinking&#8230;</span></div><div class="error-toast" id="errorToast"></div><div class="input-area"><select class="model-selector" id="modelSelect" title="Model"><option value="@cf/meta/llama-4-scout-17b-16e-instruct">Llama 4</option><option value="@cf/openai/gpt-oss-120b">GPT-OSS</option><option value="@cf/google/gemma-4-26b-a4b-it">Gemma 4</option><option value="@cf/zai-org/glm-4.7-flash">GLM 4.7</option><option value="@cf/qwen/qwen3.8-27b">Qwen 3.8</option></select><button class="search-toggle" id="searchToggle" type="button" title="Search the web" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3c2.5 2.5 2.5 15.5 0 18c-2.5 -2.5 -2.5 -15.5 0 -18"></path></svg></button><button class="thinking-toggle" id="thinkingToggle" type="button" title="Show step-by-step thinking" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.6.55 1 1.2 1 2.5h6c0-1.3.4-1.95 1-2.5A6 6 0 0 0 12 3z"></path></svg></button><button class="agent-toggle" id="agentToggle" type="button" title="Agent mode (let it use tools)" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="8" width="16" height="12" rx="3"></rect><path d="M12 8V4M9 14h.01M15 14h.01M9.5 17h5"></path></svg></button><textarea id="userInput" rows="1" placeholder="Type a message..." maxlength="2000"></textarea><button id="sendBtn">Send</button></div></div></div></div>' +
'<button class="scroll-to-bottom" id="scrollBtn" title="Scroll to bottom">&#8595;</button><script>' +
'var chatContainer=document.getElementById("chatContainer"),contentArea=document.getElementById("contentArea"),userInput=document.getElementById("userInput"),sendBtn=document.getElementById("sendBtn"),conversationList=document.getElementById("conversationList"),newChatBtn=document.getElementById("newChatBtn"),refreshBtn=document.getElementById("refreshBtn"),hamburgerBtn=document.getElementById("hamburgerBtn"),sidebar=document.getElementById("sidebar"),sidebarOverlay=document.getElementById("sidebarOverlay"),typingIndicator=document.getElementById("typingIndicator"),typingLabel=document.getElementById("typingLabel"),errorToast=document.getElementById("errorToast"),chatTitle=document.getElementById("chatTitle"),chatSubtitle=document.getElementById("chatSubtitle"),modelBadge=document.getElementById("modelBadge"),modalOverlay=document.getElementById("modalOverlay"),modalTitle=document.getElementById("modalTitle"),modalSubtitle=document.getElementById("modalSubtitle"),modalInput=document.getElementById("modalInput"),modalConfirm=document.getElementById("modalConfirm"),modalCancel=document.getElementById("modalCancel"),deleteModalOverlay=document.getElementById("deleteModalOverlay"),deleteModalConfirm=document.getElementById("deleteModalConfirm"),deleteModalCancel=document.getElementById("deleteModalCancel"),modelSelect=document.getElementById("modelSelect"),searchToggle=document.getElementById("searchToggle"),thinkingToggle=document.getElementById("thinkingToggle"),agentToggle=document.getElementById("agentToggle"),neuronFill=document.getElementById("neuronFill"),neuronUsed=document.getElementById("neuronUsed"),neuronRemaining=document.getElementById("neuronRemaining"),scrollBtn=document.getElementById("scrollBtn"),themeToggle=document.getElementById("themeToggle"),themeIcon=document.getElementById("themeIcon"),isProcessing=!1,currentConversationId=null,modalResolve=null,deleteResolve=null,dailyNeuronLimit=10000,tempIdCounter=0,webSearchEnabled=!1,thinkingEnabled=!1,agentEnabled=!1;' +
'var MODEL_NAMES={"@cf/meta/llama-4-scout-17b-16e-instruct":"Llama 4","@cf/openai/gpt-oss-120b":"GPT-OSS 120B","@cf/google/gemma-4-26b-a4b-it":"Gemma 4","@cf/zai-org/glm-4.7-flash":"GLM 4.7","@cf/qwen/qwen3.8-27b":"Qwen 3.8"};' +
'var SUN_PATH="M12 2.4v2.4M12 19.2v2.4M4.4 12H2M22 12h-2.4M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M5.6 18.4l1.7-1.7M16.7 7.3l1.7-1.7",MOON_PATH="M20 14.6A8.4 8.4 0 1 1 9.4 4a6.7 6.7 0 0 0 10.6 10.6z";' +
'function applyThemeIcon(e){var t=themeIcon.querySelector("circle"),n=themeIcon.querySelector("path");if(e==="dark"){if(t)t.setAttribute("r","0");n.setAttribute("d",MOON_PATH)}else{if(t)t.setAttribute("r","4.6");n.setAttribute("d",SUN_PATH)}}' +
'(function initTheme(){var e=null;try{e=localStorage.getItem("webcore-theme")}catch(t){}var n=e||"light";document.documentElement.setAttribute("data-theme",n);applyThemeIcon(n)})();' +
'themeToggle.addEventListener("click",function(){var e=document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark";document.documentElement.setAttribute("data-theme",e);applyThemeIcon(e);try{localStorage.setItem("webcore-theme",e)}catch(t){}});' +
'searchToggle.addEventListener("click",function(){webSearchEnabled=!webSearchEnabled;searchToggle.classList.toggle("active",webSearchEnabled);searchToggle.setAttribute("aria-pressed",webSearchEnabled?"true":"false");searchToggle.title=webSearchEnabled?"Web search on":"Search the web"});thinkingToggle.addEventListener("click",function(){thinkingEnabled=!thinkingEnabled;thinkingToggle.classList.toggle("active",thinkingEnabled);thinkingToggle.setAttribute("aria-pressed",thinkingEnabled?"true":"false");thinkingToggle.title=thinkingEnabled?"Step-by-step thinking on":"Show step-by-step thinking"});agentToggle.addEventListener("click",function(){agentEnabled=!agentEnabled;agentToggle.classList.toggle("active",agentEnabled);agentToggle.setAttribute("aria-pressed",agentEnabled?"true":"false");agentToggle.title=agentEnabled?"Agent mode on":"Agent mode (let it use tools)"});' +
'function updateNeuronDisplay(e){var t=Math.max(0,dailyNeuronLimit-e),n=Math.min(100,(e/dailyNeuronLimit)*100);neuronUsed.textContent=e.toLocaleString();neuronRemaining.textContent=t.toLocaleString();neuronFill.style.width=n+"%";neuronFill.className="neuron-fill"+(n<50?" low":n<80?" medium":" high");neuronRemaining.className=n>=90?"remaining warning":"remaining"}' +
'function loadNeuronUsage(){apiRequest("/api/neurons","GET").then(function(e){if(e.success){if(e.limit)dailyNeuronLimit=e.limit;updateNeuronDisplay(e.used||0)}}).catch(function(e){console.error(e)})}' +
'function showModal(e,t,n,r){return new Promise(function(a){modalTitle.textContent=e;modalSubtitle.textContent=t;modalInput.placeholder=n||"Enter name...";modalInput.value="";modalConfirm.textContent=r||"Create";modalOverlay.classList.add("show");setTimeout(function(){modalInput.focus()},100);modalResolve=a})}function hideModal(){modalOverlay.classList.remove("show");modalResolve&&(modalResolve(null),modalResolve=null)}function showDeleteModal(){return new Promise(function(e){deleteModalOverlay.classList.add("show");deleteResolve=e})}function hideDeleteModal(){deleteModalOverlay.classList.remove("show");deleteResolve&&(deleteResolve(!1),deleteResolve=null)}' +
'modalCancel.addEventListener("click",hideModal);modalOverlay.addEventListener("click",function(e){e.target===modalOverlay&&hideModal()});modalInput.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();var t=modalInput.value.trim();if(t){modalOverlay.classList.remove("show");modalResolve&&(modalResolve(t),modalResolve=null)}}if(e.key==="Escape")hideModal()});modalConfirm.addEventListener("click",function(){var e=modalInput.value.trim();if(e){modalOverlay.classList.remove("show");modalResolve&&(modalResolve(e),modalResolve=null)}});' +
'deleteModalCancel.addEventListener("click",function(){deleteModalOverlay.classList.remove("show");deleteResolve&&(deleteResolve(!1),deleteResolve=null)});deleteModalOverlay.addEventListener("click",function(e){e.target===deleteModalOverlay&&(deleteModalOverlay.classList.remove("show"),deleteResolve&&(deleteResolve(!1),deleteResolve=null))});deleteModalConfirm.addEventListener("click",function(){deleteModalOverlay.classList.remove("show");deleteResolve&&(deleteResolve(!0),deleteResolve=null)});' +
'function toggleSidebar(){sidebar.classList.toggle("open");sidebarOverlay.classList.toggle("show")}function closeSidebar(){sidebar.classList.remove("open");sidebarOverlay.classList.remove("show")}function openSidebar(){sidebar.classList.add("open");sidebarOverlay.classList.add("show")}hamburgerBtn.addEventListener("click",toggleSidebar);sidebarOverlay.addEventListener("click",closeSidebar);' +
'(function initSwipeGestures(){var startX=null,startY=null;document.addEventListener("touchstart",function(e){if(e.touches.length!==1)return;startX=e.touches[0].clientX;startY=e.touches[0].clientY},{passive:!0});document.addEventListener("touchend",function(e){if(startX===null||window.innerWidth>=768)return;var t=e.changedTouches[0],dx=t.clientX-startX,dy=t.clientY-startY;if(Math.abs(dx)>60&&Math.abs(dy)<60){if(dx>0&&startX<24&&!sidebar.classList.contains("open"))openSidebar();else if(dx<0&&sidebar.classList.contains("open"))closeSidebar()}startX=null;startY=null},{passive:!0})})();' +
'function renderMarkdown(e){if(!e)return"";var t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");var n=t.split("\\n"),r=[],a=!1,o="",l=!1,s=[],codeBlocks=[],fenceLang="",i=0;while(i<n.length){var c=n[i];var fenceMatch=c.match(/^```(\\S*)/);if(fenceMatch){if(l){l=!1;var idx=codeBlocks.length;codeBlocks.push({lang:fenceLang,code:s.join("\\n").trim()});r.push("\\u0000CB"+idx+"\\u0000")}else{l=!0;s=[];fenceLang=(fenceMatch[1]||"").toLowerCase()}i++;continue}if(l){s.push(c);i++;continue}if(""===c.trim()){a&&("ul"===o?r.push("</ul>"):"ol"===o&&r.push("</ol>"),a=!1,o="");i++;continue}if(c.match(/^### /)){r.push("<h3>"+c.replace(/^### /,"")+"</h3>");i++;continue}if(c.match(/^## /)){r.push("<h2>"+c.replace(/^## /,"")+"</h2>");i++;continue}if(c.match(/^# /)){r.push("<h1>"+c.replace(/^# /,"")+"</h1>");i++;continue}if(c.match(/^> /)){r.push("<blockquote>"+c.replace(/^> /,"")+"</blockquote>");i++;continue}if(c.match(/^\\|/)){var d=[],u=!1;while(i<n.length&&n[i].match(/^\\|/)){var p=n[i].split("|").filter(function(e){return e.trim()!=""});d.push(p.map(function(e){return e.trim()}));if(!u&&i+1<n.length&&n[i+1].match(/^\\|/)){var h=n[i+1].split("|").filter(function(e){return e.trim()!=""});if(h.every(function(e){return e.match(/^[\\s\\-:]+$/)||e.match(/^[:\\-]+$/)||e.match(/^\\-+$/)})){u=!0;i++}}i++}var m="<table>";if(d.length>0){m+="<thead><tr>";for(var f=0;f<d[0].length;f++){m+="<th>"+d[0][f]+"</th>"}m+="</tr></thead><tbody>";for(var v=1;v<d.length;v++){m+="<tr>";for(var g=0;g<d[v].length;g++){m+="<td>"+d[v][g]+"</td>"}m+="</tr>"}m+="</tbody>"}m+="</table>";r.push(m);continue}if(c.match(/^\\s*[-*+]\\s/)){a&&"ul"!==o&&(r.push("</ul>"),a=!1,o="");a||(r.push("<ul>"),a=!0,o="ul");r.push("<li>"+c.replace(/^\\s*[-*+]\\s/,"")+"</li>");i++;continue}if(c.match(/^\\s*\\d+\\.\\s/)){a&&"ol"!==o&&(r.push("</ol>"),a=!1,o="");a||(r.push("<ol>"),a=!0,o="ol");r.push("<li>"+c.replace(/^\\s*\\d+\\.\\s/,"")+"</li>");i++;continue}if(a){if("ul"===o)r.push("</ul>");else if("ol"===o)r.push("</ol>");a=!1;o=""}r.push("<p>"+c+"</p>");i++}a&&("ul"===o?r.push("</ul>"):"ol"===o&&r.push("</ol>"));var html=r.join("");html=html.replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)/g,"<a href=\\"$2\\" target=\\"_blank\\" rel=\\"noopener noreferrer\\">$1</a>").replace(/`([^`]+)`/g,"<code>$1</code>").replace(/\\*\\*([^*]+)\\*\\*/g,"<strong>$1</strong>").replace(/\\*([^*]+)\\*/g,"<em>$1</em>").replace(/\\n/g,"<br>");for(var b=0;b<codeBlocks.length;b++){var block=codeBlocks[b];var replacement=block.lang==="html"?buildHtmlPreviewBlock(block.code):("<pre><code>"+block.code+"</code></pre>");html=html.replace("\\u0000CB"+b+"\\u0000",replacement)}return html}' +
'function buildHtmlPreviewBlock(code){return "<details class=\\"html-block\\" ontoggle=\\"onHtmlBlockToggle(this)\\"><summary>&lt;/&gt; HTML file &#8212; click to preview</summary><div class=\\"html-block-body\\"><div class=\\"html-block-tabs\\"><button type=\\"button\\" class=\\"html-tab\\" data-view=\\"code\\" onclick=\\"toggleHtmlView(this,&#39;code&#39;)\\">Code</button><button type=\\"button\\" class=\\"html-tab active\\" data-view=\\"preview\\" onclick=\\"toggleHtmlView(this,&#39;preview&#39;)\\">Preview</button><span class=\\"html-block-spacer\\"></span><button type=\\"button\\" class=\\"html-action\\" onclick=\\"copyHtmlBlock(this)\\">Copy</button><button type=\\"button\\" class=\\"html-action\\" onclick=\\"downloadHtmlBlock(this)\\">Download</button></div><pre class=\\"html-code\\" style=\\"display:none\\"><code>"+code+"</code></pre><div class=\\"html-preview\\" style=\\"display:block\\"><iframe sandbox=\\"allow-scripts\\" title=\\"HTML preview\\"></iframe></div><textarea class=\\"html-raw\\" style=\\"display:none\\">"+code+"</textarea></div></details>"}function loadHtmlIframe(block){var iframe=block.querySelector(".html-preview iframe");if(iframe&&!iframe.dataset.loaded){var raw=block.querySelector(".html-raw").value;iframe.srcdoc=raw;iframe.dataset.loaded="1"}}function onHtmlBlockToggle(details){if(!details.open)return;loadHtmlIframe(details)}function toggleHtmlView(btn,view){var block=btn.closest(".html-block");if(!block)return;var tabs=block.querySelectorAll(".html-tab");for(var i=0;i<tabs.length;i++){tabs[i].classList.toggle("active",tabs[i].dataset.view===view)}var codeEl=block.querySelector(".html-code");var previewEl=block.querySelector(".html-preview");if(view==="preview"){codeEl.style.display="none";previewEl.style.display="block";loadHtmlIframe(block)}else{codeEl.style.display="";previewEl.style.display="none"}}function copyHtmlBlock(btn){var block=btn.closest(".html-block");var raw=block.querySelector(".html-raw").value;var done=function(){var old=btn.textContent;btn.textContent="Copied!";setTimeout(function(){btn.textContent=old},1500)};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(raw).then(done).catch(function(){fallbackCopyText(raw);done()})}else{fallbackCopyText(raw);done()}}function fallbackCopyText(text){var ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.left="-9999px";document.body.appendChild(ta);ta.focus();ta.select();try{document.execCommand("copy")}catch(e){}document.body.removeChild(ta)}function downloadHtmlBlock(btn){var block=btn.closest(".html-block");var raw=block.querySelector(".html-raw").value;var blob=new Blob([raw],{type:"text/html"});var url=URL.createObjectURL(blob);var a=document.createElement("a");a.href=url;a.download="page.html";document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(function(){URL.revokeObjectURL(url)},1000)}function apiRequest(e,t,n){return fetch(e,{method:t,headers:{"Content-Type":"application/json"},body:n?JSON.stringify(n):null}).then(function(e){return e.json()})}' +
'function postStream(e,t,n){return fetch(e,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)}).then(function(r){var reader=r.body.getReader(),decoder=new TextDecoder(),buffer="",finalResult=null;function handleLine(line){if(!line.trim())return;var evt;try{evt=JSON.parse(line)}catch(err){return}if(evt.type==="status"){n&&n(evt)}else if(evt.type==="result"){finalResult=evt}}function pump(){return reader.read().then(function(res){if(res.done){if(buffer)handleLine(buffer);return finalResult||{success:!1,error:"No response from server"}}buffer+=decoder.decode(res.value,{stream:!0});var parts=buffer.split("\\n");buffer=parts.pop();parts.forEach(handleLine);return pump()})}return pump()})}' +
'function loadConversations(){apiRequest("/api/conversations","GET").then(function(e){e.success&&renderConversationList(e.conversations)}).catch(function(e){console.error(e)})}' +
'function loadConversation(id){apiRequest("/api/conversations/"+id,"GET").then(function(t){if(t.success){currentConversationId=id;renderMessages(t.messages||[]);chatTitle.textContent=t.title||"Conversation";chatSubtitle.textContent=(t.messages?t.messages.length:0)+" messages";highlightConversation(id);closeSidebar()}}).catch(function(e){console.error(e)})}' +
'async function createNewConversation(){var e=await showModal("New Chat","Enter a name for this conversation","Conversation name...","Create");if(e){apiRequest("/api/conversations","POST",{title:e}).then(function(e){if(e.success){loadConversations();loadConversation(e.id)}}).catch(function(e){console.error(e)})}}' +
'async function renameConversation(id,currentTitle){var n=await showModal("Rename Chat","Enter a new name for this conversation",currentTitle||"Untitled",currentTitle||"Untitled");if(n&&n.trim()){apiRequest("/api/conversations/"+id,"PUT",{title:n.trim()}).then(function(t){if(t.success){if(currentConversationId===id)chatTitle.textContent=t.title;loadConversations()}}).catch(function(e){console.error(e)})}}' +
'async function deleteConversation(id){var t=await showDeleteModal();if(t){apiRequest("/api/conversations/"+id,"DELETE").then(function(t){if(t.success){if(currentConversationId===id){currentConversationId=null;chatContainer.innerHTML="";chatTitle.textContent="Webcore AI";chatSubtitle.textContent="Select or start"}loadConversations();var n=conversationList.querySelectorAll(".conversation-item");if(n.length>0)loadConversation(n[0].dataset.id)}}).catch(function(e){console.error(e)})}}' +
'function buildVersionNav(m){var nav=document.createElement("div");nav.className="version-nav";var prev=document.createElement("button");prev.className="nav-prev";prev.textContent="\\u2190";prev.title="Previous version";var info=document.createElement("span");info.className="version-info";info.textContent=(m.version_index+1)+"/"+m.version_count;var next=document.createElement("button");next.className="nav-next";next.textContent="\\u2192";next.title="Next version";var regen=document.createElement("button");regen.className="regenerate-btn";regen.textContent="\\u27f3";regen.title="Regenerate";prev.disabled=m.version_count<=1||m.version_index===0;next.disabled=m.version_count<=1||m.version_index===m.version_count-1;prev.onclick=function(){switchBranch(m.version_ids[m.version_index-1])};next.onclick=function(){switchBranch(m.version_ids[m.version_index+1])};regen.onclick=function(){regenerateMessage(m.id)};nav.appendChild(prev);nav.appendChild(info);nav.appendChild(next);nav.appendChild(regen);return nav}' +
'function switchBranch(targetId){if(isProcessing||!currentConversationId)return;isProcessing=!0;apiRequest("/api/conversations/"+currentConversationId+"/branch","POST",{message_id:targetId}).then(function(t){if(t.success){renderMessages(t.messages);chatSubtitle.textContent=t.messages.length+" messages";loadConversations()}else{showError(t.error||"Could not switch version")}}).catch(function(e){showError(e.message||"Error switching version")}).finally(function(){isProcessing=!1})}' +
'function regenerateMessage(messageId){if(isProcessing){showError("Please wait for the current request to finish");return}if(!currentConversationId){showError("No conversation selected");return}var el=document.querySelector(".message[data-id=\'"+messageId+"\']");if(el){var c=el.querySelector(".message-content");if(c)c.innerHTML="<p>Regenerating...</p>";var nav=el.querySelector(".version-nav");if(nav)nav.remove()}isProcessing=!0;showTyping(!0,webSearchEnabled?"Searching the web\u2026":"Thinking\u2026");postStream("/api/regenerate",{conversation_id:currentConversationId,message_id:messageId,model:modelSelect.value,web_search:webSearchEnabled,thinking:thinkingEnabled,agent:agentEnabled},function(evt){showTyping(!0,statusLabel(evt))}).then(function(t){if(t.success){renderMessages(t.messages);chatSubtitle.textContent=t.messages.length+" messages";loadConversations();loadNeuronUsage();showError(t.search_error||t.page_error||null)}else{showError(t.error||"Failed to regenerate");loadConversation(currentConversationId)}}).catch(function(e){showError(e.message||"Error regenerating");loadConversation(currentConversationId)}).finally(function(){isProcessing=!1;showTyping(!1)})}' +
'function formatRelativeDate(ts){var d=new Date(ts),now=new Date();var dOnly=new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();var nOnly=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();var days=Math.round((nOnly-dOnly)/86400000);if(days===0)return"Today";if(days===1)return"Yesterday";if(days>1&&days<7)return days+" days ago";return d.toLocaleDateString()}' +
'function renderConversationList(e){conversationList.innerHTML="";if(!e||0===e.length){conversationList.innerHTML=\'<div style="padding:16px;text-align:center;color:var(--text-dim);font-size:12px;">No conversations yet</div>\';return}for(var t=0;t<e.length;t++){var n=e[t],r=document.createElement("div");r.className="conversation-item";r.dataset.id=n.id;if(n.id===currentConversationId)r.classList.add("active");var a=document.createElement("div");a.className="title";a.textContent=n.title||"Untitled";var o=document.createElement("div");o.className="meta";o.textContent=formatRelativeDate(n.updated_at)+" \\u00b7 "+(n.message_count||0)+" msgs";var s=document.createElement("div");s.className="actions";var i=document.createElement("button");i.className="rename-btn";i.textContent="\\u271e";i.title="Rename";i.onclick=function(e){e.stopPropagation();var t=this.closest(".conversation-item"),n=t.dataset.id,r=t.querySelector(".title").textContent;renameConversation(n,r)};var d=document.createElement("button");d.className="delete-btn";d.textContent="\\u2715";d.title="Delete";d.onclick=function(e){e.stopPropagation();var t=this.closest(".conversation-item").dataset.id;deleteConversation(t)};s.appendChild(i);s.appendChild(d);r.appendChild(a);r.appendChild(o);r.appendChild(s);r.onclick=function(){loadConversation(this.dataset.id)};conversationList.appendChild(r)}}' +
'function renderMessages(e){chatContainer.innerHTML="";if(!e||0===e.length){contentArea.classList.add("is-empty");return}contentArea.classList.remove("is-empty");for(var a=0;a<e.length;a++){addMessageDOM(e[a])}}' +
'function splitThinking(raw){if(!raw)return{thinking:"",answer:raw||""};var match=raw.match(/<thinking>([\\s\\S]*?)<\\/thinking>/i);if(!match)return{thinking:"",answer:raw};var thinking=match[1].trim();var rest=raw.slice(0,match.index)+raw.slice(match.index+match[0].length);rest=rest.replace(/<\\/?answer>/gi,"").trim();return{thinking:thinking,answer:rest}}function addMessageDOM(m){if(contentArea.classList.contains("is-empty")){contentArea.classList.remove("is-empty")}var t=document.createElement("div");t.className="message "+m.role;t.dataset.id=m.id;var n=document.createElement("div");n.className="label";n.textContent=m.role==="user"?"You":"Assistant";t.appendChild(n);var r=document.createElement("div");r.className="message-content";if(m.role==="assistant"){var split=splitThinking(m.content);if(split.thinking){var det=document.createElement("details");det.className="thinking-block";var sum=document.createElement("summary");sum.textContent="Thought process";det.appendChild(sum);var tc=document.createElement("div");tc.className="thinking-content";tc.innerHTML=renderMarkdown(split.thinking);det.appendChild(tc);t.appendChild(det)}r.innerHTML=renderMarkdown(split.answer)}else{r.textContent=m.content}t.appendChild(r);if(m.role==="assistant")t.appendChild(buildVersionNav(m));chatContainer.appendChild(t);chatContainer.scrollTop=chatContainer.scrollHeight}' +
'function highlightConversation(e){var t=conversationList.querySelectorAll(".conversation-item");for(var n=0;n<t.length;n++){t[n].classList.toggle("active",t[n].dataset.id===e)}}' +
'function showTyping(e,label){typingIndicator.style.display=e?"flex":"none";if(label&&typingLabel)typingLabel.textContent=label;if(e)chatContainer.scrollTop=chatContainer.scrollHeight}' +
'function showError(e){if(e){errorToast.textContent="\\u26a0\\ufe0f "+e;errorToast.classList.add("show");setTimeout(function(){errorToast.classList.remove("show")},4000)}else{errorToast.classList.remove("show")}}' +
'function updateModelBadge(e){var t=MODEL_NAMES[e]||e.split("/").pop();modelBadge.textContent=t}' +
'function updateScrollButton(){if(!chatContainer)return;var e=chatContainer.scrollHeight-chatContainer.clientHeight-chatContainer.scrollTop;e>20?scrollBtn.classList.add("show"):scrollBtn.classList.remove("show")}chatContainer.addEventListener("scroll",updateScrollButton);scrollBtn.addEventListener("click",function(){chatContainer.scrollTo({top:chatContainer.scrollHeight,behavior:"smooth"})});' +
'function ensureConversation(){if(currentConversationId)return Promise.resolve(currentConversationId);return apiRequest("/api/conversations","POST",{title:"New Chat"}).then(function(e){if(!e.success)throw new Error(e.error||"Could not create conversation");currentConversationId=e.id;chatContainer.innerHTML="";chatTitle.textContent=e.title||"New Chat";chatSubtitle.textContent="0 messages";loadConversations();return e.id})}' +
'function statusLabel(evt){if(evt.stage==="searching")return"Searching the web\u2026";if(evt.stage==="reading_page")return"Reading the page\u2026";if(evt.stage==="tool")return"Using "+evt.tool+(evt.detail?" \u2014 "+evt.detail:"")+"\u2026";if(evt.stage==="generating")return"Thinking\u2026";return"Working\u2026"}function sendMessage(){var val=userInput.value.trim();if(!val||isProcessing)return;var model=modelSelect.value;var useSearch=webSearchEnabled;var tempId="tmp-"+(++tempIdCounter);isProcessing=!0;sendBtn.disabled=!0;ensureConversation().then(function(convId){addMessageDOM({role:"user",content:val,id:tempId});userInput.value="";userInput.style.height="auto";updateModelBadge(model);showTyping(!0,useSearch?"Searching the web\u2026":"Thinking\u2026");return postStream("/api/chat",{conversation_id:convId,prompt:val,model:model,temperature:.7,max_tokens:1e3,web_search:useSearch,thinking:thinkingEnabled,agent:agentEnabled},function(evt){showTyping(!0,statusLabel(evt))})}).then(function(t){if(!t)return;if(t.success){renderMessages(t.messages);chatSubtitle.textContent=t.messages.length+" messages";loadConversations();highlightConversation(currentConversationId);if(t.neurons_used!==undefined){loadNeuronUsage()}showError(t.search_error||t.page_error||null)}else{showError(t.error||"AI request failed")}}).catch(function(e){showError(e.message||"Error sending message")}).finally(function(){isProcessing=!1;sendBtn.disabled=!1;showTyping(!1);userInput.focus()})}' +
'userInput.addEventListener("input",function(){userInput.style.height="auto";userInput.style.height=Math.min(userInput.scrollHeight,80)+"px"});userInput.addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage()}});sendBtn.addEventListener("click",sendMessage);newChatBtn.addEventListener("click",createNewConversation);refreshBtn.addEventListener("click",function(){loadConversations();loadNeuronUsage()});modelSelect.addEventListener("change",function(){updateModelBadge(this.value)});updateModelBadge(modelSelect.value);renderMessages([]);loadConversations();loadNeuronUsage();userInput.focus();setTimeout(function(){var e=conversationList.querySelectorAll(".conversation-item");if(e.length>0)loadConversation(e[0].dataset.id)},300);' +
'</script></body></html>';

// ============================================
// DATABASE INITIALIZATION
// ============================================

var dbInitialized = false;

async function initDatabase(env) {
  if (dbInitialized) return true;
  try {
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, title TEXT, created_at INTEGER, updated_at INTEGER, memory_summary TEXT, memory_covered_count INTEGER DEFAULT 0)'
    ).run();
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id TEXT, parent_id INTEGER, role TEXT, content TEXT, timestamp INTEGER, active_child_id INTEGER, FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE)'
    ).run();
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS neuron_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT UNIQUE, used INTEGER DEFAULT 0)'
    ).run();
    await env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id)'
    ).run();
    await env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS idx_messages_parent_id ON messages(parent_id)'
    ).run();
    // Lightweight migrations for deployments created before branching/memory
    // support: ALTER TABLE ADD COLUMN fails harmlessly if the column
    // already exists.
    try { await env.DB.prepare('ALTER TABLE messages ADD COLUMN parent_id INTEGER').run(); } catch (e) {}
    try { await env.DB.prepare('ALTER TABLE messages ADD COLUMN active_child_id INTEGER').run(); } catch (e) {}
    try { await env.DB.prepare('ALTER TABLE conversations ADD COLUMN memory_summary TEXT').run(); } catch (e) {}
    try { await env.DB.prepare('ALTER TABLE conversations ADD COLUMN memory_covered_count INTEGER DEFAULT 0').run(); } catch (e) {}
    dbInitialized = true;
    return true;
  } catch (err) {
    console.error('Database init error:', err);
    return false;
  }
}

// ============================================
// SHARED HELPERS
// ============================================

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN };
}

function jsonResponse(payload, status) {
  return Response.json(payload, { status: status || 200, headers: corsHeaders() });
}

// Streams newline-delimited JSON status/result events to the client so the
// UI can show what the server is doing right now (searching, generating,
// etc.) instead of a generic spinner — similar to how claude.ai surfaces
// tool use while a response is being generated. handler(send) does the
// real work and must end by sending exactly one {type:'result', ...}
// event; any status events sent before it are purely informational.
function streamJsonEvents(handler) {
  var ts = new TransformStream();
  var writer = ts.writable.getWriter();
  var encoder = new TextEncoder();
  var closed = false;
  var send = async function (event) {
    if (closed) return;
    try { await writer.write(encoder.encode(JSON.stringify(event) + '\n')); } catch (e) { /* client disconnected */ }
  };
  (async function () {
    try {
      await handler(send);
    } catch (err) {
      var isLicenseError = err && err.message && (err.message.includes('403') || err.message.includes('license'));
      var message = isLicenseError
        ? 'Model license not accepted. Visit Cloudflare dashboard > AI > Models and agree to terms.'
        : (err && err.message) || 'Unexpected server error';
      await send({ type: 'result', success: false, error: message });
    } finally {
      closed = true;
      try { await writer.close(); } catch (e) {}
    }
  })();
  var headers = corsHeaders();
  headers['Content-Type'] = 'application/x-ndjson; charset=utf-8';
  return new Response(ts.readable, { headers: headers });
}

// Resolves + validates a requested model against the allowlist.
function resolveModel(requestedModel) {
  var model = requestedModel || CONFIG.MODEL;
  var modelConfig = FREE_MODELS[model];
  if (!modelConfig) {
    throw { status: 400, message: 'Model is not available on this deployment.' };
  }
  return { model: model, maxTokens: modelConfig.maxTokens };
}

function clampTemperature(value) {
  return Math.min(Math.max(Number(value ?? CONFIG.TEMPERATURE), 0), 2);
}

function clampMaxTokens(value, ceiling) {
  return Math.min(Math.max(Number(value ?? ceiling), 1), ceiling);
}

function estimateNeurons(promptLength, maxTokens) {
  return Math.ceil((promptLength / 4) * 0.1 + maxTokens * 0.2);
}

async function getTodayUsage(env, today) {
  var stmt = env.DB.prepare('SELECT used FROM neuron_usage WHERE date = ?');
  var result = await stmt.bind(today).first();
  return result ? result.used : 0;
}

function assertWithinNeuronBudget(currentUsage, estimated) {
  if (currentUsage + estimated > CONFIG.DAILY_NEURON_LIMIT) {
    throw {
      status: 429,
      message: 'Daily neuron limit exceeded. You have ' + (CONFIG.DAILY_NEURON_LIMIT - currentUsage) + ' neurons remaining.'
    };
  }
}

async function runAIModel(env, model, messages, temperature, maxTokens, estimatedNeurons) {
  var response = await env.AI.run(model, {
    messages: messages,
    temperature: temperature,
    max_tokens: maxTokens
  });

  var resultText = '';
  var neuronsUsed = estimatedNeurons;
  if (response.choices && response.choices[0] && response.choices[0].message) {
    resultText = response.choices[0].message.content;
    neuronsUsed = response.usage ? response.usage.neurons : estimatedNeurons;
  } else if (response.response) {
    resultText = response.response;
    neuronsUsed = response.usage ? response.usage.neurons : estimatedNeurons;
  } else if (response.result) {
    resultText = response.result;
    neuronsUsed = response.usage ? response.usage.neurons : estimatedNeurons;
  } else {
    resultText = JSON.stringify(response);
  }
  return { resultText: resultText, neuronsUsed: neuronsUsed };
}

// ---- Long-conversation memory ----
//
// The most recent MEMORY_RECENT_VERBATIM messages always go to the model
// word-for-word. Anything older than that is folded into a running
// per-conversation summary (stored on the conversations row) instead of
// being dropped, and the summary is only re-generated once enough new
// older messages have piled up — not on every single turn — to keep this
// cheap. This is what makes regenerate (and normal replies) keep "memory"
// of the whole conversation even once it's grown past the verbatim window.

async function getConversationMemory(env, conversationId) {
  var row = await env.DB.prepare('SELECT memory_summary, memory_covered_count FROM conversations WHERE id = ?').bind(conversationId).first();
  return { summary: (row && row.memory_summary) || '', covered: (row && row.memory_covered_count) || 0 };
}

async function updateConversationMemory(env, conversationId, summary, covered) {
  await env.DB.prepare('UPDATE conversations SET memory_summary = ?, memory_covered_count = ? WHERE id = ?').bind(summary, covered, conversationId).run();
}

async function summarizeOlderMessages(env, model, previousSummary, newOlderMessages) {
  var transcript = newOlderMessages.map(function (m) {
    return (m.role === 'user' ? 'User: ' : 'Assistant: ') + m.content;
  }).join('\n\n');
  var prompt =
    (previousSummary ? 'Existing summary of the conversation so far:\n' + previousSummary + '\n\n' : '') +
    'New messages to fold into that summary:\n' + transcript +
    '\n\nWrite an updated, concise summary (a few sentences to a short paragraph) capturing the key facts, decisions, and context a continuing assistant would need to remember. Output only the summary itself, no preamble.';
  var result = await runAIModel(env, model, [{ role: 'user', content: prompt }], 0.3, CONFIG.MEMORY_SUMMARY_MAX_TOKENS, 0);
  return result.resultText.trim();
}

// fullPath: ordered {role, content} messages ending in the message that
// triggered this call (the new prompt, or the user message being
// regenerated from). Returns the {role, content} array to actually send
// to the model — recent messages verbatim, older ones summarized.
async function buildModelContext(env, conversationId, model, fullPath) {
  if (fullPath.length <= CONFIG.MEMORY_RECENT_VERBATIM) {
    return fullPath.slice();
  }
  var recent = fullPath.slice(-CONFIG.MEMORY_RECENT_VERBATIM);
  var older = fullPath.slice(0, fullPath.length - CONFIG.MEMORY_RECENT_VERBATIM);
  var memory = await getConversationMemory(env, conversationId);
  var summary = memory.summary;
  var needsInitialSummary = !summary && older.length > 0;
  var needsRefresh = older.length - memory.covered >= CONFIG.MEMORY_SUMMARY_TRIGGER;
  if (needsInitialSummary || needsRefresh) {
    var newOlder = older.slice(memory.covered);
    try {
      summary = await summarizeOlderMessages(env, model, summary, newOlder);
      await updateConversationMemory(env, conversationId, summary, older.length);
    } catch (e) {
      // If summarization fails, fall back to whatever summary (or none)
      // we already had rather than failing the whole request over it.
    }
  }
  return summary
    ? [{ role: 'system', content: 'Summary of the earlier part of this conversation (context only — do not mention this note to the user):\n' + summary }].concat(recent)
    : recent;
}

// ---- Web search (RAG-style grounding) ----
//
// Provider priority: Tavily first, then Brave, if their keys are set.
// Neither is "unlimited", because no real search backend is — but both
// are official, fast APIs instead of scraping, which is what actually
// matters for stability:
//
//   TAVILY_API_KEY  — https://tavily.com — free tier: 1,000 searches/month,
//                      no card required. Purpose-built for grounding LLM
//                      answers, so it's the recommended default here.
//                      wrangler secret put TAVILY_API_KEY
//
//   BRAVE_API_KEY   — https://api.search.brave.com — used automatically if
//                      set, but as of late 2025 Brave requires a card at
//                      signup even for its free tier, so Tavily is the
//                      better zero-cost, zero-card option.
//                      wrangler secret put BRAVE_API_KEY
//
// If neither is configured, webSearch() fails soft with a message telling
// the user how to fix it, rather than silently or unreliably scraping a
// search engine that's actively trying to block that (DuckDuckGo's HTML
// pages now require a token handshake and have tightened IP-based
// rate-limiting, which is exactly what was causing slow/failed searches).

async function fetchWithTimeout(url, options, timeoutMs) {
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, timeoutMs || CONFIG.SEARCH_TIMEOUT_MS);
  try {
    return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
  } finally {
    clearTimeout(timer);
  }
}

// ---- Reading a page the user linked to ----
//
// Separate from web search: if the user's message contains a URL, that
// page is fetched directly and its text folded into context the same way
// search results are — ephemeral, never persisted, injected only for
// this one model call. HTMLRewriter (native to the Workers runtime)
// strips <script>/<style> and pulls the remaining text out of <body>,
// which is far more reliable than regex-stripping tags.

function extractUrls(text) {
  if (!text) return [];
  var matches = text.match(/https?:\/\/[^\s<>"')\]]+/gi) || [];
  var seen = {};
  var out = [];
  for (var i = 0; i < matches.length && out.length < CONFIG.MAX_PAGE_LINKS; i++) {
    var url = matches[i].replace(/[.,;:!?]+$/, '');
    if (!seen[url]) {
      seen[url] = true;
      out.push(url);
    }
  }
  return out;
}

async function fetchPageText(url) {
  try {
    var resp = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WebcoreAI/1.0; +https://workers.dev)' }
    }, CONFIG.PAGE_FETCH_TIMEOUT_MS);
    if (!resp.ok) {
      return { url: url, title: '', text: '', error: 'Could not fetch that page (HTTP ' + resp.status + ')' };
    }
    var contentType = resp.headers.get('content-type') || '';
    if (contentType && contentType.indexOf('html') === -1 && contentType.indexOf('text') === -1) {
      return { url: url, title: '', text: '', error: 'That link is not a readable web page (' + contentType + ')' };
    }

    var titleChunks = [];
    var textChunks = [];
    var rewriter = new HTMLRewriter()
      .on('title', { text: function (t) { titleChunks.push(t.text); } })
      .on('script, style, noscript, svg', { element: function (el) { el.remove(); } })
      .on('body *', { text: function (t) { if (t.text && t.text.trim()) textChunks.push(t.text); } });

    await rewriter.transform(resp).text();

    var text = textChunks.join(' ').replace(/\s+/g, ' ').trim();
    if (text.length > CONFIG.MAX_PAGE_TEXT_LENGTH) text = text.slice(0, CONFIG.MAX_PAGE_TEXT_LENGTH) + '…';

    return { url: url, title: titleChunks.join('').trim(), text: text, error: text ? null : 'That page had no readable text content' };
  } catch (err) {
    var timedOut = err && err.name === 'AbortError';
    return { url: url, title: '', text: '', error: timedOut ? 'Fetching that page timed out' : 'Could not fetch that page: ' + (err.message || 'unknown error') };
  }
}

async function readLinkedPages(urls) {
  var pages = await Promise.all(urls.map(fetchPageText));
  return pages;
}

function buildPageContextMessage(pages) {
  var usable = pages.filter(function (p) { return p.text; });
  if (!usable.length) return null;
  var sections = usable.map(function (p) {
    return 'Content of ' + p.url + (p.title ? ' ("' + p.title + '")' : '') + ':\n' + p.text;
  });
  return {
    role: 'system',
    content: 'The user included a link in their message. It was fetched just now — treat the content below as information you already read. ' +
      'Do NOT say you cannot access links or browse the web; you already have the page content here.\n\n' +
      sections.join('\n\n---\n\n')
  };
}

async function webSearch(env, query) {
  if (env.TAVILY_API_KEY) return webSearchTavily(env, query);
  if (env.BRAVE_API_KEY) return webSearchBrave(env, query);
  return {
    results: [],
    error: 'Web search needs a free API key. Sign up at tavily.com (no card required, 1,000 searches/month free), then run: wrangler secret put TAVILY_API_KEY'
  };
}

async function webSearchTavily(env, query) {
  try {
    var resp = await fetchWithTimeout('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + env.TAVILY_API_KEY
      },
      body: JSON.stringify({
        query: query,
        search_depth: 'basic',
        max_results: CONFIG.MAX_SEARCH_RESULTS
      })
    });
    if (!resp.ok) {
      return { results: [], error: 'Web search request failed (HTTP ' + resp.status + ')' };
    }
    var data = await resp.json();
    var items = data.results || [];
    var results = items.slice(0, CONFIG.MAX_SEARCH_RESULTS).map(function (r) {
      return {
        title: r.title || r.url || 'Result',
        url: r.url,
        description: r.content || ''
      };
    });
    return { results: results, error: null };
  } catch (err) {
    var timedOut = err && err.name === 'AbortError';
    return { results: [], error: timedOut ? 'Web search timed out' : 'Web search failed: ' + (err.message || 'unknown error') };
  }
}

async function webSearchBrave(env, query) {
  try {
    var url = 'https://api.search.brave.com/res/v1/web/search?q=' + encodeURIComponent(query) + '&count=' + CONFIG.MAX_SEARCH_RESULTS;
    var resp = await fetchWithTimeout(url, {
      headers: { 'Accept': 'application/json', 'X-Subscription-Token': env.BRAVE_API_KEY }
    });
    if (!resp.ok) {
      return { results: [], error: 'Web search request failed (HTTP ' + resp.status + ')' };
    }
    var data = await resp.json();
    var items = (data.web && data.web.results) || [];
    var results = items.slice(0, CONFIG.MAX_SEARCH_RESULTS).map(function (r) {
      return {
        title: (r.title || r.url || 'Result').replace(/<[^>]+>/g, ''),
        url: r.url,
        description: (r.description || '').replace(/<[^>]+>/g, '')
      };
    });
    return { results: results, error: null };
  } catch (err) {
    var timedOut = err && err.name === 'AbortError';
    return { results: [], error: timedOut ? 'Web search timed out' : 'Web search failed: ' + (err.message || 'unknown error') };
  }
}

// Turns search results into a system message the model can ground its
// answer in. This is injected only for the single AI call — it's never
// written to the database, so it can't go stale in stored conversations.
function buildSearchContextMessage(query, results) {
  var lines = results.map(function (r, i) {
    return (i + 1) + '. ' + r.title + ' (' + r.url + ')\n' + r.description;
  });
  return {
    role: 'system',
    content: 'A live web search was just run on the user\'s behalf for: "' + query + '". ' +
      'You have real, current results below — treat them as information you already looked up this turn. ' +
      'Do NOT say you cannot browse the internet, cannot access real-time information, or cannot perform web searches — that is false right now, the search already happened and the results are provided to you here. ' +
      'Answer the user\'s question directly using these results.\n\n' +
      lines.join('\n\n') +
      '\n\nWhen you rely on a result, refer to it naturally in your answer. Do not write your own numbered source list — one is appended automatically after your reply.'
  };
}

// Appended to the model's reply and persisted, so sources survive reloads
// and branch switches just like the rest of the message.
function formatSourcesMarkdown(results) {
  if (!results || !results.length) return '';
  var lines = results.map(function (r, i) { return (i + 1) + '. [' + r.title + '](' + r.url + ')'; });
  return '\n\n**Sources:**\n' + lines.join('\n');
}

// ---- Extended thinking ----
//
// Rather than depending on model-specific reasoning APIs (which vary or
// don't exist across the models in FREE_MODELS), this asks the model to
// wrap its reasoning in <thinking> tags before its real answer in
// <answer> tags. The raw response — tags and all — is what gets stored,
// so the split is reconstructed client-side at render time (see
// splitThinking() in the UI) rather than needing a separate DB column;
// that also means it survives reloads and branch switches for free, the
// same way search sources do.
function buildThinkingInstructionMessage() {
  return {
    role: 'system',
    content: 'For this reply, think through the problem carefully first. ' +
      'Put your step-by-step reasoning inside <thinking> and </thinking> tags, ' +
      'then give your final, direct answer inside <answer> and </answer> tags. ' +
      'Keep the thinking focused and not excessively long, since it shares the same output budget as your answer — always leave room to finish the answer completely. ' +
      'If the request is simple enough that reasoning isn\'t useful, you may leave the <thinking></thinking> tags empty and go straight to the answer. ' +
      'Do not put any text outside of these two tag pairs.'
  };
}

// Standing instruction, always sent (not tied to a toggle): open models
// will sometimes describe a file ("here's an HTML page that does X...")
// without actually including it, especially for longer demos. That leaves
// nothing for the UI's code/preview/copy/download block to work with, so
// this is a correctness fix, not a style preference.
// ============================================
// AGENT: TOOL REGISTRY + LOOP
// ============================================
//
// The free Workers AI models don't expose a reliable native
// function-calling API, so tool use runs on a plain-text protocol: the
// model emits a ```tool fenced JSON block, we execute it, feed the
// result back, and let it decide again. That's deliberately simple
// because simple is what these models can actually follow — every extra
// bit of required syntax is another thing they get wrong.

var TOOLS = {
  web_search: {
    description: 'Search the web for current information. Use for recent events, facts you are unsure about, or anything that may have changed recently.',
    args: '{"query": "search terms"}',
    needs: 'a TAVILY_API_KEY or BRAVE_API_KEY secret',
    available: function (env) { return !!(env.TAVILY_API_KEY || env.BRAVE_API_KEY); },
    run: async function (env, args) {
      if (!args.query) return 'Error: missing "query".';
      var res = await webSearch(env, String(args.query));
      if (res.error) return 'Search failed: ' + res.error;
      if (!res.results.length) return 'No results found.';
      return res.results.map(function (r, i) {
        return (i + 1) + '. ' + r.title + '\n   ' + r.url + '\n   ' + r.description;
      }).join('\n');
    }
  },

  fetch_url: {
    description: 'Fetch and read the text content of a specific web page URL.',
    args: '{"url": "https://example.com/page"}',
    available: function () { return true; },
    run: async function (env, args) {
      if (!args.url) return 'Error: missing "url".';
      var page = await fetchPageText(String(args.url));
      if (page.error) return 'Could not read that page: ' + page.error;
      return (page.title ? 'Title: ' + page.title + '\n\n' : '') + page.text;
    }
  },

  github: {
    description: 'Look things up on GitHub: a repository\'s details, its file tree, the contents of a file, or search for repositories.',
    args: '{"action": "repo" | "file" | "tree" | "search", "repo": "owner/name", "path": "src/index.js", "query": "search terms"}',
    available: function () { return true; },
    run: async function (env, args) { return githubTool(env, args); }
  }
};

// GitHub's public REST API needs no credentials for public data. A
// GITHUB_TOKEN secret is optional and only raises the rate limit /
// unlocks private repos — it is never required.
async function githubRequest(env, path) {
  var headers = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'WebcoreAI'
  };
  if (env.GITHUB_TOKEN) headers['Authorization'] = 'Bearer ' + env.GITHUB_TOKEN;
  var resp = await fetchWithTimeout('https://api.github.com' + path, { headers: headers }, CONFIG.PAGE_FETCH_TIMEOUT_MS);
  if (resp.status === 403) {
    return { error: 'GitHub rate limit reached. Set a GITHUB_TOKEN secret to raise it (free, no card needed).' };
  }
  if (resp.status === 404) return { error: 'Not found on GitHub (or it is private and no token is set).' };
  if (!resp.ok) return { error: 'GitHub request failed (HTTP ' + resp.status + ')' };
  return { data: await resp.json() };
}

async function githubTool(env, args) {
  var action = String(args.action || '').toLowerCase();

  if (action === 'search') {
    if (!args.query) return 'Error: missing "query".';
    var s = await githubRequest(env, '/search/repositories?q=' + encodeURIComponent(String(args.query)) + '&per_page=5');
    if (s.error) return s.error;
    if (!s.data.items || !s.data.items.length) return 'No repositories found.';
    return s.data.items.map(function (r) {
      return r.full_name + ' (' + (r.stargazers_count || 0) + ' stars)\n  ' + (r.description || 'no description') + '\n  ' + r.html_url;
    }).join('\n');
  }

  if (!args.repo || String(args.repo).indexOf('/') === -1) {
    return 'Error: "repo" must be in "owner/name" form.';
  }
  var repo = String(args.repo);

  if (action === 'repo') {
    var r = await githubRequest(env, '/repos/' + repo);
    if (r.error) return r.error;
    var d = r.data;
    return ['Repository: ' + d.full_name,
      'Description: ' + (d.description || 'none'),
      'Language: ' + (d.language || 'unknown'),
      'Stars: ' + d.stargazers_count + '  Forks: ' + d.forks_count + '  Open issues: ' + d.open_issues_count,
      'Default branch: ' + d.default_branch,
      'URL: ' + d.html_url].join('\n');
  }

  if (action === 'tree') {
    var meta = await githubRequest(env, '/repos/' + repo);
    if (meta.error) return meta.error;
    var t = await githubRequest(env, '/repos/' + repo + '/git/trees/' + meta.data.default_branch + '?recursive=1');
    if (t.error) return t.error;
    var files = (t.data.tree || []).filter(function (n) { return n.type === 'blob'; }).slice(0, 100);
    if (!files.length) return 'No files found.';
    return 'Files in ' + repo + ':\n' + files.map(function (n) { return '  ' + n.path; }).join('\n');
  }

  if (action === 'file') {
    if (!args.path) return 'Error: missing "path".';
    var f = await githubRequest(env, '/repos/' + repo + '/contents/' + String(args.path).replace(/^\//, ''));
    if (f.error) return f.error;
    if (Array.isArray(f.data)) {
      return 'That path is a directory. Contents:\n' + f.data.map(function (e) { return '  ' + e.name + (e.type === 'dir' ? '/' : ''); }).join('\n');
    }
    if (f.data.encoding !== 'base64' || !f.data.content) return 'Could not read that file (it may be binary or too large).';
    var decoded;
    try { decoded = atob(f.data.content.replace(/\n/g, '')); } catch (e) { return 'Could not decode that file.'; }
    return 'Contents of ' + repo + '/' + args.path + ':\n\n' + decoded;
  }

  return 'Error: unknown action. Use "repo", "file", "tree", or "search".';
}

function buildAgentSystemMessage(env) {
  var names = Object.keys(TOOLS).filter(function (n) { return TOOLS[n].available(env); });
  var lines = names.map(function (n) {
    return '- ' + n + ': ' + TOOLS[n].description + '\n  arguments: ' + TOOLS[n].args;
  });
  var unavailable = Object.keys(TOOLS).filter(function (n) { return !TOOLS[n].available(env); });
  var note = unavailable.length
    ? '\n\nCurrently unavailable (not configured on this deployment, do not try to call them): ' +
      unavailable.map(function (n) { return n + ' (needs ' + (TOOLS[n].needs || 'configuration') + ')'; }).join(', ') + '.'
    : '';

  return {
    role: 'system',
    content: 'You have access to tools. When you need one, reply with NOTHING but a single fenced block in exactly this format:\n\n' +
      '```tool\n{"tool": "tool_name", "args": {...}}\n```\n\n' +
      'Available tools:\n' + lines.join('\n') + note + '\n\n' +
      'Rules:\n' +
      '- Call one tool at a time. You will be given its result, then you can call another or answer.\n' +
      '- Only use a tool when it genuinely helps. If you already know the answer, just answer.\n' +
      '- When you call a tool, output the fenced block ALONE with no other text.\n' +
      '- When you are done using tools, write your final answer normally, with no tool block.\n' +
      '- Never invent tool results. Only use what the tool actually returned.'
  };
}

// Pulls a tool call out of a model reply. Accepts the documented fenced
// form, and also a bare JSON object, since these models frequently drop
// the fence despite instructions — being lenient here costs nothing and
// recovers a lot of otherwise-wasted turns.
function parseToolCall(text) {
  if (!text) return null;
  var candidate = null;
  var fenced = text.match(/```(?:tool|json)?\s*(\{[\s\S]*?\})\s*```/i);
  if (fenced) {
    candidate = fenced[1];
  } else {
    var trimmed = text.trim();
    if (trimmed.indexOf('{') === 0 && trimmed.lastIndexOf('}') === trimmed.length - 1) {
      candidate = trimmed;
    }
  }
  if (!candidate) return null;
  var parsed;
  try { parsed = JSON.parse(candidate); } catch (e) { return null; }
  if (!parsed || typeof parsed.tool !== 'string') return null;
  return { tool: parsed.tool, args: (parsed.args && typeof parsed.args === 'object') ? parsed.args : {} };
}

function summarizeToolArgs(args) {
  var parts = [];
  for (var k in args) {
    if (Object.prototype.hasOwnProperty.call(args, k)) {
      var v = String(args[k]);
      parts.push(k + '=' + (v.length > 60 ? v.slice(0, 60) + '…' : v));
    }
  }
  return parts.join(', ');
}

// Runs the model repeatedly, executing any tools it asks for, until it
// produces a plain answer or we hit MAX_AGENT_STEPS. Returns the final
// text plus a trace of what it did, and reports total neuron usage
// across every model call it made (not just the last one).
async function runAgentLoop(env, model, baseMessages, temperature, maxTokens, estimatedNeurons, send) {
  var messages = baseMessages.slice();
  messages.unshift(buildAgentSystemMessage(env));

  var totalNeurons = 0;
  var trace = [];
  var finalText = '';

  for (var step = 0; step < CONFIG.MAX_AGENT_STEPS; step++) {
    var result = await runAIModel(env, model, messages, temperature, maxTokens, estimatedNeurons);
    totalNeurons += result.neuronsUsed;

    var call = parseToolCall(result.resultText);
    if (!call) {
      finalText = result.resultText;
      break;
    }

    var tool = TOOLS[call.tool];
    var output;
    if (!tool) {
      output = 'Error: no such tool "' + call.tool + '". Available: ' + Object.keys(TOOLS).join(', ') + '.';
    } else if (!tool.available(env)) {
      output = 'Error: the "' + call.tool + '" tool is not configured on this deployment. Answer without it.';
    } else {
      await send({ type: 'status', stage: 'tool', tool: call.tool, detail: summarizeToolArgs(call.args) });
      try {
        output = await tool.run(env, call.args);
      } catch (err) {
        output = 'Tool error: ' + ((err && err.message) || 'unknown error');
      }
    }

    output = String(output || '');
    if (output.length > CONFIG.MAX_TOOL_RESULT_LENGTH) {
      output = output.slice(0, CONFIG.MAX_TOOL_RESULT_LENGTH) + '\n…(truncated)';
    }

    trace.push({ tool: call.tool, args: summarizeToolArgs(call.args) });

    messages.push({ role: 'assistant', content: result.resultText });
    messages.push({ role: 'user', content: 'Tool result for ' + call.tool + ':\n\n' + output + '\n\nUse this to continue. Call another tool if needed, otherwise give your final answer.' });

    await send({ type: 'status', stage: 'generating', model: model });
  }

  // Ran out of steps while still calling tools — ask once for a plain
  // answer using everything gathered so far, rather than returning the
  // raw tool-call JSON to the user.
  if (!finalText) {
    messages.push({ role: 'user', content: 'Stop using tools now and give your final answer in plain prose based on what you have gathered. Do not output any tool block.' });
    var wrap = await runAIModel(env, model, messages, temperature, maxTokens, estimatedNeurons);
    totalNeurons += wrap.neuronsUsed;
    finalText = wrap.resultText;
  }

  // Last line of defence: a stubborn model can still hand back a tool
  // block here. Raw JSON is never an acceptable thing to show the user,
  // so strip it and say plainly that it ran out of steps.
  if (parseToolCall(finalText)) {
    finalText = finalText.replace(/```(?:tool|json)?\s*\{[\s\S]*?\}\s*```/gi, '').trim();
    if (!finalText || finalText.charAt(0) === '{') {
      finalText = 'I ran out of tool steps before reaching an answer. Here is what I gathered:\n\n' +
        trace.map(function (t, i) { return (i + 1) + '. Used ' + t.tool + (t.args ? ' (' + t.args + ')' : ''); }).join('\n') +
        '\n\nTry asking again, or narrow the question.';
    }
  }

  return { resultText: finalText, neuronsUsed: totalNeurons, trace: trace };
}

function formatToolTrace(trace) {
  if (!trace || !trace.length) return '';
  var lines = trace.map(function (t, i) {
    return (i + 1) + '. ' + t.tool + (t.args ? ' (' + t.args + ')' : '');
  });
  return '<thinking>Tools used:\n' + lines.join('\n') + '</thinking>\n\n';
}

function buildCodeOutputInstructionMessage() {
  return {
    role: 'system',
    content: 'If your answer involves writing any code, an HTML page, a script, or any other file, ' +
      'you must include its complete contents in a fenced code block with the correct language tag ' +
      '(for example ```html, ```javascript, ```python) — never omit it, truncate it, or merely describe ' +
      'what the file would contain. The user can only see, preview, copy, or download exactly what you ' +
      'put inside the code block, nothing else, so describing a file instead of writing it leaves them ' +
      'with nothing.'
  };
}

// ---- Conversation tree helpers (claude.ai-style branching) ----
//
// Every message row has a parent_id. Regenerating an assistant message
// never deletes or overwrites anything — it inserts a new sibling row
// under the same parent, and the parent's active_child_id is pointed at
// the new sibling. The "active path" (root -> ... -> active leaf) is what
// gets displayed; every previous variant stays in the table and can be
// switched back to at any time, even after a reload.

async function loadConversationTree(env, conversationId) {
  var res = await env.DB.prepare(
    'SELECT id, parent_id, role, content, timestamp, active_child_id FROM messages WHERE conversation_id = ? ORDER BY id ASC'
  ).bind(conversationId).all();
  var rows = res.results || [];
  var byId = {};
  var childrenByParent = {};
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    byId[row.id] = row;
    var key = row.parent_id == null ? 'root' : String(row.parent_id);
    if (!childrenByParent[key]) childrenByParent[key] = [];
    childrenByParent[key].push(row.id);
  }
  return { byId: byId, childrenByParent: childrenByParent };
}

// Walks root -> active leaf, returning display-ready message objects with
// sibling/version metadata attached.
function getActivePath(tree) {
  var rootIds = tree.childrenByParent['root'] || [];
  if (rootIds.length === 0) return [];
  var current = tree.byId[rootIds[0]];
  var path = [];
  while (current) {
    var key = current.parent_id == null ? 'root' : String(current.parent_id);
    var siblingIds = tree.childrenByParent[key] || [current.id];
    path.push({
      id: current.id,
      role: current.role,
      content: current.content,
      version_index: siblingIds.indexOf(current.id),
      version_count: siblingIds.length,
      version_ids: siblingIds
    });
    current = current.active_child_id ? tree.byId[current.active_child_id] : null;
  }
  return path;
}

// Ancestor chain (role/content only) leading up to — but not including —
// the given message id. This is the actual context that message was
// generated from, regardless of which branches are currently active.
function getAncestorMessages(tree, messageId) {
  var chain = [];
  var node = tree.byId[messageId];
  var parentId = node ? node.parent_id : null;
  while (parentId) {
    var parent = tree.byId[parentId];
    if (!parent) break;
    chain.unshift({ role: parent.role, content: parent.content });
    parentId = parent.parent_id;
  }
  return chain;
}

// Builds one display item the same way getActivePath does, but for an
// arbitrary node — used to reconstruct the response payload in-memory
// right after an insert, instead of re-querying the whole conversation.
function buildDisplayItem(tree, node, overrideSiblingIds) {
  var key = node.parent_id == null ? 'root' : String(node.parent_id);
  var siblingIds = overrideSiblingIds || tree.childrenByParent[key] || [node.id];
  return {
    id: node.id,
    role: node.role,
    content: node.content,
    version_index: siblingIds.indexOf(node.id),
    version_count: siblingIds.length,
    version_ids: siblingIds
  };
}

// Ancestor chain WITH display metadata, root -> nodeId inclusive.
function pathToNode(tree, nodeId) {
  if (nodeId == null) return [];
  var chain = [];
  var current = tree.byId[nodeId];
  while (current) {
    chain.unshift(current);
    current = current.parent_id != null ? tree.byId[current.parent_id] : null;
  }
  return chain.map(function (node) { return buildDisplayItem(tree, node); });
}

async function buildConversationPayload(env, conversationId) {
  var convStmt = env.DB.prepare('SELECT * FROM conversations WHERE id = ?');
  var conv = await convStmt.bind(conversationId).first();
  if (!conv) return null;
  var tree = await loadConversationTree(env, conversationId);
  var messages = getActivePath(tree);
  return { success: true, id: conv.id, title: conv.title, messages: messages };
}

// ============================================
// WORKER HANDLER
// ============================================

export default {
  async fetch(request, env) {
    var url = new URL(request.url);
    var method = request.method;
    var path = url.pathname;

    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    if (method === 'GET' && path === '/') {
      return new Response(UI_HTML, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN,
          // The shell is a static string baked into the Worker — it only
          // changes on redeploy, so let the browser (and Cloudflare's edge)
          // cache it instead of re-downloading ~40KB on every visit.
          'Cache-Control': 'public, max-age=300'
        }
      });
    }

    await initDatabase(env);

    // GET /api/neurons
    if (method === 'GET' && path === '/api/neurons') {
      try {
        var today = new Date().toISOString().split('T')[0];
        var used = await getTodayUsage(env, today);
        return jsonResponse({ success: true, used: used, limit: CONFIG.DAILY_NEURON_LIMIT });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    // GET /api/conversations
    if (method === 'GET' && path === '/api/conversations') {
      try {
        var stmt = env.DB.prepare(
          'SELECT c.id, c.title, c.created_at, c.updated_at, COUNT(m.id) as message_count ' +
          'FROM conversations c LEFT JOIN messages m ON c.id = m.conversation_id ' +
          'GROUP BY c.id ORDER BY c.updated_at DESC'
        );
        var result = await stmt.all();
        return jsonResponse({ success: true, conversations: result.results || [] });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    // POST /api/conversations
    if (method === 'POST' && path === '/api/conversations') {
      try {
        var body = await request.json();
        var id = crypto.randomUUID();
        var title = (body.title || 'New Chat').toString().slice(0, 100);
        var now = Date.now();
        var stmt = env.DB.prepare(
          'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)'
        );
        await stmt.bind(id, title, now, now).run();
        return jsonResponse({ success: true, id: id, title: title });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    // PUT /api/conversations/:id
    if (method === 'PUT' && path.match(/^\/api\/conversations\/[^\/]+$/)) {
      try {
        var id = path.split('/').pop();
        var body = await request.json();
        var newTitle = (body.title || 'Untitled').toString().slice(0, 100);
        var now = Date.now();
        var stmt = env.DB.prepare(
          'UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?'
        );
        await stmt.bind(newTitle, now, id).run();
        return jsonResponse({ success: true, id: id, title: newTitle });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    // GET /api/conversations/:id
    if (method === 'GET' && path.match(/^\/api\/conversations\/[^\/]+$/)) {
      try {
        var id = path.split('/').pop();
        var payload = await buildConversationPayload(env, id);
        if (!payload) {
          return jsonResponse({ success: false, error: 'Conversation not found' }, 404);
        }
        return jsonResponse(payload);
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    // DELETE /api/conversations/:id
    if (method === 'DELETE' && path.match(/^\/api\/conversations\/[^\/]+$/)) {
      try {
        var id = path.split('/').pop();
        var delMsgs = env.DB.prepare('DELETE FROM messages WHERE conversation_id = ?');
        await delMsgs.bind(id).run();
        var delConv = env.DB.prepare('DELETE FROM conversations WHERE id = ?');
        await delConv.bind(id).run();
        return jsonResponse({ success: true });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    // POST /api/conversations/:id/branch — switch which sibling variant is active
    var branchMatch = path.match(/^\/api\/conversations\/([^\/]+)\/branch$/);
    if (method === 'POST' && branchMatch) {
      try {
        var conversationId = branchMatch[1];
        var body = await request.json();
        var messageId = body.message_id;
        if (!messageId) {
          return jsonResponse({ success: false, error: 'message_id is required' }, 400);
        }

        var tree = await loadConversationTree(env, conversationId);
        var target = tree.byId[messageId];
        if (!target) {
          return jsonResponse({ success: false, error: 'Message not found in this conversation' }, 404);
        }
        if (target.parent_id == null) {
          return jsonResponse({ success: false, error: 'This message has no alternate versions' }, 400);
        }

        var updateStmt = env.DB.prepare('UPDATE messages SET active_child_id = ? WHERE id = ?');
        await updateStmt.bind(target.id, target.parent_id).run();

        var payload = await buildConversationPayload(env, conversationId);
        return jsonResponse(payload);
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    // POST /api/chat
    if (method === 'POST' && path === '/api/chat') {
      return streamJsonEvents(async function (send) {
        var body = await request.json();
        var conversationId = body.conversation_id;
        var prompt = body.prompt ? body.prompt.trim() : '';

        if (!prompt) {
          return send({ type: 'result', success: false, error: 'Prompt is required' });
        }
        if (prompt.length > CONFIG.MAX_PROMPT_LENGTH) {
          return send({ type: 'result', success: false, error: 'Prompt too long. Maximum ' + CONFIG.MAX_PROMPT_LENGTH + ' characters.' });
        }
        if (!conversationId) {
          return send({ type: 'result', success: false, error: 'Conversation ID is required' });
        }

        var resolved;
        try {
          resolved = resolveModel(body.model);
        } catch (err) {
          return send({ type: 'result', success: false, error: err.message });
        }
        var temperature = clampTemperature(body.temperature);
        var max_tokens = clampMaxTokens(body.max_tokens, resolved.maxTokens);
        var wantsSearch = !!body.web_search;
        var wantsThinking = !!body.thinking;
        var wantsAgent = !!body.agent;

        var convCheck = env.DB.prepare('SELECT id FROM conversations WHERE id = ?');
        var convExists = await convCheck.bind(conversationId).first();
        if (!convExists) {
          return send({ type: 'result', success: false, error: 'Conversation not found' });
        }

        // In agent mode the model decides for itself whether to search or
        // fetch a page, so we skip the forced injection below and let the
        // tool loop drive.
        var searchContextMessage = null;
        var searchResults = [];
        var searchError = null;
        if (wantsSearch && !wantsAgent) {
          await send({ type: 'status', stage: 'searching' });
          var searchResult = await webSearch(env, prompt);
          searchError = searchResult.error;
          if (searchResult.results.length) {
            searchResults = searchResult.results;
            searchContextMessage = buildSearchContextMessage(prompt, searchResults);
          }
        }

        // If the user pasted a link, read that page directly. This needs
        // no toggle and no API key — it's a plain fetch of a URL they
        // explicitly gave us.
        var pageContextMessage = null;
        var pageError = null;
        var linkedUrls = wantsAgent ? [] : extractUrls(prompt);
        if (linkedUrls.length) {
          await send({ type: 'status', stage: 'reading_page' });
          var pages = await readLinkedPages(linkedUrls);
          pageContextMessage = buildPageContextMessage(pages);
          if (!pageContextMessage) {
            var firstErr = pages.find(function (p) { return p.error; });
            pageError = firstErr ? firstErr.error : null;
          }
        }

        var today = new Date().toISOString().split('T')[0];
        var currentUsage = await getTodayUsage(env, today);
        var extraContextLength = (searchContextMessage ? searchContextMessage.content.length : 0) +
          (pageContextMessage ? pageContextMessage.content.length : 0);
        var estimatedNeurons = estimateNeurons(prompt.length + extraContextLength, max_tokens);
        try {
          assertWithinNeuronBudget(currentUsage, estimatedNeurons);
        } catch (err) {
          return send({ type: 'result', success: false, error: err.message });
        }

        // The new message continues from wherever the conversation is
        // currently displayed (the active leaf), so sending a message after
        // switching to an older branch continues *that* branch — matching
        // claude.ai's behavior.
        var tree = await loadConversationTree(env, conversationId);
        var activePath = getActivePath(tree);
        var parentId = activePath.length ? activePath[activePath.length - 1].id : null;

        var fullPath = activePath.map(function (m) { return { role: m.role, content: m.content }; });
        fullPath.push({ role: 'user', content: prompt });
        var contextMessages = await buildModelContext(env, conversationId, resolved.model, fullPath);
        // Search and page context are only ever sent to the model for this
        // one call — never stored, so a conversation never carries stale
        // fetched content forward into later turns.
        if (pageContextMessage) contextMessages.unshift(pageContextMessage);
        if (searchContextMessage) contextMessages.unshift(searchContextMessage);
        if (wantsThinking) contextMessages.unshift(buildThinkingInstructionMessage());
        contextMessages.unshift(buildCodeOutputInstructionMessage());

        await send({ type: 'status', stage: 'generating', model: resolved.model });
        var aiResult;
        if (wantsAgent) {
          aiResult = await runAgentLoop(env, resolved.model, contextMessages, temperature, max_tokens, estimatedNeurons, send);
          // The trace is stored inside <thinking> tags so it renders in the
          // existing collapsible block and survives reloads for free.
          if (aiResult.trace && aiResult.trace.length) {
            aiResult.resultText = formatToolTrace(aiResult.trace) + aiResult.resultText;
          }
        } else {
          aiResult = await runAIModel(env, resolved.model, contextMessages, temperature, max_tokens, estimatedNeurons);
        }
        if (searchResults.length) aiResult.resultText += formatSourcesMarkdown(searchResults);

        var now = Date.now();
        var insertStmt = env.DB.prepare(
          'INSERT INTO messages (conversation_id, parent_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)'
        );
        // The user row has to be inserted (and its id known) before the
        // assistant row can reference it as a parent.
        var userInsert = await insertStmt.bind(conversationId, parentId, 'user', prompt, now).run();
        var userMessageId = userInsert.meta.last_row_id;

        // Everything that depends on userMessageId goes in one batch: the
        // assistant reply, linking the previous leaf to its new child, and
        // bumping the conversation's updated_at — one round trip instead
        // of several sequential ones.
        var chatBatchStmts = [
          insertStmt.bind(conversationId, userMessageId, 'assistant', aiResult.resultText, now + 1),
          env.DB.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').bind(now, conversationId)
        ];
        if (parentId) {
          chatBatchStmts.push(env.DB.prepare('UPDATE messages SET active_child_id = ? WHERE id = ?').bind(userMessageId, parentId));
        }
        var chatBatchResults = await env.DB.batch(chatBatchStmts);
        var assistantMessageId = chatBatchResults[0].meta.last_row_id;

        // Final batch: link the user message to its new assistant child and
        // record neuron usage together, again as one round trip.
        await env.DB.batch([
          env.DB.prepare('UPDATE messages SET active_child_id = ? WHERE id = ?').bind(assistantMessageId, userMessageId),
          env.DB.prepare('INSERT INTO neuron_usage (date, used) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET used = used + ?').bind(today, aiResult.neuronsUsed, aiResult.neuronsUsed)
        ]);
        var newUsage = currentUsage + aiResult.neuronsUsed;

        // Build the updated display path in-memory — we already know
        // exactly what was just added, so there's no need to re-query the
        // whole conversation tree just to report it back.
        var userDisplayItem = { id: userMessageId, role: 'user', content: prompt, version_index: 0, version_count: 1, version_ids: [userMessageId] };
        var assistantDisplayItem = { id: assistantMessageId, role: 'assistant', content: aiResult.resultText, version_index: 0, version_count: 1, version_ids: [assistantMessageId] };
        var finalMessages = activePath.concat([userDisplayItem, assistantDisplayItem]);

        await send({
          type: 'result',
          success: true,
          response: aiResult.resultText,
          messages: finalMessages,
          neurons_used: aiResult.neuronsUsed,
          total_neurons_used: newUsage,
          remaining_neurons: CONFIG.DAILY_NEURON_LIMIT - newUsage,
          search_error: wantsSearch ? searchError : null,
          page_error: pageError || null
        });
      });
    }

    // POST /api/regenerate
    if (method === 'POST' && path === '/api/regenerate') {
      return streamJsonEvents(async function (send) {
        var body = await request.json();
        var conversationId = body.conversation_id;
        var messageId = body.message_id;

        if (!conversationId) {
          return send({ type: 'result', success: false, error: 'Conversation ID is required' });
        }
        if (!messageId) {
          return send({ type: 'result', success: false, error: 'message_id is required' });
        }

        var resolved;
        try {
          resolved = resolveModel(body.model);
        } catch (err) {
          return send({ type: 'result', success: false, error: err.message });
        }
        var temperature = clampTemperature(body.temperature);
        var max_tokens = clampMaxTokens(body.max_tokens, resolved.maxTokens);
        var wantsSearch = !!body.web_search;
        var wantsThinking = !!body.thinking;
        var wantsAgent = !!body.agent;

        var convCheck = env.DB.prepare('SELECT id FROM conversations WHERE id = ?');
        var convExists = await convCheck.bind(conversationId).first();
        if (!convExists) {
          return send({ type: 'result', success: false, error: 'Conversation not found' });
        }

        var tree = await loadConversationTree(env, conversationId);
        var target = tree.byId[messageId];
        if (!target) {
          return send({ type: 'result', success: false, error: 'Message not found in this conversation' });
        }
        if (target.role !== 'assistant') {
          return send({ type: 'result', success: false, error: 'Only assistant messages can be regenerated' });
        }
        if (target.parent_id == null) {
          return send({ type: 'result', success: false, error: 'This message has no preceding prompt to regenerate from' });
        }

        // The real ancestry of the message being regenerated — not the
        // currently active path — so regenerating a message on an older
        // branch still uses the context it actually belongs to.
        var ancestors = getAncestorMessages(tree, messageId);
        if (ancestors.length === 0 || ancestors[ancestors.length - 1].role !== 'user') {
          return send({ type: 'result', success: false, error: 'No preceding user message to regenerate from' });
        }
        var promptForEstimate = ancestors[ancestors.length - 1].content || '';

        var searchContextMessage = null;
        var searchResults = [];
        var searchError = null;
        if (wantsSearch && !wantsAgent) {
          await send({ type: 'status', stage: 'searching' });
          var searchResult = await webSearch(env, promptForEstimate);
          searchError = searchResult.error;
          if (searchResult.results.length) {
            searchResults = searchResult.results;
            searchContextMessage = buildSearchContextMessage(promptForEstimate, searchResults);
          }
        }

        var pageContextMessage = null;
        var pageError = null;
        var linkedUrls = wantsAgent ? [] : extractUrls(promptForEstimate);
        if (linkedUrls.length) {
          await send({ type: 'status', stage: 'reading_page' });
          var pages = await readLinkedPages(linkedUrls);
          pageContextMessage = buildPageContextMessage(pages);
          if (!pageContextMessage) {
            var firstErr = pages.find(function (p) { return p.error; });
            pageError = firstErr ? firstErr.error : null;
          }
        }

        var today = new Date().toISOString().split('T')[0];
        var currentUsage = await getTodayUsage(env, today);
        var extraContextLength = searchContextMessage ? searchContextMessage.content.length : 0;
        var estimatedNeurons = estimateNeurons(promptForEstimate.length + extraContextLength, max_tokens);
        try {
          assertWithinNeuronBudget(currentUsage, estimatedNeurons);
        } catch (err) {
          return send({ type: 'result', success: false, error: err.message });
        }

        var modelMessages = await buildModelContext(env, conversationId, resolved.model, ancestors);
        if (pageContextMessage) modelMessages.unshift(pageContextMessage);
        if (searchContextMessage) modelMessages.unshift(searchContextMessage);
        if (wantsThinking) modelMessages.unshift(buildThinkingInstructionMessage());
        modelMessages.unshift(buildCodeOutputInstructionMessage());
        await send({ type: 'status', stage: 'generating', model: resolved.model });
        var aiResult;
        if (wantsAgent) {
          aiResult = await runAgentLoop(env, resolved.model, modelMessages, temperature, max_tokens, estimatedNeurons, send);
          if (aiResult.trace && aiResult.trace.length) {
            aiResult.resultText = formatToolTrace(aiResult.trace) + aiResult.resultText;
          }
        } else {
          aiResult = await runAIModel(env, resolved.model, modelMessages, temperature, max_tokens, estimatedNeurons);
        }
        if (searchResults.length) aiResult.resultText += formatSourcesMarkdown(searchResults);

        // Insert the regenerated response as a NEW sibling under the same
        // parent — the original message (and anything downstream of it) is
        // left untouched and stays reachable by switching branches back.
        var now = Date.now();
        var insertResult = await env.DB.prepare(
          'INSERT INTO messages (conversation_id, parent_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)'
        ).bind(conversationId, target.parent_id, 'assistant', aiResult.resultText, now).run();
        var newMessageId = insertResult.meta.last_row_id;

        await env.DB.batch([
          env.DB.prepare('UPDATE messages SET active_child_id = ? WHERE id = ?').bind(newMessageId, target.parent_id),
          env.DB.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').bind(now, conversationId),
          env.DB.prepare('INSERT INTO neuron_usage (date, used) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET used = used + ?').bind(today, aiResult.neuronsUsed, aiResult.neuronsUsed)
        ]);
        var newUsage = currentUsage + aiResult.neuronsUsed;

        // Build the updated display path in-memory: the ancestor chain up
        // to (and including) the parent hasn't changed, so we only need to
        // fold the new sibling into that parent's existing child list —
        // no need to re-query the whole conversation tree for this.
        var oldSiblingKey = target.parent_id == null ? 'root' : String(target.parent_id);
        var oldSiblingIds = tree.childrenByParent[oldSiblingKey] || [target.id];
        var newSiblingIds = oldSiblingIds.concat([newMessageId]);
        var newDisplayItem = {
          id: newMessageId,
          role: 'assistant',
          content: aiResult.resultText,
          version_index: newSiblingIds.length - 1,
          version_count: newSiblingIds.length,
          version_ids: newSiblingIds
        };
        var finalMessages = pathToNode(tree, target.parent_id).concat([newDisplayItem]);

        await send({
          type: 'result',
          success: true,
          response: aiResult.resultText,
          message_id: newMessageId,
          messages: finalMessages,
          neurons_used: aiResult.neuronsUsed,
          total_neurons_used: newUsage,
          remaining_neurons: CONFIG.DAILY_NEURON_LIMIT - newUsage,
          search_error: wantsSearch ? searchError : null,
          page_error: pageError || null
        });
      });
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders() });
  }
};  '@cf/google/gemma-4-26b-a4b-it': { name: 'Gemma 4 26B', maxTokens: 800 },
  '@cf/zai-org/glm-4.7-flash': { name: 'GLM 4.7 Flash', maxTokens: 800 },
  '@cf/qwen/qwen3.8-27b': { name: 'Qwen 3.8 27B', maxTokens: 1000 }
};

// ===== HTML UI =====
var UI_HTML = '<!DOCTYPE html><html lang="en" data-theme="light"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" /><title>Webcore AI</title><style>' +
':root{--bg:#fff;--surface:#F6F6F5;--border:#E1E1DE;--text:#131316;--text-dim:#6C6C72;--accent:#2547F4;--accent-dim:#E9ECFE;--warn:#C7431E;--user-bg:#131316;--user-text:#fff;--radius:6px}' +
'html[data-theme="dark"]{--bg:#0A0A0C;--surface:#151517;--border:#29292D;--text:#F1F1EF;--text-dim:#8B8B91;--accent:#6C89FF;--accent-dim:#16193A;--warn:#FF8A63;--user-bg:#F1F1EF;--user-text:#0A0A0C}' +
'*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}' +
'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Ubuntu,sans-serif;background:var(--bg);color:var(--text);height:100dvh;overflow:hidden;display:flex;flex-direction:column;position:relative;transition:background .2s ease,color .2s ease;overscroll-behavior:none}' +
'.app{display:flex;height:100dvh;width:100vw;overflow:hidden;position:relative}' +
'.sidebar{position:fixed;top:0;left:0;width:280px;height:100dvh;background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;transform:translateX(-100%);transition:transform .3s cubic-bezier(.4,0,.2,1);z-index:1000;padding-bottom:env(safe-area-inset-bottom)}' +
'.sidebar.open{transform:translateX(0)}' +
'.sidebar-header{padding:16px 20px;border-bottom:1px solid var(--border);flex-shrink:0}' +
'.sidebar-header h2{font-size:16px;font-weight:600}' +
'.sidebar-header .sub{font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:10px;color:var(--text-dim);margin-top:3px;letter-spacing:.03em}' +
'.sidebar-actions{padding:10px 20px;border-bottom:1px solid var(--border);display:flex;gap:6px;flex-shrink:0}' +
'.sidebar-actions button{flex:1;padding:6px 10px;background:var(--accent);color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;touch-action:manipulation}' +
'html[data-theme="dark"] .sidebar-actions button{color:var(--bg)}' +
'.sidebar-actions button.secondary{background:var(--bg);color:var(--text-dim);border:1px solid var(--border)}' +
'.conversation-list{flex:1;overflow-y:auto;padding:8px 0;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}' +
'.conversation-item{padding:8px 16px;cursor:pointer;transition:background .15s;border-left:2px solid transparent;position:relative;touch-action:manipulation;min-height:44px}' +
'.conversation-item.active{background:var(--accent-dim);border-left-color:var(--accent)}' +
'.conversation-item .title{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:50px}' +
'.conversation-item .meta{font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:10px;color:var(--text-dim);margin-top:1px}' +
'.conversation-item .actions{position:absolute;right:6px;top:50%;transform:translateY(-50%);display:flex;gap:2px}' +
'.conversation-item .actions button{background:none;border:none;cursor:pointer;font-size:12px;padding:2px 4px;border-radius:4px;color:var(--text-dim);touch-action:manipulation}' +
'.conversation-item .actions .rename-btn:hover{color:var(--accent)}' +
'.conversation-item .actions .delete-btn:hover{color:var(--warn)}' +
'.main-area{flex:1;display:flex;flex-direction:column;height:100dvh;min-width:0;position:relative;background:var(--bg)}' +
'.header{padding:8px 12px;border-bottom:1px solid var(--border);flex-shrink:0;display:flex;justify-content:space-between;align-items:center;background:var(--bg);z-index:10;min-height:48px;gap:8px}' +
'.header-left{display:flex;align-items:center;gap:6px;min-width:0}' +
'.header-right{display:flex;align-items:center;gap:6px;flex-shrink:0}' +
'.hamburger{background:none;border:none;font-size:20px;cursor:pointer;padding:4px;touch-action:manipulation;color:var(--text);display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:4px;flex-shrink:0}' +
'.hamburger:active{background:var(--surface)}' +
'.header h1{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px}' +
'.header .subtitle{font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:10px;color:var(--text-dim);display:inline;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80px}' +
'.header .model-badge{font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:9px;color:var(--text-dim);background:var(--surface);border:1px solid var(--border);padding:2px 8px;border-radius:4px;white-space:nowrap;flex-shrink:0}' +
'.theme-toggle{width:28px;height:28px;border-radius:4px;border:1px solid var(--border);background:var(--surface);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text);flex-shrink:0;transition:border-color .15s ease}' +
'.theme-toggle:hover{border-color:var(--text-dim)}' +
'.theme-toggle svg{width:14px;height:14px}' +
'.content-area{flex:1;display:flex;flex-direction:column;min-height:0;position:relative}' +
'.content-area.is-empty{justify-content:center}' +
'.content-area.is-empty .chat-container{display:none}' +
'.content-area.is-empty .typing-indicator{display:none!important}' +
'.content-area.is-empty .input-area{border-top:none;max-width:640px;width:100%;margin:0 auto;padding-left:16px;padding-right:16px}' +
'.welcome-heading{display:none;text-align:center;padding:0 20px 20px;max-width:480px;margin:0 auto}' +
'.welcome-heading h2{font-size:22px;font-weight:600;color:var(--text);margin-bottom:6px}' +
'.welcome-heading p{font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:12px;color:var(--text-dim);line-height:1.5}' +
'.content-area.is-empty .welcome-heading{display:block}' +
'.chat-container{flex:1;overflow-y:auto;padding:10px 12px 8px;display:flex;flex-direction:column;gap:8px;-webkit-overflow-scrolling:touch;scroll-behavior:smooth;background:var(--bg);overscroll-behavior:contain}' +
'.message{max-width:88%;padding:8px 12px;border-radius:var(--radius);line-height:1.4;font-size:13px;word-wrap:break-word;animation:fadeIn .2s ease;position:relative}' +
'.message .version-nav{display:flex;align-items:center;gap:3px;margin-top:4px;padding-top:4px;border-top:1px solid var(--border);justify-content:center;flex-wrap:wrap}' +
'.message .version-nav button{background:none;border:1px solid var(--border);border-radius:3px;padding:2px 6px;font-size:10px;cursor:pointer;color:var(--text-dim);min-width:24px;touch-action:manipulation;height:22px}' +
'.message .version-nav button:disabled{opacity:.3;cursor:not-allowed}' +
'.message .version-nav .version-info{font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:10px;color:var(--text-dim);min-width:28px;text-align:center}' +
'.message .version-nav .regenerate-btn{background:none;border:none;cursor:pointer;font-size:12px;color:var(--accent);padding:2px 4px;height:22px}' +
'.message.user{align-self:flex-end;background:var(--user-bg);color:var(--user-text);border-bottom-right-radius:2px}' +
'.message.assistant{align-self:flex-start;background:var(--surface);color:var(--text);border:1px solid var(--border);border-bottom-left-radius:2px}' +
'.message .label{font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:9px;font-weight:500;letter-spacing:.04em;opacity:.65;margin-bottom:2px}' +
'.message.user .label{color:var(--user-text)}' +
'.message.assistant .label{color:var(--text-dim)}' +
'.message pre{background:var(--bg);border:1px solid var(--border);padding:4px 8px;border-radius:4px;overflow-x:auto;margin:3px 0;font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:11px}' +
'.message code{font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:11px;background:var(--accent-dim);color:var(--accent);padding:1px 4px;border-radius:3px}' +
'.message pre code{background:none;color:inherit;padding:0}' +
'.message p{margin:2px 0}' +
'.message ul,.message ol{padding-left:16px;margin:2px 0}' +
'.message li{margin:1px 0;list-style-position:inside}' +
'.message ul li{list-style-type:disc}' +
'.message ol li{list-style-type:decimal}' +
'.message blockquote{border-left:2px solid var(--border);padding-left:8px;margin:3px 0;opacity:.8}' +
'.message a{color:var(--accent);text-decoration:underline;word-break:break-word}' +
'.message h1,.message h2,.message h3,.message h4{margin:4px 0 2px 0;font-weight:600}' +
'.message h1{font-size:16px}.message h2{font-size:14px}.message h3{font-size:13px}' +
'.message table{border-collapse:collapse;width:100%;margin:3px 0;font-size:11px}' +
'.message table th,.message table td{border:1px solid var(--border);padding:2px 5px;text-align:left}' +
'.message table th{background:var(--bg);font-weight:600}' +
'.typing-indicator{align-self:flex-start;background:var(--surface);border:1px solid var(--border);padding:6px 12px;border-radius:var(--radius);border-bottom-left-radius:2px;display:none;align-items:center;gap:8px}.typing-dots{display:flex;gap:3px}.typing-indicator .typing-dots span{width:5px;height:5px;background:var(--text-dim);border-radius:50%;display:inline-block;animation:bounce 1.4s infinite ease-in-out both}.typing-dots span:nth-child(1){animation-delay:-0.32s}.typing-dots span:nth-child(2){animation-delay:-0.16s}.typing-dots span:nth-child(3){animation-delay:0s}.typing-label{font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:11px;color:var(--text-dim)}' +
'@keyframes bounce{0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}' +
'@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}' +
'.input-area{padding:6px 10px 8px;border-top:1px solid var(--border);flex-shrink:0;display:flex;gap:6px;align-items:flex-end;background:var(--bg);padding-bottom:calc(8px + env(safe-area-inset-bottom))}' +
'.input-area select{padding:0 6px;border:1px solid var(--border);border-radius:4px;font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:11px;background:var(--surface);color:var(--text-dim);cursor:pointer;outline:none;height:34px;flex-shrink:0;max-width:88px}' +
'.input-area button.search-toggle{width:34px;height:34px;padding:0;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text-dim);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:border-color .15s ease,color .15s ease,background .15s ease}' +
'.search-toggle svg{width:15px;height:15px;flex-shrink:0}' +
'.input-area button.search-toggle:hover{border-color:var(--text-dim)}' +
'.input-area button.search-toggle.active{background:var(--accent-dim);border-color:var(--accent);color:var(--accent)}' +
'.input-area button.thinking-toggle{width:34px;height:34px;padding:0;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text-dim);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:border-color .15s ease,color .15s ease,background .15s ease}' +
'.input-area button.thinking-toggle svg{width:15px;height:15px}' +
'.input-area button.thinking-toggle:hover{border-color:var(--text-dim)}' +
'.input-area button.thinking-toggle.active{background:var(--accent-dim);border-color:var(--accent);color:var(--accent)}' +
'.thinking-block{border:1px solid var(--border);border-radius:4px;margin-bottom:6px;background:var(--bg);font-size:12px}' +
'.thinking-block summary{cursor:pointer;font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:11px;color:var(--text-dim);padding:5px 8px;user-select:none}' +
'.thinking-block[open] summary{border-bottom:1px solid var(--border)}' +
'.thinking-content{padding:6px 8px;color:var(--text-dim)}' +
'.html-block{border:1px solid var(--border);border-radius:4px;overflow:hidden;margin:4px 0;background:var(--bg)}' +
'.html-block summary{cursor:pointer;list-style:none;padding:6px 10px;font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:11px;color:var(--text-dim);background:var(--surface);user-select:none}' +
'.html-block summary::-webkit-details-marker{display:none}' +
'.html-block[open] summary{border-bottom:1px solid var(--border)}' +
'.html-block-body{background:var(--bg)}' +
'.html-block-tabs{display:flex;align-items:center;border-bottom:1px solid var(--border);background:var(--bg);padding:0 4px}' +
'.html-tab{padding:6px 10px;font-size:11px;background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;color:var(--text-dim)}' +
'.html-tab.active{color:var(--accent);border-bottom-color:var(--accent)}' +
'.html-block-spacer{flex:1}' +
'.html-action{padding:4px 8px;margin:3px 2px;font-size:10px;background:var(--surface);border:1px solid var(--border);border-radius:3px;cursor:pointer;color:var(--text-dim)}' +
'.html-action:hover{color:var(--text);border-color:var(--text-dim)}' +
'.html-code{margin:0;border:none;border-radius:0}' +
'.html-preview{display:none}' +
'.html-preview iframe{width:100%;height:320px;border:none;background:#fff;display:block}' +
'.input-area textarea{flex:1;padding:6px 10px;border:1px solid var(--border);border-radius:4px;font-size:16px;font-family:inherit;resize:none;min-height:34px;max-height:80px;outline:none;transition:border .15s ease,background .15s ease;line-height:1.3;background:var(--surface);color:var(--text)}' +
'.input-area textarea:focus{border-color:var(--accent);background:var(--bg)}' +
'.input-area textarea::placeholder{color:var(--text-dim)}' +
'.input-area button{padding:6px 14px;background:var(--accent);color:#fff;border:none;border-radius:4px;font-size:13px;font-weight:500;cursor:pointer;height:34px;white-space:nowrap;touch-action:manipulation;flex-shrink:0}' +
'html[data-theme="dark"] .input-area button{color:var(--bg)}' +
'.input-area button:disabled{opacity:.4;cursor:not-allowed}' +
'.error-toast{position:fixed;bottom:60px;left:50%;transform:translateX(-50%);background:var(--surface);color:var(--warn);padding:6px 14px;border-radius:4px;font-size:11px;border:1px solid var(--warn);display:none;max-width:90%;z-index:2000}' +
'.error-toast.show{display:block}' +
'.neuron-dashboard{position:absolute;bottom:0;left:0;right:0;padding:6px 12px;background:var(--surface);border-top:1px solid var(--border);flex-shrink:0}' +
'.neuron-dashboard .neuron-label{font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:8px;color:var(--text-dim);margin-bottom:2px;letter-spacing:.03em}' +
'.neuron-dashboard .neuron-bar{width:100%;height:3px;background:var(--border);border-radius:2px;overflow:hidden;margin-bottom:2px}' +
'.neuron-dashboard .neuron-bar .neuron-fill{height:100%;border-radius:2px;transition:width .5s ease}' +
'.neuron-dashboard .neuron-fill.low{background:#22c55e}.neuron-dashboard .neuron-fill.medium{background:#eab308}.neuron-dashboard .neuron-fill.high{background:#ef4444}' +
'.neuron-dashboard .neuron-stats{display:flex;justify-content:space-between;font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:8px;color:var(--text-dim)}' +
'.neuron-dashboard .neuron-stats .used{color:var(--text);font-weight:500}' +
'.neuron-dashboard .neuron-stats .remaining{color:#22c55e;font-weight:500}' +
'.neuron-dashboard .neuron-stats .warning{color:var(--warn);font-weight:600}' +
'.sidebar-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.3);z-index:999;display:none}' +
'.sidebar-overlay.show{display:block}' +
'.modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);display:none;align-items:center;justify-content:center;z-index:3000;animation:fadeIn .15s ease}' +
'.modal-overlay.show{display:flex}' +
'.modal-box{background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:16px 20px;max-width:360px;width:90%;color:var(--text)}' +
'.modal-box h3{font-size:15px;font-weight:600;margin-bottom:3px}' +
'.modal-box p{font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:11px;color:var(--text-dim);margin-bottom:10px}' +
'.modal-box input{width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:4px;font-size:13px;outline:none;margin-bottom:10px;background:var(--surface);color:var(--text)}' +
'.modal-box input:focus{border-color:var(--accent)}' +
'.modal-box .modal-actions{display:flex;gap:6px;justify-content:flex-end}' +
'.modal-box .modal-actions button{padding:5px 12px;border-radius:4px;font-size:12px;font-weight:500;cursor:pointer;border:none;touch-action:manipulation}' +
'.modal-box .modal-actions .cancel-btn{background:var(--surface);color:var(--text-dim);border:1px solid var(--border)}' +
'.modal-box .modal-actions .confirm-btn{background:var(--accent);color:#fff}' +
'html[data-theme="dark"] .modal-box .modal-actions .confirm-btn{color:var(--bg)}' +
'.modal-box .modal-actions .danger-btn{background:var(--warn);color:#fff}' +
'.scroll-to-bottom{position:fixed;bottom:70px;right:16px;background:var(--bg);border:1px solid var(--border);border-radius:50%;width:36px;height:36px;display:none;align-items:center;justify-content:center;font-size:18px;cursor:pointer;z-index:50;touch-action:manipulation;color:var(--text)}' +
'.scroll-to-bottom.show{display:flex}' +
'.scroll-to-bottom:active{transform:scale(.95)}' +
'@media(min-width:768px){.sidebar{position:relative;transform:translateX(0);width:280px;border-right:1px solid var(--border);padding-bottom:0}.sidebar-overlay{display:none!important}.hamburger{display:none}.main-area{flex:1}.header h1{font-size:18px;max-width:none}.header .subtitle{font-size:12px;max-width:none}.message{max-width:80%;font-size:15px;padding:10px 16px}.message .version-nav button{font-size:12px;padding:3px 10px;height:auto}.input-area textarea{font-size:16px;min-height:44px;padding:8px 14px}.input-area button{font-size:14px;height:44px;padding:8px 24px}.input-area select{font-size:12px;max-width:120px;height:44px}.input-area button.search-toggle{width:44px;height:44px}.input-area button.thinking-toggle{width:44px;height:44px}.chat-container{padding:16px 24px}.header{padding:12px 24px}}' +
'@media(max-width:767px){.sidebar{position:fixed;width:280px}.sidebar-overlay{display:none}.sidebar-overlay.show{display:block}.hamburger{display:flex}.header h1{font-size:14px;max-width:90px}.header .subtitle{display:none}.message{max-width:92%;font-size:12px;padding:6px 10px}.input-area{padding:4px 8px 6px}.input-area textarea{font-size:16px;min-height:30px;padding:4px 8px}.input-area button{font-size:12px;height:30px;padding:4px 10px}.input-area select{font-size:9px;max-width:64px;height:30px}.input-area button.search-toggle{width:30px;height:30px}.input-area button.thinking-toggle{width:30px;height:30px}.neuron-dashboard{padding:4px 8px}.chat-container{padding:6px 8px 4px}.scroll-to-bottom{bottom:60px;right:12px;width:32px;height:32px;font-size:16px}}' +
'@media(max-width:480px){.sidebar{width:85%;max-width:280px}.message{max-width:95%;font-size:11px;padding:5px 8px}.message .label{font-size:7px}.message pre{font-size:10px;padding:3px 6px}.message code{font-size:10px}.message .version-nav button{font-size:9px;padding:1px 5px;min-width:20px;height:18px}.message .version-nav .version-info{font-size:9px;min-width:24px}.message .version-nav .regenerate-btn{font-size:11px;height:18px}.header h1{font-size:13px;max-width:70px}.header .model-badge{font-size:8px;padding:1px 6px}.input-area textarea{font-size:16px;min-height:28px;padding:3px 6px}.input-area button{font-size:11px;height:28px;padding:3px 8px}.input-area select{max-width:56px}.modal-box{padding:14px 16px}.modal-box h3{font-size:14px}.modal-box input{font-size:11px;padding:4px 8px}.neuron-dashboard .neuron-stats{font-size:7px}.scroll-to-bottom{bottom:54px;right:10px;width:28px;height:28px;font-size:14px}}' +
'.no-scrollbar::-webkit-scrollbar{width:0;height:0}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}' +
'.message.assistant{background:transparent;border:none;padding:2px 2px;max-width:100%;border-radius:0}' +
'.message.assistant .version-nav{justify-content:flex-start;border-top:none;padding-top:2px}' +
'</style></head><body>' +
'<div class="sidebar-overlay" id="sidebarOverlay"></div>' +
'<div class="modal-overlay" id="modalOverlay"><div class="modal-box"><h3 id="modalTitle">New Chat</h3><p id="modalSubtitle">Enter a name for this conversation</p><input type="text" id="modalInput" placeholder="Conversation name..." maxlength="100" /><div class="modal-actions"><button class="cancel-btn" id="modalCancel">Cancel</button><button class="confirm-btn" id="modalConfirm">Create</button></div></div></div>' +
'<div class="modal-overlay" id="deleteModalOverlay"><div class="modal-box"><h3 id="deleteModalTitle">Delete Conversation</h3><p id="deleteModalSubtitle">Are you sure you want to delete this conversation?</p><div class="modal-actions"><button class="cancel-btn" id="deleteModalCancel">Cancel</button><button class="danger-btn" id="deleteModalConfirm">Delete</button></div></div></div>' +
'<div class="app"><div class="sidebar" id="sidebar"><div class="sidebar-header"><h2>Conversations</h2><div class="sub">your chat history</div></div><div class="sidebar-actions"><button id="newChatBtn">+ New Chat</button><button class="secondary" id="refreshBtn">&#8635;</button></div><div class="conversation-list" id="conversationList"></div>' +
'<div class="neuron-dashboard" id="neuronDashboard"><div class="neuron-label">neurons today</div><div class="neuron-bar"><div class="neuron-fill low" id="neuronFill" style="width:0%"></div></div><div class="neuron-stats"><span>used <span class="used" id="neuronUsed">0</span></span><span>left <span class="remaining" id="neuronRemaining">10,000</span></span></div></div></div>' +
'<div class="main-area"><div class="header"><div class="header-left"><button class="hamburger" id="hamburgerBtn">&#9776;</button><div><h1 id="chatTitle">Webcore AI</h1><div class="subtitle" id="chatSubtitle">Select or start</div></div></div><div class="header-right"><span class="model-badge" id="modelBadge">Llama 4</span><button class="theme-toggle" id="themeToggle" aria-label="Switch theme" type="button"><svg id="themeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="4.6"></circle><path d="M12 2.4v2.4M12 19.2v2.4M4.4 12H2M22 12h-2.4M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M5.6 18.4l1.7-1.7M16.7 7.3l1.7-1.7"></path></svg></button></div></div>' +
'<div class="content-area" id="contentArea"><div class="welcome-heading" id="welcomeHeading"><h2>What can I help with?</h2><p>Type a message below to get started.</p></div><div class="chat-container no-scrollbar" id="chatContainer"></div><div class="typing-indicator" id="typingIndicator"><span class="typing-dots"><span></span><span></span><span></span></span><span class="typing-label" id="typingLabel">Thinking&#8230;</span></div><div class="error-toast" id="errorToast"></div><div class="input-area"><select class="model-selector" id="modelSelect" title="Model"><option value="@cf/meta/llama-4-scout-17b-16e-instruct">Llama 4</option><option value="@cf/openai/gpt-oss-120b">GPT-OSS</option><option value="@cf/google/gemma-4-26b-a4b-it">Gemma 4</option><option value="@cf/zai-org/glm-4.7-flash">GLM 4.7</option><option value="@cf/qwen/qwen3.8-27b">Qwen 3.8</option></select><button class="search-toggle" id="searchToggle" type="button" title="Search the web" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3c2.5 2.5 2.5 15.5 0 18c-2.5 -2.5 -2.5 -15.5 0 -18"></path></svg></button><button class="thinking-toggle" id="thinkingToggle" type="button" title="Show step-by-step thinking" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.6.55 1 1.2 1 2.5h6c0-1.3.4-1.95 1-2.5A6 6 0 0 0 12 3z"></path></svg></button><textarea id="userInput" rows="1" placeholder="Type a message..." maxlength="2000"></textarea><button id="sendBtn">Send</button></div></div></div></div>' +
'<button class="scroll-to-bottom" id="scrollBtn" title="Scroll to bottom">&#8595;</button><script>' +
'var chatContainer=document.getElementById("chatContainer"),contentArea=document.getElementById("contentArea"),userInput=document.getElementById("userInput"),sendBtn=document.getElementById("sendBtn"),conversationList=document.getElementById("conversationList"),newChatBtn=document.getElementById("newChatBtn"),refreshBtn=document.getElementById("refreshBtn"),hamburgerBtn=document.getElementById("hamburgerBtn"),sidebar=document.getElementById("sidebar"),sidebarOverlay=document.getElementById("sidebarOverlay"),typingIndicator=document.getElementById("typingIndicator"),typingLabel=document.getElementById("typingLabel"),errorToast=document.getElementById("errorToast"),chatTitle=document.getElementById("chatTitle"),chatSubtitle=document.getElementById("chatSubtitle"),modelBadge=document.getElementById("modelBadge"),modalOverlay=document.getElementById("modalOverlay"),modalTitle=document.getElementById("modalTitle"),modalSubtitle=document.getElementById("modalSubtitle"),modalInput=document.getElementById("modalInput"),modalConfirm=document.getElementById("modalConfirm"),modalCancel=document.getElementById("modalCancel"),deleteModalOverlay=document.getElementById("deleteModalOverlay"),deleteModalConfirm=document.getElementById("deleteModalConfirm"),deleteModalCancel=document.getElementById("deleteModalCancel"),modelSelect=document.getElementById("modelSelect"),searchToggle=document.getElementById("searchToggle"),thinkingToggle=document.getElementById("thinkingToggle"),neuronFill=document.getElementById("neuronFill"),neuronUsed=document.getElementById("neuronUsed"),neuronRemaining=document.getElementById("neuronRemaining"),scrollBtn=document.getElementById("scrollBtn"),themeToggle=document.getElementById("themeToggle"),themeIcon=document.getElementById("themeIcon"),isProcessing=!1,currentConversationId=null,modalResolve=null,deleteResolve=null,dailyNeuronLimit=10000,tempIdCounter=0,webSearchEnabled=!1,thinkingEnabled=!1;' +
'var MODEL_NAMES={"@cf/meta/llama-4-scout-17b-16e-instruct":"Llama 4","@cf/openai/gpt-oss-120b":"GPT-OSS 120B","@cf/google/gemma-4-26b-a4b-it":"Gemma 4","@cf/zai-org/glm-4.7-flash":"GLM 4.7","@cf/qwen/qwen3.8-27b":"Qwen 3.8"};' +
'var SUN_PATH="M12 2.4v2.4M12 19.2v2.4M4.4 12H2M22 12h-2.4M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M5.6 18.4l1.7-1.7M16.7 7.3l1.7-1.7",MOON_PATH="M20 14.6A8.4 8.4 0 1 1 9.4 4a6.7 6.7 0 0 0 10.6 10.6z";' +
'function applyThemeIcon(e){var t=themeIcon.querySelector("circle"),n=themeIcon.querySelector("path");if(e==="dark"){if(t)t.setAttribute("r","0");n.setAttribute("d",MOON_PATH)}else{if(t)t.setAttribute("r","4.6");n.setAttribute("d",SUN_PATH)}}' +
'(function initTheme(){var e=null;try{e=localStorage.getItem("webcore-theme")}catch(t){}var n=e||"light";document.documentElement.setAttribute("data-theme",n);applyThemeIcon(n)})();' +
'themeToggle.addEventListener("click",function(){var e=document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark";document.documentElement.setAttribute("data-theme",e);applyThemeIcon(e);try{localStorage.setItem("webcore-theme",e)}catch(t){}});' +
'searchToggle.addEventListener("click",function(){webSearchEnabled=!webSearchEnabled;searchToggle.classList.toggle("active",webSearchEnabled);searchToggle.setAttribute("aria-pressed",webSearchEnabled?"true":"false");searchToggle.title=webSearchEnabled?"Web search on":"Search the web"});thinkingToggle.addEventListener("click",function(){thinkingEnabled=!thinkingEnabled;thinkingToggle.classList.toggle("active",thinkingEnabled);thinkingToggle.setAttribute("aria-pressed",thinkingEnabled?"true":"false");thinkingToggle.title=thinkingEnabled?"Step-by-step thinking on":"Show step-by-step thinking"});' +
'function updateNeuronDisplay(e){var t=Math.max(0,dailyNeuronLimit-e),n=Math.min(100,(e/dailyNeuronLimit)*100);neuronUsed.textContent=e.toLocaleString();neuronRemaining.textContent=t.toLocaleString();neuronFill.style.width=n+"%";neuronFill.className="neuron-fill"+(n<50?" low":n<80?" medium":" high");neuronRemaining.className=n>=90?"remaining warning":"remaining"}' +
'function loadNeuronUsage(){apiRequest("/api/neurons","GET").then(function(e){if(e.success){if(e.limit)dailyNeuronLimit=e.limit;updateNeuronDisplay(e.used||0)}}).catch(function(e){console.error(e)})}' +
'function showModal(e,t,n,r){return new Promise(function(a){modalTitle.textContent=e;modalSubtitle.textContent=t;modalInput.placeholder=n||"Enter name...";modalInput.value="";modalConfirm.textContent=r||"Create";modalOverlay.classList.add("show");setTimeout(function(){modalInput.focus()},100);modalResolve=a})}function hideModal(){modalOverlay.classList.remove("show");modalResolve&&(modalResolve(null),modalResolve=null)}function showDeleteModal(){return new Promise(function(e){deleteModalOverlay.classList.add("show");deleteResolve=e})}function hideDeleteModal(){deleteModalOverlay.classList.remove("show");deleteResolve&&(deleteResolve(!1),deleteResolve=null)}' +
'modalCancel.addEventListener("click",hideModal);modalOverlay.addEventListener("click",function(e){e.target===modalOverlay&&hideModal()});modalInput.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();var t=modalInput.value.trim();if(t){modalOverlay.classList.remove("show");modalResolve&&(modalResolve(t),modalResolve=null)}}if(e.key==="Escape")hideModal()});modalConfirm.addEventListener("click",function(){var e=modalInput.value.trim();if(e){modalOverlay.classList.remove("show");modalResolve&&(modalResolve(e),modalResolve=null)}});' +
'deleteModalCancel.addEventListener("click",function(){deleteModalOverlay.classList.remove("show");deleteResolve&&(deleteResolve(!1),deleteResolve=null)});deleteModalOverlay.addEventListener("click",function(e){e.target===deleteModalOverlay&&(deleteModalOverlay.classList.remove("show"),deleteResolve&&(deleteResolve(!1),deleteResolve=null))});deleteModalConfirm.addEventListener("click",function(){deleteModalOverlay.classList.remove("show");deleteResolve&&(deleteResolve(!0),deleteResolve=null)});' +
'function toggleSidebar(){sidebar.classList.toggle("open");sidebarOverlay.classList.toggle("show")}function closeSidebar(){sidebar.classList.remove("open");sidebarOverlay.classList.remove("show")}function openSidebar(){sidebar.classList.add("open");sidebarOverlay.classList.add("show")}hamburgerBtn.addEventListener("click",toggleSidebar);sidebarOverlay.addEventListener("click",closeSidebar);' +
'(function initSwipeGestures(){var startX=null,startY=null;document.addEventListener("touchstart",function(e){if(e.touches.length!==1)return;startX=e.touches[0].clientX;startY=e.touches[0].clientY},{passive:!0});document.addEventListener("touchend",function(e){if(startX===null||window.innerWidth>=768)return;var t=e.changedTouches[0],dx=t.clientX-startX,dy=t.clientY-startY;if(Math.abs(dx)>60&&Math.abs(dy)<60){if(dx>0&&startX<24&&!sidebar.classList.contains("open"))openSidebar();else if(dx<0&&sidebar.classList.contains("open"))closeSidebar()}startX=null;startY=null},{passive:!0})})();' +
'function renderMarkdown(e){if(!e)return"";var t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");var n=t.split("\\n"),r=[],a=!1,o="",l=!1,s=[],codeBlocks=[],fenceLang="",i=0;while(i<n.length){var c=n[i];var fenceMatch=c.match(/^```(\\S*)/);if(fenceMatch){if(l){l=!1;var idx=codeBlocks.length;codeBlocks.push({lang:fenceLang,code:s.join("\\n").trim()});r.push("\\u0000CB"+idx+"\\u0000")}else{l=!0;s=[];fenceLang=(fenceMatch[1]||"").toLowerCase()}i++;continue}if(l){s.push(c);i++;continue}if(""===c.trim()){a&&("ul"===o?r.push("</ul>"):"ol"===o&&r.push("</ol>"),a=!1,o="");i++;continue}if(c.match(/^### /)){r.push("<h3>"+c.replace(/^### /,"")+"</h3>");i++;continue}if(c.match(/^## /)){r.push("<h2>"+c.replace(/^## /,"")+"</h2>");i++;continue}if(c.match(/^# /)){r.push("<h1>"+c.replace(/^# /,"")+"</h1>");i++;continue}if(c.match(/^> /)){r.push("<blockquote>"+c.replace(/^> /,"")+"</blockquote>");i++;continue}if(c.match(/^\\|/)){var d=[],u=!1;while(i<n.length&&n[i].match(/^\\|/)){var p=n[i].split("|").filter(function(e){return e.trim()!=""});d.push(p.map(function(e){return e.trim()}));if(!u&&i+1<n.length&&n[i+1].match(/^\\|/)){var h=n[i+1].split("|").filter(function(e){return e.trim()!=""});if(h.every(function(e){return e.match(/^[\\s\\-:]+$/)||e.match(/^[:\\-]+$/)||e.match(/^\\-+$/)})){u=!0;i++}}i++}var m="<table>";if(d.length>0){m+="<thead><tr>";for(var f=0;f<d[0].length;f++){m+="<th>"+d[0][f]+"</th>"}m+="</tr></thead><tbody>";for(var v=1;v<d.length;v++){m+="<tr>";for(var g=0;g<d[v].length;g++){m+="<td>"+d[v][g]+"</td>"}m+="</tr>"}m+="</tbody>"}m+="</table>";r.push(m);continue}if(c.match(/^\\s*[-*+]\\s/)){a&&"ul"!==o&&(r.push("</ul>"),a=!1,o="");a||(r.push("<ul>"),a=!0,o="ul");r.push("<li>"+c.replace(/^\\s*[-*+]\\s/,"")+"</li>");i++;continue}if(c.match(/^\\s*\\d+\\.\\s/)){a&&"ol"!==o&&(r.push("</ol>"),a=!1,o="");a||(r.push("<ol>"),a=!0,o="ol");r.push("<li>"+c.replace(/^\\s*\\d+\\.\\s/,"")+"</li>");i++;continue}if(a){if("ul"===o)r.push("</ul>");else if("ol"===o)r.push("</ol>");a=!1;o=""}r.push("<p>"+c+"</p>");i++}a&&("ul"===o?r.push("</ul>"):"ol"===o&&r.push("</ol>"));var html=r.join("");html=html.replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)/g,"<a href=\\"$2\\" target=\\"_blank\\" rel=\\"noopener noreferrer\\">$1</a>").replace(/`([^`]+)`/g,"<code>$1</code>").replace(/\\*\\*([^*]+)\\*\\*/g,"<strong>$1</strong>").replace(/\\*([^*]+)\\*/g,"<em>$1</em>").replace(/\\n/g,"<br>");for(var b=0;b<codeBlocks.length;b++){var block=codeBlocks[b];var replacement=block.lang==="html"?buildHtmlPreviewBlock(block.code):("<pre><code>"+block.code+"</code></pre>");html=html.replace("\\u0000CB"+b+"\\u0000",replacement)}return html}' +
'function buildHtmlPreviewBlock(code){return "<details class=\\"html-block\\" ontoggle=\\"onHtmlBlockToggle(this)\\"><summary>&lt;/&gt; HTML file &#8212; click to preview</summary><div class=\\"html-block-body\\"><div class=\\"html-block-tabs\\"><button type=\\"button\\" class=\\"html-tab\\" data-view=\\"code\\" onclick=\\"toggleHtmlView(this,&#39;code&#39;)\\">Code</button><button type=\\"button\\" class=\\"html-tab active\\" data-view=\\"preview\\" onclick=\\"toggleHtmlView(this,&#39;preview&#39;)\\">Preview</button><span class=\\"html-block-spacer\\"></span><button type=\\"button\\" class=\\"html-action\\" onclick=\\"copyHtmlBlock(this)\\">Copy</button><button type=\\"button\\" class=\\"html-action\\" onclick=\\"downloadHtmlBlock(this)\\">Download</button></div><pre class=\\"html-code\\" style=\\"display:none\\"><code>"+code+"</code></pre><div class=\\"html-preview\\" style=\\"display:block\\"><iframe sandbox=\\"allow-scripts\\" title=\\"HTML preview\\"></iframe></div><textarea class=\\"html-raw\\" style=\\"display:none\\">"+code+"</textarea></div></details>"}function loadHtmlIframe(block){var iframe=block.querySelector(".html-preview iframe");if(iframe&&!iframe.dataset.loaded){var raw=block.querySelector(".html-raw").value;iframe.srcdoc=raw;iframe.dataset.loaded="1"}}function onHtmlBlockToggle(details){if(!details.open)return;loadHtmlIframe(details)}function toggleHtmlView(btn,view){var block=btn.closest(".html-block");if(!block)return;var tabs=block.querySelectorAll(".html-tab");for(var i=0;i<tabs.length;i++){tabs[i].classList.toggle("active",tabs[i].dataset.view===view)}var codeEl=block.querySelector(".html-code");var previewEl=block.querySelector(".html-preview");if(view==="preview"){codeEl.style.display="none";previewEl.style.display="block";loadHtmlIframe(block)}else{codeEl.style.display="";previewEl.style.display="none"}}function copyHtmlBlock(btn){var block=btn.closest(".html-block");var raw=block.querySelector(".html-raw").value;var done=function(){var old=btn.textContent;btn.textContent="Copied!";setTimeout(function(){btn.textContent=old},1500)};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(raw).then(done).catch(function(){fallbackCopyText(raw);done()})}else{fallbackCopyText(raw);done()}}function fallbackCopyText(text){var ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.left="-9999px";document.body.appendChild(ta);ta.focus();ta.select();try{document.execCommand("copy")}catch(e){}document.body.removeChild(ta)}function downloadHtmlBlock(btn){var block=btn.closest(".html-block");var raw=block.querySelector(".html-raw").value;var blob=new Blob([raw],{type:"text/html"});var url=URL.createObjectURL(blob);var a=document.createElement("a");a.href=url;a.download="page.html";document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(function(){URL.revokeObjectURL(url)},1000)}function apiRequest(e,t,n){return fetch(e,{method:t,headers:{"Content-Type":"application/json"},body:n?JSON.stringify(n):null}).then(function(e){return e.json()})}' +
'function postStream(e,t,n){return fetch(e,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)}).then(function(r){var reader=r.body.getReader(),decoder=new TextDecoder(),buffer="",finalResult=null;function handleLine(line){if(!line.trim())return;var evt;try{evt=JSON.parse(line)}catch(err){return}if(evt.type==="status"){n&&n(evt)}else if(evt.type==="result"){finalResult=evt}}function pump(){return reader.read().then(function(res){if(res.done){if(buffer)handleLine(buffer);return finalResult||{success:!1,error:"No response from server"}}buffer+=decoder.decode(res.value,{stream:!0});var parts=buffer.split("\\n");buffer=parts.pop();parts.forEach(handleLine);return pump()})}return pump()})}' +
'function loadConversations(){apiRequest("/api/conversations","GET").then(function(e){e.success&&renderConversationList(e.conversations)}).catch(function(e){console.error(e)})}' +
'function loadConversation(id){apiRequest("/api/conversations/"+id,"GET").then(function(t){if(t.success){currentConversationId=id;renderMessages(t.messages||[]);chatTitle.textContent=t.title||"Conversation";chatSubtitle.textContent=(t.messages?t.messages.length:0)+" messages";highlightConversation(id);closeSidebar()}}).catch(function(e){console.error(e)})}' +
'async function createNewConversation(){var e=await showModal("New Chat","Enter a name for this conversation","Conversation name...","Create");if(e){apiRequest("/api/conversations","POST",{title:e}).then(function(e){if(e.success){loadConversations();loadConversation(e.id)}}).catch(function(e){console.error(e)})}}' +
'async function renameConversation(id,currentTitle){var n=await showModal("Rename Chat","Enter a new name for this conversation",currentTitle||"Untitled",currentTitle||"Untitled");if(n&&n.trim()){apiRequest("/api/conversations/"+id,"PUT",{title:n.trim()}).then(function(t){if(t.success){if(currentConversationId===id)chatTitle.textContent=t.title;loadConversations()}}).catch(function(e){console.error(e)})}}' +
'async function deleteConversation(id){var t=await showDeleteModal();if(t){apiRequest("/api/conversations/"+id,"DELETE").then(function(t){if(t.success){if(currentConversationId===id){currentConversationId=null;chatContainer.innerHTML="";chatTitle.textContent="Webcore AI";chatSubtitle.textContent="Select or start"}loadConversations();var n=conversationList.querySelectorAll(".conversation-item");if(n.length>0)loadConversation(n[0].dataset.id)}}).catch(function(e){console.error(e)})}}' +
'function buildVersionNav(m){var nav=document.createElement("div");nav.className="version-nav";var prev=document.createElement("button");prev.className="nav-prev";prev.textContent="\\u2190";prev.title="Previous version";var info=document.createElement("span");info.className="version-info";info.textContent=(m.version_index+1)+"/"+m.version_count;var next=document.createElement("button");next.className="nav-next";next.textContent="\\u2192";next.title="Next version";var regen=document.createElement("button");regen.className="regenerate-btn";regen.textContent="\\u27f3";regen.title="Regenerate";prev.disabled=m.version_count<=1||m.version_index===0;next.disabled=m.version_count<=1||m.version_index===m.version_count-1;prev.onclick=function(){switchBranch(m.version_ids[m.version_index-1])};next.onclick=function(){switchBranch(m.version_ids[m.version_index+1])};regen.onclick=function(){regenerateMessage(m.id)};nav.appendChild(prev);nav.appendChild(info);nav.appendChild(next);nav.appendChild(regen);return nav}' +
'function switchBranch(targetId){if(isProcessing||!currentConversationId)return;isProcessing=!0;apiRequest("/api/conversations/"+currentConversationId+"/branch","POST",{message_id:targetId}).then(function(t){if(t.success){renderMessages(t.messages);chatSubtitle.textContent=t.messages.length+" messages";loadConversations()}else{showError(t.error||"Could not switch version")}}).catch(function(e){showError(e.message||"Error switching version")}).finally(function(){isProcessing=!1})}' +
'function regenerateMessage(messageId){if(isProcessing){showError("Please wait for the current request to finish");return}if(!currentConversationId){showError("No conversation selected");return}var el=document.querySelector(".message[data-id=\'"+messageId+"\']");if(el){var c=el.querySelector(".message-content");if(c)c.innerHTML="<p>Regenerating...</p>";var nav=el.querySelector(".version-nav");if(nav)nav.remove()}isProcessing=!0;showTyping(!0,webSearchEnabled?"Searching the web\u2026":"Thinking\u2026");postStream("/api/regenerate",{conversation_id:currentConversationId,message_id:messageId,model:modelSelect.value,web_search:webSearchEnabled,thinking:thinkingEnabled},function(evt){showTyping(!0,statusLabel(evt))}).then(function(t){if(t.success){renderMessages(t.messages);chatSubtitle.textContent=t.messages.length+" messages";loadConversations();loadNeuronUsage();showError(t.search_error||null)}else{showError(t.error||"Failed to regenerate");loadConversation(currentConversationId)}}).catch(function(e){showError(e.message||"Error regenerating");loadConversation(currentConversationId)}).finally(function(){isProcessing=!1;showTyping(!1)})}' +
'function formatRelativeDate(ts){var d=new Date(ts),now=new Date();var dOnly=new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();var nOnly=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();var days=Math.round((nOnly-dOnly)/86400000);if(days===0)return"Today";if(days===1)return"Yesterday";if(days>1&&days<7)return days+" days ago";return d.toLocaleDateString()}' +
'function renderConversationList(e){conversationList.innerHTML="";if(!e||0===e.length){conversationList.innerHTML=\'<div style="padding:16px;text-align:center;color:var(--text-dim);font-size:12px;">No conversations yet</div>\';return}for(var t=0;t<e.length;t++){var n=e[t],r=document.createElement("div");r.className="conversation-item";r.dataset.id=n.id;if(n.id===currentConversationId)r.classList.add("active");var a=document.createElement("div");a.className="title";a.textContent=n.title||"Untitled";var o=document.createElement("div");o.className="meta";o.textContent=formatRelativeDate(n.updated_at)+" \\u00b7 "+(n.message_count||0)+" msgs";var s=document.createElement("div");s.className="actions";var i=document.createElement("button");i.className="rename-btn";i.textContent="\\u271e";i.title="Rename";i.onclick=function(e){e.stopPropagation();var t=this.closest(".conversation-item"),n=t.dataset.id,r=t.querySelector(".title").textContent;renameConversation(n,r)};var d=document.createElement("button");d.className="delete-btn";d.textContent="\\u2715";d.title="Delete";d.onclick=function(e){e.stopPropagation();var t=this.closest(".conversation-item").dataset.id;deleteConversation(t)};s.appendChild(i);s.appendChild(d);r.appendChild(a);r.appendChild(o);r.appendChild(s);r.onclick=function(){loadConversation(this.dataset.id)};conversationList.appendChild(r)}}' +
'function renderMessages(e){chatContainer.innerHTML="";if(!e||0===e.length){contentArea.classList.add("is-empty");return}contentArea.classList.remove("is-empty");for(var a=0;a<e.length;a++){addMessageDOM(e[a])}}' +
'function splitThinking(raw){if(!raw)return{thinking:"",answer:raw||""};var match=raw.match(/<thinking>([\\s\\S]*?)<\\/thinking>/i);if(!match)return{thinking:"",answer:raw};var thinking=match[1].trim();var rest=raw.slice(0,match.index)+raw.slice(match.index+match[0].length);rest=rest.replace(/<\\/?answer>/gi,"").trim();return{thinking:thinking,answer:rest}}function addMessageDOM(m){if(contentArea.classList.contains("is-empty")){contentArea.classList.remove("is-empty")}var t=document.createElement("div");t.className="message "+m.role;t.dataset.id=m.id;var n=document.createElement("div");n.className="label";n.textContent=m.role==="user"?"You":"Assistant";t.appendChild(n);var r=document.createElement("div");r.className="message-content";if(m.role==="assistant"){var split=splitThinking(m.content);if(split.thinking){var det=document.createElement("details");det.className="thinking-block";var sum=document.createElement("summary");sum.textContent="Thought process";det.appendChild(sum);var tc=document.createElement("div");tc.className="thinking-content";tc.innerHTML=renderMarkdown(split.thinking);det.appendChild(tc);t.appendChild(det)}r.innerHTML=renderMarkdown(split.answer)}else{r.textContent=m.content}t.appendChild(r);if(m.role==="assistant")t.appendChild(buildVersionNav(m));chatContainer.appendChild(t);chatContainer.scrollTop=chatContainer.scrollHeight}' +
'function highlightConversation(e){var t=conversationList.querySelectorAll(".conversation-item");for(var n=0;n<t.length;n++){t[n].classList.toggle("active",t[n].dataset.id===e)}}' +
'function showTyping(e,label){typingIndicator.style.display=e?"flex":"none";if(label&&typingLabel)typingLabel.textContent=label;if(e)chatContainer.scrollTop=chatContainer.scrollHeight}' +
'function showError(e){if(e){errorToast.textContent="\\u26a0\\ufe0f "+e;errorToast.classList.add("show");setTimeout(function(){errorToast.classList.remove("show")},4000)}else{errorToast.classList.remove("show")}}' +
'function updateModelBadge(e){var t=MODEL_NAMES[e]||e.split("/").pop();modelBadge.textContent=t}' +
'function updateScrollButton(){if(!chatContainer)return;var e=chatContainer.scrollHeight-chatContainer.clientHeight-chatContainer.scrollTop;e>20?scrollBtn.classList.add("show"):scrollBtn.classList.remove("show")}chatContainer.addEventListener("scroll",updateScrollButton);scrollBtn.addEventListener("click",function(){chatContainer.scrollTo({top:chatContainer.scrollHeight,behavior:"smooth"})});' +
'function ensureConversation(){if(currentConversationId)return Promise.resolve(currentConversationId);return apiRequest("/api/conversations","POST",{title:"New Chat"}).then(function(e){if(!e.success)throw new Error(e.error||"Could not create conversation");currentConversationId=e.id;chatContainer.innerHTML="";chatTitle.textContent=e.title||"New Chat";chatSubtitle.textContent="0 messages";loadConversations();return e.id})}' +
'function statusLabel(evt){if(evt.stage==="searching")return"Searching the web\u2026";if(evt.stage==="generating")return"Thinking\u2026";return"Working\u2026"}function sendMessage(){var val=userInput.value.trim();if(!val||isProcessing)return;var model=modelSelect.value;var useSearch=webSearchEnabled;var tempId="tmp-"+(++tempIdCounter);isProcessing=!0;sendBtn.disabled=!0;ensureConversation().then(function(convId){addMessageDOM({role:"user",content:val,id:tempId});userInput.value="";userInput.style.height="auto";updateModelBadge(model);showTyping(!0,useSearch?"Searching the web\u2026":"Thinking\u2026");return postStream("/api/chat",{conversation_id:convId,prompt:val,model:model,temperature:.7,max_tokens:1e3,web_search:useSearch,thinking:thinkingEnabled},function(evt){showTyping(!0,statusLabel(evt))})}).then(function(t){if(!t)return;if(t.success){renderMessages(t.messages);chatSubtitle.textContent=t.messages.length+" messages";loadConversations();highlightConversation(currentConversationId);if(t.neurons_used!==undefined){loadNeuronUsage()}showError(t.search_error||null)}else{showError(t.error||"AI request failed")}}).catch(function(e){showError(e.message||"Error sending message")}).finally(function(){isProcessing=!1;sendBtn.disabled=!1;showTyping(!1);userInput.focus()})}' +
'userInput.addEventListener("input",function(){userInput.style.height="auto";userInput.style.height=Math.min(userInput.scrollHeight,80)+"px"});userInput.addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage()}});sendBtn.addEventListener("click",sendMessage);newChatBtn.addEventListener("click",createNewConversation);refreshBtn.addEventListener("click",function(){loadConversations();loadNeuronUsage()});modelSelect.addEventListener("change",function(){updateModelBadge(this.value)});updateModelBadge(modelSelect.value);loadConversations();loadNeuronUsage();userInput.focus();setTimeout(function(){var e=conversationList.querySelectorAll(".conversation-item");if(e.length>0)loadConversation(e[0].dataset.id)},300);' +
'</script></body></html>';

// ============================================
// DATABASE INITIALIZATION
// ============================================

var dbInitialized = false;

async function initDatabase(env) {
  if (dbInitialized) return true;
  try {
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, title TEXT, created_at INTEGER, updated_at INTEGER, memory_summary TEXT, memory_covered_count INTEGER DEFAULT 0)'
    ).run();
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id TEXT, parent_id INTEGER, role TEXT, content TEXT, timestamp INTEGER, active_child_id INTEGER, FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE)'
    ).run();
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS neuron_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT UNIQUE, used INTEGER DEFAULT 0)'
    ).run();
    await env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id)'
    ).run();
    await env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS idx_messages_parent_id ON messages(parent_id)'
    ).run();
    // Lightweight migrations for deployments created before branching/memory
    // support: ALTER TABLE ADD COLUMN fails harmlessly if the column
    // already exists.
    try { await env.DB.prepare('ALTER TABLE messages ADD COLUMN parent_id INTEGER').run(); } catch (e) {}
    try { await env.DB.prepare('ALTER TABLE messages ADD COLUMN active_child_id INTEGER').run(); } catch (e) {}
    try { await env.DB.prepare('ALTER TABLE conversations ADD COLUMN memory_summary TEXT').run(); } catch (e) {}
    try { await env.DB.prepare('ALTER TABLE conversations ADD COLUMN memory_covered_count INTEGER DEFAULT 0').run(); } catch (e) {}
    dbInitialized = true;
    return true;
  } catch (err) {
    console.error('Database init error:', err);
    return false;
  }
}

// ============================================
// SHARED HELPERS
// ============================================

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN };
}

function jsonResponse(payload, status) {
  return Response.json(payload, { status: status || 200, headers: corsHeaders() });
}

// Streams newline-delimited JSON status/result events to the client so the
// UI can show what the server is doing right now (searching, generating,
// etc.) instead of a generic spinner — similar to how claude.ai surfaces
// tool use while a response is being generated. handler(send) does the
// real work and must end by sending exactly one {type:'result', ...}
// event; any status events sent before it are purely informational.
function streamJsonEvents(handler) {
  var ts = new TransformStream();
  var writer = ts.writable.getWriter();
  var encoder = new TextEncoder();
  var closed = false;
  var send = async function (event) {
    if (closed) return;
    try { await writer.write(encoder.encode(JSON.stringify(event) + '\n')); } catch (e) { /* client disconnected */ }
  };
  (async function () {
    try {
      await handler(send);
    } catch (err) {
      var isLicenseError = err && err.message && (err.message.includes('403') || err.message.includes('license'));
      var message = isLicenseError
        ? 'Model license not accepted. Visit Cloudflare dashboard > AI > Models and agree to terms.'
        : (err && err.message) || 'Unexpected server error';
      await send({ type: 'result', success: false, error: message });
    } finally {
      closed = true;
      try { await writer.close(); } catch (e) {}
    }
  })();
  var headers = corsHeaders();
  headers['Content-Type'] = 'application/x-ndjson; charset=utf-8';
  return new Response(ts.readable, { headers: headers });
}

// Resolves + validates a requested model against the allowlist.
function resolveModel(requestedModel) {
  var model = requestedModel || CONFIG.MODEL;
  var modelConfig = FREE_MODELS[model];
  if (!modelConfig) {
    throw { status: 400, message: 'Model is not available on this deployment.' };
  }
  return { model: model, maxTokens: modelConfig.maxTokens };
}

function clampTemperature(value) {
  return Math.min(Math.max(Number(value ?? CONFIG.TEMPERATURE), 0), 2);
}

function clampMaxTokens(value, ceiling) {
  return Math.min(Math.max(Number(value ?? ceiling), 1), ceiling);
}

function estimateNeurons(promptLength, maxTokens) {
  return Math.ceil((promptLength / 4) * 0.1 + maxTokens * 0.2);
}

async function getTodayUsage(env, today) {
  var stmt = env.DB.prepare('SELECT used FROM neuron_usage WHERE date = ?');
  var result = await stmt.bind(today).first();
  return result ? result.used : 0;
}

function assertWithinNeuronBudget(currentUsage, estimated) {
  if (currentUsage + estimated > CONFIG.DAILY_NEURON_LIMIT) {
    throw {
      status: 429,
      message: 'Daily neuron limit exceeded. You have ' + (CONFIG.DAILY_NEURON_LIMIT - currentUsage) + ' neurons remaining.'
    };
  }
}

async function runAIModel(env, model, messages, temperature, maxTokens, estimatedNeurons) {
  var response = await env.AI.run(model, {
    messages: messages,
    temperature: temperature,
    max_tokens: maxTokens
  });

  var resultText = '';
  var neuronsUsed = estimatedNeurons;
  if (response.choices && response.choices[0] && response.choices[0].message) {
    resultText = response.choices[0].message.content;
    neuronsUsed = response.usage ? response.usage.neurons : estimatedNeurons;
  } else if (response.response) {
    resultText = response.response;
    neuronsUsed = response.usage ? response.usage.neurons : estimatedNeurons;
  } else if (response.result) {
    resultText = response.result;
    neuronsUsed = response.usage ? response.usage.neurons : estimatedNeurons;
  } else {
    resultText = JSON.stringify(response);
  }
  return { resultText: resultText, neuronsUsed: neuronsUsed };
}

// ---- Long-conversation memory ----
//
// The most recent MEMORY_RECENT_VERBATIM messages always go to the model
// word-for-word. Anything older than that is folded into a running
// per-conversation summary (stored on the conversations row) instead of
// being dropped, and the summary is only re-generated once enough new
// older messages have piled up — not on every single turn — to keep this
// cheap. This is what makes regenerate (and normal replies) keep "memory"
// of the whole conversation even once it's grown past the verbatim window.

async function getConversationMemory(env, conversationId) {
  var row = await env.DB.prepare('SELECT memory_summary, memory_covered_count FROM conversations WHERE id = ?').bind(conversationId).first();
  return { summary: (row && row.memory_summary) || '', covered: (row && row.memory_covered_count) || 0 };
}

async function updateConversationMemory(env, conversationId, summary, covered) {
  await env.DB.prepare('UPDATE conversations SET memory_summary = ?, memory_covered_count = ? WHERE id = ?').bind(summary, covered, conversationId).run();
}

async function summarizeOlderMessages(env, model, previousSummary, newOlderMessages) {
  var transcript = newOlderMessages.map(function (m) {
    return (m.role === 'user' ? 'User: ' : 'Assistant: ') + m.content;
  }).join('\n\n');
  var prompt =
    (previousSummary ? 'Existing summary of the conversation so far:\n' + previousSummary + '\n\n' : '') +
    'New messages to fold into that summary:\n' + transcript +
    '\n\nWrite an updated, concise summary (a few sentences to a short paragraph) capturing the key facts, decisions, and context a continuing assistant would need to remember. Output only the summary itself, no preamble.';
  var result = await runAIModel(env, model, [{ role: 'user', content: prompt }], 0.3, CONFIG.MEMORY_SUMMARY_MAX_TOKENS, 0);
  return result.resultText.trim();
}

// fullPath: ordered {role, content} messages ending in the message that
// triggered this call (the new prompt, or the user message being
// regenerated from). Returns the {role, content} array to actually send
// to the model — recent messages verbatim, older ones summarized.
async function buildModelContext(env, conversationId, model, fullPath) {
  if (fullPath.length <= CONFIG.MEMORY_RECENT_VERBATIM) {
    return fullPath.slice();
  }
  var recent = fullPath.slice(-CONFIG.MEMORY_RECENT_VERBATIM);
  var older = fullPath.slice(0, fullPath.length - CONFIG.MEMORY_RECENT_VERBATIM);
  var memory = await getConversationMemory(env, conversationId);
  var summary = memory.summary;
  var needsInitialSummary = !summary && older.length > 0;
  var needsRefresh = older.length - memory.covered >= CONFIG.MEMORY_SUMMARY_TRIGGER;
  if (needsInitialSummary || needsRefresh) {
    var newOlder = older.slice(memory.covered);
    try {
      summary = await summarizeOlderMessages(env, model, summary, newOlder);
      await updateConversationMemory(env, conversationId, summary, older.length);
    } catch (e) {
      // If summarization fails, fall back to whatever summary (or none)
      // we already had rather than failing the whole request over it.
    }
  }
  return summary
    ? [{ role: 'system', content: 'Summary of the earlier part of this conversation (context only — do not mention this note to the user):\n' + summary }].concat(recent)
    : recent;
}

// ---- Web search (RAG-style grounding) ----
//
// Provider priority: Tavily first, then Brave, if their keys are set.
// Neither is "unlimited", because no real search backend is — but both
// are official, fast APIs instead of scraping, which is what actually
// matters for stability:
//
//   TAVILY_API_KEY  — https://tavily.com — free tier: 1,000 searches/month,
//                      no card required. Purpose-built for grounding LLM
//                      answers, so it's the recommended default here.
//                      wrangler secret put TAVILY_API_KEY
//
//   BRAVE_API_KEY   — https://api.search.brave.com — used automatically if
//                      set, but as of late 2025 Brave requires a card at
//                      signup even for its free tier, so Tavily is the
//                      better zero-cost, zero-card option.
//                      wrangler secret put BRAVE_API_KEY
//
// If neither is configured, webSearch() fails soft with a message telling
// the user how to fix it, rather than silently or unreliably scraping a
// search engine that's actively trying to block that (DuckDuckGo's HTML
// pages now require a token handshake and have tightened IP-based
// rate-limiting, which is exactly what was causing slow/failed searches).

async function fetchWithTimeout(url, options) {
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, CONFIG.SEARCH_TIMEOUT_MS);
  try {
    return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
  } finally {
    clearTimeout(timer);
  }
}

async function webSearch(env, query) {
  if (env.TAVILY_API_KEY) return webSearchTavily(env, query);
  if (env.BRAVE_API_KEY) return webSearchBrave(env, query);
  return {
    results: [],
    error: 'Web search needs a free API key. Sign up at tavily.com (no card required, 1,000 searches/month free), then run: wrangler secret put TAVILY_API_KEY'
  };
}

async function webSearchTavily(env, query) {
  try {
    var resp = await fetchWithTimeout('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + env.TAVILY_API_KEY
      },
      body: JSON.stringify({
        query: query,
        search_depth: 'basic',
        max_results: CONFIG.MAX_SEARCH_RESULTS
      })
    });
    if (!resp.ok) {
      return { results: [], error: 'Web search request failed (HTTP ' + resp.status + ')' };
    }
    var data = await resp.json();
    var items = data.results || [];
    var results = items.slice(0, CONFIG.MAX_SEARCH_RESULTS).map(function (r) {
      return {
        title: r.title || r.url || 'Result',
        url: r.url,
        description: r.content || ''
      };
    });
    return { results: results, error: null };
  } catch (err) {
    var timedOut = err && err.name === 'AbortError';
    return { results: [], error: timedOut ? 'Web search timed out' : 'Web search failed: ' + (err.message || 'unknown error') };
  }
}

async function webSearchBrave(env, query) {
  try {
    var url = 'https://api.search.brave.com/res/v1/web/search?q=' + encodeURIComponent(query) + '&count=' + CONFIG.MAX_SEARCH_RESULTS;
    var resp = await fetchWithTimeout(url, {
      headers: { 'Accept': 'application/json', 'X-Subscription-Token': env.BRAVE_API_KEY }
    });
    if (!resp.ok) {
      return { results: [], error: 'Web search request failed (HTTP ' + resp.status + ')' };
    }
    var data = await resp.json();
    var items = (data.web && data.web.results) || [];
    var results = items.slice(0, CONFIG.MAX_SEARCH_RESULTS).map(function (r) {
      return {
        title: (r.title || r.url || 'Result').replace(/<[^>]+>/g, ''),
        url: r.url,
        description: (r.description || '').replace(/<[^>]+>/g, '')
      };
    });
    return { results: results, error: null };
  } catch (err) {
    var timedOut = err && err.name === 'AbortError';
    return { results: [], error: timedOut ? 'Web search timed out' : 'Web search failed: ' + (err.message || 'unknown error') };
  }
}

// Turns search results into a system message the model can ground its
// answer in. This is injected only for the single AI call — it's never
// written to the database, so it can't go stale in stored conversations.
function buildSearchContextMessage(query, results) {
  var lines = results.map(function (r, i) {
    return (i + 1) + '. ' + r.title + ' (' + r.url + ')\n' + r.description;
  });
  return {
    role: 'system',
    content: 'A live web search was just run on the user\'s behalf for: "' + query + '". ' +
      'You have real, current results below — treat them as information you already looked up this turn. ' +
      'Do NOT say you cannot browse the internet, cannot access real-time information, or cannot perform web searches — that is false right now, the search already happened and the results are provided to you here. ' +
      'Answer the user\'s question directly using these results.\n\n' +
      lines.join('\n\n') +
      '\n\nWhen you rely on a result, refer to it naturally in your answer. Do not write your own numbered source list — one is appended automatically after your reply.'
  };
}

// Appended to the model's reply and persisted, so sources survive reloads
// and branch switches just like the rest of the message.
function formatSourcesMarkdown(results) {
  if (!results || !results.length) return '';
  var lines = results.map(function (r, i) { return (i + 1) + '. [' + r.title + '](' + r.url + ')'; });
  return '\n\n**Sources:**\n' + lines.join('\n');
}

// ---- Extended thinking ----
//
// Rather than depending on model-specific reasoning APIs (which vary or
// don't exist across the models in FREE_MODELS), this asks the model to
// wrap its reasoning in <thinking> tags before its real answer in
// <answer> tags. The raw response — tags and all — is what gets stored,
// so the split is reconstructed client-side at render time (see
// splitThinking() in the UI) rather than needing a separate DB column;
// that also means it survives reloads and branch switches for free, the
// same way search sources do.
function buildThinkingInstructionMessage() {
  return {
    role: 'system',
    content: 'For this reply, think through the problem carefully first. ' +
      'Put your step-by-step reasoning inside <thinking> and </thinking> tags, ' +
      'then give your final, direct answer inside <answer> and </answer> tags. ' +
      'Keep the thinking focused and not excessively long, since it shares the same output budget as your answer — always leave room to finish the answer completely. ' +
      'If the request is simple enough that reasoning isn\'t useful, you may leave the <thinking></thinking> tags empty and go straight to the answer. ' +
      'Do not put any text outside of these two tag pairs.'
  };
}

// Standing instruction, always sent (not tied to a toggle): open models
// will sometimes describe a file ("here's an HTML page that does X...")
// without actually including it, especially for longer demos. That leaves
// nothing for the UI's code/preview/copy/download block to work with, so
// this is a correctness fix, not a style preference.
function buildCodeOutputInstructionMessage() {
  return {
    role: 'system',
    content: 'If your answer involves writing any code, an HTML page, a script, or any other file, ' +
      'you must include its complete contents in a fenced code block with the correct language tag ' +
      '(for example ```html, ```javascript, ```python) — never omit it, truncate it, or merely describe ' +
      'what the file would contain. The user can only see, preview, copy, or download exactly what you ' +
      'put inside the code block, nothing else, so describing a file instead of writing it leaves them ' +
      'with nothing.'
  };
}

// ---- Conversation tree helpers (claude.ai-style branching) ----
//
// Every message row has a parent_id. Regenerating an assistant message
// never deletes or overwrites anything — it inserts a new sibling row
// under the same parent, and the parent's active_child_id is pointed at
// the new sibling. The "active path" (root -> ... -> active leaf) is what
// gets displayed; every previous variant stays in the table and can be
// switched back to at any time, even after a reload.

async function loadConversationTree(env, conversationId) {
  var res = await env.DB.prepare(
    'SELECT id, parent_id, role, content, timestamp, active_child_id FROM messages WHERE conversation_id = ? ORDER BY id ASC'
  ).bind(conversationId).all();
  var rows = res.results || [];
  var byId = {};
  var childrenByParent = {};
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    byId[row.id] = row;
    var key = row.parent_id == null ? 'root' : String(row.parent_id);
    if (!childrenByParent[key]) childrenByParent[key] = [];
    childrenByParent[key].push(row.id);
  }
  return { byId: byId, childrenByParent: childrenByParent };
}

// Walks root -> active leaf, returning display-ready message objects with
// sibling/version metadata attached.
function getActivePath(tree) {
  var rootIds = tree.childrenByParent['root'] || [];
  if (rootIds.length === 0) return [];
  var current = tree.byId[rootIds[0]];
  var path = [];
  while (current) {
    var key = current.parent_id == null ? 'root' : String(current.parent_id);
    var siblingIds = tree.childrenByParent[key] || [current.id];
    path.push({
      id: current.id,
      role: current.role,
      content: current.content,
      version_index: siblingIds.indexOf(current.id),
      version_count: siblingIds.length,
      version_ids: siblingIds
    });
    current = current.active_child_id ? tree.byId[current.active_child_id] : null;
  }
  return path;
}

// Ancestor chain (role/content only) leading up to — but not including —
// the given message id. This is the actual context that message was
// generated from, regardless of which branches are currently active.
function getAncestorMessages(tree, messageId) {
  var chain = [];
  var node = tree.byId[messageId];
  var parentId = node ? node.parent_id : null;
  while (parentId) {
    var parent = tree.byId[parentId];
    if (!parent) break;
    chain.unshift({ role: parent.role, content: parent.content });
    parentId = parent.parent_id;
  }
  return chain;
}

// Builds one display item the same way getActivePath does, but for an
// arbitrary node — used to reconstruct the response payload in-memory
// right after an insert, instead of re-querying the whole conversation.
function buildDisplayItem(tree, node, overrideSiblingIds) {
  var key = node.parent_id == null ? 'root' : String(node.parent_id);
  var siblingIds = overrideSiblingIds || tree.childrenByParent[key] || [node.id];
  return {
    id: node.id,
    role: node.role,
    content: node.content,
    version_index: siblingIds.indexOf(node.id),
    version_count: siblingIds.length,
    version_ids: siblingIds
  };
}

// Ancestor chain WITH display metadata, root -> nodeId inclusive.
function pathToNode(tree, nodeId) {
  if (nodeId == null) return [];
  var chain = [];
  var current = tree.byId[nodeId];
  while (current) {
    chain.unshift(current);
    current = current.parent_id != null ? tree.byId[current.parent_id] : null;
  }
  return chain.map(function (node) { return buildDisplayItem(tree, node); });
}

async function buildConversationPayload(env, conversationId) {
  var convStmt = env.DB.prepare('SELECT * FROM conversations WHERE id = ?');
  var conv = await convStmt.bind(conversationId).first();
  if (!conv) return null;
  var tree = await loadConversationTree(env, conversationId);
  var messages = getActivePath(tree);
  return { success: true, id: conv.id, title: conv.title, messages: messages };
}

// ============================================
// WORKER HANDLER
// ============================================

export default {
  async fetch(request, env) {
    var url = new URL(request.url);
    var method = request.method;
    var path = url.pathname;

    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    if (method === 'GET' && path === '/') {
      return new Response(UI_HTML, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN,
          // The shell is a static string baked into the Worker — it only
          // changes on redeploy, so let the browser (and Cloudflare's edge)
          // cache it instead of re-downloading ~40KB on every visit.
          'Cache-Control': 'public, max-age=300'
        }
      });
    }

    await initDatabase(env);

    // GET /api/neurons
    if (method === 'GET' && path === '/api/neurons') {
      try {
        var today = new Date().toISOString().split('T')[0];
        var used = await getTodayUsage(env, today);
        return jsonResponse({ success: true, used: used, limit: CONFIG.DAILY_NEURON_LIMIT });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    // GET /api/conversations
    if (method === 'GET' && path === '/api/conversations') {
      try {
        var stmt = env.DB.prepare(
          'SELECT c.id, c.title, c.created_at, c.updated_at, COUNT(m.id) as message_count ' +
          'FROM conversations c LEFT JOIN messages m ON c.id = m.conversation_id ' +
          'GROUP BY c.id ORDER BY c.updated_at DESC'
        );
        var result = await stmt.all();
        return jsonResponse({ success: true, conversations: result.results || [] });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    // POST /api/conversations
    if (method === 'POST' && path === '/api/conversations') {
      try {
        var body = await request.json();
        var id = crypto.randomUUID();
        var title = (body.title || 'New Chat').toString().slice(0, 100);
        var now = Date.now();
        var stmt = env.DB.prepare(
          'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)'
        );
        await stmt.bind(id, title, now, now).run();
        return jsonResponse({ success: true, id: id, title: title });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    // PUT /api/conversations/:id
    if (method === 'PUT' && path.match(/^\/api\/conversations\/[^\/]+$/)) {
      try {
        var id = path.split('/').pop();
        var body = await request.json();
        var newTitle = (body.title || 'Untitled').toString().slice(0, 100);
        var now = Date.now();
        var stmt = env.DB.prepare(
          'UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?'
        );
        await stmt.bind(newTitle, now, id).run();
        return jsonResponse({ success: true, id: id, title: newTitle });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    // GET /api/conversations/:id
    if (method === 'GET' && path.match(/^\/api\/conversations\/[^\/]+$/)) {
      try {
        var id = path.split('/').pop();
        var payload = await buildConversationPayload(env, id);
        if (!payload) {
          return jsonResponse({ success: false, error: 'Conversation not found' }, 404);
        }
        return jsonResponse(payload);
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    // DELETE /api/conversations/:id
    if (method === 'DELETE' && path.match(/^\/api\/conversations\/[^\/]+$/)) {
      try {
        var id = path.split('/').pop();
        var delMsgs = env.DB.prepare('DELETE FROM messages WHERE conversation_id = ?');
        await delMsgs.bind(id).run();
        var delConv = env.DB.prepare('DELETE FROM conversations WHERE id = ?');
        await delConv.bind(id).run();
        return jsonResponse({ success: true });
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    // POST /api/conversations/:id/branch — switch which sibling variant is active
    var branchMatch = path.match(/^\/api\/conversations\/([^\/]+)\/branch$/);
    if (method === 'POST' && branchMatch) {
      try {
        var conversationId = branchMatch[1];
        var body = await request.json();
        var messageId = body.message_id;
        if (!messageId) {
          return jsonResponse({ success: false, error: 'message_id is required' }, 400);
        }

        var tree = await loadConversationTree(env, conversationId);
        var target = tree.byId[messageId];
        if (!target) {
          return jsonResponse({ success: false, error: 'Message not found in this conversation' }, 404);
        }
        if (target.parent_id == null) {
          return jsonResponse({ success: false, error: 'This message has no alternate versions' }, 400);
        }

        var updateStmt = env.DB.prepare('UPDATE messages SET active_child_id = ? WHERE id = ?');
        await updateStmt.bind(target.id, target.parent_id).run();

        var payload = await buildConversationPayload(env, conversationId);
        return jsonResponse(payload);
      } catch (err) {
        return jsonResponse({ success: false, error: err.message }, 500);
      }
    }

    // POST /api/chat
    if (method === 'POST' && path === '/api/chat') {
      return streamJsonEvents(async function (send) {
        var body = await request.json();
        var conversationId = body.conversation_id;
        var prompt = body.prompt ? body.prompt.trim() : '';

        if (!prompt) {
          return send({ type: 'result', success: false, error: 'Prompt is required' });
        }
        if (prompt.length > CONFIG.MAX_PROMPT_LENGTH) {
          return send({ type: 'result', success: false, error: 'Prompt too long. Maximum ' + CONFIG.MAX_PROMPT_LENGTH + ' characters.' });
        }
        if (!conversationId) {
          return send({ type: 'result', success: false, error: 'Conversation ID is required' });
        }

        var resolved;
        try {
          resolved = resolveModel(body.model);
        } catch (err) {
          return send({ type: 'result', success: false, error: err.message });
        }
        var temperature = clampTemperature(body.temperature);
        var max_tokens = clampMaxTokens(body.max_tokens, resolved.maxTokens);
        var wantsSearch = !!body.web_search;
        var wantsThinking = !!body.thinking;

        var convCheck = env.DB.prepare('SELECT id FROM conversations WHERE id = ?');
        var convExists = await convCheck.bind(conversationId).first();
        if (!convExists) {
          return send({ type: 'result', success: false, error: 'Conversation not found' });
        }

        var searchContextMessage = null;
        var searchResults = [];
        var searchError = null;
        if (wantsSearch) {
          await send({ type: 'status', stage: 'searching' });
          var searchResult = await webSearch(env, prompt);
          searchError = searchResult.error;
          if (searchResult.results.length) {
            searchResults = searchResult.results;
            searchContextMessage = buildSearchContextMessage(prompt, searchResults);
          }
        }

        var today = new Date().toISOString().split('T')[0];
        var currentUsage = await getTodayUsage(env, today);
        var extraContextLength = searchContextMessage ? searchContextMessage.content.length : 0;
        var estimatedNeurons = estimateNeurons(prompt.length + extraContextLength, max_tokens);
        try {
          assertWithinNeuronBudget(currentUsage, estimatedNeurons);
        } catch (err) {
          return send({ type: 'result', success: false, error: err.message });
        }

        // The new message continues from wherever the conversation is
        // currently displayed (the active leaf), so sending a message after
        // switching to an older branch continues *that* branch — matching
        // claude.ai's behavior.
        var tree = await loadConversationTree(env, conversationId);
        var activePath = getActivePath(tree);
        var parentId = activePath.length ? activePath[activePath.length - 1].id : null;

        var fullPath = activePath.map(function (m) { return { role: m.role, content: m.content }; });
        fullPath.push({ role: 'user', content: prompt });
        var contextMessages = await buildModelContext(env, conversationId, resolved.model, fullPath);
        // The search context is only ever sent to the model for this one
        // call — it's never stored, so a conversation never carries stale
        // search results forward into later turns.
        if (searchContextMessage) contextMessages.unshift(searchContextMessage);
        if (wantsThinking) contextMessages.unshift(buildThinkingInstructionMessage());
        contextMessages.unshift(buildCodeOutputInstructionMessage());

        await send({ type: 'status', stage: 'generating', model: resolved.model });
        var aiResult = await runAIModel(env, resolved.model, contextMessages, temperature, max_tokens, estimatedNeurons);
        if (searchResults.length) aiResult.resultText += formatSourcesMarkdown(searchResults);

        var now = Date.now();
        var insertStmt = env.DB.prepare(
          'INSERT INTO messages (conversation_id, parent_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)'
        );
        // The user row has to be inserted (and its id known) before the
        // assistant row can reference it as a parent.
        var userInsert = await insertStmt.bind(conversationId, parentId, 'user', prompt, now).run();
        var userMessageId = userInsert.meta.last_row_id;

        // Everything that depends on userMessageId goes in one batch: the
        // assistant reply, linking the previous leaf to its new child, and
        // bumping the conversation's updated_at — one round trip instead
        // of several sequential ones.
        var chatBatchStmts = [
          insertStmt.bind(conversationId, userMessageId, 'assistant', aiResult.resultText, now + 1),
          env.DB.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').bind(now, conversationId)
        ];
        if (parentId) {
          chatBatchStmts.push(env.DB.prepare('UPDATE messages SET active_child_id = ? WHERE id = ?').bind(userMessageId, parentId));
        }
        var chatBatchResults = await env.DB.batch(chatBatchStmts);
        var assistantMessageId = chatBatchResults[0].meta.last_row_id;

        // Final batch: link the user message to its new assistant child and
        // record neuron usage together, again as one round trip.
        await env.DB.batch([
          env.DB.prepare('UPDATE messages SET active_child_id = ? WHERE id = ?').bind(assistantMessageId, userMessageId),
          env.DB.prepare('INSERT INTO neuron_usage (date, used) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET used = used + ?').bind(today, aiResult.neuronsUsed, aiResult.neuronsUsed)
        ]);
        var newUsage = currentUsage + aiResult.neuronsUsed;

        // Build the updated display path in-memory — we already know
        // exactly what was just added, so there's no need to re-query the
        // whole conversation tree just to report it back.
        var userDisplayItem = { id: userMessageId, role: 'user', content: prompt, version_index: 0, version_count: 1, version_ids: [userMessageId] };
        var assistantDisplayItem = { id: assistantMessageId, role: 'assistant', content: aiResult.resultText, version_index: 0, version_count: 1, version_ids: [assistantMessageId] };
        var finalMessages = activePath.concat([userDisplayItem, assistantDisplayItem]);

        await send({
          type: 'result',
          success: true,
          response: aiResult.resultText,
          messages: finalMessages,
          neurons_used: aiResult.neuronsUsed,
          total_neurons_used: newUsage,
          remaining_neurons: CONFIG.DAILY_NEURON_LIMIT - newUsage,
          search_error: wantsSearch ? searchError : null
        });
      });
    }

    // POST /api/regenerate
    if (method === 'POST' && path === '/api/regenerate') {
      return streamJsonEvents(async function (send) {
        var body = await request.json();
        var conversationId = body.conversation_id;
        var messageId = body.message_id;

        if (!conversationId) {
          return send({ type: 'result', success: false, error: 'Conversation ID is required' });
        }
        if (!messageId) {
          return send({ type: 'result', success: false, error: 'message_id is required' });
        }

        var resolved;
        try {
          resolved = resolveModel(body.model);
        } catch (err) {
          return send({ type: 'result', success: false, error: err.message });
        }
        var temperature = clampTemperature(body.temperature);
        var max_tokens = clampMaxTokens(body.max_tokens, resolved.maxTokens);
        var wantsSearch = !!body.web_search;
        var wantsThinking = !!body.thinking;

        var convCheck = env.DB.prepare('SELECT id FROM conversations WHERE id = ?');
        var convExists = await convCheck.bind(conversationId).first();
        if (!convExists) {
          return send({ type: 'result', success: false, error: 'Conversation not found' });
        }

        var tree = await loadConversationTree(env, conversationId);
        var target = tree.byId[messageId];
        if (!target) {
          return send({ type: 'result', success: false, error: 'Message not found in this conversation' });
        }
        if (target.role !== 'assistant') {
          return send({ type: 'result', success: false, error: 'Only assistant messages can be regenerated' });
        }
        if (target.parent_id == null) {
          return send({ type: 'result', success: false, error: 'This message has no preceding prompt to regenerate from' });
        }

        // The real ancestry of the message being regenerated — not the
        // currently active path — so regenerating a message on an older
        // branch still uses the context it actually belongs to.
        var ancestors = getAncestorMessages(tree, messageId);
        if (ancestors.length === 0 || ancestors[ancestors.length - 1].role !== 'user') {
          return send({ type: 'result', success: false, error: 'No preceding user message to regenerate from' });
        }
        var promptForEstimate = ancestors[ancestors.length - 1].content || '';

        var searchContextMessage = null;
        var searchResults = [];
        var searchError = null;
        if (wantsSearch) {
          await send({ type: 'status', stage: 'searching' });
          var searchResult = await webSearch(env, promptForEstimate);
          searchError = searchResult.error;
          if (searchResult.results.length) {
            searchResults = searchResult.results;
            searchContextMessage = buildSearchContextMessage(promptForEstimate, searchResults);
          }
        }

        var today = new Date().toISOString().split('T')[0];
        var currentUsage = await getTodayUsage(env, today);
        var extraContextLength = searchContextMessage ? searchContextMessage.content.length : 0;
        var estimatedNeurons = estimateNeurons(promptForEstimate.length + extraContextLength, max_tokens);
        try {
          assertWithinNeuronBudget(currentUsage, estimatedNeurons);
        } catch (err) {
          return send({ type: 'result', success: false, error: err.message });
        }

        var modelMessages = await buildModelContext(env, conversationId, resolved.model, ancestors);
        if (searchContextMessage) modelMessages.unshift(searchContextMessage);
        if (wantsThinking) modelMessages.unshift(buildThinkingInstructionMessage());
        modelMessages.unshift(buildCodeOutputInstructionMessage());
        await send({ type: 'status', stage: 'generating', model: resolved.model });
        var aiResult = await runAIModel(env, resolved.model, modelMessages, temperature, max_tokens, estimatedNeurons);
        if (searchResults.length) aiResult.resultText += formatSourcesMarkdown(searchResults);

        // Insert the regenerated response as a NEW sibling under the same
        // parent — the original message (and anything downstream of it) is
        // left untouched and stays reachable by switching branches back.
        var now = Date.now();
        var insertResult = await env.DB.prepare(
          'INSERT INTO messages (conversation_id, parent_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)'
        ).bind(conversationId, target.parent_id, 'assistant', aiResult.resultText, now).run();
        var newMessageId = insertResult.meta.last_row_id;

        await env.DB.batch([
          env.DB.prepare('UPDATE messages SET active_child_id = ? WHERE id = ?').bind(newMessageId, target.parent_id),
          env.DB.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').bind(now, conversationId),
          env.DB.prepare('INSERT INTO neuron_usage (date, used) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET used = used + ?').bind(today, aiResult.neuronsUsed, aiResult.neuronsUsed)
        ]);
        var newUsage = currentUsage + aiResult.neuronsUsed;

        // Build the updated display path in-memory: the ancestor chain up
        // to (and including) the parent hasn't changed, so we only need to
        // fold the new sibling into that parent's existing child list —
        // no need to re-query the whole conversation tree for this.
        var oldSiblingKey = target.parent_id == null ? 'root' : String(target.parent_id);
        var oldSiblingIds = tree.childrenByParent[oldSiblingKey] || [target.id];
        var newSiblingIds = oldSiblingIds.concat([newMessageId]);
        var newDisplayItem = {
          id: newMessageId,
          role: 'assistant',
          content: aiResult.resultText,
          version_index: newSiblingIds.length - 1,
          version_count: newSiblingIds.length,
          version_ids: newSiblingIds
        };
        var finalMessages = pathToNode(tree, target.parent_id).concat([newDisplayItem]);

        await send({
          type: 'result',
          success: true,
          response: aiResult.resultText,
          message_id: newMessageId,
          messages: finalMessages,
          neurons_used: aiResult.neuronsUsed,
          total_neurons_used: newUsage,
          remaining_neurons: CONFIG.DAILY_NEURON_LIMIT - newUsage,
          search_error: wantsSearch ? searchError : null
        });
      });
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders() });
  }
};
