type EmptyStateProps = {
  children: React.ReactNode
}

export default function EmptyState({ children }: EmptyStateProps) {
  return <p style={{ color: '#666', margin: '0.5rem 0' }}>{children}</p>
}
