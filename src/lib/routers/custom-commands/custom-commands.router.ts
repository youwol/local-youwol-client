import {
    Router,
    CallerRequestOptions,
    HTTPResponse$,
    Json,
    WebSocketResponse$,
} from '@youwol/http-clients'

import { WsRouter } from '../../py-youwol.client'
import { filterCtxMessage } from '../../utils'

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

class WebSocketAPI {
    constructor(public readonly ws: WsRouter) {}

    log$(
        filters: { commandName?: string; method?: Method } = {},
    ): WebSocketResponse$<unknown> {
        return this.ws.log$.pipe(
            filterCtxMessage<unknown>({
                withAttributes: { ...filters, topic: 'commands' },
            }),
        )
    }
}

export class CustomCommandsRouter extends Router {
    public readonly webSocket: WebSocketAPI

    constructor(parent: Router, ws: WsRouter) {
        super(parent.headers, `${parent.basePath}/custom-commands`)
        this.webSocket = new WebSocketAPI(ws)
    }

    /**
     * Execute a command using GET request
     * @param name name of the command
     * @param callerOptions
     */
    doGet$({
        name,
        callerOptions,
    }: {
        name: string
        callerOptions?: CallerRequestOptions
    }): HTTPResponse$<unknown> {
        return this.send$({
            command: 'query',
            path: `/${name}`,
            callerOptions,
        })
    }

    /**
     * Execute a command using POST request
     * @param name name of the command
     * @param body body of the request
     * @param callerOptions
     */
    doPost$({
        name,
        body,
        callerOptions,
    }: {
        name: string
        body: Json
        callerOptions?: CallerRequestOptions
    }): HTTPResponse$<unknown> {
        return this.send$({
            command: 'update',
            path: `/${name}`,
            nativeRequestOptions: {
                json: body,
            },
            callerOptions,
        })
    }

    /**
     * Execute a command using PUT request
     * @param name name of the command
     * @param body body of the request
     * @param callerOptions
     */
    doPut$({
        name,
        body,
        callerOptions,
    }: {
        name: string
        body: Json
        callerOptions?: CallerRequestOptions
    }): HTTPResponse$<unknown> {
        return this.send$({
            command: 'create',
            path: `/${name}`,
            nativeRequestOptions: {
                json: body,
            },
            callerOptions,
        })
    }

    /**
     * Execute a command using DELETE request
     * @param name name of the command
     * @param callerOptions
     */
    doDelete$({
        name,
        callerOptions,
    }: {
        name: string
        callerOptions?: CallerRequestOptions
    }): HTTPResponse$<unknown> {
        return this.send$({
            command: 'delete',
            path: `/${name}`,
            callerOptions,
        })
    }
}
