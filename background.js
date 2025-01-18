// 默认配置
const DEFAULT_CONFIG = {
    apiEndpoint: 'https://api.deepseek.com/v1/chat/completions',
    modelName: 'deepseek-chat'
};

// 初始化时输出日志
console.log('Background script loaded');

// 监听安装事件
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed');
});

// 处理来自content script的翻译请求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Received message:', request);
    
    if (request.type === 'translate') {
        console.log('Processing translation request for:', request.text);
        
        // 使用Promise包装异步操作
        (async () => {
            try {
                const translation = await handleTranslation(request.text);
                console.log('Translation successful:', translation);
                sendResponse({ translation });
            } catch (error) {
                console.error('Translation error:', error);
                sendResponse({ error: error.message });
            }
        })();
        
        return true; // 保持消息通道开放
    }
});

// 调用API进行翻译
async function handleTranslation(text) {
    console.log('Getting config from storage');
    
    const config = await new Promise(resolve => {
        chrome.storage.sync.get(['translatorConfig'], (result) => {
            console.log('Config loaded:', {
                hasKey: !!result.translatorConfig?.apiKey,
                endpoint: result.translatorConfig?.apiEndpoint || DEFAULT_CONFIG.apiEndpoint,
                model: result.translatorConfig?.modelName || DEFAULT_CONFIG.modelName
            });
            resolve(result.translatorConfig || {});
        });
    });

    if (!config.apiKey) {
        throw new Error('请先设置API Key');
    }

    try {
        const requestBody = {
            model: config.modelName || DEFAULT_CONFIG.modelName,
            messages: [
                {
                    role: "system",
                    content: "你是一个翻译助手，请将用户输入的英文翻译成中文，只返回翻译结果，不需要解释或其他内容。"
                },
                {
                    role: "user",
                    content: text
                }
            ],
            temperature: 0.3
        };

        console.log('Sending API request to:', config.apiEndpoint || DEFAULT_CONFIG.apiEndpoint);
        
        const response = await fetch(config.apiEndpoint || DEFAULT_CONFIG.apiEndpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        console.log('API response status:', response.status);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('API error:', errorData);
            throw new Error(errorData.error?.message || `请求失败: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log('API response data:', data);
        
        if (!data.choices?.[0]?.message?.content) {
            throw new Error('响应数据格式错误');
        }

        return data.choices[0].message.content.trim();
    } catch (error) {
        console.error('API request failed:', error);
        throw error;
    }
} 