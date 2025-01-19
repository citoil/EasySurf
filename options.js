// 默认配置
const DEFAULT_CONFIG = {
    apiEndpoint: 'https://api.deepseek.com/v1/chat/completions',
    modelName: 'deepseek-chat',
    enableSelectTranslate: true,
    enableShiftTranslate: true,
    maxConcurrent: 5
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

// 显示状态消息
function showStatusMessage(message, isError = false) {
    const statusElement = document.getElementById('statusMessage');
    statusElement.textContent = message;
    statusElement.className = 'status-message ' + (isError ? 'error' : 'success');
    setTimeout(() => {
        statusElement.style.display = 'none';
    }, 3000);
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
        maxConcurrent: config.maxConcurrent || DEFAULT_CONFIG.maxConcurrent
    });
});

// 测试API连接
document.getElementById('testConnection').addEventListener('click', async () => {
    const config = await new Promise(resolve => {
        chrome.storage.sync.get(['translatorConfig'], (result) => {
            resolve(result.translatorConfig || {});
        });
    });

    if (!config.apiKey) {
        showStatusMessage('请先配置API Key', true);
        return;
    }

    try {
        debugLog('开始测试连接...');
        const response = await fetch(config.apiEndpoint || DEFAULT_CONFIG.apiEndpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: config.modelName || DEFAULT_CONFIG.modelName,
                messages: [
                    {
                        role: "system",
                        content: "你是一个翻译助手，请将用户输入的英文翻译成中文，只返回翻译结果，不需要解释或其他内容。"
                    },
                    {
                        role: "user",
                        content: "Hello, this is a test message."
                    }
                ],
                temperature: 0.3
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `请求失败: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (!data.choices?.[0]?.message?.content) {
            throw new Error('响应数据格式错误');
        }

        debugLog('测试连接成功', { translation: data.choices[0].message.content });
        showStatusMessage('连接测试成功！');
    } catch (error) {
        debugLog('测试连接失败', { error: error.message });
        showStatusMessage('连接测试失败：' + error.message, true);
    }
});

// 保存配置
document.getElementById('saveConfig').addEventListener('click', () => {
    const maxConcurrent = parseInt(document.getElementById('maxConcurrent').value);
    if (maxConcurrent < 1 || maxConcurrent > 10) {
        showStatusMessage('并发数必须在1-10之间', true);
        return;
    }

    const config = {
        apiKey: document.getElementById('apiKey').value.trim(),
        apiEndpoint: document.getElementById('apiEndpoint').value.trim() || DEFAULT_CONFIG.apiEndpoint,
        modelName: document.getElementById('modelName').value.trim() || DEFAULT_CONFIG.modelName,
        maxConcurrent: maxConcurrent,
        enableSelectTranslate: true,
        enableShiftTranslate: true
    };

    if (!config.apiKey) {
        showStatusMessage('请输入API Key！', true);
        return;
    }

    chrome.storage.sync.set({
        'translatorConfig': config
    }, () => {
        debugLog('配置已保存', {
            endpoint: config.apiEndpoint,
            model: config.modelName,
            hasKey: !!config.apiKey,
            maxConcurrent: config.maxConcurrent
        });
        showStatusMessage('配置已保存！');
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
    if (config.maxConcurrent) {
        document.getElementById('maxConcurrent').value = config.maxConcurrent;
    }
    debugLog('已加载配置', {
        hasEndpoint: !!config.apiEndpoint,
        hasModel: !!config.modelName,
        hasKey: !!config.apiKey,
        maxConcurrent: config.maxConcurrent || DEFAULT_CONFIG.maxConcurrent
    });
}); 