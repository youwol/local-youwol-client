import {
    Router,
    CallerRequestOptions,
    HTTPResponse$,
    WebSocketResponse$,
} from '@youwol/http-clients'

import {
    CdnPackageResponse,
    CdnStatusResponse,
    CheckUpdateResponse,
    CheckUpdatesResponse,
    DownloadedPackageResponse,
    DownloadPackagesBody,
    GetCdnStatusResponse,
    GetPackageResponse,
    PackageEventResponse,
    ResetCdnBody,
    ResetCdnResponse,
    TriggerCollectUpdatesResponse,
} from './interfaces'
import { WsRouter } from '../../py-youwol.client'
import { filterCtxMessage } from '../../utils'

class WebSocketAPI {
    constructor(public readonly ws: WsRouter) {}

    status$(
        filters: { packageName?: string; packageVersion?: string } = {},
    ): WebSocketResponse$<CdnStatusResponse> {
        return this.ws.data$.pipe(
            filterCtxMessage<CdnStatusResponse>({
                withLabels: ['CdnStatusResponse'],
                withAttributes: filters,
            }),
        )
    }

    package$(
        filters: { packageId?: string } = {},
    ): WebSocketResponse$<CdnPackageResponse> {
        return this.ws.data$.pipe(
            filterCtxMessage<CdnPackageResponse>({
                withLabels: ['CdnPackageResponse'],
                withAttributes: filters,
            }),
        )
    }

    updateStatus$(
        filters: { packageName?: string; packageVersion?: string } = {},
    ): WebSocketResponse$<CheckUpdateResponse> {
        return this.ws.data$.pipe(
            filterCtxMessage<CheckUpdateResponse>({
                withLabels: ['CheckUpdateResponse'],
                withAttributes: filters,
            }),
        )
    }

    updatesStatus$(): WebSocketResponse$<CheckUpdatesResponse> {
        return this.ws.data$.pipe(
            filterCtxMessage<CheckUpdatesResponse>({
                withLabels: ['CheckUpdatesResponse'],
            }),
        )
    }

    downloadedPackage$(
        filters: { packageName?: string; packageVersion?: string } = {},
    ): WebSocketResponse$<DownloadedPackageResponse> {
        return this.ws.data$.pipe(
            filterCtxMessage<DownloadedPackageResponse>({
                withLabels: ['DownloadedPackageResponse'],
                withAttributes: filters,
            }),
        )
    }

    packageEvent$(
        filters: { packageName?: string; packageVersion?: string } = {},
    ): WebSocketResponse$<PackageEventResponse> {
        return this.ws.data$.pipe(
            filterCtxMessage<PackageEventResponse>({
                withLabels: ['PackageEventResponse'],
                withAttributes: filters,
            }),
        )
    }
}

export class LocalCdnRouter extends Router {
    public readonly webSocket: WebSocketAPI

    constructor(parent: Router, ws: WsRouter) {
        super(parent.headers, `${parent.basePath}/local-cdn`)
        this.webSocket = new WebSocketAPI(ws)
    }

    getStatus$({
        callerOptions,
    }: {
        callerOptions?: CallerRequestOptions
    } = {}): HTTPResponse$<GetCdnStatusResponse> {
        return this.send$({
            command: 'query',
            path: `/status`,
            callerOptions,
        })
    }

    getPackage$({
        packageId,
        callerOptions,
    }: {
        packageId: string
        callerOptions?: CallerRequestOptions
    }): HTTPResponse$<GetPackageResponse> {
        return this.send$({
            command: 'query',
            path: `/packages/${packageId}`,
            callerOptions,
        })
    }

    triggerCollectUpdates$({
        callerOptions,
    }: {
        callerOptions?: CallerRequestOptions
    } = {}): HTTPResponse$<TriggerCollectUpdatesResponse> {
        return this.send$({
            command: 'query',
            path: `/collect-updates`,
            callerOptions,
        })
    }

    download$({
        callerOptions,
        body,
    }: {
        body: DownloadPackagesBody
        callerOptions?: CallerRequestOptions
    }) {
        return this.send$({
            command: 'update',
            path: `/download`,
            nativeRequestOptions: {
                method: 'POST',
                json: body,
            },
            callerOptions,
        })
    }

    resetCdn$({
        callerOptions,
        body,
    }: {
        body?: ResetCdnBody
        callerOptions?: CallerRequestOptions
    } = {}): HTTPResponse$<ResetCdnResponse> {
        return this.send$({
            command: 'delete',
            path: `/reset`,
            nativeRequestOptions: {
                method: 'POST',
                json: body || {},
            },
            callerOptions,
        })
    }
}
