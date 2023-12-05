import { raiseHTTPErrors, expectAttributes } from '@youwol/http-primitives'
import { PyYouwolClient } from '../lib'

import { combineLatest, firstValueFrom, of } from 'rxjs'
import { reduce, take, tap } from 'rxjs/operators'
import { setup$ } from './local-youwol-test-setup'
import { applyTestCtxLabels, resetTestCtxLabels } from './shell'

const pyYouwol = new PyYouwolClient()

beforeAll(async () => {
    await firstValueFrom(
        setup$({
            localOnly: true,
            email: 'int_tests_yw-users@test-user',
        }),
    )
})

beforeEach(async () => {
    await firstValueFrom(of(undefined).pipe(applyTestCtxLabels()))
})

afterEach(async () => {
    await firstValueFrom(of(undefined).pipe(resetTestCtxLabels()))
})

test('pyYouwol.admin.customCommands.doPost$', async () => {
    const test$ = combineLatest([
        pyYouwol.admin.customCommands
            .doPost$({
                name: 'test-cmd-post',
                body: {
                    returnObject: { status: 'test-cmd-post ok' },
                },
            })
            .pipe(raiseHTTPErrors()),
        pyYouwol.admin.customCommands.webSocket
            .log$({
                commandName: 'test-cmd-post',
            })
            .pipe(
                take(2),
                reduce((acc, e) => [...acc, e], []),
            ),
    ]).pipe(
        tap(([respHttp, respWs]) => {
            expect(respHttp).toEqual({ status: 'test-cmd-post ok' })
            expectAttributes(respWs[0], [
                'level',
                'attributes',
                'labels',
                'text',
                'contextId',
                'parentContextId',
            ])
            expect(respWs[0].labels.includes('Label.END_POINT')).toBeTruthy()
            expect(respWs[0].text).toBe(
                'POST: /admin/custom-commands/test-cmd-post',
            )
            expect(respWs[1].text).toBe('test message')
            expect(respWs[1].data.body.returnObject).toEqual(respHttp)
        }),
    )
    await firstValueFrom(test$)
})

test('pyYouwol.admin.customCommands.doPut$', async () => {
    const test$ = pyYouwol.admin.customCommands
        .doPut$({
            name: 'test-cmd-put',
            body: {
                returnObject: { status: 'test-cmd-put ok' },
            },
        })
        .pipe(raiseHTTPErrors())

    const resp = await firstValueFrom(test$)
    expect(resp).toEqual({ status: 'test-cmd-put ok' })
})

test('pyYouwol.admin.customCommands.doDelete$', async () => {
    const test$ = pyYouwol.admin.customCommands
        .doDelete$({ name: 'test-cmd-delete' })
        .pipe(raiseHTTPErrors())

    const resp = await firstValueFrom(test$)
    expect(resp).toEqual({ status: 'deleted' })
})
