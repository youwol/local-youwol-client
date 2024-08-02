import {
    Router,
    CallerRequestOptions,
    HTTPResponse$,
    WebSocketResponse$,
    filterCtxMessage,
} from '@youwol/http-primitives'

import { filter } from 'rxjs/operators'
import { WsRouter } from '../../py-youwol.client'
import { ContextMessage, GetFileContentResponse, Label } from '../../interfaces'

export type Kind = 'package' | 'data' | 'flux-project' | 'story'
export type DownloadEventType = 'enqueued' | 'started' | 'succeeded' | 'failed'

export interface QueryFolderContentResponse {
    configurations: string[]
    folders: string[]
    files: string[]
}

export interface LogResponse<T = unknown> extends ContextMessage<T> {
    /**
     * Deprecated, use 'status'
     */
    failed?: boolean
    /**
     * Deprecated, use 'status'
     */
    future?: boolean

    status?: 'Succeeded' | 'Unresolved' | 'Failed'
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

export interface UninstallResponse {
    name: string
    version: string
    backendTerminated: boolean
    wasInstalled: boolean
}

export interface TerminateResponse {
    uids: string[]
}

export interface DownloadEvent {
    kind: string
    rawId: string
    type: DownloadEventType
}

export type InstallBackendEventType = 'started' | 'failed' | 'succeeded'

export interface InstallBackendEvent {
    installId: string
    name: string
    version: string
    event: InstallBackendEventType
}

export interface BackendResponse {
    name: string
    version: string
    url: string
    method: string
}

export type ClearLogsResponse = Record<string, never>

export interface AddLogBody extends ContextMessage {
    traceUid: string
}
export interface AddLogsBody {
    logs: AddLogBody[]
}

class WebSocketAPI {
    constructor(public readonly ws: WsRouter) {}

    downloadEvent$(
        filters: { rawId?: string; kind?: Kind; type?: DownloadEventType } = {},
    ): WebSocketResponse$<DownloadEvent, Label> {
        return this.ws.data$.pipe(
            filterCtxMessage<DownloadEvent, Label>({
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

    installBackendEvent$(
        filters: {
            name?: string
            version?: Kind
        } = {},
    ): WebSocketResponse$<InstallBackendEvent, Label> {
        return this.ws.data$.pipe(
            filterCtxMessage<InstallBackendEvent, Label>({
                withLabels: ['InstallBackendEvent'],
                withAttributes: filters,
            }),
            filter((message: ContextMessage<InstallBackendEvent>) => {
                return Object.entries(filters)
                    .map(([k, v]) => {
                        return message.data[k] == v
                    })
                    .reduce((acc, e) => acc && e, true)
            }),
        )
    }

    installBackendStdOut$(
        filters: {
            name?: string
            version?: string
            installId?: string
        } = {},
    ): WebSocketResponse$<Record<never, never>, Label> {
        return this.ws.log$.pipe(
            filterCtxMessage<Record<never, never>, Label>({
                withLabels: ['Label.INSTALL_BACKEND_SH'],
                withAttributes: filters,
            }),
            filter((message: ContextMessage<Record<never, never>>) => {
                return Object.entries(filters)
                    .map(([k, v]) => {
                        return message.data[k] == v
                    })
                    .reduce((acc, e) => acc && e, true)
            }),
        )
    }
    startBackendStdOut$(
        filters: {
            name?: string
            version?: Kind
        } = {},
    ): WebSocketResponse$<InstallBackendEvent, Label> {
        return this.ws.log$.pipe(
            filterCtxMessage<InstallBackendEvent, Label>({
                withLabels: ['Label.START_BACKEND_SH'],
                withAttributes: filters,
            }),
            filter((message: ContextMessage<InstallBackendEvent>) => {
                return Object.entries(filters)
                    .map(([k, v]) => {
                        return message.data[k] == v
                    })
                    .reduce((acc, e) => acc && e, true)
            }),
        )
    }
    backendResponse$(
        filters: {
            name?: string
            version?: Kind
        } = {},
    ): WebSocketResponse$<BackendResponse, Label> {
        return this.ws.data$.pipe(
            filterCtxMessage<BackendResponse, Label>({
                withLabels: ['BackendResponse'],
                withAttributes: filters,
            }),
            filter((message: ContextMessage<BackendResponse>) => {
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

    uninstallBackend$({
        name,
        version,
        callerOptions,
    }: {
        name: string
        version: string
        callerOptions?: CallerRequestOptions
    }): HTTPResponse$<UninstallResponse> {
        return this.send$({
            command: 'delete',
            path: `/backends/${name}/${version}/uninstall`,
            callerOptions,
        })
    }

    terminateBackend$(
        params:
            | {
                  name: string
                  version: string
                  callerOptions?: CallerRequestOptions
              }
            | {
                  uid: string
                  callerOptions?: CallerRequestOptions
              },
    ): HTTPResponse$<TerminateResponse> {
        const path = params['uid']
            ? `/backends/${params['uid']}/terminate`
            : `/backends/${params['name']}/${params['version']}/terminate`
        return this.send$({
            command: 'delete',
            path,
            callerOptions: params.callerOptions,
        })
    }
}
