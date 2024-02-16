import { LocalYouwol } from '@youwol/http-primitives'
export interface HealthzResponse {
    status: 'py-youwol ok'
}

export type Label = LocalYouwol.Label

export interface ContextMessage<T = unknown> {
    contextId: string
    level: string
    text: string
    labels: Label[]
    parentContextId: string | undefined
    data: T
    attributes: { [key: string]: string }
}

export type GetFileContentResponse = string
