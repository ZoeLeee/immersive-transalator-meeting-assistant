let map = new Map<HTMLElement, string>()
let map2 = new Map<string, HTMLElement>()

// 全局变量存储启用状态和字幕模式
let isEnabled = true
let captionMode = "bilingual" // bilingual, floating

// 保存MutationObserver实例
let captionObserver: MutationObserver | null = null

// 原始字幕内容缓存（用于双语模式）
let originalCaptions = new Map<string, string>()

let FloatCaptionContainer: HTMLElement | null = null

// 会议记录相关变量
let currentMeetingId: string | null = null
let meetingStartTime: Date | null = null
let meetingTranscript: string[] = []
let participantCount: number = 0

let currentCaptionContent: string[] = []

// 生成UUID
function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c == "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function createFloatingCaptionContainer() {
  console.log("Creating floating caption container")

  FloatCaptionContainer = document.createElement("pre")

  FloatCaptionContainer.style.position = "absolute"
  FloatCaptionContainer.style.bottom = "10px"
  FloatCaptionContainer.style.left = "50%"
  FloatCaptionContainer.style.transform = "translateX(-50%)"
  FloatCaptionContainer.style.backgroundColor = "rgba(0, 0, 0, 0.7)"
  FloatCaptionContainer.style.color = "white"
  FloatCaptionContainer.style.padding = "8px 16px"
  FloatCaptionContainer.style.borderRadius = "4px"
  FloatCaptionContainer.style.zIndex = "9999"
  FloatCaptionContainer.style.maxWidth = "80%"
  FloatCaptionContainer.style.textAlign = "center"
  FloatCaptionContainer.style.display = "block"
  FloatCaptionContainer.style.whiteSpace = "pre-wrap"
  FloatCaptionContainer.style.cursor = "move"

  FloatCaptionContainer.setAttribute("data-id", "FLOATING_CAPTION")
  const main = document.getElementsByTagName("main")[0] || document.body
  main.appendChild(FloatCaptionContainer)
  enableFloatingCaptionDragging()
  return FloatCaptionContainer
}

export function updateFloatingCaptionContainer(text: string) {
  if (!FloatCaptionContainer || !FloatCaptionContainer.isConnected) {
    createFloatingCaptionContainer()
  }
  FloatCaptionContainer.textContent = text
}

function showFloatingCaptionContainer() {
  if (!FloatCaptionContainer || !FloatCaptionContainer.isConnected) {
    createFloatingCaptionContainer()
  }
  if (FloatCaptionContainer) {
    FloatCaptionContainer.style.display = "block"
    enableFloatingCaptionDragging()
  }
}

function hideFloatingCaptionContainer() {
  if (FloatCaptionContainer) {
    FloatCaptionContainer.textContent = ""
    FloatCaptionContainer.style.display = "none"
  }
}

// 为页面注入样式：将沉浸式翻译目标容器高度设为 1px
function injectImmersiveWrapperHeightStyle() {
  const STYLE_ID = "immersive-wrapper-height-style"
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement("style")
  style.id = STYLE_ID
  style.textContent = `.immersive-translate-target-wrapper{height:1px !important;overflow:hidden !important;}`
  document.head.appendChild(style)
}

// 监控 Google Meet 字幕变化
function startObservingCaptions() {
  // 如果已经有一个观察器在运行，先停止它
  stopObservingCaptions()

  let captionContainer: HTMLElement | null

  for (const s of [
    "[aria-label='字幕']",
    "[aria-label='Caption']",
    "[aria-label='Captions']",
    "[aria-label='Subtitles']",
    "[aria-label='Subtítulos']",
    "[aria-label='Untertitel']",
    "[aria-label='字幕']",
    "[aria-label='자막']",
    "[aria-label='キャプション']",
    "[aria-label='Legendas']",
    "[aria-label='Sous-titres']",
    "[aria-label='Titoli']",
    "[aria-label='Titrer']",
    "[aria-label='Napisy']",
    "[aria-label='Текст']",
    "[aria-label='Titulky']",
    "[aria-label='Titlovi']",
    "[aria-label='Felirat']",
    "[aria-label='Titrai']",
    "[aria-label='Titluri']",
    "[aria-label='Undergitter']",
    "[aria-label='Tekstitys']",
    "[aria-label='Subtitluri']",
    "[aria-label='คำบรรยาย']",
    "[aria-label='Altyazılar']",
    "[aria-label='Субтитри']",
    "[aria-label='Субтитри']",
    "[aria-label='字幕']",
    "[aria-label='Podnapisi']"
  ]) {
    captionContainer = document.querySelector(s) as HTMLElement | null
    if (captionContainer) {
      break
    }
  }

  if (!captionContainer) {
    console.log("Caption container not found, retrying...")
    // 只有在启用状态下才继续尝试
    if (isEnabled) {
      setTimeout(startObservingCaptions, 1000)
    }
    return
  }

  if (!FloatCaptionContainer) {
    createFloatingCaptionContainer()
  }

  captionObserver = new MutationObserver((mutations) => {
    // 只有在启用状态下才处理变动
    if (!isEnabled) return

    mutations.forEach((mutation) => {
      if (mutation.type === "childList") {
        const node = mutation.target as HTMLElement
        if (node.classList.contains("immersive-translate-target-wrapper")) {
          const content = node.textContent
          updateFloatingCaptionContainer(content);
        }
      }
    })
  })

  captionObserver.observe(captionContainer, {
    childList: true,
    subtree: true,
    characterData: true
  })

  console.log("Started observing captions")
}

// 停止监控字幕
function stopObservingCaptions() {
  if (captionObserver) {
    captionObserver.disconnect()
    captionObserver = null
    console.log("Stopped observing captions")
  }
}

// 调用翻译 API
// 初始化
async function initialize() {
  // 确保只在 Google Meet 域名下运行
  if (!window.location.hostname.includes("meet.google.com")) {
    console.log("Not on Google Meet, skipping initialization")
    return
  }

  // 获取启用状态和字幕模式
  const result = await chrome.storage.sync.get(["enabled", "captionMode"])
  isEnabled = result.enabled !== undefined ? result.enabled : true
  captionMode = result.captionMode || "bilingual"

  // 根据启用状态决定是否启动监视器
  if (isEnabled) {
    injectImmersiveWrapperHeightStyle()
    startObservingCaptions()
    showFloatingCaptionContainer()
  }
}

initialize()
// 监听来自 popup 的启用消息
chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message && message.type === "ENABLE_IMMERSIVE_FONT_CAPTURE") {
    isEnabled = true
    injectImmersiveWrapperHeightStyle()
    startObservingCaptions()
    showFloatingCaptionContainer()
  } else if (message && message.type === "DISABLE_IMMERSIVE_FONT_CAPTURE") {
    isEnabled = false
    stopObservingCaptions()
    hideFloatingCaptionContainer()
    // 可选：移除样式（若希望关闭后恢复原样）
    const STYLE_ID = "immersive-wrapper-height-style"
    const style = document.getElementById(STYLE_ID)
    if (style && style.parentElement) {
      style.parentElement.removeChild(style)
    }
  }
})

// 为浮动字幕容器添加拖拽能力（鼠标与触摸）
function enableFloatingCaptionDragging() {
  if (!FloatCaptionContainer) return
  if (FloatCaptionContainer.getAttribute("data-draggable") === "true") return

  let isDragging = false
  let dragOffsetX = 0
  let dragOffsetY = 0

  const ensureFixedPosition = () => {
    if (!FloatCaptionContainer) return
    // 将当前位置转换为 fixed 的 top/left，便于拖动
    const rect = FloatCaptionContainer.getBoundingClientRect()
    FloatCaptionContainer.style.position = "fixed"
    FloatCaptionContainer.style.transform = "none"
    FloatCaptionContainer.style.bottom = "auto"
    FloatCaptionContainer.style.left = `${Math.round(rect.left)}px`
    FloatCaptionContainer.style.top = `${Math.round(rect.top)}px`
  }

  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val))

  const onMove = (clientX: number, clientY: number) => {
    if (!FloatCaptionContainer) return
    const rect = FloatCaptionContainer.getBoundingClientRect()
    const newLeft = clamp(clientX - dragOffsetX, 0, window.innerWidth - rect.width)
    const newTop = clamp(clientY - dragOffsetY, 0, window.innerHeight - rect.height)
    FloatCaptionContainer.style.left = `${Math.round(newLeft)}px`
    FloatCaptionContainer.style.top = `${Math.round(newTop)}px`
  }

  const onMouseDown = (e: MouseEvent) => {
    if (!FloatCaptionContainer) return
    isDragging = true
    ensureFixedPosition()
    const rect = FloatCaptionContainer.getBoundingClientRect()
    dragOffsetX = e.clientX - rect.left
    dragOffsetY = e.clientY - rect.top
    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp, { once: true })
    e.preventDefault()
  }

  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging) return
    onMove(e.clientX, e.clientY)
  }

  const onMouseUp = (_e: MouseEvent) => {
    isDragging = false
    document.removeEventListener("mousemove", onMouseMove)
  }

  const onTouchStart = (e: TouchEvent) => {
    if (!FloatCaptionContainer) return
    if (e.touches.length !== 1) return
    const t = e.touches[0]
    isDragging = true
    ensureFixedPosition()
    const rect = FloatCaptionContainer.getBoundingClientRect()
    dragOffsetX = t.clientX - rect.left
    dragOffsetY = t.clientY - rect.top
    document.addEventListener("touchmove", onTouchMove, { passive: false })
    document.addEventListener("touchend", onTouchEnd, { once: true })
  }

  const onTouchMove = (e: TouchEvent) => {
    if (!isDragging) return
    if (e.touches.length !== 1) return
    const t = e.touches[0]
    onMove(t.clientX, t.clientY)
    e.preventDefault()
  }

  const onTouchEnd = (_e: TouchEvent) => {
    isDragging = false
    document.removeEventListener("touchmove", onTouchMove)
  }

  FloatCaptionContainer.addEventListener("mousedown", onMouseDown)
  FloatCaptionContainer.addEventListener("touchstart", onTouchStart, { passive: false })
  FloatCaptionContainer.setAttribute("data-draggable", "true")
}
