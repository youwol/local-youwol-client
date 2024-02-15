import {
    Router,
    CallerRequestOptions,
    HTTPResponse$,
    WebSocketResponse$,
    filterCtxMessage,
} from '@youwol/http-primitives'

import { filter } from 'rxjs/operators'
import { WsRouter } from '../../py-youwol.client'
import { ContextMessage, GetFileContentResponse } from '../../interfaces'
import { DocModuleResponse } from './doc.interfaces'

export type Kind = 'package' | 'data' | 'flux-project' | 'story'
export type DownloadEventType = 'enqueued' | 'started' | 'succeeded' | 'failed'

export interface QueryFolderContentResponse {
    configurations: string[]
    folders: string[]
    files: string[]
}

export interface LogResponse<T = unknown> extends ContextMessage<T> {
    failed?: boolean
}

export interface LogsResponse {
    logs: LogResponse[]
}

export type QueryRootLogsResponse = LogsResponse

export type QueryLogsResponse = LogsResponse

export type BackendLogsResponse = {
    logs: LogResponse[]
    server_outputs: string[]
    install_outputs?: string[]
}

export interface DownloadEvent {
    kind: string
    rawId: string
    type: DownloadEventType
}

export type ClearLogsResponse = Record<string, never>

export interface Log {
    level: 'INFO' | 'WARNING' | 'ERROR'
    attributes: { [k: string]: string }
    labels: string[]
    text: string
    data?: { [k: string]: unknown }
    contextId: string
    parentContextId: string
    timestamp: number
}

export interface AddLogBody extends Log {
    traceUid: string
}
export interface AddLogsBody {
    logs: AddLogBody[]
}

class WebSocketAPI {
    constructor(public readonly ws: WsRouter) {}

    downloadEvent$(
        filters: { rawId?: string; kind?: Kind; type?: DownloadEventType } = {},
    ): WebSocketResponse$<DownloadEvent> {
        return this.ws.data$.pipe(
            filterCtxMessage<DownloadEvent>({
                withLabels: ['DownloadEvent'],
                withAttributes: filters,
            }),
            filter((message: ContextMessage<DownloadEvent>) => {
                return Object.entries(filters)
                    .map(([k, v]) => {
                        return message.data[k] == v
                    })
                    .reduce((acc, e) => acc && e, true)
            }),
        )
    }
}

export class SystemRouter extends Router {
    public readonly webSocket: WebSocketAPI

    constructor(parent: Router, ws: WsRouter) {
        super(parent.headers, `${parent.basePath}/system`)
        this.webSocket = new WebSocketAPI(ws)
    }

    queryFolderContent$({
        path,
        callerOptions,
    }: {
        path: string
        callerOptions?: CallerRequestOptions
    }): HTTPResponse$<QueryFolderContentResponse> {
        return this.send$({
            command: 'query',
            path: `/folder-content`,
            nativeRequestOptions: {
                method: 'POST',
                json: { path },
            },
            callerOptions,
        })
    }

    getFileContent$({
        path,
        callerOptions,
    }: {
        path: string
        callerOptions?: CallerRequestOptions
    }): HTTPResponse$<GetFileContentResponse> {
        return this.send$({
            command: 'query',
            path: `/file/${path}`,
            callerOptions,
        })
    }

    queryRootLogs$(
        {
            fromTimestamp,
            maxCount,
        }: {
            fromTimestamp: number
            maxCount: number
        },
        callerOptions: CallerRequestOptions = {},
    ): HTTPResponse$<QueryRootLogsResponse> {
        return this.send$({
            command: 'query',
            path: `/logs/?from-timestamp=${fromTimestamp}&max-count=${maxCount}`,
            callerOptions,
        })
    }

    queryLogs$({
        parentId,
        callerOptions,
    }: {
        parentId: string
        callerOptions?: CallerRequestOptions
    }): HTTPResponse$<QueryLogsResponse> {
        return this.send$({
            command: 'query',
            path: `/logs/${parentId}`,
            callerOptions,
        })
    }

    clearLogs$({
        callerOptions,
    }: {
        callerOptions?: CallerRequestOptions
    } = {}): HTTPResponse$<ClearLogsResponse> {
        return this.send$({
            command: 'delete',
            path: `/logs`,
            callerOptions,
        })
    }

    addLogs$({
        body,
        callerOptions,
    }: {
        body: AddLogsBody
        callerOptions?: CallerRequestOptions
    }): HTTPResponse$<Record<never, unknown>> {
        return this.send$({
            command: 'update',
            path: `/logs`,
            nativeRequestOptions: {
                method: 'POST',
                json: body,
            },
            callerOptions,
        })
    }

    queryBackendLogs$({
        name,
        version,
        callerOptions,
    }: {
        name: string
        version: string
        callerOptions?: CallerRequestOptions
    }): HTTPResponse$<BackendLogsResponse> {
        return this.send$({
            command: 'query',
            path: `/backends/${name}/${version}/logs`,
            callerOptions,
        })
    }

    queryDocumentation({
        path,
        callerOptions,
    }: {
        path: string
        callerOptions?: CallerRequestOptions
    }): HTTPResponse$<DocModuleResponse> {
        return this.send$({
            command: 'query',
            path: `/documentation/${path}`,
            callerOptions,
        })
    }
}
