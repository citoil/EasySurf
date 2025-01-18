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
        handleTranslation(request.text, request.mode || 'simple')
            .then(result => {
                console.log('Translation successful:', result);
                sendResponse(result);
            })
            .catch(error => {
                console.error('Translation error:', error);
                sendResponse({ error: error.message });
            });
        return true;
    }
});

// 调用API进行翻译
async function handleTranslation(text, mode) {
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

                return { annotations: parsedData.annotations };
            } catch (error) {
                console.error('Failed to parse annotations:', error);
                throw new Error('注释数据格式错误');
            }
        } else {
            if (!data.choices?.[0]?.message?.content) {
                throw new Error('响应数据格式错误');
            }
            return { translation: data.choices[0].message.content.trim() };
        }
    } catch (error) {
        console.error('API request failed:', error);
        throw error;
    }
} 