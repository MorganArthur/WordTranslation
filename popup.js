document.addEventListener('DOMContentLoaded', function() {
  const startCaptureButton = document.getElementById('startCapture');
  const statusElement = document.getElementById('status');
  const translationResultElement = document.getElementById('translationResult');
  const originalTextElement = document.getElementById('originalText');
  const translatedTextElement = document.getElementById('translatedText');
  const settingsButton = document.getElementById('settingsBtn');
  const configNotice = document.getElementById('configNotice');
  const configLink = document.getElementById('configLink');
  
  // 显示状态消息的辅助函数
  function showStatus(message, type = 'info') {
    statusElement.textContent = message;
    statusElement.className = `status ${type}`;
    statusElement.style.display = 'block';
    
    if (type !== 'error') {
      // 非错误消息10秒后自动隐藏
      setTimeout(() => {
        statusElement.style.display = 'none';
      }, 10000);
    }
  }
  
  // 检查API配置是否完整
  function checkApiConfig() {
    chrome.storage.sync.get(['aliCloudConfig'], function(result) {
      if (result.aliCloudConfig && 
          result.aliCloudConfig.accessKeyId && 
          result.aliCloudConfig.accessKeySecret) {
        // 配置完整，隐藏提醒
        configNotice.style.display = 'none';
        startCaptureButton.disabled = false;
      } else {
        // 配置不完整，显示提醒
        configNotice.style.display = 'block';
        startCaptureButton.disabled = true;
      }
    });
  }
  
  // 打开配置页面
  function openConfigPage() {
    chrome.tabs.create({
      url: chrome.runtime.getURL('config.html')
    });
  }
  
  // 设置按钮点击事件
  settingsButton.addEventListener('click', openConfigPage);
  configLink.addEventListener('click', function(e) {
    e.preventDefault();
    openConfigPage();
  });
  
  // 开始捕获屏幕区域
  startCaptureButton.addEventListener('click', function() {
    // 禁用按钮防止重复点击
    startCaptureButton.disabled = true;
    showStatus('正在准备截图工具...');
    
    // 向当前标签页的content script发送消息，启动区域选择
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: "startCapture"}, function(response) {
        // 如果出错(例如content script尚未加载)
        if (chrome.runtime.lastError) {
          console.error("Error sending message:", chrome.runtime.lastError);
          showStatus('出错了！请刷新页面后重试', 'error');
          startCaptureButton.disabled = false;
          return;
        }
        
        if (response && response.success) {
          showStatus('请在页面上选择要翻译的区域');
          window.close(); // 关闭弹窗以便用户选择区域
        } else {
          showStatus('无法启动截图工具，请刷新页面后重试', 'error');
          startCaptureButton.disabled = false;
        }
      });
    });
  });
  
  // 监听来自background script的消息
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === "translationComplete") {
      // 显示翻译结果
      originalTextElement.textContent = request.originalText;
      translatedTextElement.textContent = request.translatedText;
      translationResultElement.style.display = 'block';
      
      // 重新启用按钮
      startCaptureButton.disabled = false;
      showStatus('翻译完成!', 'success');
      
      sendResponse({success: true});
    }
  });
  
  // 页面加载时检查配置
  checkApiConfig();
  
  // 监听存储变化，当配置更新时重新检查
  chrome.storage.onChanged.addListener(function(changes, namespace) {
    if (namespace === 'sync' && changes.aliCloudConfig) {
      checkApiConfig();
    }
  });
});