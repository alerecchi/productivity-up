import { useFormContext } from '@shared/components/form'
import { Button } from '@shared/components/ui/button'
import { Field } from '@shared/components/ui/field'
import { Spinner } from '@shared/components/ui/spinner'
import { useStore } from '@tanstack/react-form'

type SubmitButtonProps = {
  text: string
  formId: string
  /** Disables submission in addition to the form's own validity and submitting state. */
  disabled?: boolean
}

export function SubmitButton({ text, formId, disabled = false }: SubmitButtonProps) {
  const form = useFormContext()
  const canSubmit = useStore(form.store, (state) => state.canSubmit)
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting)

  return (
    <Field>
      <Button
        size='lg'
        className='cursor-pointer'
        type='submit'
        form={formId}
        disabled={disabled || !canSubmit || isSubmitting}
      >
        {text}
        {isSubmitting && <Spinner data-icon='inline-end' />}
      </Button>
    </Field>
  )
}
