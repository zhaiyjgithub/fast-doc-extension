// Minimal ambient types for SpeechRecognition / webkitSpeechRecognition.
// TypeScript lib.dom.d.ts includes SpeechRecognition but not the webkit-prefixed variant.

interface Window {
  webkitSpeechRecognition: typeof SpeechRecognition | undefined
}
