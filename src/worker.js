// Cloudflare Workers + D1 完整部署方案
// 无需外部服务器，完全基于 Cloudflare 平台

// 获取配置（从环境变量）
function getConfig(env) {
  return {
    // 统一代理配置（从环境变量读取）
    UNIFIED_TOKEN: env.UNIFIED_TOKEN || 'your-unified-token-here',
    ACCESS_PWD: env.ACCESS_PWD || 'admin-password-123',

    // Augment API 配置
    AUGMENT_AUTH_URL: 'https://auth.augmentcode.com',

    // 支持的模型列表
    MODELS: [
      { id: 'claude-3.7-chat', object: 'model', created: 1708387200, owned_by: 'anthropic' },
      { id: 'claude-3.7-agent', object: 'model', created: 1708387200, owned_by: 'anthropic' },
      { id: 'claude-4-agent', object: 'model', created: 1708387200, owned_by: 'anthropic' },
      { id: 'augment-chat', object: 'model', created: 1708387200, owned_by: 'augment' }
    ]
  };
}

// 主要处理函数
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS 处理
    if (request.method === 'OPTIONS') {
      return handleCORS();
    }

    try {
      // 路由分发
      if (path === '/') {
        return handleAdminPage();
      } else if (path === '/api/login') {
        return handleLogin(request, env);
      } else if (path.startsWith('/api/tokens')) {
        return handleTokenManagement(request, env);
      } else if (path === '/v1/models') {
        return handleModels(request, env);
      } else if (path === '/v1/chat/completions' || path === '/chat-stream') {
        return handleChatCompletion(request, env);
      } else if (path.startsWith('/auth/') || path.startsWith('/api/auth/')) {
        return handleAugmentAuth(request, env);
      } else if (path === '/api/user' || path === '/user') {
        return handleUserInfo(request, env);
      } else if (path === '/api/validate' || path === '/validate') {
        return handleTokenValidation(request, env);
      } else if (path === '/api/usage' || path === '/usage') {
        return handleUsageInfo(request, env);
      } else if (path.startsWith('/api/')) {
        return handleAPI(request, env);
      } else {
        return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      return new Response(JSON.stringify({
        error: 'Internal Server Error',
        message: error.message
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

// CORS 处理
function handleCORS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

// 管理页面
function handleAdminPage() {
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Augment2Api 统一代理管理</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; }
        .login-form { max-width: 400px; margin: 0 auto; }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 5px; font-weight: bold; }
        .form-group input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
        .btn { background: #007cba; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
        .btn:hover { background: #005a87; }
        .token-list { margin-top: 20px; }
        .token-item { background: #f9f9f9; padding: 15px; margin-bottom: 10px; border-radius: 4px; border-left: 4px solid #007cba; }
        .status-active { border-left-color: #28a745; }
        .status-disabled { border-left-color: #dc3545; }
        .hidden { display: none; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Augment2Api 统一代理管理</h1>
            <p>基于 Cloudflare Workers 的无服务器部署</p>
        </div>
        
        <div id="loginSection" class="login-form">
            <h2>管理员登录</h2>
            <div class="form-group">
                <label for="password">管理密码:</label>
                <input type="password" id="password" placeholder="请输入管理密码">
            </div>
            <button class="btn" onclick="login()">登录</button>
        </div>
        
        <div id="adminSection" class="hidden">
            <h2>Token 管理</h2>
            <div class="form-group">
                <label for="newToken">添加新 Token:</label>
                <input type="text" id="newToken" placeholder="输入 Augment Token">
            </div>
            <div class="form-group">
                <label for="newTenantUrl">Tenant URL:</label>
                <input type="text" id="newTenantUrl" placeholder="https://xxx.augmentcode.com/">
            </div>
            <div class="form-group">
                <label for="newRemark">备注:</label>
                <input type="text" id="newRemark" placeholder="可选备注信息">
            </div>
            <button class="btn" onclick="addToken()">添加 Token</button>
            
            <div class="token-list">
                <h3>当前 Token 列表</h3>
                <div id="tokenList">加载中...</div>
            </div>
        </div>
    </div>

    <script>
        let authToken = '';
        
        async function login() {
            const password = document.getElementById('password').value;
            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                });
                
                const result = await response.json();
                if (result.success) {
                    authToken = result.token;
                    document.getElementById('loginSection').classList.add('hidden');
                    document.getElementById('adminSection').classList.remove('hidden');
                    loadTokens();
                } else {
                    alert('密码错误');
                }
            } catch (error) {
                alert('登录失败: ' + error.message);
            }
        }
        
        async function loadTokens() {
            try {
                const response = await fetch('/api/tokens', {
                    headers: { 'Authorization': 'Bearer ' + authToken }
                });

                if (!response.ok) {
                    throw new Error('HTTP ' + response.status + ': ' + response.statusText);
                }

                const tokens = await response.json();
                console.log('Loaded tokens:', tokens);

                const tokenList = document.getElementById('tokenList');

                // 确保 tokens 是数组
                if (!Array.isArray(tokens)) {
                    console.error('Tokens is not an array:', tokens);
                    tokenList.innerHTML = '<p>数据格式错误，请检查数据库配置</p>';
                    return;
                }

                if (tokens.length === 0) {
                    tokenList.innerHTML = '<p>暂无 Token，请先添加 Augment Token</p>';
                } else {
                    tokenList.innerHTML = tokens.map(token =>
                        '<div class="token-item status-' + (token.status || 'unknown') + '">' +
                        '<strong>Token:</strong> ' + (token.token ? token.token.substring(0, 20) + '...' : '未知') + '<br>' +
                        '<strong>Tenant URL:</strong> ' + (token.tenant_url || '未设置') + '<br>' +
                        '<strong>状态:</strong> ' + (token.status || '未知') + '<br>' +
                        '<strong>备注:</strong> ' + (token.remark || '无') + '<br>' +
                        '<strong>创建时间:</strong> ' + (token.created_at ? new Date(token.created_at).toLocaleString() : '未知') +
                        '</div>'
                    ).join('');
                }
            } catch (error) {
                console.error('Load tokens error:', error);
                document.getElementById('tokenList').innerHTML = '<p>加载失败: ' + error.message + '<br>请检查数据库是否已正确配置</p>';
            }
        }
        
        async function addToken() {
            const token = document.getElementById('newToken').value;
            const tenantUrl = document.getElementById('newTenantUrl').value;
            const remark = document.getElementById('newRemark').value;
            
            if (!token || !tenantUrl) {
                alert('请填写 Token 和 Tenant URL');
                return;
            }
            
            try {
                const response = await fetch('/api/tokens', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + authToken
                    },
                    body: JSON.stringify({ token, tenant_url: tenantUrl, remark })
                });
                
                const result = await response.json();
                if (result.success) {
                    document.getElementById('newToken').value = '';
                    document.getElementById('newTenantUrl').value = '';
                    document.getElementById('newRemark').value = '';
                    loadTokens();
                    alert('Token 添加成功');
                } else {
                    alert('添加失败: ' + result.error);
                }
            } catch (error) {
                alert('添加失败: ' + error.message);
            }
        }
    </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

// 登录处理
async function handleLogin(request, env) {
  const { password } = await request.json();
  const config = getConfig(env);

  if (password === config.ACCESS_PWD) {
    // 生成简单的会话token
    const sessionToken = btoa(Date.now() + ':' + Math.random());
    return jsonResponse({ success: true, token: sessionToken });
  } else {
    return jsonResponse({ success: false, error: 'Invalid password' }, 401);
  }
}

// Token 管理
async function handleTokenManagement(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  if (request.method === 'GET') {
    return getTokens(env);
  } else if (request.method === 'POST') {
    return addToken(request, env);
  } else if (request.method === 'DELETE') {
    return deleteToken(request, env);
  }
}

// 获取 Token 列表
async function getTokens(env) {
  try {
    // 检查数据库是否存在
    if (!env.DB) {
      console.error('Database not available');
      return jsonResponse([]);
    }

    const { results } = await env.DB.prepare(
      'SELECT token, tenant_url, status, remark, created_at FROM tokens ORDER BY created_at DESC'
    ).all();

    // 确保返回数组格式
    const tokenList = Array.isArray(results) ? results : [];
    console.log('Token list retrieved:', tokenList.length, 'tokens');

    return jsonResponse(tokenList);
  } catch (error) {
    console.error('Database error in getTokens:', error);
    // 返回空数组而不是错误，避免前端崩溃
    return jsonResponse([]);
  }
}

// 添加 Token
async function addToken(request, env) {
  const { token, tenant_url, remark } = await request.json();
  
  if (!token || !tenant_url) {
    return jsonResponse({ error: 'Token and tenant_url are required' }, 400);
  }

  try {
    await env.DB.prepare(
      'INSERT INTO tokens (token, tenant_url, status, remark, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(token, tenant_url, 'active', remark || '', new Date().toISOString()).run();
    
    return jsonResponse({ success: true });
  } catch (error) {
    return jsonResponse({ error: 'Failed to add token' }, 500);
  }
}

// 模型列表
function handleModels(request, env) {
  // 验证统一token
  if (!verifyUnifiedToken(request, env)) {
    return jsonResponse({ error: 'Invalid authorization token' }, 401);
  }

  const config = getConfig(env);
  return jsonResponse({
    object: 'list',
    data: config.MODELS
  });
}

// VSCode 插件用户信息接口
async function handleUserInfo(request, env) {
  // 验证统一token
  if (!verifyUnifiedToken(request, env)) {
    return jsonResponse({ error: 'Invalid authorization token' }, 401);
  }

  // 返回模拟的用户信息，VSCode 插件需要这些信息
  return jsonResponse({
    id: 'proxy-user',
    email: 'proxy@augment2api.com',
    name: 'Augment2API Proxy User',
    tenant: {
      id: 'proxy-tenant',
      name: 'Augment2API Proxy',
      url: 'https://augment.amexiaowu.workers.dev'
    },
    subscription: {
      plan: 'pro',
      status: 'active'
    }
  });
}

// VSCode 插件 Token 验证接口
async function handleTokenValidation(request, env) {
  // 验证统一token
  if (!verifyUnifiedToken(request, env)) {
    return jsonResponse({
      valid: false,
      error: 'Invalid authorization token'
    }, 401);
  }

  // 检查是否有可用的真实 token
  try {
    const availableToken = await getAvailableToken(env);
    if (!availableToken) {
      return jsonResponse({
        valid: false,
        error: 'No available backend tokens'
      });
    }

    return jsonResponse({
      valid: true,
      user: {
        id: 'proxy-user',
        email: 'proxy@augment2api.com',
        name: 'Augment2API Proxy User'
      },
      tenant: {
        id: 'proxy-tenant',
        name: 'Augment2API Proxy',
        url: 'https://augment.amexiaowu.workers.dev'
      }
    });
  } catch (error) {
    return jsonResponse({
      valid: false,
      error: 'Token validation failed'
    });
  }
}

// VSCode 插件使用情况接口
async function handleUsageInfo(request, env) {
  // 验证统一token
  if (!verifyUnifiedToken(request, env)) {
    return jsonResponse({ error: 'Invalid authorization token' }, 401);
  }

  // 返回模拟的使用情况信息
  return jsonResponse({
    usage: {
      requests_today: 0,
      requests_this_month: 0,
      tokens_used_today: 0,
      tokens_used_this_month: 0
    },
    limits: {
      requests_per_day: 10000,
      requests_per_month: 300000,
      tokens_per_day: 1000000,
      tokens_per_month: 30000000
    },
    subscription: {
      plan: 'pro',
      status: 'active',
      expires_at: null
    }
  });
}

// Augment 认证代理处理
async function handleAugmentAuth(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  // 构建目标 URL
  const config = getConfig(env);
  const targetUrl = config.AUGMENT_AUTH_URL + path.replace(/^\/auth/, '').replace(/^\/api\/auth/, '');

  console.log('Proxying auth request to:', targetUrl);

  try {
    // 复制请求头，但排除一些不需要的
    const headers = new Headers();
    for (const [key, value] of request.headers.entries()) {
      if (!['host', 'cf-ray', 'cf-connecting-ip'].includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    }

    // 代理请求到 Augment 认证服务
    const response = await fetch(targetUrl + url.search, {
      method: request.method,
      headers: headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.arrayBuffer() : undefined
    });

    // 复制响应头
    const responseHeaders = new Headers();
    for (const [key, value] of response.headers.entries()) {
      responseHeaders.set(key, value);
    }

    // 添加 CORS 头
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });

  } catch (error) {
    console.error('Auth proxy error:', error);
    return jsonResponse({ error: 'Auth proxy failed', message: error.message }, 500);
  }
}

// 聊天完成处理
async function handleChatCompletion(request, env) {
  // 验证统一token
  if (!verifyUnifiedToken(request, env)) {
    return jsonResponse({ error: 'Invalid authorization token' }, 401);
  }

  try {
    // 获取可用的真实token
    const realToken = await getAvailableToken(env);
    if (!realToken) {
      return jsonResponse({ error: '当前无可用token，请在管理页面添加' }, 503);
    }

    // 解析请求
    const requestBody = await request.json();
    
    // 转发到真实的 Augment API
    const response = await forwardToAugment(realToken, requestBody);
    
    return response;
  } catch (error) {
    return jsonResponse({ error: 'Chat completion failed: ' + error.message }, 500);
  }
}

// 获取可用的真实token
async function getAvailableToken(env) {
  try {
    const { results } = await env.DB.prepare(
      'SELECT token, tenant_url FROM tokens WHERE status = ? ORDER BY RANDOM() LIMIT 1'
    ).bind('active').all();
    
    return results && results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Failed to get available token:', error);
    return null;
  }
}

// 转发到 Augment API
async function forwardToAugment(tokenInfo, requestBody) {
  const { token, tenant_url } = tokenInfo;
  
  // 构造 Augment 请求
  const augmentRequest = {
    messages: requestBody.messages,
    mode: requestBody.model.includes('agent') ? 'AGENT' : 'CHAT',
    model: requestBody.model
  };

  const response = await fetch(tenant_url + 'chat-stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'Augment2Api-CloudflareWorker/1.0'
    },
    body: JSON.stringify(augmentRequest)
  });

  if (!response.ok) {
    throw new Error(`Augment API error: ${response.status}`);
  }

  // 如果是流式响应，需要特殊处理
  if (requestBody.stream) {
    return handleStreamResponse(response, requestBody.model);
  } else {
    return handleNonStreamResponse(response, requestBody.model);
  }
}

// 处理非流式响应
async function handleNonStreamResponse(response, model) {
  const reader = response.body.getReader();
  let fullText = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = new TextDecoder().decode(value);
    const lines = chunk.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.text) {
            fullText += data.text;
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }
  }

  // 返回 OpenAI 格式的响应
  return jsonResponse({
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: fullText
      },
      finish_reason: 'stop'
    }],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
  });
}

// 处理流式响应
function handleStreamResponse(response, model) {
  // 创建转换流
  const { readable, writable } = new TransformStream({
    transform(chunk, controller) {
      const text = new TextDecoder().decode(chunk);
      const lines = text.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) {
              // 转换为 OpenAI 格式
              const openaiChunk = {
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: model,
                choices: [{
                  index: 0,
                  delta: {
                    role: 'assistant',
                    content: data.text
                  },
                  finish_reason: data.done ? 'stop' : null
                }]
              };
              
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(openaiChunk)}\n\n`));
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }
  });

  response.body.pipeTo(writable);
  
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// 验证统一token
function verifyUnifiedToken(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const config = getConfig(env);
  const token = authHeader.slice(7);
  return token === config.UNIFIED_TOKEN;
}

// JSON 响应辅助函数
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
