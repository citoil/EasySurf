document.getElementById('actionButton').addEventListener('click', async () => {
  const resultDiv = document.getElementById('result');
  resultDiv.textContent = '你好！这是一个Edge插件示例';
  
  // 获取当前标签页信息
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // 在控制台显示当前页面URL
  console.log('当前页面URL:', tab.url);
}); 