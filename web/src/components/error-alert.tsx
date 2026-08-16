import { useEffect, useState } from 'react'
import { CircleAlertIcon, XIcon } from 'lucide-react'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function ErrorAlert({
  message,
  onDismiss,
  className,
}: {
  message: string
  onDismiss?: () => void
  className?: string
}) {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    setHidden(false)
  }, [message])

  if (!message || hidden) return null

  function dismiss() {
    setHidden(true)
    onDismiss?.()
  }

  return (
    <Alert variant="destructive" className={cn('mx-3 mt-2', className)}>
      <CircleAlertIcon />
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      <AlertAction>
        <Button type="button" variant="ghost" size="icon-xs" aria-label="Dismiss error" onClick={dismiss}>
          <XIcon />
        </Button>
      </AlertAction>
    </Alert>
  )
}
