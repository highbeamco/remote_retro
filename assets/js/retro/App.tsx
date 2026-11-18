import { useEffect, useRef, useState } from "react"
import { AI_BUSY_SHORT, AiBusyOverlay } from "./components/AiBusyOverlay"
import { ConnectionBanner } from "./components/ConnectionBanner"
import { ErrorBoundary } from "./components/ErrorBoundary"
import { FloatingReactions } from "./components/FloatingReactions"
import { Header } from "./components/Header"
import { Modal } from "./components/Modal"
import { Toasts } from "./components/Toasts"
import { UserList } from "./components/UserList"
import { STAGE_CONFIGS } from "./stages"
import { useAppSelector } from "./store/hooks"
import { selectAiStatus, selectRetro } from "./store/selectors"

/** The retro room: header + stepper, current stage, participants, overlays. */
export function App() {
  const retro = useAppSelector(selectRetro)
  const aiStatus = useAppSelector(selectAiStatus)
  const aiBusy = aiStatus != null
  const [helpOpen, setHelpOpen] = useState(false)
  const [participantsOpen, setParticipantsOpen] = useState(false)

  // Show the stage guidance whenever the stage changes (not on first load). If the AI
  // is working on entry, the dialog doubles as the progress state: its button stays
  // disabled ("Grouping ideas…") until the AI pass finishes.
  const previousStage = useRef(retro?.stage)
  useEffect(() => {
    if (!retro) return
    if (previousStage.current && previousStage.current !== retro.stage && STAGE_CONFIGS[retro.stage]?.help) {
      setHelpOpen(true)
    }
    previousStage.current = retro.stage
  }, [retro?.stage])

  if (!retro) return null

  const config = STAGE_CONFIGS[retro.stage]
  // A stage this client doesn't know (e.g. a newer server, or data from a removed stage).
  if (!config) {
    return (
      <div role="alert" className="grid h-dvh place-items-center bg-base-200 p-6 text-center">
        <div className="space-y-3">
          <p className="font-semibold">This retro is in a stage this page doesn't recognise ("{retro.stage}").</p>
          <p className="text-sm text-base-content/70">Try refreshing. If it keeps happening, the app may need an update.</p>
          <a href="/retros" className="btn btn-sm">Back to your retros</a>
        </div>
      </div>
    )
  }
  const StageComponent = config.component

  return (
    <div className="flex h-dvh flex-col bg-base-200 text-base-content">
      <div inert={aiBusy} className="flex min-h-0 flex-1 flex-col">
        <Header
          onShowHelp={config.help ? () => setHelpOpen(true) : null}
          onShowParticipants={() => setParticipantsOpen(true)}
        />
        <ConnectionBanner />
        <div className="flex min-h-0 flex-1">
          <main className={`relative min-h-0 min-w-0 flex-1 ${config.fullBleed ? "overflow-hidden" : "overflow-y-auto"}`}>
            <ErrorBoundary resetKey={retro.stage}>
              <StageComponent />
            </ErrorBoundary>
          </main>
          <aside className="hidden w-64 shrink-0 overflow-y-auto border-l border-base-300 bg-base-100 p-3 lg:block">
            <UserList />
          </aside>
        </div>
      </div>

      <Modal
        open={helpOpen}
        title={config.title}
        onClose={() => setHelpOpen(false)}
        busyLabel={aiStatus ? AI_BUSY_SHORT[aiStatus] : null}
      >
        {config.help?.(retro.format)}
      </Modal>
      <Modal open={participantsOpen} title="Participants" onClose={() => setParticipantsOpen(false)} closeLabel="Close">
        <UserList />
      </Modal>

      {/* The open help dialog already shows the AI progress; don't stack a second message. */}
      <AiBusyOverlay hidden={helpOpen} />
      <FloatingReactions />
      <Toasts />
    </div>
  )
}
