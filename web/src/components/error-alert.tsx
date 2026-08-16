import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { CircleAlertIcon } from 'lucide-react'

export function ErrorAlert({ message }: { message: string }) {
  if (!message) return null
  return (
    <Alert variant="destructive" className="mx-3 mt-2">
      <CircleAlertIcon />
      <AlertTitle>Something went wrong</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}
