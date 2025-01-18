let overlay = null;
let lastShiftTime = 0;
let currentParagraph = null;
let config = {
    enableSelectTranslate: true,
    enableShiftTranslate: true
};

// 加载配置
function loadConfig() {
    chrome.storage.sync.get(['translatorConfig'], (result) => {
        if (result.translatorConfig) {
            config.enableSelectTranslate = result.translatorConfig.enableSelectTranslate;
            config.enableShiftTranslate = result.translatorConfig.enableShiftTranslate;
        }
    });
}

// 初始加载配置
loadConfig();

// 监听配置变化
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.translatorConfig) {
        const newConfig = changes.translatorConfig.newValue;
        config.enableSelectTranslate = newConfig.enableSelectTranslate;
        config.enableShiftTranslate = newConfig.enableShiftTranslate;
    }
});

// 跟踪鼠标悬停的段落
document.addEventListener('mousemove', (event) => {
    if (!config.enableShiftTranslate) return;
    
    const element = event.target;
    // 检查是否是文本段落（包含文本内容的元素）
    if (element.textContent && element.textContent.trim() && !element.classList.contains('translation-text')) {
        currentParagraph = element;
    }
});

// 监听键盘事件，检测双击Shift
document.addEventListener('keydown', (event) => {
    if (!config.enableShiftTranslate) return;
    
    if (event.key === 'Shift') {
        const currentTime = new Date().getTime();
        if (currentTime - lastShiftTime <= 500) { // 500ms内的两次Shift按键视为双击
            if (currentParagraph) {
                console.log('Annotating paragraph:', currentParagraph.textContent.substring(0, 50) + '...');
                handleParagraphAnnotation(currentParagraph);
            } else {
                console.log('No paragraph selected');
            }
            lastShiftTime = 0; // 重置计时器
        } else {
            lastShiftTime = currentTime;
        }
    }
});

// 处理单个单词的翻译
async function handleWordTranslation(event) {
    if (!config.enableSelectTranslate) return;
    
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
            { type: 'translate', text: selectedText, mode: 'simple' },
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
                    wrapper.style.marginTop = '8px';
                    
                    // 获取父元素
                    const parentElement = range.commonAncestorContainer.parentElement;
                    if (parentElement) {
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
                    translationSpan.style.marginBottom = '-4px';
                    translationSpan.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
                    translationSpan.style.padding = '1px 4px';
                    translationSpan.style.borderRadius = '2px';
                    translationSpan.textContent = response.translation;

                    // 创建原文容器
                    const originalTextSpan = document.createElement('span');
                    originalTextSpan.textContent = selectedText;
                    originalTextSpan.style.textDecoration = 'wavy underline #4CAF50';
                    originalTextSpan.style.textDecorationSkipInk = 'none';
                    originalTextSpan.style.textUnderlineOffset = '2px';
                    originalTextSpan.style.display = 'inline-block';
                    originalTextSpan.style.lineHeight = '1.1';

                    // 组装DOM结构
                    wrapper.appendChild(translationSpan);
                    wrapper.appendChild(originalTextSpan);

                    // 替换原文
                    range.deleteContents();
                    range.insertNode(wrapper);

                    // 清除选择
                    selection.removeAllRanges();
                }
            }
        );
    } catch (error) {
        console.error('Translation error:', error);
    }
}

// 处理段落标注
async function handleParagraphAnnotation(paragraph) {
    if (!config.enableShiftTranslate) return;
    
    // 确保不重复处理已标注的段落
    if (paragraph.classList.contains('annotated')) {
        console.log('Paragraph already annotated');
        return;
    }

    const text = paragraph.textContent.trim();
    if (!text) {
        console.log('Empty paragraph');
        return;
    }

    try {
        chrome.runtime.sendMessage(
            { type: 'translate', text: text, mode: 'annotate' },
            response => {
                if (chrome.runtime.lastError) {
                    console.error('Chrome runtime error:', chrome.runtime.lastError);
                    return;
                }

                if (response && response.annotations && Array.isArray(response.annotations)) {
                    const annotations = response.annotations;
                    console.log('Received annotations:', annotations);
                    
                    // 创建一个临时容器来存储原始内容
                    const tempContainer = document.createElement('div');
                    tempContainer.innerHTML = paragraph.innerHTML;
                    
                    // 处理每个需要标注的词
                    annotations.forEach(annotation => {
                        if (!annotation.word || !annotation.meaning) {
                            console.warn('Invalid annotation:', annotation);
                            return;
                        }

                        const word = annotation.word;
                        const meaning = annotation.meaning;
                        
                        try {
                            // 使用正则表达式找到所有匹配的词（不区分大小写）
                            const regex = new RegExp(`\\b${word}\\b`, 'gi');
                            tempContainer.innerHTML = tempContainer.innerHTML.replace(regex, match => {
                                return `<span class="translation-wrapper" style="display: inline-block; position: relative; text-align: center; margin-top: 8px;">
                                    <div class="translation-text" style="position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); color: #666; font-size: 12px; line-height: 1; white-space: nowrap; margin-bottom: -4px; background-color: rgba(255, 255, 255, 0.95); padding: 1px 4px; border-radius: 2px;">${meaning}</div>
                                    <span style="text-decoration: wavy underline #4CAF50; text-decoration-skip-ink: none; text-underline-offset: 2px; display: inline-block; line-height: 1.1;">${match}</span>
                                </span>`;
                            });
                        } catch (error) {
                            console.error('Error processing annotation:', error, annotation);
                        }
                    });

                    // 更新段落内容
                    paragraph.innerHTML = tempContainer.innerHTML;
                    paragraph.classList.add('annotated');
                    paragraph.style.lineHeight = '1.8';
                    console.log('Annotation completed');
                } else {
                    console.error('Invalid response format:', response);
                }
            }
        );
    } catch (error) {
        console.error('Annotation error:', error);
    }
}

// 监听鼠标事件（保留单词翻译功能）
document.addEventListener('mouseup', handleWordTranslation);

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