// 默认配置
const DEFAULT_CONFIG = {
    apiEndpoint: 'https://api.deepseek.com/v1/chat/completions',
    modelName: 'deepseek-chat'
};

// 发送日志到content script
async function sendLog(message, data = null) {
    const logMessage = `[时间统计] ${message}`;
    console.log(logMessage, data);
    
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            chrome.tabs.sendMessage(tab.id, {
                type: 'log',
                message: logMessage,
                data: data
            });
        }
    } catch (error) {
        console.error('发送日志失败:', error);
    }
}

// 初始化时输出日志
console.log('Background script loaded');

// 监听安装事件
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed');
});

// 处理来自content script的翻译请求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const startTime = performance.now();
    sendLog('收到翻译请求', request);
    
    if (request.type === 'translate') {
        sendLog('开始处理翻译', request.text.substring(0, 50) + '...');
        handleTranslation(request.text, request.mode || 'simple')
            .then(result => {
                const endTime = performance.now();
                sendLog('翻译完成', `总耗时: ${(endTime - startTime).toFixed(2)}ms`);
                sendResponse(result);
            })
            .catch(error => {
                const endTime = performance.now();
                sendLog('翻译失败', `总耗时: ${(endTime - startTime).toFixed(2)}ms, 错误: ${error.message}`);
                sendResponse({ error: error.message });
            });
        return true;
    }
});

// 调用API进行翻译
async function handleTranslation(text, mode) {
    const timings = {
        start: performance.now(),
        configLoaded: 0,
        requestSent: 0,
        responseReceived: 0,
        end: 0
    };
    
    sendLog('开始加载配置');
    
    const config = await new Promise(resolve => {
        chrome.storage.sync.get(['translatorConfig'], (result) => {
            timings.configLoaded = performance.now();
            sendLog('配置加载完成', `耗时: ${(timings.configLoaded - timings.start).toFixed(2)}ms`);
            resolve(result.translatorConfig || {});
        });
    });

    if (!config.apiKey) {
        throw new Error('请先设置API Key');
    }

    try {
        let messages;
        if (mode === 'annotate') {
            messages = [
                {
                    role: "system",
                    content: "你是一名英语教学助手，帮助中国程序员理解英文文本。请分析文本中可能难以理解的单词或短语，并提供准确的中文释义。返回格式必须是一个包含annotations数组的JSON对象。"
                },
                {
                    role: "user",
                    content: `我是一名中国的程序员，本科毕业英语水平，现在正在阅读下面的英语段落，请联系上下文，找出段落里对我来说不易理解的单词/短语，并且展示这个单词/短语在这句话中代表的意思。请严格按照如下JSON格式返回：
{
    "annotations": [
        {
            "word": "难词1",
            "meaning": "中文含义1"
        },
        {
            "word": "难词2",
            "meaning": "中文含义2"
        }
    ]
}

以下是需要分析的文本：
${text}`
                }
            ];
        } else {
            messages = [
                {
                    role: "system",
                    content: "你是一个翻译助手，请将用户输入的英文翻译成中文，只返回翻译结果，不需要解释或其他内容。"
                },
                {
                    role: "user",
                    content: text
                }
            ];
        }

        const requestBody = {
            model: config.modelName || DEFAULT_CONFIG.modelName,
            messages: messages,
            temperature: 0.3,
            response_format: mode === 'annotate' ? { type: "json_object" } : undefined
        };

        sendLog('准备发送API请求');
        timings.requestSent = performance.now();
        sendLog('请求准备完成', `耗时: ${(timings.requestSent - timings.configLoaded).toFixed(2)}ms`);
        
        const response = await fetch(config.apiEndpoint || DEFAULT_CONFIG.apiEndpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        timings.responseReceived = performance.now();
        sendLog('收到API响应', `耗时: ${(timings.responseReceived - timings.requestSent).toFixed(2)}ms`);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            sendLog('API错误', errorData);
            throw new Error(errorData.error?.message || `请求失败: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        timings.end = performance.now();
        sendLog('响应解析完成', `耗时: ${(timings.end - timings.responseReceived).toFixed(2)}ms`);

        const timingSummary = {
            '配置加载': `${(timings.configLoaded - timings.start).toFixed(2)}ms`,
            '请求准备': `${(timings.requestSent - timings.configLoaded).toFixed(2)}ms`,
            'API请求': `${(timings.responseReceived - timings.requestSent).toFixed(2)}ms`,
            '响应处理': `${(timings.end - timings.responseReceived).toFixed(2)}ms`,
            '总耗时': `${(timings.end - timings.start).toFixed(2)}ms`
        };

        if (mode === 'annotate') {
            try {
                // 解析返回的JSON
                let parsedData;
                if (typeof data.choices[0].message.content === 'string') {
                    parsedData = JSON.parse(data.choices[0].message.content);
                } else {
                    parsedData = data.choices[0].message.content;
                }

                // 验证数据格式
                if (!parsedData.annotations || !Array.isArray(parsedData.annotations)) {
                    throw new Error('API返回的数据格式不正确');
                }

                sendLog('翻译完成', timingSummary);
                return { annotations: parsedData.annotations };
            } catch (error) {
                sendLog('注释解析失败', error.message);
                throw new Error('注释数据格式错误');
            }
        } else {
            if (!data.choices?.[0]?.message?.content) {
                throw new Error('响应数据格式错误');
            }

            sendLog('翻译完成', timingSummary);
            return { translation: data.choices[0].message.content.trim() };
        }
    } catch (error) {
        sendLog('请求失败', error.message);
        throw error;
    }
} 