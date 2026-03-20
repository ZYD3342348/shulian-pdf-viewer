// 配置 Worker 路径 (CDN)
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

let pdfDoc = null,
    pageNum = 1,
    pageRendering = false,
    pageNumPending = null,
    canvas = document.getElementById('pdf-render'),
    ctx = canvas.getContext('2d'),
    maxPage = 0;

// 解析参数
const urlParams = new URLSearchParams(window.location.search);
const fileUrl = urlParams.get('file');
maxPage = parseInt(urlParams.get('maxPage')) || 0;
// 可选初始页码，方便记录进度跳转
const startPage = parseInt(urlParams.get('page')) || 1;

// 触摸事件变量
let touchstartX = 0;
let touchendX = 0;
let touchstartY = 0;
let touchendY = 0;

function renderPage(num) {
  pageRendering = true;
  
  // 试读拦截（防止直接通过 API 翻页绕过限制）
  if (maxPage > 0 && num > maxPage) {
    showTrialAlert();
    pageRendering = false;
    return;
  }

  pdfDoc.getPage(num).then(function(page) {
    const containerWidth = document.getElementById('viewerContainer').clientWidth;
    const padding = 20; // 留出一点边距
    const availableWidth = containerWidth - padding;
    
    const viewportConfig = page.getViewport({ scale: 1 });
    const renderScale = availableWidth / viewportConfig.width;
    const viewport = page.getViewport({ scale: renderScale });

    // 支持高分辨屏 (Retina)
    const outputScale = window.devicePixelRatio || 1;

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = Math.floor(viewport.width) + "px";
    canvas.style.height =  Math.floor(viewport.height) + "px";

    const renderContext = {
      canvasContext: ctx,
      transform: [outputScale, 0, 0, outputScale, 0, 0],
      viewport: viewport
    };

    const renderTask = page.render(renderContext);

    renderTask.promise.then(function() {
      pageRendering = false;
      if (pageNumPending !== null) {
        renderPage(pageNumPending);
        pageNumPending = null;
      }
    });
  });

  // 更新UI
  document.getElementById('page_num').textContent = num;
  document.getElementById('prevBtn').disabled = num <= 1;
  document.getElementById('nextBtn').disabled = num >= pdfDoc.numPages;

  // 通过 JSSDK 告诉小程序当前进度，用于保存阅读历史
  if (window.wx && wx.miniProgram) {
    wx.miniProgram.postMessage({ data: { type: 'pageChange', page: num } });
  }
}

function queueRenderPage(num) {
  if (pageRendering) {
    pageNumPending = num;
  } else {
    renderPage(num);
  }
}

function showTrialAlert() {
  document.getElementById('trial-mask').style.display = 'flex';
  document.getElementById('viewerContainer').style.filter = 'blur(4px)';
}

function checkTrialLimit(targetPage) {
  if (maxPage > 0 && targetPage > maxPage) {
    showTrialAlert();
    return false;
  }
  return true;
}

function onPrevPage() {
  if (pageNum <= 1) return;
  pageNum--;
  queueRenderPage(pageNum);
}

function onNextPage() {
  if (pageNum >= pdfDoc.numPages) return;
  if (!checkTrialLimit(pageNum + 1)) return;
  pageNum++;
  queueRenderPage(pageNum);
}

document.getElementById('prevBtn').addEventListener('click', onPrevPage);
document.getElementById('nextBtn').addEventListener('click', onNextPage);

// 屏幕点击切换控制栏
document.getElementById('viewerContainer').addEventListener('click', function(e) {
  const controls = document.getElementById('controls');
  if (controls.classList.contains('hidden-controls')) {
    controls.classList.remove('hidden-controls');
    setTimeout(() => { controls.classList.add('hidden-controls'); }, 3000);
  } else {
    controls.classList.add('hidden-controls');
  }
});

// 手势滑动翻页
const viewer = document.getElementById('viewerContainer');
viewer.addEventListener('touchstart', function(event) {
  touchstartX = event.changedTouches[0].screenX;
  touchstartY = event.changedTouches[0].screenY;
}, { passive: true });

viewer.addEventListener('touchend', function(event) {
  touchendX = event.changedTouches[0].screenX;
  touchendY = event.changedTouches[0].screenY;
  handleGesture();
}, { passive: true });

function handleGesture() {
  const swipeX = touchendX - touchstartX;
  const swipeY = touchendY - touchstartY;
  
  // 必须是水平滑动为主，且距离足够
  if (Math.abs(swipeX) > Math.abs(swipeY) && Math.abs(swipeX) > 60) {
    if (swipeX < 0) onNextPage(); // 左滑 -> 下一页
    if (swipeX > 0) onPrevPage(); // 右滑 -> 上一页
  }
}

// 购买按钮 -> 返回小程序详情页触发购买
document.getElementById('buyBtn').addEventListener('click', function() {
  if (window.wx && wx.miniProgram) {
    wx.miniProgram.navigateBack();
  }
});

// 初始化
if (!fileUrl) {
  document.getElementById('loadingText').textContent = '未提供文件链接';
  document.querySelector('.spinner').style.display = 'none';
} else {
  // 加载PDF
  pdfjsLib.getDocument(decodeURIComponent(fileUrl)).promise.then(function(pdfDoc_) {
    pdfDoc = pdfDoc_;
    document.getElementById('page_count').textContent = pdfDoc.numPages;

    document.getElementById('loading').style.display = 'none';
    document.getElementById('viewerContainer').style.display = 'flex';
    
    // 初始化时隐藏状态栏
    setTimeout(() => {
      document.getElementById('controls').classList.add('hidden-controls');
    }, 2500);

    // 跳转到初始页
    if (startPage > 1 && startPage <= pdfDoc.numPages) {
       pageNum = startPage;
       // 检查是否受限（例如：原来可以看，后来规则改了变成了需要购买，记录在越界了）
       if (maxPage > 0 && pageNum > maxPage) {
           pageNum = maxPage;
       }
    }
    renderPage(pageNum);

  }).catch(function(err) {
    let msg = '加载出错，可能是跨域问题引发';
    if (err.message) msg = err.message;
    document.getElementById('loadingText').textContent = '错误: ' + msg;
    document.querySelector('.spinner').style.display = 'none';
  });
}
