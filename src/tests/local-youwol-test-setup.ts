import { State, Client, backendConfiguration } from '@youwol/webpm-client'
import { PyYouwolClient } from '../lib'
import { mergeMap, tap } from 'rxjs/operators'
import { RootRouter } from '@youwol/http-primitives'

const defaultSetup = {
    localOnly: true,
    email: 'int_tests_yw-users@test-user',
    clearProjects: false,
}
export function setup$({
    localOnly,
    email,
    clearProjects,
}: {
    localOnly?: boolean
    email?: string
    clearProjects?: boolean
} = defaultSetup) {
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
            return new PyYouwolClient().admin.customCommands.doPost$({
                name: 'reset',
                body: {
                    projects: clearProjects || defaultSetup.clearProjects,
                    components: false,
                    system: true,
                },
            })
        }),
        tap(() => {
            RootRouter.Headers = headers
        }),
    )
}
