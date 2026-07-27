import { EventEmitter } from "node:events";

// ---------------------------------------------------------------------------
// Bus dei tick live: quando qualcosa cambia (chiusura sincronizzata, scratch,
// validazione, pubblicazione, correzione) si emette un tick per l'evento; i
// client (SSE) rifanno la fetch delle viste derivate — si spingono
// INVALIDAZIONI, non dati. ASSUNZIONE DICHIARATA: singola istanza API in MVP;
// multi-istanza → sostituire l'emitter con pg NOTIFY (punto isolato qui).
// ---------------------------------------------------------------------------

class LiveBus extends EventEmitter {
  tick(eventId: string, reason: string) {
    this.emit("tick", { eventId, reason, at: Date.now() });
    this.emit(`tick:${eventId}`, { reason, at: Date.now() });
  }
}

export const liveBus = new LiveBus();
liveBus.setMaxListeners(500); // una TV per arena + il pubblico connesso
