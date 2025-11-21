// 全局变量
let isSelecting = false;
let startX = 0;
let startY = 0;
let selectionDiv = null;
let overlay = null;

// 初始化OCR相关变量
let Tesseract = null;
let worker = null;

// 监听来自popup的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "startCapture") {
    startScreenCapture();
    sendResponse({success: true});
  } else if (request.action === "translationResult") {
    console.log('收到翻译结果:', request);
    if (request.originalText && request.translatedText) {
      displayTranslationResult(request.originalText, request.translatedText);
    } else {
      console.error('翻译结果不完整:', request);
      showTooltip('翻译结果不完整，请重试');
    }
    sendResponse({success: true});
  }
});

// 开始屏幕区域选择
function startScreenCapture() {
  // 创建遮罩层
  createOverlay();
  
  // 添加事件监听器
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('keydown', onKeyDown);
  
  // 改变鼠标样式
  document.body.style.cursor = 'crosshair';
  
  showTooltip('请拖拽选择要翻译的区域，按ESC键取消');
}

// 创建遮罩层
function createOverlay() {
  overlay = document.createElement('div');
  overlay.id = 'translation-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.3);
    z-index: 999999;
    pointer-events: none;
  `;
  document.body.appendChild(overlay);
}

// 鼠标按下事件
function onMouseDown(e) {
  if (!overlay) return;
  
  isSelecting = true;
  startX = e.clientX;
  startY = e.clientY;
  
  // 创建选择框
  selectionDiv = document.createElement('div');
  selectionDiv.id = 'translation-selection';
  selectionDiv.style.cssText = `
    position: fixed;
    border: 2px dashed #4CAF50;
    background: rgba(76, 175, 80, 0.1);
    z-index: 1000000;
    pointer-events: none;
  `;
  document.body.appendChild(selectionDiv);
  
  e.preventDefault();
}

// 鼠标移动事件
function onMouseMove(e) {
  if (!isSelecting || !selectionDiv) return;
  
  const currentX = e.clientX;
  const currentY = e.clientY;
  
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  
  selectionDiv.style.left = left + 'px';
  selectionDiv.style.top = top + 'px';
  selectionDiv.style.width = width + 'px';
  selectionDiv.style.height = height + 'px';
  
  e.preventDefault();
}

// 鼠标松开事件
function onMouseUp(e) {
  if (!isSelecting || !selectionDiv) return;
  
  isSelecting = false;
  
  const rect = selectionDiv.getBoundingClientRect();
  
  // 检查选择区域大小
  if (rect.width < 10 || rect.height < 10) {
    showTooltip('选择区域太小，请重新选择');
    cleanupSelection();
    return;
  }
  
  // 捕获选定区域
  captureSelectedArea(rect);
  
  e.preventDefault();
}

// 键盘事件处理（ESC键取消）
function onKeyDown(e) {
  if (e.key === 'Escape') {
    cancelSelection();
  }
}

// 捕获选定区域
function captureSelectedArea(rect) {
  showTooltip('正在截取区域...');
  
  chrome.runtime.sendMessage({
    action: "captureVisibleTab",
    area: {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    }
  }, function(response) {
    if (response && response.imageDataUrl) {
      performOCR(response.imageDataUrl);
    } else {
      console.error('截图失败:', response?.error || '未知错误');
      showTooltip('截图失败，请重试');
      sendResponse({success: false, error: response?.error || '未知错误'});
      cleanupSelection();
    }
  });
}

// 执行OCR识别
function performOCR(imageDataUrl) {
  showTooltip('正在识别文字...');
  
  // 将OCR处理委托给background.js
  chrome.runtime.sendMessage({
    action: "performOCR",
    imageDataUrl: imageDataUrl
  }, function(response) {
    if (response && response.success && response.text) {
      const recognizedText = response.text ? response.text.trim() : '';
      console.log('OCR识别结果:', recognizedText);
      if (!recognizedText) {
        console.error('OCR识别结果为空');
        showTooltip('未能识别到文字，请重试');
        return;
      }
      if (recognizedText) {
        showTooltip('正在翻译...');
        // 发送识别到的文本到background script进行翻译
        chrome.runtime.sendMessage({
          action: "processText",
          text: recognizedText
        }, function(response) {
          console.log('翻译响应:', response);
          if (!response) {
            console.error('翻译响应为空');
            showTooltip('翻译失败，请重试');
            return;
          }
          if (!response.success) {
            showTooltip('翻译失败：' + (response?.error || '未知错误'));
          }
        });
      } else {
        showTooltip('未识别到文字，请确保选择区域包含清晰的英文文字');
      }
    } else {
      console.error('OCR识别失败:', response?.error || '未知错误');
      showTooltip('文字识别失败，请重试');
      chrome.runtime.sendMessage({
        action: "ocrFailed",
        error: response?.error || '未知错误'
      });
    }
    
    cleanupSelection();
  });
}

// 显示翻译结果
function displayTranslationResult(originalText, translatedText) {
  const resultDiv = document.createElement('div');
  resultDiv.id = 'translation-result';
  resultDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    max-width: 300px;
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 15px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 1000001;
    font-family: Arial, sans-serif;
    font-size: 14px;
  `;
  
  resultDiv.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
      <strong style="color: #4CAF50;">翻译结果</strong>
      <button id="close-translation" style="background: none; border: none; font-size: 18px; cursor: pointer;">&times;</button>
    </div>
    <div style="margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #eee;">
      <div style="font-size: 12px; color: #666; margin-bottom: 5px;">原文：</div>
      <div style="color: #333;">${originalText}</div>
    </div>
    <div>
      <div style="font-size: 12px; color: #666; margin-bottom: 5px;">译文：</div>
      <div style="color: #333; font-weight: 500;">${translatedText}</div>
    </div>
  `;
  
  document.body.appendChild(resultDiv);
  
  // 添加关闭按钮事件
  document.getElementById('close-translation').addEventListener('click', function() {
    resultDiv.remove();
  });
  
  // 5秒后自动关闭
  setTimeout(() => {
    if (resultDiv.parentNode) {
      resultDiv.remove();
    }
  }, 8000);
}

// 显示提示信息
function showTooltip(message) {
  // 移除现有的提示
  const existingTooltip = document.getElementById('translation-tooltip');
  if (existingTooltip) {
    existingTooltip.remove();
  }
  
  const tooltip = document.createElement('div');
  tooltip.id = 'translation-tooltip';
  tooltip.style.cssText = `
    position: fixed;
    top: 50px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 10px 20px;
    border-radius: 5px;
    z-index: 1000002;
    font-family: Arial, sans-serif;
    font-size: 14px;
  `;
  tooltip.textContent = message;
  
  document.body.appendChild(tooltip);
  
  // 3秒后自动移除
  setTimeout(() => {
    if (tooltip.parentNode) {
      tooltip.remove();
    }
  }, 3000);
}

// 取消选择
function cancelSelection() {
  cleanupSelection();
  showTooltip('已取消截图翻译');
}

// 清理选择相关元素
function cleanupSelection() {
  // 移除事件监听器
  document.removeEventListener('mousedown', onMouseDown);
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
  document.removeEventListener('keydown', onKeyDown);
  
  // 恢复鼠标样式
  document.body.style.cursor = '';
  
  // 移除遮罩层和选择框
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
  
  if (selectionDiv) {
    selectionDiv.remove();
    selectionDiv = null;
  }
  
  isSelecting = false;
}