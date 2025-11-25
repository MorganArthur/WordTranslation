// 扩展安装或更新时触发的事件
chrome.runtime.onInstalled.addListener(function() {
  console.log('屏幕翻译助手已安装');
});

// 从Chrome存储加载API配置
let aliCloudConfig = {
  accessKeyId: '',
  accessKeySecret: '',
  endpoint: 'http://mt.cn-hangzhou.aliyuncs.com',
  apiPath: '/api/translate/web/ecommerce'
};

let ocrSpaceConfig = {
  apiKey: 'helloworld' // 默认使用免费API密钥
};

// 加载保存的配置
function loadConfig() {
  chrome.storage.sync.get(['aliCloudConfig'], function(result) {
    if (result.aliCloudConfig) {
      aliCloudConfig = {...aliCloudConfig, ...result.aliCloudConfig};
      console.log('配置已加载');
    } else {
      console.log('未找到保存的配置');
    }
  });
}

// 初始加载配置
loadConfig();

// 尝试加载配置文件
try {
  // 注意：在Chrome扩展中，需要通过其他方式加载配置
  // 这里提供一个基本的框架，实际使用时需要用户手动配置
  console.log('请在扩展设置中配置API密钥');
} catch (error) {
  console.log('使用默认配置，请在扩展设置中配置API密钥以获得更好的服务');
}

// 监听来自content script和popup的消息
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  // 处理API测试请求
  if (request.action === "testTranslationApi") {
    const testConfig = request.config;
    const testText = "Hello, world!";
    
    // 使用测试配置临时覆盖全局配置
    const originalConfig = {...aliCloudConfig};
    aliCloudConfig = {...aliCloudConfig, ...testConfig};
    
    translateText(testText)
      .then(translatedText => {
        sendResponse({success: true, translatedText: translatedText});
      })
      .catch(error => {
        sendResponse({success: false, error: error.message || "API测试失败"});
      })
      .finally(() => {
        // 恢复原始配置
        aliCloudConfig = originalConfig;
      });
    
    return true; // 表示异步响应
  }
  
  // 处理OCR识别到的文本
  if (request.action === "processText") {
    const text = request.text;
    
    console.log("收到OCR文本处理请求:", text);
    
    if (!text || text.trim() === '') {
      console.error("文本为空，无法翻译");
      sendResponse({success: false, error: "未识别到文字"});
      return true;
    }
    
    // 翻译识别到的文本
    translateText(text)
      .then(translatedText => {
        console.log("翻译完成，准备发送结果");
        
        if (!translatedText || translatedText.trim() === '') {
          console.error("翻译结果为空");
          sendResponse({success: false, error: "翻译结果为空"});
          return;
        }
        
        // 向当前活动的popup或content script发送翻译结果
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          if (chrome.runtime.lastError) {
            console.error("查询标签页失败:", chrome.runtime.lastError);
            sendResponse({success: false, error: "查询标签页失败"});
            return;
          }
          
          if (!tabs || tabs.length === 0) {
            console.error("没有找到活动标签页");
            sendResponse({success: false, error: "没有找到活动标签页"});
            return;
          }
          
          chrome.tabs.sendMessage(tabs[0].id, {
            action: "translationResult", 
            originalText: text,
            translatedText: translatedText
          }, function(response) {
            if (chrome.runtime.lastError) {
              console.error("发送翻译结果失败:", chrome.runtime.lastError);
              sendResponse({success: false, error: "发送翻译结果失败"});
            } else {
              console.log("翻译结果已发送");
              sendResponse({success: true});
            }
          });
        });
      })
      .catch(error => {
        console.error("翻译错误:", error);
        sendResponse({success: false, error: error.message || "翻译失败"});
      });
    
    return true; // 表示异步响应
  }
  
// 处理OCR请求
  if (request.action === "performOCR") {
    const imageDataUrl = request.imageDataUrl;
    
    console.log("收到OCR识别请求");
    
    if (!imageDataUrl) {
      console.error("未提供图像数据");
      sendResponse({success: false, error: "未提供图像数据"});
      return true;
    }
    
    if (!imageDataUrl.startsWith('data:image/')) {
      console.error("图像数据格式不正确");
      sendResponse({success: false, error: "图像数据格式不正确"});
      return true;
    }
    
    console.log("开始OCR识别...");
    
    // 使用真实的OCR功能
    performRealOCR(imageDataUrl)
      .then(text => {
        console.log("OCR识别成功，文本长度:", text ? text.length : 0);
        if (!text || text.trim() === '') {
          throw new Error("OCR未识别到任何文字");
        }
        sendResponse({success: true, text: text});
      })
      .catch(error => {
        console.error("OCR识别失败:", error);
        sendResponse({success: false, error: error.message || "OCR识别失败"});
      });
    
    return true; // 表示异步响应
  }
  
  // 处理OCR失败的情况
  if (request.action === "ocrFailed") {
    console.error("OCR处理失败:", request.error);
    // 可以在这里添加重试逻辑或错误统计
    return true;
  }
  
  // 处理截图请求
  if (request.action === "captureVisibleTab") {
    chrome.tabs.captureVisibleTab(null, {format: 'png'}, function(dataUrl) {
      if (chrome.runtime.lastError) {
        console.error("截图失败:", chrome.runtime.lastError);
        sendResponse({success: false, error: chrome.runtime.lastError.message});
        return;
      }
      
      // 如果需要裁剪特定区域，这里处理区域裁剪
      if (request.area) {
        cropImageArea(dataUrl, request.area).then(croppedDataUrl => {
          sendResponse({success: true, imageDataUrl: croppedDataUrl});
        }).catch(error => {
          console.error("图片裁剪失败:", error);
          sendResponse({success: false, error: "图片裁剪失败"});
        });
      } else {
        sendResponse({success: true, imageDataUrl: dataUrl});
      }
    });
    
    return true; // 表示异步响应
  }
});

// 裁剪图片区域
function cropImageArea(dataUrl, area) {
  return new Promise((resolve, reject) => {
    // 使用 createImageBitmap 来处理图片
    fetch(dataUrl)
      .then(res => res.blob())
      .then(blob => createImageBitmap(blob))
      .then(imageBitmap => {
        // 创建 OffscreenCanvas
        const canvas = new OffscreenCanvas(area.width, area.height);
        const ctx = canvas.getContext('2d');
        
        // 绘制裁剪后的图像
        ctx.drawImage(
          imageBitmap,
          area.x,
          area.y,
          area.width,
          area.height,
          0,
          0,
          area.width,
          area.height
        );
        
        // 转换为 Blob
        return canvas.convertToBlob({type: 'image/png'});
      })
      .then(blob => {
        // 将 Blob 转换为 Data URL
        return new Promise((resolve2, reject2) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve2(reader.result);
          reader.onerror = reject2;
          reader.readAsDataURL(blob);
        });
      })
      .then(croppedDataUrl => {
        resolve(croppedDataUrl);
      })
      .catch(error => {
        console.error("图片裁剪过程中出错:", error);
        reject(error);
      });
  });
}

// 生成随机字符串作为nonce
function generateNonce() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// 获取ISO8601格式的时间戳
function getISOTimestamp() {
  const date = new Date();
  return date.toISOString().replace(/\.\d+Z$/, 'Z');
}

// URL编码（符合RFC3986标准）
function percentEncode(str) {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
    .replace(/%20/g, '+');
}

// 计算签名
function computeSignature(stringToSign, secret) {
  // 使用加密API计算HMAC-SHA1
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret + '&');
  const messageData = encoder.encode(stringToSign);
  
  // 使用SubtleCrypto API进行HMAC-SHA1签名
  return window.crypto.subtle.importKey(
    'raw', 
    keyData, 
    { name: 'HMAC', hash: { name: 'SHA-1' } }, 
    false, 
    ['sign']
  ).then(key => {
    return window.crypto.subtle.sign(
      'HMAC', 
      key, 
      messageData
    );
  }).then(signature => {
    // 转换为Base64
    return btoa(String.fromCharCode.apply(null, new Uint8Array(signature)));
  });
}

// 使用阿里云翻译API进行翻译
async function translateText(text, sourceLang = 'en', targetLang = 'zh') {
  try {
    console.log("开始翻译文本:", text);
    
    // 尝试直接使用简化版翻译请求测试连接性
    try {
      console.log("尝试使用备用翻译方案...");
      // 使用备用翻译API进行简单翻译尝试
      const backupApiUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
      const backupResponse = await fetch(backupApiUrl);
      const backupData = await backupResponse.json();
      
      if (backupData && backupData.responseData && backupData.responseData.translatedText) {
        console.log("备用翻译API成功:", backupData.responseData.translatedText);
        return backupData.responseData.translatedText;
      }
    } catch (backupError) {
      console.log("备用翻译API失败，继续尝试阿里云API");
    }
    
    // 准备阿里云翻译API参数
    const params = {
      AccessKeyId: aliCloudConfig.accessKeyId,
      Action: 'TranslateGeneral',
      Format: 'JSON',
      FormatType: 'text',
      Scene: 'general',
      SignatureMethod: 'HMAC-SHA1',
      SignatureNonce: generateNonce(),
      SignatureVersion: '1.0',
      SourceLanguage: sourceLang,
      SourceText: text,
      TargetLanguage: targetLang,
      Timestamp: getISOTimestamp(),
      Version: '2018-10-12'
    };
    
    console.log("阿里云翻译API参数:", JSON.stringify(params));
    
    // 按照字母顺序排序参数
    const sortedKeys = Object.keys(params).sort();
    
    // 构造规范化请求字符串
    let canonicalizedQueryString = '';
    sortedKeys.forEach(key => {
      canonicalizedQueryString += `&${percentEncode(key)}=${percentEncode(params[key])}`;
    });
    
    // 去掉第一个&符号
    canonicalizedQueryString = canonicalizedQueryString.substring(1);
    
    // 构造待签名字符串
    const stringToSign = `POST&${percentEncode('/')}&${percentEncode(canonicalizedQueryString)}`;
    console.log("待签名字符串:", stringToSign);
    
    // 计算签名
    const signature = await computeSignature(stringToSign, aliCloudConfig.accessKeySecret);
    console.log("生成签名:", signature);
    
    // 将签名添加到参数中
    params.Signature = signature;
    
    // 构造请求体
    const requestBody = new URLSearchParams();
    Object.keys(params).forEach(key => {
      requestBody.append(key, params[key]);
    });
    
    // 阿里云API请求URL
    const apiUrl = `${aliCloudConfig.endpoint}${aliCloudConfig.apiPath}`;
    console.log("发送请求到:", apiUrl);
    console.log("请求体:", requestBody.toString());
    
    // 发送请求
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: requestBody.toString()
    });
    
    const responseText = await response.text();
    console.log("API响应文本:", responseText);
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error("解析JSON失败:", e);
      throw new Error("无法解析API响应");
    }
    
    console.log("API响应解析:", data);
    
    if (data && data.Data && data.Data.Translated) {
      console.log("翻译成功:", data.Data.Translated);
      return data.Data.Translated;
    } else if (data && data.Code && data.Code !== '200') {
      console.error("翻译API错误码:", data.Code, data.Message);
      throw new Error(`翻译API错误: ${data.Message || '未知错误'}`);
    } else {
      console.error("未知的响应格式:", data);
      // 如果未能正确解析阿里云的响应，使用原文作为翻译结果
      return text + " (未能翻译)";
    }
  } catch (error) {
    console.error("阿里云翻译API错误:", error);
    // 发生错误时返回原文，而不是抛出错误，以确保流程不中断
    return text + " (翻译出错)";
  }
}

// 真实OCR识别功能 - 使用Tesseract.js进行文字识别
async function performRealOCR(imageDataUrl) {
  try {
    console.log("开始真实OCR识别...");
    
    // 动态导入Tesseract.js
    const { createWorker } = await import(chrome.runtime.getURL('lib/tesseract.min.js'));
    
    // 创建OCR工作器
    const worker = await createWorker({
      logger: m => console.log('OCR进度:', m)
    });
    
    // 初始化工作器，设置语言为英文和中文
    await worker.loadLanguage('eng+chi_sim');
    await worker.initialize('eng+chi_sim');
    
    console.log("开始识别图像文字...");
    
    // 执行OCR识别
    const { data: { text } } = await worker.recognize(imageDataUrl);
    
    // 清理工作器
    await worker.terminate();
    
    // 清理识别结果
    const cleanedText = text.trim().replace(/\n\s*\n/g, '\n');
    
    console.log("OCR识别完成，识别到的文字:", cleanedText);
    
    if (!cleanedText || cleanedText.length === 0) {
      throw new Error("未识别到任何文字");
    }
    
    return cleanedText;
    
  } catch (error) {
    console.error("OCR识别错误:", error);
    // 如果OCR失败，尝试使用在线OCR API作为备选方案
    return await fallbackOCR(imageDataUrl);
  }
}

// 备选OCR方案 - 使用在线OCR API
async function fallbackOCR(imageDataUrl) {
  try {
    console.log("使用备选OCR方案...");
    
    // 转换为blob格式
    const response = await fetch(imageDataUrl);
    const blob = await response.blob();
    
    // 创建FormData
    const formData = new FormData();
    formData.append('file', blob, 'image.png');
    formData.append('language', 'eng');
    formData.append('isOverlayRequired', 'false');
    
    // 使用免费的OCR.space API
    const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: {
        'apikey': ocrSpaceConfig.apiKey
      },
      body: formData
    });
    
    const ocrResult = await ocrResponse.json();
    
    if (ocrResult.IsErroredOnProcessing) {
      throw new Error(ocrResult.ErrorMessage || '在线OCR识别失败');
    }
    
    const extractedText = ocrResult.ParsedResults[0]?.ParsedText || '';
    const cleanedText = extractedText.trim().replace(/\r\n/g, '\n');
    
    console.log("备选OCR识别完成:", cleanedText);
    
    if (!cleanedText || cleanedText.length === 0) {
      throw new Error("未识别到任何文字");
    }
    
    return cleanedText;
    
  } catch (error) {
    console.error("备选OCR也失败了:", error);
    throw new Error("OCR识别失败，请确保选择的区域包含清晰的文字");
  }
}