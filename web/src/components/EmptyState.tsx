type EmptyStateProps = {
  children: React.ReactNode
}

export default function EmptyState({ children }: EmptyStateProps) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>
}
