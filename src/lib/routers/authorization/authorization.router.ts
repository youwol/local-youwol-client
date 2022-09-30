import {
    Router,
    CallerRequestOptions,
    HTTPResponse$,
} from '@youwol/http-clients'
import { GetAccessTokenResponse } from './interfaces'

export class AuthorizationRouter extends Router {
    constructor(parent: Router) {
        super(parent.headers, `${parent.basePath}/authorization`)
    }

    /**
     * Retrieve user's access token of current user (bearer token)
     *
     * @param callerOptions
     */
    getAccessToken$({
        callerOptions,
    }: {
        callerOptions?: CallerRequestOptions
    } = {}): HTTPResponse$<GetAccessTokenResponse> {
        return this.send$({
            command: 'query',
            path: `/access-token`,
            callerOptions,
        })
    }
}
