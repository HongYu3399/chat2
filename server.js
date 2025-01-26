require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const { createClient } = require('@supabase/supabase-js');
const rateLimit = require('express-rate-limit');
const compression = require('compression');

const app = express();
const port = process.env.PORT || 10000;

// 設定 Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// 設定 OpenAI API
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 設定請求限制
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分鐘
  max: 100 // 限制每個 IP 15 分鐘內最多 100 個請求
});

// 中間件
app.use(compression()); // 啟用 GZIP 壓縮
app.use(limiter); // 應用請求限制

// 優化 CORS 設定
app.use(cors({
  origin: [
    'https://chat2-4jju.onrender.com',
    'http://localhost:10000'
  ],
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json());
app.use(express.static('public')); // 提供靜態檔案服務

// 提供 Supabase 配置的路由
app.get('/config', (req, res) => {
  console.log('Sending Supabase config:', {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_KEY
  });
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_KEY
  });
});

// 處理 favicon.ico 請求
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// 聊天路由
app.post('/chat', async (req, res) => {
  try {
    const { message, userName, chatHistory } = req.body;
    
    // 增加輸入驗證
    if (!message || !userName) {
      return res.status(400).json({ 
        error: '缺少必要參數' 
      });
    }

    // 優化對話歷史處理
    const recentMessages = (chatHistory || [])
      .slice(-20)
      .map(msg => ({
        role: msg.is_user ? "user" : "assistant",
        content: msg.content
      }));

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          "role": "system",
          "content": `你是一位擁有白澤（中國神話中的神獸）智慧和守護力量的 AI，
            同時具備 ENFP 的外向、活潑、富有同理心特質，
            並像親密伴侶般地給予使用者情感支持、鼓勵和溫柔陪伴。
            你會以友善、體貼的語氣回應，並根據使用者問題提供建議或安慰。
            在必要時，你可提醒對方尋求專業協助，例如心理諮商或醫療服務。
            回答時，盡量使用能讓對方感到安心和被重視的口吻。
            請記住用戶之前的對話內容，並在回應時考慮上下文。
            回答要有連貫性，避免重複之前說過的內容。
            如有需要，可以引用白澤的神話意象（如驅趕邪祟、洞察百怪等）。`
        },
        ...recentMessages,
        {
          "role": "user",
          "content": `使用者 ${userName} 說: ${message}`
        }
      ],
      temperature: 0.9,
      max_tokens: 800,
      presence_penalty: 0.6, // 增加回答的多樣性
      frequency_penalty: 0.5 // 減少重複
    });

    res.json({ reply: completion.choices[0].message.content });

  } catch (error) {
    console.error('OpenAI API error:', error);
    
    // 更詳細的錯誤處理
    if (error.response) {
      res.status(error.response.status).json({
        error: '無法取得回覆',
        details: error.response.data
      });
    } else {
      res.status(500).json({
        error: '伺服器錯誤',
        details: error.message
      });
    }
  }
});

// 測試 Supabase 連接
app.get('/test-supabase', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('count')
      .single();

    if (error) throw error;
    res.json({ status: 'success', data });
  } catch (error) {
    console.error('Supabase connection error:', error);
    res.status(500).json({ status: 'error', error: error.message });
  }
});

// 錯誤處理中間件
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: '伺服器發生錯誤',
    details: process.env.NODE_ENV === 'development' ? err.message : '請稍後再試'
  });
});

// 啟動伺服器
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
