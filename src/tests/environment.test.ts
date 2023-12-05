import { expectAttributes, raiseHTTPErrors } from '@youwol/http-primitives'
import { combineLatest, firstValueFrom, of } from 'rxjs'
import { mergeMap, take, tap } from 'rxjs/operators'
import { PyYouwolClient } from '../lib'
import { setup$ } from './local-youwol-test-setup'
import { expectEnvironment } from './utils'
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

test('pyYouwol.admin.environment.login', async () => {
    const test$ = pyYouwol.admin.environment
        .login$({
            body: { authId: 'int_tests_yw-users_bis@test-user', envId: 'prod' },
        })
        .pipe(raiseHTTPErrors())
    const resp = await firstValueFrom(test$)
    expectAttributes(resp, ['id', 'name', 'email', 'memberOf'])
    expect(resp.name).toBe('int_tests_yw-users_bis@test-user')
})

test('pyYouwol.admin.environment.status', async () => {
    const test$ = combineLatest([
        pyYouwol.admin.environment.getStatus$().pipe(raiseHTTPErrors()),
        pyYouwol.admin.environment.webSocket.status$(),
    ]).pipe(
        take(1),
        tap(([respHttp, respWs]) => {
            expectEnvironment(respHttp)
            expect(respHttp).toEqual(respWs.data)
        }),
        mergeMap(() => {
            return pyYouwol.admin.environment.queryCowSay$()
        }),
        raiseHTTPErrors(),
        tap((resp) => {
            expect(typeof resp).toBe('string')
        }),
    )
    await firstValueFrom(test$)
})

test('pyYouwol.admin.environment.reloadConfig', async () => {
    const test$ = combineLatest([
        pyYouwol.admin.environment.reloadConfig$().pipe(raiseHTTPErrors()),
        pyYouwol.admin.environment.webSocket.status$(),
    ]).pipe(
        take(1),
        tap(([respHttp, respWs]) => {
            expectEnvironment(respHttp)
            expectEnvironment(respWs.data)
        }),
        mergeMap(() => {
            return pyYouwol.admin.environment.getFileContent$()
        }),
        raiseHTTPErrors(),
        tap((resp) => {
            expect(typeof resp).toBe('string')
        }),
    )
    await firstValueFrom(test$)
})

test('pyYouwol.admin.environment.customDispatches', async () => {
    const test$ = pyYouwol.admin.environment.queryCustomDispatches$().pipe(
        raiseHTTPErrors(),
        tap((resp) => {
            expectAttributes(resp, ['dispatches'])
            expectAttributes(resp.dispatches, ['CDN live servers'])
            expect(resp.dispatches['CDN live servers']).toHaveLength(1)
        }),
    )
    await firstValueFrom(test$)
})
