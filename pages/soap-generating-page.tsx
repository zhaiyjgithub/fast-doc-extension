import * as React from 'react'
import { Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

const STATUS_MESSAGES = [
  'Analyzing transcript…',
  'Retrieving clinical guidelines…',
  'Generating SOAP note…',
  'Suggesting codes…',
]

export function SoapGeneratingPage() {
  const [currentMessage, setCurrentMessage] = React.useState(0)

  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMessage((prev) => (prev + 1) % STATUS_MESSAGES.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center space-y-8 px-4 py-16">
      <div className="relative flex h-32 w-32 items-center justify-center">
        {[3, 5, 8].map((dur, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full border-2"
            style={{
              width: 80 + i * 30,
              height: 80 + i * 30,
              borderColor: `oklch(0.541 0.281 263.657 / ${0.3 - i * 0.05})`,
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: dur, repeat: Infinity, ease: 'linear' }}
          />
        ))}

        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Sparkles className="size-8 text-primary" />
        </motion.div>
      </div>

      <div className="space-y-2 text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={currentMessage}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="text-sm font-medium text-foreground"
          >
            {STATUS_MESSAGES[currentMessage]}
          </motion.p>
        </AnimatePresence>
        <p className="text-xs text-muted-foreground">Usually takes 15–30 seconds</p>
      </div>
    </div>
  )
}
