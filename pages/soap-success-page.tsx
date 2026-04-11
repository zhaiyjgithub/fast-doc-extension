import * as React from 'react'
import { CheckCircle } from 'lucide-react'
import { motion } from 'motion/react'

export function SoapSuccessPage() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.2, 1] }}
        transition={{ duration: 0.5 }}
      >
        <CheckCircle className="size-20 text-emerald-500" />
      </motion.div>
    </motion.div>
  )
}
