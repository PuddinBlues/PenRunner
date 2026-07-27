/**
 * Versione del motore di scoring. Il bundle offline la dichiara, ogni payload
 * di sync la echeggia: un totale calcolato da versioni diverse non deve mai
 * divergere in silenzio (il server ricalcola e confronta — vedi sync).
 */
export const SCORING_ENGINE_VERSION = "1.0.0";
