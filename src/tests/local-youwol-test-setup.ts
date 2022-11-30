import { State } from '@youwol/cdn-client'
import { PyYouwolClient } from '../lib'
import { mergeMap, tap } from 'rxjs/operators'
import { RootRouter } from '@youwol/http-primitives'

export function setup$(
    { localOnly, email }: { localOnly?: boolean; email?: string } = {
        localOnly: true,
        email: 'int_tests_yw-users@test-user',
    },
) {
    State.resetCache()
    const headers = {
        'py-youwol-local-only': localOnly ? 'true' : 'false',
    }
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
