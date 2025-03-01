这个扩展主要通过以下方式保持原有样式:

```js
// 1. 使用 mark 标签包裹翻译文本,保持原有元素结构
const translatedNode = document.createElement('mark')
translatedNode.className = 'immersive-translate-target-translation'
translatedNode.textContent = translatedText
originalNode.parentNode.insertBefore(translatedNode, originalNode.nextSibling)

// 2. 通过 CSS 继承原有样式
.immersive-translate-target-translation {
  display: inherit;
  font: inherit;
  margin: inherit;
  padding: inherit;
  // 继承其他样式...
}
```

扩展通过以下几个方面来识别需要翻译的正文:

```js
// 1. 通过标签选择器过滤
const contentSelectors = [
  'article',
  '.article',
  '.post',
  '.content',
  'main',
  '#main'
]

// 2. 排除不需要翻译的元素
const excludeSelectors = [
  'code',
  'pre',
  'time',
  'script',
  'style',
  'input',
  'textarea'
]

// 3. 通过文本长度判断
function isValidTextNode(node) {
  const text = node.textContent.trim()
  return text.length > MIN_TEXT_LENGTH // 通常设置一个最小长度阈值
}

// 4. 通过位置判断
function isInViewport(element) {
  const rect = element.getBoundingClientRect()
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= window.innerHeight &&
    rect.right <= window.innerWidth
  )
}
```