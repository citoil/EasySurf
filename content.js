let popup = null;

document.addEventListener('mouseup', async (event) => {
    const selectedText = window.getSelection().toString().trim();
    
    // 如果没有选中文本，或者选中的文本不是英文，则移除弹窗
    if (!selectedText || !/^[a-zA-Z\s.,!?'"()-]+$/.test(selectedText)) {
        removePopup();
        return;
    }

    // 创建或更新弹窗
    if (!popup) {
        popup = document.createElement('div');
        popup.className = 'translation-popup';
        document.body.appendChild(popup);
    }

    // 设置弹窗位置
    const rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
    popup.style.left = `${rect.left + window.scrollX}px`;
    popup.style.top = `${rect.bottom + window.scrollY + 10}px`;
    
    // 显示加载状态
    popup.innerHTML = '<p class="loading">正在翻译...</p>';
    
    try {
        // 发送消息给popup.js处理翻译
        chrome.runtime.sendMessage(
            { type: 'translate', text: selectedText },
            response => {
                if (chrome.runtime.lastError) {
                    console.error('Chrome runtime error:', chrome.runtime.lastError);
                    popup.innerHTML = `<p class="translation-text">错误: ${chrome.runtime.lastError.message}</p>`;
                    return;
                }
                
                if (response && response.translation) {
                    popup.innerHTML = `<p class="translation-text">${response.translation}</p>`;
                } else if (response && response.error) {
                    console.error('Translation error:', response.error);
                    popup.innerHTML = `<p class="translation-text">翻译失败: ${response.error}</p>`;
                } else {
                    popup.innerHTML = '<p class="translation-text">翻译服务异常，请检查配置</p>';
                }
            }
        );
    } catch (error) {
        console.error('Translation error:', error);
        popup.innerHTML = `<p class="translation-text">翻译出错: ${error.message}</p>`;
    }
});

// 点击页面其他地方时移除弹窗
document.addEventListener('mousedown', (event) => {
    if (popup && !popup.contains(event.target)) {
        removePopup();
    }
});

function removePopup() {
    if (popup) {
        popup.remove();
        popup = null;
    }
} 