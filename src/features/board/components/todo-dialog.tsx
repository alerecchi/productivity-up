import { useAppForm } from '@shared/components/form'
import { Button } from '@shared/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@shared/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@shared/components/ui/field'
import { Input } from '@shared/components/ui/input'
import { Textarea } from '@shared/components/ui/textarea'
import { useQuery } from '@tanstack/react-query'
import { Check, Edit2, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'

import {
  bucketValidator,
  filterNamedItems,
  formatBucketName,
  getDefaultFormValues,
  getOperationErrorMessage,
  hasDuplicateName,
  removeRecordKey,
  titleValidator,
} from '@/features/board/components/todo-dialog-utils'
import type { BucketOption, DialogResourceMode, TodoFormValues } from '@/features/board/components/todo-dialog-utils'
import {
  CategoryEditPanel,
  ColorDot,
  ResourceCheckbox,
  ResourceListPanel,
  ResourcePopover,
  SearchInput,
  TagBadge,
  TagEditPanel,
} from '@/features/board/components/todo-resource-picker'
import useCreateCategory from '@/features/board/hooks/use-create-category'
import useCreateTag from '@/features/board/hooks/use-create-tag'
import useCreateTodo from '@/features/board/hooks/use-create-todo'
import useDeleteCategory from '@/features/board/hooks/use-delete-category'
import useDeleteTag from '@/features/board/hooks/use-delete-tag'
import useDeleteTodo from '@/features/board/hooks/use-delete-todo'
import useUpdateCategory from '@/features/board/hooks/use-update-category'
import useUpdateTag from '@/features/board/hooks/use-update-tag'
import { useUpdateTodo } from '@/features/board/hooks/use-update-todo'
import { getCategoriesQueryOptions } from '@/features/board/queries/category-queries'
import { getTagsQueryOptions } from '@/features/board/queries/tag-queries'
import { getErrorMessage as getFieldErrorMessage } from '@/features/shared/utils/form'
import { cn } from '@/features/shared/utils/tailwind'
import { DEFAULT_CATEGORY_COLOR_KEY } from '@/lib/types/Category'
import { DEFAULT_TAG_COLOR_KEY } from '@/lib/types/Tag'
import type { TagColorKey } from '@/lib/types/Tag'
import type { Todo } from '@/lib/types/Todo'

interface TodoDialogProps {
  buckets: ReadonlyArray<BucketOption>
  defaultBucketId: number
  editingTodo?: Todo | null
  isOpen: boolean
  setOpen: (open: boolean) => void
}

export default function TodoDialog({ buckets, defaultBucketId, editingTodo, isOpen, setOpen }: TodoDialogProps) {
  const [categoryCreateError, setCategoryCreateError] = useState('')
  const [categoryDeleteError, setCategoryDeleteError] = useState('')
  const [categoryDeleteConfirmId, setCategoryDeleteConfirmId] = useState<number | null>(null)
  const [categoryDialogMode, setCategoryDialogMode] = useState<DialogResourceMode | null>(null)
  const [categoryEditError, setCategoryEditError] = useState('')
  const [categorySearch, setCategorySearch] = useState('')
  const [tagCreateError, setTagCreateError] = useState('')
  const [tagDeleteConfirmId, setTagDeleteConfirmId] = useState<number | null>(null)
  const [tagDeleteErrors, setTagDeleteErrors] = useState<Record<number, string>>({})
  const [tagDialogMode, setTagDialogMode] = useState<DialogResourceMode | null>(null)
  const [tagEditErrors, setTagEditErrors] = useState<Record<number, string>>({})
  const [tagSearch, setTagSearch] = useState('')
  const [todoDeleteNeedsConfirm, setTodoDeleteNeedsConfirm] = useState(false)
  const [todoDeleteError, setTodoDeleteError] = useState('')
  const createCategoryMutation = useCreateCategory()
  const createTagMutation = useCreateTag()
  const createTodoMutation = useCreateTodo()
  const deleteCategoryMutation = useDeleteCategory()
  const deleteTagMutation = useDeleteTag()
  const deleteTodoMutation = useDeleteTodo()
  const updateCategoryMutation = useUpdateCategory()
  const updateTagMutation = useUpdateTag()
  const updateTodoMutation = useUpdateTodo()
  const { data: categories = [] } = useQuery(getCategoriesQueryOptions)
  const { data: tags = [] } = useQuery(getTagsQueryOptions)
  const isEditMode = Boolean(editingTodo)

  const form = useAppForm({
    defaultValues: getDefaultFormValues(defaultBucketId, editingTodo),
    validators: {
      onSubmitAsync: async ({ value }) => {
        try {
          const todoData = {
            categoryId: value.categoryId ? Number(value.categoryId) : null,
            description: value.description,
            tagIds: value.tagIds.map(Number),
            title: value.title.trim(),
          }

          if (editingTodo) {
            await updateTodoMutation.mutateAsync({
              data: {
                ...todoData,
                bucketId: Number(value.bucketId),
                id: editingTodo.id,
              },
            })
          } else {
            await createTodoMutation.mutateAsync({
              data: {
                ...todoData,
                bucketId: Number(value.bucketId),
              },
            })
          }
          return undefined
        } catch (error) {
          return { form: await getOperationErrorMessage(error, 'Could not save the todo.') }
        }
      },
    },
    onSubmit: () => {
      setOpen(false)
    },
  })

  useEffect(() => {
    if (isOpen) {
      form.reset(getDefaultFormValues(defaultBucketId, editingTodo))
      setCategoryCreateError('')
      setCategoryDeleteError('')
      setCategoryDeleteConfirmId(null)
      setCategoryDialogMode(null)
      setCategoryEditError('')
      setCategorySearch('')
      setTagCreateError('')
      setTagDeleteConfirmId(null)
      setTagDeleteErrors({})
      setTagDialogMode(null)
      setTagEditErrors({})
      setTagSearch('')
      setTodoDeleteNeedsConfirm(false)
      setTodoDeleteError('')
    }
  }, [defaultBucketId, editingTodo, form, isOpen])

  const handleOpenChange = (open: boolean) => {
    setOpen(open)
  }

  const handleCreateCategory = async (values: Pick<TodoFormValues, 'newCategoryColorKey' | 'newCategoryName'>) => {
    const name = values.newCategoryName.trim()

    if (!name) {
      return false
    }

    setCategoryCreateError('')

    if (hasDuplicateName(categories, name)) {
      setCategoryCreateError('A category with this name already exists.')
      return false
    }

    try {
      const category = await createCategoryMutation.mutateAsync({
        data: {
          colorKey: values.newCategoryColorKey,
          name,
        },
      })
      form.setFieldValue('categoryId', String(category.id))
      form.setFieldValue('categoryEditColorKey', category.colorKey)
      form.setFieldValue('categoryEditName', category.name)
      form.setFieldValue('newCategoryName', '')
      return true
    } catch (error) {
      setCategoryCreateError(await getOperationErrorMessage(error, 'Could not create the category.'))
      return false
    }
  }

  const handleTagSelectionChange = (tagId: string, selected: boolean, selectedTagIds: Array<string>) => {
    const nextTagIds = selected
      ? [...selectedTagIds, tagId]
      : selectedTagIds.filter((selectedTagId) => selectedTagId !== tagId)

    form.setFieldValue('tagIds', [...new Set(nextTagIds)])
  }

  const handleCreateTag = async (values: Pick<TodoFormValues, 'newTagColorKey' | 'newTagName' | 'tagIds'>) => {
    const name = values.newTagName.trim()

    if (!name) {
      return false
    }

    setTagCreateError('')

    if (hasDuplicateName(tags, name)) {
      setTagCreateError('A tag with this name already exists.')
      return false
    }

    try {
      const tag = await createTagMutation.mutateAsync({
        data: {
          colorKey: values.newTagColorKey,
          name,
        },
      })
      form.setFieldValue('tagIds', [...new Set([...values.tagIds, String(tag.id)])])
      form.setFieldValue('newTagName', '')
      return true
    } catch (error) {
      setTagCreateError(await getOperationErrorMessage(error, 'Could not create the tag.'))
      return false
    }
  }

  const handleUpdateTag = async (
    tagId: number,
    values: {
      colorKey: TagColorKey
      name: string
    },
  ) => {
    const name = values.name.trim()

    if (!name) {
      return false
    }

    setTagEditErrors((errors) => {
      const { [tagId]: _removed, ...remainingErrors } = errors
      return remainingErrors
    })

    if (hasDuplicateName(tags, name, tagId)) {
      setTagEditErrors((errors) => ({ ...errors, [tagId]: 'A tag with this name already exists.' }))
      return false
    }

    try {
      const tag = await updateTagMutation.mutateAsync({
        data: {
          colorKey: values.colorKey,
          id: tagId,
          name,
        },
      })
      const tagFormId = String(tag.id)
      form.setFieldValue('tagEditColorKeys', {
        ...form.state.values.tagEditColorKeys,
        [tagFormId]: tag.colorKey,
      })
      form.setFieldValue('tagEditNames', {
        ...form.state.values.tagEditNames,
        [tagFormId]: tag.name,
      })
      return true
    } catch (error) {
      const errorMessage = await getOperationErrorMessage(error, 'Could not save the tag.')
      setTagEditErrors((errors) => ({ ...errors, [tagId]: errorMessage }))
      return false
    }
  }

  const handleDeleteTag = async (tagId: number, selectedTagIds: Array<string>) => {
    if (tagDeleteConfirmId !== tagId) {
      setTagDeleteConfirmId(tagId)
      return false
    }

    setTagDeleteConfirmId(null)
    setTagDeleteErrors((errors) => {
      const { [tagId]: _removed, ...remainingErrors } = errors
      return remainingErrors
    })

    try {
      await deleteTagMutation.mutateAsync({
        data: {
          id: tagId,
        },
      })

      const tagFormId = String(tagId)
      form.setFieldValue(
        'tagIds',
        selectedTagIds.filter((selectedTagId) => selectedTagId !== tagFormId),
      )
      form.setFieldValue('tagEditColorKeys', removeRecordKey(form.state.values.tagEditColorKeys, tagFormId))
      form.setFieldValue('tagEditNames', removeRecordKey(form.state.values.tagEditNames, tagFormId))
      return true
    } catch (error) {
      const errorMessage = await getOperationErrorMessage(error, 'Could not delete the tag.')
      setTagDeleteErrors((errors) => ({ ...errors, [tagId]: errorMessage }))
      return false
    }
  }

  const handleUpdateCategory = async (
    categoryId: number,
    values: Pick<TodoFormValues, 'categoryEditColorKey' | 'categoryEditName'>,
  ) => {
    const name = values.categoryEditName.trim()

    if (!name) {
      return false
    }

    setCategoryEditError('')

    if (hasDuplicateName(categories, name, categoryId)) {
      setCategoryEditError('A category with this name already exists.')
      return false
    }

    try {
      const category = await updateCategoryMutation.mutateAsync({
        data: {
          colorKey: values.categoryEditColorKey,
          id: categoryId,
          name,
        },
      })
      form.setFieldValue('categoryEditColorKey', category.colorKey)
      form.setFieldValue('categoryEditName', category.name)
      return true
    } catch (error) {
      setCategoryEditError(await getOperationErrorMessage(error, 'Could not save the category.'))
      return false
    }
  }

  const handleDeleteCategory = async (categoryId: number, selectedCategoryId: string) => {
    if (categoryDeleteConfirmId !== categoryId) {
      setCategoryDeleteConfirmId(categoryId)
      return false
    }

    setCategoryDeleteConfirmId(null)
    setCategoryDeleteError('')

    try {
      await deleteCategoryMutation.mutateAsync({
        data: {
          id: categoryId,
        },
      })

      if (selectedCategoryId === String(categoryId)) {
        form.setFieldValue('categoryId', '')
        form.setFieldValue('categoryEditColorKey', DEFAULT_CATEGORY_COLOR_KEY)
        form.setFieldValue('categoryEditName', '')
      }
      return true
    } catch (error) {
      setCategoryDeleteError(await getOperationErrorMessage(error, 'Could not delete the category.'))
      return false
    }
  }

  const handleDeleteTodo = async () => {
    if (!editingTodo) {
      return
    }

    if (!todoDeleteNeedsConfirm) {
      setTodoDeleteNeedsConfirm(true)
      return
    }

    setTodoDeleteNeedsConfirm(false)
    setTodoDeleteError('')

    try {
      await deleteTodoMutation.mutateAsync({
        data: {
          id: editingTodo.id,
        },
      })
      setOpen(false)
    } catch (error) {
      setTodoDeleteError(await getOperationErrorMessage(error, 'Could not delete the todo.'))
    }
  }

  const formId = 'todo-dialog-form'
  const renderCategoryPicker = () => (
    <form.Subscribe
      selector={(state) => ({
        categoryEditColorKey: state.values.categoryEditColorKey,
        categoryEditName: state.values.categoryEditName,
        categoryId: state.values.categoryId,
        newCategoryColorKey: state.values.newCategoryColorKey,
        newCategoryName: state.values.newCategoryName,
      })}
      children={({ categoryEditColorKey, categoryEditName, categoryId, newCategoryColorKey, newCategoryName }) => {
        const filteredCategories = filterNamedItems(categories, categorySearch)
        const editedCategory =
          categoryDialogMode?.type === 'edit'
            ? categories.find((category) => category.id === categoryDialogMode.id)
            : undefined

        return (
          <>
            {categoryDialogMode?.type === 'list' && (
              <ResourceListPanel
                title='Categories'
                search={
                  <SearchInput value={categorySearch} onChange={setCategorySearch} placeholder='Search categories' />
                }
                onClose={() => setCategoryDialogMode(null)}
                createButton={
                  <Button
                    type='button'
                    variant='secondary'
                    className='w-full cursor-pointer'
                    onClick={() => {
                      form.setFieldValue('newCategoryColorKey', DEFAULT_CATEGORY_COLOR_KEY)
                      form.setFieldValue('newCategoryName', '')
                      setCategoryCreateError('')
                      setCategoryDialogMode({ type: 'create' })
                    }}
                  >
                    <Plus />
                    Create category
                  </Button>
                }
              >
                <div className='max-h-52 overflow-y-auto rounded-md border'>
                  <button
                    type='button'
                    onClick={() => {
                      form.setFieldValue('categoryId', '')
                      form.setFieldValue('categoryEditColorKey', DEFAULT_CATEGORY_COLOR_KEY)
                      form.setFieldValue('categoryEditName', '')
                      setCategoryDialogMode(null)
                    }}
                    className={cn(
                      'grid min-h-9 w-full cursor-pointer grid-cols-[auto_1fr] items-center gap-2 border-b px-2 py-1.5 text-left text-sm last:border-b-0 hover:bg-muted',
                      !categoryId && 'bg-primary/8',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-4 place-items-center rounded-full border',
                        !categoryId && 'border-primary bg-primary text-primary-foreground',
                      )}
                    >
                      {!categoryId && <Check className='size-3' />}
                    </span>
                    No category
                  </button>
                  {filteredCategories.map((category) => {
                    const selected = categoryId === String(category.id)

                    return (
                      <div
                        key={category.id}
                        className={cn(
                          'group grid min-h-9 grid-cols-[auto_1fr_auto] items-center gap-2 border-b px-2 py-1.5 last:border-b-0 hover:bg-muted',
                          selected && 'bg-primary/8',
                        )}
                      >
                        <button
                          type='button'
                          onClick={() => {
                            form.setFieldValue('categoryId', String(category.id))
                            form.setFieldValue('categoryEditColorKey', category.colorKey)
                            form.setFieldValue('categoryEditName', category.name)
                            setCategoryDeleteError('')
                            setCategoryEditError('')
                            setCategoryDialogMode(null)
                          }}
                          className='grid size-4 cursor-pointer place-items-center rounded-full border hover:border-primary'
                          aria-label={`Select ${category.name}`}
                        >
                          {selected && <Check className='size-3' />}
                        </button>
                        <button
                          type='button'
                          onClick={() => {
                            form.setFieldValue('categoryId', String(category.id))
                            form.setFieldValue('categoryEditColorKey', category.colorKey)
                            form.setFieldValue('categoryEditName', category.name)
                            setCategoryDeleteError('')
                            setCategoryEditError('')
                            setCategoryDialogMode(null)
                          }}
                          className='flex min-w-0 cursor-pointer items-center gap-2 text-left text-sm'
                        >
                          <ColorDot colorKey={category.colorKey} />
                          <span className='truncate'>{category.name}</span>
                        </button>
                        <Button
                          type='button'
                          size='icon-sm'
                          variant='ghost'
                          className='cursor-pointer hover:bg-background/80'
                          onClick={() => {
                            form.setFieldValue('categoryEditColorKey', category.colorKey)
                            form.setFieldValue('categoryEditName', category.name)
                            setCategoryDeleteConfirmId(null)
                            setCategoryDeleteError('')
                            setCategoryEditError('')
                            setCategoryDialogMode({ id: category.id, type: 'edit' })
                          }}
                        >
                          <Edit2 />
                          <span className='sr-only'>Edit {category.name}</span>
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </ResourceListPanel>
            )}
            {categoryDialogMode?.type === 'create' && (
              <CategoryEditPanel
                colorKey={newCategoryColorKey}
                deleteConfirmationMessage=''
                deleteError=''
                editError={categoryCreateError}
                isDeleteDisabled={false}
                isSaveDisabled={createCategoryMutation.isPending || !newCategoryName.trim()}
                name={newCategoryName}
                onBack={() => setCategoryDialogMode({ type: 'list' })}
                onColorChange={(colorKey) => form.setFieldValue('newCategoryColorKey', colorKey)}
                onDelete={undefined}
                onNameChange={(name) => form.setFieldValue('newCategoryName', name)}
                onSave={async () => {
                  const saved = await handleCreateCategory({
                    newCategoryColorKey,
                    newCategoryName,
                  })

                  if (saved) {
                    setCategoryDialogMode({ type: 'list' })
                  }
                }}
                title='Create category'
              />
            )}
            {categoryDialogMode?.type === 'edit' && editedCategory && (
              <CategoryEditPanel
                colorKey={categoryEditColorKey}
                deleteConfirmationMessage={
                  categoryDeleteConfirmId === editedCategory.id
                    ? 'Click Delete again to permanently delete this category.'
                    : ''
                }
                deleteError={categoryDeleteError}
                editError={categoryEditError}
                isDeleteDisabled={deleteCategoryMutation.isPending}
                isSaveDisabled={updateCategoryMutation.isPending || !categoryEditName.trim()}
                name={categoryEditName}
                onBack={() => {
                  setCategoryDeleteConfirmId(null)
                  setCategoryDialogMode({ type: 'list' })
                }}
                onColorChange={(colorKey) => form.setFieldValue('categoryEditColorKey', colorKey)}
                onDelete={async () => {
                  const deleted = await handleDeleteCategory(editedCategory.id, categoryId)

                  if (deleted) {
                    setCategoryDialogMode({ type: 'list' })
                  }
                }}
                onNameChange={(name) => form.setFieldValue('categoryEditName', name)}
                onSave={async () => {
                  const saved = await handleUpdateCategory(editedCategory.id, {
                    categoryEditColorKey,
                    categoryEditName,
                  })

                  if (saved) {
                    setCategoryDialogMode({ type: 'list' })
                  }
                }}
                title='Edit category'
              />
            )}
          </>
        )
      }}
    />
  )
  const renderTagPicker = () => (
    <form.Subscribe
      selector={(state) => ({
        newTagColorKey: state.values.newTagColorKey,
        newTagName: state.values.newTagName,
        tagEditColorKeys: state.values.tagEditColorKeys,
        tagEditNames: state.values.tagEditNames,
        tagIds: state.values.tagIds,
      })}
      children={({ newTagColorKey, newTagName, tagEditColorKeys, tagEditNames, tagIds }) => {
        const filteredTags = filterNamedItems(tags, tagSearch)
        const editedTag = tagDialogMode?.type === 'edit' ? tags.find((tag) => tag.id === tagDialogMode.id) : undefined
        const editedTagId = editedTag ? String(editedTag.id) : ''
        const editedTagName = editedTag ? (tagEditNames[editedTagId] ?? editedTag.name) : ''
        const editedTagColorKey = editedTag
          ? (tagEditColorKeys[editedTagId] ?? editedTag.colorKey)
          : DEFAULT_TAG_COLOR_KEY

        return (
          <>
            {tagDialogMode?.type === 'list' && (
              <ResourceListPanel
                title='Tags'
                search={<SearchInput value={tagSearch} onChange={setTagSearch} placeholder='Search tags' />}
                onClose={() => setTagDialogMode(null)}
                createButton={
                  <Button
                    type='button'
                    variant='secondary'
                    className='w-full cursor-pointer'
                    onClick={() => {
                      form.setFieldValue('newTagColorKey', DEFAULT_TAG_COLOR_KEY)
                      form.setFieldValue('newTagName', '')
                      setTagCreateError('')
                      setTagDialogMode({ type: 'create' })
                    }}
                  >
                    <Plus />
                    Create tag
                  </Button>
                }
              >
                <div className='max-h-52 overflow-y-auto rounded-md border'>
                  {filteredTags.length === 0 && (
                    <span className='block px-2 py-2 text-sm text-muted-foreground'>No tags</span>
                  )}
                  {filteredTags.map((tag) => {
                    const tagId = String(tag.id)
                    const selected = tagIds.includes(tagId)

                    return (
                      <div
                        key={tag.id}
                        className={cn(
                          'group grid min-h-9 grid-cols-[auto_1fr_auto] items-center gap-2 border-b px-2 py-1.5 last:border-b-0 hover:bg-muted',
                          selected && 'bg-primary/8',
                        )}
                      >
                        <ResourceCheckbox
                          checked={selected}
                          onCheckedChange={(checked) => handleTagSelectionChange(tagId, checked, tagIds)}
                          label={tag.name}
                        />
                        <button
                          type='button'
                          onClick={() => handleTagSelectionChange(tagId, !selected, tagIds)}
                          className='flex cursor-pointer text-left'
                        >
                          <TagBadge tag={tag} />
                        </button>
                        <Button
                          type='button'
                          size='icon-sm'
                          variant='ghost'
                          className='cursor-pointer hover:bg-background/80'
                          onClick={() => {
                            form.setFieldValue('tagEditColorKeys', {
                              ...tagEditColorKeys,
                              [tagId]: tag.colorKey,
                            })
                            form.setFieldValue('tagEditNames', {
                              ...tagEditNames,
                              [tagId]: tag.name,
                            })
                            setTagDeleteConfirmId(null)
                            setTagDeleteErrors((errors) => removeRecordKey(errors, String(tag.id)))
                            setTagEditErrors((errors) => removeRecordKey(errors, String(tag.id)))
                            setTagDialogMode({ id: tag.id, type: 'edit' })
                          }}
                        >
                          <Edit2 />
                          <span className='sr-only'>Edit {tag.name}</span>
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </ResourceListPanel>
            )}
            {tagDialogMode?.type === 'create' && (
              <TagEditPanel
                colorKey={newTagColorKey}
                deleteConfirmationMessage=''
                deleteError=''
                editError={tagCreateError}
                isDeleteDisabled={false}
                isSaveDisabled={createTagMutation.isPending || !newTagName.trim()}
                name={newTagName}
                onBack={() => setTagDialogMode({ type: 'list' })}
                onColorChange={(colorKey) => form.setFieldValue('newTagColorKey', colorKey)}
                onDelete={undefined}
                onNameChange={(name) => form.setFieldValue('newTagName', name)}
                onSave={async () => {
                  const saved = await handleCreateTag({
                    newTagColorKey,
                    newTagName,
                    tagIds,
                  })

                  if (saved) {
                    setTagDialogMode({ type: 'list' })
                  }
                }}
                title='Create tag'
              />
            )}
            {tagDialogMode?.type === 'edit' && editedTag && (
              <TagEditPanel
                colorKey={editedTagColorKey}
                deleteConfirmationMessage={
                  tagDeleteConfirmId === editedTag.id ? 'Click Delete again to permanently delete this tag.' : ''
                }
                deleteError={tagDeleteErrors[editedTag.id] ?? ''}
                editError={tagEditErrors[editedTag.id] ?? ''}
                isDeleteDisabled={deleteTagMutation.isPending}
                isSaveDisabled={updateTagMutation.isPending || !editedTagName.trim()}
                name={editedTagName}
                onBack={() => {
                  setTagDeleteConfirmId(null)
                  setTagDialogMode({ type: 'list' })
                }}
                onColorChange={(colorKey) =>
                  form.setFieldValue('tagEditColorKeys', {
                    ...tagEditColorKeys,
                    [editedTagId]: colorKey,
                  })
                }
                onDelete={async () => {
                  const deleted = await handleDeleteTag(editedTag.id, tagIds)

                  if (deleted) {
                    setTagDialogMode({ type: 'list' })
                  }
                }}
                onNameChange={(name) =>
                  form.setFieldValue('tagEditNames', {
                    ...tagEditNames,
                    [editedTagId]: name,
                  })
                }
                onSave={async () => {
                  const saved = await handleUpdateTag(editedTag.id, {
                    colorKey: editedTagColorKey,
                    name: editedTagName,
                  })

                  if (saved) {
                    setTagDialogMode({ type: 'list' })
                  }
                }}
                title='Edit tag'
              />
            )}
          </>
        )
      }}
    />
  )

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className='max-h-[calc(100dvh-2rem)] overflow-hidden sm:max-w-[425px]'>
        <form
          className='flex max-h-[calc(100dvh-5rem)] min-h-0 flex-col'
          id={formId}
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}
        >
          <DialogHeader className='shrink-0'>
            <DialogTitle>{isEditMode ? 'Edit Task' : 'Add New Task'}</DialogTitle>
          </DialogHeader>
          <div className='my-4 grid min-h-0 gap-4 overflow-y-auto px-1'>
            <form.AppField
              name='title'
              validators={{
                onBlur: titleValidator,
                onChange: titleValidator,
                onSubmit: titleValidator,
              }}
              children={(field) => (
                <Field className='gap-2' data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel htmlFor={field.name}>Title</FieldLabel>
                  <Input
                    aria-invalid={field.state.meta.errors.length > 0}
                    autoComplete='off'
                    id={field.name}
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(e) => {
                      field.handleChange(e.target.value)
                    }}
                    value={field.state.value}
                  />
                  {field.state.meta.errors.length > 0 && (
                    <FieldError className='text-xs font-medium'>
                      {getFieldErrorMessage(field.state.meta.errors[0])}
                    </FieldError>
                  )}
                </Field>
              )}
            />
            <form.AppField
              name='description'
              children={(field) => (
                <Field className='gap-2'>
                  <FieldLabel htmlFor={field.name}>Description</FieldLabel>
                  <Textarea
                    id={field.name}
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(e) => {
                      field.handleChange(e.target.value)
                    }}
                    value={field.state.value}
                  />
                </Field>
              )}
            />
            <div className='grid gap-4 sm:grid-cols-2'>
              <form.AppField
                name='bucketId'
                validators={{
                  onBlur: bucketValidator,
                  onChange: bucketValidator,
                  onSubmit: bucketValidator,
                }}
                children={(field) => (
                  <Field className='gap-2' data-invalid={field.state.meta.errors.length > 0}>
                    <FieldLabel htmlFor={field.name}>Bucket</FieldLabel>
                    <select
                      aria-invalid={field.state.meta.errors.length > 0}
                      id={field.name}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(e) => {
                        field.handleChange(e.target.value)
                      }}
                      value={field.state.value}
                      className={cn(
                        'h-9 w-full cursor-pointer rounded-md border border-input bg-transparent px-2.5 text-base shadow-xs transition-[color,box-shadow] outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm',
                        field.state.meta.errors.length > 0 && 'border-destructive ring-[3px] ring-destructive/20',
                      )}
                    >
                      <option value=''>Select bucket</option>
                      {buckets.map((bucket) => (
                        <option key={bucket.id} value={bucket.id}>
                          {formatBucketName(bucket)}
                        </option>
                      ))}
                    </select>
                    {field.state.meta.errors.length > 0 && (
                      <FieldError className='text-xs font-medium'>
                        {getFieldErrorMessage(field.state.meta.errors[0])}
                      </FieldError>
                    )}
                  </Field>
                )}
              />
              <form.Subscribe
                selector={(state) => ({
                  categoryId: state.values.categoryId,
                })}
                children={({ categoryId }) => {
                  const selectedCategory = categories.find((category) => String(category.id) === categoryId)

                  return (
                    <Field className='gap-2'>
                      <FieldLabel>Category</FieldLabel>
                      <ResourcePopover
                        open={categoryDialogMode !== null}
                        onOpenChange={(open) => {
                          setCategoryDialogMode(open ? { type: 'list' } : null)
                          if (!open) {
                            setCategoryDeleteConfirmId(null)
                          }
                        }}
                        trigger={
                          <Button type='button' variant='outline' className='w-full cursor-pointer justify-start'>
                            {selectedCategory ? (
                              <>
                                <ColorDot colorKey={selectedCategory.colorKey} />
                                {selectedCategory.name}
                              </>
                            ) : (
                              'No Category'
                            )}
                          </Button>
                        }
                      >
                        {renderCategoryPicker()}
                      </ResourcePopover>
                    </Field>
                  )
                }}
              />
            </div>
            <form.AppField
              name='tagIds'
              children={(field) => (
                <Field className='gap-2'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <FieldLabel>Tags</FieldLabel>
                    <ResourcePopover
                      open={tagDialogMode !== null}
                      onOpenChange={(open) => {
                        setTagDialogMode(open ? { type: 'list' } : null)
                        if (!open) {
                          setTagDeleteConfirmId(null)
                        }
                      }}
                      trigger={
                        <Button type='button' variant='secondary' size='icon-sm' className='cursor-pointer'>
                          <Plus />
                          <span className='sr-only'>Manage tags</span>
                        </Button>
                      }
                    >
                      {renderTagPicker()}
                    </ResourcePopover>
                    {field.state.value.length > 0 && (
                      <div className='flex min-w-0 flex-1 flex-wrap gap-1.5'>
                        {tags
                          .filter((tag) => field.state.value.includes(String(tag.id)))
                          .map((tag) => (
                            <TagBadge
                              key={tag.id}
                              tag={tag}
                              removeLabel={`Remove ${tag.name}`}
                              onRemove={() => {
                                field.handleChange(
                                  field.state.value.filter((selectedTagId) => selectedTagId !== String(tag.id)),
                                )
                              }}
                            />
                          ))}
                      </div>
                    )}
                  </div>
                </Field>
              )}
            />
            <form.AppForm>
              <form.FormErrorAlert />
            </form.AppForm>
            {todoDeleteNeedsConfirm && (
              <p className='text-xs font-medium text-destructive'>Click Delete todo again to permanently delete it.</p>
            )}
            {todoDeleteError && <FieldError className='text-xs font-medium'>{todoDeleteError}</FieldError>}
          </div>
          <DialogFooter className={cn('shrink-0', isEditMode && 'sm:justify-between')}>
            {isEditMode && (
              <Button
                type='button'
                variant='destructive'
                onClick={() => void handleDeleteTodo()}
                disabled={deleteTodoMutation.isPending}
                className='cursor-pointer'
              >
                Delete todo
              </Button>
            )}
            <Button
              type='submit'
              form={formId}
              disabled={createTodoMutation.isPending || updateTodoMutation.isPending || deleteTodoMutation.isPending}
              className='cursor-pointer'
            >
              {isEditMode ? 'Save changes' : 'Add'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
