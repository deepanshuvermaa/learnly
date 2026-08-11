import { useEffect, useState } from 'react'
import { useStore } from './store/useStore'
import { wireStreaming, ask } from './lib/copilot'
import { feedForAutoAsk } from './lib/autoAsk'
import { Overlay } from './components/Overlay'
import { Settings } from './components/Settings'

function useRoute(): 'overlay' | 'settings' {
  const [route, setRoute] = useState<'overlay' | 'settings'>(
    window.location.hash.includes('settings') ? 'settings' : 'overlay'
  )
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.includes('settings') ? 'settings' : 'overlay')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return route
}

export function App() {
  const route = useRoute()
  const { setSettings, setSecrets, pushTranscript, setSttState } = useStore()

  // One-time global wiring, shared by both routes.
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const [settings, secrets] = await Promise.all([
        window.listenly.settings.get(),
        window.listenly.secrets.status()
      ])
      if (!mounted) return
      setSettings(settings)
      setSecrets(secrets)
    })()

    wireStreaming()
    const offTranscript = window.listenly.stt.onTranscript((seg) => {
      pushTranscript(seg)
      feedForAutoAsk(seg)
    })
    const offState = window.listenly.stt.onState(({ state, detail }) => setSttState(state, detail))
    const offAsk = window.listenly.shortcuts.onAskNow(() => ask())

    return () => {
      mounted = false
      offTranscript()
      offState()
      offAsk()
    }
  }, [setSettings, setSecrets, pushTranscript, setSttState])

  return route === 'settings' ? <Settings /> : <Overlay />
}
