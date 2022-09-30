import {
    Router,
    CallerRequestOptions,
    HTTPResponse$,
    WebSocketResponse$,
} from '@youwol/http-clients'

import {
    EnvironmentStatusResponse,
    GetEnvironmentStatusResponse,
    LoginResponse,
    QueryCowSayResponse,
    QueryCustomDispatchesResponse,
    SwitchProfileResponse,
    UploadAssetResponse,
} from './interfaces'
import { WsRouter } from '../../py-youwol.client'
import { GetFileContentResponse } from '../../interfaces'
import { filterCtxMessage } from '../../utils'

class WebSocketAPI {
    constructor(public readonly ws: WsRouter) {}

    status$(
        filters: { profile?: string } = {},
    ): WebSocketResponse$<EnvironmentStatusResponse> {
        return this.ws.data$.pipe(
            filterCtxMessage<EnvironmentStatusResponse>({
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
        body: { email: string }
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
    } = {}) {
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
}
