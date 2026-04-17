import { useState, type ReactNode } from 'react';
import AiDisclosureModal, { shouldShowAiDisclosure, markAiDisclosureSeen } from '../components/AiDisclosureModal';

// Lazy-gate any AI-triggered action behind the unified disclosure.
//
// Usage:
//   const { gate, modal } = useAiGate();
//   <button onClick={() => gate(() => sendMessage(text))}>Send</button>
//   {modal}
//
// First time across any AI surface (photo / chat / reports / insight),
// the disclosure shows; on Continue, the queued action runs. Subsequent
// uses skip the modal entirely.
export function useAiGate(): {
  gate: (action: () => void | Promise<void>) => void;
  modal: ReactNode;
} {
  const [open, setOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void | Promise<void>) | null>(null);

  function gate(action: () => void | Promise<void>) {
    if (shouldShowAiDisclosure()) {
      // useState setter accepts a function — wrap to avoid React calling it.
      setPendingAction(() => action);
      setOpen(true);
      return;
    }
    void action();
  }

  function acknowledge() {
    markAiDisclosureSeen();
    setOpen(false);
    const action = pendingAction;
    setPendingAction(null);
    if (action) void action();
  }

  function cancel() {
    setOpen(false);
    setPendingAction(null);
  }

  return {
    gate,
    modal: <AiDisclosureModal open={open} onAcknowledge={acknowledge} onCancel={cancel} />,
  };
}
