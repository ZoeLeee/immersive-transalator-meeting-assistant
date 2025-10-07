import { useEffect, useState } from "react"

function IndexPopup() {
  const [enabled, setEnabled] = useState<boolean>(true)

  useEffect(() => {
    ;(async () => {
      try {
        const result = await chrome.storage.sync.get(["enabled"]) 
        setEnabled(result.enabled !== undefined ? result.enabled : true)
      } catch (e) {
        console.error("Failed to load enabled state", e)
      }
    })()
  }, [])

  return (
    <div
      style={{
        padding: 16
      }}>
        <button
          onClick={async () => {
            try {
              const next = !enabled
              setEnabled(next)
              await chrome.storage.sync.set({ enabled: next })
              const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
              if (tabs && tabs[0] && tabs[0].id) {
                await chrome.tabs.sendMessage(tabs[0].id, { type: next ? "ENABLE_IMMERSIVE_FONT_CAPTURE" : "DISABLE_IMMERSIVE_FONT_CAPTURE" })
              }
            } catch (err) {
              console.error("Failed to toggle state:", err)
            }
          }}
        >
          {enabled ? "关闭" : "开启"}
        </button>
    </div>
  )
}

export default IndexPopup
