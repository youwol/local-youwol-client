import {
    CallerRequestOptions,
    HTTPResponse$,
    RootRouter,
    WebSocketClient,
    WebSocketResponse$,
} from '@youwol/http-primitives'
import { combineLatest } from 'rxjs'
import { take } from 'rxjs/operators'

import { ContextMessage, HealthzResponse } from './interfaces'
import { AdminRouter } from './routers/admin.router'

export class WsRouter {
    private readonly _log = new WebSocketClient<ContextMessage>(
        `ws://${window.location.host}/ws-logs`,
    )
    private readonly _data = new WebSocketClient<ContextMessage>(
        `ws://${window.location.host}/ws-data`,
    )
    startWs$() {
        return combineLatest(
            [this._data, this._log].map((channel) => {
                return channel.connectWs().pipe(take(1))
            }),
        )
    }
    public get log$(): WebSocketResponse$<unknown> {
        return this._log.message$
    }
    public get data$(): WebSocketResponse$<unknown> {
        return this._data.message$
    }
}

export class PyYouwolClient extends RootRouter {
    public readonly admin: AdminRouter

    static ws = new WsRouter()

    constructor({
        headers,
    }: {
        headers?: { [_key: string]: string }
    } = {}) {
        super({
            basePath: '',
            headers,
        })
        this.admin = new AdminRouter(this, PyYouwolClient.ws)
    }

    /**
     * Healthz of the service
     *
     * @param callerOptions
     * @returns response
     */
    getHealthz$(
        callerOptions: CallerRequestOptions = {},
    ): HTTPResponse$<HealthzResponse> {
        return this.send$({
            command: 'query',
            path: `/healthz`,
            callerOptions,
        })
    }

    static startWs$() {
        return PyYouwolClient.ws.startWs$()
    }
}
