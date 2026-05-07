// Tab switching
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.chat-panel').forEach(p => p.classList.remove('active'));
  
  if (tab === 'luna') {
    document.querySelector('.tab:nth-child(1)').classList.add('active');
    document.getElementById('luna-panel').classList.add('active');
  } else {
    document.querySelector('.tab:nth-child(2)').classList.add('active');
    document.getElementById('xiaomei-panel').classList.add('active');
    loadEmails();
  }
}

// Luna chat
async function sendToLuna() {
  const input = document.getElementById('luna-input');
  const msg = input.value.trim();
  if (!msg) return;
  
  addMessage('luna', 'user', msg);
  input.value = '';
  
  // Show typing
  const messagesDiv = document.getElementById('luna-messages');
  const typingId = addTyping('luna');
  
  try {
    const res = await fetch('/api/luna/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg })
    });
    const data = await res.json();
    removeTyping(typingId);
    addMessage('luna', 'bot', data.reply);
  } catch (e) {
    removeTyping(typingId);
    addMessage('luna', 'bot', '抱歉，遇到了一点问题，请稍后再试。');
  }
}

function handleEnter(e, tab) {
  if (e.key === 'Enter') {
    if (tab === 'luna') sendToLuna();
  }
}

// XiaoMei - Load emails
let allEmails = [];

async function loadEmails() {
  const emailList = document.getElementById('email-list');
  emailList.innerHTML = '<p style="color:#888;text-align:center;padding:20px;">正在读取邮件...</p>';
  
  try {
    const res = await fetch('/api/xiaomei/emails');
    const data = await res.json();
    
    if (data.error) {
      emailList.innerHTML = `<p style="color:#f5576c;text-align:center;padding:20px;">连接失败: ${data.error}</p>`;
      return;
    }
    
    allEmails = data.emails;
    
    if (allEmails.length === 0) {
      emailList.innerHTML = '<p style="color:#888;text-align:center;padding:20px;">收件箱为空 📭</p>';
      return;
    }
    
    emailList.innerHTML = allEmails.map((email, i) => `
      <div class="email-item" onclick="handleEmailClick(${i})">
        <div class="email-header">
          <span class="from">${email.from}</span>
          <span class="date">${formatDate(email.date)}</span>
        </div>
        <div class="subject">${email.subject}</div>
      </div>
    `).join('');
    
    // Welcome message
    addMessage('xiaomei', 'bot', `已读取 ${allEmails.length} 封邮件。点击其中一封，我来帮你处理回复。`);
    
  } catch (e) {
    emailList.innerHTML = '<p style="color:#f5576c;text-align:center;padding:20px;">连接失败，请检查网络</p>';
  }
}

async function handleEmailClick(index) {
  const email = allEmails[index];
  
  // Highlight selected
  document.querySelectorAll('.email-item').forEach((el, i) => {
    el.style.borderColor = i === index ? '#667eea' : '';
  });
  
  // Show thinking
  const messagesDiv = document.getElementById('xiaomei-messages');
  addMessage('xiaomei', 'bot', `收到！正在分析「${email.subject}」...`);
  
  try {
    const res = await fetch('/api/xiaomei/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    
    addMessage('xiaomei', 'bot', `📧 <strong>客户邮件：</strong><br>发件人：${email.from}<br>主题：${email.subject}<br><br>✅ <strong>小梅已生成回复：</strong><br>${data.reply.replace(/\n/g, '<br>')}`);
  } catch (e) {
    addMessage('xiaomei', 'bot', '抱歉，生成回复时遇到问题，请稍后再试。');
  }
}

// Helper: add message to chat
function addMessage(who, role, text) {
  const panel = who === 'luna' ? 'luna-messages' : 'xiaomei-messages';
  const avatar = who === 'luna' ? 'L' : '小';
  const avatarClass = who === 'luna' ? 'luna-avatar' : 'xiaomei-avatar';
  
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.innerHTML = `
    ${role === 'bot' ? `<div class="${avatarClass}">${avatar}</div>` : ''}
    <div class="bubble"><p>${text}</p></div>
  `;
  
  document.getElementById(panel).appendChild(div);
  document.getElementById(panel).parentElement.querySelector('.messages').scrollTop = 100000;
  
  // Also scroll messages div
  const msgs = document.getElementById(panel).querySelector('.messages') || document.getElementById(panel);
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

// Helper: add typing indicator
function addTyping(who) {
  const id = 'typing-' + Date.now();
  const panel = who === 'luna' ? 'luna-messages' : 'xiaomei-messages';
  const avatar = who === 'luna' ? 'L' : '小';
  const avatarClass = who === 'luna' ? 'luna-avatar' : 'xiaomei-avatar';
  
  const div = document.createElement('div');
  div.className = 'message bot';
  div.id = id;
  div.innerHTML = `
    <div class="${avatarClass}">${avatar}</div>
    <div class="bubble">
      <div class="typing">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
    </div>
  `;
  document.getElementById(panel).appendChild(div);
  scrollToBottom(panel);
  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function scrollToBottom(panel) {
  const el = document.getElementById(panel);
  if (el) el.scrollTop = el.scrollHeight;
}

// Format date
function formatDate(d) {
  if (!d) return '';
  const date = new Date(d);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff/60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff/3600000) + '小时前';
  if (diff < 604800000) return Math.floor(diff/86400000) + '天前';
  return date.toLocaleDateString('zh-CN');
}

// Auto load emails on start
loadEmails();
