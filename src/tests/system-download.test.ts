/* eslint-disable jest/no-done-callback -- eslint-comment Find a good way to work with rxjs in jest */

import { raiseHTTPErrors, Test } from '@youwol/http-clients'
Test.mockRequest()
import {
    mergeMap,
    reduce,
    skipWhile,
    take,
    takeWhile,
    tap,
} from 'rxjs/operators'
import {
    ContextMessage,
    DownloadEvent,
    GetCdnStatusResponse,
    PackageEventResponse,
    PyYouwolClient,
    ResetCdnResponse,
    setup$,
} from '../lib'

import { Client, install, State } from '@youwol/cdn-client'
import { merge, Observable, of } from 'rxjs'
import { remoteDataFileAssetId, remoteFluxAssetId } from './remote_assets_id'

const pyYouwol = new PyYouwolClient()

Client.HostName = Test.getPyYouwolBasePath()

// 10 seconds is enough when running cdn-backend locally, but not enough if ran using minio client
jest.setTimeout(15 * 1000)

beforeEach(async (done) => {
    setup$({
        localOnly: false,
        email: 'int_tests_yw-users@test-user',
    }).subscribe(() => {
        done()
    })
})

function testInstall(
    modules: string[],
    expectedStatus: 'succeeded' | 'failed' = 'succeeded',
) {
    return (
        source$: Observable<unknown>,
    ): Observable<ContextMessage<DownloadEvent>[]> => {
        return source$.pipe(
            mergeMap(() => {
                return install({
                    modules,
                })
            }),
            mergeMap(() => pyYouwol.admin.system.webSocket.downloadEvent$()),
            tap((event) => {
                // console.log(event.data)
                expect(event).toBeTruthy()
            }),
            skipWhile((event) => {
                return event.data.type != expectedStatus
            }),
            take(1),
            reduce((acc, e) => {
                /*if (acc.length == 0) {
                    expect(e.data.type).toBe('enqueued')
                }*/
                return [...acc, e]
            }, []),
            /*
            tap((events) => {
                const targets: DownloadEventType[] = [
                    'enqueued',
                    'started',
                    expectedStatus,
                ]
                expect(events.map((e) => e.data.type)).toEqual(targets)
            }),*/
        )
    }
}

// eslint-disable-next-line jest/expect-expect -- expects are factorized in test_download_asset
test('install package rxjs', (done) => {
    of({})
        .pipe(testInstall(['rxjs']))
        .subscribe(() => {
            done()
        })
})

// eslint-disable-next-line jest/expect-expect -- expects are factorized in test_download_asset
test('install package @youwol/logging#0.0.2-next => Failure', (done) => {
    of({})
        .pipe(
            //wait for websocket to connect
            take(1),
            testInstall(['@youwol/logging#0.0.2-next'], 'failed'),
        )
        .subscribe(() => {
            done()
        })
})

test('install package rxjs + clear + install package rxjs', (done) => {
    of({})
        .pipe(
            testInstall(['rxjs']),
            mergeMap(() => pyYouwol.admin.localCdn.resetCdn$()),
            raiseHTTPErrors(),
            tap((resp: ResetCdnResponse) => {
                Test.expectAttributes(resp, ['deletedPackages'])
                expect(resp.deletedPackages).toEqual(['rxjs'])
                State.resetCache()
            }),
            mergeMap(() => pyYouwol.admin.localCdn.getStatus$()),
            raiseHTTPErrors(),
            tap((status: GetCdnStatusResponse) => {
                expect(status.packages).toHaveLength(0)
            }),
            testInstall(['rxjs']),
        )
        .subscribe(() => {
            done()
        })
})

test('download flux-builder#latest from app URL', (done) => {
    class Context {
        public readonly assetId =
            'YTZjZDhlMzYtYTE5ZC00YTI5LTg3NGQtMDRjMTI2M2E5YjA3'
    }

    Test.shell$<Context>(new Context())
        .pipe(
            Test.send<string, Context>({
                inputs: (shell) => {
                    return {
                        commandType: 'query',
                        path: `${Test.getPyYouwolBasePath()}/applications/@youwol/flux-builder/latest?id=${window.atob(
                            shell.context.assetId,
                        )}`,
                    }
                },
                sideEffects: (response) => {
                    expect(
                        response.includes(
                            `href="/applications/@youwol/flux-builder/`,
                        ),
                    ).toBeTruthy()
                },
            }),
            mergeMap(() =>
                merge(
                    pyYouwol.admin.system.webSocket.downloadEvent$(),
                    pyYouwol.admin.localCdn.webSocket.packageEvent$({
                        packageName: '@youwol/flux-builder',
                    }),
                ),
            ),
            takeWhile((event) => {
                return event['data'] && event['data']['type'] != 'succeeded'
            }, true),
            reduce((acc, e) => [...acc, e], []),
            tap((events) => {
                // in theory: DownloadEvent.enqueued, DownloadEvent.started, PackageEventResponse.downloadStarted,
                // PackageEventResponse.downloadDone, DownloadEvent.succeeded
                // BUT: the enqueued event is not always caught (e.g. if this test runs in standalone) as
                // ws connection may have been connected after this message is sent
                if (![4, 5].includes(events.length)) {
                    console.error(
                        'Error: download flux-builder#latest from app URL -> wrong events count',
                    )
                    console.log(events)
                }
                expect([4, 5].includes(events.length)).toBeTruthy()
                const count = events.length
                expect(
                    (events[count - 2].data as PackageEventResponse)
                        .packageName,
                ).toBe('@youwol/flux-builder')
                expect((events[count - 1].data as DownloadEvent).rawId).toBe(
                    window.btoa('@youwol/flux-builder'),
                )
            }),
        )
        .subscribe(() => {
            done()
        })
})

function test_download_asset(assetId: string, basePath: string) {
    class Context {
        public readonly assetId = assetId
    }

    return Test.shell$<Context>(new Context()).pipe(
        // make sure the asset exist and can be retrieved from deployed env
        Test.AssetsBackend.getAsset({
            inputs: (shell) => {
                return {
                    assetId: shell.context.assetId,
                }
            },
            sideEffects: (response, shell) => {
                expect(response.assetId).toBe(shell.context.assetId)
            },
        }),
        Test.send<string, Context>({
            inputs: (shell) => {
                const rawId = window.atob(shell.context.assetId)
                return {
                    commandType: 'query',
                    path: `${Test.getPyYouwolBasePath()}/api/assets-gateway/${basePath}/${rawId}`,
                }
            },
            sideEffects: (response) => {
                expect(response).toBeTruthy()
            },
        }),
        mergeMap(() => pyYouwol.admin.system.webSocket.downloadEvent$()),
        takeWhile((event) => {
            return event.data && event.data.type != 'succeeded'
        }, true),
        reduce((acc, e) => [...acc, e], []),
        tap((events) => {
            expect([2, 3].includes(events.length)).toBeTruthy()
            expect(events.slice(-1)[0].data.rawId).toBe(window.atob(assetId))
        }),
    )
}

// eslint-disable-next-line jest/expect-expect -- expects are factorized in test_download_asset
test('download flux-project', (done) => {
    test_download_asset(remoteFluxAssetId, 'flux-backend/projects').subscribe(
        () => done(),
    )
})

// eslint-disable-next-line jest/expect-expect -- expects are factorized in test_download_asset
test('download data', (done) => {
    test_download_asset(remoteDataFileAssetId, 'files-backend/files').subscribe(
        () => done(),
    )
})

/* eslint-enable jest/no-done-callback -- re-enable */
