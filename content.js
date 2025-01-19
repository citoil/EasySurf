let overlay = null;
let lastShiftTime = 0;
let currentParagraph = null;
let config = {
    enableSelectTranslate: true,
    enableShiftTranslate: true,
    maxConcurrent: 5
};

// 用于记录已翻译的段落
const translatedParagraphs = new WeakSet();

// 加载配置
function loadConfig() {
    chrome.storage.sync.get(['translatorConfig'], (result) => {
        if (result.translatorConfig) {
            config = { ...config, ...result.translatorConfig };
        }
    });
}

// 初始加载配置
loadConfig();

// 监听配置变化
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.translatorConfig) {
        const newConfig = changes.translatorConfig.newValue;
        config = { ...config, ...newConfig };
    }
});

// 获取页面中所有可翻译的段落
function getAllParagraphs() {
    const paragraphs = [];
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function(node) {
                // 检查节点是否包含英文文本
                if (!/[a-zA-Z]/.test(node.textContent)) {
                    return NodeFilter.FILTER_REJECT;
                }
                
                // 检查父节点是否是已翻译的元素
                if (node.parentElement.classList.contains('translation-text') ||
                    node.parentElement.classList.contains('translation-wrapper')) {
                    return NodeFilter.FILTER_REJECT;
                }
                
                // 检查文本是否为空或只包含空白字符
                if (!node.textContent.trim()) {
                    return NodeFilter.FILTER_REJECT;
                }
                
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    let node;
    while (node = walker.nextNode()) {
        if (node.parentElement && !translatedParagraphs.has(node.parentElement)) {
            paragraphs.push(node.parentElement);
        }
    }
    
    return [...new Set(paragraphs)]; // 去重
}

// 使用信号量控制并发
class Semaphore {
    constructor(max) {
        this.max = max;
        this.count = 0;
        this.queue = [];
    }

    async acquire() {
        if (this.count < this.max) {
            this.count++;
            return Promise.resolve();
        }

        return new Promise(resolve => this.queue.push(resolve));
    }

    release() {
        this.count--;
        if (this.queue.length > 0) {
            this.count++;
            const next = this.queue.shift();
            next();
        }
    }
}

// 处理整页翻译
async function handlePageTranslation() {
    const paragraphs = getAllParagraphs();
    if (paragraphs.length === 0) {
        console.log('No paragraphs found for translation');
        return;
    }

    console.log(`Found ${paragraphs.length} paragraphs to translate`);
    const semaphore = new Semaphore(config.maxConcurrent);
    const promises = [];

    for (const paragraph of paragraphs) {
        const promise = (async () => {
            await semaphore.acquire();
            try {
                await handleParagraphAnnotation(paragraph);
            } finally {
                semaphore.release();
            }
        })();
        promises.push(promise);
    }

    try {
        await Promise.all(promises);
        console.log('Page translation completed');
    } catch (error) {
        console.error('Error during page translation:', error);
    }
}

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
                // 检查段落是否已经翻译过
                if (translatedParagraphs.has(currentParagraph)) {
                    console.log('段落已经翻译过了');
                    return;
                }
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

// 创建加载指示器
function createLoadingSpinner() {
    const spinner = document.createElement('div');
    spinner.className = 'translation-spinner';
    spinner.style.cssText = `
        display: inline-block;
        width: 16px;
        height: 16px;
        margin-left: 8px;
        border: 2px solid #4CAF50;
        border-top-color: transparent;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        vertical-align: middle;
    `;

    // 添加动画样式
    const style = document.createElement('style');
    style.textContent = `
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);

    return spinner;
}

// 处理段落标注
async function handleParagraphAnnotation(paragraph) {
    if (!config.enableShiftTranslate) return;
    
    // 确保不重复处理已标注的段落
    if (translatedParagraphs.has(paragraph)) {
        console.log('Paragraph already annotated');
        return;
    }

    const text = paragraph.textContent.trim();
    if (!text) {
        console.log('Empty paragraph');
        return;
    }

    // 添加加载指示器
    const spinner = createLoadingSpinner();
    paragraph.appendChild(spinner);

    try {
        chrome.runtime.sendMessage(
            { type: 'translate', text: text, mode: 'annotate' },
            response => {
                // 移除加载指示器
                spinner.remove();

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
                    // 将段落添加到已翻译集合中
                    translatedParagraphs.add(paragraph);
                    paragraph.style.lineHeight = '1.8';
                    console.log('Annotation completed');
                } else {
                    console.error('Invalid response format:', response);
                }
            }
        );
    } catch (error) {
        // 发生错误时也移除加载指示器
        spinner.remove();
        console.error('Annotation error:', error);
    }
}

// 在文件开头添加日志处理函数
function logToConsole(message, data) {
    const style = 'color: #2196F3; font-weight: bold;';
    if (data) {
        console.log('%c' + message, style, data);
    } else {
        console.log('%c' + message, style);
    }
}

// 在现有的消息监听器中添加日志处理
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'log') {
        logToConsole(request.message, request.data);
        return;
    }
    
    if (request.type === 'translatePage') {
        handlePageTranslation().then(() => {
            sendResponse({ success: true });
        }).catch(error => {
            console.error('Page translation error:', error);
            sendResponse({ success: false, error: error.message });
        });
        return true;
    }
});

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