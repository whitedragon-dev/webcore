// ============================================
// Webcore AI Worker — Polished Mobile UI
// Cloudflare Workers + D1 + Workers AI
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
var UI_HTML = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" /><title>Webcore AI</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Ubuntu,sans-serif;background:#fff;color:#1a1a1a;height:100dvh;overflow:hidden;display:flex;flex-direction:column;position:relative}.app{display:flex;height:100dvh;width:100vw;overflow:hidden;position:relative}.sidebar{position:fixed;top:0;left:0;width:280px;height:100dvh;background:#f8f8f8;border-right:1px solid #e8e8e8;display:flex;flex-direction:column;transform:translateX(-100%);transition:transform .3s cubic-bezier(.4,0,.2,1);z-index:1000;box-shadow:2px 0 12px rgba(0,0,0,0.15);padding-bottom:env(safe-area-inset-bottom)}.sidebar.open{transform:translateX(0)}.sidebar-header{padding:16px 20px;border-bottom:1px solid #e8e8e8;flex-shrink:0}.sidebar-header h2{font-size:16px;font-weight:600}.sidebar-header .sub{font-size:11px;color:#999;margin-top:2px}.sidebar-actions{padding:10px 20px;border-bottom:1px solid #e8e8e8;display:flex;gap:6px;flex-shrink:0}.sidebar-actions button{flex:1;padding:6px 10px;background:#1a1a1a;color:#fff;border:none;border-radius:6px;font-size:11px;cursor:pointer;touch-action:manipulation}.sidebar-actions button.secondary{background:#e8e8e8;color:#333}.conversation-list{flex:1;overflow-y:auto;padding:8px 0;-webkit-overflow-scrolling:touch}.conversation-item{padding:8px 16px;cursor:pointer;transition:background .15s;border-left:3px solid transparent;position:relative;touch-action:manipulation;min-height:44px}.conversation-item.active{background:#e8e8e8;border-left-color:#1a1a1a}.conversation-item .title{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:50px}.conversation-item .meta{font-size:10px;color:#999;margin-top:1px}.conversation-item .actions{position:absolute;right:6px;top:50%;transform:translateY(-50%);display:flex;gap:2px}.conversation-item .actions button{background:none;border:none;cursor:pointer;font-size:12px;padding:2px 4px;border-radius:4px;color:#999;touch-action:manipulation}.conversation-item .actions .rename-btn:hover{color:#0066cc}.conversation-item .actions .delete-btn:hover{color:#c00}.main-area{flex:1;display:flex;flex-direction:column;height:100dvh;min-width:0;position:relative;background:#fff}.header{padding:8px 12px;border-bottom:1px solid #f0f0f0;flex-shrink:0;display:flex;justify-content:space-between;align-items:center;background:#fff;z-index:10;min-height:48px}.header-left{display:flex;align-items:center;gap:6px;min-width:0}.hamburger{background:none;border:none;font-size:20px;cursor:pointer;padding:4px;touch-action:manipulation;color:#1a1a1a;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:6px;flex-shrink:0}.hamburger:active{background:#f0f0f0}.header h1{font-size:15px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px}.header .subtitle{font-size:10px;color:#999;display:inline;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80px}.header .model-badge{font-size:9px;color:#999;background:#f5f5f5;padding:2px 8px;border-radius:10px;white-space:nowrap;flex-shrink:0}.model-selector-wrap{padding:3px 12px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;gap:6px;flex-shrink:0;background:#fff;flex-wrap:wrap;min-height:30px}.model-selector-wrap label{font-size:10px;color:#888;font-weight:500}.model-selector-wrap select{padding:2px 4px;border:1px solid #e0e0e0;border-radius:4px;font-size:10px;background:#fafafa;color:#1a1a1a;cursor:pointer;outline:none;font-family:inherit;max-width:120px}.chat-container{flex:1;overflow-y:auto;padding:10px 12px 8px;display:flex;flex-direction:column;gap:8px;-webkit-overflow-scrolling:touch;scroll-behavior:smooth}.message{max-width:88%;padding:8px 12px;border-radius:10px;line-height:1.4;font-size:13px;word-wrap:break-word;animation:fadeIn .25s ease;position:relative}.message .version-nav{display:flex;align-items:center;gap:3px;margin-top:4px;padding-top:4px;border-top:1px solid #e8e8e8;justify-content:center;flex-wrap:wrap}.message .version-nav button{background:none;border:1px solid #ddd;border-radius:3px;padding:2px 6px;font-size:10px;cursor:pointer;color:#666;min-width:24px;touch-action:manipulation;height:22px}.message .version-nav button:disabled{opacity:.3;cursor:not-allowed}.message .version-nav .version-info{font-size:10px;color:#888;font-weight:500;min-width:28px;text-align:center}.message .version-nav .regenerate-btn{background:none;border:none;cursor:pointer;font-size:12px;color:#0066cc;padding:2px 4px;height:22px}.message.user{align-self:flex-end;background:#1a1a1a;color:#fff;border-bottom-right-radius:3px}.message.assistant{align-self:flex-start;background:#f5f5f5;color:#1a1a1a;border-bottom-left-radius:3px}.message .label{font-size:8px;font-weight:500;text-transform:uppercase;letter-spacing:.4px;opacity:.6;margin-bottom:1px}.message.user .label{color:#aaa}.message.assistant .label{color:#888}.message pre{background:rgba(0,0,0,0.05);padding:4px 8px;border-radius:4px;overflow-x:auto;margin:3px 0;font-size:11px;font-family:"SF Mono","Menlo","Monaco","Courier New",monospace}.message code{font-family:"SF Mono","Menlo","Monaco","Courier New",monospace;font-size:11px;background:rgba(0,0,0,0.05);padding:1px 4px;border-radius:3px}.message p{margin:2px 0}.message ul,.message ol{padding-left:16px;margin:2px 0}.message li{margin:1px 0;list-style-position:inside}.message ul li{list-style-type:disc}.message ol li{list-style-type:decimal}.message blockquote{border-left:2px solid #ccc;padding-left:8px;margin:3px 0;opacity:.8}.message h1,.message h2,.message h3,.message h4{margin:4px 0 2px 0;font-weight:600}.message h1{font-size:16px}.message h2{font-size:14px}.message h3{font-size:13px}.message table{border-collapse:collapse;width:100%;margin:3px 0;font-size:11px}.message table th,.message table td{border:1px solid #ddd;padding:2px 5px;text-align:left}.message table th{background:#f2f2f2;font-weight:600}.typing-indicator{align-self:flex-start;background:#f5f5f5;padding:6px 12px;border-radius:10px;border-bottom-left-radius:3px;display:none;gap:3px}.typing-indicator span{width:5px;height:5px;background:#999;border-radius:50%;display:inline-block;animation:bounce 1.4s infinite ease-in-out both}.typing-indicator span:nth-child(1){animation-delay:-0.32s}.typing-indicator span:nth-child(2){animation-delay:-0.16s}.typing-indicator span:nth-child(3){animation-delay:0s}@keyframes bounce{0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}.input-area{padding:6px 10px 8px;border-top:1px solid #f0f0f0;flex-shrink:0;display:flex;gap:6px;align-items:flex-end;background:#fff;padding-bottom:calc(8px + env(safe-area-inset-bottom))}.input-area textarea{flex:1;padding:6px 10px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px;font-family:inherit;resize:none;min-height:34px;max-height:80px;outline:none;transition:border .2s;line-height:1.3;background:#fafafa}.input-area textarea:focus{border-color:#1a1a1a;background:#fff}.input-area textarea::placeholder{color:#bbb}.input-area button{padding:6px 14px;background:#1a1a1a;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;height:34px;white-space:nowrap;touch-action:manipulation;flex-shrink:0}.input-area button:disabled{opacity:.4;cursor:not-allowed}.error-toast{position:fixed;bottom:60px;left:50%;transform:translateX(-50%);background:#fee;color:#c00;padding:6px 14px;border-radius:6px;font-size:11px;border:1px solid #fcc;display:none;box-shadow:0 2px 8px rgba(0,0,0,0.06);max-width:90%;z-index:2000}.error-toast.show{display:block}.neuron-dashboard{position:absolute;bottom:0;left:0;right:0;padding:6px 12px;background:#f8f8f8;border-top:1px solid #e8e8e8;flex-shrink:0}.neuron-dashboard .neuron-label{font-size:8px;color:#888;font-weight:500;margin-bottom:1px}.neuron-dashboard .neuron-bar{width:100%;height:3px;background:#e8e8e8;border-radius:2px;overflow:hidden;margin-bottom:1px}.neuron-dashboard .neuron-bar .neuron-fill{height:100%;border-radius:2px;transition:width .5s ease}.neuron-dashboard .neuron-fill.low{background:#22c55e}.neuron-dashboard .neuron-fill.medium{background:#eab308}.neuron-dashboard .neuron-fill.high{background:#ef4444}.neuron-dashboard .neuron-stats{display:flex;justify-content:space-between;font-size:8px;color:#666}.neuron-dashboard .neuron-stats .used{color:#1a1a1a;font-weight:500}.neuron-dashboard .neuron-stats .remaining{color:#22c55e;font-weight:500}.neuron-dashboard .neuron-stats .warning{color:#ef4444;font-weight:600}.sidebar-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.3);z-index:999;display:none}.sidebar-overlay.show{display:block}.modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);display:none;align-items:center;justify-content:center;z-index:3000;animation:fadeIn .2s ease}.modal-overlay.show{display:flex}.modal-box{background:#fff;border-radius:12px;padding:16px 20px;max-width:360px;width:90%;box-shadow:0 12px 40px rgba(0,0,0,0.15)}.modal-box h3{font-size:15px;font-weight:500;margin-bottom:3px}.modal-box p{font-size:12px;color:#888;margin-bottom:10px}.modal-box input{width:100%;padding:6px 10px;border:1px solid #e0e0e0;border-radius:6px;font-size:13px;outline:none;margin-bottom:10px}.modal-box input:focus{border-color:#1a1a1a}.modal-box .modal-actions{display:flex;gap:6px;justify-content:flex-end}.modal-box .modal-actions button{padding:5px 12px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;border:none;touch-action:manipulation}.modal-box .modal-actions .cancel-btn{background:#f0f0f0;color:#555}.modal-box .modal-actions .confirm-btn{background:#1a1a1a;color:#fff}.modal-box .modal-actions .danger-btn{background:#c00;color:#fff}.scroll-to-bottom{position:fixed;bottom:70px;right:16px;background:#fff;border:1px solid #e0e0e0;border-radius:50%;width:36px;height:36px;display:none;align-items:center;justify-content:center;font-size:18px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.1);z-index:50;touch-action:manipulation}.scroll-to-bottom.show{display:flex}.scroll-to-bottom:active{transform:scale(.95)}@media(min-width:768px){.sidebar{position:relative;transform:translateX(0);width:280px;box-shadow:none;border-right:1px solid #e8e8e8;padding-bottom:0}.sidebar-overlay{display:none!important}.hamburger{display:none}.main-area{flex:1}.header h1{font-size:18px;max-width:none}.header .subtitle{font-size:12px;max-width:none}.message{max-width:80%;font-size:15px;padding:10px 16px}.message .version-nav button{font-size:12px;padding:3px 10px;height:auto}.input-area textarea{font-size:14px;min-height:44px;padding:8px 14px}.input-area button{font-size:14px;height:44px;padding:8px 24px}.model-selector-wrap select{font-size:12px;max-width:160px}.chat-container{padding:16px 24px}.header{padding:12px 24px}}@media(max-width:767px){.sidebar{position:fixed;width:280px;box-shadow:2px 0 12px rgba(0,0,0,0.15)}.sidebar-overlay{display:none}.sidebar-overlay.show{display:block}.hamburger{display:flex}.header h1{font-size:14px;max-width:90px}.header .subtitle{display:none}.message{max-width:92%;font-size:12px;padding:6px 10px}.input-area{padding:4px 8px 6px}.input-area textarea{font-size:12px;min-height:30px;padding:4px 8px}.input-area button{font-size:12px;height:30px;padding:4px 10px}.model-selector-wrap{padding:2px 8px}.model-selector-wrap select{font-size:9px;max-width:90px}.neuron-dashboard{padding:4px 8px}.chat-container{padding:6px 8px 4px}.scroll-to-bottom{bottom:60px;right:12px;width:32px;height:32px;font-size:16px}}@media(max-width:480px){.sidebar{width:85%;max-width:280px}.message{max-width:95%;font-size:11px;padding:5px 8px}.message .label{font-size:7px}.message pre{font-size:10px;padding:3px 6px}.message code{font-size:10px}.message .version-nav button{font-size:9px;padding:1px 5px;min-width:20px;height:18px}.message .version-nav .version-info{font-size:9px;min-width:24px}.message .version-nav .regenerate-btn{font-size:11px;height:18px}.header h1{font-size:13px;max-width:70px}.header .model-badge{font-size:8px;padding:1px 6px}.input-area textarea{font-size:11px;min-height:28px;padding:3px 6px}.input-area button{font-size:11px;height:28px;padding:3px 8px}.modal-box{padding:14px 16px}.modal-box h3{font-size:14px}.modal-box input{font-size:11px;padding:4px 8px}.neuron-dashboard .neuron-stats{font-size:7px}.scroll-to-bottom{bottom:54px;right:10px;width:28px;height:28px;font-size:14px}}.no-scrollbar::-webkit-scrollbar{width:0;height:0}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}</style></head><body>' +
'<div class="sidebar-overlay" id="sidebarOverlay"></div>' +
'<div class="modal-overlay" id="modalOverlay"><div class="modal-box"><h3 id="modalTitle">New Chat</h3><p id="modalSubtitle">Enter a name for this conversation</p><input type="text" id="modalInput" placeholder="Conversation name..." maxlength="100" /><div class="modal-actions"><button class="cancel-btn" id="modalCancel">Cancel</button><button class="confirm-btn" id="modalConfirm">Create</button></div></div></div>' +
'<div class="modal-overlay" id="deleteModalOverlay"><div class="modal-box"><h3 id="deleteModalTitle">Delete Conversation</h3><p id="deleteModalSubtitle">Are you sure you want to delete this conversation?</p><div class="modal-actions"><button class="cancel-btn" id="deleteModalCancel">Cancel</button><button class="danger-btn" id="deleteModalConfirm">Delete</button></div></div></div>' +
'<div class="app"><div class="sidebar" id="sidebar"><div class="sidebar-header"><h2>Conversations</h2><div class="sub">Your chat history</div></div><div class="sidebar-actions"><button id="newChatBtn">+ New Chat</button><button class="secondary" id="refreshBtn">⟳</button></div><div class="conversation-list" id="conversationList"></div>' +
'<div class="neuron-dashboard" id="neuronDashboard"><div class="neuron-label">⚡ Today\'s Neurons</div><div class="neuron-bar"><div class="neuron-fill low" id="neuronFill" style="width:0%"></div></div><div class="neuron-stats"><span>Used: <span class="used" id="neuronUsed">0</span></span><span>Remaining: <span class="remaining" id="neuronRemaining">10,000</span></span></div></div></div>' +
'<div class="main-area"><div class="header"><div class="header-left"><button class="hamburger" id="hamburgerBtn">☰</button><div><h1 id="chatTitle">Webcore AI</h1><div class="subtitle" id="chatSubtitle">Select or start</div></div></div><span class="model-badge" id="modelBadge">Llama 4</span></div><div class="model-selector-wrap"><label for="modelSelect">Model</label><select class="model-selector" id="modelSelect"><option value="@cf/meta/llama-4-scout-17b-16e-instruct">Llama 4 Scout</option><option value="@cf/openai/gpt-oss-120b">GPT-OSS 120B</option><option value="@cf/google/gemma-4-26b-a4b-it">Gemma 4 26B</option><option value="@cf/zai-org/glm-4.7-flash">GLM 4.7</option><option value="@cf/qwen/qwen3.8-27b">Qwen 3.8</option></select></div>' +
'<div class="chat-container no-scrollbar" id="chatContainer"></div><div class="typing-indicator" id="typingIndicator"><span></span><span></span><span></span></div><div class="error-toast" id="errorToast"></div><div class="input-area"><textarea id="userInput" rows="1" placeholder="Type a message..." maxlength="2000"></textarea><button id="sendBtn">Send</button></div></div></div>' +
'<button class="scroll-to-bottom" id="scrollBtn" title="Scroll to bottom">↓</button><script>' +
'var chatContainer=document.getElementById("chatContainer"),userInput=document.getElementById("userInput"),sendBtn=document.getElementById("sendBtn"),conversationList=document.getElementById("conversationList"),newChatBtn=document.getElementById("newChatBtn"),refreshBtn=document.getElementById("refreshBtn"),hamburgerBtn=document.getElementById("hamburgerBtn"),sidebar=document.getElementById("sidebar"),sidebarOverlay=document.getElementById("sidebarOverlay"),typingIndicator=document.getElementById("typingIndicator"),errorToast=document.getElementById("errorToast"),chatTitle=document.getElementById("chatTitle"),chatSubtitle=document.getElementById("chatSubtitle"),modelBadge=document.getElementById("modelBadge"),modalOverlay=document.getElementById("modalOverlay"),modalTitle=document.getElementById("modalTitle"),modalSubtitle=document.getElementById("modalSubtitle"),modalInput=document.getElementById("modalInput"),modalConfirm=document.getElementById("modalConfirm"),modalCancel=document.getElementById("modalCancel"),deleteModalOverlay=document.getElementById("deleteModalOverlay"),deleteModalConfirm=document.getElementById("deleteModalConfirm"),deleteModalCancel=document.getElementById("deleteModalCancel"),modelSelect=document.getElementById("modelSelect"),neuronFill=document.getElementById("neuronFill"),neuronUsed=document.getElementById("neuronUsed"),neuronRemaining=document.getElementById("neuronRemaining"),scrollBtn=document.getElementById("scrollBtn"),isProcessing=!1,currentConversationId=null,conversationHistory=[],modalResolve=null,deleteResolve=null,totalNeuronsUsed=0;' +
'var MODEL_NAMES={"@cf/meta/llama-4-scout-17b-16e-instruct":"Llama 4","@cf/openai/gpt-oss-120b":"GPT-OSS 120B","@cf/google/gemma-4-26b-a4b-it":"Gemma 4","@cf/zai-org/glm-4.7-flash":"GLM 4.7","@cf/qwen/qwen3.8-27b":"Qwen 3.8"};' +
'var DAILY_LIMIT=10000;var currentVersionIndex=0;var versionHistory=[];' +
'function updateNeuronDisplay(e){totalNeuronsUsed=e;var t=Math.max(0,DAILY_LIMIT-e),n=Math.min(100,(e/DAILY_LIMIT)*100);neuronUsed.textContent=e.toLocaleString();neuronRemaining.textContent=t.toLocaleString();neuronFill.style.width=n+"%";neuronFill.className="neuron-fill"+(n<50?" low":n<80?" medium":" high");if(n>=90){neuronRemaining.className="remaining warning"}else{neuronRemaining.className="remaining"}}' +
'function loadNeuronUsage(){apiRequest("/api/neurons","GET").then(function(e){if(e.success){updateNeuronDisplay(e.used||0)}}).catch(function(e){console.error(e)})}' +
'function showModal(e,t,n,r){return new Promise(function(a){modalTitle.textContent=e;modalSubtitle.textContent=t;modalInput.placeholder=n||"Enter name...";modalInput.value="";modalConfirm.textContent=r||"Create";modalOverlay.classList.add("show");setTimeout(function(){modalInput.focus()},100);modalResolve=a})}function hideModal(){modalOverlay.classList.remove("show");modalResolve&&(modalResolve(null),modalResolve=null)}function showDeleteModal(){return new Promise(function(e){deleteModalOverlay.classList.add("show");deleteResolve=e})}function hideDeleteModal(){deleteModalOverlay.classList.remove("show");deleteResolve&&(deleteResolve(!1),deleteResolve=null)}' +
'modalCancel.addEventListener("click",hideModal);modalOverlay.addEventListener("click",function(e){e.target===modalOverlay&&hideModal()});modalInput.addEventListener("keydown",function(e){if(e.key==="Enter"){e.preventDefault();var t=modalInput.value.trim();if(t){modalOverlay.classList.remove("show");modalResolve&&(modalResolve(t),modalResolve=null)}}if(e.key==="Escape")hideModal()});modalConfirm.addEventListener("click",function(){var e=modalInput.value.trim();if(e){modalOverlay.classList.remove("show");modalResolve&&(modalResolve(e),modalResolve=null)}});' +
'deleteModalCancel.addEventListener("click",function(){deleteModalOverlay.classList.remove("show");deleteResolve&&(deleteResolve(!1),deleteResolve=null)});deleteModalOverlay.addEventListener("click",function(e){e.target===deleteModalOverlay&&(deleteModalOverlay.classList.remove("show"),deleteResolve&&(deleteResolve(!1),deleteResolve=null))});deleteModalConfirm.addEventListener("click",function(){deleteModalOverlay.classList.remove("show");deleteResolve&&(deleteResolve(!0),deleteResolve=null)});' +
'function toggleSidebar(){sidebar.classList.toggle("open");sidebarOverlay.classList.toggle("show")}function closeSidebar(){sidebar.classList.remove("open");sidebarOverlay.classList.remove("show")}hamburgerBtn.addEventListener("click",toggleSidebar);sidebarOverlay.addEventListener("click",closeSidebar);' +
'function renderMarkdown(e){if(!e)return"";var t=e;t=t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");var n=t.split("\\n"),r=[],a=!1,o="",l=!1,s=[],i=0;while(i<n.length){var c=n[i];if(""===c.trim()){a&&("ul"===o?r.push("</ul>"):"ol"===o&&r.push("</ol>"),a=!1,o="");i++;continue}if(c.match(/^```/)){if(l){l=!1;r.push("<pre><code>"+s.join("\\n").trim()+"</code></pre>")}else{l=!0;s=[]}i++;continue}if(l){s.push(c);i++;continue}if(c.match(/^### /)){r.push("<h3>"+c.replace(/^### /,"")+"</h3>");i++;continue}if(c.match(/^## /)){r.push("<h2>"+c.replace(/^## /,"")+"</h2>");i++;continue}if(c.match(/^# /)){r.push("<h1>"+c.replace(/^# /,"")+"</h1>");i++;continue}if(c.match(/^> /)){r.push("<blockquote>"+c.replace(/^> /,"")+"</blockquote>");i++;continue}if(c.match(/^\\|/)){var d=[],u=!1;while(i<n.length&&n[i].match(/^\\|/)){var p=n[i].split("|").filter(function(e){return e.trim()!=""});d.push(p.map(function(e){return e.trim()}));if(!u&&i+1<n.length&&n[i+1].match(/^\\|/)){var h=n[i+1].split("|").filter(function(e){return e.trim()!=""});if(h.every(function(e){return e.match(/^[\\s\\-:]+$/)||e.match(/^[:\\-]+$/)||e.match(/^\\-+$/)})){u=!0;i++}}i++}var m="<table>";if(d.length>0){m+="<thead><tr>";for(var f=0;f<d[0].length;f++){m+="<th>"+d[0][f]+"</th>"}m+="</tr></thead><tbody>";for(var v=1;v<d.length;v++){m+="<tr>";for(var g=0;g<d[v].length;g++){m+="<td>"+d[v][g]+"</td>"}m+="</tr>"}m+="</tbody>"}m+="</table>";r.push(m);continue}if(c.match(/^\\s*[-*+]\\s/)){a&&"ul"!==o&&(r.push("</ul>"),a=!1,o="");a||(r.push("<ul>"),a=!0,o="ul");r.push("<li>"+c.replace(/^\\s*[-*+]\\s/,"")+"</li>");i++;continue}if(c.match(/^\\s*\\d+\\.\\s/)){a&&"ol"!==o&&(r.push("</ol>"),a=!1,o="");a||(r.push("<ol>"),a=!0,o="ol");r.push("<li>"+c.replace(/^\\s*\\d+\\.\\s/,"")+"</li>");i++;continue}if(a){if("ul"===o)r.push("</ul>");else if("ol"===o)r.push("</ol>");a=!1;o=""}r.push("<p>"+c+"</p>");i++}a&&("ul"===o?r.push("</ul>"):"ol"===o&&r.push("</ol>"));return(t=r.join("")).replace(/`([^`]+)`/g,"<code>$1</code>").replace(/\\*\\*([^*]+)\\*\\*/g,"<strong>$1</strong>").replace(/\\*([^*]+)\\*/g,"<em>$1</em>").replace(/\\n/g,"<br>")}' +
'function apiRequest(e,t,n){return fetch(e,{method:t,headers:{"Content-Type":"application/json"},body:n?JSON.stringify(n):null}).then(function(e){return e.json()})}' +
'function loadConversations(){apiRequest("/api/conversations","GET").then(function(e){e.success&&renderConversationList(e.conversations)}).catch(function(e){console.error(e)})}' +
'function loadConversation(e){apiRequest("/api/conversations/"+e,"GET").then(function(t){if(t.success){currentConversationId=e;conversationHistory=t.messages||[];renderMessages(conversationHistory);chatTitle.textContent=t.title||"Conversation";chatSubtitle.textContent=(t.messages?t.messages.length:0)+" messages";highlightConversation(e);closeSidebar()}}).catch(function(e){console.error(e)})}' +
'async function createNewConversation(){var e=await showModal("New Chat","Enter a name for this conversation","Conversation name...","Create");if(e){apiRequest("/api/conversations","POST",{title:e}).then(function(e){if(e.success){loadConversations();loadConversation(e.id)}}).catch(function(e){console.error(e)})}}' +
'async function renameConversation(e,t){var n=await showModal("Rename Chat","Enter a new name for this conversation",t||"Untitled","Rename");if(n&&n.trim()){apiRequest("/api/conversations/"+e,"PUT",{title:n.trim()}).then(function(t){if(t.success){if(currentConversationId===e)chatTitle.textContent=t.title;loadConversations()}}).catch(function(e){console.error(e)})}}' +
'async function deleteConversation(e){var t=await showDeleteModal();if(t){apiRequest("/api/conversations/"+e,"DELETE").then(function(t){if(t.success){if(currentConversationId===e){currentConversationId=null;chatContainer.innerHTML="";chatTitle.textContent="Webcore AI";chatSubtitle.textContent="Select or start"}loadConversations();var n=conversationList.querySelectorAll(".conversation-item");if(n.length>0)loadConversation(n[0].dataset.id)}}).catch(function(e){console.error(e)})}}' +
'function navigateVersion(e){var t=versionHistory.length;if(t===0)return;var n=currentVersionIndex+e;if(n<0||n>=t)return;currentVersionIndex=n;var r=document.querySelector(".message.assistant:last-child");if(!r)return;var a=r.querySelector(".message-content");if(!a)return;var o=versionHistory[currentVersionIndex];a.innerHTML=renderMarkdown(o);var l=currentVersionIndex+1+"/"+t;var s=r.querySelector(".version-info");if(s)s.textContent=l;var i=r.querySelector(".nav-prev"),c=r.querySelector(".nav-next");if(i)i.disabled=currentVersionIndex===0;if(c)c.disabled=currentVersionIndex===t-1}' +
'function regenerateMessage(){var e=chatContainer.querySelectorAll(".message");if(e.length<2){showError("Not enough messages to regenerate");return}var t=chatContainer.querySelectorAll(".message.assistant");if(t.length===0){showError("No assistant messages to regenerate");return}var n=t[t.length-1];var r=-1;for(var a=0;a<e.length;a++){if(e[a]===n){r=a;break}}if(r===-1||r===0){showError("Could not find the previous user message");return}var o=null,l="";for(var s=r-1;s>=0;s--){if(e[s].classList.contains("user")){o=e[s];var i=o.querySelector("div:last-child");if(i){l=i.textContent.trim()}break}}if(!o||!l){showError("Could not find the previous user message");return}var c=[];for(var d=0;d<r-1;d++){var u=e[d],p=u.classList.contains("user")?"user":"assistant",h=u.querySelector("div:last-child");if(h){var m=h.textContent.trim();if(m){c.push({role:p,content:m})}}}var f=currentConversationId;if(!f){showError("No conversation selected");return}var v=modelSelect.value;var g=n.querySelector(".message-content");if(g){var y=g.textContent;if(y){versionHistory.push(y)}}var b=n.querySelector(".version-nav");if(b){n.removeChild(b)}var w=n.querySelector(".message-content");if(w){w.innerHTML="<p>Regenerating...</p>"}isProcessing=!0;apiRequest("/api/regenerate","POST",{conversation_id:f,history:c,prompt:l,model:v,temperature:.7,max_tokens:1e3}).then(function(e){if(e.success){var t=document.querySelector(".message.assistant:last-child");if(t){var n=t.querySelector(".message-content");if(n){n.innerHTML=renderMarkdown(e.response);versionHistory.push(e.response);currentVersionIndex=versionHistory.length-1;var r=document.createElement("div");r.className="version-nav";var a=document.createElement("button");a.className="nav-prev";a.textContent="←";a.title="Previous";a.disabled=versionHistory.length<=1;var o=document.createElement("span");o.className="version-info";o.textContent=(currentVersionIndex+1)+"/"+versionHistory.length;var l=document.createElement("button");l.className="nav-next";l.textContent="→";l.title="Next";l.disabled=versionHistory.length<=1;var s=document.createElement("button");s.textContent="⟳";s.title="Regenerate";s.style.border="none";s.style.background="none";s.style.color="#0066cc";s.style.cursor="pointer";s.style.fontSize="12px";s.onclick=function(){regenerateMessage()};a.onclick=function(){navigateVersion(-1)};l.onclick=function(){navigateVersion(1)};r.appendChild(a);r.appendChild(o);r.appendChild(l);r.appendChild(s);t.appendChild(r)}}loadConversations();loadNeuronUsage();showError(null)}else{showError(e.error||"Failed to regenerate");loadConversation(f)}}).catch(function(e){showError(e.message||"Error regenerating");loadConversation(f)}).finally(function(){isProcessing=!1})}' +
'function renderConversationList(e){conversationList.innerHTML="";if(!e||0===e.length){conversationList.innerHTML=\'<div style="padding:16px;text-align:center;color:#999;font-size:12px;">No conversations yet</div>\';return}for(var t=0;t<e.length;t++){var n=e[t],r=document.createElement("div");r.className="conversation-item";r.dataset.id=n.id;if(n.id===currentConversationId)r.classList.add("active");var a=document.createElement("div");a.className="title";a.textContent=n.title||"Untitled";var o=document.createElement("div");o.className="meta";var l=new Date(n.updated_at);o.textContent=l.toLocaleDateString()+" · "+(n.message_count||0)+" msgs";var s=document.createElement("div");s.className="actions";var i=document.createElement("button");i.className="rename-btn";i.textContent="\u271e";i.title="Rename";i.onclick=function(e){e.stopPropagation();var t=this.closest(".conversation-item").dataset.id;renameConversation(t)};var d=document.createElement("button");d.className="delete-btn";d.textContent="\u2715";d.title="Delete";d.onclick=function(e){e.stopPropagation();var t=this.closest(".conversation-item").dataset.id;deleteConversation(t)};s.appendChild(i);s.appendChild(d);r.appendChild(a);r.appendChild(o);r.appendChild(s);r.onclick=function(){loadConversation(this.dataset.id)};conversationList.appendChild(r)}}' +
'function renderMessages(e){chatContainer.innerHTML="";versionHistory=[];currentVersionIndex=0;if(!e||0===e.length){var t=document.createElement("div");t.className="message assistant";var n=document.createElement("div");n.className="label";n.textContent="Assistant";var r=document.createElement("div");r.className="message-content";r.innerHTML="<p>Start a conversation!</p>";t.appendChild(n);t.appendChild(r);chatContainer.appendChild(t);return}for(var a=0;a<e.length;a++){var o=e[a];addMessageDOM(o.role,o.content,a===e.length-1&&o.role==="assistant")}chatContainer.scrollTop=chatContainer.scrollHeight;updateScrollButton()}' +
'function addMessageDOM(e,t,n){var r=document.createElement("div");r.className="message "+e;var a=document.createElement("div");a.className="label";a.textContent=e==="user"?"You":"Assistant";var o=document.createElement("div");o.className="message-content";if(e==="assistant")o.innerHTML=renderMarkdown(t);else o.textContent=t;r.appendChild(a);r.appendChild(o);if(e==="assistant"&&n){versionHistory=[t];currentVersionIndex=0;var l=document.createElement("div");l.className="version-nav";var s=document.createElement("button");s.className="nav-prev";s.textContent="←";s.title="Previous";s.disabled=!0;var i=document.createElement("span");i.className="version-info";i.textContent="1/1";var d=document.createElement("button");d.className="nav-next";d.textContent="→";d.title="Next";d.disabled=!0;var u=document.createElement("button");u.textContent="⟳";u.title="Regenerate";u.style.border="none";u.style.background="none";u.style.color="#0066cc";u.style.cursor="pointer";u.style.fontSize="12px";u.onclick=function(){regenerateMessage()};l.appendChild(s);l.appendChild(i);l.appendChild(d);l.appendChild(u);r.appendChild(l)}chatContainer.appendChild(r);chatContainer.scrollTop=chatContainer.scrollHeight;updateScrollButton()}' +
'function highlightConversation(e){var t=conversationList.querySelectorAll(".conversation-item");for(var n=0;n<t.length;n++){t[n].classList.toggle("active",t[n].dataset.id===e)}}' +
'function showTyping(e){typingIndicator.style.display=e?"flex":"none";if(e)chatContainer.scrollTop=chatContainer.scrollHeight}' +
'function showError(e){if(e){errorToast.textContent="⚠️ "+e;errorToast.classList.add("show");setTimeout(function(){errorToast.classList.remove("show")},4000)}else{errorToast.classList.remove("show")}}' +
'function updateModelBadge(e){var t=MODEL_NAMES[e]||e.split("/").pop();modelBadge.textContent=t}' +
'function updateScrollButton(){if(!chatContainer)return;var e=chatContainer.scrollHeight-chatContainer.clientHeight-chatContainer.scrollTop;e>20?scrollBtn.classList.add("show"):scrollBtn.classList.remove("show")}chatContainer.addEventListener("scroll",updateScrollButton);scrollBtn.addEventListener("click",function(){chatContainer.scrollTo({top:chatContainer.scrollHeight,behavior:"smooth"})});' +
'function sendMessage(){var e=userInput.value.trim();if(!e||isProcessing)return;if(!currentConversationId){showError("Please create or select a conversation first");return}var t=modelSelect.value;addMessageDOM("user",e);userInput.value="";userInput.style.height="auto";isProcessing=!0;sendBtn.disabled=!0;showTyping(!0);updateModelBadge(t);apiRequest("/api/chat","POST",{conversation_id:currentConversationId,prompt:e,model:t,temperature:.7,max_tokens:1e3}).then(function(t){if(t.success){addMessageDOM("assistant",t.response,!0);conversationHistory=t.messages||[];loadConversations();chatSubtitle.textContent=conversationHistory.length+" messages";if(t.neurons_used!==undefined){loadNeuronUsage()}showError(null)}else{showError(t.error||"AI request failed")}}).catch(function(e){showError(e.message||"Error sending message")}).finally(function(){isProcessing=!1;sendBtn.disabled=!1;showTyping(!1);userInput.focus()})}' +
'userInput.addEventListener("input",function(){userInput.style.height="auto";userInput.style.height=Math.min(userInput.scrollHeight,80)+"px"});userInput.addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage()}});sendBtn.addEventListener("click",sendMessage);newChatBtn.addEventListener("click",createNewConversation);refreshBtn.addEventListener("click",function(){loadConversations();loadNeuronUsage()});modelSelect.addEventListener("change",function(){updateModelBadge(this.value)});updateModelBadge(modelSelect.value);loadConversations();loadNeuronUsage();userInput.focus();setTimeout(function(){var e=conversationList.querySelectorAll(".conversation-item");if(e.length>0)loadConversation(e[0].dataset.id)},300);' +
'</script></body></html>';

// ============================================
// DATABASE INITIALIZATION
// ============================================

async function initDatabase(env) {
  try {
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, title TEXT, created_at INTEGER, updated_at INTEGER)'
    ).run();
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id TEXT, role TEXT, content TEXT, timestamp INTEGER, FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE)'
    ).run();
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS neuron_usage (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT UNIQUE, used INTEGER DEFAULT 0)'
    ).run();
    await env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id)'
    ).run();
    return true;
  } catch (err) {
    console.error('Database init error:', err);
    return false;
  }
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
        var stmt = env.DB.prepare('SELECT used FROM neuron_usage WHERE date = ?');
        var result = await stmt.bind(today).first();
        return Response.json({
          success: true,
          used: result ? result.used : 0,
          limit: CONFIG.DAILY_NEURON_LIMIT
        }, {
          headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
        });
      } catch (err) {
        return Response.json({
          success: false,
          error: err.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
        });
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
        return Response.json({
          success: true,
          conversations: result.results || []
        }, {
          headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
        });
      } catch (err) {
        return Response.json({
          success: false,
          error: err.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
        });
      }
    }

    // POST /api/conversations
    if (method === 'POST' && path === '/api/conversations') {
      try {
        var body = await request.json();
        var id = crypto.randomUUID();
        var title = body.title || 'New Chat';
        var now = Date.now();
        var stmt = env.DB.prepare(
          'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)'
        );
        await stmt.bind(id, title, now, now).run();
        return Response.json({
          success: true,
          id: id,
          title: title
        }, {
          headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
        });
      } catch (err) {
        return Response.json({
          success: false,
          error: err.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
        });
      }
    }

    // PUT /api/conversations/:id
    if (method === 'PUT' && path.match(/^\/api\/conversations\/[^\/]+$/)) {
      try {
        var id = path.split('/').pop();
        var body = await request.json();
        var newTitle = body.title || 'Untitled';
        var now = Date.now();
        var stmt = env.DB.prepare(
          'UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?'
        );
        await stmt.bind(newTitle, now, id).run();
        return Response.json({
          success: true,
          id: id,
          title: newTitle
        }, {
          headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
        });
      } catch (err) {
        return Response.json({
          success: false,
          error: err.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
        });
      }
    }

    // GET /api/conversations/:id
    if (method === 'GET' && path.match(/^\/api\/conversations\/[^\/]+$/)) {
      try {
        var id = path.split('/').pop();
        var convStmt = env.DB.prepare('SELECT * FROM conversations WHERE id = ?');
        var convResult = await convStmt.bind(id).first();
        if (!convResult) {
          return Response.json({
            success: false,
            error: 'Conversation not found'
          }, {
            status: 404,
            headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
          });
        }
        var msgStmt = env.DB.prepare(
          'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id ASC LIMIT ?'
        );
        var msgResult = await msgStmt.bind(id, CONFIG.MAX_HISTORY * 2).all();
        return Response.json({
          success: true,
          id: convResult.id,
          title: convResult.title,
          messages: msgResult.results || []
        }, {
          headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
        });
      } catch (err) {
        return Response.json({
          success: false,
          error: err.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
        });
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
        return Response.json({
          success: true
        }, {
          headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
        });
      } catch (err) {
        return Response.json({
          success: false,
          error: err.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
        });
      }
    }

    // POST /api/chat
    if (method === 'POST' && path === '/api/chat') {
      try {
        var body = await request.json();
        var conversationId = body.conversation_id;
        var prompt = body.prompt ? body.prompt.trim() : '';
        var requestedModel = body.model || CONFIG.MODEL;

        if (!prompt) {
          return Response.json({ success: false, error: 'Prompt is required' }, {
            status: 400,
            headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
          });
        }

        if (prompt.length > CONFIG.MAX_PROMPT_LENGTH) {
          return Response.json({ success: false, error: 'Prompt too long. Maximum ' + CONFIG.MAX_PROMPT_LENGTH + ' characters.' }, {
            status: 400,
            headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
          });
        }

        if (!conversationId) {
          return Response.json({ success: false, error: 'Conversation ID is required' }, {
            status: 400,
            headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
          });
        }

        var modelConfig = FREE_MODELS[requestedModel];
        if (!modelConfig) {
          return Response.json({ success: false, error: 'Model is not available on this deployment.' }, {
            status: 400,
            headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
          });
        }

        var model = requestedModel;
        var maxTokens = modelConfig.maxTokens;
        var temperature = Math.min(Math.max(Number(body.temperature ?? CONFIG.TEMPERATURE), 0), 2);
        var max_tokens = Math.min(Math.max(Number(body.max_tokens ?? maxTokens), 1), maxTokens);

        var today = new Date().toISOString().split('T')[0];
        var usageStmt = env.DB.prepare('SELECT used FROM neuron_usage WHERE date = ?');
        var usageResult = await usageStmt.bind(today).first();
        var currentUsage = usageResult ? usageResult.used : 0;
        var estimatedNeurons = Math.ceil((prompt.length / 4) * 0.1 + max_tokens * 0.2);
        
        if (currentUsage + estimatedNeurons > CONFIG.DAILY_NEURON_LIMIT) {
          return Response.json({ success: false, error: 'Daily neuron limit exceeded. You have ' + (CONFIG.DAILY_NEURON_LIMIT - currentUsage) + ' neurons remaining.' }, {
            status: 429,
            headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
          });
        }

        var convCheck = env.DB.prepare('SELECT id FROM conversations WHERE id = ?');
        var convExists = await convCheck.bind(conversationId).first();
        if (!convExists) {
          return Response.json({ success: false, error: 'Conversation not found' }, {
            status: 404,
            headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
          });
        }

        var historyStmt = env.DB.prepare(
          'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?'
        );
        var historyResult = await historyStmt.bind(conversationId, CONFIG.MAX_HISTORY * 2).all();
        var history = (historyResult.results || []).reverse();

        var messages = [];
        for (var i = 0; i < history.length; i++) {
          messages.push({ role: history[i].role, content: history[i].content });
        }
        messages.push({ role: 'user', content: prompt });

        var response = await env.AI.run(model, {
          messages: messages,
          temperature: temperature,
          max_tokens: max_tokens
        });

        var resultText = '';
        var neuronsUsed = 0;
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
          neuronsUsed = estimatedNeurons;
        }

        var now = Date.now();
        var userStmt = env.DB.prepare(
          'INSERT INTO messages (conversation_id, role, content, timestamp) VALUES (?, ?, ?, ?)'
        );
        var updateStmt = env.DB.prepare(
          'UPDATE conversations SET updated_at = ? WHERE id = ?'
        );

        var batch = env.DB.batch([
          userStmt.bind(conversationId, 'user', prompt, now),
          userStmt.bind(conversationId, 'assistant', resultText, now + 1),
          updateStmt.bind(now, conversationId)
        ]);
        await batch;

        var newUsage = currentUsage + neuronsUsed;
        var upsertStmt = env.DB.prepare(
          'INSERT INTO neuron_usage (date, used) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET used = used + ?'
        );
        await upsertStmt.bind(today, neuronsUsed, neuronsUsed).run();

        var allMessages = [];
        for (var j = 0; j < history.length; j++) {
          allMessages.push({ role: history[j].role, content: history[j].content });
        }
        allMessages.push({ role: 'user', content: prompt });
        allMessages.push({ role: 'assistant', content: resultText });

        return Response.json({
          success: true,
          response: resultText,
          messages: allMessages,
          neurons_used: neuronsUsed,
          total_neurons_used: newUsage,
          remaining_neurons: CONFIG.DAILY_NEURON_LIMIT - newUsage
        }, {
          headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
        });

      } catch (err) {
        var isLicenseError = err.message && (err.message.includes('403') || err.message.includes('license'));
        var status = isLicenseError ? 403 : 500;
        var message = isLicenseError
          ? 'Model license not accepted. Visit Cloudflare dashboard > AI > Models and agree to terms.'
          : err.message || 'AI service error';

        return Response.json({
          success: false,
          error: message
        }, {
          status: status,
          headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
        });
      }
    }

    // POST /api/regenerate
    if (method === 'POST' && path === '/api/regenerate') {
      try {
        var body = await request.json();
        var conversationId = body.conversation_id;
        var prompt = body.prompt ? body.prompt.trim() : '';
        var history = body.history || [];
        var requestedModel = body.model || CONFIG.MODEL;

        if (!prompt) {
          return Response.json({ success: false, error: 'Prompt is required' }, {
            status: 400,
            headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
          });
        }

        if (!conversationId) {
          return Response.json({ success: false, error: 'Conversation ID is required' }, {
            status: 400,
            headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
          });
        }

        var modelConfig = FREE_MODELS[requestedModel];
        if (!modelConfig) {
          return Response.json({ success: false, error: 'Model is not available on this deployment.' }, {
            status: 400,
            headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
          });
        }

        var model = requestedModel;
        var maxTokens = modelConfig.maxTokens;
        var temperature = Math.min(Math.max(Number(body.temperature ?? CONFIG.TEMPERATURE), 0), 2);
        var max_tokens = Math.min(Math.max(Number(body.max_tokens ?? maxTokens), 1), maxTokens);

        var today = new Date().toISOString().split('T')[0];
        var usageStmt = env.DB.prepare('SELECT used FROM neuron_usage WHERE date = ?');
        var usageResult = await usageStmt.bind(today).first();
        var currentUsage = usageResult ? usageResult.used : 0;
        var estimatedNeurons = Math.ceil((prompt.length / 4) * 0.1 + max_tokens * 0.2);

        if (currentUsage + estimatedNeurons > CONFIG.DAILY_NEURON_LIMIT) {
          return Response.json({ success: false, error: 'Daily neuron limit exceeded. You have ' + (CONFIG.DAILY_NEURON_LIMIT - currentUsage) + ' neurons remaining.' }, {
            status: 429,
            headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
          });
        }

        var convCheck = env.DB.prepare('SELECT id FROM conversations WHERE id = ?');
        var convExists = await convCheck.bind(conversationId).first();
        if (!convExists) {
          return Response.json({ success: false, error: 'Conversation not found' }, {
            status: 404,
            headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
          });
        }

        var messages = [];
        for (var i = 0; i < history.length; i++) {
          messages.push({ role: history[i].role, content: history[i].content });
        }
        messages.push({ role: 'user', content: prompt });

        var response = await env.AI.run(model, {
          messages: messages,
          temperature: temperature,
          max_tokens: max_tokens
        });

        var resultText = '';
        var neuronsUsed = 0;
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
          neuronsUsed = estimatedNeurons;
        }

        // Delete the old assistant message
        var delStmt = env.DB.prepare(
          'DELETE FROM messages WHERE conversation_id = ? AND role = "assistant" AND id = (' +
          'SELECT id FROM messages WHERE conversation_id = ? AND role = "assistant" ORDER BY id DESC LIMIT 1' +
          ')'
        );
        await delStmt.bind(conversationId, conversationId).run();

        // Save new assistant message
        var now = Date.now();
        var userStmt = env.DB.prepare(
          'INSERT INTO messages (conversation_id, role, content, timestamp) VALUES (?, ?, ?, ?)'
        );
        var updateStmt = env.DB.prepare(
          'UPDATE conversations SET updated_at = ? WHERE id = ?'
        );

        await userStmt.bind(conversationId, 'assistant', resultText, now + 1).run();
        await updateStmt.bind(now, conversationId).run();

        var newUsage = currentUsage + neuronsUsed;
        var upsertStmt = env.DB.prepare(
          'INSERT INTO neuron_usage (date, used) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET used = used + ?'
        );
        await upsertStmt.bind(today, neuronsUsed, neuronsUsed).run();

        return Response.json({
          success: true,
          response: resultText,
          neurons_used: neuronsUsed,
          total_neurons_used: newUsage,
          remaining_neurons: CONFIG.DAILY_NEURON_LIMIT - newUsage
        }, {
          headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
        });

      } catch (err) {
        var isLicenseError = err.message && (err.message.includes('403') || err.message.includes('license'));
        var status = isLicenseError ? 403 : 500;
        var message = isLicenseError
          ? 'Model license not accepted. Visit Cloudflare dashboard > AI > Models and agree to terms.'
          : err.message || 'AI service error';

        return Response.json({
          success: false,
          error: message
        }, {
          status: status,
          headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
        });
      }
    }

    return new Response('Not Found', {
      status: 404,
      headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
    });
  }
};
