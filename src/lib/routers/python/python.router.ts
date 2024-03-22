import {
    Router,
    CallerRequestOptions,
    HTTPResponse$,
} from '@youwol/http-primitives'

import { GetPythonStatusResponse } from './interfaces'

export class PythonRouter extends Router {
    constructor(parent: Router) {
        super(parent.headers, `${parent.basePath}/python`)
    }

    getStatus$({
        callerOptions,
    }: {
        callerOptions?: CallerRequestOptions
    } = {}): HTTPResponse$<GetPythonStatusResponse> {
        return this.send$({
            command: 'query',
            path: `/pyodide`,
            callerOptions,
        })
    }
}
