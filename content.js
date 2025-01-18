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
    if (selectedNode.parentElement.classList.contains('translation-text') ||
        selectedNode.parentElement.classList.contains('translation-wrapper')) {
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
                    // 创建包装容器
                    const wrapper = document.createElement('span');
                    wrapper.className = 'translation-wrapper';
                    wrapper.style.display = 'inline-block';
                    wrapper.style.position = 'relative';
                    wrapper.style.textAlign = 'center';
                    wrapper.style.marginTop = '8px'; // 减少顶部间距
                    
                    // 获取父元素
                    const parentElement = range.commonAncestorContainer.parentElement;
                    if (parentElement) {
                        // 保持当前行距
                        parentElement.style.lineHeight = '1.8';
                    }

                    // 创建翻译文本元素
                    const translationSpan = document.createElement('div');
                    translationSpan.className = 'translation-text';
                    translationSpan.style.position = 'absolute';
                    translationSpan.style.bottom = '100%';
                    translationSpan.style.left = '50%';
                    translationSpan.style.transform = 'translateX(-50%)';
                    translationSpan.style.color = '#666';
                    translationSpan.style.fontSize = '12px';
                    translationSpan.style.lineHeight = '1';
                    translationSpan.style.whiteSpace = 'nowrap';
                    translationSpan.style.marginBottom = '-4px'; // 让翻译文字更靠近原文
                    translationSpan.style.backgroundColor = 'rgba(255, 255, 255, 0.95)'; // 增加背景不透明度
                    translationSpan.style.padding = '1px 4px';
                    translationSpan.style.borderRadius = '2px'; // 添加圆角
                    translationSpan.textContent = response.translation;

                    // 创建原文容器
                    const originalTextSpan = document.createElement('span');
                    originalTextSpan.textContent = selectedText;
                    // 使用text-decoration实现波浪下划线
                    originalTextSpan.style.textDecoration = 'wavy underline #4CAF50';
                    originalTextSpan.style.textDecorationSkipInk = 'none'; // 确保下划线完整显示
                    originalTextSpan.style.textUnderlineOffset = '2px'; // 调整下划线距离
                    originalTextSpan.style.display = 'inline-block';
                    originalTextSpan.style.lineHeight = '1.1';

                    // 组装DOM结构
                    wrapper.appendChild(translationSpan);
                    wrapper.appendChild(originalTextSpan);

                    // 替换原文
                    const newRange = document.createRange();
                    range.deleteContents();
                    range.insertNode(wrapper);

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