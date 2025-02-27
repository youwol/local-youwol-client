import { mergeMap, tap } from 'rxjs/operators'
import {
    raiseHTTPErrors,
    expectAttributes,
    onHTTPErrors,
} from '@youwol/http-primitives'
import { PyYouwolClient } from '../lib'
import { setup$ } from './local-youwol-test-setup'
import path from 'path'
import { applyTestCtxLabels, resetTestCtxLabels } from './shell'
import { firstValueFrom, of } from 'rxjs'

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

// eslint-disable-next-line jest/expect-expect -- expects are factorized in functions
test('pyYouwol.admin.system.queryRootLogs', async () => {
    const test$ = pyYouwol.admin.system
        .queryRootLogs$({ fromTimestamp: Date.now(), maxCount: 100 })
        .pipe(raiseHTTPErrors())
    const resp = await firstValueFrom(test$)
    expectAttributes(resp.logs[0], [
        'level',
        'attributes',
        'labels',
        'text',
        'contextId',
        'parentContextId',
        'timestamp',
    ])
    // This has to be the last log
    expectAttributes(resp.logs[0].attributes, ['router', 'method', 'traceId'])
})

test('pyYouwol.admin.system.queryLogs', async () => {
    const test$ = pyYouwol.admin.system
        .queryRootLogs$({ fromTimestamp: Date.now(), maxCount: 100 })
        .pipe(
            raiseHTTPErrors(),
            mergeMap(({ logs }) =>
                pyYouwol.admin.system.queryLogs$({
                    parentId: logs[0].contextId,
                }),
            ),
            raiseHTTPErrors(),
        )

    const resp = await firstValueFrom(test$)
    expectAttributes(resp, ['logs'])
    expect(resp.logs.length).toBeGreaterThan(1)
    for (const log of resp.logs) {
        expectAttributes(log, [
            'contextId',
            'parentContextId',
            'text',
            'attributes',
            'labels',
            'data',
            'level',
            'timestamp',
        ])
    }
})

/*
 PLEASE DO NOT COMMIT COMMENTED OUT CODE
   For disabling a test, use test.skip(name, callback) and
   disable eslint rule jest/no-disabled-test
 */
/* eslint-disable-next-line jest/no-disabled-tests -- TODO: explain why this test is disable */
test.skip('pyYouwol.admin.system.clearLogs', async () => {
    const test$ = pyYouwol.admin.system
        .queryRootLogs$({ fromTimestamp: Date.now(), maxCount: 100 })
        .pipe(
            raiseHTTPErrors(),
            tap((resp) => {
                expect(resp.logs.length).toBeGreaterThanOrEqual(1)
            }),
            mergeMap(() => pyYouwol.admin.system.clearLogs$()),
            raiseHTTPErrors(),
            mergeMap(() =>
                pyYouwol.admin.system.queryRootLogs$({
                    fromTimestamp: Date.now(),
                    maxCount: 100,
                }),
            ),
            raiseHTTPErrors(),
            tap((resp) => {
                expect(resp.logs).toHaveLength(0)
            }),
        )
    await firstValueFrom(test$)
})

test('pyYouwol.admin.system.queryFolderContent', async () => {
    const test$ = pyYouwol.admin.environment.getStatus$().pipe(
        raiseHTTPErrors(),
        mergeMap((status) => {
            return pyYouwol.admin.system.queryFolderContent$({
                path: path.dirname(status.youwolEnvironment.pathsBook.config),
            })
        }),
        raiseHTTPErrors(),
    )
    const resp = await firstValueFrom(test$)
    expectAttributes(resp, ['files', 'folders'])
    expect(resp.files.find((f) => f == 'canary.txt')).toBeTruthy()
    expect(resp.folders.find((f) => f == 'canary')).toBeTruthy()
})

test('pyYouwol.admin.system.getFileContent', async () => {
    const test$ = pyYouwol.admin.environment.getStatus$().pipe(
        raiseHTTPErrors(),
        mergeMap((status) => {
            return pyYouwol.admin.system.getFileContent$({
                path: status.youwolEnvironment.pathsBook.config,
            })
        }),
        raiseHTTPErrors(),
    )
    const resp = await firstValueFrom(test$)
    expect(resp).toBeTruthy()
})

test('pyYouwol.admin.system.openFolder', async () => {
    const test$ = pyYouwol.admin.environment.getStatus$().pipe(
        raiseHTTPErrors(),
        mergeMap((status) => {
            return pyYouwol.admin.system.openFolder$({
                body: { path: status.youwolEnvironment.pathsBook.system },
            })
        }),
        onHTTPErrors((error) => {
            if (
                error.status == 500 &&
                error.body['detail'].startsWith(
                    'Error opening path in file explorer',
                )
            ) {
                // E.g. in CI it is likely that there are no file explorer to open
                return { status: 'Failure tolerated' }
            }
            return error
        }),
    )
    const resp = await firstValueFrom(test$)
    expect(resp.status).toBeTruthy()
})
