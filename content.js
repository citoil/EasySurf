let overlay = null;
let lastShiftTime = 0;
let currentParagraph = null;
let config = {
    enableSelectTranslate: true,
    enableShiftTranslate: true,
    maxConcurrent: 5
};

// 添加全局翻译缓存
const translationCache = new Map(); // 存储所有已翻译的单词

// 用于记录已翻译的段落
const translatedParagraphs = new WeakSet();

// 创建一个全局 Set 来跟踪所有已经翻译过的单词
const globalProcessedWords = new Set();

// 添加样式定义
const STYLES = {
    wrapper: {
        display: 'inline-block',
        position: 'relative',
        textAlign: 'center',
        marginTop: '4px'
    },
    translation: {
        position: 'absolute',
        bottom: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        color: '#666',
        fontSize: '12px',
        lineHeight: '1',
        whiteSpace: 'nowrap',
        marginBottom: '-4px',
        backgroundColor: 'transparent',
        padding: '0px 4px',
        borderRadius: '2px',
        fontFamily: 'system-ui, -apple-system, sans-serif'
    },
    original: {
        textDecoration: 'wavy underline #4CAF50',
        textDecorationSkipInk: 'none',
        textUnderlineOffset: '2px',
        display: 'inline-block',
        lineHeight: '1',
        padding: '0 1px'
    },
    overlay: {
        position: 'absolute',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '14px',
        lineHeight: '1.4',
        zIndex: '10000',
        pointerEvents: 'none',
        transform: 'translateY(-100%)',
        marginTop: '-8px',
        maxWidth: '200px',
        textAlign: 'center',
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word'
    },
    spinner: {
        display: 'inline-block',
        width: '16px',
        height: '16px',
        marginLeft: '8px',
        border: '2px solid #4CAF50',
        borderTopColor: 'transparent',
        borderRadius: '50%',
        verticalAlign: 'middle',
        animation: 'spin 1s linear infinite'
    }
};

// 将对象转换为样式字符串
function objectToStyle(obj) {
    return Object.entries(obj)
        .map(([key, value]) => `${key.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}:${value}`)
        .join(';');
}

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
                    Object.assign(wrapper.style, STYLES.wrapper);
                    
                    // 创建翻译文本元素
                    const translationSpan = document.createElement('div');
                    translationSpan.className = 'translation-text';
                    Object.assign(translationSpan.style, STYLES.translation);
                    translationSpan.textContent = response.translation;

                    // 创建原文容器
                    const originalTextSpan = document.createElement('span');
                    originalTextSpan.textContent = selectedText;
                    Object.assign(originalTextSpan.style, STYLES.original);

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
    Object.assign(spinner.style, STYLES.spinner);

    // 添加动画样式
    if (!document.querySelector('#translation-spinner-style')) {
        const style = document.createElement('style');
        style.id = 'translation-spinner-style';
        style.textContent = `
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    return spinner;
}

// 处理段落标注
async function handleParagraphAnnotation(paragraph) {
    if (!config.enableShiftTranslate) return;
    
    // 确保不重复处理已标注的段落
    if (translatedParagraphs.has(paragraph)) {
        console.log('段落已经标注过了');
        return;
    }

    // 获取纯文本内容
    const text = paragraph.textContent.trim();
    if (!text) {
        console.log('空段落');
        return;
    }

    // 添加加载指示器
    const spinner = createLoadingSpinner();
    paragraph.appendChild(spinner);

    try {
        // 先检查缓存中是否有需要翻译的新单词
        const wordsToTranslate = new Set();
        const annotations = [];
        const words = text.match(/\b[a-zA-Z]+\b/g) || [];
        
        // 用于跟踪本段落中已处理的单词（小写形式）
        const processedWords = new Set();
        
        words.forEach(word => {
            const wordLower = word.toLowerCase();
            // 检查单词是否已在本段落中处理过
            if (processedWords.has(wordLower)) {
                return;
            }
            
            if (translationCache.has(wordLower)) {
                // 如果单词在缓存中，直接添加到注释列表
                annotations.push({
                    word: word,
                    meaning: translationCache.get(wordLower)
                });
                processedWords.add(wordLower);
            } else {
                wordsToTranslate.add(word);
            }
        });

        // 检查单词是否已经在全局范围内处理过
        const isFirstGlobalOccurrence = (word) => {
            const lowerWord = word.toLowerCase();
            if (globalProcessedWords.has(lowerWord)) {
                return false;
            }
            globalProcessedWords.add(lowerWord);
            return true;
        };

        // 如果有新单词需要翻译，则调用API
        if (wordsToTranslate.size > 0) {
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
                        // 将新翻译的单词添加到缓存
                        response.annotations.forEach(annotation => {
                            if (annotation.word && annotation.meaning) {
                                const wordLower = annotation.word.toLowerCase();
                                if (!processedWords.has(wordLower)) {
                                    translationCache.set(wordLower, annotation.meaning);
                                    annotations.push(annotation);
                                    processedWords.add(wordLower);
                                }
                            }
                        });

                        processAnnotations(paragraph, text, annotations);
                    }
                }
            );
        } else {
            // 如果所有单词都在缓存中，直接处理注释
            spinner.remove();
            processAnnotations(paragraph, text, annotations);
        }
    } catch (error) {
        spinner.remove();
        console.error('注释处理错误', error.message);
    }
}

// 修改处理注释的函数
function processAnnotations(paragraph, text, annotations) {
    const startProcess = performance.now();
    console.log('开始处理注释', `注释数量: ${annotations.length}`);

    // 创建一个新的文本节点来存储处理后的内容
    let processedText = text;
    const replacements = [];

    // 预处理：将所有注释按词长度排序（从长到短）
    const sortedAnnotations = annotations.sort((a, b) => b.word.length - a.word.length);

    // 第一步：收集所有需要替换的位置
    sortedAnnotations.forEach(annotation => {
        if (!annotation.word || !annotation.meaning) return;

        const word = annotation.word;
        const meaning = annotation.meaning;
        const wordLower = word.toLowerCase();
        const regex = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'gi');
        
        let match;
        while ((match = regex.exec(processedText)) !== null) {
            // 检查这个位置是否已经被标记为需要替换
            const isOverlap = replacements.some(r => 
                (match.index >= r.start && match.index < r.end) ||
                (match.index + match[0].length > r.start && match.index + match[0].length <= r.end)
            );

            // 检查这个单词是否是全局首次出现
            const isFirstGlobalOccurrence = !globalProcessedWords.has(wordLower);

            if (!isOverlap) {
                if (isFirstGlobalOccurrence) {
                    // 如果是全局首次出现，添加翻译和下划线
                    replacements.push({
                        start: match.index,
                        end: match.index + match[0].length,
                        original: match[0],
                        meaning: meaning,
                        showTranslation: true
                    });
                    // 将单词添加到全局已处理集合中
                    globalProcessedWords.add(wordLower);
                }
                // 如果不是首次出现，不做任何处理
            }
        }
    });

    // 第二步：按位置排序（从后往前）
    replacements.sort((a, b) => b.start - a.start);

    // 第三步：创建最终的HTML
    let finalHtml = processedText;
    replacements.forEach(replacement => {
        const before = finalHtml.slice(0, replacement.start);
        const after = finalHtml.slice(replacement.end);
        const annotatedWord = replacement.showTranslation ? 
            `<span class="translation-wrapper" style="${objectToStyle(STYLES.wrapper)}">
                <div class="translation-text" style="${objectToStyle(STYLES.translation)}">${escapeHtml(replacement.meaning)}</div>
                <span style="${objectToStyle(STYLES.original)}">${escapeHtml(replacement.original)}</span>
            </span>` :
            replacement.original;
        
        finalHtml = before + annotatedWord + after;
    });

    // 更新DOM
    const endProcess = performance.now();
    paragraph.innerHTML = finalHtml;
    const endUpdate = performance.now();

    // 记录性能数据
    console.log('注释处理完成', {
        '处理耗时': `${(endProcess - startProcess).toFixed(2)}ms`,
        'DOM更新耗时': `${(endUpdate - endProcess).toFixed(2)}ms`,
        '总耗时': `${(endUpdate - startProcess).toFixed(2)}ms`,
        '全局已处理单词数': globalProcessedWords.size,
        '缓存单词数': translationCache.size,
        '本次处理单词数': replacements.length
    });

    // 将段落添加到已翻译集合中
    translatedParagraphs.add(paragraph);
    paragraph.style.lineHeight = '1.7';
}

// 辅助函数：转义正则表达式特殊字符
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 辅助函数：转义HTML特殊字符
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
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