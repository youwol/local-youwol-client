/* eslint-disable jest/no-done-callback -- eslint-comment Find a good way to work with rxjs in jest */
import { mergeMap, tap } from 'rxjs/operators'
import { raiseHTTPErrors, expectAttributes } from '@youwol/http-primitives'
import { PyYouwolClient } from '../lib'
import { setup$ } from './local-youwol-test-setup'
import path from 'path'

const pyYouwol = new PyYouwolClient()

beforeAll(async (done) => {
    setup$({
        localOnly: true,
        email: 'int_tests_yw-users@test-user',
    }).subscribe(() => {
        done()
    })
})

// eslint-disable-next-line jest/expect-expect -- expects are factorized in functions
test('pyYouwol.admin.system.queryRootLogs', (done) => {
    pyYouwol.admin.system
        .queryRootLogs$({ fromTimestamp: Date.now(), maxCount: 100 })
        .pipe(raiseHTTPErrors())
        .subscribe((resp) => {
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
            expectAttributes(resp.logs[0].attributes, [
                'router',
                'method',
                'traceId',
            ])
            done()
        })
})

test('pyYouwol.admin.system.queryLogs', (done) => {
    pyYouwol.admin.system
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
        .subscribe((resp) => {
            expectAttributes(resp, ['logs'])
            expect(resp.logs.length).toBeGreaterThan(1)
            done()
        })
})

test('pyYouwol.admin.system.clearLogs', (done) => {
    pyYouwol.admin.system
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
        .subscribe(() => {
            done()
        })
})

test('pyYouwol.admin.system.queryFolderContent', (done) => {
    pyYouwol.admin.environment
        .getStatus$()
        .pipe(
            raiseHTTPErrors(),
            mergeMap((status) => {
                return pyYouwol.admin.system.queryFolderContent$({
                    path: path.dirname(status.configuration.pathsBook.config),
                })
            }),
            raiseHTTPErrors(),
        )
        .subscribe((resp) => {
            expectAttributes(resp, ['files', 'folders'])
            expect(resp.files.find((f) => f == 'yw_config.py')).toBeTruthy()
            expect(resp.folders.find((f) => f == 'databases')).toBeTruthy()
            done()
        })
})

test('pyYouwol.admin.system.getFileContent', (done) => {
    pyYouwol.admin.environment
        .getStatus$()
        .pipe(
            raiseHTTPErrors(),
            mergeMap((status) => {
                return pyYouwol.admin.system.getFileContent$({
                    path: status.configuration.pathsBook.config,
                })
            }),
            raiseHTTPErrors(),
        )
        .subscribe((resp) => {
            expect(resp).toBeTruthy()
            done()
        })
})
/* eslint-enable jest/no-done-callback -- re-enable */
