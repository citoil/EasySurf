let overlay = null;

document.addEventListener('mouseup', async (event) => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    // 如果没有选中文本，或者选中的文本不是英文，则返回
    if (!selectedText || !/^[a-zA-Z\s.,!?'"()-]+$/.test(selectedText)) {
        return;
    }

    // 获取选中文本的范围
    const range = selection.getRangeAt(0);
    const selectedNode = range.commonAncestorContainer;

    // 确保我们不会翻译已经翻译过的文本
    if (selectedNode.parentElement.classList.contains('translation-text')) {
        return;
    }

    try {
        // 发送消息给background script处理翻译
        chrome.runtime.sendMessage(
            { type: 'translate', text: selectedText },
            response => {
                if (chrome.runtime.lastError) {
                    console.error('Chrome runtime error:', chrome.runtime.lastError);
                    return;
                }
                
                if (response && response.translation) {
                    // 创建翻译文本元素
                    const translationSpan = document.createElement('span');
                    translationSpan.className = 'translation-text';
                    translationSpan.style.color = '#2196F3';  // 使用蓝色
                    translationSpan.style.fontSize = '0.9em';
                    translationSpan.style.margin = '0 4px';
                    translationSpan.textContent = `「${response.translation}」`;

                    // 在原文后插入翻译
                    const newRange = document.createRange();
                    newRange.setStart(range.endContainer, range.endOffset);
                    newRange.setEnd(range.endContainer, range.endOffset);
                    newRange.insertNode(translationSpan);

                    // 清除选择
                    selection.removeAllRanges();
                } else if (response && response.error) {
                    console.error('Translation error:', response.error);
                }
            }
        );
    } catch (error) {
        console.error('Translation error:', error);
    }
});

// 点击页面其他地方时移除悬浮层
document.addEventListener('mousedown', (event) => {
    if (overlay && !overlay.contains(event.target)) {
        removeOverlay();
    }
});

// 滚动页面时更新悬浮层位置
document.addEventListener('scroll', () => {
    if (overlay) {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            const scrollX = window.scrollX || window.pageXOffset;
            const scrollY = window.scrollY || window.pageYOffset;
            
            overlay.style.left = `${rect.left + (rect.width / 2) + scrollX}px`;
            overlay.style.top = `${rect.top + scrollY}px`;
        }
    }
});

function removeOverlay() {
    if (overlay) {
        overlay.remove();
        overlay = null;
    }
} 