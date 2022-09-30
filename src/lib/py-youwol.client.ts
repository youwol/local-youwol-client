import { combineLatest, Subject } from 'rxjs'
import {
    RootRouter,
    CallerRequestOptions,
    HTTPResponse$,
    WebSocketResponse$,
} from '@youwol/http-clients'

import { ContextMessage, HealthzResponse } from './interfaces'
import { AdminRouter } from './routers/admin.router'
import { take } from 'rxjs/operators'
import { AuthorizationRouter } from './routers'

export class WebSocket$<TMessage> {
    public readonly message$: Subject<TMessage>
    public ws: WebSocket

    constructor(public readonly path: string) {
        this.message$ = new Subject<TMessage>()
    }

    connectWs() {
        if (this.ws) {
            this.ws.close()
        }
        this.ws = new WebSocket(this.path)
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data)
                this.message$.next(data)
            } catch (e) {
                console.error('Can not parse data', { error: String(e), event })
            }
        }
        this.ws.onerror = (err) => {
            console.error(
                'Socket encountered error: ',
                String(err),
                'Closing socket',
            )
            console.log('error', err)
            this.ws.close()
            console.log('Reconnect will be attempted in 1 second.')
            setTimeout(() => {
                this.connectWs()
            }, 1000)
        }
        return this.message$
    }
}

export class WsRouter {
    private readonly _log = new WebSocket$<ContextMessage>(
        `ws://${window.location.host}/ws-logs`,
    )
    private readonly _data = new WebSocket$<ContextMessage>(
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
    public readonly authorization: AuthorizationRouter

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
        this.authorization = new AuthorizationRouter(this)
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
