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
  CORS_ORIGIN: '*'
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
':root{--bg:#fff;--surface:#F6F6F5;--border:#E1E1DE;--text:#131316;--text-dim:#6C6C72;--accent:#2547F4;--accent-dim:#E9ECFE;--warn:#C7431E;--user-bg:#131316;--user-text:#fff;--radius:6px}' +
'html[data-theme="dark"]{--bg:#0A0A0C;--surface:#151517;--border:#29292D;--text:#F1F1EF;--text-dim:#8B8B91;--accent:#6C89FF;--accent-dim:#16193A;--warn:#FF8A63;--user-bg:#F1F1EF;--user-text:#0A0A0C}' +
'*{margin:0;padding:0;box-sizing:border-box}' +
'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Ubuntu,sans-serif;background:var(--bg);color:var(--text);height:100dvh;overflow:hidden;display:flex;flex-direction:column;position:relative;transition:background .2s ease,color .2s ease}' +
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
'.conversation-list{flex:1;overflow-y:auto;padding:8px 0;-webkit-overflow-scrolling:touch}' +
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
'.model-selector-wrap{padding:3px 12px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:6px;flex-shrink:0;background:var(--bg);flex-wrap:wrap;min-height:30px}' +
'.model-selector-wrap label{font-family:ui-monospace,"SF Mono",Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:10px;color:var(--text-dim)}' +
'.model-selector-wrap select{padding:2px 4px;border:1px solid var(--border);border-radius:4px;font-size:10px;background:var(--surface);color:var(--text);cursor:pointer;outline:none;font-family:inherit;max-width:120px}' +
'.chat-container{flex:1;overflow-y:auto;padding:10px 12px 8px;display:flex;flex-direction:column;gap:8px;-webkit-overflow-scrolling:touch;scroll-behavior:smooth;background:var(--bg)}' +
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
'.message h1,.message h2,.message h3,.message h4{margin:4px 0 2px 0;font-weight:600}' +
'.message h1{font-size:16px}.message h2{font-size:14px}.message h3{font-size:13px}' +
'.message table{border-collapse:collapse;width:100%;margin:3px 0;font-size:11px}' +
'.message table th,.message table td{border:1px solid var(--border);padding:2px 5px;text-align:left}' +
'.message table th{background:var(--bg);font-weight:600}' +
'.typing-indicator{align-self:flex-start;background:var(--surface);border:1px solid var(--border);padding:6px 12px;border-radius:var(--radius);border-bottom-left-radius:2px;display:none;gap:3px}' +
'.typing-indicator span{width:5px;height:5px;background:var(--text-dim);border-radius:50%;display:inline-block;animation:bounce 1.4s infinite ease-in-out both}' +
'.typing-indicator span:nth-child(1){animation-delay:-0.32s}.typing-indicator span:nth-child(2){animation-delay:-0.16s}.typing-indicator span:nth-child(3){animation-delay:0s}' +
'@keyframes bounce{0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}' +
'@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}' +
'.input-area{padding:6px 10px 8px;border-top:1px solid var(--border);flex-shrink:0;display:flex;gap:6px;align-items:flex-end;background:var(--bg);padding-bottom:calc(8px + env(safe-area-inset-bottom))}' +
'.input-area textarea{flex:1;padding:6px 10px;border:1px solid var(--border);border-radius:4px;font-size:13px;font-family:inherit;resize:none;min-height:34px;max-height:80px;outline:none;transition:border .15s ease,background .15s ease;line-height:1.3;background:var(--surface);color:var(--text)}' +
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
'@media(min-width:768px){.sidebar{position:relative;transform:translateX(0);width:280px;border-right:1px solid var(--border);padding-bottom:0}.sidebar-overlay{display:none!important}.hamburger{display:none}.main-area{flex:1}.header h1{font-size:18px;max-width:none}.header .subtitle{font-size:12px;max-width:none}.message{max-width:80%;font-size:15px;padding:10px 16px}.message .version-nav button{font-size:12px;padding:3px 10px;height:auto}.input-area textarea{font-size:14px;min-height:44px;padding:8px 14px}.input-area button{font-size:14px;height:44px;padding:8px 24px}.model-selector-wrap select{font-size:12px;max-width:160px}.chat-container{padding:16px 24px}.header{padding:12px 24px}}' +
'@media(max-width:767px){.sidebar{position:fixed;width:280px}.sidebar-overlay{display:none}.sidebar-overlay.show{display:block}.hamburger{display:flex}.header h1{font-size:14px;max-width:90px}.header .subtitle{display:none}.message{max-width:92%;font-size:12px;padding:6px 10px}.input-area{padding:4px 8px 6px}.input-area textarea{font-size:12px;min-height:30px;padding:4px 8px}.input-area button{font-size:12px;height:30px;padding:4px 10px}.model-selector-wrap{padding:2px 8px}.model-selector-wrap select{font-size:9px;max-width:90px}.neuron-dashboard{padding:4px 8px}.chat-container{padding:6px 8px 4px}.scroll-to-bottom{bottom:60px;right:12px;width:32px;height:32px;font-size:16px}}' +
'@media(max-width:480px){.sidebar{width:85%;max-width:280px}.message{max-width:95%;font-size:11px;padding:5px 8px}.message .label{font-size:7px}.message pre{font-size:10px;padding:3px 6px}.message code{font-size:10px}.message .version-nav button{font-size:9px;padding:1px 5px;min-width:20px;height:18px}.message .version-nav .version-info{font-size:9px;min-width:24px}.message .version-nav .regenerate-btn{font-size:11px;height:18px}.header h1{font-size:13px;max-width:70px}.header .model-badge{font-size:8px;padding:1px 6px}.input-area textarea{font-size:11px;min-height:28px;padding:3px 6px}.input-area button{font-size:11px;height:28px;padding:3px 8px}.modal-box{padding:14px 16px}.modal-box h3{font-size:14px}.modal-box input{font-size:11px;padding:4px 8px}.neuron-dashboard .neuron-stats{font-size:7px}.scroll-to-bottom{bottom:54px;right:10px;width:28px;height:28px;font-size:14px}}' +
'.no-scrollbar::-webkit-scrollbar{width:0;height:0}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}' +
'</style></head><body>' +
'<div class="sidebar-overlay" id="sidebarOverlay"></div>' +
'<div class="modal-overlay" id="modalOverlay"><div class="modal-box"><h3 id="modalTitle">New Chat</h3><p id="modalSubtitle">Enter a name for this conversation</p><input type="text" id="modalInput" placeholder="Conversation name..." maxlength="100" /><div class="modal-actions"><button class="cancel-btn" id="modalCancel">Cancel</button><button class="confirm-btn" id="modalConfirm">Create</button></div></div></div>' +
'<div class="modal-overlay" id="deleteModalOverlay"><div class="modal-box"><h3 id="deleteModalTitle">Delete Conversation</h3><p id="deleteModalSubtitle">Are you sure you want to delete this conversation?</p><div class="modal-actions"><button class="cancel-btn" id="deleteModalCancel">Cancel</button><button class="danger-btn" id="deleteModalConfirm">Delete</button></div></div></div>' +
'<div class="app"><div class="sidebar" id="sidebar"><div class="sidebar-header"><h2>Conversations</h2><div class="sub">your chat history</div></div><div class="sidebar-actions"><button id="newChatBtn">+ New Chat</button><button class="secondary" id="refreshBtn">&#8635;</button></div><div class="conversation-list" id="conversationList"></div>' +
'<div class="neuron-dashboard" id="neuronDashboard"><div class="neuron-label">neurons today</div><div class="neuron-bar"><div class="neuron-fill low" id="neuronFill" style="width:0%"></div></div><div class="neuron-stats"><span>used <span class="used" id="neuronUsed">0</span></span><span>left <span class="remaining" id="neuronRemaining">10,000</span></span></div></div></div>' +
'<div class="main-area"><div class="header"><div class="header-left"><button class="hamburger" id="hamburgerBtn">&#9776;</button><div><h1 id="chatTitle">Webcore AI</h1><div class="subtitle" id="chatSubtitle">Select or start</div></div></div><div class="header-right"><span class="model-badge" id="modelBadge">Llama 4</span><button class="theme-toggle" id="themeToggle" aria-label="Switch theme" type="button"><svg id="themeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="4.6"></circle><path d="M12 2.4v2.4M12 19.2v2.4M4.4 12H2M22 12h-2.4M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M5.6 18.4l1.7-1.7M16.7 7.3l1.7-1.7"></path></svg></button></div></div><div class="model-selector-wrap"><label for="modelSelect">model</label><select class="model-selector" id="modelSelect"><option value="@cf/meta/llama-4-scout-17b-16e-instruct">Llama 4 Scout</option><option value="@cf/openai/gpt-oss-120b">GPT-OSS 120B</option><option value="@cf/google/gemma-4-26b-a4b-it">Gemma 4 26B</option><option value="@cf/zai-org/glm-4.7-flash">GLM 4.7</option><option value="@cf/qwen/qwen3.8-27b">Qwen 3.8</option></select></div>' +
'<div class="chat-container no-scrollbar" id="chatContainer"></div><div class="typing-indicator" id="typingIndicator"><span></span><span></span><span></span></div><div class="error-toast" id="errorToast"></div><div class="input-area"><textarea id="userInput" rows="1" placeholder="Type a message..." maxlength="2000"></textarea><button id="sendBtn">Send</button></div></div></div>' +
'<button class="scroll-to-bottom" id="scrollBtn" title="Scroll to bottom">&#8595;</button><script>' +
'var chatContainer=document.getElementById("chatContainer"),userInput=document.getElementById("userInput"),sendBtn=document.getElementById("sendBtn"),conversationList=document.getElementById("conversationList"),newChatBtn=document.getElementById("newChatBtn"),refreshBtn=document.getElementById("refreshBtn"),hamburgerBtn=document.getElementById("hamburgerBtn"),sidebar=document.getElementById("sidebar"),sidebarOverlay=document.getElementById("sidebarOverlay"),typingIndicator=document.getElementById("typingIndicator"),errorToast=document.getElementById("errorToast"),chatTitle=document.getElementById("chatTitle"),chatSubtitle=document.getElementById("chatSubtitle"),modelBadge=document.getElementById("modelBadge"),modalOverlay=document.getElementById("modalOverlay"),modalTitle=document.getElementById("modalTitle"),modalSubtitle=document.getElementById("modalSubtitle"),modalInput=document.getElementById("modalInput"),modalConfirm=document.getElementById("modalConfirm"),modalCancel=document.getElementById("modalCancel"),deleteModalOverlay=document.getElementById("deleteModalOverlay"),deleteModalConfirm=document.getElementById("deleteModalConfirm"),deleteModalCancel=document.getElementById("deleteModalCancel"),modelSelect=document.getElementById("modelSelect"),neuronFill=document.getElementById("neuronFill"),neuronUsed=document.getElementById("neuronUsed"),neuronRemaining=document.getElementById("neuronRemaining"),scrollBtn=document.getElementById("scrollBtn"),themeToggle=document.getElementById("themeToggle"),themeIcon=document.getElementById("themeIcon"),isProcessing=!1,currentConversationId=null,modalResolve=null,deleteResolve=null,dailyNeuronLimit=10000,tempIdCounter=0;' +
'var MODEL_NAMES={"@cf/meta/llama-4-scout-17b-16e-instruct":"Llama 4","@cf/openai/gpt-oss-120b":"GPT-OSS 120B","@cf/google/gemma-4-26b-a4b-it":"Gemma 4","@cf/zai-org/glm-4.7-flash":"GLM 4.7","@cf/qwen/qwen3.8-27b":"Qwen 3.8"};' +
'var SUN_PATH="M12 2.4v2.4M12 19.2v2.4M4.4 12H2M22 12h-2.4M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M5.6 18.4l1.7-1.7M16.7 7.3l1.7-1.7",MOON_PATH="M20 14.6A8.4 8.4 0 1 1 9.4 4a6.7 6.7 0 0 0 10.6 10.6z";' +
'function applyThemeIcon(e){var t=themeIcon.querySelector("circle"),n=themeIcon.querySelector("path");if(e==="dark"){if(t)t.setAttribute("r","0");n.setAttribute("d",MOON_PATH)}else{if(t)t.setAttribute("r","4.6");n.setAttribute("d",SUN_PATH)}}' +
'(function initTheme(){var e=null;try{e=localStorage.getItem("webcore-theme")}catch(t){}var n=e||"light";document.documentElement.setAttribute("data-theme",n);applyThemeIcon(n)})();' +
'themeToggle.addEventListener("click",function(){var e=document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark";document.documentElement.setAttribute("data-theme",e);applyThemeIcon(e);try{localStorage.setItem("webcore-theme",e)}catch(t){}});' +
'function updateNeuronDisplay(e){var t=Math.max(0,dailyNeuronLimit-e),n=Math.min(100,(e/dailyNeuronLimit)*100);neuronUsed.textContent=e.toLocaleString();neuronRemaining.textContent=t.toLocaleString();neuronFill.style.width=n+"%";neuronFill.className="neuron-fill"+(n<50?" low":n<80?" medium":" high");neuronRemaining.className=n>=90?"remaining warning":"remaining"}' +
'function loadNeuronUsage(){apiRequest("/api/neurons","GET").then(function(e){if(e.success){if(e.limit)dailyNeuronLimit=e.limit;updateNeuronDisplay(e.used||0)}}).catch(function(e){console.error(e)})}' +
'function showModal(e,t,n,r){return new Promise(function(a){modalTitle.textContent=e;modalSubtitle.textContent=t;modalInput.placeholder=n||"Enter name...";modalInput.value="";modalConfirm.textContent=r||"Create";modalOverlay.classList.add("show");setTimeout(function(){modalInput.focus()},100);modalResolve=a})}function hideModal(){modalOverlay.classList.remove("show");modalResolve&&(modalResolve(null),modalResolve=null)}function showDeleteModal(){return new Promise(function(e){deleteModalOverlay.classList.add("show");deleteResolve=e})}function hideDeleteModal(){deleteModalOverlay.classList.remove("show");deleteResolve&&(deleteResolve(!1),deleteResolve=null)}' +
'modalCancel.addEventListener("click",hideModal);modalOverlay.addEventListener("click",function(e){e.target===modalOverlay&&hideModal()});modalInput.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();var t=modalInput.value.trim();if(t){modalOverlay.classList.remove("show");modalResolve&&(modalResolve(t),modalResolve=null)}}if(e.key==="Escape")hideModal()});modalConfirm.addEventListener("click",function(){var e=modalInput.value.trim();if(e){modalOverlay.classList.remove("show");modalResolve&&(modalResolve(e),modalResolve=null)}});' +
'deleteModalCancel.addEventListener("click",function(){deleteModalOverlay.classList.remove("show");deleteResolve&&(deleteResolve(!1),deleteResolve=null)});deleteModalOverlay.addEventListener("click",function(e){e.target===deleteModalOverlay&&(deleteModalOverlay.classList.remove("show"),deleteResolve&&(deleteResolve(!1),deleteResolve=null))});deleteModalConfirm.addEventListener("click",function(){deleteModalOverlay.classList.remove("show");deleteResolve&&(deleteResolve(!0),deleteResolve=null)});' +
'function toggleSidebar(){sidebar.classList.toggle("open");sidebarOverlay.classList.toggle("show")}function closeSidebar(){sidebar.classList.remove("open");sidebarOverlay.classList.remove("show")}hamburgerBtn.addEventListener("click",toggleSidebar);sidebarOverlay.addEventListener("click",closeSidebar);' +
'function renderMarkdown(e){if(!e)return"";var t=e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");var n=t.split("\\n"),r=[],a=!1,o="",l=!1,s=[],codeBlocks=[],i=0;while(i<n.length){var c=n[i];if(c.match(/^```/)){if(l){l=!1;var idx=codeBlocks.length;codeBlocks.push(s.join("\\n").trim());r.push("\\u0000CB"+idx+"\\u0000")}else{l=!0;s=[]}i++;continue}if(l){s.push(c);i++;continue}if(""===c.trim()){a&&("ul"===o?r.push("</ul>"):"ol"===o&&r.push("</ol>"),a=!1,o="");i++;continue}if(c.match(/^### /)){r.push("<h3>"+c.replace(/^### /,"")+"</h3>");i++;continue}if(c.match(/^## /)){r.push("<h2>"+c.replace(/^## /,"")+"</h2>");i++;continue}if(c.match(/^# /)){r.push("<h1>"+c.replace(/^# /,"")+"</h1>");i++;continue}if(c.match(/^> /)){r.push("<blockquote>"+c.replace(/^> /,"")+"</blockquote>");i++;continue}if(c.match(/^\\|/)){var d=[],u=!1;while(i<n.length&&n[i].match(/^\\|/)){var p=n[i].split("|").filter(function(e){return e.trim()!=""});d.push(p.map(function(e){return e.trim()}));if(!u&&i+1<n.length&&n[i+1].match(/^\\|/)){var h=n[i+1].split("|").filter(function(e){return e.trim()!=""});if(h.every(function(e){return e.match(/^[\\s\\-:]+$/)||e.match(/^[:\\-]+$/)||e.match(/^\\-+$/)})){u=!0;i++}}i++}var m="<table>";if(d.length>0){m+="<thead><tr>";for(var f=0;f<d[0].length;f++){m+="<th>"+d[0][f]+"</th>"}m+="</tr></thead><tbody>";for(var v=1;v<d.length;v++){m+="<tr>";for(var g=0;g<d[v].length;g++){m+="<td>"+d[v][g]+"</td>"}m+="</tr>"}m+="</tbody>"}m+="</table>";r.push(m);continue}if(c.match(/^\\s*[-*+]\\s/)){a&&"ul"!==o&&(r.push("</ul>"),a=!1,o="");a||(r.push("<ul>"),a=!0,o="ul");r.push("<li>"+c.replace(/^\\s*[-*+]\\s/,"")+"</li>");i++;continue}if(c.match(/^\\s*\\d+\\.\\s/)){a&&"ol"!==o&&(r.push("</ol>"),a=!1,o="");a||(r.push("<ol>"),a=!0,o="ol");r.push("<li>"+c.replace(/^\\s*\\d+\\.\\s/,"")+"</li>");i++;continue}if(a){if("ul"===o)r.push("</ul>");else if("ol"===o)r.push("</ol>");a=!1;o=""}r.push("<p>"+c+"</p>");i++}a&&("ul"===o?r.push("</ul>"):"ol"===o&&r.push("</ol>"));var html=r.join("");html=html.replace(/`([^`]+)`/g,"<code>$1</code>").replace(/\\*\\*([^*]+)\\*\\*/g,"<strong>$1</strong>").replace(/\\*([^*]+)\\*/g,"<em>$1</em>").replace(/\\n/g,"<br>");for(var b=0;b<codeBlocks.length;b++){html=html.replace("\\u0000CB"+b+"\\u0000","<pre><code>"+codeBlocks[b]+"</code></pre>")}return html}' +
'function apiRequest(e,t,n){return fetch(e,{method:t,headers:{"Content-Type":"application/json"},body:n?JSON.stringify(n):null}).then(function(e){return e.json()})}' +
'function loadConversations(){apiRequest("/api/conversations","GET").then(function(e){e.success&&renderConversationList(e.conversations)}).catch(function(e){console.error(e)})}' +
'function loadConversation(id){apiRequest("/api/conversations/"+id,"GET").then(function(t){if(t.success){currentConversationId=id;renderMessages(t.messages||[]);chatTitle.textContent=t.title||"Conversation";chatSubtitle.textContent=(t.messages?t.messages.length:0)+" messages";highlightConversation(id);closeSidebar()}}).catch(function(e){console.error(e)})}' +
'async function createNewConversation(){var e=await showModal("New Chat","Enter a name for this conversation","Conversation name...","Create");if(e){apiRequest("/api/conversations","POST",{title:e}).then(function(e){if(e.success){loadConversations();loadConversation(e.id)}}).catch(function(e){console.error(e)})}}' +
'async function renameConversation(id,currentTitle){var n=await showModal("Rename Chat","Enter a new name for this conversation",currentTitle||"Untitled",currentTitle||"Untitled");if(n&&n.trim()){apiRequest("/api/conversations/"+id,"PUT",{title:n.trim()}).then(function(t){if(t.success){if(currentConversationId===id)chatTitle.textContent=t.title;loadConversations()}}).catch(function(e){console.error(e)})}}' +
'async function deleteConversation(id){var t=await showDeleteModal();if(t){apiRequest("/api/conversations/"+id,"DELETE").then(function(t){if(t.success){if(currentConversationId===id){currentConversationId=null;chatContainer.innerHTML="";chatTitle.textContent="Webcore AI";chatSubtitle.textContent="Select or start"}loadConversations();var n=conversationList.querySelectorAll(".conversation-item");if(n.length>0)loadConversation(n[0].dataset.id)}}).catch(function(e){console.error(e)})}}' +
'function buildVersionNav(m){var nav=document.createElement("div");nav.className="version-nav";var prev=document.createElement("button");prev.className="nav-prev";prev.textContent="\\u2190";prev.title="Previous version";var info=document.createElement("span");info.className="version-info";info.textContent=(m.version_index+1)+"/"+m.version_count;var next=document.createElement("button");next.className="nav-next";next.textContent="\\u2192";next.title="Next version";var regen=document.createElement("button");regen.className="regenerate-btn";regen.textContent="\\u27f3";regen.title="Regenerate";prev.disabled=m.version_count<=1||m.version_index===0;next.disabled=m.version_count<=1||m.version_index===m.version_count-1;prev.onclick=function(){switchBranch(m.version_ids[m.version_index-1])};next.onclick=function(){switchBranch(m.version_ids[m.version_index+1])};regen.onclick=function(){regenerateMessage(m.id)};nav.appendChild(prev);nav.appendChild(info);nav.appendChild(next);nav.appendChild(regen);return nav}' +
'function switchBranch(targetId){if(isProcessing||!currentConversationId)return;isProcessing=!0;apiRequest("/api/conversations/"+currentConversationId+"/branch","POST",{message_id:targetId}).then(function(t){if(t.success){renderMessages(t.messages);chatSubtitle.textContent=t.messages.length+" messages";loadConversations()}else{showError(t.error||"Could not switch version")}}).catch(function(e){showError(e.message||"Error switching version")}).finally(function(){isProcessing=!1})}' +
'function regenerateMessage(messageId){if(isProcessing){showError("Please wait for the current request to finish");return}if(!currentConversationId){showError("No conversation selected");return}var el=document.querySelector(".message[data-id=\\\'"+messageId+"\\\']");if(el){var c=el.querySelector(".message-content");if(c)c.innerHTML="<p>Regenerating...</p>";var nav=el.querySelector(".version-nav");if(nav)nav.remove()}isProcessing=!0;showTyping(!0);apiRequest("/api/regenerate","POST",{conversation_id:currentConversationId,message_id:messageId,model:modelSelect.value}).then(function(t){if(t.success){renderMessages(t.messages);chatSubtitle.textContent=t.messages.length+" messages";loadConversations();loadNeuronUsage();showError(null)}else{showError(t.error||"Failed to regenerate");loadConversation(currentConversationId)}}).catch(function(e){showError(e.message||"Error regenerating");loadConversation(currentConversationId)}).finally(function(){isProcessing=!1;showTyping(!1)})}' +
'function renderConversationList(e){conversationList.innerHTML="";if(!e||0===e.length){conversationList.innerHTML=\'<div style="padding:16px;text-align:center;color:var(--text-dim);font-size:12px;">No conversations yet</div>\';return}for(var t=0;t<e.length;t++){var n=e[t],r=document.createElement("div");r.className="conversation-item";r.dataset.id=n.id;if(n.id===currentConversationId)r.classList.add("active");var a=document.createElement("div");a.className="title";a.textContent=n.title||"Untitled";var o=document.createElement("div");o.className="meta";var l=new Date(n.updated_at);o.textContent=l.toLocaleDateString()+" \\u00b7 "+(n.message_count||0)+" msgs";var s=document.createElement("div");s.className="actions";var i=document.createElement("button");i.className="rename-btn";i.textContent="\\u271e";i.title="Rename";i.onclick=function(e){e.stopPropagation();var t=this.closest(".conversation-item"),n=t.dataset.id,r=t.querySelector(".title").textContent;renameConversation(n,r)};var d=document.createElement("button");d.className="delete-btn";d.textContent="\\u2715";d.title="Delete";d.onclick=function(e){e.stopPropagation();var t=this.closest(".conversation-item").dataset.id;deleteConversation(t)};s.appendChild(i);s.appendChild(d);r.appendChild(a);r.appendChild(o);r.appendChild(s);r.onclick=function(){loadConversation(this.dataset.id)};conversationList.appendChild(r)}}' +
'function renderMessages(e){chatContainer.innerHTML="";if(!e||0===e.length){var t=document.createElement("div");t.className="message assistant";var n=document.createElement("div");n.className="label";n.textContent="Assistant";var r=document.createElement("div");r.className="message-content";r.innerHTML="<p>Start a conversation!</p>";t.appendChild(n);t.appendChild(r);chatContainer.appendChild(t);return}for(var a=0;a<e.length;a++){addMessageDOM(e[a])}}' +
'function addMessageDOM(m){var t=document.createElement("div");t.className="message "+m.role;t.dataset.id=m.id;var n=document.createElement("div");n.className="label";n.textContent=m.role==="user"?"You":"Assistant";var r=document.createElement("div");r.className="message-content";if(m.role==="assistant")r.innerHTML=renderMarkdown(m.content);else r.textContent=m.content;t.appendChild(n);t.appendChild(r);if(m.role==="assistant")t.appendChild(buildVersionNav(m));chatContainer.appendChild(t);chatContainer.scrollTop=chatContainer.scrollHeight}' +
'function highlightConversation(e){var t=conversationList.querySelectorAll(".conversation-item");for(var n=0;n<t.length;n++){t[n].classList.toggle("active",t[n].dataset.id===e)}}' +
'function showTyping(e){typingIndicator.style.display=e?"flex":"none";if(e)chatContainer.scrollTop=chatContainer.scrollHeight}' +
'function showError(e){if(e){errorToast.textContent="\\u26a0\\ufe0f "+e;errorToast.classList.add("show");setTimeout(function(){errorToast.classList.remove("show")},4000)}else{errorToast.classList.remove("show")}}' +
'function updateModelBadge(e){var t=MODEL_NAMES[e]||e.split("/").pop();modelBadge.textContent=t}' +
'function updateScrollButton(){if(!chatContainer)return;var e=chatContainer.scrollHeight-chatContainer.clientHeight-chatContainer.scrollTop;e>20?scrollBtn.classList.add("show"):scrollBtn.classList.remove("show")}chatContainer.addEventListener("scroll",updateScrollButton);scrollBtn.addEventListener("click",function(){chatContainer.scrollTo({top:chatContainer.scrollHeight,behavior:"smooth"})});' +
'function ensureConversation(){if(currentConversationId)return Promise.resolve(currentConversationId);return apiRequest("/api/conversations","POST",{title:"New Chat"}).then(function(e){if(!e.success)throw new Error(e.error||"Could not create conversation");currentConversationId=e.id;chatContainer.innerHTML="";chatTitle.textContent=e.title||"New Chat";chatSubtitle.textContent="0 messages";loadConversations();return e.id})}' +
'function sendMessage(){var val=userInput.value.trim();if(!val||isProcessing)return;var model=modelSelect.value;var tempId="tmp-"+(++tempIdCounter);isProcessing=!0;sendBtn.disabled=!0;ensureConversation().then(function(convId){addMessageDOM({role:"user",content:val,id:tempId});userInput.value="";userInput.style.height="auto";showTyping(!0);updateModelBadge(model);return apiRequest("/api/chat","POST",{conversation_id:convId,prompt:val,model:model,temperature:.7,max_tokens:1e3})}).then(function(t){if(!t)return;if(t.success){renderMessages(t.messages);chatSubtitle.textContent=t.messages.length+" messages";loadConversations();highlightConversation(currentConversationId);if(t.neurons_used!==undefined){loadNeuronUsage()}showError(null)}else{showError(t.error||"AI request failed")}}).catch(function(e){showError(e.message||"Error sending message")}).finally(function(){isProcessing=!1;sendBtn.disabled=!1;showTyping(!1);userInput.focus()})}' +
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
      'CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, title TEXT, created_at INTEGER, updated_at INTEGER)'
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
    // Lightweight migration for deployments created before branching support:
    // ALTER TABLE ADD COLUMN fails harmlessly if the column already exists.
    try { await env.DB.prepare('ALTER TABLE messages ADD COLUMN parent_id INTEGER').run(); } catch (e) {}
    try { await env.DB.prepare('ALTER TABLE messages ADD COLUMN active_child_id INTEGER').run(); } catch (e) {}
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

async function recordNeuronUsage(env, today, neuronsUsed) {
  var upsertStmt = env.DB.prepare(
    'INSERT INTO neuron_usage (date, used) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET used = used + ?'
  );
  await upsertStmt.bind(today, neuronsUsed, neuronsUsed).run();
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

function aiErrorResponse(err) {
  var isLicenseError = err && err.message && (err.message.includes('403') || err.message.includes('license'));
  var status = isLicenseError ? 403 : 500;
  var message = isLicenseError
    ? 'Model license not accepted. Visit Cloudflare dashboard > AI > Models and agree to terms.'
    : (err && err.message) || 'AI service error';
  return jsonResponse({ success: false, error: message }, status);
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
          'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN
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
      try {
        var body = await request.json();
        var conversationId = body.conversation_id;
        var prompt = body.prompt ? body.prompt.trim() : '';

        if (!prompt) {
          return jsonResponse({ success: false, error: 'Prompt is required' }, 400);
        }
        if (prompt.length > CONFIG.MAX_PROMPT_LENGTH) {
          return jsonResponse({ success: false, error: 'Prompt too long. Maximum ' + CONFIG.MAX_PROMPT_LENGTH + ' characters.' }, 400);
        }
        if (!conversationId) {
          return jsonResponse({ success: false, error: 'Conversation ID is required' }, 400);
        }

        var resolved = resolveModel(body.model);
        var temperature = clampTemperature(body.temperature);
        var max_tokens = clampMaxTokens(body.max_tokens, resolved.maxTokens);

        var today = new Date().toISOString().split('T')[0];
        var currentUsage = await getTodayUsage(env, today);
        var estimatedNeurons = estimateNeurons(prompt.length, max_tokens);
        assertWithinNeuronBudget(currentUsage, estimatedNeurons);

        var convCheck = env.DB.prepare('SELECT id FROM conversations WHERE id = ?');
        var convExists = await convCheck.bind(conversationId).first();
        if (!convExists) {
          return jsonResponse({ success: false, error: 'Conversation not found' }, 404);
        }

        // The new message continues from wherever the conversation is
        // currently displayed (the active leaf), so sending a message after
        // switching to an older branch continues *that* branch — matching
        // claude.ai's behavior.
        var tree = await loadConversationTree(env, conversationId);
        var activePath = getActivePath(tree);
        var parentId = activePath.length ? activePath[activePath.length - 1].id : null;

        var contextMessages = activePath
          .slice(-(CONFIG.MAX_HISTORY * 2))
          .map(function (m) { return { role: m.role, content: m.content }; });
        contextMessages.push({ role: 'user', content: prompt });

        var aiResult = await runAIModel(env, resolved.model, contextMessages, temperature, max_tokens, estimatedNeurons);

        var now = Date.now();
        var insertStmt = env.DB.prepare(
          'INSERT INTO messages (conversation_id, parent_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)'
        );
        var userInsert = await insertStmt.bind(conversationId, parentId, 'user', prompt, now).run();
        var userMessageId = userInsert.meta.last_row_id;

        var linkParentStmts = [];
        if (parentId) {
          linkParentStmts.push(env.DB.prepare('UPDATE messages SET active_child_id = ? WHERE id = ?').bind(userMessageId, parentId));
        }
        if (linkParentStmts.length) await env.DB.batch(linkParentStmts);

        var assistantInsert = await insertStmt.bind(conversationId, userMessageId, 'assistant', aiResult.resultText, now + 1).run();
        var assistantMessageId = assistantInsert.meta.last_row_id;

        await env.DB.prepare('UPDATE messages SET active_child_id = ? WHERE id = ?').bind(assistantMessageId, userMessageId).run();
        await env.DB.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').bind(now, conversationId).run();
        await recordNeuronUsage(env, today, aiResult.neuronsUsed);
        var newUsage = currentUsage + aiResult.neuronsUsed;

        var payload = await buildConversationPayload(env, conversationId);

        return jsonResponse({
          success: true,
          response: aiResult.resultText,
          messages: payload.messages,
          neurons_used: aiResult.neuronsUsed,
          total_neurons_used: newUsage,
          remaining_neurons: CONFIG.DAILY_NEURON_LIMIT - newUsage
        });

      } catch (err) {
        if (err && err.status) return jsonResponse({ success: false, error: err.message }, err.status);
        return aiErrorResponse(err);
      }
    }

    // POST /api/regenerate
    if (method === 'POST' && path === '/api/regenerate') {
      try {
        var body = await request.json();
        var conversationId = body.conversation_id;
        var messageId = body.message_id;

        if (!conversationId) {
          return jsonResponse({ success: false, error: 'Conversation ID is required' }, 400);
        }
        if (!messageId) {
          return jsonResponse({ success: false, error: 'message_id is required' }, 400);
        }

        var resolved = resolveModel(body.model);
        var temperature = clampTemperature(body.temperature);
        var max_tokens = clampMaxTokens(body.max_tokens, resolved.maxTokens);

        var convCheck = env.DB.prepare('SELECT id FROM conversations WHERE id = ?');
        var convExists = await convCheck.bind(conversationId).first();
        if (!convExists) {
          return jsonResponse({ success: false, error: 'Conversation not found' }, 404);
        }

        var tree = await loadConversationTree(env, conversationId);
        var target = tree.byId[messageId];
        if (!target) {
          return jsonResponse({ success: false, error: 'Message not found in this conversation' }, 404);
        }
        if (target.role !== 'assistant') {
          return jsonResponse({ success: false, error: 'Only assistant messages can be regenerated' }, 400);
        }
        if (target.parent_id == null) {
          return jsonResponse({ success: false, error: 'This message has no preceding prompt to regenerate from' }, 400);
        }

        // The real ancestry of the message being regenerated — not the
        // currently active path — so regenerating a message on an older
        // branch still uses the context it actually belongs to.
        var ancestors = getAncestorMessages(tree, messageId);
        if (ancestors.length === 0 || ancestors[ancestors.length - 1].role !== 'user') {
          return jsonResponse({ success: false, error: 'No preceding user message to regenerate from' }, 400);
        }
        var contextMessages = ancestors.slice(-(CONFIG.MAX_HISTORY * 2));
        var promptForEstimate = contextMessages[contextMessages.length - 1].content || '';

        var today = new Date().toISOString().split('T')[0];
        var currentUsage = await getTodayUsage(env, today);
        var estimatedNeurons = estimateNeurons(promptForEstimate.length, max_tokens);
        assertWithinNeuronBudget(currentUsage, estimatedNeurons);

        var aiResult = await runAIModel(env, resolved.model, contextMessages, temperature, max_tokens, estimatedNeurons);

        // Insert the regenerated response as a NEW sibling under the same
        // parent — the original message (and anything downstream of it) is
        // left untouched and stays reachable by switching branches back.
        var now = Date.now();
        var insertStmt = env.DB.prepare(
          'INSERT INTO messages (conversation_id, parent_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)'
        );
        var insertResult = await insertStmt.bind(conversationId, target.parent_id, 'assistant', aiResult.resultText, now).run();
        var newMessageId = insertResult.meta.last_row_id;

        await env.DB.prepare('UPDATE messages SET active_child_id = ? WHERE id = ?').bind(newMessageId, target.parent_id).run();
        await env.DB.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').bind(now, conversationId).run();
        await recordNeuronUsage(env, today, aiResult.neuronsUsed);
        var newUsage = currentUsage + aiResult.neuronsUsed;

        var payload = await buildConversationPayload(env, conversationId);

        return jsonResponse({
          success: true,
          response: aiResult.resultText,
          message_id: newMessageId,
          messages: payload.messages,
          neurons_used: aiResult.neuronsUsed,
          total_neurons_used: newUsage,
          remaining_neurons: CONFIG.DAILY_NEURON_LIMIT - newUsage
        });

      } catch (err) {
        if (err && err.status) return jsonResponse({ success: false, error: err.message }, err.status);
        return aiErrorResponse(err);
      }
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders() });
  }
};
