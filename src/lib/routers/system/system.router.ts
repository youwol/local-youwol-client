import {
    Router,
    CallerRequestOptions,
    HTTPResponse$,
    WebSocketResponse$,
} from '@youwol/http-clients'

import { filter } from 'rxjs/operators'
import { WsRouter } from '../../py-youwol.client'
import { ContextMessage, GetFileContentResponse } from '../../interfaces'
import { filterCtxMessage } from '../../utils'

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

export interface DownloadEvent {
    kind: string
    rawId: string
    type: DownloadEventType
}

export type ClearLogsResponse = Record<string, never>

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
}
