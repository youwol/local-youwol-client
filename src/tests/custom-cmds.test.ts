/* eslint-disable jest/no-done-callback -- eslint-comment Find a good way to work with rxjs in jest */
import { raiseHTTPErrors, Test } from '@youwol/http-clients'
Test.mockRequest()
import { PyYouwolClient, setup$ } from '../lib'

import { combineLatest } from 'rxjs'
import { reduce, take, tap } from 'rxjs/operators'

const pyYouwol = new PyYouwolClient()

beforeAll(async (done) => {
    setup$({
        localOnly: true,
        email: 'int_tests_yw-users@test-user',
    }).subscribe(() => {
        done()
    })
})

test('pyYouwol.admin.customCommands.doPost$', (done) => {
    combineLatest([
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
    ])
        .pipe(
            tap(([respHttp, respWs]) => {
                expect(respHttp).toEqual({ status: 'test-cmd-post ok' })
                Test.expectAttributes(respWs[0], [
                    'level',
                    'attributes',
                    'labels',
                    'text',
                    'contextId',
                    'parentContextId',
                ])
                expect(
                    respWs[0].labels.includes('Label.END_POINT'),
                ).toBeTruthy()
                expect(respWs[0].text).toBe(
                    'POST: /admin/custom-commands/test-cmd-post',
                )
                expect(respWs[1].text).toBe('test message')
                expect(respWs[1].data.body.returnObject).toEqual(respHttp)
            }),
        )
        .subscribe(() => {
            done()
        })
})

test('pyYouwol.admin.customCommands.doPut$', (done) => {
    pyYouwol.admin.customCommands
        .doPut$({
            name: 'test-cmd-put',
            body: {
                returnObject: { status: 'test-cmd-put ok' },
            },
        })
        .pipe(raiseHTTPErrors())
        .subscribe((resp) => {
            expect(resp).toEqual({ status: 'test-cmd-put ok' })
            done()
        })
})

test('pyYouwol.admin.customCommands.doDelete$', (done) => {
    pyYouwol.admin.customCommands
        .doDelete$({ name: 'test-cmd-delete' })
        .pipe(raiseHTTPErrors())
        .subscribe((resp) => {
            expect(resp).toEqual({ status: 'deleted' })
            done()
        })
})
/* eslint-enable jest/no-done-callback -- re-enable */
