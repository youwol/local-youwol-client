import {
    Router,
    CallerRequestOptions,
    HTTPResponse$,
    WebSocketResponse$,
    filterCtxMessage,
} from '@youwol/http-primitives'

import {
    BrowserCacheStatusResponse,
    ClearBrowserCacheBody,
    ClearBrowserCacheResponse,
    EnvironmentStatusResponse,
    GetEnvironmentStatusResponse,
    LoginResponse,
    QueryCowSayResponse,
    QueryCustomDispatchesResponse,
    SwitchProfileResponse,
    UploadAssetResponse,
} from './interfaces'
import { WsRouter } from '../../py-youwol.client'
import { GetFileContentResponse, Label } from '../../interfaces'

class WebSocketAPI {
    constructor(public readonly ws: WsRouter) {}

    status$(
        filters: { profile?: string } = {},
    ): WebSocketResponse$<EnvironmentStatusResponse, Label> {
        return this.ws.data$.pipe(
            filterCtxMessage<EnvironmentStatusResponse, Label>({
                withLabels: ['EnvironmentStatusResponse'],
                withAttributes: filters,
            }),
        )
    }
}

export class EnvironmentRouter extends Router {
    public readonly webSocket: WebSocketAPI

    constructor(parent: Router, ws: WsRouter) {
        super(parent.headers, `${parent.basePath}/environment`)
        this.webSocket = new WebSocketAPI(ws)
    }

    /**
     * Login as user
     *
     * @param body
     * @param body.email user's email
     * @param callerOptions
     */
    login$({
        body,
        callerOptions,
    }: {
        body: { authId: string; envId: string }
        callerOptions?: CallerRequestOptions
    }): HTTPResponse$<LoginResponse> {
        return this.send$({
            command: 'upload',
            path: `/login`,
            nativeRequestOptions: {
                json: body,
            },
            callerOptions,
        })
    }

    /**
     * Status
     *
     * @param callerOptions
     */
    getStatus$({
        callerOptions,
    }: {
        callerOptions?: CallerRequestOptions
    } = {}): HTTPResponse$<GetEnvironmentStatusResponse> {
        return this.send$({
            command: 'query',
            path: `/status`,
            callerOptions,
        })
    }

    switchProfile$({
        body,
        callerOptions,
    }: {
        body: { active: string }
        callerOptions?: CallerRequestOptions
    }): HTTPResponse$<SwitchProfileResponse> {
        return this.send$({
            command: 'update',
            path: `/configuration/profiles/active`,
            nativeRequestOptions: {
                method: 'PUT',
                json: body,
            },
            callerOptions,
        })
    }

    reloadConfig$({
        callerOptions,
    }: {
        callerOptions?: CallerRequestOptions
    } = {}): HTTPResponse$<EnvironmentStatusResponse> {
        return this.send$({
            command: 'update',
            path: `/configuration`,
            nativeRequestOptions: {
                method: 'POST',
            },
            callerOptions,
        })
    }

    queryCustomDispatches$({
        callerOptions,
    }: {
        callerOptions?: CallerRequestOptions
    } = {}): HTTPResponse$<QueryCustomDispatchesResponse> {
        return this.send$({
            command: 'query',
            path: `/configuration/custom-dispatches`,
            callerOptions,
        })
    }

    queryCowSay$({
        callerOptions,
    }: {
        callerOptions?: CallerRequestOptions
    } = {}): HTTPResponse$<QueryCowSayResponse> {
        return this.send$({
            command: 'query',
            path: `/cow-say`,
            callerOptions,
        })
    }

    getFileContent$({
        callerOptions,
    }: {
        callerOptions?: CallerRequestOptions
    } = {}): HTTPResponse$<GetFileContentResponse> {
        return this.send$({
            command: 'query',
            path: `/configuration/config-file`,
            callerOptions,
        })
    }

    uploadAsset$({
        assetId,
        callerOptions,
    }: {
        assetId: string
        callerOptions?: CallerRequestOptions
    }): HTTPResponse$<UploadAssetResponse> {
        return this.send$({
            command: 'update',
            path: `/upload/${assetId}`,
            callerOptions,
        })
    }

    getBrowserCacheStatus$({
        callerOptions,
    }: {
        callerOptions?: CallerRequestOptions
    } = {}): HTTPResponse$<BrowserCacheStatusResponse> {
        return this.send$({
            command: 'query',
            path: `/browser-cache`,
            callerOptions,
        })
    }

    clearBrowserCache({
        body,
        callerOptions,
    }: {
        body: ClearBrowserCacheBody
        callerOptions?: CallerRequestOptions
    }): HTTPResponse$<ClearBrowserCacheResponse> {
        return this.send$({
            command: 'delete',
            path: `/browser-cache`,
            nativeRequestOptions: {
                json: body,
            },
            callerOptions,
        })
    }
}
