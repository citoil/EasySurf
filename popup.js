// 打开选项页面
document.getElementById('openOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
});

// 加载配置
chrome.storage.sync.get(['translatorConfig'], (result) => {
    const config = result.translatorConfig || {};
    
    // 设置功能开关状态
    if (typeof config.enableSelectTranslate !== 'undefined') {
        document.getElementById('enableSelectTranslate').checked = config.enableSelectTranslate;
    }
    if (typeof config.enableShiftTranslate !== 'undefined') {
        document.getElementById('enableShiftTranslate').checked = config.enableShiftTranslate;
    }
});

// 保存功能开关状态
function saveFeatureToggles() {
    chrome.storage.sync.get(['translatorConfig'], (result) => {
        const config = result.translatorConfig || {};
        config.enableSelectTranslate = document.getElementById('enableSelectTranslate').checked;
        config.enableShiftTranslate = document.getElementById('enableShiftTranslate').checked;
        
        chrome.storage.sync.set({
            'translatorConfig': config
        });
    });
}

// 监听功能开关变化
document.getElementById('enableSelectTranslate').addEventListener('change', saveFeatureToggles);
document.getElementById('enableShiftTranslate').addEventListener('change', saveFeatureToggles);

// 整页翻译功能
document.getElementById('translatePage').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // 发送消息给content script开始整页翻译
    chrome.tabs.sendMessage(tab.id, { 
        type: 'translatePage'
    }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('Error:', chrome.runtime.lastError);
            return;
        }
        
        if (response && response.success) {
            window.close(); // 关闭popup
        }
    });
}); 