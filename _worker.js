// ============================================
// PRODUCTION: Webcore AI Worker
// Cloudflare Workers + D1 + Workers AI
// ============================================

// ===== CONFIGURATION =====
var CONFIG = {
  MODEL: '@cf/meta/llama-4-scout-17b-16e-instruct',
  TEMPERATURE: 0.7,
  MAX_TOKENS: 1000,
  MAX_PROMPT_LENGTH: 2000,
  MAX_HISTORY: 30,
  CORS_ORIGIN: '*' // TODO: Restrict to your domain
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
var UI_HTML = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Webcore AI</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Ubuntu,sans-serif;background:#fff;color:#1a1a1a;height:100vh;display:flex}.sidebar{width:280px;background:#f8f8f8;border-right:1px solid #e8e8e8;display:flex;flex-direction:column;flex-shrink:0;height:100vh}.sidebar-header{padding:20px;border-bottom:1px solid #e8e8e8}.sidebar-header h2{font-size:16px;font-weight:600}.sidebar-header .sub{font-size:12px;color:#999;margin-top:4px}.sidebar-actions{padding:12px 20px;border-bottom:1px solid #e8e8e8;display:flex;gap:8px}.sidebar-actions button{flex:1;padding:6px 12px;background:#1a1a1a;color:#fff;border:none;border-radius:4px;font-size:12px;cursor:pointer}.sidebar-actions button:hover{background:#333}.sidebar-actions button.secondary{background:#e8e8e8;color:#333}.sidebar-actions button.secondary:hover{background:#ddd}.conversation-list{flex:1;overflow-y:auto;padding:12px 0}.conversation-item{padding:10px 20px;cursor:pointer;transition:background .15s;border-left:3px solid transparent;position:relative}.conversation-item:hover{background:#f0f0f0}.conversation-item.active{background:#e8e8e8;border-left-color:#1a1a1a}.conversation-item .title{font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:60px}.conversation-item .meta{font-size:11px;color:#999;margin-top:2px}.conversation-item .actions{position:absolute;right:8px;top:50%;transform:translateY(-50%);display:flex;gap:4px;opacity:0;transition:opacity .2s}.conversation-item:hover .actions{opacity:1}.conversation-item .actions button{background:none;border:none;cursor:pointer;font-size:13px;padding:2px 6px;border-radius:4px;color:#999;transition:all .2s;font-weight:400}.conversation-item .actions button:hover{background:#ddd}.conversation-item .actions .rename-btn:hover{color:#0066cc}.conversation-item .actions .delete-btn:hover{color:#c00}.main-area{flex:1;display:flex;flex-direction:column;height:100vh}.header{padding:16px 32px;border-bottom:1px solid #f0f0f0;flex-shrink:0;display:flex;justify-content:space-between;align-items:center}.header h1{font-size:18px;font-weight:500}.header .subtitle{font-size:12px;color:#999}.header .model-badge{font-size:11px;color:#999;background:#f5f5f5;padding:2px 12px;border-radius:12px}.chat-container{flex:1;overflow-y:auto;padding:24px 32px;display:flex;flex-direction:column;gap:16px}.message{max-width:80%;padding:12px 18px;border-radius:12px;line-height:1.6;font-size:15px;word-wrap:break-word;animation:fadeIn .3s ease}.message.user{align-self:flex-end;background:#1a1a1a;color:#fff;border-bottom-right-radius:4px}.message.assistant{align-self:flex-start;background:#f5f5f5;color:#1a1a1a;border-bottom-left-radius:4px}.message .label{font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.5px;opacity:.6;margin-bottom:4px}.message.user .label{color:#aaa}.message.assistant .label{color:#888}.message pre{background:rgba(0,0,0,0.05);padding:10px 14px;border-radius:6px;overflow-x:auto;margin:8px 0;font-size:13px;font-family:"SF Mono","Menlo","Monaco","Courier New",monospace}.message.assistant pre{background:rgba(0,0,0,0.06)}.message.user pre{background:rgba(255,255,255,0.1)}.message code{font-family:"SF Mono","Menlo","Monaco","Courier New",monospace;font-size:13px;background:rgba(0,0,0,0.05);padding:2px 6px;border-radius:4px}.message.assistant code{background:rgba(0,0,0,0.06)}.message.user code{background:rgba(255,255,255,0.1)}.message p{margin:6px 0}.message ul,.message ol{padding-left:24px;margin:6px 0}.message li{margin:2px 0;list-style-position:inside}.message ul li{list-style-type:disc}.message ol li{list-style-type:decimal}.message blockquote{border-left:3px solid #ccc;padding-left:14px;margin:8px 0;opacity:.8}.message h1,.message h2,.message h3,.message h4{margin:12px 0 6px 0;font-weight:600}.message h1{font-size:22px}.message h2{font-size:19px}.message h3{font-size:17px}.message table{border-collapse:collapse;width:100%;margin:8px 0;font-size:14px}.message table th,.message table td{border:1px solid #ddd;padding:6px 10px;text-align:left}.message table th{background:#f2f2f2;font-weight:600}.message table tr:nth-child(even){background:#f9f9f9}.message table tr:hover{background:#f0f0f0}.typing-indicator{align-self:flex-start;background:#f5f5f5;padding:12px 20px;border-radius:12px;border-bottom-left-radius:4px;display:none;gap:4px}.typing-indicator span{width:8px;height:8px;background:#999;border-radius:50%;display:inline-block;animation:bounce 1.4s infinite ease-in-out both}.typing-indicator span:nth-child(1){animation-delay:-0.32s}.typing-indicator span:nth-child(2){animation-delay:-0.16s}.typing-indicator span:nth-child(3){animation-delay:0s}@keyframes bounce{0%,80%,100%{transform:scale(0)}40%{transform:scale(1)}}@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}.input-area{padding:16px 32px 24px 32px;border-top:1px solid #f0f0f0;flex-shrink:0;display:flex;gap:12px;align-items:flex-end}.input-area textarea{flex:1;padding:12px 16px;border:1px solid #e0e0e0;border-radius:8px;font-size:14px;font-family:inherit;resize:none;min-height:48px;max-height:150px;outline:none;transition:border .2s;line-height:1.5;background:#fafafa}.input-area textarea:focus{border-color:#1a1a1a;background:#fff}.input-area textarea::placeholder{color:#bbb}.input-area button{padding:12px 28px;background:#1a1a1a;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;transition:all .2s;white-space:nowrap;height:48px}.input-area button:hover:not(:disabled){background:#333;transform:scale(.98)}.input-area button:disabled{opacity:.4;cursor:not-allowed}.error-toast{position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#fee;color:#c00;padding:12px 24px;border-radius:8px;font-size:14px;border:1px solid #fcc;display:none;box-shadow:0 4px 12px rgba(0,0,0,0.06);max-width:90%}.error-toast.show{display:block;animation:fadeIn .3s ease}.chat-container::-webkit-scrollbar{width:5px}.chat-container::-webkit-scrollbar-track{background:#f5f5f5}.chat-container::-webkit-scrollbar-thumb{background:#ddd;border-radius:10px}.chat-container::-webkit-scrollbar-thumb:hover{background:#bbb}.conversation-list::-webkit-scrollbar{width:4px}.conversation-list::-webkit-scrollbar-track{background:#f8f8f8}.conversation-list::-webkit-scrollbar-thumb{background:#ddd;border-radius:10px}@media(max-width:768px){.sidebar{width:200px}.header{padding:12px 16px}.chat-container{padding:16px}.input-area{padding:12px 16px 16px 16px;flex-wrap:wrap}.message{max-width:92%;font-size:14px}}@media(max-width:480px){.sidebar{display:none}.sidebar.open{display:flex;position:fixed;width:280px;z-index:100;box-shadow:0 0 20px rgba(0,0,0,0.1)}.hamburger{display:block!important}}.hamburger{display:none;background:none;border:none;font-size:24px;cursor:pointer;padding:4px 8px}</style></head><body><div class="sidebar" id="sidebar"><div class="sidebar-header"><h2>Conversations</h2><div class="sub">Your chat history</div></div><div class="sidebar-actions"><button id="newChatBtn">+ New Chat</button><button class="secondary" id="refreshBtn">⟳</button></div><div class="conversation-list" id="conversationList"></div></div><div class="main-area"><div class="header"><div style="display:flex;align-items:center;gap:12px;"><button class="hamburger" id="hamburgerBtn">☰</button><div><h1 id="chatTitle">Webcore AI</h1><div class="subtitle" id="chatSubtitle">Select or start a conversation</div></div></div><span class="model-badge" id="modelBadge">Llama 4 17B</span></div><div class="chat-container" id="chatContainer"></div><div class="typing-indicator" id="typingIndicator"><span></span><span></span><span></span></div><div class="error-toast" id="errorToast"></div><div class="input-area"><textarea id="userInput" rows="1" placeholder="Type your message..." maxlength="2000"></textarea><button id="sendBtn">Send</button></div></div><script>' +
'var chatContainer=document.getElementById("chatContainer"),userInput=document.getElementById("userInput"),sendBtn=document.getElementById("sendBtn"),conversationList=document.getElementById("conversationList"),newChatBtn=document.getElementById("newChatBtn"),refreshBtn=document.getElementById("refreshBtn"),hamburgerBtn=document.getElementById("hamburgerBtn"),sidebar=document.getElementById("sidebar"),typingIndicator=document.getElementById("typingIndicator"),errorToast=document.getElementById("errorToast"),chatTitle=document.getElementById("chatTitle"),chatSubtitle=document.getElementById("chatSubtitle"),modelBadge=document.getElementById("modelBadge"),isProcessing=!1,currentConversationId=null,conversationHistory=[];' +
'var MODEL_NAMES={"@cf/meta/llama-4-scout-17b-16e-instruct":"Llama 4 17B","@cf/openai/gpt-oss-120b":"GPT-OSS 120B","@cf/google/gemma-4-26b-a4b-it":"Gemma 4 26B","@cf/zai-org/glm-4.7-flash":"GLM 4.7 Flash","@cf/qwen/qwen3.8-27b":"Qwen 3.8 27B"};' +
'function renderMarkdown(e){if(!e)return"";var t=e;t=t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");var n=t.split("\\n"),r=[],a=!1,o="",l=!1,s=[],i=0;while(i<n.length){var c=n[i];if(""===c.trim()){a&&("ul"===o?r.push("</ul>"):"ol"===o&&r.push("</ol>"),a=!1,o="");i++;continue}if(c.match(/^```/)){if(l){l=!1;r.push("<pre><code>"+s.join("\\n").trim()+"</code></pre>")}else{l=!0;s=[]}i++;continue}if(l){s.push(c);i++;continue}if(c.match(/^### /)){r.push("<h3>"+c.replace(/^### /,"")+"</h3>");i++;continue}if(c.match(/^## /)){r.push("<h2>"+c.replace(/^## /,"")+"</h2>");i++;continue}if(c.match(/^# /)){r.push("<h1>"+c.replace(/^# /,"")+"</h1>");i++;continue}if(c.match(/^> /)){r.push("<blockquote>"+c.replace(/^> /,"")+"</blockquote>");i++;continue}if(c.match(/^\\|/)){var d=[],u=!1;while(i<n.length&&n[i].match(/^\\|/)){var p=n[i].split("|").filter(function(e){return e.trim()!=""});d.push(p.map(function(e){return e.trim()}));if(!u&&i+1<n.length&&n[i+1].match(/^\\|/)){var h=n[i+1].split("|").filter(function(e){return e.trim()!=""});if(h.every(function(e){return e.match(/^[\\s\\-:]+$/)||e.match(/^[:\\-]+$/)||e.match(/^\\-+$/)})){u=!0;i++}}i++}var m="<table>";if(d.length>0){m+="<thead><tr>";for(var f=0;f<d[0].length;f++){m+="<th>"+d[0][f]+"</th>"}m+="</tr></thead><tbody>";for(var v=1;v<d.length;v++){m+="<tr>";for(var g=0;g<d[v].length;g++){m+="<td>"+d[v][g]+"</td>"}m+="</tr>"}m+="</tbody>"}m+="</table>";r.push(m);continue}if(c.match(/^\\s*[-*+]\\s/)){a&&"ul"!==o&&(r.push("</ul>"),a=!1,o="");a||(r.push("<ul>"),a=!0,o="ul");r.push("<li>"+c.replace(/^\\s*[-*+]\\s/,"")+"</li>");i++;continue}if(c.match(/^\\s*\\d+\\.\\s/)){a&&"ol"!==o&&(r.push("</ol>"),a=!1,o="");a||(r.push("<ol>"),a=!0,o="ol");r.push("<li>"+c.replace(/^\\s*\\d+\\.\\s/,"")+"</li>");i++;continue}if(a){if("ul"===o)r.push("</ul>");else if("ol"===o)r.push("</ol>");a=!1;o=""}r.push("<p>"+c+"</p>");i++}a&&("ul"===o?r.push("</ul>"):"ol"===o&&r.push("</ol>"));return(t=r.join("")).replace(/`([^`]+)`/g,"<code>$1</code>").replace(/\\*\\*([^*]+)\\*\\*/g,"<strong>$1</strong>").replace(/\\*([^*]+)\\*/g,"<em>$1</em>").replace(/\\n/g,"<br>")}' +
'function apiRequest(e,t,n){return fetch(e,{method:t,headers:{"Content-Type":"application/json"},body:n?JSON.stringify(n):null}).then(function(e){return e.json()})}' +
'function loadConversations(){apiRequest("/api/conversations","GET").then(function(e){e.success&&renderConversationList(e.conversations)}).catch(function(e){console.error(e)})}' +
'function loadConversation(e){apiRequest("/api/conversations/"+e,"GET").then(function(t){if(t.success){currentConversationId=e;conversationHistory=t.messages||[];renderMessages(conversationHistory);chatTitle.textContent=t.title||"Conversation";chatSubtitle.textContent=(t.messages?t.messages.length:0)+" messages";highlightConversation(e)}}).catch(function(e){console.error(e)})}' +
'function createNewConversation(){var e=prompt("Conversation title:","New Chat");if(e){apiRequest("/api/conversations","POST",{title:e}).then(function(e){e.success&&(loadConversations(),loadConversation(e.id))}).catch(function(e){console.error(e)})}}' +
'function renameConversation(e,t){var n=prompt("New title:",t||"Untitled");if(n&&n.trim()){apiRequest("/api/conversations/"+e,"PUT",{title:n.trim()}).then(function(t){t.success&&(currentConversationId===e&&(chatTitle.textContent=t.title),loadConversations())}).catch(function(e){console.error(e)})}}' +
'function deleteConversation(e){if(confirm("Delete this conversation?")){apiRequest("/api/conversations/"+e,"DELETE").then(function(t){if(t.success){if(currentConversationId===e){currentConversationId=null;chatContainer.innerHTML="";chatTitle.textContent="Webcore AI";chatSubtitle.textContent="Select or start a conversation"}loadConversations()}}).catch(function(e){console.error(e)})}}' +
'function sendMessageToAI(e,t){if(!currentConversationId)return showError("Please create or select a conversation first"),Promise.reject("No conversation selected");return apiRequest("/api/chat","POST",{conversation_id:currentConversationId,prompt:e,model:t||"@cf/meta/llama-4-scout-17b-16e-instruct",temperature:.7,max_tokens:1e3})}' +
'function renderConversationList(e){conversationList.innerHTML="";if(!e||0===e.length){conversationList.innerHTML=\'<div style="padding:20px;text-align:center;color:#999;font-size:13px;">No conversations yet</div>\';return}for(var t=0;t<e.length;t++){var n=e[t],r=document.createElement("div");r.className="conversation-item";r.dataset.id=n.id;n.id===currentConversationId&&r.classList.add("active");var a=document.createElement("div");a.className="title";a.textContent=n.title||"Untitled";var o=document.createElement("div");o.className="meta";var l=new Date(n.updated_at);o.textContent=l.toLocaleDateString()+" · "+(n.message_count||0)+" messages";var s=document.createElement("div");s.className="actions";var i=document.createElement("button");i.className="rename-btn";i.textContent="\u271e";i.title="Rename";i.onclick=function(e){e.stopPropagation();var t=this.closest(".conversation-item").dataset.id;renameConversation(t)};var d=document.createElement("button");d.className="delete-btn";d.textContent="\u2715";d.title="Delete";d.onclick=function(e){e.stopPropagation();var t=this.closest(".conversation-item").dataset.id;deleteConversation(t)};s.appendChild(i);s.appendChild(d);r.appendChild(a);r.appendChild(o);r.appendChild(s);r.onclick=function(){loadConversation(this.dataset.id)};conversationList.appendChild(r)}}' +
'function renderMessages(e){chatContainer.innerHTML="";if(!e||0===e.length){var t=document.createElement("div");t.className="message assistant";t.innerHTML=\'<div class="label">Assistant</div><p>Start a conversation! Ask me anything.</p>\';chatContainer.appendChild(t);return}for(var n=0;n<e.length;n++)addMessageDOM(e[n].role,e[n].content);chatContainer.scrollTop=chatContainer.scrollHeight}' +
'function addMessageDOM(e,t){var n=document.createElement("div");n.className="message "+e;var r=document.createElement("div");r.className="label";r.textContent="user"===e?"You":"Assistant";var a=document.createElement("div");"assistant"===e?a.innerHTML=renderMarkdown(t):a.textContent=t;n.appendChild(r);n.appendChild(a);chatContainer.appendChild(n);chatContainer.scrollTop=chatContainer.scrollHeight}' +
'function highlightConversation(e){for(var t=conversationList.querySelectorAll(".conversation-item"),n=0;n<t.length;n++)t[n].classList.toggle("active",t[n].dataset.id===e)}' +
'function showTyping(e){typingIndicator.style.display=e?"flex":"none";e&&(chatContainer.scrollTop=chatContainer.scrollHeight)}' +
'function showError(e){e?(errorToast.textContent="⚠️ "+e,errorToast.classList.add("show"),setTimeout(function(){errorToast.classList.remove("show")},5e3)):errorToast.classList.remove("show")}' +
'function updateModelBadge(e){var t=MODEL_NAMES[e]||e.split("/").pop();modelBadge.textContent=t}' +
'function sendMessage(){var e=userInput.value.trim();if(!e||isProcessing)return;if(!currentConversationId)return showError("Please create or select a conversation first"),void 0;var t=document.querySelector(".model-selector"),n=t?t.value:"@cf/meta/llama-4-scout-17b-16e-instruct";addMessageDOM("user",e);userInput.value="";userInput.style.height="auto";isProcessing=!0;sendBtn.disabled=!0;showTyping(!0);updateModelBadge(n);sendMessageToAI(e,n).then(function(t){t.success?(addMessageDOM("assistant",t.response),conversationHistory=t.messages||[],loadConversations(),chatSubtitle.textContent=conversationHistory.length+" messages",showError(null)):showError(t.error||"AI request failed")}).catch(function(e){showError(e.message||"Error sending message")}).finally(function(){isProcessing=!1;sendBtn.disabled=!1;showTyping(!1);userInput.focus()})}' +
'userInput.addEventListener("input",function(){userInput.style.height="auto";userInput.style.height=Math.min(userInput.scrollHeight,150)+"px"});userInput.addEventListener("keydown",function(e){"Enter"===e.key&&!e.shiftKey&&(e.preventDefault(),sendMessage())});sendBtn.addEventListener("click",sendMessage);newChatBtn.addEventListener("click",createNewConversation);refreshBtn.addEventListener("click",loadConversations);hamburgerBtn.addEventListener("click",function(){sidebar.classList.toggle("open")});document.addEventListener("click",function(e){window.innerWidth<=480&&!sidebar.contains(e.target)&&e.target!==hamburgerBtn&&sidebar.classList.remove("open")});' +
'var style=document.createElement("style");style.textContent=".model-selector-wrap{padding:8px 32px 8px 32px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;gap:10px;flex-shrink:0}.model-selector-wrap label{font-size:12px;color:#888;font-weight:500}.model-selector-wrap select{padding:4px 8px;border:1px solid #e0e0e0;border-radius:4px;font-size:12px;background:#fafafa;color:#1a1a1a;cursor:pointer;outline:none;font-family:inherit}.model-selector-wrap select:focus{border-color:#1a1a1a}";document.head.appendChild(style);' +
'var modelWrap=document.createElement("div");modelWrap.className="model-selector-wrap";modelWrap.innerHTML=\'<label for="modelSelect">Model</label><select class="model-selector" id="modelSelect"><option value="@cf/meta/llama-4-scout-17b-16e-instruct">Llama 4 Scout 17B</option><option value="@cf/openai/gpt-oss-120b">GPT-OSS 120B</option><option value="@cf/google/gemma-4-26b-a4b-it">Gemma 4 26B</option><option value="@cf/zai-org/glm-4.7-flash">GLM 4.7 Flash</option><option value="@cf/qwen/qwen3.8-27b">Qwen 3.8 27B</option></select>\';' +
'var header=document.querySelector(".header");header.parentNode.insertBefore(modelWrap,header.nextSibling);' +
'var modelSelect=document.getElementById("modelSelect");modelSelect.addEventListener("change",function(){updateModelBadge(this.value)});updateModelBadge(modelSelect.value);' +
'loadConversations();userInput.focus();setTimeout(function(){var e=conversationList.querySelectorAll(".conversation-item");0===e.length?createNewConversation():loadConversation(e[0].dataset.id)},500);' +
'<\/script></body></html>';

// ============================================
// DATABASE INITIALIZATION (IDEMPOTENT)
// ============================================

async function initDatabase(env) {
  try {
    // Use IF NOT EXISTS - safe for concurrent requests
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS conversations (' +
      'id TEXT PRIMARY KEY, ' +
      'title TEXT, ' +
      'created_at INTEGER, ' +
      'updated_at INTEGER' +
      ')'
    ).run();
    
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS messages (' +
      'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
      'conversation_id TEXT, ' +
      'role TEXT, ' +
      'content TEXT, ' +
      'timestamp INTEGER, ' +
      'FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE' +
      ')'
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

    // CORS
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

    // Serve UI
    if (method === 'GET' && path === '/') {
      return new Response(UI_HTML, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN
        }
      });
    }

    // Initialize database (idempotent)
    await initDatabase(env);

    // ===== API ROUTES =====

    // GET /api/conversations
    if (method === 'GET' && path === '/api/conversations') {
      try {
        var stmt = env.DB.prepare(
          'SELECT c.id, c.title, c.created_at, c.updated_at, COUNT(m.id) as message_count ' +
          'FROM conversations c ' +
          'LEFT JOIN messages m ON c.id = m.conversation_id ' +
          'GROUP BY c.id ' +
          'ORDER BY c.updated_at DESC'
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
          'SELECT role, content, id FROM messages WHERE conversation_id = ? ORDER BY id ASC'
        );
        var msgResult = await msgStmt.bind(id).all();
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

    // DELETE /api/conversations/:id (with CASCADE)
    if (method === 'DELETE' && path.match(/^\/api\/conversations\/[^\/]+$/)) {
      try {
        var id = path.split('/').pop();
        // ON DELETE CASCADE automatically deletes messages
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

    // POST /api/chat - PRODUCTION VERSION
    if (method === 'POST' && path === '/api/chat') {
      try {
        var body = await request.json();
        var conversationId = body.conversation_id;
        var prompt = body.prompt ? body.prompt.trim() : '';
        var requestedModel = body.model || CONFIG.MODEL;

        // === SERVER-SIDE PROMPT VALIDATION ===
        if (!prompt) {
          return Response.json({
            success: false,
            error: 'Prompt is required'
          }, {
            status: 400,
            headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
          });
        }

        if (prompt.length > CONFIG.MAX_PROMPT_LENGTH) {
          return Response.json({
            success: false,
            error: 'Prompt too long. Maximum ' + CONFIG.MAX_PROMPT_LENGTH + ' characters.'
          }, {
            status: 400,
            headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
          });
        }

        if (!conversationId) {
          return Response.json({
            success: false,
            error: 'Conversation ID is required'
          }, {
            status: 400,
            headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
          });
        }

        // === MODEL ALLOWLIST ===
        var modelConfig = FREE_MODELS[requestedModel];
        if (!modelConfig) {
          return Response.json({
            success: false,
            error: 'Model is not available on this deployment.'
          }, {
            status: 400,
            headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
          });
        }

        var model = requestedModel;
        var maxTokens = modelConfig.maxTokens;

        // === CLAMP TEMPERATURE AND MAX_TOKENS ===
        var temperature = Math.min(
          Math.max(Number(body.temperature ?? CONFIG.TEMPERATURE), 0),
          2
        );
        var max_tokens = Math.min(
          Math.max(Number(body.max_tokens ?? maxTokens), 1),
          maxTokens
        );

        // === VERIFY CONVERSATION EXISTS ===
        var convCheck = env.DB.prepare('SELECT id FROM conversations WHERE id = ?');
        var convExists = await convCheck.bind(conversationId).first();
        if (!convExists) {
          return Response.json({
            success: false,
            error: 'Conversation not found'
          }, {
            status: 404,
            headers: { 'Access-Control-Allow-Origin': CONFIG.CORS_ORIGIN }
          });
        }

        // === GET LIMITED HISTORY (LAST 30 MESSAGES) ===
        var historyStmt = env.DB.prepare(
          'SELECT role, content, id FROM messages ' +
          'WHERE conversation_id = ? ' +
          'ORDER BY id DESC LIMIT ?'
        );
        var historyResult = await historyStmt.bind(conversationId, CONFIG.MAX_HISTORY * 2).all();
        
        // Reverse to get chronological order
        var history = (historyResult.results || []).reverse();

        // === BUILD MESSAGES ===
        var messages = new Array(history.length + 1);
        for (var i = 0; i < history.length; i++) {
          messages[i] = { role: history[i].role, content: history[i].content };
        }
        messages[history.length] = { role: 'user', content: prompt };

        // === CALL AI ===
        var response = await env.AI.run(model, {
          messages: messages,
          temperature: temperature,
          max_tokens: max_tokens
        });

        // === EXTRACT RESPONSE ===
        var resultText = '';
        if (response.choices && response.choices[0] && response.choices[0].message) {
          resultText = response.choices[0].message.content;
        } else if (response.response) {
          resultText = response.response;
        } else if (response.result) {
          resultText = response.result;
        } else {
          resultText = JSON.stringify(response);
        }

        // === SAVE MESSAGES ===
        var now = Date.now();
        var userStmt = env.DB.prepare(
          'INSERT INTO messages (conversation_id, role, content, timestamp) VALUES (?, ?, ?, ?)'
        );
        var updateStmt = env.DB.prepare(
          'UPDATE conversations SET updated_at = ? WHERE id = ?'
        );

        // Use batch for atomic writes
        var batch = env.DB.batch([
          userStmt.bind(conversationId, 'user', prompt, now),
          userStmt.bind(conversationId, 'assistant', resultText, now + 1),
          updateStmt.bind(now, conversationId)
        ]);
        await batch;

        // === RETURN WITHOUT EXTRA DB QUERY ===
        // Build the full message list from what we know
        var allMessages = history.map(function(m) {
          return { role: m.role, content: m.content };
        });
        allMessages.push({ role: 'user', content: prompt });
        allMessages.push({ role: 'assistant', content: resultText });

        return Response.json({
          success: true,
          response: resultText,
          messages: allMessages
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
