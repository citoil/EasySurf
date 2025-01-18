// 默认配置
const DEFAULT_CONFIG = {
    apiEndpoint: 'https://api.deepseek.com/v1/chat/completions',
    modelName: 'deepseek-chat',
    enableSelectTranslate: true,
    enableShiftTranslate: true
};

// 调试日志函数
function debugLog(message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    if (data) {
        console.log('详细数据:', data);
    }
    
    // 更新UI中的调试输出
    const debugOutput = document.getElementById('debugOutput');
    const newLog = document.createElement('div');
    newLog.textContent = `${logMessage}\n${data ? JSON.stringify(data, null, 2) : ''}`;
    debugOutput.insertBefore(newLog, debugOutput.firstChild);
}

// 清除调试日志
document.getElementById('clearLogs').addEventListener('click', () => {
    document.getElementById('debugOutput').textContent = '日志已清除';
});

// 显示当前配置
document.getElementById('showConfig').addEventListener('click', async () => {
    const config = await new Promise(resolve => {
        chrome.storage.sync.get(['translatorConfig'], (result) => {
            resolve(result.translatorConfig || {});
        });
    });
    
    debugLog('当前配置', {
        apiEndpoint: config.apiEndpoint || DEFAULT_CONFIG.apiEndpoint,
        modelName: config.modelName || DEFAULT_CONFIG.modelName,
        hasApiKey: !!config.apiKey,
        enableSelectTranslate: config.enableSelectTranslate,
        enableShiftTranslate: config.enableShiftTranslate
    });
});

// 测试API连接
document.getElementById('testConnection').addEventListener('click', async () => {
    try {
        debugLog('开始测试连接...');
        const result = await handleTranslation('Hello, this is a test message.');
        debugLog('测试连接成功', { result });
    } catch (error) {
        debugLog('测试连接失败', { error: error.message });
    }
});

// 保存配置
document.getElementById('saveConfig').addEventListener('click', () => {
    const config = {
        apiKey: document.getElementById('apiKey').value.trim(),
        apiEndpoint: document.getElementById('apiEndpoint').value.trim() || DEFAULT_CONFIG.apiEndpoint,
        modelName: document.getElementById('modelName').value.trim() || DEFAULT_CONFIG.modelName,
        enableSelectTranslate: document.getElementById('enableSelectTranslate').checked,
        enableShiftTranslate: document.getElementById('enableShiftTranslate').checked
    };

    if (!config.apiKey) {
        alert('请输入API Key！');
        return;
    }

    chrome.storage.sync.set({
        'translatorConfig': config
    }, () => {
        debugLog('配置已保存', {
            endpoint: config.apiEndpoint,
            model: config.modelName,
            hasKey: !!config.apiKey,
            enableSelectTranslate: config.enableSelectTranslate,
            enableShiftTranslate: config.enableShiftTranslate
        });
        alert('配置已保存！');
    });
});

// 加载已保存的配置
chrome.storage.sync.get(['translatorConfig'], (result) => {
    const config = result.translatorConfig || {};
    if (config.apiKey) {
        document.getElementById('apiKey').value = config.apiKey;
    }
    if (config.apiEndpoint) {
        document.getElementById('apiEndpoint').value = config.apiEndpoint;
    }
    if (config.modelName) {
        document.getElementById('modelName').value = config.modelName;
    }
    if (typeof config.enableSelectTranslate !== 'undefined') {
        document.getElementById('enableSelectTranslate').checked = config.enableSelectTranslate;
    }
    if (typeof config.enableShiftTranslate !== 'undefined') {
        document.getElementById('enableShiftTranslate').checked = config.enableShiftTranslate;
    }
    debugLog('已加载配置', {
        hasEndpoint: !!config.apiEndpoint,
        hasModel: !!config.modelName,
        hasKey: !!config.apiKey,
        enableSelectTranslate: config.enableSelectTranslate,
        enableShiftTranslate: config.enableShiftTranslate
    });
});

// 处理来自content script的翻译请求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'translate') {
        debugLog('收到翻译请求', { text: request.text });
        translateText(request.text)
            .then(translation => {
                debugLog('翻译成功', { result: translation });
                sendResponse({ translation });
            })
            .catch(error => {
                debugLog('翻译失败', { error: error.message, stack: error.stack });
                sendResponse({ error: error.message });
            });
        return true; // 保持消息通道开放
    }
});

// 调用API进行翻译
async function translateText(text) {
    const config = await new Promise(resolve => {
        chrome.storage.sync.get(['translatorConfig'], (result) => {
            resolve(result.translatorConfig || {});
        });
    });

    if (!config.apiKey) {
        throw new Error('请先设置API Key');
    }

    debugLog('准备发送请求', {
        endpoint: config.apiEndpoint || DEFAULT_CONFIG.apiEndpoint,
        model: config.modelName || DEFAULT_CONFIG.modelName,
        textLength: text.length
    });

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

        debugLog('请求详情', {
            url: config.apiEndpoint || DEFAULT_CONFIG.apiEndpoint,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ****' // 隐藏实际的API Key
            },
            body: requestBody
        });

        const response = await fetch(config.apiEndpoint || DEFAULT_CONFIG.apiEndpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        debugLog('收到响应', {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries())
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            debugLog('请求失败', errorData);
            throw new Error(errorData.error?.message || `请求失败: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        debugLog('解析响应数据', data);
        
        if (!data.choices?.[0]?.message?.content) {
            throw new Error('响应数据格式错误');
        }

        return data.choices[0].message.content.trim();
    } catch (error) {
        debugLog('发生错误', {
            message: error.message,
            stack: error.stack
        });
        throw error;
    }
} 