import { Observable } from 'rxjs'
import { filter, mergeMap, tap } from 'rxjs/operators'
import { ContextMessage, Label } from './interfaces'
import { State } from '@youwol/cdn-client'
import { PyYouwolClient } from './py-youwol.client'
import { RootRouter } from '@youwol/http-clients'
import { resetPyYouwolDbs$ } from '../tests/utils'

export type WebSocketResponse$<T> = Observable<ContextMessage<T>>

export function filterCtxMessage<T = unknown>({
    withAttributes,
    withDataAttributes,
    withLabels,
}: {
    withAttributes?: {
        [_key: string]: string | ((string) => boolean)
    }
    withDataAttributes?: {
        [_key: string]: string | ((string) => boolean)
    }
    withLabels?: Label[]
}): (source$: WebSocketResponse$<unknown>) => WebSocketResponse$<T> {
    withAttributes = withAttributes || {}
    withLabels = withLabels || []
    return (source$: Observable<ContextMessage>) =>
        source$.pipe(
            filter((message: ContextMessage) => {
                const attrsOk =
                    message.attributes &&
                    Object.entries(withAttributes).reduce((acc, [k, v]) => {
                        if (!acc || !message.attributes[k]) {
                            return false
                        }
                        if (typeof v == 'string') {
                            return message.attributes[k] == v
                        }

                        return v(message.attributes[k])
                    }, true)

                const labelsOk =
                    message.labels &&
                    withLabels.reduce(
                        (acc, label) => acc && message.labels.includes(label),
                        true,
                    )

                if (!withDataAttributes) {
                    return attrsOk && labelsOk
                }

                const dataAttrsOk =
                    message.data &&
                    Object.entries(withDataAttributes).reduce((acc, [k, v]) => {
                        if (!acc || !message.data[k]) {
                            return false
                        }
                        if (typeof v == 'function') {
                            return v(message.attributes[k])
                        }
                        return message.attributes[k] == v
                    }, true)

                return attrsOk && labelsOk && dataAttrsOk
            }),
        ) as WebSocketResponse$<T>
}

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
                body: { email },
            }),
        ),
        mergeMap(() => {
            return resetPyYouwolDbs$(headers)
        }),
        tap(() => {
            RootRouter.Headers = headers
        }),
    )
}
