import { useState } from 'react'

type DeleteConfirmProps = {
  resourceName: string
  resourceLabel?: string
  onConfirm: () => void | Promise<void>
  onCancel: () => void
  pending?: boolean
}

export default function DeleteConfirm({
  resourceName,
  resourceLabel = 'resource',
  onConfirm,
  onCancel,
  pending = false,
}: DeleteConfirmProps) {
  const [typed, setTyped] = useState('')

  const matches = typed === resourceName

  return (
    <div
      style={{
        marginTop: '1rem',
        padding: '1rem',
        border: '1px solid #ccc',
        background: '#fafafa',
      }}
    >
      <p style={{ margin: '0 0 0.5rem' }}>
        Delete {resourceLabel} <strong>{resourceName}</strong>? This cannot be undone.
      </p>
      <p style={{ margin: '0 0 0.5rem', color: '#666' }}>Type the name to confirm:</p>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={resourceName}
        disabled={pending}
        style={{ width: '100%', maxWidth: '20rem', marginBottom: '0.75rem' }}
      />
      <div>
        <button type="button" onClick={onConfirm} disabled={!matches || pending}>
          {pending ? 'Deleting…' : 'Delete'}
        </button>
        <button type="button" onClick={onCancel} disabled={pending} style={{ marginLeft: '0.5rem' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}
