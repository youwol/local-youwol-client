import { State, Client, backendConfiguration } from '@youwol/webpm-client'
import { PyYouwolClient } from '../lib'
import { mergeMap, tap } from 'rxjs/operators'
import { RootRouter } from '@youwol/http-primitives'

export function setup$(
    { localOnly, email }: { localOnly?: boolean; email?: string } = {
        localOnly: true,
        email: 'int_tests_yw-users@test-user',
    },
) {
    State.clear()
    const headers = {
        'py-youwol-local-only': localOnly ? 'true' : 'false',
    }
    Client.BackendConfiguration = backendConfiguration({
        origin: { port: 2001 },
        pathLoadingGraph:
            '/api/assets-gateway/cdn-backend/queries/loading-graph',
        pathResource: '/api/assets-gateway/raw/package',
    })
    return PyYouwolClient.startWs$().pipe(
        mergeMap(() =>
            new PyYouwolClient().admin.environment.login$({
                body: { authId: email, envId: 'prod' },
            }),
        ),
        mergeMap(() => {
            return new PyYouwolClient().admin.customCommands.doGet$({
                name: 'reset',
            })
        }),
        tap(() => {
            RootRouter.Headers = headers
        }),
    )
}
