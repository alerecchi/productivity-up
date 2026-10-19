import { Plus } from 'lucide-react'
import { useState } from 'react'

import TodoDialog from '@/features/board/components/todo-dialog'
import { Button } from '@/features/shared/components/ui/button'
import type { Bucket } from '@/lib/types/Bucket'

type CreateTodoButtonProps = {
  buckets: ReadonlyArray<Bucket>
  bucketId: number
  /** Names the Bucket in the button's accessible name, so five "Add task" buttons stay distinguishable. */
  bucketName?: string
}

// TODO the bucket re-renders when I write things in the form, why?
export default function CreateTodoButton({ bucketId, bucketName, buckets }: CreateTodoButtonProps) {
  const [isDialogOpen, setDialogOpen] = useState(false)

  return (
    <>
      <Button
        aria-label={bucketName ? `Add task to ${bucketName}` : 'Add task'}
        className='pointer-coarse:size-11'
        size='icon'
        onClick={() => setDialogOpen(true)}
      >
        <Plus className='size-4' />
      </Button>
      <TodoDialog buckets={buckets} defaultBucketId={bucketId} isOpen={isDialogOpen} setOpen={setDialogOpen} />
    </>
  )
}
