import { z } from 'zod'

const BucketTypeSchema = z.enum(['inbox', 'yearly', 'monthly', 'weekly', 'daily'])
// TODO: right now there is no difference with the db type, see if it's worth keeping this
const BucketSchema = z.object({
  id: z.int(),
  period: z.string().min(1),
  type: BucketTypeSchema,
})

export type Bucket = z.infer<typeof BucketSchema>
export type BucketType = z.infer<typeof BucketTypeSchema>
// TODO: think if this folder should be top level, and what should be inside. (all types? server?, db?, just client?)
