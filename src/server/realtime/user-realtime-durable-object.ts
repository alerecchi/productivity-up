import { DurableObject } from 'cloudflare:workers'

export class UserRealtimeDurableObject extends DurableObject<Cloudflare.Env> {}
