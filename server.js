const express = require('express');
const { ImapFlow } = require('imapflow');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// MiniMax API 配置
// Decode email subject (GBK/Multilingual)
function decodeSubject(subject) {
  if (!subject) return '';
  try {
    // GBK encoded subject
    if (subject.includes('=?GBK?') || subject.includes('=?gbk?')) {
      const match = subject.match(/=\?([^?]+)\?([BQ])\?([^?]+)\?=/i);
      if (match) {
        const charset = match[1].toLowerCase();
        const encoding = match[2].toUpperCase();
        const text = match[3];
        if (encoding === 'B') {
          const buf = Buffer.from(text, 'base64');
          if (charset === 'gbk') return buf.toString('gbk').replace(/[\u0000-\u001F]/g, '').trim();
        }
      }
    }
    // UTF-8 Quoted printable
    if (subject.includes('=?UTF-8?')) {
      return subject.replace(/=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi, (m, c, e, t) => {
        try {
          const buf = e === 'B' ? Buffer.from(t, 'base64') : Buffer.from(t, 'hex');
          return buf.toString('utf8');
        } catch { return t; }
      });
    }
  } catch(e) {}
  return subject;
}

const MINIMAX_API_KEY = 'sk-cp-FhSDsjx45t5SuQ41rN7Zoq-os1zOQ5XphTMoiQucfD8-_jz3PHhRY-JfFDoskoybNyYYzu5XNb30YPjhnNhbq6_RHiFhz5g_-nsmxX0OAw5liujiwSWY9ok';
const MINIMAX_BASE = 'https://api.minimaxi.com/v1';

// IMAP 配置
const IMAP_CONFIG = {
  host: 'imap.exmail.qq.com',
  port: 993,
  secure: true,
  auth: {
    user: 'ralph@ralphkit.com',
    pass: '5G5wxE4v8n82EC3u'
  }
};

// MiniMax AI 对话
async function chatWithAI(messages) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch(`${MINIMAX_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MINIMAX_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'MiniMax-M2.7',
        messages: messages,
        max_tokens: 800
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    
    const data = await response.json();
    if (data.error) return '处理中，请稍候...';
    return data.choices?.[0]?.message?.content || '处理完成';
  } catch (e) {
    if (e.name === 'AbortError') return '正在分析，请稍候...';
    return '处理中...';
  }
}

// AI 员工：Luna - 获客
app.post('/api/luna/chat', async (req, res) => {
  const { message } = req.body;
  
  const systemPrompt = `你是 Luna，RalphKit 的 AI 获客员工。
你的工作是帮客户找到海外买家/分销商。
你有以下能力：
- 理解客户的产品和市场需求
- 分析潜在客户
- 生成客户报告

重要规则：
- 用户用什么语言提问，你就用什么语言回复
- 如果用户用英文，你就用英文回复
- 如果用户用中文，你就用中文回复
- 你说话要像一个人，不是系统。要主动、要专业。
- 当客户说了需求，你要立刻开始行动，不要等待确认。`;

  try {
    const reply = await chatWithAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ]);
    res.json({ reply });
  } catch (e) {
    res.json({ reply: '正在分析您的需求，请稍候...' });
  }
});

// AI 员工：小梅 - 客服（读取邮件 + AI 回复）
// Demo emails for showcase (when no real emails)
const DEMO_EMAILS = [
  { id: 101, from: 'John Smith', fromEmail: 'john@us-solar.com', subject: '询问光伏组件价格', date: new Date(Date.now() - 3600000).toISOString(), isDemo: true },
  { id: 102, from: 'Marie Dubois', fromEmail: 'marie.d@fr-led.fr', subject: 'LED灯具OEM合作咨询', date: new Date(Date.now() - 7200000).toISOString(), isDemo: true },
  { id: 103, from: 'Hans Mueller', fromEmail: 'h.mueller@de-solar.de', subject: '关于储能电池的采购需求', date: new Date(Date.now() - 86400000).toISOString(), isDemo: true },
  { id: 104, from: '李明', fromEmail: 'liming@sztech.cn', subject: '产品出口越南物流咨询', date: new Date(Date.now() - 172800000).toISOString(), isDemo: true }
];

app.get('/api/xiaomei/emails', async (req, res) => {
  let client;
  let lock;
  try {
    client = new ImapFlow(IMAP_CONFIG);
    await client.connect();
    lock = await client.getMailboxLock('INBOX');
    
    const emails = [];
    const seen = new Set();
    
    for await (const msg of client.fetch('1:*', { envelope: true })) {
      const from = msg.envelope.from?.[0];
      const fromEmail = from?.email || '';
      const fromName = from?.name || '';
      
      // Skip system/postmaster emails
      if (!fromEmail || fromEmail.toLowerCase().includes('postmaster')) continue;
      if (seen.has(msg.envelope.messageId)) continue;
      seen.add(msg.envelope.messageId);
      
      const subject = msg.envelope.subject || '(无主题)';
      const date = msg.envelope.date;
      
      emails.push({
        id: msg.uid,
        from: fromName || fromEmail,
        fromEmail: fromEmail,
        subject: decodeSubject(subject),
        date: date,
        isDemo: false
      });
      
      if (emails.length >= 10) break;
    }
    
    lock.release();
    await client.logout();
    
    // If no real emails, use demo emails
    if (emails.length === 0) {
      emails.push(...DEMO_EMAILS);
    }
    
    res.json({ emails, total: emails.length });
  } catch (e) {
    if (lock) { try { lock.release(); } catch(e2) {} }
    if (client) { try { await client.logout(); } catch(e2) {} }
    // Fallback to demo emails on error
    res.json({ emails: DEMO_EMAILS, total: DEMO_EMAILS.length });
  }
});

app.post('/api/xiaomei/reply', async (req, res) => {
  const { email, reply } = req.body;
  
  const systemPrompt = `你是小梅，RalphKit 的 AI 客服员工。
你正在处理一封客户邮件，请生成一封专业、友好的回复邮件。

重要规则：
- 如果客户邮件是英文，请用英文回复
- 如果客户邮件是中文，请用中文回复
- 回复要简洁、专业、像人写的
- 根据邮件内容定制回复
- 要有具体信息，不要空话

邮件标题格式：[回复] + 原标题`;

  try {
    const fullPrompt = `客户邮件：
发件人：${email.from}
主题：${email.subject}
时间：${email.date}

请生成一封回复邮件（只需要邮件正文，不需要标题）：`;

    const generatedReply = await chatWithAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: fullPrompt }
    ]);
    
    res.json({ reply: generatedReply, email });
  } catch (e) {
    res.json({ reply: '感谢您的来信，我们会尽快处理。', email });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`AI Sales Employee running on port ${PORT}`);
});
