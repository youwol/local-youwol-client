/* eslint-disable jest/no-done-callback -- eslint-comment Find a good way to work with rxjs in jest */

import { expectAttributes, raiseHTTPErrors } from '@youwol/http-primitives'
import { combineLatest, of } from 'rxjs'
import { mergeMap, take, tap } from 'rxjs/operators'
import { PyYouwolClient } from '../lib'
import { setup$ } from './local-youwol-test-setup'
import { expectEnvironment } from './utils'
import { applyTestCtxLabels, resetTestCtxLabels } from './shell'

const pyYouwol = new PyYouwolClient()

beforeAll(async (done) => {
    setup$({
        localOnly: true,
        email: 'int_tests_yw-users@test-user',
    }).subscribe(() => {
        done()
    })
})

beforeEach((done) => {
    of(undefined)
        .pipe(applyTestCtxLabels())
        .subscribe(() => done())
})

afterEach((done) => {
    of(undefined)
        .pipe(resetTestCtxLabels())
        .subscribe(() => done())
})

test('pyYouwol.admin.environment.login', (done) => {
    pyYouwol.admin.environment
        .login$({
            body: { authId: 'int_tests_yw-users_bis@test-user', envId: 'prod' },
        })
        .pipe(raiseHTTPErrors())
        .subscribe((resp) => {
            expectAttributes(resp, ['id', 'name', 'email', 'memberOf'])
            expect(resp.name).toBe('int_tests_yw-users_bis@test-user')
            done()
        })
})

test('pyYouwol.admin.environment.status', (done) => {
    combineLatest([
        pyYouwol.admin.environment.getStatus$().pipe(raiseHTTPErrors()),
        pyYouwol.admin.environment.webSocket.status$(),
    ])
        .pipe(
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
        .subscribe(() => {
            done()
        })
})

test('pyYouwol.admin.environment.reloadConfig', (done) => {
    combineLatest([
        pyYouwol.admin.environment.reloadConfig$().pipe(raiseHTTPErrors()),
        pyYouwol.admin.environment.webSocket.status$(),
    ])
        .pipe(
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
        .subscribe(() => {
            done()
        })
})

test('pyYouwol.admin.environment.customDispatches', (done) => {
    pyYouwol.admin.environment
        .queryCustomDispatches$()
        .pipe(
            raiseHTTPErrors(),
            tap((resp) => {
                expectAttributes(resp, ['dispatches'])
                expectAttributes(resp.dispatches, ['CDN live servers'])
                expect(resp.dispatches['CDN live servers']).toHaveLength(1)
            }),
        )
        .subscribe(() => {
            done()
        })
})

/* eslint-enable jest/no-done-callback -- re-enable */
